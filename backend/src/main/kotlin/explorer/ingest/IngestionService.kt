package explorer.ingest

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.JsonNode
import explorer.config.AppConfig
import explorer.db.Database
import explorer.json.Json
import explorer.toc.IndexFormatException
import explorer.toc.NoRateFileException
import explorer.toc.RateFileSelector
import explorer.toc.SelectedRateFile
import explorer.toc.TocClient
import org.slf4j.LoggerFactory
import java.io.FilterInputStream
import java.io.InputStream
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.SQLException
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import java.util.zip.GZIPInputStream
import kotlin.concurrent.thread

enum class IngestPhase { FETCHING_INDEX, DOWNLOADING, PARSING, INDEXING }

enum class IngestErrorKind { INDEX, FETCH, PARSE, DATABASE, UNEXPECTED }

sealed interface IngestState {
    data object Idle : IngestState

    data class Loading(
        val phase: IngestPhase,
        val bytesDone: Long,
        val bytesTotal: Long?,
        val fileName: String?,
    ) : IngestState

    data class Ready(
        val sourceFileId: Long,
        /** Set when the app is serving an earlier load because the latest attempt could not check the index. */
        val warning: String? = null,
    ) : IngestState

    data class Failed(
        val kind: IngestErrorKind,
        val message: String,
        val fileName: String?,
    ) : IngestState
}

/**
 * Runs the pipeline index -> rate file -> database and reports where it is.
 *
 * It never throws into the web server: any failure becomes [IngestState.Failed], which the
 * UI shows with a retry button. Loading replaces a file's rows inside one transaction, so
 * searches see either the previous complete data or the new complete data.
 */
class IngestionService(
    private val config: AppConfig,
    private val database: Database,
    private val fetcher: Fetcher = Fetcher(),
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val running = AtomicBoolean(false)

    private val terminal = AtomicReference<IngestState>(IngestState.Idle)
    private val phase = AtomicReference(IngestPhase.FETCHING_INDEX)
    private val bytesDone = AtomicLong()
    private val bytesTotal = AtomicLong(-1)
    private val fileName = AtomicReference<String?>(null)

    fun state(): IngestState =
        if (running.get()) {
            IngestState.Loading(phase.get(), bytesDone.get(), bytesTotal.get().takeIf { it >= 0 }, fileName.get())
        } else {
            terminal.get()
        }

    /** Id of the file searches should read, or null while nothing is loaded. */
    fun activeSourceFileId(): Long? = (terminal.get() as? IngestState.Ready)?.sourceFileId

    /** Starts a load in the background. Returns false when one is already running. */
    fun startAsync(force: Boolean = false): Boolean {
        if (!running.compareAndSet(false, true)) return false
        thread(name = "ingest", isDaemon = true) { runGuarded(force) }
        return true
    }

    /** Runs a load on the calling thread. Used by tests and the first load in fixture mode. */
    fun runNow(force: Boolean = false): IngestState {
        if (!running.compareAndSet(false, true)) return state()
        runGuarded(force)
        return state()
    }

    private fun runGuarded(force: Boolean) {
        try {
            enter(IngestPhase.FETCHING_INDEX, total = null)
            fileName.set(null)
            terminal.set(run(force))
        } catch (e: Exception) {
            val failure = classify(e)
            log.error("Ingestion failed ({}): {}", failure.kind, failure.message, e)
            // Keep serving data from an earlier successful load if there is one.
            val previous = terminal.get() as? IngestState.Ready
            terminal.set(previous?.copy(warning = failure.message) ?: failure)
        } finally {
            running.set(false)
        }
    }

    private fun run(force: Boolean): IngestState {
        val indexUrl = URI.create(config.indexUrl)
        val selected =
            try {
                RateFileSelector.select(TocClient(fetcher).fetch(indexUrl), indexUrl, config.planNameContains)
            } catch (e: Exception) {
                // The index is unreachable or unusable. Data loaded earlier is still good.
                val existing = existingSourceFileForIndex(config.indexUrl) ?: throw e
                val warning = "The index could not be checked (${classify(e).message}); showing the file loaded earlier."
                log.warn(warning)
                return IngestState.Ready(existing, warning)
            }
        fileName.set(selected.fileName)
        log.info("Index selected reporting_structure[{}]: {}", selected.structureIndex, selected.url)

        if (!force) {
            existingSourceFile(selected.url.toString())?.let { id ->
                log.info("Rate file already loaded as source_file {}; skipping ingestion", id)
                return IngestState.Ready(id)
            }
        }

        enter(IngestPhase.DOWNLOADING, total = null)
        val path =
            RateFileDownloader(fetcher, config.cacheDir).fetch(selected.url) { done, total ->
                bytesDone.set(done)
                bytesTotal.set(total ?: -1)
            }

        val id = load(path, selected)
        log.info("Loaded {} as source_file {}", selected.fileName, id)
        return IngestState.Ready(id)
    }

    private fun load(
        path: Path,
        selected: SelectedRateFile,
    ): Long =
        database.dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                // Replacing a file is delete-then-insert in one transaction; cascades remove its old rows.
                connection.update("delete from source_file where file_url = ?", selected.url.toString())
                val sourceFileId = insertSourceFile(connection, selected, Files.size(path))
                insertPlans(connection, sourceFileId, selected)

                val stats = IngestStats()
                val normalizer =
                    Normalizer(
                        stats,
                        groupIds = IdAllocator(connection.maxId("provider_group")),
                        itemIds = IdAllocator(connection.maxId("billing_item")),
                        priceIds = IdAllocator(connection.maxId("price_record")),
                    )
                val loader = BulkLoader(connection, sourceFileId)

                enter(IngestPhase.PARSING, total = Files.size(path))
                val parseStarted = System.nanoTime()
                val header =
                    open(path).use { input ->
                        InNetworkStreamParser().parse(
                            input,
                            object : RateFileHandler {
                                override fun providerReference(node: JsonNode) = normalizer.providerReference(node).forEach(loader::add)

                                override fun inNetworkItem(
                                    index: Int,
                                    node: JsonNode,
                                ) {
                                    normalizer.item(index, node)?.let(loader::add)
                                }

                                override fun unknownTopLevelField(name: String) {
                                    stats.unknownTopLevelFields += name
                                }
                            },
                        )
                    }
                loader.flush()
                val indexStarted = System.nanoTime()
                log.info("Parsed and copied {} prices in {} ms", stats.prices, (indexStarted - parseStarted) / 1_000_000)

                enter(IngestPhase.INDEXING, total = null)
                connection.update(DERIVE_PROVIDERS, sourceFileId)
                connection.update(
                    UPDATE_SOURCE_FILE,
                    header.reportingEntityName,
                    header.reportingEntityType,
                    header.version,
                    header.lastUpdatedOn?.let(::parseDate),
                    Json.api.writeValueAsString(stats.toMap()),
                    sourceFileId,
                )
                connection.createStatement().use { it.execute("refresh materialized view code_catalog") }
                connection.commit()
                log.info("Derived providers and the code catalog in {} ms", (System.nanoTime() - indexStarted) / 1_000_000)
                connection.autoCommit = true
                connection.createStatement().use { it.execute("analyze") }
                sourceFileId
            } catch (e: Exception) {
                connection.rollback()
                throw e
            }
        }

    /** Opens the cached file, counting compressed bytes read so progress matches the file size. */
    private fun open(path: Path): InputStream {
        val counting =
            object : FilterInputStream(Files.newInputStream(path).buffered(1 shl 16)) {
                override fun read(): Int = super.read().also { if (it >= 0) bytesDone.incrementAndGet() }

                override fun read(
                    b: ByteArray,
                    off: Int,
                    len: Int,
                ): Int = super.read(b, off, len).also { if (it > 0) bytesDone.addAndGet(it.toLong()) }
            }
        return if (path.fileName.toString().endsWith(".gz")) GZIPInputStream(counting, 1 shl 16) else counting
    }

    private fun enter(
        next: IngestPhase,
        total: Long?,
    ) {
        phase.set(next)
        bytesDone.set(0)
        bytesTotal.set(total ?: -1)
    }

    private fun existingSourceFile(fileUrl: String): Long? =
        database.jdbi.withHandle<Long?, Exception> { handle ->
            handle
                .createQuery("select id from source_file where file_url = :url")
                .bind("url", fileUrl)
                .mapTo(Long::class.javaObjectType)
                .findOne()
                .orElse(null)
        }

    private fun existingSourceFileForIndex(indexUrl: String): Long? =
        database.jdbi.withHandle<Long?, Exception> { handle ->
            handle
                .createQuery("select id from source_file where index_url = :url order by ingested_at desc limit 1")
                .bind("url", indexUrl)
                .mapTo(Long::class.javaObjectType)
                .findOne()
                .orElse(null)
        }

    private fun insertSourceFile(
        connection: Connection,
        selected: SelectedRateFile,
        byteSize: Long,
    ): Long =
        connection
            .prepareStatement(
                """
                insert into source_file (index_url, reporting_structure_index, plan_group_label, plan_count,
                                         file_url, file_name, file_description, byte_size)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                returning id
                """.trimIndent(),
            ).use { statement ->
                statement.setString(1, config.indexUrl)
                statement.setInt(2, selected.structureIndex)
                statement.setString(3, selected.planGroupLabel)
                statement.setInt(4, selected.plans.size)
                statement.setString(5, selected.url.toString())
                statement.setString(6, selected.fileName)
                statement.setString(7, selected.description)
                statement.setLong(8, byteSize)
                statement.executeQuery().use { rows ->
                    rows.next()
                    rows.getLong(1)
                }
            }

    private fun insertPlans(
        connection: Connection,
        sourceFileId: Long,
        selected: SelectedRateFile,
    ) {
        connection
            .prepareStatement(
                "insert into plan (source_file_id, plan_name, plan_id_type, plan_id, plan_market_type) values (?, ?, ?, ?, ?)",
            ).use { statement ->
                selected.plans.filter { !it.planName.isNullOrBlank() }.forEach { plan ->
                    statement.setLong(1, sourceFileId)
                    statement.setString(2, plan.planName)
                    statement.setString(3, plan.planIdType)
                    statement.setString(4, plan.planId)
                    statement.setString(5, plan.planMarketType)
                    statement.addBatch()
                }
                statement.executeBatch()
            }
    }

    private fun classify(e: Exception): IngestState.Failed {
        val name = fileName.get()
        return when (e) {
            is NoRateFileException -> IngestState.Failed(IngestErrorKind.INDEX, e.message ?: "The index has no usable rate file.", name)
            is IndexFormatException -> IngestState.Failed(IngestErrorKind.INDEX, e.message ?: "The index file could not be read.", name)
            is FetchException -> IngestState.Failed(IngestErrorKind.FETCH, e.message ?: "The download failed.", name)
            is JsonProcessingException ->
                IngestState.Failed(
                    IngestErrorKind.PARSE,
                    "${e.originalMessage} (line ${e.location?.lineNr ?: "?"}, byte ${e.location?.byteOffset ?: "?"})",
                    name,
                )
            is SQLException -> IngestState.Failed(IngestErrorKind.DATABASE, e.message ?: "The database rejected the load.", name)
            is java.io.IOException -> IngestState.Failed(IngestErrorKind.FETCH, e.message ?: e.javaClass.simpleName, name)
            else -> IngestState.Failed(IngestErrorKind.UNEXPECTED, e.message ?: e.javaClass.simpleName, name)
        }
    }

    private companion object {
        /**
         * One row per tax ID. The name shown is the spelling used by the most provider groups;
         * ties go to the first in byte order so the choice is stable.
         */
        val DERIVE_PROVIDERS =
            """
            insert into provider (source_file_id, tin, tin_type, name, name_count)
            select distinct on (tin)
                   source_file_id, tin, tin_type, coalesce(business_name, tin),
                   count(*) over (partition by tin)
            from (select source_file_id, tin, min(tin_type) as tin_type, business_name, count(*) as uses
                  from provider_group
                  where source_file_id = ?
                  group by source_file_id, tin, business_name) names
            order by tin, uses desc, business_name collate "C"
            """.trimIndent()

        val UPDATE_SOURCE_FILE =
            """
            update source_file
            set reporting_entity_name = ?, reporting_entity_type = ?, schema_version = ?,
                last_updated_on = ?, stats = ?::jsonb, ingested_at = now()
            where id = ?
            """.trimIndent()

        fun parseDate(value: String): LocalDate? =
            try {
                LocalDate.parse(value)
            } catch (_: DateTimeParseException) {
                null
            }
    }
}

private fun Connection.update(
    sql: String,
    vararg values: Any?,
) {
    prepareStatement(sql).use { statement ->
        values.forEachIndexed { index, value -> statement.setObject(index + 1, value) }
        statement.executeUpdate()
    }
}

private fun Connection.maxId(table: String): Long =
    createStatement().use { statement ->
        statement.executeQuery("select coalesce(max(id), 0) from $table").use { rows ->
            rows.next()
            rows.getLong(1)
        }
    }

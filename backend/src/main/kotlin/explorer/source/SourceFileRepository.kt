package explorer.source

import com.fasterxml.jackson.module.kotlin.readValue
import explorer.json.Json
import org.jdbi.v3.core.Handle
import org.jdbi.v3.core.Jdbi
import java.time.Instant
import java.time.LocalDate

/** A loaded rate file as the UI describes it: where it came from and what it contains. */
data class SourceFileInfo(
    val id: Long,
    val indexUrl: String,
    val indexFileName: String,
    val reportingStructureIndex: Int,
    val planGroupLabel: String?,
    val planCount: Int,
    val fileUrl: String,
    val fileName: String,
    val fileDescription: String?,
    val reportingEntityName: String?,
    val reportingEntityType: String?,
    val schemaVersion: String?,
    val lastUpdatedOn: LocalDate?,
    val byteSize: Long?,
    val ingestedAt: Instant,
    val codeCount: Int,
    val providerCount: Int,
    val stats: Map<String, Any?>,
)

class SourceFileRepository(
    private val jdbi: Jdbi,
) {
    fun find(id: Long): SourceFileInfo? = jdbi.withHandle<SourceFileInfo?, Exception> { handle -> find(handle, id) }

    companion object {
        /** Reads through an existing handle so callers can stay inside their own transaction. */
        fun find(
            handle: Handle,
            id: Long,
        ): SourceFileInfo? =
            handle
                .createQuery(
                    """
                    select sf.*,
                           (select count(*) from code_catalog c where c.source_file_id = sf.id) as code_count,
                           (select count(*) from provider p where p.source_file_id = sf.id)     as provider_count
                    from source_file sf
                    where sf.id = :id
                    """.trimIndent(),
                ).bind("id", id)
                .map { rows, _ ->
                    val indexUrl = rows.getString("index_url")
                    SourceFileInfo(
                        id = rows.getLong("id"),
                        indexUrl = indexUrl,
                        indexFileName = indexUrl.substringBefore('?').substringAfterLast('/'),
                        reportingStructureIndex = rows.getInt("reporting_structure_index"),
                        planGroupLabel = rows.getString("plan_group_label"),
                        planCount = rows.getInt("plan_count"),
                        fileUrl = rows.getString("file_url"),
                        fileName = rows.getString("file_name"),
                        fileDescription = rows.getString("file_description"),
                        reportingEntityName = rows.getString("reporting_entity_name"),
                        reportingEntityType = rows.getString("reporting_entity_type"),
                        schemaVersion = rows.getString("schema_version"),
                        lastUpdatedOn = rows.getObject("last_updated_on", LocalDate::class.java),
                        byteSize = rows.getLong("byte_size").takeIf { !rows.wasNull() },
                        ingestedAt = rows.getTimestamp("ingested_at").toInstant(),
                        codeCount = rows.getInt("code_count"),
                        providerCount = rows.getInt("provider_count"),
                        stats = Json.api.readValue(rows.getString("stats")),
                    )
                }.findOne()
                .orElse(null)
    }
}

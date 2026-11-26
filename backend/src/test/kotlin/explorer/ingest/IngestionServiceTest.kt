package explorer.ingest

import explorer.Fixtures
import explorer.TestDatabase
import explorer.db.Database
import explorer.search.SearchQuery
import explorer.search.SearchRepository
import explorer.search.SearchService
import explorer.source.SourceFileRepository
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The load pipeline end to end, including the ways it is allowed to fail. */
class IngestionServiceTest {
    private lateinit var database: Database
    private lateinit var workDir: Path

    @BeforeTest
    fun setUp() {
        database = TestDatabase.fresh()
        workDir = Files.createTempDirectory("ingest-test")
    }

    @AfterTest
    fun tearDown() = database.close()

    private fun count(table: String): Int =
        database.jdbi.withHandle<Int, Exception> { it.createQuery("select count(*) from $table").mapTo(Int::class.java).one() }

    private fun copyFixturesTo(directory: Path): Path {
        Files.copy(Path.of(Fixtures.rateFileUrl), directory.resolve("in-network.json"))
        return Files.copy(Path.of(Fixtures.indexUrl), directory.resolve("index.json"))
    }

    @Test
    fun `loads the file the index points to`() {
        val service = IngestionService(TestDatabase.config(Fixtures.indexUrl), database)

        val state = assertIs<IngestState.Ready>(service.runNow())

        assertEquals(Fixtures.rateFileUrl.toString(), service.activeFileUrl())
        assertEquals(1, count("source_file"))
        assertEquals(2, count("plan"))
        // Five groups from provider references plus one written inline on a rate.
        assertEquals(6, count("provider_group"))
        assertEquals(5, count("billing_item"))
        assertEquals(9, count("price_record"))
        assertEquals(4, count("provider"))
        assertEquals(4, count("code_catalog"))
    }

    @Test
    fun `a restart does not load the same file twice`() {
        val config = TestDatabase.config(Fixtures.indexUrl)
        val first = assertIs<IngestState.Ready>(IngestionService(config, database).runNow())

        // A new service is what a restarted process would create.
        val second = assertIs<IngestState.Ready>(IngestionService(config, database).runNow())

        assertEquals(first.sourceFileId, second.sourceFileId)
        assertEquals(9, count("price_record"))
    }

    @Test
    fun `a forced reload replaces the file's rows instead of adding to them`() {
        val service = IngestionService(TestDatabase.config(Fixtures.indexUrl), database)
        val first = assertIs<IngestState.Ready>(service.runNow())

        val second = assertIs<IngestState.Ready>(service.runNow(force = true))

        assertNotEquals(first.sourceFileId, second.sourceFileId)
        assertEquals(1, count("source_file"))
        assertEquals(9, count("price_record"))
        assertEquals(6, count("provider_group"))
    }

    @Test
    fun `an unreachable index is an index failure, not a rate-file one`() {
        val missing = workDir.resolve("no-such-index.json").toUri()

        val state = assertIs<IngestState.Failed>(IngestionService(TestDatabase.config(missing), database).runNow())

        // The rate file was never reached, so this is reported as an index problem.
        assertEquals(IngestErrorKind.INDEX, state.kind)
        assertNull(IngestionService(TestDatabase.config(missing), database).activeFileUrl())
    }

    @Test
    fun `an index that is not JSON is an index failure`() {
        val broken = Files.writeString(workDir.resolve("index.json"), "<html>Sorry, invalid request</html>").toUri()

        val state = assertIs<IngestState.Failed>(IngestionService(TestDatabase.config(broken), database).runNow())

        assertEquals(IngestErrorKind.INDEX, state.kind)
    }

    @Test
    fun `a rate file the index lists but the server does not have is a fetch failure`() {
        val index = Files.copy(Path.of(Fixtures.indexUrl), workDir.resolve("index.json")).toUri()

        val state = assertIs<IngestState.Failed>(IngestionService(TestDatabase.config(index), database).runNow())

        assertEquals(IngestErrorKind.FETCH, state.kind)
        assertEquals("in-network.json", state.fileName)
        assertTrue(state.message.startsWith("Cannot read "), "the message says what is wrong, not only where: ${state.message}")
    }

    @Test
    fun `a truncated rate file is a parse failure and leaves nothing half-loaded`() {
        val index = Fixtures.indexWithTruncatedRateFile(workDir)

        val state = assertIs<IngestState.Failed>(IngestionService(TestDatabase.config(index), database).runNow())

        assertEquals(IngestErrorKind.PARSE, state.kind)
        assertTrue(state.message.contains("byte"), "the message says where parsing stopped: ${state.message}")
        // The page shows this message, so it must not carry the JSON library's own notation.
        assertFalse(state.message.contains("Source") || state.message.contains("StreamRead"), state.message)
        assertEquals(0, count("source_file"))
        assertEquals(0, count("price_record"))
        assertEquals(0, count("provider_group"))
    }

    @Test
    fun `JSON that is not an in-network file is a parse failure`() {
        Files.copy(Path.of(Fixtures.indexUrl), workDir.resolve("index.json"))
        Files.writeString(workDir.resolve("in-network.json"), "[1, 2, 3]")

        val state =
            assertIs<IngestState.Failed>(IngestionService(TestDatabase.config(workDir.resolve("index.json").toUri()), database).runNow())

        assertEquals(IngestErrorKind.PARSE, state.kind)
    }

    @Test
    fun `a JSON object with no in_network list is a parse failure, not a file with nothing in it`() {
        Files.copy(Path.of(Fixtures.indexUrl), workDir.resolve("index.json"))
        Files.writeString(workDir.resolve("in-network.json"), """{"reporting_entity_name": "Example Health Plan"}""")

        val state =
            assertIs<IngestState.Failed>(IngestionService(TestDatabase.config(workDir.resolve("index.json").toUri()), database).runNow())

        assertEquals(IngestErrorKind.PARSE, state.kind)
        assertEquals(0, count("source_file"))
    }

    @Test
    fun `a file named gz that is not gzip is a parse failure that says so`() {
        val index = Files.readString(Path.of(Fixtures.indexUrl)).replace("\"in-network.json\"", "\"in-network.json.gz\"")
        Files.writeString(workDir.resolve("index.json"), index)
        Files.writeString(workDir.resolve("in-network.json.gz"), "this is not gzip data")

        val state =
            assertIs<IngestState.Failed>(IngestionService(TestDatabase.config(workDir.resolve("index.json").toUri()), database).runNow())

        assertEquals(IngestErrorKind.PARSE, state.kind)
        assertTrue(state.message.startsWith("The compressed file could not be unpacked"), state.message)
    }

    @Test
    fun `a search that started before a reload still sees the whole file it started with`() {
        val index = copyFixturesTo(workDir)
        val service = IngestionService(TestDatabase.config(index.toUri()), database)
        assertIs<IngestState.Ready>(service.runNow())
        val url = checkNotNull(service.activeFileUrl())
        val repository = SearchRepository(database.jdbi)

        val idDuringSearch =
            repository.read { db ->
                // The first query fixes the snapshot this search will read from.
                val before = checkNotNull(db.sourceFileId(url))

                // A reload replaces every row of the file and commits while the search is open.
                assertIs<IngestState.Ready>(service.runNow(force = true))

                assertEquals(before, db.sourceFileId(url))
                assertNotNull(db.codeInfo(before, "99213"), "the code catalog is part of the snapshot too")
                assertEquals(3, db.totals(before, SearchQuery("99213")).providers)
                assertEquals(3, db.providerPage(before, SearchQuery("99213")).first.size)
                before
            }

        // The next search reads the new copy, which is complete as well.
        repository.read { db ->
            val after = checkNotNull(db.sourceFileId(url))
            assertNotEquals(idDuringSearch, after)
            assertEquals(3, db.totals(after, SearchQuery("99213")).providers)
        }
    }

    @Test
    fun `searches follow the configured file even when another was loaded more recently`() {
        val index = copyFixturesTo(workDir)
        // The index's other reporting structure points at this second, different rate file.
        Files.writeString(
            workDir.resolve("other-in-network.json"),
            """
            {"provider_references":[{"provider_group_id":1,"provider_groups":[{"npi":[6666666666],"tin":{"type":"ein","value":"55-5555555","business_name":"Zeta Imaging"}}]}],
             "in_network":[{"billing_code_type":"CPT","billing_code":"70450","name":"CT HEAD","negotiated_rates":[
               {"provider_references":[1],"negotiated_prices":[{"negotiated_type":"negotiated","negotiated_rate":210.0,"billing_class":"professional"}]}]}]}
            """.trimIndent(),
        )
        val example = TestDatabase.config(index.toUri())
        val other = example.copy(planNameContains = "Other Plan")

        assertIs<IngestState.Ready>(IngestionService(example, database).runNow())
        assertIs<IngestState.Ready>(IngestionService(other, database).runNow())
        assertEquals(2, count("source_file"))

        // Back to the first configuration, as after a restart. Its file is already loaded.
        val restarted = IngestionService(example, database)
        val ready = assertIs<IngestState.Ready>(restarted.runNow())
        val search = SearchService(SearchRepository(database.jdbi), restarted::activeFileUrl)

        assertEquals("in-network.json", SourceFileRepository(database.jdbi).find(ready.sourceFileId)?.fileName)
        assertEquals(3, search.search(mapOf("code" to "99213")).summary.providers)
        assertEquals("code_not_in_file", search.search(mapOf("code" to "70450")).noResults?.reason)

        // And the other configuration searches the other file.
        val otherService = IngestionService(other, database).also { it.runNow() }
        val otherSearch = SearchService(SearchRepository(database.jdbi), otherService::activeFileUrl)
        assertEquals(1, otherSearch.search(mapOf("code" to "70450")).summary.providers)
    }

    @Test
    fun `when a reload fails, the data loaded earlier keeps being served`() {
        val index = copyFixturesTo(workDir)
        val service = IngestionService(TestDatabase.config(index.toUri()), database)
        val loaded = assertIs<IngestState.Ready>(service.runNow())

        // The rate file is replaced by a broken copy, then a reload is requested.
        val text = Fixtures.rateFileText()
        Files.writeString(workDir.resolve("in-network.json"), text.take(text.length / 2))
        val after = assertIs<IngestState.Ready>(service.runNow(force = true))

        assertEquals(loaded.sourceFileId, after.sourceFileId)
        assertNotNull(after.warning)
        assertEquals(9, count("price_record"))
    }

    @Test
    fun `when the index goes away, a restart still serves the file loaded earlier`() {
        val index = copyFixturesTo(workDir)
        val config = TestDatabase.config(index.toUri())
        val loaded = assertIs<IngestState.Ready>(IngestionService(config, database).runNow())
        Files.delete(index)

        val restarted = assertIs<IngestState.Ready>(IngestionService(config, database).runNow())

        assertEquals(loaded.sourceFileId, restarted.sourceFileId)
        assertNotNull(restarted.warning)
    }
}

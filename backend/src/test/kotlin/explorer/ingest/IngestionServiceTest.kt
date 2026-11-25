package explorer.ingest

import explorer.Fixtures
import explorer.TestDatabase
import explorer.db.Database
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
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

        assertEquals(state.sourceFileId, service.activeSourceFileId())
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
    fun `an unreachable index is a fetch failure`() {
        val missing = workDir.resolve("no-such-index.json").toUri()

        val state = assertIs<IngestState.Failed>(IngestionService(TestDatabase.config(missing), database).runNow())

        assertEquals(IngestErrorKind.FETCH, state.kind)
        assertNull(IngestionService(TestDatabase.config(missing), database).activeSourceFileId())
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
    }

    @Test
    fun `a truncated rate file is a parse failure and leaves nothing half-loaded`() {
        val index = Fixtures.indexWithTruncatedRateFile(workDir)

        val state = assertIs<IngestState.Failed>(IngestionService(TestDatabase.config(index), database).runNow())

        assertEquals(IngestErrorKind.PARSE, state.kind)
        assertTrue(state.message.contains("byte"), "the message says where parsing stopped: ${state.message}")
        assertEquals(0, count("source_file"))
        assertEquals(0, count("price_record"))
        assertEquals(0, count("provider_group"))
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

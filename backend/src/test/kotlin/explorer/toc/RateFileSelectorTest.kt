package explorer.toc

import explorer.Fixtures
import explorer.json.Json
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class RateFileSelectorTest {
    private val toc: TableOfContents =
        Files.newInputStream(Path.of(Fixtures.indexUrl)).use { Json.cms.readValue(it, TableOfContents::class.java) }

    @Test
    fun `picks the reporting structure whose plan names match`() {
        val selected = RateFileSelector.select(toc, Fixtures.indexUrl, "example care")

        assertEquals(1, selected.structureIndex)
        assertEquals(2, selected.plans.size)
        assertEquals("Example Care", selected.planGroupLabel)
        assertEquals("in-network file", selected.description)
        // A relative location resolves against the index's own URL.
        assertEquals(Fixtures.rateFileUrl, selected.url)
        assertEquals("in-network.json", selected.fileName)
    }

    @Test
    fun `falls back to the first structure with a file when nothing matches`() {
        val selected = RateFileSelector.select(toc, Fixtures.indexUrl, "no such plan")

        assertEquals(0, selected.structureIndex)
        assertEquals("Other Plan Bronze", selected.planGroupLabel)
    }

    @Test
    fun `keeps absolute locations and encodes spaces`() {
        val index = URI.create("https://example.com/toc/index.json")
        assertEquals(
            URI.create("https://cdn.example.com/files/in%20network.json"),
            RateFileSelector.resolve(index, "https://cdn.example.com/files/in network.json"),
        )
        assertEquals(URI.create("https://example.com/toc/rates.json"), RateFileSelector.resolve(index, "rates.json"))
    }

    @Test
    fun `an index with no in-network files is reported, not guessed around`() {
        val empty = TableOfContents(reportingStructure = listOf(ReportingStructure(reportingPlans = listOf(ReportingPlan("Plan A")))))
        assertFailsWith<NoRateFileException> { RateFileSelector.select(empty, Fixtures.indexUrl, "Plan") }
    }
}

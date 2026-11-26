package explorer.ingest

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import explorer.Fixtures
import explorer.json.Json
import java.math.BigDecimal
import java.nio.file.Files
import java.nio.file.Path
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class NormalizerTest {
    private val json = ObjectMapper()

    @Test
    fun `revenue-code prices are searchable by the code written on the price`() {
        assertEquals("99213" to MatchKind.ADDITIONAL_INFORMATION, Normalizer.searchCode("RC", "510", "99213"))
        assertEquals("G0438" to MatchKind.ADDITIONAL_INFORMATION, Normalizer.searchCode("rc", "510", " g0438 "))
    }

    @Test
    fun `other prices are searchable by the item's own code`() {
        // A revenue-code price with nothing written on it.
        assertEquals("510" to MatchKind.BILLING_CODE, Normalizer.searchCode("RC", "510", null))
        // Free text is context, not a code.
        assertEquals("510" to MatchKind.BILLING_CODE, Normalizer.searchCode("RC", "510", "see contract appendix"))
        // Only revenue-code items are containers; a CPT item keeps its own code.
        assertEquals("99213" to MatchKind.BILLING_CODE, Normalizer.searchCode("CPT", "99213", "99214"))
    }

    @Test
    fun `EINs lose their punctuation and other tax IDs are kept as written`() {
        assertEquals("131624096", Normalizer.normalizeTin("ein", "13-1624096"))
        assertEquals("131624096", Normalizer.normalizeTin("ein", " 131624096 "))
        assertEquals("1932103413", Normalizer.normalizeTin("npi", "1932103413"))
    }

    @Test
    fun `business names are tidied so one provider is not split by spacing`() {
        assertEquals("Gamma Health", Normalizer.normalizeName("  Gamma  Health, "))
    }

    @Test
    fun `the fixture file normalizes to the expected rows and counts`() {
        val stats = IngestStats()
        val normalizer = Normalizer(stats)
        val groups = mutableListOf<ProviderGroupRow>()
        val items = mutableListOf<NormalizedItem>()

        Files.newInputStream(Path.of(Fixtures.rateFileUrl)).use { input ->
            InNetworkStreamParser().parse(
                input,
                object : RateFileHandler {
                    override fun providerReference(node: JsonNode) {
                        groups += normalizer.providerReference(node)
                    }

                    override fun inNetworkItem(
                        index: Int,
                        node: JsonNode,
                    ) {
                        normalizer.item(index, node)?.let(items::add)
                    }
                },
            )
        }

        // Provider references: five listed, one of them remote, one group per usable entry.
        assertEquals(5, stats.providerReferences)
        assertEquals(1, stats.remoteProviderReferences)
        assertEquals(5, groups.size)
        assertEquals(listOf(1111111111L, 2222222222L), groups.first().npis)
        assertEquals("111111111", groups.first().tin)
        // The NPI of 0 is dropped and counted rather than stored.
        assertEquals(1, stats.skippedNpis)
        assertEquals(listOf(2222222222L), groups.single { it.refId == 2L }.npis)

        // Items: five usable, one without a billing code.
        assertEquals(5, stats.items)
        assertEquals(1, stats.skippedItems)
        assertEquals(1, stats.skippedRatesWithoutProviders)
        assertEquals(1, stats.skippedPrices)
        assertEquals(9, stats.prices)
        assertEquals(2, stats.pricesMatchedByAdditionalInformation)

        val office = items.first()
        assertEquals("99213", office.item.code)
        assertEquals(4, office.prices.size)
        val telehealth = office.prices.single { it.rate.compareTo(BigDecimal("70.0")) == 0 }
        // Lists are sorted so the same set always compares equal.
        assertEquals(listOf("02", "10"), telehealth.serviceCodes)
        assertEquals(listOf("25", "95"), telehealth.modifiers)
        assertEquals(LocalDate.of(9999, 12, 31), telehealth.expirationDate)

        // Inline provider groups get a negative reference id that their prices point at.
        val wellness = items.single { it.item.code == "G0438" }
        assertEquals(1, stats.inlineProviderGroups)
        assertEquals(wellness.inlineGroups.single().refId, wellness.prices.single().providerRefId)
        assertEquals(true, wellness.prices.single().providerRefId < 0)

        // A rate written as text still parses; an unreadable date becomes null.
        val moderate = items.single { it.item.code == "99214" }.prices.single()
        assertEquals(0, moderate.rate.compareTo(BigDecimal("95.25")))
        assertNull(moderate.expirationDate)
    }

    @Test
    fun `a rate that could not be an amount is skipped and counted, and junk in code lists is ignored`() {
        val stats = IngestStats()
        // Read as the app reads the file, so 1e400 stays a decimal instead of becoming infinity.
        val item =
            Json.exact.readTree(
                """
                {"billing_code_type": "CPT", "billing_code": "99213", "negotiated_rates": [{
                  "provider_references": [1],
                  "negotiated_prices": [
                    {"negotiated_rate": -5},
                    {"negotiated_rate": 1e400},
                    {"negotiated_rate": 1e-20000},
                    {"negotiated_rate": 1000000000000},
                    {"negotiated_rate": 0},
                    {"negotiated_rate": 0.125},
                    {"negotiated_rate": 37503.00, "service_code": [11, null, "", {"a": 1}, " 22 "], "billing_code_modifier": [null, "gt"]}
                  ]}]}
                """.trimIndent(),
            )

        val prices = checkNotNull(Normalizer(stats).item(0, item)).prices

        // Negative, beyond what a median can be worked out over, absurdly fine, and a trillion.
        assertEquals(4, stats.skippedPrices)
        assertEquals(listOf("0", "0.125", "37503.00"), prices.map { it.rate.toPlainString() })
        // In a list of codes, only real entries count: a null is not the code "null".
        assertEquals(listOf("11", "22"), prices.last().serviceCodes)
        assertEquals(listOf("GT"), prices.last().modifiers)
    }

    @Test
    fun `the raw record keeps the file's own key order`() {
        val normalizer = Normalizer(IngestStats())
        normalizer.providerReference(
            json.readTree("""{"provider_group_id":1,"provider_groups":[{"npi":[1111111111],"tin":{"type":"ein","value":"11-1111111"}}]}"""),
        )
        val item =
            normalizer.item(
                0,
                json.readTree(
                    """
                    {"billing_code_type":"CPT","billing_code":"99213","negotiated_rates":[
                      {"provider_references":[1],"negotiated_prices":[{"negotiated_type":"negotiated","negotiated_rate":12.5,"billing_class":"professional"}]}]}
                    """.trimIndent(),
                ),
            )
        assertEquals(
            """{"negotiated_type":"negotiated","negotiated_rate":12.5,"billing_class":"professional"}""",
            item!!.prices.single().raw,
        )
    }
}

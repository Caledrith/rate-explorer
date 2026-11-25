package explorer.search

import explorer.Fixtures
import explorer.TestDatabase
import explorer.api.NotFoundException
import explorer.db.Database
import explorer.ingest.IngestState
import explorer.ingest.IngestionService
import explorer.source.SourceFileRepository
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import java.math.BigDecimal
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Loads the fixture file through the real pipeline into Postgres, then checks what a
 * search returns. The expected numbers are worked out by hand from the fixture.
 */
class SearchIntegrationTest {
    companion object {
        private lateinit var database: Database
        private lateinit var sourceFiles: SourceFileRepository
        private lateinit var search: SearchService

        @JvmStatic
        @BeforeAll
        fun load() {
            database = TestDatabase.fresh()
            val ingestion = IngestionService(TestDatabase.config(Fixtures.indexUrl), database)
            val state = ingestion.runNow()
            check(state is IngestState.Ready) { "Fixture did not load: $state" }
            sourceFiles = SourceFileRepository(database.jdbi)
            search = SearchService(SearchRepository(database.jdbi))
        }

        @JvmStatic
        @AfterAll
        fun close() = database.close()
    }

    private fun search(vararg params: Pair<String, String>) = search.search(mapOf(*params))

    private fun money(value: String) = BigDecimal(value)

    private infix fun BigDecimal.shouldEqual(expected: String) =
        assertEquals(0, compareTo(BigDecimal(expected)), "expected $expected but was $this")

    @Test
    fun `the loaded file records where it came from and what was skipped`() {
        val file = assertNotNull(sourceFiles.find(1L.coerceAtLeast(currentSourceFileId())))

        assertEquals("in-network.json", file.fileName)
        assertEquals("index.json", file.indexFileName)
        assertEquals(1, file.reportingStructureIndex)
        assertEquals("Example Care", file.planGroupLabel)
        assertEquals(2, file.planCount)
        assertEquals("2.0.0", file.schemaVersion)
        assertEquals(LocalDate.of(2026, 1, 15), file.lastUpdatedOn)
        assertEquals(4, file.codeCount)
        assertEquals(4, file.providerCount)
        assertEquals(1, file.stats["skippedNpis"])
        assertEquals(1, file.stats["skippedItems"])
        assertEquals(1, file.stats["remoteProviderReferences"])
        assertEquals(listOf("future_field"), file.stats["unknownTopLevelFields"])
    }

    @Test
    fun `repeated prices collapse to one rate per provider`() {
        val result = search("code" to "99213")

        // Ten raw price-by-group rows become six rates across three providers.
        assertEquals(3, result.summary.providers)
        assertEquals(6, result.summary.rates)
        assertEquals(2, result.summary.providersWithBothClasses)
        assertEquals(listOf("Alpha Clinic", "Beta Hospital", "Gamma Health"), result.providers.map { it.name })
        assertEquals("CPT", result.code?.type)
        assertEquals("OFFICE/OUTPATIENT VISIT EST", result.code?.name)
        assertNull(result.noResults)

        val alpha = result.providers.first()
        assertEquals("11-1111111", alpha.tinDisplay)
        assertEquals(2, alpha.npiCount)
        assertEquals(
            listOf("50.0", "70.0", "300.0").map(::money).map { it.stripTrailingZeros() },
            alpha.rates.map { it.rate.stripTrailingZeros() },
        )

        // The $50 office rate is written for two provider references; it is one rate seen twice.
        val office = alpha.rates[0]
        assertEquals(2, office.occurrences)
        assertEquals(2, office.npiCount)
        assertEquals("billing_code", office.filedUnder.kind)

        // The $300 rate sits under two different revenue-code 510 items.
        val facility = alpha.rates[2]
        assertEquals("institutional", facility.billingClass)
        assertEquals(FiledUnder("additional_information", "RC", "510"), facility.filedUnder)
        assertEquals(2, facility.occurrences)
    }

    @Test
    fun `medians are per class and count each provider's price once`() {
        val classes = search("code" to "99213").summary.classes.associateBy { it.billingClass }

        // Professional prices: Alpha 50 and 70, Beta 50, Gamma 90 -> median of 50, 50, 70, 90.
        val professional = classes.getValue("professional")
        assertEquals(3, professional.providers)
        assertEquals(4, professional.rates)
        professional.median shouldEqual "60"
        professional.min shouldEqual "50"
        professional.max shouldEqual "90"

        val institutional = classes.getValue("institutional")
        assertEquals(2, institutional.providers)
        assertEquals(2, institutional.rates)
        institutional.median shouldEqual "300"
    }

    @Test
    fun `each rate is compared with the median for its own class`() {
        val rates =
            search("code" to "99213").providers.flatMap { it.rates }.associate {
                it.rate.stripTrailingZeros().toPlainString() to
                    it.vsMedianPercent
            }

        assertEquals(-17, rates["50"])
        assertEquals(17, rates["70"])
        assertEquals(50, rates["90"])
        assertEquals(0, rates["300"])
    }

    @Test
    fun `codes become words with the code kept beside them`() {
        val telehealth = search("code" to "99213").providers.first().rates[1]

        assertEquals(listOf(CodeLabel("02", "Telehealth"), CodeLabel("10", "Telehealth at home")), telehealth.placeOfService)
        assertEquals(listOf(CodeLabel("25", "separate same-day visit"), CodeLabel("95", "live video")), telehealth.modifiers)
    }

    @Test
    fun `an NPI search returns only the rates that apply to that NPI`() {
        val result = search("code" to "99213", "npi" to "1111111111")

        assertEquals(listOf("Alpha Clinic"), result.providers.map { it.name })
        val alpha = result.providers.single()
        // The $70 telehealth rate is for a group that does not include this NPI.
        assertEquals(2, alpha.rates.size)
        assertEquals(1, alpha.hiddenRateCount)
        assertEquals("1111111111", alpha.matchedNpi)
        assertEquals(2, result.summary.rates)

        // The comparison baseline is still every provider for the code.
        result.baseline.single { it.billingClass == "professional" }.median shouldEqual "60"
        assertEquals(-17, alpha.rates.first().vsMedianPercent)

        // The other NPI is in every Alpha group, so nothing is hidden.
        assertEquals(0, search("code" to "99213", "npi" to "2222222222").providers.single().hiddenRateCount)
    }

    @Test
    fun `an EIN narrows to one provider, with or without the hyphen`() {
        assertEquals(listOf("Beta Hospital"), search("code" to "99213", "ein" to "22-2222222").providers.map { it.name })
        assertEquals(listOf("Beta Hospital"), search("code" to "99213", "ein" to "222222222").providers.map { it.name })
    }

    @Test
    fun `the class filter narrows providers and their rates but not the summary`() {
        val result = search("code" to "99213", "class" to "institutional")

        assertEquals(listOf("Alpha Clinic", "Beta Hospital"), result.providers.map { it.name })
        assertTrue(result.providers.flatMap { it.rates }.all { it.billingClass == "institutional" })
        assertEquals(2, result.page.totalProviders)
        assertEquals(3, result.summary.providers)
    }

    @Test
    fun `sorting and paging are by provider`() {
        assertEquals(
            listOf("Alpha Clinic", "Beta Hospital", "Gamma Health"),
            search("code" to "99213", "sort" to "rate_asc").providers.map { it.name },
        )
        assertEquals("Gamma Health", search("code" to "99213", "sort" to "rate_desc").providers.last().name)

        val second = search("code" to "99213", "pageSize" to "1", "page" to "2")
        assertEquals(listOf("Beta Hospital"), second.providers.map { it.name })
        assertEquals(PageInfo(page = 2, pageSize = 1, totalProviders = 3, totalPages = 3), second.page)

        // Past the last page there are no providers, but the total is still reported.
        val beyond = search("code" to "99213", "page" to "9")
        assertTrue(beyond.providers.isEmpty())
        assertEquals(3, beyond.page.totalProviders)
    }

    @Test
    fun `a code the file does not have suggests the closest ones`() {
        val result = search("code" to "99216")

        assertNull(result.code)
        assertEquals("code_not_in_file", result.noResults?.reason)
        assertEquals(listOf("99213", "99214"), result.noResults?.closestCodes?.map { it.code })
        assertEquals(0, result.summary.providers)
    }

    @Test
    fun `an empty provider search says whether the provider is in the file`() {
        // Delta Practice is in the file, but only for G0438.
        val known = search("code" to "99213", "ein" to "44-4444444").noResults
        assertEquals("provider_has_no_rates_for_code", known?.reason)
        assertEquals(EinMiss("444444444", "44-4444444", inFile = true, name = "Delta Practice", codeCount = 1), known?.ein)

        val unknown = search("code" to "99213", "ein" to "99-9999999").noResults
        assertEquals("provider_not_in_file", unknown?.reason)
        assertEquals(false, unknown?.ein?.inFile)

        assertEquals(
            NpiMiss("5555555555", inFile = true, providerCount = 1),
            search("code" to "99213", "npi" to "5555555555").noResults?.npi,
        )
        assertEquals("provider_not_in_file", search("code" to "99213", "npi" to "9999999999").noResults?.reason)
    }

    @Test
    fun `revenue codes themselves are searchable for prices with no procedure code`() {
        val result = search("code" to "510")

        assertEquals("RC", result.code?.type)
        assertEquals(listOf("Alpha Clinic", "Beta Hospital"), result.providers.map { it.name })
        result.providers
            .first()
            .rates
            .single()
            .rate shouldEqual "120"
        assertEquals(
            "billing_code",
            result.providers
                .first()
                .rates
                .single()
                .filedUnder.kind,
        )
    }

    @Test
    fun `rate detail shows where the price is and how often the file repeats it`() {
        val facility = search("code" to "99213").providers.first().rates[2]
        val detail = search.detail(facility.id)

        detail.rate shouldEqual "300"
        assertEquals("Alpha Clinic", detail.provider.name)
        assertEquals(2, detail.provider.nameCount)
        assertEquals(
            MatchInfo(
                "additional_information",
                "additional_information",
                "99213",
                FiledUnder("additional_information", "RC", "510"),
                "US EXAM, ABDOM, COMPLETE",
            ),
            detail.match,
        )
        assertEquals(Occurrences(2, listOf("US EXAM, ABDOM, COMPLETE", "ACNE SURGERY")), detail.occurrences)
        assertEquals(
            RecordLocation(1, 0, 0, 1, "in_network[1].negotiated_rates[0].negotiated_prices[0]"),
            detail.location,
        )
        assertEquals(NpiList(2, listOf("1111111111", "2222222222")), detail.npis)
        assertEquals(0, detail.otherNpis.total)
        assertTrue(detail.noEndDate)
        assertEquals("in-network.json", detail.source.fileName)
        // The raw record is exactly what the file wrote, in the file's key order.
        assertEquals(
            listOf(
                "negotiated_type",
                "negotiated_rate",
                "expiration_date",
                "service_code",
                "billing_class",
                "additional_information",
                "setting",
            ),
            detail.raw
                .fieldNames()
                .asSequence()
                .toList(),
        )
    }

    @Test
    fun `rate detail lists the NPIs a rate applies to and the provider's others`() {
        val telehealth = search("code" to "99213").providers.first().rates[1]
        val detail = search.detail(telehealth.id)

        assertEquals(NpiList(1, listOf("2222222222")), detail.npis)
        assertEquals(NpiList(1, listOf("1111111111")), detail.otherNpis)
        assertEquals(1, detail.occurrences.count)
    }

    @Test
    fun `a rate with a real end date and an inline provider group is described faithfully`() {
        val gamma =
            search.detail(
                search("code" to "99213")
                    .providers
                    .last()
                    .rates
                    .single()
                    .id,
            )
        assertEquals(LocalDate.of(2027, 6, 30), gamma.expirationDate)
        assertEquals(false, gamma.noEndDate)

        // Lower-case input finds the code; inline groups have no provider_group_id to show.
        val wellness = search("code" to "g0438").providers.single()
        assertEquals("Delta Practice", wellness.name)
        assertNull(search.detail(wellness.rates.single().id).location.providerGroupId)
    }

    @Test
    fun `an unknown rate id is a not-found, not a crash`() {
        assertFailsWith<NotFoundException> { search.detail("nonsense") }
        assertFailsWith<NotFoundException> { search.detail("999999-111111111") }
        val real =
            search("code" to "99213")
                .providers
                .first()
                .rates
                .first()
                .id
        assertFailsWith<NotFoundException> { search.detail(real.substringBefore('-') + "-999999999") }
    }

    @Test
    fun `code suggestions are by prefix, or the most widely held codes with no prefix`() {
        assertEquals(listOf("99213", "99214"), search.codes("992", 10).map { it.code })
        assertEquals("99213", search.codes(null, 1).single().code)
        assertTrue(search.codes("zz", 10).isEmpty())
    }

    private fun currentSourceFileId(): Long =
        database.jdbi.withHandle<Long, Exception> { it.createQuery("select max(id) from source_file").mapTo(Long::class.java).one() }
}

package explorer

import explorer.config.AppConfig
import explorer.db.Database
import explorer.ingest.IngestState
import explorer.ingest.IngestionService
import explorer.search.SearchRepository
import explorer.search.SearchService
import explorer.source.SourceFileInfo
import explorer.source.SourceFileRepository
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Tag
import java.math.BigDecimal
import java.nio.file.Path
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Loads the real Fidelis file named in the assignment and checks the numbers that were
 * worked out independently, in a throwaway Python script, before any of this code existed.
 * It proves the pipeline and the SQL agree with a second implementation on real data.
 *
 * It downloads 89 MB, so it is opt-in:  ./gradlew test -PrealFile
 * The expectations belong to the file dated 2026-09-02; if the publisher has replaced
 * it, the checks are skipped rather than failed.
 */
@Tag("real-file")
class RealFileCheckTest {
    companion object {
        private val EXPECTED_FILE_DATE: LocalDate = LocalDate.of(2026, 9, 2)

        private lateinit var database: Database
        private lateinit var file: SourceFileInfo
        private lateinit var search: SearchService

        @JvmStatic
        @BeforeAll
        fun load() {
            database = TestDatabase.fresh()
            val config =
                TestDatabase.config(java.net.URI.create(AppConfig.DEFAULT_INDEX_URL)).copy(
                    planNameContains = AppConfig.DEFAULT_PLAN_NAME_CONTAINS,
                    // Shared with the app so the download is reused between runs.
                    cacheDir = Path.of("data/cache"),
                )
            val ingestion = IngestionService(config, database)
            val state = ingestion.runNow()
            check(state is IngestState.Ready) { "The real file did not load: $state" }
            file = checkNotNull(SourceFileRepository(database.jdbi).find(state.sourceFileId))
            search = SearchService(SearchRepository(database.jdbi), ingestion::activeFileUrl)
        }

        @JvmStatic
        @AfterAll
        fun close() = database.close()
    }

    private fun assumeExpectedFile() =
        assumeTrue(
            file.lastUpdatedOn == EXPECTED_FILE_DATE,
        ) { "The published file is dated ${file.lastUpdatedOn}, not $EXPECTED_FILE_DATE" }

    private fun search(vararg params: Pair<String, String>) = search.search(mapOf(*params))

    private fun assertMoney(
        expected: String,
        actual: BigDecimal,
    ) = assertEquals(0, actual.compareTo(BigDecimal(expected)), "expected $expected but was $actual")

    /** Counts taken straight from the tables, for the README's figures that no search returns. */
    private fun count(sql: String): Int =
        database.jdbi.withHandle<Int, Exception> { handle ->
            handle
                .createQuery(sql)
                .bind("sf", file.id)
                .mapTo(Int::class.java)
                .one()
        }

    private fun number(sql: String): Double =
        database.jdbi.withHandle<Double, Exception> { handle ->
            handle
                .createQuery(sql)
                .bind("sf", file.id)
                .mapTo(Double::class.java)
                .one()
        }

    @Test
    fun `file totals`() {
        assumeExpectedFile()

        assertEquals("2.0.0", file.schemaVersion)
        assertEquals(1_355, file.stats["providerReferences"])
        assertEquals(8_030, file.stats["providerGroups"])
        assertEquals(1_519, file.stats["items"])
        assertEquals(54_371, file.stats["negotiatedRates"])
        assertEquals(179_948, file.stats["prices"])
        assertEquals(154_254, file.stats["pricesMatchedByAdditionalInformation"])
        assertEquals(27, file.stats["skippedNpis"])
        assertEquals(5_739, file.providerCount)
        // 969 procedure codes (607 CPT, 78 HCPCS, 284 seen only on revenue-code prices) plus 113 revenue codes.
        assertEquals(1_082, file.codeCount)
        // More than half the items are revenue codes, whose prices name the real code in additional_information.
        assertEquals(834, count("select count(*) from billing_item where source_file_id = :sf and billing_code_type = 'RC'"))
    }

    @Test
    fun `an EIN can cover several provider groups and be spelled several ways`() {
        assumeExpectedFile()
        val perEin =
            """
            select tin, count(*) as provider_groups, count(distinct business_name) as names
            from provider_group
            where source_file_id = :sf
            group by tin
            """.trimIndent()

        assertEquals(1_168, count("select count(*) from ($perEin) ein where provider_groups > 1"))
        assertEquals(124, count("select count(*) from ($perEin) ein where names > 1"))
    }

    @Test
    fun `99213 collapses 6,790 raw rows to 1,197 rates across 1,013 providers`() {
        assumeExpectedFile()
        val result = search("code" to "99213", "pageSize" to "3")

        assertEquals(1_013, result.summary.providers)
        assertEquals(1_197, result.summary.rates)
        assertEquals(28, result.summary.providersWithBothClasses)
        assertEquals(
            listOf("14 Street Medical PC", "4N Medical Care, PC", "67th Street OB/GYN, PLLC"),
            result.providers.map { it.name },
        )

        val professional = result.summary.classes.single { it.billingClass == "professional" }
        assertEquals(957, professional.providers)
        assertEquals(1_097, professional.rates)
        assertMoney("51.45", professional.median)
        assertMoney("41.31", professional.min)
        assertMoney("159.15", professional.max)

        val institutional = result.summary.classes.single { it.billingClass == "institutional" }
        assertEquals(84, institutional.providers)
        assertEquals(100, institutional.rates)
        assertMoney("163.74", institutional.median)
        assertMoney("46.12", institutional.min)
        assertMoney("559.06", institutional.max)

        // What the search collapses: one row per 99213 price per provider group it applies to.
        val rawRows =
            """
            from price_record pr
            join provider_group pg on pg.source_file_id = pr.source_file_id and pg.ref_id = pr.provider_ref_id
            where pr.source_file_id = :sf and pr.search_code = '99213'
            """.trimIndent()
        assertEquals(6_790, count("select count(*) $rawRows"))
        // Providers whose every 99213 price is filed under a revenue code. Indexing only
        // billing_code would lose them.
        assertEquals(
            56,
            count(
                """
                select count(*)
                from (select pg.tin $rawRows group by pg.tin having bool_and(pr.match_kind = 'additional_information')) lost
                """.trimIndent(),
            ),
        )
    }

    @Test
    fun `a revenue-code rate is repeated a median of 80 times, and 58 for 99213`() {
        assumeExpectedFile()
        // A rate as the search lists it, counted as the detail panel counts it: by the
        // distinct places in the file that record it.
        val medianRepeats =
            """
            with rates as (
                select pr.search_code,
                       count(distinct (pr.billing_item_id, pr.rate_index, pr.price_index)) as repeats
                from price_record pr
                join billing_item bi on bi.id = pr.billing_item_id
                join provider_group pg on pg.source_file_id = pr.source_file_id and pg.ref_id = pr.provider_ref_id
                where pr.source_file_id = :sf and pr.match_kind = 'additional_information'
                group by pr.search_code, pg.tin, pr.negotiated_rate, pr.negotiated_type, pr.billing_class,
                         pr.setting, pr.service_codes, pr.modifiers, bi.billing_code_type, bi.billing_code
            )
            select percentile_cont(0.5) within group (order by repeats) from rates
            """.trimIndent()

        assertEquals(80.0, number(medianRepeats))
        assertEquals(58.0, number("$medianRepeats where search_code = '99213'"))
    }

    @Test
    fun `one NPI is listed under four providers and sees only the rates that apply to it`() {
        assumeExpectedFile()
        val result = search("code" to "99213", "npi" to "1881777464")

        assertEquals(4, result.summary.providers)
        assertEquals(5, result.summary.rates)
        val riverStreet = result.providers.single { it.name == "820 River Street, Inc." }
        assertEquals(1, riverStreet.rates.size)
        assertEquals(1, riverStreet.hiddenRateCount)
        assertEquals(6, riverStreet.npiCount)
    }

    @Test
    fun `empty results are explained`() {
        assumeExpectedFile()

        val missingCode = search("code" to "99216").noResults
        assertEquals("code_not_in_file", missingCode?.reason)
        assertEquals(listOf("99211", "99212", "99213", "99214", "99215"), missingCode?.closestCodes?.map { it.code })

        val labCorp = search("code" to "99213", "ein" to "13-3757370").noResults
        assertEquals("provider_has_no_rates_for_code", labCorp?.reason)
        assertEquals("Laboratory Corporation of America Holdings", labCorp?.ein?.name)
        assertEquals(75, labCorp?.ein?.codeCount)
    }

    @Test
    fun `a revenue-code rate traces back to its record and its 112 repeats`() {
        assumeExpectedFile()
        val provider = search("code" to "99213", "ein" to "81-4373879").providers.single()
        val detail = search.detail(provider.rates.single().id)

        assertMoney("123.62", detail.rate)
        assertEquals("additional_information", detail.match.kind)
        assertEquals("RC", detail.match.filedUnder.codeType)
        assertEquals("520", detail.match.filedUnder.code)
        assertEquals(112, detail.occurrences.count)
        assertEquals("in_network[485].negotiated_rates[17].negotiated_prices[0]", detail.location.path)
        assertEquals(425, detail.location.providerGroupId)
        assertEquals(listOf("1275025348"), detail.npis.values)
    }
}

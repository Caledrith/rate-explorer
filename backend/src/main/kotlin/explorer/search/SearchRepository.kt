package explorer.search

import explorer.source.SourceFileInfo
import explorer.source.SourceFileRepository
import org.jdbi.v3.core.Handle
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.core.statement.Query
import org.jdbi.v3.core.transaction.TransactionIsolationLevel
import java.math.BigDecimal
import java.sql.ResultSet
import java.time.LocalDate

/** One de-duplicated rate for one provider, before labels and comparisons are added. */
data class LineRow(
    val tin: String,
    val rate: BigDecimal,
    val negotiatedType: String?,
    val billingClass: String,
    val serviceCodes: List<String>,
    val modifiers: List<String>,
    val matchKind: String,
    val filedType: String,
    val filedCode: String,
    val firstPriceId: Long,
    val occurrences: Int,
    val npiCount: Int,
    /** True when the searched NPI is in a group this rate applies to (always true without an NPI filter). */
    val appliesToNpi: Boolean,
    val providerNpiCount: Int,
)

data class ProviderRow(
    val tin: String,
    val tinType: String,
    val name: String,
    val nameCount: Int,
)

data class Totals(
    val providers: Int,
    val rates: Int,
    val providersWithBothClasses: Int,
)

/** The stored price a rate line points at, joined to its item. */
data class PriceRecordRow(
    val id: Long,
    val searchCode: String,
    val rate: BigDecimal,
    val negotiatedType: String?,
    val billingClass: String,
    val setting: String?,
    val expirationDate: LocalDate?,
    val serviceCodes: List<String>,
    val modifiers: List<String>,
    val matchKind: String,
    val filedType: String,
    val filedCode: String,
    val raw: String,
)

/** One place in the file where a rate line is written. */
data class OccurrenceRow(
    val priceId: Long,
    val itemIndex: Int,
    val itemName: String?,
    val rateIndex: Int,
    val priceIndex: Int,
    val providerRefId: Long,
    val groupId: Long,
)

/**
 * All search SQL. Every query is scoped to one source file.
 *
 * The shared shape is two steps. "matched" joins prices for the code to the provider
 * groups they apply to (one row per price per group, optionally narrowed to an NPI or
 * tax ID). "lines" then collapses rows that say the same thing for the same provider,
 * because the file repeats each revenue-code price under every item sharing that
 * revenue code. Grouping at query time keeps the base tables the only source of truth;
 * the largest code produces about 7,000 matched rows, so this takes milliseconds.
 */
class SearchRepository(
    private val jdbi: Jdbi,
) {
    /**
     * Runs [block] against one consistent snapshot. A request makes several queries; a
     * reload that commits between them must not show it half of the old file and half of
     * the new one, so they share a repeatable-read transaction.
     */
    fun <T> read(block: (SearchQueries) -> T): T =
        jdbi.inTransaction<T, Exception>(TransactionIsolationLevel.REPEATABLE_READ) { handle -> block(SearchQueries(handle)) }
}

class SearchQueries(
    private val handle: Handle,
) {
    /** The file searches read: the most recently loaded one. Null until a load has finished. */
    fun activeSourceFileId(): Long? =
        handle
            .createQuery("select id from source_file order by ingested_at desc, id desc limit 1")
            .mapTo(Long::class.javaObjectType)
            .findOne()
            .orElse(null)

    fun sourceFile(id: Long): SourceFileInfo? = SourceFileRepository.find(handle, id)

    fun classSummaries(
        sourceFileId: Long,
        query: SearchQuery,
    ): List<ClassSummary> =
        handle
            .createQuery(
                """
                ${linesCte(query)},
                -- A provider's price counts once however many settings or modifiers repeat it.
                pairs as (select distinct billing_class, tin, negotiated_rate from lines)
                select p.billing_class,
                       count(distinct p.tin)                                        as providers,
                       (select count(*) from lines l where l.billing_class = p.billing_class) as rates,
                       round(percentile_cont(0.5) within group (order by p.negotiated_rate)::numeric, 2) as median,
                       min(p.negotiated_rate)                                       as min_rate,
                       max(p.negotiated_rate)                                       as max_rate
                from pairs p
                group by p.billing_class
                order by p.billing_class desc
                """.trimIndent(),
            ).bindSearch(sourceFileId, query)
            .map { rows, _ ->
                ClassSummary(
                    billingClass = rows.getString("billing_class"),
                    providers = rows.getInt("providers"),
                    rates = rows.getInt("rates"),
                    median = rows.getBigDecimal("median"),
                    min = rows.getBigDecimal("min_rate"),
                    max = rows.getBigDecimal("max_rate"),
                )
            }.list()

    fun totals(
        sourceFileId: Long,
        query: SearchQuery,
    ): Totals =
        handle
            .createQuery(
                """
                ${linesCte(query)}
                select (select count(distinct tin) from lines) as providers,
                       (select count(*) from lines)            as rates,
                       (select count(*)
                        from (select tin from lines group by tin having count(distinct billing_class) > 1) two_classes) as both_classes
                """.trimIndent(),
            ).bindSearch(sourceFileId, query)
            .map { rows, _ -> Totals(rows.getInt("providers"), rows.getInt("rates"), rows.getInt("both_classes")) }
            .one()

    /** One page of providers in the requested order, plus how many providers match in total. */
    fun providerPage(
        sourceFileId: Long,
        query: SearchQuery,
    ): Pair<List<ProviderRow>, Int> {
        val order =
            when (query.sort) {
                // Byte order on the lower-cased name: stable across locales, digits before letters.
                Sort.NAME -> "lower(pv.name) collate \"C\""
                Sort.RATE_ASC -> "p.min_rate"
                Sort.RATE_DESC -> "p.max_rate desc"
            }
        val providers =
            """
            ${linesCte(query)},
            providers as (
                select tin, min(negotiated_rate) as min_rate, max(negotiated_rate) as max_rate
                from lines
                ${if (query.billingClass != null) "where billing_class = :class" else ""}
                group by tin
            )
            """.trimIndent()

        var total = 0
        val page =
            handle
                .createQuery(
                    """
                    $providers
                    select p.tin, pv.tin_type, pv.name, pv.name_count, count(*) over () as total
                    from providers p
                    join provider pv on pv.source_file_id = :sf and pv.tin = p.tin
                    order by $order, p.tin
                    limit :limit offset :offset
                    """.trimIndent(),
                ).bindSearch(sourceFileId, query)
                .bindClass(query)
                .bind("limit", query.pageSize)
                .bind("offset", (query.page - 1).toLong() * query.pageSize)
                .map { rows, _ ->
                    total = rows.getInt("total")
                    ProviderRow(rows.getString("tin"), rows.getString("tin_type"), rows.getString("name"), rows.getInt("name_count"))
                }.list()

        // A page past the end returns no rows, so the window count is unavailable.
        if (page.isEmpty() && query.page > 1) {
            total =
                handle
                    .createQuery("$providers select count(*) from providers")
                    .bindSearch(sourceFileId, query)
                    .bindClass(query)
                    .mapTo(Int::class.java)
                    .one()
        }
        return page to total
    }

    /**
     * Every rate line the given providers have for the code. The NPI filter is deliberately
     * not applied to the rows here: each line reports whether it applies to the searched
     * NPI, so the caller can show matching rates and count the ones it hides.
     */
    fun lines(
        sourceFileId: Long,
        code: String,
        tins: List<String>,
        npi: Long?,
    ): List<LineRow> {
        if (tins.isEmpty()) return emptyList()
        return handle
            .createQuery(
                """
                with matched as (
                    $MATCHED_SELECT
                    where pr.source_file_id = :sf and pr.search_code = :code and pg.tin = any(:tins)
                ),
                line_rows as (
                    select m.tin, m.negotiated_rate, m.negotiated_type, m.billing_class, m.setting,
                           m.service_codes, m.modifiers, m.match_kind, m.filed_type, m.filed_code,
                           min(m.price_id)                                               as first_price_id,
                           count(distinct (m.billing_item_id, m.rate_index, m.price_index)) as occurrences,
                           count(distinct n.npi)                                         as npi_count,
                           ${if (npi != null) "coalesce(bool_or(n.npi = :npi), false)" else "true"} as applies_to_npi
                    from matched m
                    left join provider_group_npi n on n.provider_group_id = m.group_id
                    group by m.tin, m.negotiated_rate, m.negotiated_type, m.billing_class, m.setting,
                             m.service_codes, m.modifiers, m.match_kind, m.filed_type, m.filed_code
                ),
                provider_npis as (
                    select m.tin, count(distinct n.npi) as npi_count
                    from matched m
                    join provider_group_npi n on n.provider_group_id = m.group_id
                    group by m.tin
                )
                select l.*, coalesce(pn.npi_count, 0) as provider_npi_count
                from line_rows l
                left join provider_npis pn on pn.tin = l.tin
                order by l.tin, l.negotiated_rate, l.first_price_id
                """.trimIndent(),
            ).bind("sf", sourceFileId)
            .bind("code", code)
            .bindArray("tins", String::class.java, tins)
            .also { if (npi != null) it.bind("npi", npi) }
            .map { rows, _ ->
                LineRow(
                    tin = rows.getString("tin"),
                    rate = rows.getBigDecimal("negotiated_rate"),
                    negotiatedType = rows.getString("negotiated_type"),
                    billingClass = rows.getString("billing_class"),
                    serviceCodes = rows.strings("service_codes"),
                    modifiers = rows.strings("modifiers"),
                    matchKind = rows.getString("match_kind"),
                    filedType = rows.getString("filed_type"),
                    filedCode = rows.getString("filed_code"),
                    firstPriceId = rows.getLong("first_price_id"),
                    occurrences = rows.getInt("occurrences"),
                    npiCount = rows.getInt("npi_count"),
                    appliesToNpi = rows.getBoolean("applies_to_npi"),
                    providerNpiCount = rows.getInt("provider_npi_count"),
                )
            }.list()
    }

    // ---- Code catalog ----

    fun codeInfo(
        sourceFileId: Long,
        code: String,
    ): CodeInfo? =
        handle
            .createQuery("$CODE_SELECT where source_file_id = :sf and code = :code")
            .bind("sf", sourceFileId)
            .bind("code", code)
            .map { rows, _ -> codeInfo(rows) }
            .findOne()
            .orElse(null)

    /** Codes starting with the prefix, in code order. An empty prefix returns the most widely held codes. */
    fun codes(
        sourceFileId: Long,
        prefix: String,
        limit: Int,
    ): List<CodeInfo> {
        val sql =
            if (prefix.isEmpty()) {
                "$CODE_SELECT where source_file_id = :sf order by provider_count desc, code limit :limit"
            } else {
                "$CODE_SELECT where source_file_id = :sf and code like :prefix order by code limit :limit"
            }
        return handle
            .createQuery(sql)
            .bind("sf", sourceFileId)
            .bind("limit", limit)
            .also { if (prefix.isNotEmpty()) it.bind("prefix", likePrefix(prefix)) }
            .map { rows, _ -> codeInfo(rows) }
            .list()
    }

    // ---- Why a search came back empty ----

    /** How many tax IDs list this NPI anywhere in the file. Zero means the NPI is not in the file. */
    fun providerCountForNpi(
        sourceFileId: Long,
        npi: Long,
    ): Int =
        handle
            .createQuery(
                """
                select count(distinct pg.tin)
                from provider_group_npi n
                join provider_group pg on pg.id = n.provider_group_id
                where pg.source_file_id = :sf and n.npi = :npi
                """.trimIndent(),
            ).bind("sf", sourceFileId)
            .bind("npi", npi)
            .mapTo(Int::class.java)
            .one()

    fun provider(
        sourceFileId: Long,
        tin: String,
    ): ProviderRow? =
        handle
            .createQuery("select tin, tin_type, name, name_count from provider where source_file_id = :sf and tin = :tin")
            .bind("sf", sourceFileId)
            .bind("tin", tin)
            .map { rows, _ ->
                ProviderRow(rows.getString("tin"), rows.getString("tin_type"), rows.getString("name"), rows.getInt("name_count"))
            }.findOne()
            .orElse(null)

    /** How many distinct codes this tax ID has any rate for. */
    fun codeCountForTin(
        sourceFileId: Long,
        tin: String,
    ): Int =
        handle
            .createQuery(
                """
                select count(distinct pr.search_code)
                from provider_group pg
                join price_record pr on pr.source_file_id = pg.source_file_id and pr.provider_ref_id = pg.ref_id
                where pg.source_file_id = :sf and pg.tin = :tin
                """.trimIndent(),
            ).bind("sf", sourceFileId)
            .bind("tin", tin)
            .mapTo(Int::class.java)
            .one()

    // ---- Rate detail ----

    fun priceRecord(
        sourceFileId: Long,
        priceId: Long,
    ): PriceRecordRow? =
        handle
            .createQuery(
                """
                select pr.id, pr.search_code, pr.negotiated_rate, pr.negotiated_type,
                       coalesce(pr.billing_class, 'unspecified') as billing_class, pr.setting, pr.expiration_date,
                       pr.service_codes, pr.modifiers, pr.match_kind, pr.raw::text as raw,
                       bi.billing_code_type as filed_type, bi.billing_code as filed_code
                from price_record pr
                join billing_item bi on bi.id = pr.billing_item_id
                where pr.source_file_id = :sf and pr.id = :id
                """.trimIndent(),
            ).bind("sf", sourceFileId)
            .bind("id", priceId)
            .map { rows, _ ->
                PriceRecordRow(
                    id = rows.getLong("id"),
                    searchCode = rows.getString("search_code"),
                    rate = rows.getBigDecimal("negotiated_rate"),
                    negotiatedType = rows.getString("negotiated_type"),
                    billingClass = rows.getString("billing_class"),
                    setting = rows.getString("setting"),
                    expirationDate = rows.getObject("expiration_date", LocalDate::class.java),
                    serviceCodes = rows.strings("service_codes"),
                    modifiers = rows.strings("modifiers"),
                    matchKind = rows.getString("match_kind"),
                    filedType = rows.getString("filed_type"),
                    filedCode = rows.getString("filed_code"),
                    raw = rows.getString("raw"),
                )
            }.findOne()
            .orElse(null)

    /**
     * Every place the file writes the same rate line as [priceId] for this tax ID, in file
     * order. "Same" uses the de-duplication key from the search queries.
     */
    fun occurrences(
        sourceFileId: Long,
        priceId: Long,
        tin: String,
    ): List<OccurrenceRow> =
        handle
            .createQuery(
                """
                with base as (
                    select pr.*, bi.billing_code_type as filed_type, bi.billing_code as filed_code
                    from price_record pr
                    join billing_item bi on bi.id = pr.billing_item_id
                    where pr.source_file_id = :sf and pr.id = :id
                )
                select pr.id as price_id, bi.item_index, bi.name as item_name, pr.rate_index, pr.price_index,
                       pr.provider_ref_id, pg.id as group_id
                from base b
                join price_record pr
                     on pr.source_file_id = b.source_file_id
                    and pr.search_code = b.search_code
                    and pr.negotiated_rate = b.negotiated_rate
                    and pr.negotiated_type is not distinct from b.negotiated_type
                    and pr.billing_class is not distinct from b.billing_class
                    and pr.setting is not distinct from b.setting
                    and pr.service_codes = b.service_codes
                    and pr.modifiers = b.modifiers
                    and pr.match_kind = b.match_kind
                join billing_item bi
                     on bi.id = pr.billing_item_id
                    and bi.billing_code_type = b.filed_type
                    and bi.billing_code = b.filed_code
                join provider_group pg
                     on pg.source_file_id = pr.source_file_id and pg.ref_id = pr.provider_ref_id and pg.tin = :tin
                order by pr.id, pg.id
                """.trimIndent(),
            ).bind("sf", sourceFileId)
            .bind("id", priceId)
            .bind("tin", tin)
            .map { rows, _ ->
                OccurrenceRow(
                    priceId = rows.getLong("price_id"),
                    itemIndex = rows.getInt("item_index"),
                    itemName = rows.getString("item_name"),
                    rateIndex = rows.getInt("rate_index"),
                    priceIndex = rows.getInt("price_index"),
                    providerRefId = rows.getLong("provider_ref_id"),
                    groupId = rows.getLong("group_id"),
                )
            }.list()

    fun npisInGroups(groupIds: Collection<Long>): List<Long> {
        if (groupIds.isEmpty()) return emptyList()
        return handle
            .createQuery("select distinct npi from provider_group_npi where provider_group_id = any(:groups) order by npi")
            .bindArray("groups", Long::class.javaObjectType, groupIds.toList())
            .mapTo(Long::class.javaObjectType)
            .list()
    }

    /** Every NPI billing this code under this tax ID, across all of its rates. */
    fun npisForProviderAndCode(
        sourceFileId: Long,
        code: String,
        tin: String,
    ): List<Long> =
        handle
            .createQuery(
                """
                select distinct n.npi
                from price_record pr
                join provider_group pg
                     on pg.source_file_id = pr.source_file_id and pg.ref_id = pr.provider_ref_id and pg.tin = :tin
                join provider_group_npi n on n.provider_group_id = pg.id
                where pr.source_file_id = :sf and pr.search_code = :code
                order by n.npi
                """.trimIndent(),
            ).bind("sf", sourceFileId)
            .bind("code", code)
            .bind("tin", tin)
            .mapTo(Long::class.javaObjectType)
            .list()

    private fun Query.bindSearch(
        sourceFileId: Long,
        query: SearchQuery,
    ): Query =
        apply {
            bind("sf", sourceFileId)
            bind("code", query.code)
            query.tin?.let { bind("tin", it) }
            query.npi?.let { bind("npi", it) }
        }

    private fun Query.bindClass(query: SearchQuery): Query = apply { query.billingClass?.let { bind("class", it) } }

    private fun codeInfo(rows: ResultSet): CodeInfo =
        CodeInfo(
            code = rows.getString("code"),
            type = rows.getString("code_type"),
            name = rows.getString("name"),
            description = rows.getString("description"),
            providerCount = rows.getInt("provider_count"),
        )

    private companion object {
        const val CODE_SELECT = "select code, code_type, name, description, provider_count from code_catalog"

        /** One row per price per provider group it applies to. */
        const val MATCHED_SELECT = """
            select pr.id as price_id, pr.billing_item_id, pr.rate_index, pr.price_index,
                   pr.negotiated_rate, pr.negotiated_type,
                   coalesce(pr.billing_class, 'unspecified') as billing_class, pr.setting,
                   pr.service_codes, pr.modifiers, pr.match_kind,
                   bi.billing_code_type as filed_type, bi.billing_code as filed_code,
                   pg.id as group_id, pg.tin
            from price_record pr
            join billing_item bi on bi.id = pr.billing_item_id
            join provider_group pg on pg.source_file_id = pr.source_file_id and pg.ref_id = pr.provider_ref_id"""

        /** The "matched" and "lines" steps described on the class, with the query's provider filters. */
        fun linesCte(query: SearchQuery): String =
            """
            with matched as (
                $MATCHED_SELECT
                where pr.source_file_id = :sf and pr.search_code = :code
                ${if (query.tin != null) "and pg.tin = :tin" else ""}
                ${
                if (query.npi != null) {
                    "and exists (select 1 from provider_group_npi n where n.provider_group_id = pg.id and n.npi = :npi)"
                } else {
                    ""
                }
            }
            ),
            lines as (
                select tin, negotiated_rate, negotiated_type, billing_class, setting, service_codes, modifiers,
                       match_kind, filed_type, filed_code
                from matched
                group by tin, negotiated_rate, negotiated_type, billing_class, setting, service_codes, modifiers,
                         match_kind, filed_type, filed_code
            )
            """.trimIndent()

        fun likePrefix(prefix: String): String = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"

        fun ResultSet.strings(column: String): List<String> {
            @Suppress("UNCHECKED_CAST")
            val values = getArray(column)?.array as? Array<String?>
            return values?.filterNotNull().orEmpty()
        }
    }
}

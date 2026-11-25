package explorer.search

import explorer.api.NotFoundException
import explorer.api.NotReadyException
import explorer.json.Json
import explorer.reference.Labels
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate

/**
 * Assembles API responses from repository rows: adds labels, compares each rate with the
 * median for its class, applies the NPI filter to individual rates, and explains empty results.
 */
class SearchService(
    private val repository: SearchRepository,
    /** URL of the rate file to search; null until a load has succeeded. */
    private val activeFileUrl: () -> String?,
) {
    /** Opens a snapshot on the active file. Everything a request reads goes through one of these. */
    private fun <T> readActiveFile(block: (db: SearchQueries, sourceFileId: Long) -> T): T {
        val url = activeFileUrl() ?: throw NotReadyException()
        return repository.read { db -> block(db, db.sourceFileId(url) ?: throw NotReadyException()) }
    }

    fun search(params: Map<String, String?>): SearchResponse {
        val query = InputNormalizer.parse(params)
        return readActiveFile { db, sourceFileId -> search(db, sourceFileId, query) }
    }

    private fun search(
        db: SearchQueries,
        sourceFileId: Long,
        query: SearchQuery,
    ): SearchResponse {
        val codeInfo = db.codeInfo(sourceFileId, query.code)
        if (codeInfo == null) {
            return response(query, null, EMPTY_SUMMARY, emptyList(), emptyList(), 0, codeNotInFile(db, sourceFileId, query.code))
        }

        val classes = db.classSummaries(sourceFileId, query)
        val totals = db.totals(sourceFileId, query)
        val summary =
            Summary(
                providers = totals.providers,
                rates = totals.rates,
                providersWithBothClasses = totals.providersWithBothClasses,
                distinctSettings = totals.distinctSettings,
                distinctNegotiatedTypes = totals.distinctNegotiatedTypes,
                classes = classes,
            )
        // "vs median" always compares with every provider for the code, not just the filtered ones.
        val baseline =
            if (query.hasProviderFilter) db.classSummaries(sourceFileId, query.copy(npi = null, tin = null)) else classes

        if (totals.providers == 0) {
            return response(query, codeInfo, summary, baseline, emptyList(), 0, providerMiss(db, sourceFileId, query))
        }

        val (providerRows, totalProviders) = db.providerPage(sourceFileId, query)
        val linesByTin = db.lines(sourceFileId, query.code, providerRows.map { it.tin }, query.npi).groupBy { it.tin }
        val medians = baseline.associate { it.billingClass to it.median }

        val providers =
            providerRows.map { provider ->
                val all = linesByTin[provider.tin].orEmpty()
                val inClass = all.filter { query.billingClass == null || it.billingClass == query.billingClass }
                val visible = inClass.filter { it.appliesToNpi }
                ProviderResult(
                    tin = provider.tin,
                    tinType = provider.tinType,
                    tinDisplay = tinDisplay(provider.tinType, provider.tin),
                    name = provider.name,
                    npiCount = all.firstOrNull()?.providerNpiCount ?: 0,
                    matchedNpi = query.npi?.toString(),
                    hiddenRateCount = inClass.size - visible.size,
                    rates = visible.map { rateLine(it, medians) },
                )
            }

        val noResults = if (totalProviders == 0) NoResults(reason = "no_rates_in_class") else null
        return response(query, codeInfo, summary, baseline, providers, totalProviders, noResults)
    }

    fun codes(
        prefix: String?,
        limit: Int?,
    ): List<CodeInfo> {
        val cleaned =
            prefix
                ?.trim()
                ?.uppercase()
                .orEmpty()
                .filter(Char::isLetterOrDigit)
                .take(7)
        return readActiveFile { db, sourceFileId -> db.codes(sourceFileId, cleaned, (limit ?: 10).coerceIn(1, 50)) }
    }

    /** [id] is the handle a search result gave for one rate. */
    fun detail(id: String): RateDetail = readActiveFile { db, sourceFileId -> detail(db, sourceFileId, id) }

    private fun detail(
        db: SearchQueries,
        sourceFileId: Long,
        id: String,
    ): RateDetail {
        val priceId = id.substringBefore('-').toLongOrNull()
        val tin = id.substringAfter('-', "")
        if (priceId == null || tin.isEmpty()) throw NotFoundException("That rate does not exist.")

        val price = db.priceRecord(sourceFileId, priceId) ?: throw NotFoundException("That rate does not exist.")
        val occurrences = db.occurrences(sourceFileId, priceId, tin)
        val provider = db.provider(sourceFileId, tin)
        if (occurrences.isEmpty() || provider == null) throw NotFoundException("That rate is not listed for this provider.")
        val source = db.sourceFile(sourceFileId) ?: throw NotReadyException()

        val first = occurrences.first()
        val places = occurrences.distinctBy { Triple(it.itemIndex, it.rateIndex, it.priceIndex) }
        val npis = db.npisInGroups(occurrences.map { it.groupId }.toSet())
        val providerNpis = db.npisForProviderAndCode(sourceFileId, price.searchCode, tin)
        val otherNpis = providerNpis - npis.toSet()
        val filedUnder = FiledUnder(price.matchKind, price.filedType, price.filedCode)

        return RateDetail(
            id = id,
            searchCode = price.searchCode,
            rate = price.rate,
            negotiatedType = price.negotiatedType,
            billingClass = price.billingClass,
            setting = price.setting,
            expirationDate = price.expirationDate,
            noEndDate = price.expirationDate == NO_END_DATE,
            placeOfService = price.serviceCodes.map { CodeLabel(it, Labels.placeOfService(it)) },
            modifiers = price.modifiers.map { CodeLabel(it, Labels.modifier(it)) },
            provider =
                ProviderRef(
                    tin = provider.tin,
                    tinType = provider.tinType,
                    tinDisplay = tinDisplay(provider.tinType, provider.tin),
                    name = provider.name,
                    nameCount = provider.nameCount,
                    npiCount = providerNpis.size,
                ),
            match =
                MatchInfo(
                    kind = price.matchKind,
                    field = if (price.matchKind == "additional_information") "additional_information" else "billing_code",
                    value = price.searchCode,
                    filedUnder = filedUnder,
                    itemName = first.itemName,
                ),
            occurrences =
                Occurrences(
                    count = places.size,
                    sampleItemNames = places.mapNotNull { it.itemName }.distinct().take(SAMPLE_ITEM_NAMES),
                ),
            location =
                RecordLocation(
                    itemIndex = first.itemIndex,
                    rateIndex = first.rateIndex,
                    priceIndex = first.priceIndex,
                    // Inline provider groups have no id in the file; they carry a negative one internally.
                    providerGroupId = first.providerRefId.takeIf { it >= 0 },
                    path = "in_network[${first.itemIndex}].negotiated_rates[${first.rateIndex}].negotiated_prices[${first.priceIndex}]",
                ),
            npis = npiList(npis),
            otherNpis = npiList(otherNpis),
            source =
                SourceRef(
                    indexFileName = source.indexFileName,
                    indexUrl = source.indexUrl,
                    reportingStructureIndex = source.reportingStructureIndex,
                    planGroupLabel = source.planGroupLabel,
                    planCount = source.planCount,
                    fileName = source.fileName,
                    fileUrl = source.fileUrl,
                    schemaVersion = source.schemaVersion,
                    lastUpdatedOn = source.lastUpdatedOn,
                ),
            raw = prettyJson(price.raw),
        )
    }

    private fun rateLine(
        line: LineRow,
        medians: Map<String, BigDecimal>,
    ): RateLine =
        RateLine(
            id = "${line.firstPriceId}-${line.tin}",
            rate = line.rate,
            negotiatedType = line.negotiatedType,
            vsMedianPercent = medians[line.billingClass]?.let { percentDifference(line.rate, it) },
            billingClass = line.billingClass,
            setting = line.setting,
            placeOfService = line.serviceCodes.map { CodeLabel(it, Labels.placeOfService(it)) },
            modifiers = line.modifiers.map { CodeLabel(it, Labels.modifier(it)) },
            filedUnder = FiledUnder(line.matchKind, line.filedType, line.filedCode),
            npiCount = line.npiCount,
            occurrences = line.occurrences,
        )

    private fun codeNotInFile(
        db: SearchQueries,
        sourceFileId: Long,
        code: String,
    ): NoResults {
        // Closest codes share the longest leading run with what was typed: 99216 -> 9921x, then 992xx.
        val closest =
            sequenceOf(code.length - 1, code.length - 2)
                .filter { it >= 2 }
                .map { length -> db.codes(sourceFileId, code.take(length), CLOSEST_CODES) }
                .firstOrNull { it.isNotEmpty() }
                .orEmpty()
        return NoResults(reason = "code_not_in_file", closestCodes = closest)
    }

    /** The code exists, but not for the NPI and/or EIN searched. Says which of them the file knows. */
    private fun providerMiss(
        db: SearchQueries,
        sourceFileId: Long,
        query: SearchQuery,
    ): NoResults {
        val npi =
            query.npi?.let { npi ->
                val providerCount = db.providerCountForNpi(sourceFileId, npi)
                NpiMiss(npi.toString(), inFile = providerCount > 0, providerCount = providerCount)
            }
        val ein =
            query.tin?.let { tin ->
                val provider = db.provider(sourceFileId, tin)
                EinMiss(
                    ein = tin,
                    einDisplay = tinDisplay("ein", tin),
                    inFile = provider != null,
                    name = provider?.name,
                    codeCount = if (provider != null) db.codeCountForTin(sourceFileId, tin) else 0,
                )
            }
        val unknown = npi?.inFile == false || ein?.inFile == false
        return NoResults(
            reason = if (unknown) "provider_not_in_file" else "provider_has_no_rates_for_code",
            ein = ein,
            npi = npi,
        )
    }

    private fun response(
        query: SearchQuery,
        codeInfo: CodeInfo?,
        summary: Summary,
        baseline: List<ClassSummary>,
        providers: List<ProviderResult>,
        totalProviders: Int,
        noResults: NoResults?,
    ) = SearchResponse(
        query =
            QueryEcho(
                code = query.code,
                npi = query.npi?.toString(),
                ein = query.tin,
                einDisplay = query.tin?.let { tinDisplay("ein", it) },
                billingClass = query.billingClass,
                sort = query.sort.param,
                page = query.page,
                pageSize = query.pageSize,
            ),
        code = codeInfo,
        summary = summary,
        baseline = baseline,
        providers = providers,
        page =
            PageInfo(
                page = query.page,
                pageSize = query.pageSize,
                totalProviders = totalProviders,
                totalPages = if (totalProviders == 0) 0 else (totalProviders + query.pageSize - 1) / query.pageSize,
            ),
        noResults = noResults,
    )

    companion object {
        private val EMPTY_SUMMARY = Summary(0, 0, 0, 0, 0, emptyList())
        private val NO_END_DATE: LocalDate = LocalDate.of(9999, 12, 31)
        private const val CLOSEST_CODES = 5
        private const val SAMPLE_ITEM_NAMES = 5
        private const val NPI_LIST_LIMIT = 200

        /** Whole-percent difference of [rate] from [median]; null when the median is zero. */
        fun percentDifference(
            rate: BigDecimal,
            median: BigDecimal,
        ): Int? {
            if (median.signum() == 0) return null
            return rate
                .subtract(median)
                .multiply(BigDecimal(100))
                .divide(median, 0, RoundingMode.HALF_UP)
                .toInt()
        }

        /** EINs read as 12-3456789. Other tax ID types are shown as written. */
        fun tinDisplay(
            tinType: String,
            tin: String,
        ): String = if (tinType == "ein" && tin.length == 9 && tin.all(Char::isDigit)) "${tin.take(2)}-${tin.drop(2)}" else tin

        /** Re-indents stored JSON without touching its content; see [Json.exact]. */
        fun prettyJson(json: String): String = Json.exact.writerWithDefaultPrettyPrinter().writeValueAsString(Json.exact.readTree(json))

        private fun npiList(values: List<Long>) = NpiList(values.size, values.take(NPI_LIST_LIMIT).map(Long::toString))
    }
}

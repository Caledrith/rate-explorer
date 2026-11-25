package explorer.search

import com.fasterxml.jackson.databind.JsonNode
import java.math.BigDecimal
import java.time.LocalDate

enum class Sort(
    val param: String,
) {
    NAME("name"),
    RATE_ASC("rate_asc"),
    RATE_DESC("rate_desc"),
    ;

    companion object {
        fun fromParam(value: String?): Sort? = entries.firstOrNull { it.param == value }
    }
}

/** A validated search. Identifiers are already normalized (EIN is nine digits, code is upper case). */
data class SearchQuery(
    val code: String,
    val npi: Long? = null,
    val tin: String? = null,
    val billingClass: String? = null,
    val sort: Sort = Sort.NAME,
    val page: Int = 1,
    val pageSize: Int = 25,
) {
    val hasProviderFilter: Boolean get() = npi != null || tin != null
}

// ---- Search response ----

data class SearchResponse(
    val query: QueryEcho,
    /** Null when the code is not in the file at all. */
    val code: CodeInfo?,
    /** Counts for this search before the class filter, so the class tiles always show both classes. */
    val summary: Summary,
    /** Medians and ranges across every provider for this code; equals summary.classes without a provider filter. */
    val baseline: List<ClassSummary>,
    val providers: List<ProviderResult>,
    val page: PageInfo,
    /** Present when no providers matched, saying why. */
    val noResults: NoResults?,
)

data class QueryEcho(
    val code: String,
    val npi: String?,
    val ein: String?,
    val einDisplay: String?,
    val billingClass: String?,
    val sort: String,
    val page: Int,
    val pageSize: Int,
)

data class CodeInfo(
    val code: String,
    /** CPT, HCPCS, RC ... or null when the file only mentions the code on prices under revenue codes. */
    val type: String?,
    /** The file's short name for the code, for example "OFFICE/OUTPATIENT VISIT EST". */
    val name: String?,
    /** The file's longer description. The source cuts it at 100 characters. */
    val description: String?,
    val providerCount: Int,
)

data class Summary(
    val providers: Int,
    val rates: Int,
    val providersWithBothClasses: Int,
    val classes: List<ClassSummary>,
)

data class ClassSummary(
    val billingClass: String,
    val providers: Int,
    val rates: Int,
    val median: BigDecimal,
    val min: BigDecimal,
    val max: BigDecimal,
)

data class ProviderResult(
    val tin: String,
    val tinType: String,
    val tinDisplay: String,
    val name: String,
    /** NPIs billing this code under this tax ID. */
    val npiCount: Int,
    /** The searched NPI, echoed when it narrowed this provider's rates. */
    val matchedNpi: String?,
    /** Rates this provider has for the code that do not apply to the searched NPI. */
    val hiddenRateCount: Int,
    val rates: List<RateLine>,
)

data class RateLine(
    /** Opaque handle for the detail endpoint. */
    val id: String,
    val rate: BigDecimal,
    val negotiatedType: String?,
    /** Whole-percent difference from the code-wide median of the same billing class. */
    val vsMedianPercent: Int?,
    val billingClass: String,
    val placeOfService: List<CodeLabel>,
    val modifiers: List<CodeLabel>,
    val filedUnder: FiledUnder,
    val npiCount: Int,
    /** How many times the file repeats this price for this provider. */
    val occurrences: Int,
)

data class CodeLabel(
    val code: String,
    val label: String?,
)

data class FiledUnder(
    /** billing_code: the item's own code matched. additional_information: the code is written on the price. */
    val kind: String,
    val codeType: String,
    val code: String,
)

data class PageInfo(
    val page: Int,
    val pageSize: Int,
    val totalProviders: Int,
    val totalPages: Int,
)

data class NoResults(
    /** code_not_in_file | provider_not_in_file | provider_has_no_rates_for_code | no_rates_in_class */
    val reason: String,
    val closestCodes: List<CodeInfo> = emptyList(),
    val ein: EinMiss? = null,
    val npi: NpiMiss? = null,
)

data class EinMiss(
    val ein: String,
    val einDisplay: String,
    val inFile: Boolean,
    val name: String?,
    val codeCount: Int,
)

data class NpiMiss(
    val npi: String,
    val inFile: Boolean,
    val providerCount: Int,
)

// ---- Rate detail ----

data class RateDetail(
    val id: String,
    val searchCode: String,
    val rate: BigDecimal,
    val negotiatedType: String?,
    val billingClass: String,
    val setting: String?,
    val expirationDate: LocalDate?,
    /** The file writes 9999-12-31 for rates with no end date. */
    val noEndDate: Boolean,
    val placeOfService: List<CodeLabel>,
    val modifiers: List<CodeLabel>,
    val provider: ProviderRef,
    val match: MatchInfo,
    val occurrences: Occurrences,
    val location: RecordLocation,
    val npis: NpiList,
    val otherNpis: NpiList,
    val source: SourceRef,
    val raw: JsonNode,
)

data class ProviderRef(
    val tin: String,
    val tinType: String,
    val tinDisplay: String,
    val name: String,
    val nameCount: Int,
    val npiCount: Int,
)

data class MatchInfo(
    val kind: String,
    /** The JSON field the search code was found in. */
    val field: String,
    val value: String,
    val filedUnder: FiledUnder,
    val itemName: String?,
)

data class Occurrences(
    val count: Int,
    /** Names of the first few items the price is repeated under. */
    val sampleItemNames: List<String>,
)

data class RecordLocation(
    val itemIndex: Int,
    val rateIndex: Int,
    val priceIndex: Int,
    val providerGroupId: Long?,
    /** Path of the price inside the in-network file. */
    val path: String,
)

data class NpiList(
    val total: Int,
    /** At most the first 200, in numeric order. */
    val values: List<String>,
)

data class SourceRef(
    val indexFileName: String,
    val indexUrl: String,
    val reportingStructureIndex: Int,
    val planGroupLabel: String?,
    val planCount: Int,
    val fileName: String,
    val fileUrl: String,
    val schemaVersion: String?,
    val lastUpdatedOn: LocalDate?,
)

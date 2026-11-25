package explorer.ingest

import java.math.BigDecimal
import java.time.LocalDate

/** Where the searchable code of a price came from. The values are stored in the database. */
enum class MatchKind(
    val dbValue: String,
) {
    /** The price sits under an item whose own billing code is the search code. */
    BILLING_CODE("billing_code"),

    /** The item is a revenue code and the procedure code is written on the price itself. */
    ADDITIONAL_INFORMATION("additional_information"),
}

data class ProviderGroupRow(
    val id: Long,
    val refId: Long,
    val groupIndex: Int,
    val tinType: String,
    val tin: String,
    val businessName: String?,
    val npis: List<Long>,
)

data class BillingItemRow(
    val id: Long,
    val itemIndex: Int,
    val codeType: String,
    val codeTypeVersion: String?,
    val code: String,
    val name: String?,
    val description: String?,
    val negotiationArrangement: String?,
)

data class PriceRow(
    val id: Long,
    val itemId: Long,
    val rateIndex: Int,
    val priceIndex: Int,
    val providerRefId: Long,
    val negotiatedType: String?,
    val rate: BigDecimal,
    val expirationDate: LocalDate?,
    val billingClass: String?,
    val setting: String?,
    val serviceCodes: List<String>,
    val modifiers: List<String>,
    val additionalInformation: String?,
    val searchCode: String,
    val matchKind: MatchKind,
    val raw: String,
)

/** Everything one in_network item turns into. */
data class NormalizedItem(
    val item: BillingItemRow,
    val prices: List<PriceRow>,
    /** Provider groups written inline on a rate instead of through provider_references. */
    val inlineGroups: List<ProviderGroupRow>,
)

/**
 * What was read and what was left out. Stored with the source file and shown in the app,
 * so skipped records are visible rather than silently dropped.
 */
class IngestStats {
    var providerReferences = 0
    var providerGroups = 0
    var npis = 0
    var items = 0
    var negotiatedRates = 0
    var prices = 0
    var pricesMatchedByAdditionalInformation = 0
    var inlineProviderGroups = 0

    var skippedItems = 0
    var skippedRatesWithoutProviders = 0
    var skippedPrices = 0
    var skippedNpis = 0
    var skippedProviderGroups = 0
    var remoteProviderReferences = 0
    val unknownTopLevelFields = sortedSetOf<String>()

    fun toMap(): Map<String, Any> =
        mapOf(
            "providerReferences" to providerReferences,
            "providerGroups" to providerGroups,
            "npis" to npis,
            "items" to items,
            "negotiatedRates" to negotiatedRates,
            "prices" to prices,
            "pricesMatchedByAdditionalInformation" to pricesMatchedByAdditionalInformation,
            "inlineProviderGroups" to inlineProviderGroups,
            "skippedItems" to skippedItems,
            "skippedRatesWithoutProviders" to skippedRatesWithoutProviders,
            "skippedPrices" to skippedPrices,
            "skippedNpis" to skippedNpis,
            "skippedProviderGroups" to skippedProviderGroups,
            "remoteProviderReferences" to remoteProviderReferences,
            "unknownTopLevelFields" to unknownTopLevelFields.toList(),
        )
}

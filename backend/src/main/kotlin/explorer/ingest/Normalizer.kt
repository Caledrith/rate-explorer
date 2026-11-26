package explorer.ingest

import com.fasterxml.jackson.databind.JsonNode
import explorer.json.parseIsoDateOrNull
import java.math.BigDecimal

/** Hands out row ids in file order, so a lower id always means earlier in the file. */
class IdAllocator(
    startAfter: Long = 0,
) {
    private var last = startAfter

    fun next(): Long = ++last
}

/**
 * Turns the file's nested JSON into flat rows. It is pure (no I/O), and it is lenient:
 * a record that cannot be used is skipped and counted in [IngestStats] instead of
 * failing the whole file.
 */
class Normalizer(
    private val stats: IngestStats,
    private val groupIds: IdAllocator = IdAllocator(),
    private val itemIds: IdAllocator = IdAllocator(),
    private val priceIds: IdAllocator = IdAllocator(),
) {
    /** Inline provider groups have no provider_group_id in the file, so they get negative ones. */
    private var nextInlineRefId = -1L

    fun providerReference(node: JsonNode): List<ProviderGroupRow> {
        stats.providerReferences++
        val refId = node["provider_group_id"]?.takeIf { it.isNumber || it.isTextual }?.asText()?.toLongOrNull()
        val groups = node["provider_groups"]
        if (refId == null || groups == null || !groups.isArray) {
            // Schema versions allow a reference to point at another file ("location") instead.
            if (node.has("location")) stats.remoteProviderReferences++ else stats.skippedProviderGroups++
            return emptyList()
        }
        return groups.mapIndexedNotNull { index, group -> providerGroup(refId, index, group) }
    }

    fun item(
        itemIndex: Int,
        node: JsonNode,
    ): NormalizedItem? {
        val codeType = node.text("billing_code_type")
        val code = node.text("billing_code")?.uppercase()
        val rates = node["negotiated_rates"]
        if (codeType == null || code == null || rates == null || !rates.isArray) {
            stats.skippedItems++
            return null
        }
        stats.items++

        val item =
            BillingItemRow(
                id = itemIds.next(),
                itemIndex = itemIndex,
                codeType = codeType,
                codeTypeVersion = node.text("billing_code_type_version"),
                code = code,
                name = node.text("name"),
                description = node.text("description"),
                negotiationArrangement = node.text("negotiation_arrangement"),
            )

        val prices = mutableListOf<PriceRow>()
        val inlineGroups = mutableListOf<ProviderGroupRow>()
        rates.forEachIndexed { rateIndex, rate ->
            stats.negotiatedRates++
            val refIds = rate["provider_references"]?.mapNotNull { it.asText().toLongOrNull() }.orEmpty().toMutableList()

            val inline = rate["provider_groups"]
            if (inline != null && inline.isArray && inline.size() > 0) {
                val refId = nextInlineRefId--
                val groups = inline.mapIndexedNotNull { index, group -> providerGroup(refId, index, group) }
                if (groups.isNotEmpty()) {
                    stats.inlineProviderGroups += groups.size
                    inlineGroups += groups
                    refIds += refId
                }
            }
            if (refIds.isEmpty()) {
                stats.skippedRatesWithoutProviders++
                return@forEachIndexed
            }

            rate["negotiated_prices"]?.forEachIndexed { priceIndex, price ->
                val normalized = price(item, rateIndex, priceIndex, price)
                if (normalized == null) {
                    stats.skippedPrices++
                } else {
                    stats.prices++
                    if (normalized.matchKind == MatchKind.ADDITIONAL_INFORMATION) stats.pricesMatchedByAdditionalInformation++
                    // One row per provider reference the price applies to.
                    refIds.forEach { refId -> prices += normalized.copy(id = priceIds.next(), providerRefId = refId) }
                }
            }
        }
        return NormalizedItem(item, prices, inlineGroups)
    }

    private fun providerGroup(
        refId: Long,
        groupIndex: Int,
        node: JsonNode,
    ): ProviderGroupRow? {
        val tin = node["tin"]
        val tinType = tin?.text("type")?.lowercase()
        val tinValue = tin?.text("value")
        if (tinType == null || tinValue == null) {
            stats.skippedProviderGroups++
            return null
        }

        val npis =
            node["npi"]
                ?.mapNotNull { npi ->
                    val value = npi.asText().toLongOrNull()
                    if (value != null && value in NPI_RANGE) value else null.also { stats.skippedNpis++ }
                }.orEmpty()
                .distinct()

        stats.providerGroups++
        stats.npis += npis.size
        return ProviderGroupRow(
            id = groupIds.next(),
            refId = refId,
            groupIndex = groupIndex,
            tinType = tinType,
            tin = normalizeTin(tinType, tinValue),
            businessName = tin.text("business_name")?.let(::normalizeName),
            npis = npis,
        )
    }

    private fun price(
        item: BillingItemRow,
        rateIndex: Int,
        priceIndex: Int,
        node: JsonNode,
    ): PriceRow? {
        val rate = node["negotiated_rate"]?.let(::decimal)?.takeIf(::isUsableRate) ?: return null
        val additionalInformation = node.text("additional_information")
        val (searchCode, matchKind) = searchCode(item.codeType, item.code, additionalInformation)
        return PriceRow(
            id = 0,
            itemId = item.id,
            rateIndex = rateIndex,
            priceIndex = priceIndex,
            providerRefId = 0,
            negotiatedType = node.text("negotiated_type"),
            rate = rate,
            expirationDate = node.text("expiration_date")?.let(::parseIsoDateOrNull),
            billingClass = node.text("billing_class")?.lowercase(),
            setting = node.text("setting")?.lowercase(),
            serviceCodes = node.strings("service_code").sorted(),
            modifiers = node.strings("billing_code_modifier").map(String::uppercase).sorted(),
            additionalInformation = additionalInformation,
            searchCode = searchCode,
            matchKind = matchKind,
            raw = node.toString(),
        )
    }

    companion object {
        private val NPI_RANGE = 1_000_000_000L..9_999_999_999L
        private val CODE_LIKE = Regex("^[A-Za-z0-9]{3,7}$")
        private val RATE_LIMIT = BigDecimal("1000000000000")
        private const val RATE_DECIMALS_LIMIT = 12

        /**
         * A rate is an amount of money or a percentage. JSON allows any number, so a file can
         * carry one that is negative, or too large or too fine for the medians to be worked
         * out (1e400 is valid JSON). Such a price is skipped and counted like any other
         * unusable record, instead of loading and then failing every search for its code.
         */
        fun isUsableRate(rate: BigDecimal): Boolean = rate.signum() >= 0 && rate < RATE_LIMIT && rate.scale() <= RATE_DECIMALS_LIMIT

        /**
         * The code a person would search to find this price.
         *
         * Revenue-code items are containers: the file writes the procedure code on each
         * price's additional_information. When that value looks like a code it becomes the
         * search code; otherwise the item's own billing code is used.
         */
        fun searchCode(
            codeType: String,
            billingCode: String,
            additionalInformation: String?,
        ): Pair<String, MatchKind> {
            val written = additionalInformation?.trim()
            return if (codeType.equals("RC", ignoreCase = true) && written != null && CODE_LIKE.matches(written)) {
                written.uppercase() to MatchKind.ADDITIONAL_INFORMATION
            } else {
                billingCode to MatchKind.BILLING_CODE
            }
        }

        /** EINs are stored as nine digits so "13-1624096" and "131624096" are the same provider. */
        fun normalizeTin(
            type: String,
            value: String,
        ): String = if (type == "ein") value.filter(Char::isDigit).ifEmpty { value.trim() } else value.trim()

        /** Collapses whitespace and drops trailing punctuation the file sometimes leaves on names. */
        fun normalizeName(value: String): String =
            value
                .trim()
                .split(Regex("\\s+"))
                .joinToString(" ")
                .trimEnd(',', ' ')

        private fun decimal(node: JsonNode): BigDecimal? =
            when {
                node.isNumber -> node.decimalValue()
                node.isTextual -> node.asText().trim().toBigDecimalOrNull()
                else -> null
            }
    }
}

/** A trimmed, non-empty scalar field as text, or null. Numbers are accepted where text is expected. */
private fun JsonNode.text(field: String): String? =
    this[field]
        ?.takeIf { it.isValueNode && !it.isNull }
        ?.asText()
        ?.trim()
        ?.takeIf(String::isNotEmpty)

/** The scalar entries of a list field as text. Nulls, blanks and nested values are left out. */
private fun JsonNode.strings(field: String): List<String> =
    this[field]
        ?.takeIf(JsonNode::isArray)
        ?.mapNotNull { entry ->
            entry
                .takeIf { it.isValueNode && !it.isNull }
                ?.asText()
                ?.trim()
                ?.takeIf(String::isNotEmpty)
        }.orEmpty()

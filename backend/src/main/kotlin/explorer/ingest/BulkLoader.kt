package explorer.ingest

import org.postgresql.PGConnection
import java.io.StringReader
import java.sql.Connection
import java.time.LocalDate

/**
 * Writes normalized rows with Postgres COPY, the fastest way to load hundreds of
 * thousands of rows. Rows are buffered per table and flushed in dependency order
 * (parents before children) so foreign keys always resolve.
 */
class BulkLoader(
    connection: Connection,
    private val sourceFileId: Long,
) {
    private val copy = connection.unwrap(PGConnection::class.java).copyAPI

    private val groups = CsvBuffer()
    private val npis = CsvBuffer()
    private val items = CsvBuffer()
    private val prices = CsvBuffer()

    fun add(group: ProviderGroupRow) {
        groups.row(group.id, sourceFileId, group.refId, group.groupIndex, group.tinType, group.tin, group.businessName)
        group.npis.forEach { npis.row(group.id, it) }
        flushIfLarge()
    }

    fun add(normalized: NormalizedItem) {
        normalized.inlineGroups.forEach(::add)
        val item = normalized.item
        items.row(
            item.id,
            sourceFileId,
            item.itemIndex,
            item.codeType,
            item.codeTypeVersion,
            item.code,
            item.name,
            item.description,
            item.negotiationArrangement,
        )
        normalized.prices.forEach { price ->
            prices.row(
                price.id,
                sourceFileId,
                price.itemId,
                price.rateIndex,
                price.priceIndex,
                price.providerRefId,
                price.negotiatedType,
                price.rate,
                price.expirationDate,
                price.billingClass,
                price.setting,
                price.serviceCodes,
                price.modifiers,
                price.additionalInformation,
                price.searchCode,
                price.matchKind.dbValue,
                price.raw,
            )
        }
        flushIfLarge()
    }

    fun flush() {
        groups.copyInto(GROUP_COPY)
        npis.copyInto(NPI_COPY)
        items.copyInto(ITEM_COPY)
        prices.copyInto(PRICE_COPY)
    }

    private fun flushIfLarge() {
        if (groups.size + npis.size + items.size + prices.size > FLUSH_CHARS) flush()
    }

    private fun CsvBuffer.copyInto(sql: String) {
        if (size == 0) return
        copy.copyIn(sql, StringReader(drain()))
    }

    private companion object {
        const val FLUSH_CHARS = 4_000_000

        const val GROUP_COPY =
            "COPY provider_group (id, source_file_id, ref_id, group_index, tin_type, tin, business_name) " +
                "FROM STDIN WITH (FORMAT csv)"
        const val NPI_COPY = "COPY provider_group_npi (provider_group_id, npi) FROM STDIN WITH (FORMAT csv)"
        const val ITEM_COPY =
            "COPY billing_item (id, source_file_id, item_index, billing_code_type, billing_code_type_version, " +
                "billing_code, name, description, negotiation_arrangement) FROM STDIN WITH (FORMAT csv)"
        const val PRICE_COPY =
            "COPY price_record (id, source_file_id, billing_item_id, rate_index, price_index, provider_ref_id, " +
                "negotiated_type, negotiated_rate, expiration_date, billing_class, setting, service_codes, modifiers, " +
                "additional_information, search_code, match_kind, raw) FROM STDIN WITH (FORMAT csv)"
    }
}

/**
 * Builds CSV in the dialect COPY reads: an empty unquoted field is NULL, text is always
 * quoted with doubled quotes, and lists become Postgres array literals.
 */
internal class CsvBuffer {
    private val text = StringBuilder()

    val size: Int get() = text.length

    fun row(vararg values: Any?) {
        values.forEachIndexed { index, value ->
            if (index > 0) text.append(',')
            when (value) {
                null -> Unit
                is Number, is LocalDate -> text.append(value.toString())
                is List<*> -> quoted(arrayLiteral(value))
                else -> quoted(value.toString())
            }
        }
        text.append('\n')
    }

    fun drain(): String = text.toString().also { text.setLength(0) }

    private fun quoted(value: String) {
        text.append('"')
        for (ch in value) {
            when (ch) {
                '"' -> text.append("\"\"")
                '\u0000' -> Unit // Postgres text cannot hold NUL.
                else -> text.append(ch)
            }
        }
        text.append('"')
    }

    private fun arrayLiteral(values: List<*>): String =
        values.joinToString(",", "{", "}") { element ->
            "\"" + element.toString().replace("\\", "\\\\").replace("\"", "\\\"") + "\""
        }
}

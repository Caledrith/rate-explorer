package explorer.ingest

import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.core.JsonToken
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import explorer.json.Json
import java.io.InputStream

/** Top-level scalar fields of an in-network file. They may appear before or after the arrays. */
data class RateFileHeader(
    val reportingEntityName: String? = null,
    val reportingEntityType: String? = null,
    val version: String? = null,
    val lastUpdatedOn: String? = null,
)

/** The file is valid JSON but not shaped like an in-network file. */
class RateFileFormatException(
    message: String,
) : RuntimeException(message)

interface RateFileHandler {
    fun providerReference(node: JsonNode)

    fun inNetworkItem(
        index: Int,
        node: JsonNode,
    )

    fun unknownTopLevelField(name: String) {}
}

/**
 * Walks an in-network file with a streaming parser so the whole document is never in memory.
 *
 * Only one provider reference or one in_network item is held at a time. Top-level keys are
 * accepted in any order, and keys this app does not know are skipped rather than rejected.
 * A JSON syntax error (for example a truncated download) surfaces as Jackson's
 * JsonProcessingException, which carries the position where parsing stopped. Valid JSON
 * that is not an in-network file (not an object, or no in_network list) is a
 * [RateFileFormatException].
 */
class InNetworkStreamParser(
    // Decimals are kept as written (539.40, not 539.4) so the raw record shown later is faithful.
    private val mapper: ObjectMapper = Json.exact,
) {
    fun parse(
        input: InputStream,
        handler: RateFileHandler,
    ): RateFileHeader {
        var header = RateFileHeader()
        var hasInNetworkList = false
        mapper.factory.createParser(input).use { parser ->
            if (parser.nextToken() != JsonToken.START_OBJECT) {
                throw RateFileFormatException("An in-network file must be a JSON object at the top level.")
            }
            while (parser.nextToken() == JsonToken.FIELD_NAME) {
                val field = parser.currentName()
                parser.nextToken()
                when (field) {
                    "reporting_entity_name" -> header = header.copy(reportingEntityName = parser.scalarOrNull())
                    "reporting_entity_type" -> header = header.copy(reportingEntityType = parser.scalarOrNull())
                    "version" -> header = header.copy(version = parser.scalarOrNull())
                    "last_updated_on" -> header = header.copy(lastUpdatedOn = parser.scalarOrNull())
                    "provider_references" -> parser.forEachObject { _, node -> handler.providerReference(node) }
                    "in_network" -> {
                        if (parser.currentToken() == JsonToken.START_ARRAY) hasInNetworkList = true
                        parser.forEachObject { index, node -> handler.inNetworkItem(index, node) }
                    }
                    else -> {
                        handler.unknownTopLevelField(field)
                        parser.skipChildren()
                    }
                }
            }
        }
        // An empty list is a file with no rates. No list at all is some other JSON document,
        // and loading it as "a file with nothing in it" would hide that.
        if (!hasInNetworkList) {
            throw RateFileFormatException("This JSON has no in_network list, so it is not an in-network rate file.")
        }
        return header
    }

    private fun JsonParser.scalarOrNull(): String? =
        if (currentToken().isScalarValue && currentToken() != JsonToken.VALUE_NULL) {
            text
        } else {
            skipChildren()
            null
        }

    /** Reads each object of the current array as a small tree; anything else in the array is skipped. */
    private inline fun JsonParser.forEachObject(block: (index: Int, node: JsonNode) -> Unit) {
        if (currentToken() != JsonToken.START_ARRAY) {
            skipChildren()
            return
        }
        var index = 0
        while (nextToken() != JsonToken.END_ARRAY) {
            if (currentToken() == JsonToken.START_OBJECT) {
                block(index, mapper.readTree(this))
            } else {
                skipChildren()
            }
            index++
        }
    }
}

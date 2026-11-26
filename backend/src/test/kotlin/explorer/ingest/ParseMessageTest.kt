package explorer.ingest

import com.fasterxml.jackson.core.JsonProcessingException
import explorer.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** The wording of a JSON syntax failure, which the page shows to whoever is running the app. */
class ParseMessageTest {
    /** Parsed from bytes, as the rate file is, so the position is a byte offset. */
    private fun failureOf(json: String): JsonProcessingException =
        assertFailsWith<JsonProcessingException> { Json.exact.readTree(json.toByteArray()) }

    @Test
    fun `a cut-off document says where it stopped, without the parser's source notation`() {
        // The sample is 11 bytes long, and parsing stops at its end.
        assertEquals(
            "Unexpected end-of-input: expected close marker for Array (start marker at line 1, column 7) (line 1, byte 11)",
            parseMessage(failureOf("""{"a": [1, 2""")),
        )
    }

    @Test
    fun `a limit the parser enforces is reported without the name of its setting`() {
        assertEquals(
            "Document nesting depth (1001) exceeds the maximum allowed (1000)",
            parseMessage(failureOf("[".repeat(1_500))),
        )
    }
}

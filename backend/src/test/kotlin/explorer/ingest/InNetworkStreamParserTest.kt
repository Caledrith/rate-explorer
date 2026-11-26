package explorer.ingest

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.JsonNode
import explorer.Fixtures
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class InNetworkStreamParserTest {
    private class Recorder : RateFileHandler {
        val providerReferences = mutableListOf<JsonNode>()
        val items = mutableListOf<Pair<Int, JsonNode>>()
        val unknown = mutableListOf<String>()

        override fun providerReference(node: JsonNode) {
            providerReferences.add(node)
        }

        override fun inNetworkItem(
            index: Int,
            node: JsonNode,
        ) {
            items += index to node
        }

        override fun unknownTopLevelField(name: String) {
            unknown += name
        }
    }

    @Test
    fun `reads every provider reference and item, with header fields in any position`() {
        val recorder = Recorder()
        val header = InNetworkStreamParser().parse(Fixtures.rateFileText().byteInputStream(), recorder)

        assertEquals(5, recorder.providerReferences.size)
        assertEquals((0..5).toList(), recorder.items.map { it.first })
        assertEquals(
            "99213",
            recorder.items
                .first()
                .second["billing_code"]
                .asText(),
        )
        // version and last_updated_on come after the arrays in the fixture.
        assertEquals(RateFileHeader("Example Health Plan", "Health Insurance Issuer", "2.0.0", "2026-01-15"), header)
        assertEquals(listOf("future_field"), recorder.unknown)
    }

    @Test
    fun `accepts the arrays in the opposite order`() {
        val recorder = Recorder()
        InNetworkStreamParser().parse(
            """{"in_network":[{"billing_code":"1"}],"provider_references":[{"provider_group_id":7}]}""".byteInputStream(),
            recorder,
        )
        assertEquals(1, recorder.items.size)
        assertEquals(7, recorder.providerReferences.single()["provider_group_id"].asInt())
    }

    @Test
    fun `a truncated file fails with a parse error instead of loading half the data silently`() {
        val text = Fixtures.rateFileText()
        assertFailsWith<JsonProcessingException> {
            InNetworkStreamParser().parse(text.take(text.length / 2).byteInputStream(), Recorder())
        }
    }

    @Test
    fun `decimals keep the text the file used`() {
        val recorder = Recorder()
        InNetworkStreamParser().parse(
            """{"in_network":[{"negotiated_rates":[{"negotiated_prices":[{"negotiated_rate":539.40}]}]}]}""".byteInputStream(),
            recorder,
        )
        val price = recorder.items.single().second["negotiated_rates"][0]["negotiated_prices"][0]
        assertEquals("""{"negotiated_rate":539.40}""", price.toString())
    }

    @Test
    fun `an object with no in_network list is rejected, but an empty list is a file with no rates`() {
        assertFailsWith<RateFileFormatException> {
            InNetworkStreamParser().parse("{}".byteInputStream(), Recorder())
        }
        assertFailsWith<RateFileFormatException> {
            InNetworkStreamParser().parse("""{"reporting_entity_name":"x","in_network":"none"}""".byteInputStream(), Recorder())
        }

        val recorder = Recorder()
        InNetworkStreamParser().parse("""{"in_network":[]}""".byteInputStream(), recorder)
        assertEquals(0, recorder.items.size)
    }

    @Test
    fun `a document that is not an object is rejected`() {
        assertFailsWith<RateFileFormatException> {
            InNetworkStreamParser().parse("[1, 2, 3]".byteInputStream(), Recorder())
        }
    }
}

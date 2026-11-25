package explorer

import java.net.URI
import java.nio.file.Files
import java.nio.file.Path

/**
 * A small, made-up rate file in the real file's shape. It packs in the cases the real
 * data taught us to handle: a price repeated under two revenue-code items, an NPI of 0,
 * one tax ID spelled two ways, a rate with inline provider groups, a remote provider
 * reference, an item with no code, a rate with no providers, and header fields that
 * come after the arrays.
 */
object Fixtures {
    val indexUrl: URI = resource("fixtures/index.json")
    val rateFileUrl: URI = resource("fixtures/in-network.json")

    fun rateFileText(): String = Files.readString(Path.of(rateFileUrl))

    /**
     * Copies the index next to a rate file cut off mid-document, the way an interrupted
     * download would leave it. Returns the copied index's URL.
     */
    fun indexWithTruncatedRateFile(directory: Path): URI {
        val text = rateFileText()
        Files.writeString(directory.resolve("in-network.json"), text.take(text.length / 2))
        return Files.copy(Path.of(indexUrl), directory.resolve("index.json")).toUri()
    }

    private fun resource(name: String): URI =
        requireNotNull(Fixtures::class.java.classLoader.getResource(name)) { "Missing test resource $name" }.toURI()
}

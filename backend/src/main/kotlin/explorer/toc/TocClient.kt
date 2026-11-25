package explorer.toc

import com.fasterxml.jackson.core.JsonProcessingException
import explorer.ingest.Fetcher
import explorer.json.Json
import java.net.URI

class IndexFormatException(
    message: String,
    cause: Throwable,
) : RuntimeException(message, cause)

/** The index could not be fetched at all, so there is no rate file to look for. */
class IndexUnavailableException(
    message: String,
    cause: Throwable,
) : RuntimeException(message, cause)

/** Downloads and parses the index file. It is small (tens of kilobytes), so it is read whole. */
class TocClient(
    private val fetcher: Fetcher,
) {
    fun fetch(indexUrl: URI): TableOfContents =
        fetcher.open(indexUrl).stream.use { stream ->
            try {
                Json.cms.readValue(stream, TableOfContents::class.java)
            } catch (e: JsonProcessingException) {
                throw IndexFormatException("The index file is not valid JSON: ${e.originalMessage}", e)
            }
        }
}

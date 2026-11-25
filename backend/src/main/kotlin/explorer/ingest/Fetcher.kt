package explorer.ingest

import java.io.IOException
import java.io.InputStream
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration

/** A fetch that failed in a way worth showing to the person running the app. */
class FetchException(
    message: String,
    cause: Throwable? = null,
) : IOException(message, cause)

class Fetched(
    val stream: InputStream,
    val contentLength: Long?,
)

/**
 * Reads http(s) and file URLs. File URLs let tests, CI and offline demos point the app
 * at local fixtures with no network.
 */
class Fetcher(
    private val client: HttpClient =
        HttpClient
            .newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(20))
            .build(),
) {
    fun open(uri: URI): Fetched {
        if (uri.scheme == "file") {
            val path = Path.of(uri)
            if (!Files.isReadable(path)) throw FetchException("Cannot read $path")
            return Fetched(Files.newInputStream(path), Files.size(path))
        }
        val response = send(request(uri).GET().build(), HttpResponse.BodyHandlers.ofInputStream())
        if (response.statusCode() != 200) {
            response.body().close()
            throw FetchException("The server answered ${response.statusCode()} for $uri")
        }
        return Fetched(response.body(), response.contentLength())
    }

    /** Size of the resource if the server will say, without downloading it. */
    fun contentLength(uri: URI): Long? {
        if (uri.scheme == "file") return Path.of(uri).takeIf(Files::isReadable)?.let(Files::size)
        return try {
            val response =
                send(request(uri).method("HEAD", HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.discarding())
            if (response.statusCode() == 200) response.contentLength() else null
        } catch (_: FetchException) {
            null
        }
    }

    private fun request(uri: URI): HttpRequest.Builder =
        HttpRequest
            .newBuilder(uri)
            .timeout(Duration.ofMinutes(10))
            .header("User-Agent", "Mozilla/5.0 (compatible; rate-explorer)")
            .header("Accept", "application/json, */*")

    private fun <T> send(
        request: HttpRequest,
        handler: HttpResponse.BodyHandler<T>,
    ): HttpResponse<T> =
        try {
            client.send(request, handler)
        } catch (e: IOException) {
            throw FetchException("Could not reach ${request.uri().host}: ${e.message ?: e.javaClass.simpleName}", e)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            throw FetchException("Interrupted while fetching ${request.uri()}", e)
        }

    private fun <T> HttpResponse<T>.contentLength(): Long? =
        headers().firstValueAsLong("Content-Length").let { if (it.isPresent && it.asLong >= 0) it.asLong else null }
}

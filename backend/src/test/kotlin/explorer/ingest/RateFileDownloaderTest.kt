package explorer.ingest

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The download path against a real local HTTP server, including the ways a download goes wrong. */
class RateFileDownloaderTest {
    private lateinit var server: HttpServer
    private lateinit var cacheDir: Path
    private val requests = CopyOnWriteArrayList<String>()
    private var body = ByteArray(200_000) { (it % 251).toByte() }

    /** What the server does with a GET. Tests replace it to misbehave. */
    private var onGet: (HttpExchange) -> Unit = { exchange ->
        exchange.sendResponseHeaders(200, body.size.toLong())
        exchange.responseBody.use { it.write(body) }
    }

    @BeforeTest
    fun start() {
        cacheDir = Files.createTempDirectory("downloader-test")
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/rates.json") { exchange ->
            requests += exchange.requestMethod
            if (exchange.requestMethod == "HEAD") {
                exchange.responseHeaders.add("Content-Length", body.size.toString())
                exchange.sendResponseHeaders(200, -1)
                exchange.close()
            } else {
                runCatching { onGet(exchange) }
                exchange.close()
            }
        }
        server.executor =
            java.util.concurrent.Executors
                .newCachedThreadPool { Thread(it).apply { isDaemon = true } }
        server.start()
    }

    @AfterTest
    fun stop() = server.stop(0)

    private val url: URI get() = URI.create("http://127.0.0.1:${server.address.port}/rates.json")

    private fun downloader(stallTimeout: Duration = Duration.ofSeconds(30)) = RateFileDownloader(Fetcher(), cacheDir, stallTimeout)

    @Test
    fun `downloads the file, reports progress, and reuses the copy next time`() {
        val progress = mutableListOf<Pair<Long, Long?>>()

        val path = downloader().fetch(url) { done, total -> progress += done to total }

        assertContentEquals(body, Files.readAllBytes(path))
        assertEquals(body.size.toLong() to body.size.toLong(), progress.last())
        assertFalse(Files.exists(path.resolveSibling("rates.json.part")), "the partial file is gone once the download completes")

        // A second fetch asks only for the size, sees it matches, and does not download again.
        downloader().fetch(url) { _, _ -> }
        assertEquals(1, requests.count { it == "GET" })
    }

    @Test
    fun `a cached copy of the wrong size is replaced`() {
        downloader().fetch(url) { _, _ -> }
        body = ByteArray(1_000) { 7 }

        val path = downloader().fetch(url) { _, _ -> }

        assertEquals(1_000, Files.size(path))
        assertEquals(2, requests.count { it == "GET" })
    }

    @Test
    fun `a missing file says which status the server gave`() {
        onGet = { exchange -> exchange.sendResponseHeaders(404, -1) }

        val error = assertFailsWith<FetchException> { downloader().fetch(url) { _, _ -> } }

        assertContains(error.message.orEmpty(), "404")
    }

    @Test
    fun `a download that ends early is an error and leaves no file behind`() {
        onGet = { exchange ->
            exchange.sendResponseHeaders(200, body.size.toLong())
            exchange.responseBody.write(body, 0, 10_000)
            exchange.responseBody.flush()
            // Closing without the promised bytes is what a dropped connection looks like.
        }

        assertFailsWith<FetchException> { downloader().fetch(url) { _, _ -> } }

        assertTrue(Files.list(cacheDir).use { it.toList() }.isEmpty(), "nothing partial is kept")
    }

    @Test
    fun `a connection that goes quiet is abandoned instead of hanging`() {
        onGet = { exchange ->
            exchange.sendResponseHeaders(200, body.size.toLong())
            exchange.responseBody.write(body, 0, 10_000)
            exchange.responseBody.flush()
            Thread.sleep(5_000)
        }
        val started = System.nanoTime()

        val error = assertFailsWith<FetchException> { downloader(Duration.ofMillis(300)).fetch(url) { _, _ -> } }

        assertContains(error.message.orEmpty(), "stalled")
        assertTrue(Duration.ofNanos(System.nanoTime() - started) < Duration.ofSeconds(3), "gave up well before the server did")
        assertTrue(Files.list(cacheDir).use { it.toList() }.isEmpty(), "nothing partial is kept")
    }
}

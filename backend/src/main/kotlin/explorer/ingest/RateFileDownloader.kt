package explorer.ingest

import org.slf4j.LoggerFactory
import java.io.IOException
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.time.Duration
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Gets the rate file onto local disk. Rate files run from tens of megabytes to gigabytes,
 * so the download is streamed, and a complete cached copy is reused across restarts.
 */
class RateFileDownloader(
    private val fetcher: Fetcher,
    private val cacheDir: Path,
    /** How long the connection may deliver nothing before the download is abandoned. */
    private val stallTimeout: Duration = Duration.ofSeconds(60),
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun fetch(
        uri: URI,
        onProgress: (bytes: Long, total: Long?) -> Unit,
    ): Path {
        if (uri.scheme == "file") {
            val path = Path.of(uri)
            if (!Files.isReadable(path)) throw FetchException("Cannot read $path")
            return path
        }

        Files.createDirectories(cacheDir)
        val target = cacheDir.resolve(cacheName(uri))
        val remoteSize = fetcher.contentLength(uri)

        if (Files.isRegularFile(target)) {
            val localSize = Files.size(target)
            // Without a size from the server the copy cannot be checked, so it is trusted.
            if (remoteSize == null || remoteSize == localSize) {
                log.info("Using cached rate file {} ({} bytes)", target, localSize)
                onProgress(localSize, localSize)
                return target
            }
            log.info("Cached rate file is {} bytes but the server reports {}; downloading again", localSize, remoteSize)
        }

        val partial = target.resolveSibling("${target.fileName}.part")
        val fetched = fetcher.open(uri)
        val total = fetched.contentLength ?: remoteSize
        val written = copyWithStallGuard(fetched, partial, uri) { done -> onProgress(done, total) }

        if (total != null && written != total) {
            Files.deleteIfExists(partial)
            throw FetchException("The download stopped early: received $written of $total bytes from $uri")
        }
        Files.move(partial, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        log.info("Downloaded rate file to {} ({} bytes)", target, written)
        return target
    }

    /**
     * Copies the response body to disk. The HTTP client's own timeout stops once headers
     * arrive, so a connection that then goes quiet would block forever; a watchdog closes
     * the stream when no bytes have arrived for [stallTimeout].
     */
    private fun copyWithStallGuard(
        fetched: Fetched,
        partial: Path,
        uri: URI,
        onProgress: (Long) -> Unit,
    ): Long {
        val lastByteAt = AtomicLong(System.nanoTime())
        val stalled = AtomicBoolean(false)
        val watchdog = Executors.newSingleThreadScheduledExecutor { task -> Thread(task, "download-watchdog").apply { isDaemon = true } }
        val interval = (stallTimeout.toMillis() / 4).coerceAtLeast(25)
        watchdog.scheduleAtFixedRate(
            {
                if (System.nanoTime() - lastByteAt.get() > stallTimeout.toNanos()) {
                    stalled.set(true)
                    runCatching { fetched.stream.close() }
                }
            },
            interval,
            interval,
            TimeUnit.MILLISECONDS,
        )

        var written = 0L
        try {
            fetched.stream.use { input ->
                Files.newOutputStream(partial).use { output ->
                    val buffer = ByteArray(1 shl 16)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        written += read
                        lastByteAt.set(System.nanoTime())
                        onProgress(written)
                    }
                }
            }
        } catch (e: IOException) {
            Files.deleteIfExists(partial)
            if (stalled.get()) throw stalledDownload(uri, written)
            throw FetchException("The download from ${uri.host} broke off after $written bytes: ${e.message ?: e.javaClass.simpleName}", e)
        } finally {
            watchdog.shutdownNow()
        }
        // Closing the stream can also surface as a normal end of data rather than an error.
        if (stalled.get()) {
            Files.deleteIfExists(partial)
            throw stalledDownload(uri, written)
        }
        return written
    }

    private fun stalledDownload(
        uri: URI,
        written: Long,
    ) = FetchException("The download from ${uri.host} stalled: no data for ${stallTimeout.toSeconds()} seconds after $written bytes.")

    private fun cacheName(uri: URI): String =
        uri.path
            .substringAfterLast('/')
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
            .ifEmpty { "rate-file.json" }
}

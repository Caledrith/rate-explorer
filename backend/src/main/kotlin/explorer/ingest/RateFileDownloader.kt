package explorer.ingest

import org.slf4j.LoggerFactory
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

/**
 * Gets the rate file onto local disk. Rate files run from tens of megabytes to gigabytes,
 * so the download is streamed, and a complete cached copy is reused across restarts.
 */
class RateFileDownloader(
    private val fetcher: Fetcher,
    private val cacheDir: Path,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun fetch(
        uri: URI,
        onProgress: (bytes: Long, total: Long?) -> Unit,
    ): Path {
        if (uri.scheme == "file") return Path.of(uri)

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
        var written = 0L
        fetched.stream.use { input ->
            Files.newOutputStream(partial).use { output ->
                val buffer = ByteArray(1 shl 16)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    output.write(buffer, 0, read)
                    written += read
                    onProgress(written, total)
                }
            }
        }
        if (total != null && written != total) {
            Files.deleteIfExists(partial)
            throw FetchException("The download stopped early: received $written of $total bytes from $uri")
        }
        Files.move(partial, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        log.info("Downloaded rate file to {} ({} bytes)", target, written)
        return target
    }

    private fun cacheName(uri: URI): String =
        uri.path
            .substringAfterLast('/')
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
            .ifEmpty { "rate-file.json" }
}

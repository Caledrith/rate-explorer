package explorer.api

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import org.slf4j.LoggerFactory
import kotlin.coroutines.cancellation.CancellationException
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** What reaches the log and the client when a request ends in an exception. */
class HttpTest {
    private val logger = LoggerFactory.getLogger("explorer.api") as Logger
    private val logged = ListAppender<ILoggingEvent>()

    @BeforeTest
    fun captureLog() {
        logged.start()
        logger.addAppender(logged)
    }

    @AfterTest
    fun releaseLog() {
        logger.detachAppender(logged)
    }

    private fun errors() = logged.list.filter { it.level == Level.ERROR }

    @Test
    fun `a request the client gave up on is not logged as a server error`() =
        testApplication {
            application {
                installHttp()
                // What Ktor raises when the answer is written after the browser dropped the request.
                routing { get("/gone") { throw CancellationException("Response was cancelled") } }
            }

            // The test client is still listening, unlike the browser in the real case, and
            // gets the engine's fallback answer. What matters is what this app logs.
            client.get("/gone")

            assertTrue(errors().isEmpty(), "nothing went wrong, so nothing is logged as an error: ${errors()}")
        }

    @Test
    fun `an unexpected failure is logged once and answered without internals`() =
        testApplication {
            application {
                installHttp()
                routing { get("/broken") { error("connection string: secret") } }
            }

            val response = client.get("/broken")

            assertEquals(HttpStatusCode.InternalServerError, response.status)
            assertEquals("""{"message":"The server hit an unexpected error.","fields":[]}""", response.bodyAsText())
            assertEquals(1, errors().size)
        }
}

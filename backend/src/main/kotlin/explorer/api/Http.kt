package explorer.api

import explorer.json.Json
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.jackson.jackson
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.calllogging.CallLogging
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.request.path
import io.ktor.server.response.respond
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import org.slf4j.event.Level

/** One problem with one input field, worded for the person who typed it. */
data class FieldError(
    val field: String,
    val message: String,
)

data class ErrorResponse(
    val message: String,
    val fields: List<FieldError> = emptyList(),
)

class ValidationException(
    val fields: List<FieldError>,
) : RuntimeException(fields.joinToString("; ") { "${it.field}: ${it.message}" })

/** The rate file is not loaded, so there is nothing to search yet. */
class NotReadyException : RuntimeException("The rate file is not loaded yet.")

class NotFoundException(
    message: String,
) : RuntimeException(message)

/** JDBC blocks, so database work runs off the request event loop. */
suspend fun <T> blocking(block: () -> T): T = withContext(Dispatchers.IO) { block() }

fun Application.installHttp() {
    val log = LoggerFactory.getLogger("explorer.api")

    install(ContentNegotiation) {
        jackson { Json.configureApi(this) }
    }
    install(CallLogging) {
        level = Level.INFO
        filter { call -> call.request.path().startsWith("/api") && call.request.path() != "/api/status" }
    }
    install(StatusPages) {
        exception<ValidationException> { call, cause ->
            call.respond(HttpStatusCode.BadRequest, ErrorResponse("Some inputs need fixing.", cause.fields))
        }
        exception<NotReadyException> { call, cause ->
            call.respond(HttpStatusCode.ServiceUnavailable, ErrorResponse(cause.message ?: "Not ready."))
        }
        exception<NotFoundException> { call, cause ->
            call.respond(HttpStatusCode.NotFound, ErrorResponse(cause.message ?: "Not found."))
        }
        // Anything unexpected is logged in full and answered without internals.
        exception<Throwable> { call, cause ->
            log.error("Unhandled error on {}", call.request.path(), cause)
            call.respond(HttpStatusCode.InternalServerError, ErrorResponse("The server hit an unexpected error."))
        }
    }
}

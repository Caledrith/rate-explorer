package explorer.api

import explorer.ingest.IngestState
import explorer.ingest.IngestionService
import explorer.source.SourceFileInfo
import explorer.source.SourceFileRepository
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post

data class StatusError(
    val kind: String,
    val message: String,
)

/** What the UI needs to choose between its loading, failed and ready screens. */
data class StatusResponse(
    val state: String,
    val phase: String? = null,
    val bytesDone: Long? = null,
    val bytesTotal: Long? = null,
    val fileName: String? = null,
    val error: StatusError? = null,
    val warning: String? = null,
    val file: SourceFileInfo? = null,
)

fun Route.statusRoutes(
    ingestion: IngestionService,
    sourceFiles: SourceFileRepository,
) {
    get("/api/status") {
        val response =
            when (val state = ingestion.state()) {
                IngestState.Idle -> StatusResponse(state = "loading", phase = "starting")
                is IngestState.Loading ->
                    StatusResponse(
                        state = "loading",
                        phase = state.phase.name.lowercase(),
                        bytesDone = state.bytesDone,
                        bytesTotal = state.bytesTotal,
                        fileName = state.fileName,
                    )
                is IngestState.Failed ->
                    StatusResponse(
                        state = "failed",
                        fileName = state.fileName,
                        error = StatusError(state.kind.name.lowercase(), state.message),
                    )
                is IngestState.Ready ->
                    StatusResponse(
                        state = "ready",
                        warning = state.warning,
                        file = blocking { sourceFiles.find(state.sourceFileId) },
                    )
            }
        call.respond(response)
    }

    // Retries the load after a failure, or refreshes the data on request.
    post("/api/reload") {
        val started = ingestion.startAsync(force = true)
        call.respond(HttpStatusCode.Accepted, mapOf("started" to started))
    }
}

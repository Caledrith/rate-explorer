package explorer

import explorer.api.installHttp
import explorer.api.searchRoutes
import explorer.api.statusRoutes
import explorer.config.AppConfig
import explorer.db.Database
import explorer.ingest.IngestionService
import explorer.search.SearchRepository
import explorer.search.SearchService
import explorer.source.SourceFileRepository
import io.ktor.server.application.Application
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing

/** The long-lived objects the routes depend on, built once at startup. */
class AppServices(
    val database: Database,
    val ingestion: IngestionService,
) {
    val sourceFiles = SourceFileRepository(database.jdbi)
    val search = SearchService(SearchRepository(database.jdbi))
}

fun main() {
    val config = AppConfig.fromEnv()
    val database = Database(config.db)
    database.migrate()

    val services = AppServices(database, IngestionService(config, database))
    // The server answers immediately; the rate file loads in the background and
    // /api/status reports progress, success or failure.
    services.ingestion.startAsync()

    embeddedServer(Netty, port = config.port, host = "0.0.0.0") { module(services) }.start(wait = true)
}

fun Application.module(services: AppServices) {
    baseModule()
    routing {
        statusRoutes(services.ingestion, services.sourceFiles)
        searchRoutes(services.search)
    }
}

/** Plugins and the health check, which need no database. */
fun Application.baseModule() {
    installHttp()
    routing {
        get("/healthz") { call.respondText("ok") }
    }
}

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
import org.slf4j.LoggerFactory
import java.net.ConnectException
import java.sql.SQLException
import java.sql.SQLTransientConnectionException

/** The long-lived objects the routes depend on, built once at startup. */
class AppServices(
    val database: Database,
    val ingestion: IngestionService,
) {
    val sourceFiles = SourceFileRepository(database.jdbi)
    val search = SearchService(SearchRepository(database.jdbi), ingestion::activeFileUrl)
}

fun main() {
    val config = AppConfig.fromEnv()
    val database = Database(config.db)
    migrateOnceDatabaseIsUp(database)

    val services = AppServices(database, IngestionService(config, database))
    // The server answers immediately; the rate file loads in the background and
    // /api/status reports progress, success or failure.
    services.ingestion.startAsync()

    embeddedServer(Netty, port = config.port, host = "0.0.0.0") { module(services) }.start(wait = true)
}

/**
 * Applies migrations, waiting up to half a minute for Postgres to accept connections.
 * Only "cannot connect yet" is retried; a real migration error fails straight away.
 */
private fun migrateOnceDatabaseIsUp(database: Database) {
    val log = LoggerFactory.getLogger("explorer.Application")
    val attempts = 30
    repeat(attempts) { attempt ->
        try {
            database.migrate()
            return
        } catch (e: Exception) {
            if (attempt == attempts - 1 || !isConnectionProblem(e)) throw e
            log.info("Waiting for the database ({})", e.message?.lineSequence()?.firstOrNull())
            Thread.sleep(1_000)
        }
    }
}

private fun isConnectionProblem(error: Throwable): Boolean =
    generateSequence(error) { it.cause }.any { cause ->
        cause is ConnectException ||
            cause is SQLTransientConnectionException ||
            // 08xxx: connection exceptions. 57P03: the server is still starting up.
            (cause is SQLException && (cause.sqlState?.startsWith("08") == true || cause.sqlState == "57P03"))
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

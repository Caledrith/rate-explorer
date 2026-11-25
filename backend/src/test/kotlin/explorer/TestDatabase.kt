package explorer

import explorer.config.AppConfig
import explorer.config.DbConfig
import explorer.db.Database
import org.testcontainers.postgresql.PostgreSQLContainer
import java.net.URI
import java.nio.file.Files

/**
 * One real Postgres for the whole test run, started on first use through Testcontainers.
 * The queries lean on Postgres features (COPY, percentile_cont, arrays), so tests run
 * against the same database engine and version as the app.
 */
object TestDatabase {
    private val container: PostgreSQLContainer by lazy {
        PostgreSQLContainer("postgres:18-alpine").apply { start() }
    }

    private val dbConfig: DbConfig
        get() = DbConfig(container.jdbcUrl, container.username, container.password)

    /** A migrated database with no rate files loaded. Test classes run one after another, so each starts clean. */
    fun fresh(): Database =
        Database(dbConfig).also { database ->
            database.migrate()
            database.jdbi.useHandle<Exception> { handle ->
                handle.execute("truncate source_file cascade")
            }
        }

    fun config(indexUrl: URI): AppConfig =
        AppConfig(
            port = 0,
            db = dbConfig,
            indexUrl = indexUrl.toString(),
            planNameContains = "Example Care",
            cacheDir = Files.createTempDirectory("rate-cache"),
        )
}

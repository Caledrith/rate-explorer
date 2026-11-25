package explorer.db

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import explorer.config.DbConfig
import org.flywaydb.core.Flyway
import org.jdbi.v3.core.Jdbi
import org.jdbi.v3.core.kotlin.KotlinPlugin
import org.jdbi.v3.postgres.PostgresPlugin
import javax.sql.DataSource

/** Owns the connection pool. Create once at startup and close on shutdown. */
class Database(
    config: DbConfig,
) : AutoCloseable {
    private val pool =
        HikariDataSource(
            HikariConfig().apply {
                jdbcUrl = config.url
                username = config.user
                password = config.password
                maximumPoolSize = 8
                poolName = "rates"
            },
        )

    val dataSource: DataSource get() = pool

    val jdbi: Jdbi =
        Jdbi
            .create(pool)
            .installPlugin(KotlinPlugin())
            .installPlugin(PostgresPlugin())

    /** Applies any schema migrations that have not run yet. */
    fun migrate() {
        Flyway
            .configure()
            .dataSource(pool)
            .locations("classpath:db/migration")
            .load()
            .migrate()
    }

    override fun close() = pool.close()
}

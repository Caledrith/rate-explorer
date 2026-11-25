package explorer.config

import java.nio.file.Path

data class DbConfig(
    val url: String,
    val user: String,
    val password: String,
)

/**
 * Everything the app reads from its environment. Blank values count as unset, so an
 * empty entry in a compose file falls back to the default.
 */
data class AppConfig(
    val port: Int,
    val db: DbConfig,
    val indexUrl: String,
    val planNameContains: String,
    val cacheDir: Path,
) {
    companion object {
        /** The Transparency in Coverage index named in the assignment. */
        const val DEFAULT_INDEX_URL =
            "https://www.centene.com/content/dam/centene/Centene%20Corporate/json/DOCUMENT/2026-08-31_fidelis_index.json"

        /** Selects the Ambetter reporting structure, whose in-network file is the smaller of the two. */
        const val DEFAULT_PLAN_NAME_CONTAINS = "Ambetter"

        fun fromEnv(env: Map<String, String> = System.getenv()): AppConfig {
            fun value(name: String): String? = env[name]?.trim()?.takeIf { it.isNotEmpty() }

            return AppConfig(
                port = value("PORT")?.toIntOrNull() ?: 8080,
                db =
                    DbConfig(
                        url = value("DB_URL") ?: "jdbc:postgresql://localhost:5544/rates",
                        user = value("DB_USER") ?: "rates",
                        password = value("DB_PASSWORD") ?: "rates",
                    ),
                indexUrl = value("INDEX_URL") ?: DEFAULT_INDEX_URL,
                planNameContains = value("PLAN_NAME_CONTAINS") ?: DEFAULT_PLAN_NAME_CONTAINS,
                cacheDir = Path.of(value("CACHE_DIR") ?: "data/cache"),
            )
        }
    }
}

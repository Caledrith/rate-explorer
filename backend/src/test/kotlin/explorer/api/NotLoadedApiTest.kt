package explorer.api

import explorer.AppServices
import explorer.Fixtures
import explorer.TestDatabase
import explorer.ingest.IngestionService
import explorer.json.Json
import explorer.module
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

/** What the API says while the database is still empty, as it is during the first load. */
class NotLoadedApiTest {
    @Test
    fun `before the first load, status is loading and search is a 503 rather than an empty result`() {
        TestDatabase.fresh().use { database ->
            val services = AppServices(database, IngestionService(TestDatabase.config(Fixtures.indexUrl), database))
            testApplication {
                application { module(services) }

                assertEquals("loading", Json.api.readTree(client.get("/api/status").bodyAsText())["state"].asText())
                assertEquals(HttpStatusCode.ServiceUnavailable, client.get("/api/search?code=99213").status)
                assertEquals(HttpStatusCode.ServiceUnavailable, client.get("/api/codes?prefix=99").status)
            }
        }
    }
}

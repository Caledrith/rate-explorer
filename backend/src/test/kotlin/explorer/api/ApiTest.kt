package explorer.api

import com.fasterxml.jackson.databind.JsonNode
import explorer.AppServices
import explorer.Fixtures
import explorer.TestDatabase
import explorer.db.Database
import explorer.ingest.IngestState
import explorer.ingest.IngestionService
import explorer.json.Json
import explorer.module
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import kotlinx.coroutines.delay
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The HTTP surface: status codes and JSON shapes the frontend relies on. */
class ApiTest {
    companion object {
        private lateinit var database: Database
        private lateinit var loaded: AppServices

        @JvmStatic
        @BeforeAll
        fun load() {
            database = TestDatabase.fresh()
            val config = TestDatabase.config(Fixtures.indexUrl)
            loaded = AppServices(database, IngestionService(config, database).also { it.runNow() })
        }

        @JvmStatic
        @AfterAll
        fun close() = database.close()
    }

    private fun withApp(
        services: AppServices = loaded,
        block: suspend ApplicationTestBuilder.() -> Unit,
    ) = testApplication {
        application { module(services) }
        block()
    }

    private suspend fun HttpResponse.json(): JsonNode = Json.api.readTree(bodyAsText())

    @Test
    fun `status describes the loaded file`() =
        withApp {
            val body = client.get("/api/status").json()

            assertEquals("ready", body["state"].asText())
            assertEquals("in-network.json", body["file"]["fileName"].asText())
            assertEquals("2026-01-15", body["file"]["lastUpdatedOn"].asText())
            assertEquals(4, body["file"]["codeCount"].asInt())
        }

    @Test
    fun `search returns providers with their rates`() =
        withApp {
            val response = client.get("/api/search?code=99213&npi=1111111111")
            val body = response.json()

            assertEquals(HttpStatusCode.OK, response.status)
            assertEquals("99213", body["query"]["code"].asText())
            assertEquals(1, body["summary"]["providers"].asInt())
            assertEquals("Alpha Clinic", body["providers"][0]["name"].asText())
            assertEquals(2, body["providers"][0]["rates"].size())
            assertTrue(body["noResults"].isNull)
        }

    @Test
    fun `invalid input is a 400 that names each field`() =
        withApp {
            val response = client.get("/api/search?code=&npi=18817774")
            val fields = response.json()["fields"].associate { it["field"].asText() to it["message"].asText() }

            assertEquals(HttpStatusCode.BadRequest, response.status)
            assertEquals(
                mapOf("code" to "Enter a billing code.", "npi" to "An NPI has 10 digits. This has 8."),
                fields,
            )
        }

    @Test
    fun `rate detail and its not-found case`() =
        withApp {
            val id = client.get("/api/search?code=99213").json()["providers"][0]["rates"][0]["id"].asText()

            val detail = client.get("/api/rates/$id").json()
            assertEquals("Alpha Clinic", detail["provider"]["name"].asText())
            assertEquals("negotiated", Json.api.readTree(detail["raw"].asText())["negotiated_type"].asText())

            assertEquals(HttpStatusCode.NotFound, client.get("/api/rates/nope").status)
        }

    @Test
    fun `code suggestions`() =
        withApp {
            val codes = client.get("/api/codes?prefix=99&limit=5").json().map { it["code"].asText() }
            assertEquals(listOf("99213", "99214"), codes)
        }

    @Test
    fun `reload is accepted and reports whether it started`() =
        withApp {
            val response = client.post("/api/reload")

            assertEquals(HttpStatusCode.Accepted, response.status)
            assertEquals(true, response.json()["started"].asBoolean())

            // Let the background reload finish so it cannot overlap the next test.
            while (loaded.ingestion.state() is IngestState.Loading) delay(20)
            assertTrue(loaded.ingestion.state() is IngestState.Ready)
        }
}

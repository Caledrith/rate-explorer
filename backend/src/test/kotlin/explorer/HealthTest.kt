package explorer

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

class HealthTest {
    @Test
    fun `healthz answers ok`() =
        testApplication {
            application { baseModule() }
            val response = client.get("/healthz")
            assertEquals(HttpStatusCode.OK, response.status)
            assertEquals("ok", response.bodyAsText())
        }
}

package explorer.api

import explorer.search.SearchService
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

private val SEARCH_PARAMS = listOf("code", "npi", "ein", "name", "class", "sort", "page", "pageSize")

fun Route.searchRoutes(search: SearchService) {
    // Required: code. Optional: npi, ein, name, class, sort, page, pageSize.
    get("/api/search") {
        val params = SEARCH_PARAMS.associateWith { call.request.queryParameters[it] }
        call.respond(blocking { search.search(params) })
    }

    // Everything behind one rate: where it is in the file, why it matched, who it applies to.
    get("/api/rates/{id}") {
        val id = call.parameters["id"].orEmpty()
        call.respond(blocking { search.detail(id) })
    }

    // Codes in the loaded file, for suggestions as the user types.
    get("/api/codes") {
        val prefix = call.request.queryParameters["prefix"]
        val limit = call.request.queryParameters["limit"]?.toIntOrNull()
        call.respond(blocking { search.codes(prefix, limit) })
    }
}

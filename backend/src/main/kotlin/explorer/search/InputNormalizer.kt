package explorer.search

import explorer.api.FieldError
import explorer.api.ValidationException

/**
 * Turns raw query-string values into a [SearchQuery], or throws [ValidationException]
 * with one message per bad field. Messages are written for the person searching and say
 * what to fix. The same rules run in the browser; this is the authority.
 */
object InputNormalizer {
    private val CODE = Regex("^[A-Z0-9]{2,7}$")

    // The schema names professional and institutional, but the filter accepts whatever class the file uses.
    private val CLASS = Regex("^[a-z][a-z_ -]{0,29}$")

    fun parse(params: Map<String, String?>): SearchQuery {
        val errors = mutableListOf<FieldError>()

        val code = params["code"]?.trim()?.uppercase().orEmpty()
        when {
            code.isEmpty() -> errors += FieldError("code", "Enter a billing code.")
            !CODE.matches(code) -> errors += FieldError("code", "A billing code is 2 to 7 letters or digits.")
        }

        val npi = digits(params["npi"], "npi", "An NPI", 10, errors)?.toLong()
        val ein = digits(params["ein"], "ein", "An EIN", 9, errors)

        val billingClass = params["class"]?.trim()?.lowercase()?.takeIf(String::isNotEmpty)
        if (billingClass != null && !CLASS.matches(billingClass)) {
            errors += FieldError("class", "Class is a billing class such as professional or institutional.")
        }

        val sort =
            params["sort"]?.trim()?.takeIf(String::isNotEmpty)?.let { value ->
                Sort.fromParam(value) ?: null.also { errors += FieldError("sort", "Sort is name, rate_asc or rate_desc.") }
            } ?: Sort.NAME

        val page = positiveInt(params["page"], "page", 1, Int.MAX_VALUE, errors)
        val pageSize = positiveInt(params["pageSize"], "pageSize", 25, 100, errors)

        if (errors.isNotEmpty()) throw ValidationException(errors)
        return SearchQuery(code, npi, ein, billingClass, sort, page, pageSize)
    }

    /** Accepts digits with spaces or hyphens between them ("13-1624096") and returns the digits alone. */
    private fun digits(
        raw: String?,
        field: String,
        noun: String,
        length: Int,
        errors: MutableList<FieldError>,
    ): String? {
        val value = raw?.trim()?.takeIf(String::isNotEmpty) ?: return null
        val compact = value.filterNot { it == '-' || it.isWhitespace() }
        return when {
            !compact.all(Char::isDigit) -> null.also { errors += FieldError(field, "$noun has $length digits and no letters.") }
            compact.length != length ->
                null.also { errors += FieldError(field, "$noun has $length digits. This has ${compact.length}.") }
            else -> compact
        }
    }

    private fun positiveInt(
        raw: String?,
        field: String,
        default: Int,
        max: Int,
        errors: MutableList<FieldError>,
    ): Int {
        val value = raw?.trim()?.takeIf(String::isNotEmpty) ?: return default
        val number = value.toIntOrNull()
        return if (number == null || number < 1 || number > max) {
            errors += FieldError(field, "$field is a whole number from 1 to $max.")
            default
        } else {
            number
        }
    }
}

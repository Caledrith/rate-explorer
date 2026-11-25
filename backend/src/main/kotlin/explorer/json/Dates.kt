package explorer.json

import java.time.LocalDate
import java.time.format.DateTimeParseException

/** An ISO date such as 2026-09-02, or null when the text is anything else. */
fun parseIsoDateOrNull(value: String): LocalDate? =
    try {
        LocalDate.parse(value.trim())
    } catch (_: DateTimeParseException) {
        null
    }

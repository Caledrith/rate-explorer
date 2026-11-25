package explorer.json

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.databind.cfg.JsonNodeFeature
import com.fasterxml.jackson.databind.json.JsonMapper
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

object Json {
    /** Reads CMS files, whose keys are snake_case. Tolerates fields this app does not know. */
    val cms: ObjectMapper =
        jacksonObjectMapper()
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)

    /**
     * Reads and writes JSON without changing how numbers are written: decimals are kept as
     * exact decimals with their trailing zeros, so 539.40 stays 539.40. Used wherever a
     * record from the file is shown back to the reader.
     */
    val exact: ObjectMapper =
        JsonMapper
            .builder()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .disable(JsonNodeFeature.STRIP_TRAILING_BIGDECIMAL_ZEROES)
            .build()

    /** Writes API responses in camelCase with ISO dates. */
    fun configureApi(mapper: ObjectMapper): ObjectMapper =
        mapper
            .registerModule(JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)

    val api: ObjectMapper = configureApi(jacksonObjectMapper())
}

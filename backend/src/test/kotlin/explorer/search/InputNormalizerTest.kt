package explorer.search

import explorer.api.ValidationException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class InputNormalizerTest {
    private fun parse(vararg params: Pair<String, String?>) = InputNormalizer.parse(mapOf(*params))

    private fun errors(vararg params: Pair<String, String?>): Map<String, String> =
        assertFailsWith<ValidationException> { parse(*params) }.fields.associate { it.field to it.message }

    @Test
    fun `tidies what people actually type`() {
        val query = parse("code" to " g0438 ", "npi" to " 1881777464 ", "ein" to "13-1624096")

        assertEquals("G0438", query.code)
        assertEquals(1881777464L, query.npi)
        assertEquals("131624096", query.tin)
        assertEquals(Sort.NAME, query.sort)
        assertEquals(1, query.page)
        assertEquals(25, query.pageSize)
    }

    @Test
    fun `blank optional fields are the same as leaving them out`() {
        val query = parse("code" to "99213", "npi" to "  ", "ein" to "", "class" to null)

        assertEquals(null, query.npi)
        assertEquals(null, query.tin)
        assertEquals(null, query.billingClass)
    }

    @Test
    fun `the code is required`() {
        assertEquals(mapOf("code" to "Enter a billing code."), errors("code" to "  "))
        assertEquals(mapOf("code" to "A billing code is 2 to 7 letters or digits."), errors("code" to "99-213"))
    }

    @Test
    fun `identifier messages say how many digits were given`() {
        assertEquals(
            mapOf("npi" to "An NPI has 10 digits. This has 8.", "ein" to "An EIN has 9 digits. This has 7."),
            errors("code" to "99213", "npi" to "18817774", "ein" to "13-37573"),
        )
        assertEquals(mapOf("npi" to "An NPI has 10 digits and no letters."), errors("code" to "99213", "npi" to "18817774ab"))
    }

    @Test
    fun `every bad field is reported at once`() {
        val found = errors("code" to "", "npi" to "1", "ein" to "2", "class" to "9!", "sort" to "sideways", "page" to "0")
        assertEquals(setOf("code", "npi", "ein", "class", "sort", "page"), found.keys)
    }

    @Test
    fun `class, sort and paging are read when valid`() {
        val query = parse("code" to "99213", "class" to "Institutional", "sort" to "rate_desc", "page" to "3", "pageSize" to "50")

        assertEquals("institutional", query.billingClass)
        assertEquals(Sort.RATE_DESC, query.sort)
        assertEquals(3, query.page)
        assertEquals(50, query.pageSize)
    }
}

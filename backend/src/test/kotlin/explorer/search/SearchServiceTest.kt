package explorer.search

import java.math.BigDecimal
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SearchServiceTest {
    private fun percent(
        rate: String,
        median: String,
    ) = SearchService.percentDifference(BigDecimal(rate), BigDecimal(median))

    @Test
    fun `percent difference from the median rounds to a whole number`() {
        assertEquals(0, percent("51.45", "51.45"))
        assertEquals(61, percent("82.88", "51.45"))
        assertEquals(124, percent("115.25", "51.45"))
        assertEquals(-2, percent("50.40", "51.45"))
        // 24.502 percent below rounds half-up to 25.
        assertEquals(-25, percent("123.62", "163.74"))
        assertNull(percent("10", "0"))
    }

    @Test
    fun `EINs are shown with their hyphen`() {
        assertEquals("13-1624096", SearchService.tinDisplay("ein", "131624096"))
        assertEquals("1932103413", SearchService.tinDisplay("npi", "1932103413"))
        assertEquals("12345", SearchService.tinDisplay("ein", "12345"))
    }
}

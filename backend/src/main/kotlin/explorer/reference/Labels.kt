package explorer.reference

/**
 * Plain-language labels for the coded values that appear on a rate, so the UI can show
 * words before codes. A code with no entry here is shown as the bare code.
 *
 * Place-of-service names follow the CMS Place of Service Code Set, shortened. Modifier
 * glosses are this project's own short wording, not the AMA's CPT descriptors.
 */
object Labels {
    private val placeOfService =
        mapOf(
            "01" to "Pharmacy",
            "02" to "Telehealth",
            "03" to "School",
            "04" to "Homeless shelter",
            "10" to "Telehealth at home",
            "11" to "Office",
            "12" to "Home",
            "13" to "Assisted living facility",
            "14" to "Group home",
            "15" to "Mobile unit",
            "17" to "Walk-in retail health clinic",
            "19" to "Outpatient hospital, off campus",
            "20" to "Urgent care facility",
            "21" to "Inpatient hospital",
            "22" to "Outpatient hospital",
            "23" to "Emergency room",
            "24" to "Ambulatory surgical center",
            "31" to "Skilled nursing facility",
            "32" to "Nursing facility",
            "41" to "Ambulance, land",
            "49" to "Independent clinic",
            "50" to "Federally qualified health center",
            "53" to "Community mental health center",
            "62" to "Outpatient rehabilitation facility",
            "65" to "Dialysis facility",
            "71" to "Public health clinic",
            "72" to "Rural health clinic",
            "81" to "Independent laboratory",
            "99" to "Other place of service",
        )

    private val modifiers =
        mapOf(
            "25" to "separate same-day visit",
            "26" to "professional component",
            "50" to "both sides",
            "51" to "multiple procedures",
            "52" to "reduced service",
            "59" to "distinct procedure",
            "76" to "repeat procedure, same clinician",
            "90" to "outside laboratory",
            "95" to "live video",
            "GT" to "interactive video",
            "LT" to "left side",
            "RT" to "right side",
            "TC" to "technical component",
            "QW" to "CLIA-waived test",
            "NU" to "new equipment",
            "RR" to "rental equipment",
        )

    fun placeOfService(code: String): String? = placeOfService[code]

    fun modifier(code: String): String? = modifiers[code]
}

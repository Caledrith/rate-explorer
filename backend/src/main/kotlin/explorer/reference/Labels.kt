package explorer.reference

/**
 * Plain-language labels for the coded values that appear on a rate, so the UI can show
 * words before codes. A code with no entry here is shown as the bare code, which is the
 * rule for anything that has not been checked against a source.
 *
 * Place of service: names from the CMS Place of Service Code Set
 * (https://www.cms.gov/medicare/coding-billing/place-of-service-codes/code-sets, table
 * dated May 2, 2024), in sentence case and lightly reordered.
 *
 * Modifiers: this project's own short wording, each checked in November 2026 against the
 * definitions on Noridian's Medicare Part B modifier pages
 * (https://med.noridianmedicare.com/web/jeb/topics/modifiers). They are glosses, not the
 * AMA's CPT descriptors. Modifiers that could not be checked there (GT, TC, QW, NU, RR
 * and others) are deliberately left out.
 */
object Labels {
    private val placeOfService =
        mapOf(
            "01" to "Pharmacy",
            "02" to "Telehealth, not at home",
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
            "22" to "Outpatient hospital, on campus",
            "23" to "Hospital emergency room",
            "24" to "Ambulatory surgical center",
            "31" to "Skilled nursing facility",
            "32" to "Nursing facility",
            "41" to "Ambulance, land",
            "49" to "Independent clinic",
            "50" to "Federally qualified health center",
            "53" to "Community mental health center",
            "62" to "Comprehensive outpatient rehabilitation facility",
            "65" to "End-stage renal disease treatment facility",
            "71" to "Public health clinic",
            "72" to "Rural health clinic",
            "81" to "Independent laboratory",
            "99" to "Other place of service",
        )

    private val modifiers =
        mapOf(
            "25" to "separate E/M, same day",
            "26" to "professional component",
            "33" to "preventive service",
            "50" to "bilateral procedure",
            "51" to "multiple procedures, same session",
            "52" to "reduced service",
            "59" to "distinct procedural service",
            "76" to "repeat procedure, same clinician",
            "90" to "outside laboratory",
            "95" to "real-time audio and video",
            "GC" to "resident under a teaching physician",
            "GN" to "speech-language pathology plan of care",
            "GO" to "occupational therapy plan of care",
            "GP" to "physical therapy plan of care",
            "JW" to "drug amount discarded",
            "LT" to "left side",
            "RT" to "right side",
            "XE" to "separate encounter",
            "XS" to "separate structure",
            "XU" to "unusual non-overlapping service",
        )

    fun placeOfService(code: String): String? = placeOfService[code]

    fun modifier(code: String): String? = modifiers[code]
}

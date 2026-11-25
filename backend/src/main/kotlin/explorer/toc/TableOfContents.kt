package explorer.toc

import com.fasterxml.jackson.annotation.JsonIgnoreProperties

/**
 * The parts of a Transparency in Coverage table-of-contents ("index") file this app uses.
 * Unknown fields are ignored so newer schema versions still load.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class TableOfContents(
    val reportingEntityName: String? = null,
    val reportingEntityType: String? = null,
    val reportingStructure: List<ReportingStructure> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class ReportingStructure(
    val reportingPlans: List<ReportingPlan> = emptyList(),
    val inNetworkFiles: List<FileLocation> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class ReportingPlan(
    val planName: String? = null,
    val planIdType: String? = null,
    val planId: String? = null,
    val planMarketType: String? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class FileLocation(
    val description: String? = null,
    val location: String? = null,
)

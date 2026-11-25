package explorer.toc

import java.net.URI

/** The in-network file chosen from the index, with the context needed to trace it later. */
data class SelectedRateFile(
    val structureIndex: Int,
    val plans: List<ReportingPlan>,
    val planGroupLabel: String?,
    val description: String?,
    val url: URI,
    /** How many in-network files the chosen reporting structure lists. Only the first is loaded. */
    val filesInStructure: Int,
) {
    val fileName: String
        get() = url.path.substringAfterLast('/').ifEmpty { url.toString() }
}

class NoRateFileException(
    message: String,
) : RuntimeException(message)

/**
 * Picks which in-network file to load. The index is the only source of rate-file URLs;
 * configuration only says which reporting structure to prefer.
 */
object RateFileSelector {
    fun select(
        toc: TableOfContents,
        indexUrl: URI,
        planNameContains: String,
    ): SelectedRateFile {
        val candidates =
            toc.reportingStructure.withIndex().filter { (_, structure) ->
                structure.inNetworkFiles.any { !it.location.isNullOrBlank() }
            }
        if (candidates.isEmpty()) {
            throw NoRateFileException("The index does not list any in-network files.")
        }

        val needle = planNameContains.trim()
        val (index, structure) =
            candidates.firstOrNull { (_, structure) ->
                needle.isNotEmpty() &&
                    structure.reportingPlans.any { it.planName?.contains(needle, ignoreCase = true) == true }
            } ?: candidates.first()

        val files = structure.inNetworkFiles.filter { !it.location.isNullOrBlank() }
        val file = files.first()
        return SelectedRateFile(
            structureIndex = index,
            plans = structure.reportingPlans,
            planGroupLabel = planGroupLabel(structure.reportingPlans),
            description = file.description,
            url = resolve(indexUrl, file.location!!),
            filesInStructure = files.size,
        )
    }

    /** Locations are normally absolute, but a relative one resolves against the index. */
    internal fun resolve(
        indexUrl: URI,
        location: String,
    ): URI = indexUrl.resolve(location.trim().replace(" ", "%20"))

    /**
     * A short name for the set of plans: the words every plan name starts with,
     * or the first plan's name when they share nothing useful.
     */
    internal fun planGroupLabel(plans: List<ReportingPlan>): String? {
        val names = plans.mapNotNull { it.planName?.trim()?.takeIf(String::isNotEmpty) }
        if (names.isEmpty()) return null
        if (names.size == 1) return names.single()

        val firstWords = names.first().split(' ')
        val shared =
            firstWords
                .indices
                .takeWhile { i -> names.all { it.split(' ').getOrNull(i) == firstWords[i] } }
                .map { firstWords[it] }
                .joinToString(" ")
                .trimEnd(' ', '-', ',', ':')
        return shared.takeIf { it.length >= 4 } ?: names.first()
    }
}

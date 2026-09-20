// Shapes of the signed bundle (docs/03, packages/query/src/types.ts, apps/ios/Sources/DetroitQuery/Models.swift).
// Decoded by hand from Json: no reflection, no serialization runtime, nothing to strip from the APK.
package org.help313.query

/** HSDS schedule fields, wall-clock in America/Detroit. Dates are YYYY-MM-DD, times HH:MM (24h). */
data class Schedule(
    val freq: String? = null,           // DAILY | WEEKLY | MONTHLY | YEARLY; null = a single date
    val interval: Int? = null,
    val byday: String? = null,          // "MO,WE" or "2TU" or "-1FR"
    val bymonthday: String? = null,     // "1,15"
    val dtstart: String = "",
    val until: String? = null,
    val validFrom: String? = null,
    val validTo: String? = null,
    val opensAt: String = "",
    /** closes_at <= opens_at means the window runs past midnight into the next day. */
    val closesAt: String = "",
    val description: String? = null,
) {
    companion object {
        fun fromJson(j: Json) = Schedule(
            freq = j["freq"]?.str,
            interval = j["interval"]?.int,
            byday = j["byday"]?.str,
            bymonthday = j["bymonthday"]?.str,
            dtstart = j["dtstart"]?.str ?: "",
            until = j["until"]?.str,
            validFrom = j["valid_from"]?.str,
            validTo = j["valid_to"]?.str,
            opensAt = j["opens_at"]?.str ?: "",
            closesAt = j["closes_at"]?.str ?: "",
            description = j["description"]?.str,
        )
    }
}

data class Reports(
    /** Open closed/moved reports (distinct nonces). */
    val closedOpen: Int = 0,
    val closedLastAt: String? = null,
    /** Different phones that said "still open" after the latest closed report (review 18). */
    val openAfterClosed: Int? = null,
    val wrongOpen: Int = 0,
) {
    companion object {
        fun fromJson(j: Json?) = Reports(
            closedOpen = j?.get("closed_open")?.int ?: 0,
            closedLastAt = j?.get("closed_last_at")?.str,
            openAfterClosed = j?.get("open_after_closed")?.int,
            wrongOpen = j?.get("wrong_open")?.int ?: 0,
        )
    }
}

data class Source(val type: String = "", val name: String = "", val url: String? = null, val lastEdited: String? = null) {
    companion object {
        fun fromJson(j: Json?) = Source(
            type = j?.get("type")?.str ?: "",
            name = j?.get("name")?.str ?: "",
            url = j?.get("url")?.str,
            lastEdited = j?.get("last_edited")?.str,
        )
    }
}

/** Dated facts. The device turns these into a badge; nothing here is a verdict. */
data class Facts(
    val checkedAtEntry: String? = null,
    val entryMethod: String? = null,
    val lastConfirmedAt: String? = null,
    val lastConfirmMethod: String? = null,
    val reports: Reports = Reports(),
    val source: Source = Source(),
) {
    companion object {
        fun fromJson(j: Json?) = Facts(
            checkedAtEntry = j?.get("checked_at_entry")?.str,
            entryMethod = j?.get("entry_method")?.str,
            lastConfirmedAt = j?.get("last_confirmed_at")?.str,
            lastConfirmMethod = j?.get("last_confirm_method")?.str,
            reports = Reports.fromJson(j?.get("reports")),
            source = Source.fromJson(j?.get("source")),
        )
    }
}

data class Address(val line1: String = "", val city: String = "", val zip: String? = null) {
    companion object {
        fun fromJson(j: Json) = Address(j["line1"]?.str ?: "", j["city"]?.str ?: "", j["zip"]?.str)
    }
}

data class Phone(val number: String, val label: String? = null) {
    companion object {
        fun fromJson(j: Json) = Phone(j["number"]?.str ?: "", j["label"]?.str)
    }
}

data class Archived(val at: String = "", val reason: String = "", val replacementId: String? = null) {
    companion object {
        fun fromJson(j: Json) = Archived(j["at"]?.str ?: "", j["reason"]?.str ?: "", j["replacement_id"]?.str)
    }
}

data class BundleRow(
    val id: String,
    val name: String,
    val org: String = "",
    val category: String = "",
    val what: String = "",
    val eligibility: String? = null,
    val address: Address? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val phones: List<Phone> = emptyList(),
    val website: String? = null,
    val availability: String = "scheduled",   // scheduled | always | call_first | unknown
    /** Hours exactly as the source states them. Shown as-is; never used for open-now. */
    val hoursText: String? = null,
    val notice: String? = null,
    val schedules: List<Schedule> = emptyList(),
    val flags: List<String> = emptyList(),
    val languages: List<String> = emptyList(),
    val status: String = "active",            // active | suspended | archived
    val archived: Archived? = null,
    val facts: Facts = Facts(),
) {
    companion object {
        fun fromJson(j: Json): BundleRow {
            val id = j["id"]?.str ?: ""
            return BundleRow(
                id = id,
                name = j["name"]?.str ?: id,
                org = j["org"]?.str ?: "",
                category = j["category"]?.str ?: "",
                what = j["what"]?.str ?: "",
                eligibility = j["eligibility"]?.str,
                address = j["address"]?.let { Address.fromJson(it) },
                lat = j["lat"]?.num,
                lon = j["lon"]?.num,
                phones = (j["phones"]?.arr ?: emptyList()).map { Phone.fromJson(it) },
                website = j["website"]?.str,
                availability = j["availability"]?.str ?: "scheduled",
                hoursText = j["hours_text"]?.str,
                notice = j["notice"]?.str,
                schedules = (j["schedules"]?.arr ?: emptyList()).map { Schedule.fromJson(it) },
                flags = j.strings("flags"),
                languages = j.strings("languages"),
                status = j["status"]?.str ?: "active",
                archived = j["archived"]?.let { Archived.fromJson(it) },
                facts = Facts.fromJson(j["facts"]),
            )
        }
    }
}

data class AlertAction(val label: String, val tel: String? = null, val url: String? = null)

data class Alert(
    val id: String,
    val kind: String,                 // activation | cancellation | notice
    val category: String? = null,
    val title: String? = null,
    val bodyPlain: String? = null,
    val startsAt: String = "",
    val endsAt: String = "",
    val targets: List<String> = emptyList(),
    val locations: List<String> = emptyList(),
    val actions: List<AlertAction> = emptyList(),
    val status: String = "draft",
) {
    companion object {
        fun fromJson(j: Json) = Alert(
            id = j["id"]?.str ?: "",
            kind = j["kind"]?.str ?: "",
            category = j["category"]?.str,
            title = j["title"]?.str,
            bodyPlain = j["body_plain"]?.str,
            startsAt = j["starts_at"]?.str ?: "",
            endsAt = j["ends_at"]?.str ?: "",
            targets = j.strings("targets"),
            locations = j.strings("locations"),
            actions = (j["actions"]?.arr ?: emptyList()).map {
                AlertAction(it["label"]?.str ?: "", it["tel"]?.str, it["url"]?.str)
            },
            status = j["status"]?.str ?: "draft",
        )
    }
}

data class Segment(
    val id: String,
    val name: String = "",
    val phase: String = "planned",    // open | under_construction | funded | planned
    val typology: String? = null,
    /** Streets this stretch crosses, in order along the path. */
    val crossStreets: List<String> = emptyList(),
    /** One or more polylines of [lon, lat]. */
    val lines: List<List<DoubleArray>> = emptyList(),
) {
    companion object {
        fun fromJson(j: Json) = Segment(
            id = j["id"]?.str ?: "",
            name = j["name"]?.str ?: "",
            phase = j["phase"]?.str ?: "planned",
            typology = j["typology"]?.str,
            crossStreets = j.strings("cross_streets"),
            lines = (j["lines"]?.arr ?: emptyList()).map { line ->
                line.arr.map { pt -> doubleArrayOf(pt.arr[0].num ?: 0.0, pt.arr[1].num ?: 0.0) }
            },
        )
    }
}

data class LatLon(val lat: Double, val lon: Double)

data class Occurrence(
    val date: String,          // local date the window opens
    val opensAt: String,
    val closesAt: String,
    val start: WallMinutes,
    val end: WallMinutes,
)

enum class OpenState { OPEN, CLOSES_SOON, CLOSED, CALL_FIRST, UNKNOWN, NOT_LISTED;
    val wire: String get() = name.lowercase()
}

data class NextTime(val date: String, val opensAt: String, val closesAt: String)

data class OpenResult(
    val state: OpenState,
    /** Wall-clock HH:MM the current window closes (open/closes_soon only). */
    val closesAt: String? = null,
    val minutesLeft: Int? = null,
    /** Meaningful only when state is CLOSED: null there means "no upcoming time". */
    val next: NextTime? = null,
    /** True when a window that would be open right now was cancelled by an alert. */
    val cancelledNow: Boolean = false,
)

data class Badge(
    val level: String,
    /** Key into strings/en.json; the text never lives in code. */
    val key: String,
    val params: Map<String, String>,
    /** 0 is freshest. A sort key only; never shown. */
    val tier: Int,
)

enum class BundleAge { FRESH, AGING, OLD, RETIRED;
    val wire: String get() = name.lowercase()
}

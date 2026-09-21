// "Add a place that helps" (docs/04): what a proposal is, what may be in it, and what its JSON looks like.
//
// No android.* class here, so `:core` compiles it and a plain JVM test runs every rule — which matters, because
// the rules are the privacy ones. **What leaves the phone is what the person typed about the PLACE**: its name,
// the kind of help, its address, its times, its public phone number, a note, and how they know about it. Nothing
// about the person: no account, no device id, no location, no identifier of any kind. A steward checks every
// proposal before it can appear.
//
// The body is a **closed schema**. `api/src/validate.ts` `parseProposal` accepts exactly eight keys and answers
// 400 to a ninth, so [Proposal.toJson] writes exactly those eight and no more, and a test lists them. That is the
// point of a closed schema: a field added to this class by accident is a 400 and not a quiet leak.
//
// The port of apps/web/src/propose.ts, field for field and limit for limit.
package org.help313.app

import org.help313.query.Json

/** How somebody knows about the place. The same four the web offers and the API accepts. */
val HOW_KNOWN: List<String> = listOf("run_it", "volunteer", "went_there", "heard")

/**
 * The kinds of help a person can pick.
 *
 * **There is deliberately no choice for a domestic-violence shelter.** Those addresses must never be collected
 * anywhere in this system (docs/08, CLAUDE.md), the API drops one even if it is sent, and a picker that offered
 * the category would be inviting somebody to type an address that must not exist.
 */
val PROPOSE_CATEGORIES: List<String> = listOf(
    "food", "shelter.emergency", "health", "harm", "utilities", "hygiene", "youth", "rec",
    "jobs", "learn", "treatment", "housing", "legal", "goods",
)

/** The eight keys `POST /v1/proposals` accepts, in the order the API lists them. A ninth is a 400. */
val PROPOSAL_KEYS: List<String> =
    listOf("name", "category", "what", "address", "phone", "schedule_text", "how_known", "notes")

/** The size caps the API enforces. A longer value is a 400 there, so it is cut here rather than refused. */
val PROPOSAL_LIMITS: Map<String, Int> = mapOf(
    "name" to 120, "what" to 280, "address" to 200, "phone" to 40, "schedule_text" to 200, "notes" to 280,
)

/** The four fields a person must fill in. Each has its own sentence (`add.e.<field>`). */
val PROPOSAL_REQUIRED: List<String> = listOf("name", "category", "what", "how_known")

/**
 * One proposal, ready to send. The optional fields are null when they were left blank — **left out of the JSON
 * altogether**, never sent as an empty string, which is what the web does and what keeps the body the smallest
 * true thing.
 */
class Proposal(
    val name: String,
    val category: String,
    val what: String,
    val howKnown: String,
    val address: String? = null,
    val phone: String? = null,
    val scheduleText: String? = null,
    val notes: String? = null,
) {

    /** Exactly [PROPOSAL_KEYS], in that order, with the blank ones left out. Nothing else is ever added. */
    fun toJson(): String {
        val out = StringBuilder("{")
        for (key in PROPOSAL_KEYS) {
            val value = when (key) {
                "name" -> name
                "category" -> category
                "what" -> what
                "how_known" -> howKnown
                "address" -> address
                "phone" -> phone
                "schedule_text" -> scheduleText
                "notes" -> notes
                else -> null
            } ?: continue
            if (out.length > 1) out.append(',')
            out.append(quote(key)).append(':').append(quote(value))
        }
        return out.append('}').toString()
    }

    companion object {

        /** A proposal read back out of the queue file. Null for anything that is not one. */
        fun fromJson(j: Json): Proposal? {
            val name = j["name"]?.str ?: return null
            val category = j["category"]?.str ?: return null
            val what = j["what"]?.str ?: return null
            val how = j["how_known"]?.str ?: return null
            if (!PROPOSE_CATEGORIES.contains(category) || !HOW_KNOWN.contains(how)) return null
            // A key the API would refuse is a file we did not write; the queue is not the place to find out.
            for (key in j.obj.keys) if (!PROPOSAL_KEYS.contains(key)) return null
            return Proposal(
                name = name, category = category, what = what, howKnown = how,
                address = j["address"]?.str, phone = j["phone"]?.str,
                scheduleText = j["schedule_text"]?.str, notes = j["notes"]?.str,
            )
        }

        /** JSON string escaping, written out so this file needs nothing from Android. */
        fun quote(s: String): String {
            val sb = StringBuilder(s.length + 2)
            sb.append('"')
            for (c in s) {
                when {
                    c == '"' -> sb.append("\\\"")
                    c == '\\' -> sb.append("\\\\")
                    c == '\n' -> sb.append("\\n")
                    c == '\r' -> sb.append("\\r")
                    c == '\t' -> sb.append("\\t")
                    // By hand, not String.format: with an Arabic default locale "%04x" can write Arabic-Indic
                    // digits, and this is JSON going to a server, not text for a reader.
                    c < ' ' -> {
                        sb.append("\\u")
                        for (shift in listOf(12, 8, 4, 0)) sb.append("0123456789abcdef"[(c.code shr shift) and 0xf])
                    }
                    else -> sb.append(c)
                }
            }
            return sb.append('"').toString()
        }
    }
}

/** A typed value, trimmed and cut to the API's own cap. Never longer, so a 400 is never earned by length. */
fun proposalField(form: Map<String, String>, key: String): String {
    val raw = (form[key] ?: "").trim()
    val cap = PROPOSAL_LIMITS[key] ?: return raw
    return if (raw.length <= cap) raw else raw.substring(0, cap)
}

/**
 * Which required fields are still missing or not one of the choices, in the order they appear on the screen.
 *
 * The screen turns each one into its own sentence (`add.e.name` and the rest) beside the field it is about, rather
 * than one banner at the top that says nothing about where to look.
 */
fun proposalErrors(form: Map<String, String>): List<String> {
    val out = ArrayList<String>()
    if (proposalField(form, "name").isEmpty()) out += "name"
    if (!PROPOSE_CATEGORIES.contains(form["category"] ?: "")) out += "category"
    if (proposalField(form, "what").isEmpty()) out += "what"
    if (!HOW_KNOWN.contains(form["how_known"] ?: "")) out += "how_known"
    return out
}

/** The proposal a filled-in form makes, or null when [proposalErrors] has anything to say about it. */
fun buildProposal(form: Map<String, String>): Proposal? {
    if (proposalErrors(form).isNotEmpty()) return null
    fun optional(key: String) = proposalField(form, key).takeIf { it.isNotEmpty() }
    return Proposal(
        name = proposalField(form, "name"),
        category = form.getValue("category"),
        what = proposalField(form, "what"),
        howKnown = form.getValue("how_known"),
        address = optional("address"),
        phone = optional("phone"),
        scheduleText = optional("schedule_text"),
        notes = optional("notes"),
    )
}

/**
 * The proposal queue's own rules, exactly [Outbox]'s but for proposals and with the web's own shorter cap: ten,
 * as `outbox('proposals', 10, post)` keeps. A proposal is a longer thing to type than a report and there is no
 * reason to hold fifty of them.
 */
object ProposalOutbox {

    const val MAX_QUEUED = 10

    class Stored(val items: List<Proposal>, val unreadable: Boolean)

    val EMPTY = Stored(emptyList(), unreadable = false)

    /** A file that is not the array of proposals it should be is `unreadable`, and is never guessed at. */
    fun read(text: String?): Stored {
        if (text.isNullOrBlank()) return EMPTY
        val parsed = try {
            Json.parse(text)
        } catch (_: Throwable) {
            return Stored(emptyList(), unreadable = true)
        }
        if (parsed !is Json.Arr) return Stored(emptyList(), unreadable = true)
        val items = ArrayList<Proposal>()
        for (entry in parsed.items) items += Proposal.fromJson(entry) ?: return Stored(emptyList(), unreadable = true)
        return Stored(items, unreadable = false)
    }

    fun write(items: List<Proposal>): String =
        items.takeLast(MAX_QUEUED).joinToString(",", "[", "]") { it.toJson() }

    /** What still did not go, plus anything typed while the flush was on the network. See Outbox.merge. */
    fun merge(tried: List<Proposal>, left: List<Proposal>, current: List<Proposal>): List<Proposal> {
        val outstanding = tried.map { it.toJson() }.toMutableList()
        val added = current.filterNot { outstanding.remove(it.toJson()) }
        return left + added
    }
}

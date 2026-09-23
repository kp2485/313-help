// "What do you need?" (docs/05), mirroring apps/web/src/needs.ts and apps/ios/HelpApp/Help.swift.
// Everything here runs on the device; nothing chosen on these screens is stored or sent.
package org.help313.app

import org.help313.query.Query

/**
 * One way to narrow a need. `first` is emergency numbers shown above that choice's own list: the emergency-room
 * choice leads with 911, even though "I need a doctor" has no numbers of its own (DECISIONS 2026-09-20).
 */
class Refine(val id: String, val query: Query, val first: List<String> = emptyList())

/**
 * A second list, under its own heading, BELOW the need's own list. A crisis screen keeps its hotlines and its
 * crisis places first (docs/05 ordering); the ongoing, non-crisis places come after them rather than being mixed
 * in or hidden behind a tap. Its heading is `also.<need>.<id>`, and its rows are ordinary rows: a `health.support`
 * listing keeps its address, its map and its Save button.
 */
class Also(val id: String, val query: Query)

class Need(
    val id: String,
    /** "now" needs come first, under "Right now", then "This week", then "Work, school, and paperwork".
     *  The same calm styling throughout: urgency is carried by order and wording, not by colour. */
    val group: String,
    /** Emergency numbers (by id in emergency.json) shown BEFORE any list. Principle 8: never ask what you
     *  cannot act on. */
    val first: List<String> = emptyList(),
    /** A link shown above even those numbers: today only 313SafeBeds on the shelter screen (Kyle, 2026-09-20).
     *  The first half is a key into the strings files (`link.<key>.title|body|label`), so the words about someone
     *  else's site are translated like the rest of the app; the second is its address. */
    val firstLink: Pair<String, String>? = null,
    val query: Query? = null,
    /** One list drawn from SEVERAL categories, ranked together by the ordinary rules ("Get somewhere safe now").
     *  `Query` holds one category and `:query` is the shared spec, so a screen that has to mix kinds says so here
     *  and the screen narrows the rows before ranking them. Written after `query`, like `also`, so ParityTest
     *  reads the three files in the same order. */
    val categories: List<String> = emptyList(),
    /** Written after `query` and read after it, in all three apps, so a need's own list is never mistaken for
     *  this one (ParityTest compares both). */
    val also: Also? = null,
    val refine: List<Refine> = emptyList(),
    /** No list at all: 911 and rescue steps only. A bystander must not be sent on an errand (audit A7). */
    val stepsOnly: Boolean = false,
    val sensitive: Boolean = false,
    /** A screen someone may need to get off fast: it offers "Leave this page fast", and it is never in the recents
     *  thumbnail or a screenshot (FLAG_SECURE, applied from the route in MainActivity.render). Exactly the needs
     *  the web app marks `quickExit` in apps/web/src/needs.ts — domestic violence, crisis, treatment, assault. */
    val quickExit: Boolean = false,
    val intro: String? = null,
    val emptyKey: String? = null,
)

val NEEDS: List<Need> = listOf(
    Need("overdose_now", "now", first = listOf("emg_911"), stepsOnly = true, sensitive = true),
    Need(
        "shelter", "now",
        first = listOf("emg_shelter_helpline", "emg_shelter_outwayne"),
        firstLink = "beds.safebeds" to "https://313safebeds.com/",
        refine = listOf(
            Refine("me", Query(category = "shelter.emergency")),
            Refine("kids", Query(category = "shelter.emergency")),
            // Every emergency shelter, with the ones for young people first (DECISIONS 2026-09-19).
            Refine("young", Query(category = "shelter.emergency", prefer = listOf("youth"))),
        ),
    ),
    // DV: hotline and 911 before anything else; rows have no address and never show a distance.
    Need("unsafe", "now", first = listOf("emg_ndvh", "emg_911"), query = Query(category = "shelter.dv"),
        sensitive = true, quickExit = true, intro = "safe.dv_intro"),
    // Crisis first: 988, DWIHN's line, then the crisis places. Under those, the daytime places a person can walk
    // into (health.support), which are ordinary listings with an address (category audit 2026-09-22, K3).
    Need("talk", "now", first = listOf("emg_988", "emg_dwihn_crisis"), query = Query(category = "health.mental"),
        also = Also("support", Query(category = "health.support")),
        sensitive = true, quickExit = true, intro = "talk.intro"),
    // Treatment (DECISIONS 2026-09-19): DWIHN's 24-hour line is the front door for all four cities, then SAMHSA's.
    Need(
        "drugs", "now",
        first = listOf("emg_dwihn_crisis", "emg_dwihn_care_center", "emg_samhsa"),
        quickExit = true,
        intro = "drugs.intro",
        refine = listOf(
            Refine("today", Query(category = "treatment", prefer = listOf("walk_in"))),
            Refine("detox", Query(category = "treatment.detox")),
            Refine("meds", Query(category = "treatment.meds")),
            Refine("stay", Query(category = "treatment.residential")),
            Refine("home", Query(category = "treatment.outpatient")),
            Refine("recovery", Query(category = "treatment.recovery")),
            Refine("supplies", Query(category = "harm.supplies")),
        ),
    ),
    Need("assault", "now", first = listOf("emg_avalon", "emg_voices4", "emg_911"),
        query = Query(category = "assault"), quickExit = true, intro = "assault.intro"),
    // "Get somewhere safe now" (DECISIONS 2026-09-22): a door that is open at 3am with a phone behind it —
    // police stations, fire stations and emergency rooms, in one list ranked by distance. It sits BELOW 911,
    // 988 and the hotlines on the urgent sheet and here: docs/05's ordering is untouched, this is a row under it.
    // It leads with 911 itself, and the screen names no reason: the one line about home (safe_now.home) says
    // nothing about what kind of danger brought a person to it (docs/08).
    Need("safe_now", "now", first = listOf("emg_911"),
        categories = listOf("safe.police", "safe.fire", "health.er"), intro = "safe_now.intro"),
    Need("food", "soon", refine = listOf(
        Refine("today", Query(category = "food.meal", mode = "now")),
        Refine("week", Query(category = "food", mode = "week")),
    )),
    // Emergency rooms and urgent care are their own categories, because neither says it is free or low-cost the
    // way health.clinic does (DECISIONS 2026-09-20). The emergency room comes first and leads with 911; an
    // emergency room is only ever shown as open all day and night where its own page says so.
    Need("doctor", "soon", refine = listOf(
        Refine("er", Query(category = "health.er"), first = listOf("emg_911")),
        Refine("urgent", Query(category = "health.urgent")),
        Refine("doctor", Query(category = "health.clinic")),
        // Detroit Health Department programmes: shots, lead tests, WIC and the wellness centres. Their own
        // category, because they are city programmes rather than a clinic that says it is free (2026-09-20).
        Refine("dhd", Query(category = "health.dhd")),
        Refine("dentist", Query(category = "health.dental")),
        Refine("eyes", Query(category = "health.vision")),
        // Ongoing mental-health support that is not a crisis service: day programmes a person can walk into.
        Refine("support", Query(category = "health.support")),
        // HIV and STI tests and PrEP: a private kind (Kyle, 2026-09-23).
        Refine("tests", Query(category = "health.sexual")),
    )),
    Need("home", "soon", refine = listOf(
        Refine("rent", Query(category = "housing.rent")),
        Refine("own", Query(category = "housing.owner")),
        Refine("repair", Query(category = "housing.repair")),
    )),
    Need("utilities", "soon", query = Query(category = "utilities")),
    Need("day", "soon", query = Query(category = "shelter.day")),
    Need("things", "soon", refine = listOf(
        Refine("clothes", Query(category = "goods.clothes")),
        Refine("baby", Query(category = "goods.baby")),
    )),
    // Every harm-reduction place that stocks naloxone: the whole `harm` top-level, which is `harm.narcan` plus
    // `harm.supplies` (Wayne County's Well Wayne stations and the Life Points outreach), each of which says it
    // gives out Narcan (Kyle, 2026-09-22; audit K1). Ranking unchanged: open now, then distance.
    Need("narcan", "soon", query = Query(category = "harm"), intro = "narcan.intro"),
    // Warming and cooling centres are announced as alerts. Day to day, libraries and recreation centres are the
    // free indoor places.
    Need("hot_cold", "soon", query = Query(category = "rec"), intro = "hotcold.intro", emptyKey = "hotcold.none"),
    // The web app also shows link-outs (unemployment, Lifeline, child-care scholarships) on these screens.
    // Android lists places only, until link-outs are ported. See README.md, "What it does not do yet".
    Need("job", "later", refine = listOf(
        Refine("find", Query(category = "jobs.find")),
        Refine("training", Query(category = "jobs.training")),
        Refine("record", Query(category = "jobs", prefer = listOf("reentry"))),
    )),
    Need("school", "later", refine = listOf(
        Refine("ged", Query(category = "learn.school")),
        Refine("english", Query(category = "learn.english")),
    )),
    Need("legal", "later", query = Query(category = "legal")),
    Need("id", "later", query = Query(category = "ids")),
    Need("money", "later", refine = listOf(
        Refine("taxes", Query(category = "money.tax")),
        Refine("benefits", Query(category = "money.benefits")),
    )),
    // All of `kids`: child care and the free Head Start and pre-K programs (`kids.prek`, 2026-09-23).
    Need("childcare", "later", query = Query(category = "kids")),
    Need("phone", "later", query = Query(category = "connect")),
    Need("rides", "later", query = Query(category = "transport")),
    Need("pets", "later", query = Query(category = "pets")),
    // Help built for one group of people (Kyle, 2026-09-23): one tile for three groups rather than three tiles.
    Need("groups", "later", refine = listOf(
        Refine("seniors", Query(category = "seniors")),
        Refine("veterans", Query(category = "veterans")),
        Refine("disability", Query(category = "disability")),
    )),
)

/** Browse-by-type chips on the Help screen. */
val CATEGORIES: List<Pair<String, Query>> = listOf(
    "food" to Query(category = "food"),
    "shelter" to Query(category = "shelter.emergency"),
    "health" to Query(category = "health"),
    "harm" to Query(category = "harm"),
    "utilities" to Query(category = "utilities"),
    "hygiene" to Query(category = "hygiene"),
    "youth" to Query(category = "youth"),
    "jobs" to Query(category = "jobs"),
    "learn" to Query(category = "learn"),
    "treatment" to Query(category = "treatment"),
    "housing" to Query(category = "housing"),
    "legal" to Query(category = "legal"),
    "ids" to Query(category = "ids"),
    "money" to Query(category = "money"),
    "goods" to Query(category = "goods"),
    "kids" to Query(category = "kids"),
    "connect" to Query(category = "connect"),
    "transport" to Query(category = "transport"),
    "pets" to Query(category = "pets"),
)

/** Domestic violence and mental-health crisis listings: no distance, no map dot, cannot be saved (docs/08, 10-A8). */
private val SENSITIVE = listOf("shelter.dv", "health.mental")

fun isSensitive(category: String): Boolean =
    SENSITIVE.any { category == it || category.startsWith("$it.") }

/**
 * Treatment and help after sexual assault (DECISIONS 2026-09-19), and since 2026-09-23 HIV and STI tests and
 * immigration legal help: never saved and never in history. Unlike the
 * sensitive listings they keep an address and a distance, because people have to get there.
 */
private val PRIVATE = listOf("treatment", "assault", "health.sexual", "legal.immigration")

fun isPrivate(category: String): Boolean =
    isSensitive(category) || PRIVATE.any { category == it || category.startsWith("$it.") }

/** 911 and 988 are hardcoded. No bundle, feed, or server can change them (audit A5). */
val HARDCODED = mapOf("emg_911" to "911", "emg_988" to "988")

/**
 * **Home's six shortcuts, in the order docs/05 names them: Food first** (audit §4.2, M2 and M4).
 *
 * Key and need id together, rather than a filter over [NEEDS], because a filter renders in the declaration order
 * of the list it filters — which is exactly how the iPhone ended up leading with "A place to sleep". It lives here
 * rather than in a screen so `:core` compiles it and ParityTest holds it to the web's six on a plain JDK.
 *
 * Android had **four** of them before 2026-09-22: "Help with drugs or alcohol" and "A job or training" were
 * missing from Home altogether.
 */
val QUICK_NEEDS: List<Pair<String, String>> = listOf(
    "quick.food" to "food",
    "quick.shelter" to "shelter",
    "quick.doctor" to "doctor",
    "quick.drugs" to "drugs",
    "quick.narcan" to "narcan",
    "quick.job" to "job",
)

// The Android app's need screens, held to the web app's list, and its string keys held to strings/en.json.
//
// `apps/web/src/needs.ts` is the source of truth for "What do you need?" (docs/05). This app restates it in
// Kotlin in `Needs.kt`, and the three apps have drifted apart before: Android was written before `health.er`,
// `health.urgent` and `health.dhd` existed. This test reads both files as text and fails when they differ.
//
// It also checks every string key the app asks `L.t` for against `strings/en.json`. Keys were retired on
// 2026-09-20 (`tab.rec`, `tab.transit`), and a missing key puts a raw key on a screen about a shelter bed.
//
// Plain JVM: it reads files in this repository and touches no android.* class, so it runs with
// `./gradlew :app:testDebugUnitTest`. The iPhone app has the same test in Swift
// (apps/ios/Tests/AppParityTests/ParityTests.swift), which is where this one's wording comes from.
package org.help313.app

import org.help313.query.Address
import org.help313.query.BundleRow
import org.help313.query.LatLon
import org.help313.query.Phone
import org.help313.query.Query
import org.help313.query.rank
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ParityTest {

    /** The languages the app registers (L.LANGUAGES), kept here as plain data so this test needs no android.*. */
    private val LANGS = listOf("en", "es", "ar", "bn")

    /** Tests run from `apps/android/app`, so the repository root is three levels up (as in VerifyTest). */
    private val root = File("../../..")

    private fun text(path: String) = File(root, path).readText()

    /**
     * Refinements in the web app that lead only to link-outs, with no list of places. Android has no link-out
     * screens yet (README.md, "What it does and does not do yet"), so it leaves these out. The set is written
     * down here so that a *new* one fails this test until someone decides.
     */
    private val linkOnly = setOf("food.paying", "job.lost")

    // ---- the comparison ------------------------------------------------------------------------------------

    @Test
    fun needsMatchTheWebApp() {
        val web = webNeeds()
        val android = kotlinNeeds()
        assertTrue("could not read apps/web/src/needs.ts", web.isNotEmpty())
        assertEquals("the two apps list different needs, or in a different order", web.map { it.id }, android.map { it.id })
        for ((a, b) in android.zip(web)) {
            assertEquals("the Android \"${a.id}\" need differs from apps/web/src/needs.ts", b.line, a.line)
            assertEquals("the choices under \"${a.id}\" differ", b.refine.map { it.first }, a.refine.map { it.first })
            for ((ra, rb) in a.refine.zip(b.refine)) {
                assertEquals("${a.id} > ${ra.first} differs from apps/web/src/needs.ts", rb.second, ra.second)
            }
        }
    }

    /** Every need and refinement has words in every language. A screen never shows a raw key. */
    @Test
    fun everyNeedHasItsWords() {
        val en = strings("strings/en.json")
        val wanted = ArrayList<String>()
        for (n in NEEDS) {
            wanted += "need.${n.id}"
            n.intro?.let { wanted += it }
            n.emptyKey?.let { wanted += it }
            for (r in n.refine) wanted += "refine.${n.id}.${r.id}"
            // The heading over a need's second list ("Places to go during the day" under the crisis numbers).
            n.also?.let { wanted += "also.${n.id}.${it.id}" }
        }
        for (id in listOf("food", "shelter", "doctor", "narcan")) wanted += "quick.$id"
        for (key in wanted) assertNotNull("strings/en.json has no $key", en[key])
        for (lang in LANGS - "en") {
            val other = strings("strings/$lang.json")
            for (key in wanted) assertNotNull("strings/$lang.json has no $key", other[key])
        }
    }

    /**
     * Every language the app registers has a file with exactly the English keys and the same placeholders, and
     * the app can read it. Arabic and Bengali carry Western digits only, so a number reads as it is dialled
     * (DECISIONS 2026-09-20).
     */
    @Test
    fun everyLanguageIsCompleteAndReadable() {
        val en = strings("strings/en.json")
        val holes = { s: String -> Regex("\\{(\\w+)}").findAll(s).map { it.value }.sorted().joinToString(",") }
        // Strings.kt is read as text: this test runs on a plain JVM and never loads a class that names android.*.
        val declared = File(root, "apps/android/app/src/main/kotlin/org/help313/app/Strings.kt").readText()
        assertTrue("L.LANGUAGES does not list $LANGS", declared.contains("""val LANGUAGES = listOf("en", "es", "ar", "bn")"""))
        for (lang in LANGS - "en") {
            val other = strings("strings/$lang.json")
            assertEquals("strings/$lang.json has different keys", en.keys.sorted(), other.keys.sorted())
            for ((key, value) in en) {
                assertEquals("$lang $key has different placeholders", holes(value), holes(other.getValue(key)))
                for (n in listOf("911", "988", "211")) {
                    if (value.contains(n)) assertTrue("$lang $key lost $n", other.getValue(key).contains(n))
                }
            }
            if (lang == "ar" || lang == "bn") {
                val native = Regex("[\\u0660-\\u0669\\u06F0-\\u06F9\\u09E6-\\u09EF]")
                for ((key, value) in other) assertFalse("$lang $key uses non-Western digits", native.containsMatchIn(value))
            }
        }
    }

    /** Every key the app asks `L.t` for — literal, or built from a number or a known list — exists in English. */
    @Test
    fun everyStringKeyTheAppAsksForExists() {
        val en = strings("strings/en.json")
        val missing = ArrayList<String>()
        for (file in kotlinSources()) {
            for (key in literalKeys(file.readText())) if (!en.containsKey(key)) missing += "${file.name}: $key"
        }
        // The keys the app builds rather than writes out.
        val built = ArrayList<String>()
        for (i in 1..6) built += "od.s$i"
        for (k in listOf("about.p1", "about.independent", "about.p2", "about.p3", "about.data")) built += k
        for (i in 1..5) built += "privacy.phone_$i"
        for (part in listOf("title", "body", "label")) built += "link.beds.safebeds.$part"
        for (id in CATEGORIES.map { it.first }) built += "cat.$id"
        for (kind in LISTING_KINDS) built += "report.kind.$kind"
        // Keys chosen inside an expression (`L.t(if (sent) … else …)`) or read out of a list of keys.
        // The Neighborhoods tab's keys that are built rather than written out (HoodScreens.kt, docs/13).
        for (kind in HOOD_NEAREST) built += "hood.nearest.$kind"
        for (kind in listOf("food", "health", "harm")) built += "hood.kind.$kind"
        for (key in listOf("walk", "bike", "severe")) built += "hood.crash_$key"
        for (key in listOf("snap", "grocery", "bus")) built += "hood.near.$key"
        built += listOf("hood.group_abc", "hood.group_district", "tab.hoods", "tab.hoods_wide")
        // "Add a place that helps": the form's labels, hints, errors and choices (AddScreen.kt).
        for (field in PROPOSAL_KEYS) built += "add.f.$field"
        for (field in PROPOSAL_REQUIRED) built += "add.e.$field"
        for (id in PROPOSE_CATEGORIES) built += "add.cat.$id"
        for (id in HOW_KNOWN) built += "add.how.$id"
        built += listOf("add.sent", "add.queued", "loc.denied", "loc.denied_settings", "hood.nearest_open")
        // Directions (DECISIONS 2026-09-22): the keys DirWords.kt builds from a fact `:query` hands over — a
        // compass word, a turn word — and the ones the cross-street field builds from the end of a street.
        for (b in org.help313.query.BEARINGS) built += "dir.bearing.$b"
        for (turn in DIR_TURNS) built += "dir.turn.$turn"
        for (where in listOf("north", "south", "east", "west")) built += "loc.where_$where"
        built += listOf(
            "tab.home", "tab.help", "search.title", "saved.title", "tabs.label",
            "help.now", "help.soon", "help.later", "results.none",
            "quick.food", "quick.shelter", "quick.doctor", "quick.narcan",
            "report.sent", "report.queued", "about.sig_dev", "about.sig_ok",
            "home.no_data", "home.loading",
            // Chosen inside an `if` in Format.clock, and asked for on a listing that has no street address.
            "clock.am", "clock.pm", "detail.not_found",
        )
        for (key in built) if (!en.containsKey(key)) missing += "built: $key"
        assertEquals("string keys the app asks for that strings/en.json does not have", emptyList<String>(), missing)
    }

    /**
     * Every `dir.*` key the web app's Directions screen uses exists here too, in all four languages, with the same
     * placeholders — because the Android screen is a line-for-line copy of it and a missing key would put a raw
     * string in front of somebody walking somewhere at night.
     *
     * The set is read out of apps/web/src/dirwords.ts, dirscreen.ts and main.ts rather than typed here, so a
     * sentence added to the web and not to Android fails this test instead of quietly going missing.
     */
    @Test
    fun everyDirectionsKeyTheWebUsesIsHereInEveryLanguage() {
        val web = text("apps/web/src/dirwords.ts") + text("apps/web/src/dirscreen.ts") + text("apps/web/src/main.ts")
        val used = Regex("'(dir\\.[a-z_.]+)'").findAll(web).map { it.groupValues[1] }
            // The two keys built from a fact rather than written out; their members are checked below.
            .filter { it != "dir.bearing." && it != "dir.turn." }
            .toSortedSet()
        assertTrue("apps/web/src/dirwords.ts could not be read", used.size > 30)
        for (lang in LANGS) {
            val words = strings("strings/$lang.json")
            for (key in used) assertNotNull("strings/$lang.json has no $key", words[key])
        }
        // The two built families, in full: eight compass words and eight turn words, in every language.
        for (lang in LANGS) {
            val words = strings("strings/$lang.json")
            for (b in org.help313.query.BEARINGS) assertNotNull("strings/$lang.json has no dir.bearing.$b", words["dir.bearing.$b"])
            for (turn in DIR_TURNS) assertNotNull("strings/$lang.json has no dir.turn.$turn", words["dir.turn.$turn"])
        }
    }

    /** The turn words `:query` can produce (Walk.turnWord). A ninth would have no sentence to go in. */
    private val DIR_TURNS = listOf(
        "straight", "slight_left", "left", "sharp_left", "slight_right", "right", "sharp_right", "around",
    )

    /**
     * A trip is never put back after a recreation, and one reached from "Get somewhere safe now" is a private
     * screen: no recents thumbnail, no screenshot, and "Leave this page fast" above it (Route.kt).
     */
    @Test
    fun aTripIsNeverPutBackAfterARecreation() {
        val trip = Route.Directions(42.35, -83.05, "Somewhere")
        val secret = Route.Directions(42.35, -83.05, "Somewhere", secure = true)
        assertFalse("an ordinary trip is not a private screen", Route.isPrivate(trip))
        assertTrue("a trip from the safe-now list is", Route.isPrivate(secret))
        assertTrue(Route.isTraceless(trip))
        assertTrue(Route.isTraceless(secret))
        // Everything before it is public and comes back; the trip itself does not, secure or not.
        assertEquals(listOf<Route>(Route.Home), Route.keepable(listOf(Route.Home, trip)))
        assertEquals(listOf<Route>(Route.Home, Route.Help), Route.keepable(listOf(Route.Home, Route.Help, secret)))
        assertEquals(
            "a stack that is only a trip falls back to Home",
            listOf<Route>(Route.Home), Route.keepable(listOf(trip)),
        )
    }

    /** Keys retired on 2026-09-20, when the web app folded Recreation and Transit into one Map tab. */
    @Test
    fun retiredKeysAreNotAskedForAgain() {
        for (file in kotlinSources()) {
            val body = file.readText()
            for (key in listOf("tab.rec", "tab.transit")) {
                assertFalse("${file.name} asks for the retired key $key", body.contains("\"$key\""))
            }
        }
    }

    // ---- the Neighborhoods tab, panel by panel (docs/13) -------------------------------------------------------

    /**
     * The neighborhood page draws the web's panels, in the web's order, under the web's headings.
     *
     * Both files are read: apps/web/src/hoods.ts for the order a browser draws, HoodScreens.kt for the order this
     * phone draws. The crash panel is a function of its own in the web file and sits ABOVE `hoodPage` in it, so it
     * is expanded at its call site rather than counted where it is written — otherwise a plain scan would put
     * "Safe streets" first, which is not what anybody sees.
     *
     * Two apps, one page: a panel moved, renamed or dropped on the web fails here rather than drifting quietly.
     */
    @Test
    fun theNeighborhoodPageHasTheWebsPanelsInTheWebsOrder() {
        val web = text("apps/web/src/hoods.ts")
        // The Conditions and Safe-streets panels are functions of their own since 2026-09-22 (the Conditions
        // panel grew charts and a glance row), so each one's body is spliced in where `hoodPage` calls it.
        val cond = web.substringAfter("export function conditionsPanel").substringBefore("\nfunction crashYears")
        val crash = web.substringAfter("export function crashPanel").substringBefore("\nexport ")
        // `hoodPage`'s OWN body, and nothing after it. Since 2026-09-22 the same file also holds `cityPage`,
        // which reuses several of these headings for the four city pages — and this phone has no city page yet
        // (docs/13, "The four cities"). Reading to the end of the file would add the city page's panels to the
        // neighborhood page's and compare the sum against one screen. The next top-level `export` is where the
        // function ends, so the bound is structure rather than a guess at a comment. The crash panel is spliced
        // in afterwards, because the text being spliced carries exports of its own.
        val hoodBody = web.substringAfter("export function hoodPage").substringBefore("\nexport ")
        val page = hoodBody.replace("\${conditionsPanel(h, d, ui, view, off)}", cond).replace("\${crashPanel(h, d, ui, view, off)}", crash)
        fun keysAfter(marker: String, body: String) =
            Regex(Regex.escape(marker) + "\\$\\{T\\('(hood\\.[a-z_.]+)'").findAll(body).map { it.groupValues[1] }.toList()

        val webPanels = keysAfter("<h2>", page)
        assertEquals("apps/web/src/hoods.ts draws panels HOOD_PANELS does not name", webPanels, HOOD_PANELS)

        // And this phone draws them in that order. UI.sectionHead is what makes a panel heading here.
        val screens = text("apps/android/app/src/main/kotlin/org/help313/app/HoodScreens.kt")
        val androidPanels = Regex("UI\\.sectionHead\\(a, L\\.t\\(\"(hood\\.[a-z_.]+)\"\\)\\)")
            .findAll(screens).map { it.groupValues[1] }.toList()
        assertEquals("the Android neighborhood page draws its panels in a different order", webPanels, androidPanels)

        // The lists inside the help panel and the four chart groups of the Conditions panel, under their own
        // smaller headings, in the same order too (the glance row's heading is drawn from a variable on the web).
        val webSubs = keysAfter("<h3 class=\"sub\">", page)
        assertEquals(
            listOf("hood.nearest_head", "hood.places_head", "hood.city_near_head",
                "hood.cond_blight_head", "hood.cond_issues_head", "hood.cond_days_head", "hood.cond_fires_head"),
            webSubs,
        )
        for (key in webSubs + "hood.glance") assertTrue("HoodScreens.kt never draws $key", screens.contains("L.t(\"$key\""))
    }

    /** SEMCOG asks for their notice wherever their data is reproduced. Both apps print the same sentence. */
    @Test
    fun theSemcogNoticeIsTheSameSentenceInBothApps() {
        val web = text("apps/web/src/hoods.ts")
        val quoted = Regex("SEMCOG_NOTICE = '([^']+)'").find(web)?.groupValues?.get(1)
        assertNotNull("apps/web/src/hoods.ts no longer declares SEMCOG_NOTICE", quoted)
        assertEquals(quoted, SEMCOG_NOTICE)
        // It is never translated: the same English on an Arabic, Bengali or Spanish screen. A string may NAME SEMCOG
        // as a source (the map's source line and the About credits do, since 2026-09-24); what it may not do is
        // carry a copy of the notice's own words.
        val notice = Regex("""Reproduction or Use Without Permission|All Rights Reserved""", RegexOption.IGNORE_CASE)
        for (lang in LANGS) {
            val s = strings("strings/$lang.json")
            assertFalse("strings/$lang.json has taken a copy of SEMCOG's notice", s.values.any { notice.containsMatchIn(it) })
        }
    }

    /**
     * Every kind the help panel counts has a word for it, in every language: the panel is built from whatever
     * categories the bundle publishes, so a new one must not reach a screen as a raw key.
     */
    @Test
    fun everyHelpCategoryOnANeighborhoodPageHasItsWords() {
        val file = File(root, "data/bundle/v1/$HOOD_FILE")
        if (!file.isFile) {
            // CI builds no data bundle; this runs on a laptop after `pnpm build:bundle`, like the other
            // bundle-reading tests (HoodsTest.real, GuardsTest, VerifyTest).
            println("no bundle built (run `pnpm build:bundle` from the repository root); skipping")
            return
        }
        val d = decodeIndicators(file.readBytes())
        val wanted = d.neighborhoods.flatMap { it.help.by.keys }.toSortedSet().map { hoodCategoryKey(it) } +
            d.neighborhoods.flatMap { it.help.noneListedYet }.toSortedSet().map { "hood.kind.$it" }
        for (lang in LANGS) {
            val s = strings("strings/$lang.json")
            for (key in wanted) assertNotNull("strings/$lang.json has no $key", s[key])
        }
    }

    /**
     * A neighborhood id is not a secret and a neighborhood page is not private: it is public City data about a
     * public place. So these screens are not photographed out of recents, offer no "Leave this page fast", and do
     * come back after the activity is recreated (Route.keepable).
     */
    @Test
    fun aNeighborhoodScreenIsPublic() {
        assertFalse(Route.isPrivate(Route.Hoods()))
        assertFalse(Route.isPrivate(Route.Hood("nbh_corktown")))
        val stack = listOf(Route.Home, Route.Hoods(), Route.Hood("nbh_corktown"))
        assertEquals(3, Route.keepable(stack).size)
        // And a private screen opened from one still cuts the stack where it always did.
        assertEquals(2, Route.keepable(stack.take(2) + Route.Need("unsafe")).size)
    }

    // ---- which report buttons one listing gets ---------------------------------------------------------------

    /**
     * "Out of supplies or food today" is offered only where there are supplies. The Android app offered it on every
     * listing, an emergency room included (Android review, 2026-09-20); the web app and the iPhone app both filter
     * it. All three now use the same rule, so this test reads theirs and checks ours behaves the same way.
     */
    @Test
    fun theOutOfSuppliesButtonIsOnlyOfferedWhereThereAreSupplies() {
        // Ours.
        for (category in listOf("food", "food.pantry", "food.meal", "harm", "harm.narcan", "harm.supplies")) {
            assertTrue("$category should offer out_of_stock", listingKinds(category).contains("out_of_stock"))
            assertEquals("no other kind may be dropped", LISTING_KINDS.size, listingKinds(category).size)
        }
        for (category in listOf("health.er", "health.urgent", "health.clinic", "shelter.emergency", "legal",
            "jobs.find", "treatment.detox", "rec", "shelter.dv", "")) {
            assertFalse("$category must not offer out_of_stock", listingKinds(category).contains("out_of_stock"))
            assertEquals(LISTING_KINDS.size - 1, listingKinds(category).size)
        }
        // The order of the ones that stay is the order in LISTING_KINDS, which is the order all three apps show.
        assertEquals(LISTING_KINDS.filter { it != "out_of_stock" }, listingKinds("legal"))

        // The web app's rule, as text: a change there fails here rather than drifting quietly.
        val web = text("apps/web/src/main.ts")
        assertTrue(
            "apps/web/src/main.ts no longer filters out_of_stock the way this app does",
            web.contains("""LISTING_KINDS.filter((k) => k !== 'out_of_stock' || /^(food|harm)/.test(category))"""),
        )
        // And the iPhone app's. Its file has moved once already (HelpApp -> Sources/HelpCore), so it is found by
        // what it declares rather than by where it happens to live.
        val ios = swiftFileDeclaring("enum ReportKinds")
        assertNotNull("no Swift file declares ReportKinds any more", ios)
        assertTrue(
            "${ios!!.path} no longer filters out_of_stock the way this app does",
            ios.readText().contains(""" != "out_of_stock" || category.hasPrefix("food") || category.hasPrefix("harm")"""),
        )
        // The screen must actually use the filter rather than the raw list.
        val screens = text("apps/android/app/src/main/kotlin/org/help313/app/Screens.kt")
        assertTrue("Screens.kt loops over the unfiltered LISTING_KINDS again", screens.contains("listingKinds(row.category)"))
        assertFalse("Screens.kt loops over the unfiltered LISTING_KINDS again", screens.contains("for (kind in LISTING_KINDS)"))
    }

    /**
     * The screens that offer "Leave this page fast" are the screens the web app marks `quickExit` — checked by
     * `needsMatchTheWebApp` above, which now carries the flag in the line it compares, and asserted here as the set
     * the reviewer named so that a failure says which screen changed.
     */
    @Test
    fun theSameScreensOfferAQuickExitInEveryApp() {
        assertEquals(
            listOf("unsafe", "talk", "drugs", "assault"),
            NEEDS.filter { it.quickExit }.map { it.id },
        )
        val web = text("apps/web/src/needs.ts")
        val webExit = Regex("\\{ id: '([a-z_]+)'[^\\n]*quickExit: true").findAll(web).map { it.groupValues[1] }.toList()
        assertEquals("the two apps put the quick exit on different screens", webExit, NEEDS.filter { it.quickExit }.map { it.id })
        // The address is the same in both apps, so what someone learns on one is true of the other.
        assertTrue(text("apps/web/src/main.ts").contains("https://www.weather.gov/"))
        assertEquals("https://www.weather.gov/", Net.QUICK_EXIT_URL)
    }

    /** The shelter screen's link card is a key into the strings files, not a name typed into the code. */
    @Test
    fun theLinkAboveTheNumbersIsTranslated() {
        val en = strings("strings/en.json")
        val shelter = NEEDS.first { it.id == "shelter" }
        val key = shelter.firstLink!!.first
        for (part in listOf("title", "body", "label")) assertNotNull(en["link.$key.$part"])
    }

    // ---- a place that publishes a point and no street address (the sal_wws_ stations) -----------------------

    private fun station(address: Address? = null, lat: Double? = 42.31, lon: Double? = -83.18, phones: List<Phone> = emptyList()) =
        BundleRow(id = "sal_wws_test", name = "A station", category = "harm.supplies",
            address = address, lat = lat, lon = lon, phones = phones)

    @Test
    fun aPointWithNoAddressStillGetsDirections() {
        val row = station()
        assertTrue(showsPointWithoutAddress(row))
        // The coordinate goes to the maps app as a coordinate, and is never printed as an address.
        assertEquals("42.31,-83.18", mapsDestination(row))
        assertFalse(hasPhone(row))
    }

    @Test
    fun aStreetAddressIsUsedWhenThePlacePublishesOne() {
        val row = station(address = Address("1234 Woodward Ave", "Detroit", "48226"))
        assertFalse(showsPointWithoutAddress(row))
        assertEquals("1234 Woodward Ave, Detroit, MI 48226", mapsDestination(row))
    }

    /**
     * The two decisions of the category audit of 2026-09-22, on this phone as on the web.
     *
     * K1: "I want free Narcan" asks for the whole `harm` kind, so Wayne County's Well Wayne stations
     * (`harm.supplies`, every one of which gives out naloxone) are on it beside the Health Department's boxes.
     * K3: "I need to talk to someone" keeps 988 and the crisis places first and lists the daytime places
     * (`health.support`) under their own heading below them.
     */
    @Test
    fun theCategoryAuditOf20260922IsOnThisPhoneToo() {
        val needs = kotlinNeeds()
        val narcan = needs.first { it.id == "narcan" }
        assertTrue("the Narcan need must ask for the whole harm kind: ${narcan.line}", narcan.line.contains("cat=harm "))
        val talk = needs.first { it.id == "talk" }
        assertTrue(talk.line.contains("cat=health.mental"))
        // 988 first, then one crisis line per county since 2026-09-24 (Wayne, Oakland, Macomb).
        assertTrue("988 still comes first", talk.line.contains("first=emg_988|emg_dwihn_crisis|emg_ochn_crisis|emg_mccmh_crisis "))
        assertTrue(talk.line.contains("sensitive=true exit=true"))
        assertEquals("support", alsoId(talk.line))
        assertTrue(talk.line, talk.line.contains("also=support:cat=health.support"))
        val doctor = needs.first { it.id == "doctor" }
        assertTrue(doctor.refine.any { it.second.contains("support cat=health.support") })
        // The sensitive pair did not change while a new health kind was added.
        assertTrue(text("apps/android/app/src/main/kotlin/org/help313/app/Needs.kt")
            .contains("""private val SENSITIVE = listOf("shelter.dv", "health.mental")"""))
        for (category in listOf("health.support", "health.supported", "health.mentalhealth", "shelter.dvx")) {
            assertFalse(category, isSensitive(category))
            assertFalse(category, isPrivate(category))
            assertTrue(category, Saved.canSave(category))
        }
        for (category in listOf("shelter.dv", "shelter.dv.transitional", "health.mental", "health.mental.crisis")) {
            assertTrue(category, isSensitive(category))
            assertFalse(category, Saved.canSave(category))
        }
        // The clubhouse is an ordinary listing: an address, directions, a map and a Save button.
        val club = BundleRow(id = "sal_goodwill_industries_a_place_of_our_own_clubhouse", name = "A Place of Our Own Clubhouse",
            category = "health.support", address = Address("1401 Ash St", "Detroit", "48208"),
            lat = 42.340442, lon = -83.070889, phones = listOf(Phone("313-931-0901", "Clubhouse")))
        assertEquals("1401 Ash St, Detroit, MI 48208", mapsDestination(club))
        assertNotNull(transitAppDestination(club))
        assertTrue(hasPhone(club))
        assertFalse(saysNoAddress(club))
        assertFalse(Route.isPrivate(Route.Detail(club.id, club.category)))
        // The second list is drawn after the first, under its own heading, and never mixed into it.
        val screens = text("apps/android/app/src/main/kotlin/org/help313/app/Screens.kt")
        assertTrue(screens.contains("""col.addView(UI.sectionHead(a, L.t("also.${'$'}{need.id}.${'$'}{al.id}")))"""))
        assertTrue("the need's own list comes before its second one",
            screens.indexOf("listBody(a, col, q,") < screens.indexOf("listBody(a, col, al.query,"))
    }

    // ---- the numbers that belong to one place (2026-09-24) -------------------------------------------------------

    /** One CSV line into its fields, honouring quotes (the labels carry commas). */
    private fun csvFields(line: String): List<String> {
        val out = ArrayList<String>()
        val cur = StringBuilder()
        var q = false
        var i = 0
        while (i < line.length) {
            val ch = line[i]
            when {
                q && ch == '"' && i + 1 < line.length && line[i + 1] == '"' -> { cur.append('"'); i++ }
                q && ch == '"' -> q = false
                q -> cur.append(ch)
                ch == '"' -> q = true
                ch == ',' -> { out += cur.toString(); cur.setLength(0) }
                else -> cur.append(ch)
            }
            i++
        }
        out += cur.toString()
        return out
    }

    /**
     * **The urgent sheet is the web's fixed list**, not every row of emergency.json: since the area widened that
     * file carries a police line for every place a bus reaches, and a sheet of seventy police stations is not an
     * urgent sheet. 911 and 988 lead, then one shelter line and one crisis line per county.
     */
    @Test
    fun theUrgentSheetIsTheWebsFixedList() {
        val web = text("apps/web/src/needs.ts")
        val block = web.substringAfter("export const URGENT_IDS = [", "").substringBefore("];")
        assertTrue("could not read URGENT_IDS from apps/web/src/needs.ts", block.isNotEmpty())
        assertEquals("the urgent sheets differ", quoted(block), URGENT_IDS)
        assertEquals(listOf("emg_911", "emg_988"), URGENT_IDS.take(2))
        assertEquals("hardcoded numbers lead the sheet", HARDCODED.keys.toList(), URGENT_IDS.filter { HARDCODED.containsKey(it) })
    }

    /** A number scoped to one place (emergency.csv `area`) is never on the urgent sheet or before a need's list. */
    @Test
    fun aNumberThatBelongsToOnePlaceNeverReachesAGeneralList() {
        val lines = text("data/seed/emergency.csv").trim().split("\n").map { csvFields(it.trimEnd('\r')) }
        val at = lines[0].indexOf("area")
        assertTrue("emergency.csv has no area column", at >= 0)
        val scoped = lines.drop(1).filter { it.getOrElse(at) { "" }.isNotEmpty() }.map { it[0] }.toSet()
        assertTrue("only ${scoped.size} police lines scoped to a place", scoped.size >= 60)
        for (id in URGENT_IDS) assertFalse(id, scoped.contains(id))
        for (n in NEEDS) for (id in n.first + n.refine.flatMap { it.first }) assertFalse("${n.id}: $id", scoped.contains(id))
    }

    /** A place's page gets its own line and no other place's; 911 and 988 never ride along as a place's. */
    @Test
    fun aPlacesOwnNumbersAreOnlyItsOwn() {
        val numbers = listOf(
            EmergencyNumber("emg_911", "Emergency", "911", null, true),
            EmergencyNumber("emg_police_warren", "Warren Police Department", "586-574-4700", null, false, area = "city_warren"),
            EmergencyNumber("emg_police_pontiac", "Pontiac police", "248-000-0000", null, false, area = "city_pontiac"),
            EmergencyNumber("emg_988", "Crisis", "988", null, true, area = "city_warren"),
            EmergencyNumber("emg_211", "211", "211", null, false),
        )
        assertEquals(listOf("emg_police_warren"), placeNumbers(numbers, "city_warren").map { it.id })
        assertEquals(listOf("emg_police_pontiac"), placeNumbers(numbers, "city_pontiac").map { it.id })
        assertEquals("a place with none has none", emptyList<String>(), placeNumbers(numbers, "city_hamtramck").map { it.id })
        assertEquals("no place, no numbers", emptyList<String>(), placeNumbers(numbers, "").map { it.id })
    }

    // ---- the navigation rebuild of 2026-09-22 (docs/NAVIGATION-AUDIT-2026-09-22.md) ------------------------------

    /**
     * **Four tabs: Home · Help · Map · Areas**, the one tab set on all three clients (audit H5, §4.1).
     *
     * Search and Saved were tabs on Android and on neither of the other two. Six 11-sp words sharing one line was
     * already tight at ordinary Arabic text, and neither is a front door.
     */
    @Test
    fun theTabBarIsTheSameFourTabsAsTheOtherTwoClients() {
        val main = text("apps/android/app/src/main/kotlin/org/help313/app/MainActivity.kt")
        val bar = main.substringAfter("private fun fillTabs").substringBefore("// ---- the things a screen needs")
        val tabs = Regex("Triple\\(\"([\\w.]+)\"").findAll(bar).map { it.groupValues[1] }.toList()
        assertEquals(listOf("tab.home", "tab.help", "tab.map", "tab.hoods"), tabs)
        // The web's router has the same four (plus Events, which hides itself when the bundle carries none).
        val web = text("apps/web/src/router.ts") + text("apps/web/src/main.ts")
        for (tab in listOf("home", "help", "map", "hoods")) {
            assertTrue("the web has no $tab tab", web.contains("'$tab'") || web.contains("\"$tab\""))
        }
        // The spoken label is the whole phrase, so nothing is abbreviated for somebody who cannot see the bar.
        assertTrue(bar.contains("\"tab.hoods_wide\""))
    }

    /**
     * **Urgent help is reachable on every screen** (audit H6; docs/05 and Principle 3, "one tap from anywhere").
     * It had exactly two entry points on Android — Home's page body and the Map tab's chip — so from Help, a need,
     * a listing or an area it took a trip back to Home.
     */
    @Test
    fun urgentHelpIsInTheAppBarOnEveryScreenThatHasOne() {
        val main = text("apps/android/app/src/main/kotlin/org/help313/app/MainActivity.kt")
        assertTrue("there is no app bar", main.contains("private fun rebuildTopBar"))
        val bar = main.substringAfter("private fun rebuildTopBar").substringBefore("// ---- the things a screen needs")
        assertTrue("the app bar does not carry Urgent help", bar.contains("L.t(\"strip.more\")"))
        assertTrue("the app bar does not carry Search", bar.contains("Route.Search"))
        // Built once, from the route, on every draw — not remembered screen by screen.
        assertTrue("the app bar is not rebuilt on every draw", main.contains("rebuildTopBar()"))
        // The two screens that do not get it, and why, are stated in the code rather than left to be re-found.
        assertTrue(bar.contains("route !is Route.Map"))
        assertTrue(bar.contains("Route.isPrivate(route)"))
        // The Map tab carries the same control as a floating chip of its own, so it is not a gap.
        assertTrue(
            "the Map tab lost its own Urgent help chip",
            text("apps/android/app/src/main/kotlin/org/help313/app/MapScreen.kt").contains("chip(a, L.t(\"strip.more\"))"),
        )
    }

    /** Home's six shortcuts, in docs/05's order: **Food first** (audit M2 and M4; Android had four). */
    @Test
    fun homesSixQuickNeedsAreTheWebsSixInTheWebsOrder() {
        assertEquals(
            listOf("food", "shelter", "doctor", "drugs", "narcan", "job"),
            QUICK_NEEDS.map { it.second },
        )
        assertEquals(
            listOf("quick.food", "quick.shelter", "quick.doctor", "quick.drugs", "quick.narcan", "quick.job"),
            QUICK_NEEDS.map { it.first },
        )
        // Every one of them is a need this app actually has, so a tile can never open nothing.
        val ids = kotlinNeeds().map { it.id }
        for ((_, need) in QUICK_NEEDS) assertTrue("Home offers \"$need\", which is not a need", ids.contains(need))
        // And the web leads with the same one.
        val web = text("apps/web/src/main.ts")
        val quick = web.substringAfter("quick.food")
        assertTrue("the web no longer leads with food", quick.isNotEmpty())
    }

    /**
     * Home's three tiles: Map, Your area, **Parks and paths** — which replaced the Joe Louis Greenway's own tile
     * and its live count of open stretches (Kyle, 2026-09-22, direction b).
     */
    @Test
    fun homesTilesAreMapAreasAndParksAndPaths() {
        val screens = text("apps/android/app/src/main/kotlin/org/help313/app/Screens.kt")
        val home = screens.substringAfter("fun home(a: MainActivity)").substringBefore("val QUICK_NEEDS")
        val order = listOf("L.t(\"tab.map\")", "L.t(\"home.hoods_title\")", "L.t(\"rec.title\")")
        var at = -1
        for (tile in order) {
            val found = home.indexOf(tile)
            assertTrue("Home has no $tile tile", found >= 0)
            assertTrue("Home's tiles are in the wrong order at $tile", found > at)
            at = found
        }
        // The count that made the greenway read as the app's headline is gone from every language file.
        for (lang in LANGS) assertFalse("rec.gw_sub is still in strings/$lang.json", strings("strings/$lang.json").containsKey("rec.gw_sub"))
        // The tiles sit below the six needs, never above them: none of them is in the crisis path.
        assertTrue(home.indexOf("QUICK_NEEDS") < home.indexOf("L.t(\"tab.map\")"))
    }

    /** **The Map tab opens with help on it** (audit H2), and the greenway, the outlines and the buses are off. */
    @Test
    fun theFirstOpenLayersAreEveryHelpGroupAndTheParks() {
        val web = text("apps/web/src/layers.ts")
        val wanted = Regex("DEFAULT_LAYERS = \\[([^\\]]*)\\]").find(web)?.groupValues?.get(1)
        assertNotNull("could not read DEFAULT_LAYERS from apps/web/src/layers.ts", wanted)
        // The web names the boundaries layer by its constant rather than by its string, so the constant is read
        // as the id it stands for.
        val webIds = Regex("'([\\w:]+)'|(AREAS_LAYER)").findAll(wanted!!)
            .map { it.groupValues[1].ifEmpty { AREAS_LAYER } }.toList()
        assertEquals("the two apps open on different layers", webIds, defaultMapLayers)
        assertTrue(defaultMapLayers.contains("place:parks"))
        assertFalse(defaultMapLayers.contains("place:greenway"))
        // **On by default since 2026-09-22** (docs/MAP-STYLE.md section 15.4): the Map tab opens on the whole
        // city, and a person who came to see their neighbourhood saw four city edges and none of the 205.
        assertTrue(defaultMapLayers.contains(AREAS_LAYER))
        assertFalse(defaultMapLayers.contains("go:ddot_routes"))
        assertTrue("the web's LAYERS_VERSION moved", web.contains("LAYERS_VERSION = 2"))
    }

    /**
     * The eight help layers, including the one the category audit added — `safe`, the police and fire stations,
     * which ride with the emergency rooms rather than getting a colour of their own.
     */
    @Test
    fun theMapsEightHelpGroupsAreTheWebsEight() {
        val web = text("apps/web/src/needs.ts")
        val block = web.substringAfter("MAP_GROUPS").substringBefore("];")
        val ids = Regex("id: '(\\w+)'").findAll(block).map { it.groupValues[1] }.toList()
        assertEquals("the two apps group the map's listings differently", ids, mapGroups.map { it.id })
        assertEquals(8, mapGroups.size)
        assertTrue("police and fire stations are not on the map", mapGroups.first { it.id == "health" }.tops.contains("safe"))
        assertEquals("safe.police belongs to the health layer", "health", mapGroupId("safe.police"))
        assertEquals("health", mapGroupId("safe.fire"))
        // And the outlines layer is a place layer with a name of its own, handed no listing at all.
        for (lang in LANGS) assertNotNull("strings/$lang.json has no name for the outlines layer",
            strings("strings/$lang.json")["layer.place.areas"])
    }

    /** A city page's panels, in the web's fixed order, from the web's own allow-list. */
    @Test
    fun theCityPageDrawsTheWebsSixPanelsInTheWebsOrder() {
        val web = text("apps/web/src/hoods.ts")
        val block = Regex("CITY_PANELS = \\[([^\\]]*)\\]").find(web)?.groupValues?.get(1)
        assertNotNull("could not read CITY_PANELS from apps/web/src/hoods.ts", block)
        val ids = Regex("'(\\w+)'").findAll(block!!).map { it.groupValues[1] }.toList()
        assertEquals("the two apps draw a city page's panels differently", ids, CITY_PANELS)
        // The screen draws them from the allow-list and from nothing else.
        val areas = text("apps/android/app/src/main/kotlin/org/help313/app/AreaScreens.kt")
        assertTrue("the city page does not go through the allow-list", areas.contains("for (panel in cityPanels(area))"))
        for (lang in LANGS) {
            val s = strings("strings/$lang.json")
            for (k in listOf("city.kind", "city.regional", "city.no_neighborhoods", "city.missing")) {
                assertNotNull("strings/$lang.json has no $k", s[k])
            }
        }
    }

    /**
     * **"Woodward and Warren" means the same thing on all three clients.** The table is the web's own
     * (apps/web/src/intersections.ts and its tests); a disagreement here is a client that has drifted.
     */
    @Test
    fun theCrossStreetParserAnswersTheWebsCases() {
        // The suffix, direction and number-word tables are the same sets, read out of the web's source.
        val web = text("apps/web/src/intersections.ts")
        for (word in listOf("ave", "boulevard", "parkway", "trail")) {
            assertTrue("the web's SUFFIXES has no \"$word\"", web.contains("'$word'"))
        }
        for ((typed, want) in listOf(
            "Woodward Ave" to "woodward",
            "W. Warren Ave" to "warren",
            "Seven Mile" to "7 mile",
            "seven mile road" to "7 mile",
            "St. Aubin St" to "st aubin",
            "Way" to "way",
        )) {
            assertEquals("\"$typed\" folds differently here", want, Intersections.normStreet(typed).name)
        }
        assertEquals("w", Intersections.normStreet("W. Warren Ave").dir)
        assertEquals("e", Intersections.normStreet("East Warren").dir)
        for (typed in listOf("Woodward and Warren", "Woodward & Warren", "Woodward/Warren", "Woodward @ Warren", "Woodward x Warren")) {
            val parsed = Intersections.parseCrossing(typed)
            assertNotNull("\"$typed\" is not read as a junction", parsed)
            assertEquals("Woodward", parsed!!.first)
            assertEquals("Warren", parsed.second)
        }
        assertEquals("Warren at Woodward puts Warren first", "Warren", Intersections.parseCrossing("Warren at Woodward")!!.first)
        assertEquals("one name on its own", "", Intersections.parseCrossing("Woodward")!!.second)
        // The two numbers the web pins, pinned here too.
        assertTrue(web.contains("SAME_JUNCTION_M = 120"))
        assertEquals(120.0, Intersections.SAME_JUNCTION_M, 0.0)
        assertTrue(web.contains("MAX_CHOICES = 6"))
        assertEquals(6, Intersections.MAX_CHOICES)
        // And the sentences it says are in every language.
        for (lang in LANGS) {
            val s = strings("strings/$lang.json")
            for (k in listOf("loc.cross", "loc.cross_label", "loc.cross_unknown", "loc.cross_no_crossing", "loc.cross_one_street", "loc.slow", "loc.slow_stop")) {
                assertNotNull("strings/$lang.json has no $k", s[k])
            }
        }
    }

    /**
     * **The Areas tab's numbers and words, held to the web's** (Kyle, 2026-09-22; DECISIONS 2026-09-22).
     *
     * Six constants and eight strings. If apps/web/src/areas.ts or apps/web/src/map.ts moves one of them, this
     * fails until Android moves with it — which is the only thing keeping three clients from opening the Areas
     * tab on three different pictures. The behaviour behind the numbers is AreasHomeTest, which ports the web's
     * own cases; this test is about the numbers themselves.
     */
    @Test
    fun theAreasTabIsTheSameSixNumbersAndEightWordsAsTheWebs() {
        val areas = text("apps/web/src/areas.ts")
        assertTrue(
            "the web's four strip numbers moved",
            areas.contains("AREAS_STRIP_VH = 38, AREAS_BAR_PX = 48, AREAS_TURN_PX = 8, AREAS_SHRINK_MS = 240"),
        )
        assertEquals(38, AREAS_STRIP_VH)
        assertEquals(48, AREAS_BAR_PX)
        assertEquals(8, AREAS_TURN_PX)
        assertEquals(240, AREAS_SHRINK_MS)
        assertTrue("the web's settling period moved", areas.contains("AREAS_SETTLE_MS = AREAS_SHRINK_MS + 80"))
        assertEquals(AREAS_SHRINK_MS + 80, AREAS_SETTLE_MS)

        val map = text("apps/web/src/map.ts")
        assertTrue("the web's camera numbers moved", map.contains("AREA_FIT_MARGIN = 0.08, AREA_MIN_MPP = 4"))
        assertEquals(0.08, MapCamera.AREA_FIT_MARGIN, 0.0)
        assertEquals(4.0, MapCamera.AREA_MIN_MPP, 0.0)

        // The eight words the tab is made of, in every language, with their placeholders intact.
        for (lang in LANGS) {
            val s = strings("strings/$lang.json")
            for (k in listOf(
                "hood.list_head", "hood.switch_label", "hood.switch_map", "hood.switch_list",
                "hood.say_map", "hood.say_list", "hood.back_map", "hood.here_is",
            )) {
                assertNotNull("strings/$lang.json has no $k", s[k])
            }
            // A switch button sits in a 48 dp corner of the map: neither word may be a sentence.
            assertTrue("$lang hood.switch_list is too long for the control", s["hood.switch_list"]!!.length <= 12)
            assertTrue("$lang hood.here_is lost its {name}", s["hood.here_is"]!!.contains("{name}"))
        }
    }

    /**
     * The Areas tab's own rules can store nothing, send nothing and navigate nowhere: they are handed three
     * booleans and a scroll offset, and they hand back a word (docs/08). The same guard the web puts on areas.ts.
     */
    @Test
    fun theAreasTabsRulesCannotStoreOrSendAnything() {
        val src = text("apps/android/app/src/main/kotlin/org/help313/app/AreasHome.kt")
        for (forbidden in listOf("java.io", "File(", "SharedPreferences", "import android.", "Http", "Net.", "Route(")) {
            assertFalse("AreasHome.kt mentions $forbidden", src.contains(forbidden))
        }
        // And :core compiles it, so `HELP313_NO_ANDROID=1 ./gradlew :core:test` really runs every case above.
        assertTrue(
            "AreasHome.kt is not in the :core source list",
            text("apps/android/core/build.gradle.kts").contains("org/help313/app/AreasHome.kt"),
        )
    }

    /**
     * **The boundary band table is the web's, row for row** (docs/MAP-STYLE.md section 15.1).
     *
     * These are the *third* set of numbers — twice strengthened from screenshots — and the spec says in as many
     * words that a porter must copy the table rather than an earlier draft. So this reads the web's own
     * `bounds.ts` and holds every number in it, rather than restating them and hoping.
     */
    @Test
    fun theBoundaryBandTableIsTheWebs() {
        val web = text("apps/web/src/bounds.ts")
        assertTrue("the web's band cut points moved", web.contains("BOUNDARY_MID_MPP = 30, BOUNDARY_NEAR_MPP = 12"))
        assertEquals(30.0, BOUNDARY_MID_MPP, 0.0)
        assertEquals(12.0, BOUNDARY_NEAR_MPP, 0.0)
        assertEquals(BoundaryBand.CITY, boundaryBand(30.001))
        assertEquals(BoundaryBand.MID, boundaryBand(30.0))
        assertEquals(BoundaryBand.MID, boundaryBand(12.0))
        assertEquals(BoundaryBand.NEAR, boundaryBand(11.999))

        // The three rows, as the web writes them.
        assertTrue(web.contains("width: 1.1, cityWidth: 1.5, dash: [2, 2], names: false"))
        assertTrue(web.contains("width: 1.6, cityWidth: 2.4, dash: [3, 3], names: true"))
        assertTrue(web.contains("width: 2.2, cityWidth: 3, dash: [6, 3], names: true"))
        val city = boundaryStyle(40.0)
        val mid = boundaryStyle(20.0)
        val near = boundaryStyle(5.0)
        assertEquals(listOf(1.1, 1.6, 2.2), listOf(city.width, mid.width, near.width))
        assertEquals(listOf(1.5, 2.4, 3.0), listOf(city.cityWidth, mid.cityWidth, near.cityWidth))
        assertEquals(listOf(listOf(2.0, 2.0), listOf(3.0, 3.0), listOf(6.0, 3.0)), listOf(city.dash, mid.dash, near.dash))
        assertEquals(listOf(false, true, true), listOf(city.names, mid.names, near.names))

        // The cap and the floor, and the selection's own weight and wash.
        assertTrue(web.contains("BOUNDARY_NAME_CAP = 12, BOUNDARY_NAME_MIN_PX = 70"))
        assertEquals(12, BOUNDARY_NAME_CAP)
        assertEquals(70.0, BOUNDARY_NAME_MIN_PX, 0.0)
        assertEquals(0, city.nameCap)
        assertEquals(12, mid.nameCap)
        assertEquals(12, near.nameCap)
        assertTrue(web.contains("BOUNDARY_WASH_ALPHA = 0.08, BOUNDARY_SELECTED_WIDTH = 4"))
        assertEquals(0.08, BOUNDARY_WASH_ALPHA, 0.0)
        assertEquals(4.0, BOUNDARY_SELECTED_WIDTH, 0.0)

        // Two rules the spec says are where the web went wrong first.
        for (s in listOf(city, mid, near)) {
            assertTrue("${s.band}: the dash's ON length is shorter than the stroke", s.dash[0] >= s.cityWidth - 0.5)
            assertTrue("${s.band}: a dash that is not a dash", s.dash.size == 2 && s.dash.all { it > 0 })
        }
        // At city zoom a boundary is still thinner than the thinnest street drawn there (floor 1.6).
        assertTrue("a city-band boundary is as thick as a road", city.width < 1.6)
    }

    /**
     * The boundary token, in four modes, with the contrast floor of docs/MAP-STYLE.md section 15.2 — and the two
     * values the app actually draws with, held to the same stylesheet the rest of the map's colours are.
     */
    @Test
    fun theBoundaryColourIsTheWebsAndClearsItsFloor() {
        val css = text("apps/web/src/style.css")
        assertTrue("the web's light value moved", css.contains("--map-bnd:#7a5588"))
        assertTrue("the web's dark value moved", css.contains("--map-bnd:#a98cbb"))
        assertTrue("the web's light + contrast value moved", css.contains("--map-bnd:#5a3a6b"))
        assertTrue("the web's dark + contrast value moved", css.contains("--map-bnd:#cdb4da"))
        assertEquals("#7a5588", BoundaryPalette.color(MapScheme.LIGHT).hex)
        assertEquals("#a98cbb", BoundaryPalette.color(MapScheme.DARK).hex)
        assertEquals("#5a3a6b", BoundaryPalette.color(MapScheme.LIGHT, true).hex)
        assertEquals("#cdb4da", BoundaryPalette.color(MapScheme.DARK, true).hex)

        // The same four values are in the resources the app draws with, so the two can never drift.
        fun resources(path: String): Map<String, String> =
            Regex("<color name=\"([a-z_0-9]+)\">(#[0-9A-Fa-f]{6})</color>").findAll(text(path))
                .associate { it.groupValues[1] to it.groupValues[2].lowercase() }
        val day = resources("apps/android/app/src/main/res/values/colors.xml")
        val night = resources("apps/android/app/src/main/res/values-night/colors.xml")
        assertEquals("#7a5588", day["map_bnd"])
        assertEquals("#5a3a6b", day["map_bnd_more"])
        assertEquals("#a98cbb", night["map_bnd"])
        assertEquals("#cdb4da", night["map_bnd_more"])

        // **The floor is 3.00 against everything a boundary is ever drawn over**, in all four modes.
        for (scheme in MapScheme.values()) for (more in listOf(false, true)) {
            val bnd = BoundaryPalette.color(scheme, more)
            val land = if (more) TransitPalette.landMoreContrast(scheme) else TransitPalette.land(scheme)
            val park = TransitPalette.park(scheme)
            for ((what, bg) in listOf("land" to land, "park" to park)) {
                assertTrue(
                    "$scheme more=$more: boundary on $what is ${RGB.contrast(bnd, bg)}",
                    RGB.contrast(bnd, bg) >= 3.0,
                )
            }
        }
        // And it is deliberately NOT a street colour: it has to be a step away from all three greys.
        val day2 = resources("apps/android/app/src/main/res/values/colors.xml")
        for (street in listOf("map_road", "map_main", "map_fwy")) {
            assertTrue(
                "the boundary wears $street",
                !day2.getValue(street).equals(day2.getValue("map_bnd"), ignoreCase = true),
            )
        }
    }

    /**
     * **On by default, and migrated exactly once** (docs/MAP-STYLE.md section 15.4). The three cases the spec
     * names, and the one rule that is easy to get wrong: every write stamps the marker, not only the migration.
     */
    @Test
    fun theBoundariesLayerIsOnByDefaultAndMigratesOnce() {
        assertTrue("place:areas is not in the defaults", defaultMapLayers.contains(AREAS_LAYER))
        assertEquals(2, LAYERS_VERSION)
        // A list from before the marker gains it, at the end, with nothing else touched.
        val old = listOf("help:food", "place:parks")
        assertEquals(old + AREAS_LAYER, migrateLayers(old, 0))
        // A list already at this version is handed back untouched — including one that switched it OFF.
        assertEquals(old, migrateLayers(old, LAYERS_VERSION))
        assertEquals(old + AREAS_LAYER, migrateLayers(old + AREAS_LAYER, LAYERS_VERSION))
        // It is never added twice.
        assertEquals(old + AREAS_LAYER, migrateLayers(old + AREAS_LAYER, 0))
        // The cap still applies, and the layer that was just added is what survives it (the web's `slice(-30)`).
        val full = migrateLayers((1..30).map { "help:$it" }, 0)
        assertEquals(30, full.size)
        assertEquals(AREAS_LAYER, full.last())
        // Every write stamps the marker.
        val store = text("apps/android/app/src/main/kotlin/org/help313/app/MapLayers.kt")
        assertTrue("write() does not stamp the version", store.contains("\"{\\\"v\\\":\" + LAYERS_VERSION"))
    }

    /**
     * **The Map tab draws the outlines it offers.** PR #22 added the `place:areas` layer, its pick order and its
     * keyboard walk, and the canvas drew nothing at all — switching "Neighborhoods and cities" on changed the map
     * by not one pixel. The three places that closes the gap are named here so it cannot quietly reopen.
     */
    @Test
    fun theMapTabDrawsPicksAndWalksTheAreaOutlines() {
        val view = text("apps/android/app/src/main/kotlin/org/help313/app/MapView.kt")
        assertTrue("the canvas does not draw the outlines", view.contains("drawAreas(s, cam, view, mpp, w, h, c)"))
        assertTrue("the layer flag is gone", view.contains("var areasOn = false"))
        assertTrue("the keyboard does not walk the outlines", view.contains("MapSelection.Area(area.id)"))
        val model = text("apps/android/app/src/main/kotlin/org/help313/app/MapModel.kt")
        assertTrue("a tap does not find an outline", model.contains("areaHit(areas,"))
        val screen = text("apps/android/app/src/main/kotlin/org/help313/app/MapScreen.kt")
        assertTrue("the Map tab never switches the layer on", screen.contains("MapModel.isOn(a, AREAS_LAYER)"))
        // The pick order and the walk order are still the ones :core tests, and the walk is the tail reversed.
        assertEquals(listOf("dot", "glyph", "stop", "greenway", "route", "area", "park"), MAP_PICK_ORDER)
        assertEquals(listOf("segment", "area", "dot"), MAP_WALK_ORDER)
    }

    /** One anchor and one radius, the same three numbers on all three clients. */
    @Test
    fun theOpeningViewIsTheSameAnchorAndRadiusAsTheWebs() {
        val web = text("apps/web/src/locate.ts")
        assertTrue("the web's anchor moved", web.contains("lat: 42.3366") && web.contains("lon: -83.0514"))
        assertEquals(42.3366, MAP_ANCHOR.lat, 1e-9)
        assertEquals(-83.0514, MAP_ANCHOR.lon, 1e-9)
        assertTrue("the web's radius moved", web.contains("LOCATE_RADIUS_M = 3218.688"))
        assertEquals(3218.688, LOCATE_RADIUS_METERS, 1e-9)
        assertEquals("one radius, not two", LOCATE_RADIUS_METERS, ANCHOR_RADIUS_METERS, 0.0)
        assertTrue("the web gave up at ten seconds again", web.contains("LOCATE_SLOW_MS = 10000"))
        assertEquals(10_000L, LOCATE_SLOW_MS)
    }

    /** The parks list is never ordered by a number about a park (docs/13, honesty rule 1). */
    @Test
    fun theParksScreenNeverOrdersByAnIndicator() {
        val parks = text("apps/android/app/src/main/kotlin/org/help313/app/Parks.kt")
        val body = parks.substringAfter("fun parksInOrder")
        for (forbidden in listOf("acres", "type")) {
            assertFalse("parksInOrder reads $forbidden", body.substringBefore("fun parkById").contains(".$forbidden"))
        }
        val screens = text("apps/android/app/src/main/kotlin/org/help313/app/ParkScreens.kt")
        assertTrue("the parks screen does not use the shared order", screens.contains("parksInOrder(parks, a.near)"))
        for (lang in LANGS) {
            val s = strings("strings/$lang.json")
            for (k in listOf("rec.title", "rec.parks_near", "rec.parks_abc", "rec.gw_row", "rec.paths_gap")) {
                assertNotNull("strings/$lang.json has no $k", s[k])
            }
        }
    }

    @Test
    fun aSensitiveListingIsNeverHandedToAMapsApp() {
        for (category in listOf("shelter.dv", "health.mental")) {
            val row = BundleRow(id = "sal_x", name = "x", category = category, lat = 42.33, lon = -83.05)
            assertNull(mapsDestination(row))
            assertFalse(showsPointWithoutAddress(row))
        }
    }

    /**
     * Kyle, 2026-09-20: a domestic-violence row's only statement about where it is, is the coarse area it
     * serves, in words. No address, no ZIP, no coordinate, no distance, no map, no directions.
     */
    @Test
    fun aDvListingNamesAnAreaAndNothingElse() {
        val dv = BundleRow(id = "sal_dv", name = "Crisis line", category = "shelter.dv",
            serviceArea = "detroit", phones = listOf(Phone("313-555-0100")))
        assertEquals("area.detroit", serviceAreaStringKey(dv))
        assertTrue(saysNoAddress(dv))
        assertNull(mapsDestination(dv))
        assertNull(transitAppDestination(dv))
        assertFalse(showsPointWithoutAddress(dv))
        // A DV row with no area recorded still carries the sentence, and still names no key.
        val noArea = BundleRow(id = "sal_dv2", name = "x", category = "shelter.dv")
        assertNull(serviceAreaStringKey(noArea))
        assertTrue(saysNoAddress(noArea))
        // An ordinary listing is untouched by all of this.
        val pantry = BundleRow(id = "sal_p", name = "x", category = "food.pantry", address = Address("1 Main St", "Detroit", "48226"))
        assertNull(serviceAreaStringKey(pantry))
        assertFalse(saysNoAddress(pantry))
    }

    /**
     * The band is a function of the area alone: two shelters serving one area always tie, and neither ever
     * carries a distance, so nothing about the order can be read back as a place.
     */
    @Test
    fun dvRowsBandByTheirAreaAndNeverCarryADistance() {
        fun dv(id: String, area: String?) = BundleRow(id = id, name = id, category = "shelter.dv",
            availability = "always", serviceArea = area, phones = listOf(Phone("313-555-0100")))
        val rows = listOf(dv("a", "detroit"), dv("b", "detroit"), dv("c", "dearborn"), dv("d", "national"))
        val q = Query(category = "shelter.dv", near = LatLon(42.35, -83.06))
        val out = rank(rows, q, 1789753500000L)
        assertEquals(listOf("a", "b", "c", "d"), out.map { it.row.id })
        assertEquals(listOf(0, 0, 1, 2), out.map { it.band })
        assertTrue(out.all { it.miles == null })
    }

    /** Every area in the closed list has a word for it in all four languages. */
    @Test
    fun everyServiceAreaHasItsWords() {
        for (lang in LANGS) {
            val s = strings("strings/$lang.json")
            for (id in org.help313.query.SERVICE_AREAS.keys) assertNotNull("strings/$lang.json has no area.$id", s["area.$id"])
            for (k in listOf("safe.dv_serves", "safe.dv_no_address")) assertNotNull("strings/$lang.json has no $k", s[k])
        }
    }

    @Test
    fun noAddressAndNoPointMeansNoDirections() {
        assertNull(mapsDestination(station(lat = null, lon = null)))
        assertFalse(showsPointWithoutAddress(station(lat = null, lon = null)))
    }

    @Test
    fun aListingWithAPhoneOffersACall() {
        assertTrue(hasPhone(station(phones = listOf(Phone("313-555-0101")))))
    }

    // ---- the Transit app link (docs/research/2026-09-20/transit-app.md) --------------------------------------
    //
    // The same six cases as apps/ios/HelpAppTests ListingTests and the web app's own tests, so the three apps
    // cannot drift on which listings get a bus link and what is in it.

    /** A place with both a point and an address: Transit gets the point, because it geocodes address strings
     *  loosely by its own documentation. This is the reverse of what the maps link does, on purpose. */
    @Test
    fun theTransitAppGetsTheCoordinateWhenThePublisherGivesOne() {
        val pantry = BundleRow(id = "sal_p", name = "A pantry", category = "food.pantry",
            address = Address("2424 W Grand Blvd", "Detroit", "48208"), lat = 42.3378412, lon = -83.1770116)
        assertEquals("42.3378412,-83.1770116", transitAppDestination(pantry))
        assertEquals("1234 Woodward Ave, Detroit, MI 48226", mapsDestination(
            BundleRow(id = "sal_p2", name = "x", category = "food.pantry",
                address = Address("1234 Woodward Ave", "Detroit", "48226"), lat = 42.33, lon = -83.05)))
    }

    @Test
    fun theTransitAppFallsBackToTheWrittenAddress() {
        val clinic = BundleRow(id = "sal_c", name = "A clinic", category = "health.clinic",
            address = Address("2424 W Grand Blvd", "Detroit", "48208"))
        assertEquals("2424 W Grand Blvd, Detroit, MI 48208", transitAppDestination(clinic))
    }

    /** The same gate as Directions: a listing whose directions are withheld gets no Transit link either. */
    @Test
    fun theTransitAppIsNeverOfferedForASensitiveListing() {
        for (category in listOf("shelter.dv", "health.mental", "health.mental.crisis")) {
            assertNull(transitAppDestination(BundleRow(id = "sal_s", name = "x", category = category,
                address = Address("1 Main St", "Detroit", "48226"), lat = 42.3, lon = -83.1)))
        }
    }

    /** Treatment keeps its directions, because people have to get there, so it keeps the Transit link too. */
    @Test
    fun theTransitAppIsOfferedForTreatment() {
        assertNotNull(transitAppDestination(BundleRow(id = "sal_t", name = "Detox", category = "treatment.detox",
            address = Address("1 Main St", "Detroit", "48226"))))
    }

    @Test
    fun noAddressAndNoPointMeansNoTransitLink() {
        assertNull(transitAppDestination(station(lat = null, lon = null)))
    }

    /** The link carries the destination and nothing else. No `from`, ever: Transit's own note says leaving it
     *  out uses the person's own location, which Transit asks for itself. We pass no origin and read none. */
    @Test
    fun theTransitLinkCarriesNoOrigin() {
        val pantry = BundleRow(id = "sal_p", name = "A pantry", category = "food.pantry",
            address = Address("2424 W Grand Blvd", "Detroit", "48208"), lat = 42.3, lon = -83.1)
        val link = "transit://directions?to=" + transitAppDestination(pantry)
        assertEquals("transit://directions?to=42.3,-83.1", link)
        assertFalse("the Transit link must never carry an origin", link.contains("from"))
    }

    // ---- reading the two files -----------------------------------------------------------------------------

    /** id, the one-line summary of the need, and its choices as (id, one-line summary) pairs. */
    private class Parsed(val id: String, val line: String, val refine: List<Pair<String, String>>)

    private fun webNeeds(): List<Parsed> {
        val src = text("apps/web/src/needs.ts")
        val from = src.indexOf("export const NEEDS")
        val to = src.indexOf("export const CATEGORIES")
        if (from < 0 || to < 0) return emptyList()
        return src.substring(from, to).split("\n  { id: ").drop(1).map { part ->
            val (head, body) = split(part, "refine: [")
            val id = quoted(head).firstOrNull() ?: "?"
            parsed(id, value(head, "group") ?: "?", head, body, "{ id: ")
        }
    }

    private fun kotlinNeeds(): List<Parsed> {
        val src = text("apps/android/app/src/main/kotlin/org/help313/app/Needs.kt")
        val from = src.indexOf("val NEEDS: List<Need> = listOf(")
        val to = src.indexOf("/** Browse-by-type chips")
        if (from < 0 || to < 0) return emptyList()
        return src.substring(from, to).split("\n    Need(").drop(1).map { part ->
            val (head, body) = split(part, "refine = listOf(")
            val words = quoted(head)
            // A need is written `Need("<id>", "<group>", …)`: the id and the group are its first two words.
            parsed(words.getOrElse(0) { "?" }, words.getOrElse(1) { "?" }, head, body, "Refine(")
        }
    }

    /** Both readers produce the same shape, so a failure can print the two lines side by side. */
    private fun parsed(id: String, group: String, head: String, body: String?, splitOn: String): Parsed {
        val refine = ArrayList<Pair<String, String>>()
        for (entry in (body ?: "").split(splitOn).drop(1)) {
            val rid = quoted(entry).firstOrNull() ?: "?"
            if (linkOnly.contains("$id.$rid")) continue
            refine += rid to "$rid ${queryLine(entry)} first=${list(entry, "first")}"
        }
        // A need with choices carries no query of its own; without them, its query is on the need.
        val query = if (body == null) queryLine(head) else "cat=- mode=- prefer=-"
        val line = "$id group=$group first=${list(head, "first")} steps=${flag(head, "stepsOnly")} " +
            "sensitive=${flag(head, "sensitive")} exit=${flag(head, "quickExit")} " +
            "intro=${value(head, "intro") ?: "-"} " +
            "empty=${value(head, "emptyKey") ?: "-"} $query cats=${list(head, "categories")} also=${alsoLine(head)}"
        return Parsed(id, line, refine)
    }

    // ---- small readers, deliberately dull ------------------------------------------------------------------

    /**
     * Everything before the choices and everything after. Both files put a need's own settings before its
     * choices, so that the settings are never read out of a choice by mistake.
     */
    private fun split(s: String, marker: String): Pair<String, String?> {
        val at = s.indexOf(marker)
        return if (at < 0) s to null else s.substring(0, at) to s.substring(at + marker.length)
    }

    /**
     * A query written either way: `query: { category: 'x', mode: 'week', prefer: ['youth'] }` (TypeScript) or
     * `Query(category = "x", mode = "week", prefer = listOf("youth"))` (Kotlin, where a choice's query is the
     * second argument and has no name). `mode` defaults to "now" in both apps.
     */
    private fun queryLine(s: String): String {
        val chunk = when {
            s.contains("Query(") -> balanced(s, "Query(", '(', ')')
            s.contains("query: {") -> balanced(s, "query: {", '{', '}')
            else -> return "cat=- mode=- prefer=-"
        }
        return "cat=${value(chunk, "category") ?: "-"} mode=${value(chunk, "mode") ?: "now"} prefer=${list(chunk, "prefer")}"
    }

    /**
     * The second list under a need's own, written `also: { id: "support", query: { category: "x" } }`
     * (TypeScript) or `also = Also("support", Query(category = "x"))` (Kotlin). Both files write it AFTER the
     * need's own query, so `queryLine(head)` above still reads the need's own and this reads only this one.
     */
    private fun alsoLine(s: String): String {
        for (sep in listOf("also: ", "also = ")) {
            val at = s.indexOf(sep)
            if (at < 0) continue
            val rest = s.substring(at + sep.length)
            return "${quoted(rest).firstOrNull() ?: "?"}:${queryLine(rest)}"
        }
        return "-"
    }

    /** The id in the `also=` fragment of a parsed line, or null when that need has no second list. */
    private fun alsoId(line: String): String? {
        val at = line.indexOf("also=")
        if (at < 0) return null
        val rest = line.substring(at + "also=".length)
        val colon = rest.indexOf(':')
        return if (colon < 0) null else rest.substring(0, colon)
    }

    /** What is inside the brackets opened by `marker`, counting nesting. */
    private fun balanced(s: String, marker: String, open: Char, close: Char): String {
        val at = s.indexOf(marker)
        if (at < 0) return ""
        var depth = 1
        val out = StringBuilder()
        for (i in (at + marker.length) until s.length) {
            val ch = s[i]
            if (ch == open) depth++
            if (ch == close) {
                depth--
                if (depth == 0) break
            }
            out.append(ch)
        }
        return out.toString()
    }

    /** `name: 'x'`, `name: "x"` or `name = "x"`, and nothing else. */
    private fun value(s: String, name: String): String? {
        for (sep in listOf("$name: ", "$name = ")) {
            val at = s.indexOf(sep)
            if (at < 0) continue
            val rest = s.substring(at + sep.length)
            val q = rest.firstOrNull() ?: continue
            if (q != '\'' && q != '"') continue
            val end = rest.indexOf(q, 1)
            if (end > 0) return rest.substring(1, end)
        }
        return null
    }

    /** `name: true` or `name = true`. */
    private fun flag(s: String, name: String): Boolean = s.contains("$name: true") || s.contains("$name = true")

    /** `name: ['a', 'b']` or `name = listOf("a", "b")`, as `a|b`. Absent reads as `-`. */
    private fun list(s: String, name: String): String {
        val chunk = when {
            s.contains("$name: [") -> balanced(s, "$name: [", '[', ']')
            s.contains("$name = listOf(") -> balanced(s, "$name = listOf(", '(', ')')
            else -> return "-"
        }
        val items = quoted(chunk)
        return if (items.isEmpty()) "-" else items.joinToString("|")
    }

    /** Every single- or double-quoted run in a string, in order. */
    private fun quoted(s: String): List<String> {
        val out = ArrayList<String>()
        var current: StringBuilder? = null
        var quote = '\''
        for (ch in s) {
            val c = current
            if (c != null) {
                if (ch == quote) {
                    out += c.toString()
                    current = null
                } else {
                    c.append(ch)
                }
            } else if (ch == '\'' || ch == '"') {
                quote = ch
                current = StringBuilder()
            }
        }
        return out
    }

    /** `L.t("some.key"` where the key is whole: not a template and not a prefix the app finishes at run time. */
    private fun literalKeys(body: String): List<String> {
        val out = ArrayList<String>()
        var i = body.indexOf("L.t(\"")
        while (i >= 0) {
            val start = i + 5
            val end = body.indexOf('"', start)
            if (end < 0) break
            val key = body.substring(start, end)
            val after = body.substring(end + 1).trimStart()
            if (!key.contains("\$") && !after.startsWith("+")) out += key
            i = body.indexOf("L.t(\"", end)
        }
        return out
    }

    /** The one Swift file in apps/ios that declares `what`, wherever the iPhone app keeps it today. */
    private fun swiftFileDeclaring(what: String): File? =
        File(root, "apps/ios").walkTopDown()
            .filter { it.isFile && it.name.endsWith(".swift") }
            .firstOrNull { it.readText().contains(what) }

    private fun kotlinSources(): List<File> =
        (File(root, "apps/android/app/src/main/kotlin/org/help313/app").listFiles() ?: emptyArray())
            .filter { it.name.endsWith(".kt") }.sortedBy { it.name }

    /** A strings file is a flat object of strings; this reads it without a JSON library, in the app's own style. */
    private fun strings(path: String): Map<String, String> =
        org.help313.query.Json.parse(text(path)).obj.mapNotNull { (k, v) -> v.str?.let { k to it } }.toMap()
}

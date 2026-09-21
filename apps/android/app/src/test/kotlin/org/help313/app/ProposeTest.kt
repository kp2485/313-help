// "Add a place that helps" (Propose.kt): what a proposal is, what its body may carry, and what the queue does
// with one. Plain JVM, so `:core` runs it — these are the privacy rules, and a mistake in them is a leak.
package org.help313.app

import org.help313.query.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ProposeTest {

    private val root = File("../../..")

    private fun filled(extra: Map<String, String> = emptyMap()): MutableMap<String, String> {
        val form = HashMap<String, String>()
        form["name"] = "Third Street Pantry"
        form["category"] = "food"
        form["what"] = "Free groceries"
        form["how_known"] = "volunteer"
        form.putAll(extra)
        return form
    }

    // ---- the closed body ---------------------------------------------------------------------------------------

    /**
     * **Exactly the eight keys the API accepts, and nothing else.**
     *
     * `api/src/validate.ts` answers 400 to a ninth key, so this is not a style preference: a field added here by
     * accident would be a place that never reached a steward. The keys are read out of the body, not out of the
     * list they were written from, so this fails if the writer and the list ever disagree.
     */
    @Test
    fun theBodyCarriesExactlyTheKeysTheApiAccepts() {
        val p = buildProposal(
            filled(mapOf("address" to "1 Main St", "phone" to "313-555-0100", "schedule_text" to "Tuesdays 10-12", "notes" to "Ask at the side door")),
        )!!
        val body = Json.parse(p.toJson())
        assertEquals(PROPOSAL_KEYS.sorted(), body.obj.keys.sorted())
        assertEquals("Third Street Pantry", body["name"]?.str)
        assertEquals("food", body["category"]?.str)
        assertEquals("volunteer", body["how_known"]?.str)
        // Nothing about the person is in it, by name or by shape: no secret, no hash, no coordinate, no id.
        val text = p.toJson()
        for (word in listOf("install", "nonce", "client", "lat", "lon", "device", "id\"")) {
            assertFalse("the body carries \"$word\": $text", text.contains(word))
        }
    }

    /** A blank optional field is left OUT of the body, never sent as an empty string. */
    @Test
    fun blankOptionalFieldsAreLeftOut() {
        val p = buildProposal(filled())!!
        val body = Json.parse(p.toJson())
        assertEquals(listOf("category", "how_known", "name", "what"), body.obj.keys.sorted())
        assertNull(body["address"])
        assertNull(body["notes"])
    }

    @Test
    fun aValueLongerThanTheApiAcceptsIsCutRatherThanRefused() {
        val long = "x".repeat(500)
        val p = buildProposal(filled(mapOf("name" to long, "notes" to long)))!!
        assertEquals(PROPOSAL_LIMITS.getValue("name"), p.name.length)
        assertEquals(PROPOSAL_LIMITS.getValue("notes"), p.notes!!.length)
    }

    @Test
    fun whatIsTypedIsTrimmed() {
        val p = buildProposal(filled(mapOf("name" to "  Third Street Pantry  ")))!!
        assertEquals("Third Street Pantry", p.name)
    }

    @Test
    fun quotesAndNewlinesSurviveAsJson() {
        val p = buildProposal(filled(mapOf("name" to "The \"Old\" Church", "notes" to "line one\nline two")))!!
        val body = Json.parse(p.toJson())
        assertEquals("The \"Old\" Church", body["name"]?.str)
        assertEquals("line one\nline two", body["notes"]?.str)
    }

    // ---- what a person has to fill in --------------------------------------------------------------------------

    @Test
    fun theFourRequiredFieldsEachHaveTheirOwnComplaint() {
        assertEquals(PROPOSAL_REQUIRED, proposalErrors(emptyMap()))
        assertEquals(listOf("category"), proposalErrors(filled(mapOf("category" to ""))))
        assertEquals(listOf("what"), proposalErrors(filled(mapOf("what" to "   "))))
        assertEquals(listOf("how_known"), proposalErrors(filled(mapOf("how_known" to "because"))))
        // A category the API does not accept is the same as none picked.
        assertEquals(listOf("category"), proposalErrors(filled(mapOf("category" to "shelter.dv"))))
        assertEquals(emptyList<String>(), proposalErrors(filled()))
        assertNull(buildProposal(emptyMap()))
        assertNotNull(buildProposal(filled()))
    }

    /**
     * **A domestic-violence shelter is not on the list of kinds.** Those addresses must never be collected
     * anywhere in this system (docs/08, CLAUDE.md), so the picker does not offer the category and a form carrying
     * it builds nothing at all.
     */
    @Test
    fun thereIsNoWayToProposeADomesticViolenceShelter() {
        assertFalse(PROPOSE_CATEGORIES.contains("shelter.dv"))
        assertFalse(PROPOSE_CATEGORIES.any { isSensitive(it) })
        assertNull(buildProposal(filled(mapOf("category" to "shelter.dv", "address" to "1 Secret Way"))))
    }

    // ---- the same rules as the other two apps ---------------------------------------------------------------------

    /** The kinds, the ways of knowing, the caps and the keys are the web's and the API's, not a second opinion. */
    @Test
    fun theSchemaIsTheOneTheApiAndTheWebAgreeOn() {
        val api = File(root, "api/src/validate.ts").readText()
        val keys = Regex("closed\\(body, \\[([^\\]]+)\\]\\)")
            .findAll(api).map { m -> Regex("'([a-z_]+)'").findAll(m.groupValues[1]).map { it.groupValues[1] }.toList() }
            .firstOrNull { it.contains("how_known") }
        assertNotNull("api/src/validate.ts no longer declares the proposal's closed key list", keys)
        assertEquals("the API accepts different keys from the ones this app sends", keys, PROPOSAL_KEYS)

        val web = File(root, "apps/web/src/propose.ts").readText()
        val webCategories = Regex("PROPOSE_CATEGORIES = \\[([^\\]]+)\\]").find(web)?.groupValues?.get(1)
            ?.let { Regex("'([a-z.]+)'").findAll(it).map { m -> m.groupValues[1] }.toList() }
        assertEquals("the two apps offer different kinds of help", webCategories, PROPOSE_CATEGORIES)
        val webHow = Regex("HOW_KNOWN = \\[([^\\]]+)\\]").find(web)?.groupValues?.get(1)
            ?.let { Regex("'([a-z_]+)'").findAll(it).map { m -> m.groupValues[1] }.toList() }
        assertEquals("the two apps offer different ways of knowing", webHow, HOW_KNOWN)
        val webLimits = Regex("LIMITS = \\{([^}]+)\\}").find(web)?.groupValues?.get(1)
            ?.let { Regex("(\\w+): (\\d+)").findAll(it).associate { m -> m.groupValues[1] to m.groupValues[2].toInt() } }
        assertEquals("the two apps cut typed values at different lengths", webLimits, PROPOSAL_LIMITS)
    }

    // ---- the queue -------------------------------------------------------------------------------------------------

    @Test
    fun aProposalSurvivesTheQueueFile() {
        val p = buildProposal(filled(mapOf("address" to "1 Main St")))!!
        val stored = ProposalOutbox.read(ProposalOutbox.write(listOf(p)))
        assertFalse(stored.unreadable)
        assertEquals(1, stored.items.size)
        assertEquals(p.toJson(), stored.items[0].toJson())
    }

    /** A file that is not a queue is kept as unreadable, never guessed at and never quietly emptied. */
    @Test
    fun aHalfWrittenQueueIsUnreadableRatherThanEmpty() {
        assertTrue(ProposalOutbox.read("[{\"name\":\"half").unreadable)
        assertTrue(ProposalOutbox.read("{}").unreadable)
        // A queue holding something the API would refuse is not a queue we wrote.
        assertTrue(ProposalOutbox.read("[{\"name\":\"x\",\"category\":\"food\",\"what\":\"y\",\"how_known\":\"heard\",\"who\":\"me\"}]").unreadable)
        assertFalse(ProposalOutbox.read(null).unreadable)
        assertFalse(ProposalOutbox.read("").unreadable)
        assertEquals(0, ProposalOutbox.read("[]").items.size)
    }

    @Test
    fun theQueueKeepsTheNewestTenAndWhatArrivedDuringAFlush() {
        val many = (1..15).map { buildProposal(filled(mapOf("name" to "Place $it")))!! }
        val stored = ProposalOutbox.read(ProposalOutbox.write(many))
        assertEquals(ProposalOutbox.MAX_QUEUED, stored.items.size)
        assertEquals("Place 15", stored.items.last().name)

        // A flush took two, one failed, and a third was typed while it was on the network: all three are kept.
        val tried = many.take(2)
        val left = listOf(many[1])
        val current = tried + many[5]
        assertEquals(
            listOf(many[1].name, many[5].name),
            ProposalOutbox.merge(tried, left, current).map { it.name },
        )
    }
}

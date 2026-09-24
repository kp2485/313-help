// "Type a ZIP code", wherever this app offers "Use my location" — the Home and category lists, the Map tab when
// the location was refused, and the Neighborhoods tab.
//
// It is the answer for the person who will not hand over their location, and for the phone that will not give one:
// a ZIP is a hundred thousand people, it is typed on purpose, and it costs nothing to be wrong about. **It stays
// on the phone**: it sorts a list and moves a map while the app is open and is never written to a file, never put
// in a link, never sent, and never kept in a Route (Zip.kt says the same thing at more length).
//
// The rules — what counts as a ZIP, and the point at the middle of one — are Zip.kt, which `:core` runs on a plain
// JDK. This file is the field and the two sentences around it.
package org.help313.app

import android.os.Handler
import android.os.Looper
import android.widget.LinearLayout
import org.help313.query.LatLon

/**
 * The ZIP centres, read lazily and verified, exactly as the map's layers and the neighborhood numbers are.
 *
 * `places/zips.json` is small and is already checksummed at start, but it is *parsed* only when somebody is about
 * to type a ZIP — and through [BundleStore.verifiedBytes], so the bytes are checked against the sha256 in the
 * signed index before they are decoded, wherever they came from.
 */
object ZipRepo {

    private val main = Handler(Looper.getMainLooper())

    @Volatile
    var zips: Map<String, LatLon> = emptyMap()
        private set

    private var key = ""
    private var asking = false

    @Synchronized
    private fun claim(want: String): Boolean {
        if (asking || key == want) return false
        asking = true
        return true
    }

    /** Asks for the file if it is not already held. Returns at once; [then] runs on the main thread when it is. */
    fun want(store: BundleStore, then: () -> Unit) {
        val want = store.bundle?.index?.files?.get(ZIP_FILE)?.sha256 ?: return
        if (!claim(want)) return
        Work.io {
            val read = try {
                decodeZips(store.verifiedBytes(ZIP_FILE))
            } catch (t: Throwable) {
                if (!BuildConfig.IS_RELEASE) android.util.Log.w("Help313", "ZIP centres failed: $t")
                emptyMap()
            }
            synchronized(this) {
                key = want
                zips = read
                asking = false
            }
            main.post { then() }
        }
    }
}

object ZipBox {

    /**
     * The control, appended to a column a screen has already started.
     *
     * Two states and no more. With a ZIP in use it says which one and offers to stop using it; without one it is a
     * numeric field and a button. A ZIP that is not five digits, that the bundle does not carry, or whose middle is
     * outside the service area all get the same plain sentence beside the field — none of them is a reason to guess
     * at a coordinate.
     */
    fun add(a: MainActivity, col: LinearLayout) {
        ZipRepo.want(a.store) { if (a.zipWanted) a.render() }
        val using = a.nearZip
        if (using != null) {
            col.addView(UI.text(a, L.t("loc.zip_using", "zip" to using), 15f, R.color.muted, topDp = 8))
            col.addView(
                UI.button(a, L.t("loc.zip_off"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    a.clearZip()
                },
            )
            return
        }
        if (!a.zipWanted) {
            col.addView(
                UI.button(a, L.t("loc.zip"), backgroundId = R.drawable.pill_soft, textColorId = R.color.brand_soft_ink) {
                    a.zipWanted = true
                    a.render()
                },
            )
            return
        }
        // Numeric, five digits, and told not to be autofilled or learned from, exactly as the search box and the
        // report note are (UI.field): a ZIP is something a person typed about themselves.
        val box = UI.field(a, L.t("loc.zip_label"), L.t("loc.zip_label"), suggestions = false, numeric = true)
        box.filters = arrayOf(android.text.InputFilter.LengthFilter(5))
        col.addView(box)
        val problem = UI.text(a, "", 15f, R.color.warn_ink, topDp = 4)
        problem.visibility = android.view.View.GONE
        col.addView(problem)
        col.addView(
            UI.button(a, L.t("loc.zip_go")) {
                when (val answer = lookupZip(ZipRepo.zips, box.text.toString())) {
                    is ZipAnswer.Found -> a.useZip(answer.zip, answer.point)
                    else -> {
                        // One sentence for all three refusals: none of them is a reason to guess at a point.
                        problem.text = L.t("loc.zip_unknown")
                        problem.visibility = android.view.View.VISIBLE
                        // Said out loud as well as shown, so it reaches somebody who cannot see the field.
                        problem.announceForAccessibility(problem.text)
                        box.contentDescription = joinParts(listOf(L.t("loc.zip_label"), problem.text.toString()))
                        if (answer is ZipAnswer.NotAZip) box.requestFocus()
                    }
                }
            },
        )
    }
}

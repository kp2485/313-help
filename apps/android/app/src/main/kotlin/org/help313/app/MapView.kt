// The map itself: one `android.view.View`, painted on an `android.graphics.Canvas`. No Compose, no AndroidX, no
// map library, no tile server (DECISIONS 2026-09-18, "The app draws its own street map from City of Detroit open
// data"). A port of `draw()` in apps/web/src/map.ts and of apps/ios/HelpApp/MapCanvas.swift, in the same order,
// with the same rules about what appears at which zoom — so the three apps draw the same city.
//
// Three things about this file are not decoration:
//
//  - **Everything is batched per layer.** One `Path` for all the class-3 streets, one for all the bus routes, one
//    `drawPoints` call for all five thousand bus stops. Filling five thousand circles one at a time is what makes
//    a cheap phone stutter while a finger is on the screen.
//  - **No colour is written here.** The rules in MapLayers.kt carry a token name and MapPalette.kt turns it into a
//    number, so dark mode, the contrast fixes and the coming "subway" style (docs/MAP-STYLE.md) are all one table.
//  - **A custom View is opaque to TalkBack**, so the things on the map are offered as real virtual nodes through a
//    platform `AccessibilityNodeProvider` — not as "a map, image". See [Nodes] at the bottom.
//
// Everything is drawn in density-independent pixels: the canvas is scaled by the display density once, so every
// width, radius and tolerance below is the same physical size as the dp in MapLayers.kt and on the other two apps.
package org.help313.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.view.GestureDetector
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityNodeProvider
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Everything one frame needs, handed to the painter and nothing else. One of these is made per view and filled in
 * again each frame rather than allocated in `onDraw`: an allocation there is a garbage collection in the middle of
 * a drag (lint's DrawAllocation, and the reason a cheap phone stutters).
 */
class MapScene {
    var camera: MapCamera = MapCamera(0.0, 0.0, MapCamera.MIN_SCALE, 1.0, 1.0)
    var base: BaseMap? = null
    var drawParks = true
    var overlays: List<MapOverlay> = emptyList()
    var segments: List<DrawnSegment> = emptyList()
    /** The stretch a person is looking at: drawn bright, with the rest dimmed. */
    var focus: String? = null
    var dots: List<DrawnDot> = emptyList()
    var me: org.help313.query.LatLon? = null

    /** One chosen trip, drawn over everything else on the map (DirWords.dirRoute). Null on every other screen. */
    var route: DirRoute? = null
}

/** One thing on the map a TalkBack user, a keyboard or a switch can reach. The picture is what the eye gets. */
class MapFeature(
    val id: String,
    val label: String,
    val selection: MapSelection,
    /** Where the ring and the accessibility node go, in dp on the screen. */
    val cx: Double,
    val cy: Double,
    val halfWidth: Double,
    val halfHeight: Double,
)

class MapView(context: Context) : View(context) {

    private companion object {
        /** How long an animated zoom takes. About a fifth of a second: long enough to follow, short enough to feel
         *  like the map answered the tap rather than thought about it. */
        const val ZOOM_MS = 200.0
    }

    private val palette = MapPalette(context)
    private val scene = MapScene()
    private val density = resources.displayMetrics.density

    /** Set by the Map screen: what to draw, and what to do when something is chosen. */
    var overlays: List<MapOverlay> = emptyList()
    var greenwayOn = true
    var parksOn = true

    /** Our own listing dots. Off on a map that is about one trip: the trip's own markers are what it shows. */
    var dotsOn = true
    var here: org.help313.query.LatLon? = null

    /**
     * One chosen trip, drawn over the basemap, the layers and the greenway alike: on the Directions screen the map
     * is about this trip and nothing else. Null everywhere else, and then not one line of the route passes below
     * runs (DECISIONS 2026-09-22).
     */
    var route: DirRoute? = null

    /**
     * A camera of this view's own, instead of the Map tab's shared one.
     *
     * The Map tab keeps its camera in [MapModel] so that the city is where the person left it when they come back.
     * A trip is not that: it is one picture of one route, it has to open showing the whole of it, and moving it
     * must not move the Map tab out from under the person. So the Directions screen sets this, and then this view
     * reads and writes only this field. It also stops answering fingers: the trip's map is a picture beside the
     * numbered steps, which are the source of truth, and a map that can be dragged off the route is worse than one
     * that cannot be dragged at all.
     */
    var localCamera: MapCamera? = null

    /** The camera in force: this view's own if it has one, else the Map tab's. */
    private fun cameraNow(): MapCamera = localCamera ?: MapModel.camera

    /** Open on the whole of these points, with at least [minMetres] across, in this view's own camera. */
    fun fitLocally(points: List<org.help313.query.LatLon>, minMetres: Double) {
        val cam = localCamera ?: return
        if (points.isEmpty()) return
        val box = MapBox.aroundPoints(points)
        val across = max(box.width * MapProjection.METERS_PER_UNIT, minMetres)
        val centre = org.help313.query.LatLon(MapProjection.lat(box.centerY), MapProjection.lon(box.centerX))
        localCamera = MapCamera.forRadius(centre, across / 2, cam.width, cam.height)
        invalidate()
    }

    /** Keep a point in view while somebody walks, in this view's own camera. Nothing about it is written down. */
    fun centreLocally(at: org.help313.query.LatLon, metres: Double) {
        val cam = localCamera ?: return
        localCamera = MapCamera.forRadius(at, metres, cam.width, cam.height)
        invalidate()
    }

    /**
     * The `subway` style's networks, hubs and selected route — or null, which is `standard`, and then not one line
     * of MapSubway.kt runs and nothing below draws differently from how it always has (docs/MAP-STYLE.md).
     */
    var subway: SubwayScene? = null
        set(value) {
            field = value
            if (value == null) painter.forget()
        }

    /**
     * The map's own floating controls and the open card, in dp: entered as taken space before any badge or name is
     * placed, so nothing is drawn under a button (docs/MAP-STYLE.md 7.5). Set by the Map screen after each layout.
     */
    var controlBoxes: List<LabelRect> = emptyList()

    private val painter = SubwayPainter(palette)

    /** Badges and their labels follow the phone's text size, up to × 1.5. */
    private val textScale = subwayTextScale(resources.configuration.fontScale.toDouble())
    var onSelect: (MapSelection?) -> Unit = {}
    var onCameraMoved: () -> Unit = {}

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val dots = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val textFill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        isFakeBoldText = true
    }
    private val textHalo = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        isFakeBoldText = true
        style = Paint.Style.STROKE
        strokeJoin = Paint.Join.ROUND
    }

    init {
        isFocusable = true
        isFocusableInTouchMode = false
        isClickable = true
        setWillNotDraw(false)
        contentDescription = L.t("map.label_tab")
        // A dash on a Path is ignored by the hardware canvas before Android 9, and the greenway's phases are told
        // apart by their dashes as well as by their colours. On those releases the view draws into a software
        // layer instead: slower, and correct, which is the right way round for an accessibility rule.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) setLayerType(LAYER_TYPE_SOFTWARE, null)
    }

    // ---- size and camera ----------------------------------------------------------------------------------

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        val own = localCamera
        if (own != null) {
            localCamera = own.resized(w / density.toDouble(), h / density.toDouble()).clamped()
            onLocalSized()
            return
        }
        MapModel.resize(w / density.toDouble(), h / density.toDouble())
    }

    /** Called after this view's own camera learns its size, so the Directions screen can fit the trip into it. */
    var onLocalSized: () -> Unit = {}

    private fun moved() {
        invalidate()
        onCameraMoved()
    }

    // ---- gestures: platform classes only -------------------------------------------------------------------
    //
    // Everything a person expects of a phone map, out of `GestureDetector` and `ScaleGestureDetector` and nothing
    // else — no library, no AndroidX. What is deliberately **not** here is rotation and tilt: north stays up, so
    // the city on the screen matches the city outside, the street names stay the right way up, and the N/P walk
    // and the TalkBack node order stay the plain south-to-north order they are.
    //
    //   drag          one finger moves the map, and a flick carries on and settles (see [fling]).
    //   pinch         two fingers zoom about the point between them **and pan with it**, so a hand that spreads
    //                 and slides at once does both, as it does everywhere else on a phone.
    //   double tap    zooms in about the tap, over about a fifth of a second.
    //   double-drag   the "quick scale" every Android map has: double tap and, without lifting, drag up or down
    //                 to zoom with one thumb. `ScaleGestureDetector` does it, and the double-tap handler below is
    //                 careful not to swallow it.
    //   two-finger    one tap with two fingers zooms out, the counterpart of the double tap.
    //   tap           selects what is under it — only a touch that moved less than the system's own slop and was
    //                 never part of a two-finger gesture.
    //
    // Nothing animates when the phone's animations are switched off (Settings > Accessibility > Remove animations,
    // which sets the animator duration scale to 0). A flick with momentum and a zoom that glides are motion, and a
    // person who has asked for none gets the same map, instantly (WCAG 2.3.3).

    private val slop = android.view.ViewConfiguration.get(context).scaledTouchSlop
    private val tapTimeout = android.view.ViewConfiguration.getDoubleTapTimeout().toLong()

    /** True while more than one finger is, or has been, down in this gesture: then a lift is never a tap. */
    private var multiTouch = false
    private var sawRealScale = false
    private var twoFingerAt = 0L
    private var twoFingerX = 0f
    private var twoFingerY = 0f
    private var gestureMoved = 0f
    private var downX = 0f
    private var downY = 0f
    private var lastFocusX = 0f
    private var lastFocusY = 0f

    /** Whether this phone has been asked to do without motion. Read each time: it can change while the app is open. */
    /**
     * What the fingers did, in one line, Debug only. It is here for the same reason [MapFrameClock] is: a gesture
     * either fired or it did not, and on a map that is otherwise only checkable by eye that is worth being able to
     * read rather than guess at. Nothing about a person is in it — a gesture name and a number of dp — and it
     * never runs in a release build.
     */
    private fun say(what: String) {
        if (!BuildConfig.IS_RELEASE) android.util.Log.i("Help313Gesture", what)
    }

    private fun animationsOn(): Boolean = try {
        android.provider.Settings.Global.getFloat(
            context.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f,
        ) != 0f
    } catch (_: Throwable) {
        true
    }

    private val gestures = GestureDetector(
        context,
        object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent): Boolean = true

            override fun onScroll(e1: MotionEvent?, e2: MotionEvent, dx: Float, dy: Float): Boolean {
                if (scale.isInProgress) return false
                // GestureDetector reports how far the *content* moved, which is the opposite of the finger.
                MapModel.pan(-dx / density.toDouble(), -dy / density.toDouble())
                ring = null
                moved()
                return true
            }

            override fun onFling(e1: MotionEvent?, e2: MotionEvent, vx: Float, vy: Float): Boolean {
                if (multiTouch || scale.isInProgress) return false
                startFling(vx / density.toDouble(), vy / density.toDouble())
                return true
            }

            override fun onSingleTapUp(e: MotionEvent): Boolean {
                if (multiTouch) return false
                ring = null
                // The platform's own click path, so a screen reader's or a switch's "activate" lands here too.
                performClick()
                val x = e.x / density.toDouble()
                val y = e.y / density.toDouble()
                val scene = subway
                onSelect(
                    if (scene == null) {
                        MapModel.pick(x, y, overlays, greenwayOn, parksOn)
                    } else {
                        // A person taps what they see: the glyphs and the shifted lines of the last frame.
                        MapModel.pick(
                            x, y, overlays, greenwayOn, parksOn,
                            glyph = { painter.pickGlyph(x, y) },
                            line = { painter.pickLine(x, y, MapModel.camera) },
                        )
                    },
                )
                invalidate()
                return true
            }

            /**
             * Zoom in on the **second tap's lift**, and only when that second touch did not become a drag.
             *
             * Not `onDoubleTap`, which fires on the second touch going *down*: that is the same moment
             * `ScaleGestureDetector`'s quick scale begins, so zooming there would fire a full zoom step at the
             * start of every one-thumb zoom and fight the drag that follows.
             */
            override fun onDoubleTapEvent(e: MotionEvent): Boolean {
                if (e.actionMasked != MotionEvent.ACTION_UP) return false
                if (scale.isInProgress) return false
                if (kotlin.math.abs(e.x - downX) > slop || kotlin.math.abs(e.y - downY) > slop) return false
                say("double tap: zoom in about ${e.x.toInt()}, ${e.y.toInt()}")
                zoomAbout(1.8, e.x / density.toDouble(), e.y / density.toDouble())
                return true
            }

            override fun onLongPress(e: MotionEvent) = Unit
        },
    )

    private val scale = ScaleGestureDetector(
        context,
        object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
                lastFocusX = detector.focusX
                lastFocusY = detector.focusY
                return true
            }

            override fun onScale(detector: ScaleGestureDetector): Boolean {
                // The middle of the fingers carries the map with it as well as changing its scale: the span alone
                // would zoom about a point that has itself moved, which reads as the map sliding out from under
                // the hand. Both, in one step, about where the fingers now are (MapCamera.pinched).
                val dx = (detector.focusX - lastFocusX) / density.toDouble()
                val dy = (detector.focusY - lastFocusY) / density.toDouble()
                lastFocusX = detector.focusX
                lastFocusY = detector.focusY
                if (kotlin.math.abs(detector.scaleFactor - 1f) > 0.005f && !sawRealScale) {
                    sawRealScale = true
                    say(if (multiTouch) "pinch: two fingers, zoom and pan together" else "quick scale: one finger, double tap and drag")
                }
                MapModel.pinch(
                    dx, dy, detector.scaleFactor.toDouble(),
                    detector.focusX / density.toDouble(), detector.focusY / density.toDouble(),
                )
                ring = null
                moved()
                return true
            }
        },
    ).apply {
        // Double tap and drag to zoom with one thumb. On by default since API 19, said out loud because the
        // double-tap handler above is written around it.
        isQuickScaleEnabled = true
    }

    // Lint wants performClick() called from onTouchEvent itself. It is called — from the GestureDetector's
    // onSingleTapUp, above — which is the pattern the platform's own documentation gives for a view that
    // has to tell a tap from a drag. Lint cannot see through the detector, so the check is answered here in words.
    @Suppress("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        // A trip's map is a picture beside the numbered steps, which are the source of truth. It does not pan, it
        // does not zoom and it opens no card: every gesture below drives the Map tab's shared camera, and a map
        // that can be dragged off the route would be worse than one that cannot be dragged at all. The scrolling
        // screen it sits in keeps the gesture instead.
        if (localCamera != null) return false
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                // Whatever is underneath — a scroller today, a pager tomorrow — does not get this gesture. Given
                // back on the way up, so the rest of the screen is never left unable to scroll.
                parent?.requestDisallowInterceptTouchEvent(true)
                stopFling()
                stopZoomAnimation()
                requestFocus()
                multiTouch = false
                sawRealScale = false
                gestureMoved = 0f
                downX = event.x
                downY = event.y
                twoFingerAt = 0L
            }
            MotionEvent.ACTION_POINTER_DOWN -> {
                multiTouch = true
                if (event.pointerCount == 2) {
                    twoFingerAt = event.eventTime
                    twoFingerX = (event.getX(0) + event.getX(1)) / 2
                    twoFingerY = (event.getY(0) + event.getY(1)) / 2
                    gestureMoved = 0f
                }
            }
            MotionEvent.ACTION_MOVE -> {
                if (event.pointerCount >= 2) {
                    val mx = (event.getX(0) + event.getX(1)) / 2
                    val my = (event.getY(0) + event.getY(1)) / 2
                    gestureMoved = max(gestureMoved, kotlin.math.hypot(mx - twoFingerX, my - twoFingerY))
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                parent?.requestDisallowInterceptTouchEvent(false)
                // One tap with two fingers zooms out — the counterpart of the double tap, and the gesture every
                // other map on the phone answers. It is a tap only if the fingers never really spread, never
                // really moved, and were down for no longer than a double tap.
                if (event.actionMasked == MotionEvent.ACTION_UP && twoFingerAt != 0L && !sawRealScale &&
                    gestureMoved <= slop * 2 && event.eventTime - twoFingerAt <= tapTimeout
                ) {
                    say("two-finger tap: zoom out")
                    zoomAbout(1 / 1.6, twoFingerX / density.toDouble(), twoFingerY / density.toDouble())
                }
                twoFingerAt = 0L
            }
        }
        scale.onTouchEvent(event)
        gestures.onTouchEvent(event)
        return true
    }

    // ---- what carries on after the finger ---------------------------------------------------------------------

    private var fling: MapFling? = null
    private var flingStartedAt = 0L
    private var flingWasAt = 0.0

    private val flingFrame = Runnable { stepFling() }

    private fun startFling(vx: Double, vy: Double) {
        stopFling()
        if (!animationsOn()) {
            say("fling: none, this phone is set to do without motion")
            return
        }
        if (kotlin.math.hypot(vx, vy) < MapFling.MIN_SPEED) return
        val f = MapFling(vx, vy)
        say("fling: ${kotlin.math.hypot(vx, vy).toInt()} dp/s, ${f.distance.toInt()} dp over ${(f.duration * 1000).toInt()} ms")
        fling = f
        flingStartedAt = android.os.SystemClock.uptimeMillis()
        flingWasAt = 0.0
        postOnAnimation(flingFrame)
    }

    private fun stepFling() {
        val f = fling ?: return
        val t = (android.os.SystemClock.uptimeMillis() - flingStartedAt) / 1000.0
        val wasX = MapModel.camera.centerX
        val wasY = MapModel.camera.centerY
        MapModel.pan(f.offsetX(t) - f.offsetX(flingWasAt), f.offsetY(t) - f.offsetY(flingWasAt))
        flingWasAt = t
        moved()
        // Done when the flick has run out, or when the camera's own clamp has stopped it at the edge of the city:
        // there is no second set of bounds here that could disagree with MapCamera.
        val stuck = MapModel.camera.centerX == wasX && MapModel.camera.centerY == wasY
        if (f.isDone(t) || (stuck && t > 0.05)) {
            say("fling: stopped after ${(t * 1000).toInt()} ms" + if (stuck) ", at the edge of the city" else "")
            stopFling()
        } else {
            postOnAnimation(flingFrame)
        }
    }

    private fun stopFling() {
        fling = null
        removeCallbacks(flingFrame)
    }

    /** A zoom that glides, about a point on the screen — or, when the phone is set to do without motion, one step. */
    private var zoomTotal = 0.0
    private var zoomAtX = 0.0
    private var zoomAtY = 0.0
    private var zoomStartedAt = 0L
    private var zoomWasAt = 0.0

    private val zoomFrame = Runnable { stepZoom() }

    private fun zoomAbout(total: Double, x: Double, y: Double) {
        stopZoomAnimation()
        ring = null
        if (!animationsOn()) {
            MapModel.zoom(total, x, y)
            moved()
            return
        }
        zoomTotal = total
        zoomAtX = x
        zoomAtY = y
        zoomStartedAt = android.os.SystemClock.uptimeMillis()
        zoomWasAt = 0.0
        postOnAnimation(zoomFrame)
    }

    private fun stepZoom() {
        if (zoomTotal == 0.0) return
        val progress = min(1.0, (android.os.SystemClock.uptimeMillis() - zoomStartedAt) / ZOOM_MS)
        MapModel.zoom(mapZoomStep(zoomTotal, zoomWasAt, progress), zoomAtX, zoomAtY)
        zoomWasAt = progress
        moved()
        if (progress >= 1.0) stopZoomAnimation() else postOnAnimation(zoomFrame)
    }

    private fun stopZoomAnimation() {
        zoomTotal = 0.0
        removeCallbacks(zoomFrame)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        stopFling()
        stopZoomAnimation()
    }

    override fun performClick(): Boolean = super.performClick()

    // ---- the keyboard, the same keys as the web map ----------------------------------------------------------

    /** The feature the keyboard is on, or null. Put away as soon as a finger touches the map. */
    private var ring: String? = null

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        // A trip's map does not move (see onTouchEvent), so the keys that move one belong to the screen around it.
        if (localCamera != null) return super.onKeyDown(keyCode, event)
        val step = 60.0
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT -> MapModel.pan(step, 0.0)
            KeyEvent.KEYCODE_DPAD_RIGHT -> MapModel.pan(-step, 0.0)
            KeyEvent.KEYCODE_DPAD_UP -> MapModel.pan(0.0, step)
            KeyEvent.KEYCODE_DPAD_DOWN -> MapModel.pan(0.0, -step)
            KeyEvent.KEYCODE_PLUS, KeyEvent.KEYCODE_EQUALS, KeyEvent.KEYCODE_NUMPAD_ADD -> MapModel.zoom(1.5)
            KeyEvent.KEYCODE_MINUS, KeyEvent.KEYCODE_NUMPAD_SUBTRACT -> MapModel.zoom(1 / 1.5)
            KeyEvent.KEYCODE_N -> return walk(1)
            KeyEvent.KEYCODE_P -> return walk(-1)
            KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                val at = features().firstOrNull { it.id == ring } ?: return false
                onSelect(at.selection)
                return true
            }
            KeyEvent.KEYCODE_ESCAPE -> {
                // Escape steps out of the features first: one Escape, one thing.
                if (ring == null) return false
                ring = null
                invalidate()
                announce(L.t("map.focus_off"))
                return true
            }
            else -> return super.onKeyDown(keyCode, event)
        }
        moved()
        return true
    }

    /** N and P walk what is on screen. Tab is deliberately not bound, so it still leaves the map (WCAG 2.1.2). */
    private fun walk(direction: Int): Boolean {
        val list = features()
        if (list.isEmpty()) {
            ring = null
            invalidate()
            announce(L.t("map.focus_none"))
            return true
        }
        val at = list.indexOfFirst { it.id == ring }
        val next = list[if (at < 0) (if (direction > 0) 0 else list.size - 1) else (at + direction + list.size) % list.size]
        ring = next.id
        // A ring half off the edge is a ring that is obscured (WCAG 2.4.11): bring it to the middle first.
        val margin = 40.0
        val cam = MapModel.camera
        if (next.cx < margin || next.cy < margin || next.cx > cam.width - margin || next.cy > cam.height - margin) {
            MapModel.pan(cam.width / 2 - next.cx, cam.height / 2 - next.cy)
        }
        invalidate()
        onCameraMoved()
        announce(next.label + " " + L.t("map.focus_hint"))
        return true
    }

    private fun announce(words: String) = announceForAccessibility(words)

    // ---- what is on the map, in reading order -----------------------------------------------------------------

    /**
     * Everything a keyboard or TalkBack may land on, in a stable, meaningful order: the greenway first, stretch by
     * stretch along the route from south to north, then the places on screen, the one nearest the middle first.
     * Exactly the order apps/web/src/map.ts `orderFeatures` and apps/ios MapScreen use.
     *
     * The dots are [MapModel.dots], which came through [mapDrawable]: a domestic-violence or treatment listing is
     * not in this list, cannot be hit-tested and cannot be read out, because it was never a dot to begin with.
     */
    fun features(): List<MapFeature> {
        val cam = cameraNow()
        // A map that is about one trip reads out that trip: where it starts, every place a bus is got on or off,
        // and where it ends, in the order they happen. Nothing else on this map is a node, because nothing else
        // on it is what the screen is about (DECISIONS 2026-09-22).
        route?.let { return routeFeatures(it, cam) }
        val key = "${MapModel.version}|${cam.centerX}|${cam.centerY}|${cam.scale}|${cam.width}|${cam.height}|" +
            "$greenwayOn|${MapModel.selection?.key}|${subway != null}|${L.current()}"
        if (key == featuresKey) return featuresHeld
        val existing = standardFeatures(cam)
        val scene = subway
        val all = if (scene == null) {
            featuresMore = 0
            existing
        } else {
            val added = subwayFeatures(scene, cam)
            featuresMore = added.more
            featureOrder(existing, added.hubs, added.terminals, added.interchanges, added.routes).items
        }
        featuresKey = key
        featuresHeld = all
        return all
    }

    /** The markers of one trip, in the order they happen: start, board, get off, board, get off, end. */
    private fun routeFeatures(r: DirRoute, cam: MapCamera): List<MapFeature> =
        r.marks.mapIndexed { i, m ->
            MapFeature(
                id = "trip:$i",
                label = joinParts(listOf(m.label, m.sub)),
                selection = MapSelection.TripStop(i, m.label),
                cx = cam.screenX(MapProjection.x(m.lon)),
                cy = cam.screenY(MapProjection.y(m.lat)),
                halfWidth = 22.0, halfHeight = 22.0,
            )
        }

    /** One walk of the map per camera position, not one per accessibility node: TalkBack asks node by node. */
    private var featuresKey = ""
    private var featuresHeld: List<MapFeature> = emptyList()

    /** How many hubs, ends, interchanges and routes the 40 left out. Said with the map's own name; the list has all. */
    private var featuresMore = 0

    private class SubwayFeatures(
        val hubs: List<MapFeature>, val terminals: List<MapFeature>,
        val interchanges: List<MapFeature>, val routes: List<MapFeature>, val more: Int,
    )

    /**
     * What the subway style ADDS to the reading order, and only ever after what `standard` reads (docs/MAP-STYLE.md
     * section 9): hubs, then the ends of routes and the interchanges in view, nearest the middle first, then the
     * routes in view in rider order. [featureOrder] holds the caps — every hub, 8 ends, 20 interchanges, 40 in all —
     * so that downtown, where a hundred interchanges are on screen, TalkBack and the N/P walk still reach a route.
     */
    private fun subwayFeatures(scene: SubwayScene, cam: MapCamera): SubwayFeatures {
        val band = zoomBand(cam.metersPerPoint, painter.band)
        val plan = stationsFor(band, cam.metersPerPoint, scene.selected != null)
        val view = cam.visible
        fun at(x: Double, y: Double) = hypot(x - cam.centerX, y - cam.centerY)
        fun feature(id: String, label: String, sel: MapSelection, x: Double, y: Double) =
            MapFeature(id, label, sel, cam.screenX(x), cam.screenY(y), SUBWAY_HIT_BOX / 2, SUBWAY_HIT_BOX / 2)

        val hubs = scene.hubs.filter { it.shows(scene.layersOn) && view.contains(it.x, it.y) }
            .sortedBy { at(it.x, it.y) }
            .map { feature(it.id, hubWords(it, scene.layersOn), MapSelection.Hub(it.name), it.x, it.y) }

        val ends = ArrayList<Pair<Double, MapFeature>>()
        val changes = ArrayList<Pair<Double, MapFeature>>()
        val routes = ArrayList<Pair<Long, MapFeature>>()
        for (layer in subwayNetworkLayers) {
            if (overlays.none { it.id == "go:$layer" && it.subway }) continue
            val net = scene.nets[layer]?.net ?: continue
            for ((ri, r) in net.routes.withIndex()) {
                if (plan.terminals) {
                    for ((ei, e) in r.ends.withIndex()) {
                        if (!view.contains(e.x, e.y)) continue
                        val words = joinParts(listOf(e.name, L.t("map.route_card", "name" to r.label, "agency" to net.agency)))
                        ends.add(at(e.x, e.y) to feature("end:${r.id}:$ei", words, MapSelection.Line(layer, r.id), e.x, e.y))
                    }
                }
                // A route is in view when one of its lines crosses the view. The ring goes round its nearest placed
                // badge; where none is on screen (downtown most routes are inside a trunk), round the place on its
                // line nearest the middle of the view.
                var best: DoubleArray? = null
                for (li in r.lines) {
                    val line = net.lines.getOrNull(li) ?: continue
                    if (!line.box.intersects(view)) continue
                    val near = SubwayGeometry.nearestOn(line.points, cam.centerX, cam.centerY) ?: continue
                    if (best == null || near[2] < best[2]) best = near
                }
                val spot = best ?: continue
                if (!view.contains(spot[0], spot[1])) continue
                val badge = painter.board.badgeSpots[r.id]?.minByOrNull { hypot(it.x - cam.width / 2, it.y - cam.height / 2) }
                val words = L.t("map.route_card", "name" to r.label, "agency" to net.agency)
                val f = if (badge != null) {
                    MapFeature("line:${r.id}", words, MapSelection.Line(layer, r.id), badge.x, badge.y, SUBWAY_HIT_BOX / 2, SUBWAY_HIT_BOX / 2)
                } else {
                    feature("line:${r.id}", words, MapSelection.Line(layer, r.id), spot[0], spot[1])
                }
                routes.add(riderOrder(r.short, net.system, ri) to f)
            }
            if (plan.interchangeMinRoutes > 0) {
                for ((i, c) in net.interchanges.withIndex()) {
                    if (c.routes.size < plan.interchangeMinRoutes || !view.contains(c.x, c.y)) continue
                    val list = c.routes.joinToString(", ") { net.routes[it].short.ifEmpty { net.routes[it].long } }
                    val words = joinParts(listOf(c.name.ifEmpty { net.agency }, L.t("map.change_here", "list" to list)))
                    changes.add(at(c.x, c.y) to feature("change:$layer:$i", words, MapSelection.Interchange(layer, i), c.x, c.y))
                }
            }
        }
        val e = ends.sortedBy { it.first }.map { it.second }
        val c = changes.sortedBy { it.first }.map { it.second }
        val r = routes.sortedBy { it.first }.map { it.second }
        return SubwayFeatures(hubs, e, c, r, featureOrder(emptyList(), hubs, e, c, r).more)
    }

    private fun hubWords(hub: TransitHub, layersOn: List<String>): String {
        val list = hub.stops.filter { layersOn.contains("go:" + it.first) }
            .joinToString(", ") { it.second + " (" + mapLayerName("go:" + it.first) + ")" }
        return joinParts(listOf(hub.name, L.t("map.hub_walk", "list" to list)))
    }

    private fun standardFeatures(cam: MapCamera): List<MapFeature> {
        val out = ArrayList<MapFeature>()
        if (greenwayOn) {
            for (g in MapModel.segments) {
                if (!g.box.intersects(cam.visible)) continue
                val x0 = max(6.0, min(cam.screenX(g.box.minX), cam.screenX(g.box.maxX)))
                val x1 = min(cam.width - 6, max(cam.screenX(g.box.minX), cam.screenX(g.box.maxX)))
                val y0 = max(6.0, min(cam.screenY(g.box.minY), cam.screenY(g.box.maxY)))
                val y1 = min(cam.height - 6, max(cam.screenY(g.box.minY), cam.screenY(g.box.maxY)))
                out.add(
                    MapFeature(
                        id = "seg:" + g.id,
                        label = L.t("gw.title") + L.t("list.sep") + g.segment.name + L.t("list.sep") +
                            L.t("gw." + g.segment.phase),
                        selection = MapSelection.Stretch(g.id),
                        cx = (x0 + x1) / 2, cy = (y0 + y1) / 2,
                        halfWidth = max(22.0, (x1 - x0) / 2), halfHeight = max(22.0, (y1 - y0) / 2),
                    ),
                )
            }
        }
        val view = cam.visible
        val onScreen = MapModel.dots.filter { view.contains(it.x, it.y) }
        val near = placesInReadingOrder(onScreen, cam.centerX, cam.centerY, { it.x }, { it.y }, { it.name })
        for (d in near.take(40)) {
            out.add(
                MapFeature(
                    id = "row:" + d.id,
                    label = d.name + L.t("list.sep") + mapLayerName("help:" + d.group),
                    selection = MapSelection.Listing(d.id),
                    cx = cam.screenX(d.x), cy = cam.screenY(d.y),
                    halfWidth = 22.0, halfHeight = 22.0,
                ),
            )
        }
        return out
    }

    // ---- drawing ------------------------------------------------------------------------------------------

    override fun onDraw(canvas: Canvas) {
        val started = System.nanoTime()
        canvas.save()
        canvas.scale(density, density)
        scene.camera = cameraNow()
        scene.base = MapModel.base
        scene.drawParks = parksOn
        scene.overlays = overlays
        scene.segments = if (greenwayOn) MapModel.segments else emptyList()
        scene.focus = (MapModel.selection as? MapSelection.Stretch)?.id
        scene.dots = if (dotsOn) MapModel.dots else emptyList()
        scene.me = here
        scene.route = route
        draw(scene, canvas)
        canvas.restore()
        MapFrameClock.frame(System.nanoTime() - started, if (subway == null) "standard" else "subway", painter.builds)
    }

    private fun draw(s: MapScene, c: Canvas) {
        val cam = s.camera
        val w = cam.width.toFloat()
        val h = cam.height.toFloat()
        val mpp = cam.metersPerPoint
        val view = cam.visible

        // The ground. Outside the four cities is a different shade **and** a hatch: two pale fills a step apart
        // (1.20:1) are not a difference anyone can see, and no colour fixes that without making the ground outside
        // darker than the streets inside it. The hatch's own lines clear 3:1 against both fills (DECISIONS
        // 2026-09-20, accessibility audit item 10).
        fill.color = if (s.base == null) palette.land else palette.outside
        c.drawRect(0f, 0f, w, h, fill)

        val labels = ArrayList<Pair<MapLine, Int>>()

        // `subway` only: which band this zoom is in (with its 5 % hysteresis), and whether the basemap steps back.
        // The quiet basemap is thinner, paler-but-legal streets and a paler park — every street still 3:1 against the
        // land AND the quiet park (MapStyleTest) — and it is never used when the phone asks for more contrast.
        val sub = subway
        val band = if (sub == null) null else painter.bandFor(mpp)
        val quiet = sub != null && basemapTokens(
            MapStyle.SUBWAY, subwayNetworkLayers.any { sub.layersOn.contains("go:$it") }, palette.highContrast,
        ) == BasemapKind.QUIET

        val base = s.base
        if (base != null) {
            // The hatch is a repeating tile, not two hundred and fifty antialiased diagonals redrawn every frame:
            // the whole ground outside the four cities is one rectangle filled with a shader. Same picture, and
            // it took the basemap passes from tens of milliseconds to a few on the emulator's software renderer.
            c.drawRect(0f, 0f, w, h, hatchPaint())

            val land = Path()
            land.fillType = Path.FillType.EVEN_ODD
            for (ring in base.boundary) trace(ring, cam, land, true)
            fill.color = palette.land
            c.drawPath(land, fill)
            // The city edge is also a line, not only a change of shade (WCAG 1.4.11).
            stroke.color = palette.main
            stroke.strokeWidth = 1.5f
            c.drawPath(land, stroke)

            // "City parks" off means off: no green shapes, no pocket-park dots, no park names further down.
            if (s.drawParks) {
                val parks = Path()
                val pocket = Path()
                for (a in base.parks) {
                    if (!a.box.intersects(view)) continue
                    trace(a.points, cam, parks, true)
                    // Zoomed out, a pocket park is smaller than a dot: mark it so it can still be found.
                    if (a.box.width * cam.scale < 7) {
                        pocket.addCircle(
                            cam.screenX(a.box.centerX).toFloat(), cam.screenY(a.box.centerY).toFloat(), 2f,
                            Path.Direction.CW,
                        )
                    }
                }
                fill.color = if (quiet) palette.quiet.park.argb else palette.park
                c.drawPath(parks, fill)
                fill.color = if (quiet) palette.quiet.parkInk.argb else palette.parkInk
                fill.alpha = 191
                c.drawPath(pocket, fill)
                fill.alpha = 255
            }

            // Small streets appear as you zoom in; the big roads are always there to get your bearings.
            val limit = mapStreetClassLimit(mpp)
            val visible = Array(5) { ArrayList<MapLine>() }
            for (r in base.roads) if (r.box.intersects(view)) visible[max(0, min(4, r.cls))].add(r)
            if (limit > 2) {
                for (cell in base.cells) {
                    if (!cell.box.intersects(view)) continue
                    for (r in cell.roads) if (r.cls <= limit && r.box.intersects(view)) visible[max(0, min(4, r.cls))].add(r)
                }
            }
            val paths = arrayOfNulls<Path>(5)
            for (cls in 0..4) {
                if (visible[cls].isEmpty()) continue
                val p = Path()
                for (r in visible[cls]) trace(r.points, cam, p, false)
                paths[cls] = p
            }
            // Close in, the big roads get a casing in the land colour: it is what keeps a freeway readable where it
            // runs through a park, and it is only worth the pass when the lines are wide enough for it to show.
            if (mapStreetCasing(mpp) && !quiet) {
                stroke.color = palette.land
                for (cls in intArrayOf(2, 1, 0)) {
                    val p = paths[cls] ?: continue
                    stroke.strokeWidth = (mapStreetWidth(cls, mpp) + 2.5).toFloat()
                    c.drawPath(p, stroke)
                }
            }
            for (cls in intArrayOf(4, 3, 2, 1, 0)) {
                val p = paths[cls] ?: continue
                if (quiet) {
                    val q = palette.quiet
                    stroke.color = (if (cls == 0) q.freeway else if (cls <= 2) q.main else q.road).argb
                    stroke.strokeWidth = mapQuietStreetWidth(cls, mpp).toFloat()
                } else {
                    stroke.color = if (cls == 0) palette.freeway else if (cls <= 2) palette.main else palette.road
                    stroke.strokeWidth = mapStreetWidth(cls, mpp).toFloat()
                }
                c.drawPath(p, stroke)
            }
            // Quiet: street names drop one class, so fewer names compete with badges.
            val labelLimit = mapStreetLabelLimit(mpp) - (if (quiet) palette.quiet.labelClassDrop else 0)
            for (cls in 0..4) {
                if (cls > labelLimit) continue
                for (r in visible[cls]) if (r.name.isNotEmpty()) labels.add(r to cls)
            }
        }

        // The transport layers a person switched on. Drawn under the greenway and under the listing dots, so
        // switching a layer on never hides the thing this screen is about. A casing first, exactly as the greenway
        // has one: no one colour is 3:1 against both a near-white ground and a mid-grey street, so the casing is
        // what the line's contrast is measured against all the way along (WCAG 1.4.11).
        for (o in s.overlays) {
            // A layer drawn `subway` is MapSubway's; one still waiting for its network file, or whose file failed,
            // is drawn here exactly as `standard` draws it.
            if (o.data.lines.isEmpty() || o.subway) continue
            val path = Path()
            var any = false
            for (l in o.data.lines) {
                if (!l.box.intersects(view)) continue
                trace(l.points, cam, path, false)
                any = true
            }
            if (!any) continue
            val lw = mapLayerLineWidth(o.style, mpp)
            stroke.pathEffect = null
            stroke.color = palette.greenwayCase
            stroke.strokeWidth = (lw + 3).toFloat()
            c.drawPath(path, stroke)
            stroke.color = palette.named(o.style.color)
            stroke.strokeWidth = lw.toFloat()
            stroke.pathEffect = dash(o.style.dash, lw)
            c.drawPath(path, stroke)
            stroke.pathEffect = null
        }

        // Draw order 6 to 12 of docs/MAP-STYLE.md: bike lanes, SMART, DDOT, trunks, QLINE, People Mover, the selected
        // route. Then the greenway — ABOVE all transit, with its own colours and width, in both styles.
        val t0 = System.nanoTime()
        if (sub != null && band != null) painter.drawLines(s.overlays, sub, cam, band, c)
        val t1 = System.nanoTime()
        drawGreenway(s, cam, view, mpp, w, h, c)
        // Worked out before the street names are placed: badges, pills and terminals outrank them.
        drawRoute(s.route, cam, mpp, c)
        val t2 = System.nanoTime()
        val plan = if (sub != null && band != null) painter.plan(s.overlays, sub, cam, band, textScale, controlBoxes) else null
        MapFrameClock.transit(t1 - t0 + System.nanoTime() - t2)
        drawNames(labels, s, cam, view, mpp, w, h, c, plan?.occupied ?: emptyList(), quiet)

        // Stops and stations. A dense layer waits for the zoom (thousands of bus stops are a smear, not places);
        // the list under the map shows every one of them at any zoom. Five thousand dots are one drawPoints call.
        for (o in s.overlays) {
            if (o.data.points.isEmpty() || o.subway) continue
            val r = mapStopRadius(o.style.dense, mpp)
            if (r == 0.0) continue
            var n = 0
            val xy = FloatArray(o.data.points.size * 2)
            for (q in o.data.points) {
                val px = cam.screenX(q.x)
                val py = cam.screenY(q.y)
                if (px < -6 || py < -6 || px > w + 6 || py > h + 6) continue
                xy[n] = px.toFloat()
                xy[n + 1] = py.toFloat()
                n += 2
            }
            if (n == 0) continue
            if (o.style.ring) {
                dots.color = palette.surface
                dots.strokeWidth = (r * 2 + max(1.0, r * 0.4) * 2).toFloat()
                c.drawPoints(xy, 0, n, dots)
            }
            dots.color = palette.named(o.style.color)
            dots.strokeWidth = (r * 2).toFloat()
            c.drawPoints(xy, 0, n, dots)
        }

        // 15 to 18: stations, interchanges, terminals and hubs, the point markers, then badges.
        if (plan != null) {
            val t3 = System.nanoTime()
            painter.drawGlyphs(plan, textScale, c)
            MapFrameClock.transit(System.nanoTime() - t3)
        }

        // Our own listings, one colour per help group — and a surface-coloured edge, so a dot is a dot on any
        // ground. **One path per group, not one call per dot.** With all seven help layers on there are about
        // fifteen hundred of them, and a fill and a stroke each was three thousand draw calls a frame: measured on
        // the emulator on 2026-09-21 at 30 ms a frame, and 3 ms with this loop.
        if (s.dots.isNotEmpty()) {
            val byGroup = HashMap<String, Path>()
            for (d in s.dots) {
                val px = cam.screenX(d.x).toFloat()
                val py = cam.screenY(d.y).toFloat()
                if (px < -10 || py < -10 || px > w + 10 || py > h + 10) continue
                byGroup.getOrPut(d.group) { Path() }.addCircle(px, py, 7f, Path.Direction.CW)
            }
            stroke.pathEffect = null
            stroke.strokeWidth = 2.5f
            for ((group, path) in byGroup) {
                fill.color = palette.group(group)
                c.drawPath(path, fill)
                stroke.color = palette.surface
                c.drawPath(path, stroke)
            }
        }

        // 20. The names of hubs, terminals and stations, over the listing dots.
        if (plan != null) {
            val t4 = System.nanoTime()
            painter.drawNames(plan, cam, textScale, quiet, c)
            MapFrameClock.transit(System.nanoTime() - t4)
        }

        drawRouteMarks(s.route, cam, mpp, w, h, c)

        s.me?.let { me ->
            val px = cam.screenX(MapProjection.pointX(me)).toFloat()
            val py = cam.screenY(MapProjection.pointY(me)).toFloat()
            fill.color = palette.me
            c.drawCircle(px, py, 8f, fill)
            stroke.color = palette.surface
            stroke.strokeWidth = 3f
            c.drawCircle(px, py, 8f, stroke)
        }

        // Last of all, over everything: where the keyboard is.
        val at = ring?.let { id -> features().firstOrNull { it.id == id } }
        if (at != null) {
            val p = 7f
            val rect = android.graphics.RectF(
                (at.cx - at.halfWidth).toFloat() - p, (at.cy - at.halfHeight).toFloat() - p,
                (at.cx + at.halfWidth).toFloat() + p, (at.cy + at.halfHeight).toFloat() + p,
            )
            stroke.pathEffect = null
            stroke.color = palette.greenwayCase
            stroke.strokeWidth = 6f
            c.drawRoundRect(rect, 10f, 10f, stroke)
            stroke.color = palette.me
            stroke.strokeWidth = 3f
            c.drawRoundRect(rect, 10f, 10f, stroke)
        } else if (ring != null) {
            ring = null
        }
    }

    /**
     * One 22 dp tile with two diagonals on it, repeated across the ground outside the four cities. The tile is
     * made once and kept: it depends on nothing but the palette, and the palette changes only with the theme,
     * which rebuilds the view.
     */
    private var hatchTile: Paint? = null

    private fun hatchPaint(): Paint = hatchTile ?: run {
        val side = 22
        val bitmap = android.graphics.Bitmap.createBitmap(side, side, android.graphics.Bitmap.Config.ARGB_8888)
        val into = Canvas(bitmap)
        val pen = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1f
            color = palette.outsideInk
        }
        val s = side.toFloat()
        for (k in intArrayOf(0, 1)) {
            val o = k * s / 2
            into.drawLine(o - s, -s + o, o + s, s + o, pen)
            into.drawLine(o - s - s, -s + o, o, s + o, pen)
        }
        val paint = Paint().apply {
            shader = android.graphics.BitmapShader(
                bitmap, android.graphics.Shader.TileMode.REPEAT, android.graphics.Shader.TileMode.REPEAT,
            )
        }
        hatchTile = paint
        paint
    }

    // ---- one chosen trip ---------------------------------------------------------------------------------------
    // The map is the extra here as everywhere: the numbered steps beside it are the source of truth, `route.text`
    // is what this line says in words, and nothing on it is ever called safe, lit or accessible.
    //
    // A casing under every leg, exactly as a greenway stretch and a bus route have one, so the line keeps its 3:1
    // over the land, over a park and over the streets it crosses (WCAG 1.4.11). Colour never carries the meaning:
    // a ride is DASHED in its agency's own tone, a walk is solid, and every leg is also a sentence in the list.

    private fun routeWidth(mpp: Double): Double = max(4.0, min(9.0, 20.0 / mpp))

    private fun drawRoute(route: DirRoute?, cam: MapCamera, mpp: Double, c: Canvas) {
        if (route == null || route.legs.isEmpty()) return
        val rw = routeWidth(mpp)
        val paths = route.legs.map { leg ->
            val p = Path()
            leg.polyline.forEachIndexed { i, q ->
                val x = cam.screenX(MapProjection.x(q[0])).toFloat()
                val y = cam.screenY(MapProjection.y(q[1])).toFloat()
                if (i == 0) p.moveTo(x, y) else p.lineTo(x, y)
            }
            p
        }
        stroke.pathEffect = null
        stroke.color = palette.greenwayCase
        stroke.strokeWidth = (rw + 4).toFloat()
        for (p in paths) c.drawPath(p, stroke)
        route.legs.forEachIndexed { i, leg ->
            val on = route.active == i
            stroke.color = palette.named(leg.colour)
            stroke.strokeWidth = (if (on) rw + 2.5 else rw).toFloat()
            stroke.pathEffect = dash(leg.dash, if (on) rw + 2.5 else rw)
            c.drawPath(paths[i], stroke)
            stroke.pathEffect = null
        }
    }

    /**
     * Where the trip begins and ends, and every place a bus is got on or off. A boarding or alighting marker has an
     * INNER RING in the surface colour and an end marker is solid, so the two are told apart without colour; every
     * one of them is also named in the step list, and TalkBack reaches each as its own node ([features]).
     */
    private fun drawRouteMarks(route: DirRoute?, cam: MapCamera, mpp: Double, w: Float, h: Float, c: Canvas) {
        if (route == null || route.marks.isEmpty()) return
        val r = max(5.0, min(9.0, 30.0 / mpp)).toFloat()
        stroke.pathEffect = null
        for (m in route.marks) {
            val x = cam.screenX(MapProjection.x(m.lon)).toFloat()
            val y = cam.screenY(MapProjection.y(m.lat)).toFloat()
            if (x < -12 || y < -12 || x > w + 12 || y > h + 12) continue
            val bus = m.kind == "board" || m.kind == "alight"
            fill.color = palette.named(if (bus) "routeRide" else "routeWalk")
            c.drawCircle(x, y, r, fill)
            stroke.color = palette.surface
            stroke.strokeWidth = 2.5f
            c.drawCircle(x, y, r, stroke)
            if (bus) {
                fill.color = palette.surface
                c.drawCircle(x, y, r * 0.45f, fill)
            }
        }
    }

    // ---- the greenway, drawn like a transit line ---------------------------------------------------------------

    private fun drawGreenway(
        s: MapScene, cam: MapCamera, view: MapBox, mpp: Double, w: Float, h: Float, c: Canvas,
    ) {
        val onScreen = s.segments.filter { it.box.intersects(view) }
        if (onScreen.isEmpty()) return
        val width = greenwayWidth(mpp)

        // Each stretch is traced once a frame and reused by the casing pass, its phase pass and the focus pass:
        // three passes over the same geometry was three times the work for one picture.
        val traced = HashMap<String, Path>(onScreen.size * 2)
        fun pathOf(g: DrawnSegment): Path = traced.getOrPut(g.id) {
            val p = Path()
            for (l in g.lines) trace(l, cam, p, false)
            p
        }
        fun strokePath(p: Path, color: Int, lw: Double, pattern: List<Double>, alpha: Int = 255) {
            stroke.color = color
            stroke.alpha = alpha
            stroke.strokeWidth = lw.toFloat()
            stroke.pathEffect = dash(pattern, width)
            c.drawPath(p, stroke)
            stroke.pathEffect = null
            stroke.alpha = 255
        }

        // One casing under everything, so the route looks continuous where phases change.
        val casing = Path()
        for (g in onScreen) casing.addPath(pathOf(g))
        strokePath(casing, palette.greenwayCase, width + 4, emptyList())

        // Then each phase, least built first, so an open stretch is never hidden under a dotted one.
        for (phase in greenwayPhaseOrder) {
            val style = greenwayPhaseStyle(phase)
            val bright = Path()
            val dim = Path()
            var anyBright = false
            var anyDim = false
            for (g in onScreen) {
                if (g.segment.phase != phase) continue
                if (s.focus != null && g.id != s.focus) {
                    dim.addPath(pathOf(g)); anyDim = true
                } else {
                    bright.addPath(pathOf(g)); anyBright = true
                }
            }
            if (anyDim) strokePath(dim, palette.named(style.color), width, style.dash, alpha = 115)
            if (anyBright) strokePath(bright, palette.named(style.color), width, style.dash)
        }

        // The chosen stretch, drawn again with a dark halo so it stands out from the rest of the route.
        val focused = s.focus?.let { id -> onScreen.firstOrNull { it.id == id } }
        if (focused != null) {
            val style = greenwayPhaseStyle(focused.segment.phase)
            val p = pathOf(focused)
            strokePath(p, palette.ink, width + 6, emptyList())
            strokePath(p, palette.greenwayCase, width + 3, emptyList())
            strokePath(p, palette.named(style.color), width, style.dash)
        }

        // Stations: where a stretch begins and ends, once they are far enough apart to be worth drawing.
        if (!greenwayShowsStations(mpp)) return
        val r = max(3.0, min(6.0, width * 0.75)).toFloat()
        val seen = ArrayList<FloatArray>()
        val stations = Path()
        for (g in onScreen) {
            for (l in g.lines) {
                if (l.size < 4) continue
                for (end in 0..1) {
                    val ux = if (end == 0) l[0] else l[l.size - 2]
                    val uy = if (end == 0) l[1] else l[l.size - 1]
                    val px = cam.screenX(ux).toFloat()
                    val py = cam.screenY(uy).toFloat()
                    if (px < -10 || py < -10 || px > w + 10 || py > h + 10) continue
                    if (seen.any { hypot((it[0] - px).toDouble(), (it[1] - py).toDouble()) < r * 2.5 }) continue
                    seen.add(floatArrayOf(px, py))
                    stations.addCircle(px, py, r, Path.Direction.CW)
                }
            }
        }
        fill.color = palette.greenwayCase
        c.drawPath(stations, fill)
        stroke.color = palette.ink
        stroke.strokeWidth = max(1.5, r * 0.45).toFloat()
        stroke.pathEffect = null
        c.drawPath(stations, stroke)
    }

    // ---- street and park names -----------------------------------------------------------------------------

    private val widths = HashMap<String, Float>()

    private fun textWidth(key: String, size: Float, paint: Paint): Float {
        val k = "${size.toInt()}:$key"
        widths[k]?.let { return it }
        val w = paint.measureText(key)
        if (widths.size > 4000) widths.clear()
        widths[k] = w
        return w
    }

    private fun drawNames(
        labels: List<Pair<MapLine, Int>>, s: MapScene,
        cam: MapCamera, view: MapBox, mpp: Double, w: Float, h: Float, c: Canvas,
        occupied: List<LabelRect> = emptyList(), quiet: Boolean = false,
    ) {
        val inkColor = if (quiet) palette.quiet.ink.argb else palette.ink
        val parkInkColor = if (quiet) palette.quiet.parkInk.argb else palette.parkInk
        val parkColor = if (quiet) palette.quiet.park.argb else palette.park
        // A name takes a row of small circles along its text, so a slanted name only blocks the space it covers.
        val taken = ArrayList<DoubleArray>()
        val named = ArrayList<Triple<String, Double, Double>>()
        fun room(x: Double, y: Double, a: Double, tw: Double, size: Double): Boolean {
            val r = size / 2 + 3
            val n = max(1, Math.ceil(tw / (2 * r)).toInt())
            val mine = ArrayList<DoubleArray>(n)
            for (i in 0 until n) {
                val d = if (n == 1) 0.0 else (i.toDouble() / (n - 1) - 0.5) * (tw - size)
                mine.add(doubleArrayOf(x + cos(a) * d, y + sin(a) * d, r))
            }
            if (mine.any { m -> taken.any { hypot(m[0] - it[0], m[1] - it[1]) < m[2] + it[2] } }) return false
            // Subway: a badge, a pill, a terminal or one of the map's own buttons outranks a street name.
            if (occupied.isNotEmpty() && mine.any { m -> occupied.any { it.touchesCircle(m[0], m[1], m[2]) } }) return false
            taken.addAll(mine)
            return true
        }

        for ((road, cls) in labels) {
            // A cheap rejection first, from the box the line already carries. `labelSpot` walks and projects every
            // vertex of a road; a road whose whole on-screen extent is shorter than a word cannot hold one, and at
            // a city-wide zoom that is most of them. Laying names out was 10 of the 30 ms a frame this view cost
            // on the emulator before this line (measured 2026-09-21).
            if (max(road.box.width, road.box.height) * cam.scale < 24) continue
            val name = road.name
            val points = road.points
            val size = if (cls <= 1) 13f else if (cls <= 3) 12f else 11f
            textFill.textSize = size
            textFill.textSkewX = 0f
            textHalo.textSize = size
            textHalo.textSkewX = 0f
            val tw = textWidth(name, size, textFill).toDouble()
            val spot = labelSpot(points, tw + 14, cam, w, h) ?: continue
            if (named.any { it.first == name && hypot(it.second - spot[0], it.third - spot[1]) < 220 }) continue
            // The middle of the street may be taken by a cross street's name: slide along to find room.
            val slide = (spot[3] - tw - 10) / 2
            val ux = cos(spot[2])
            val uy = sin(spot[2])
            val at = doubleArrayOf(0.0, 0.5, -0.5, 1.0, -1.0).map { it * slide }
                .firstOrNull { room(spot[0] + ux * it, spot[1] + uy * it, spot[2], tw, size.toDouble()) } ?: continue
            val x = spot[0] + ux * at
            val y = spot[1] + uy * at
            named.add(Triple(name, x, y))
            drawLabel(c, name, x, y, spot[2], inkColor, palette.land, size)
        }

        val base = s.base ?: return
        if (mpp >= 7 || !s.drawParks) return
        for (a in base.parks) {
            if (a.name.isEmpty() || !a.box.intersects(view) || a.box.width * cam.scale < 46) continue
            val x = cam.screenX(a.box.centerX)
            val y = cam.screenY(a.box.centerY)
            if (x <= 0 || x >= w || y <= 0 || y >= h) continue
            textFill.textSize = 12f
            textHalo.textSize = 12f
            textFill.textSkewX = -0.25f
            textHalo.textSkewX = -0.25f
            val tw = textWidth("park:" + a.name, 12f, textFill).toDouble()
            if (!room(x, y, 0.0, tw, 12.0)) continue
            drawLabel(c, a.name, x, y, 0.0, parkInkColor, parkColor, 12f)
        }
        textFill.textSkewX = 0f
        textHalo.textSkewX = 0f
    }

    /** The name, with a halo so it reads over whatever is under it. */
    private fun drawLabel(c: Canvas, text: String, x: Double, y: Double, angle: Double, ink: Int, halo: Int, size: Float) {
        c.save()
        c.translate(x.toFloat(), y.toFloat())
        if (angle != 0.0) c.rotate(Math.toDegrees(angle).toFloat())
        val baseline = -(textFill.ascent() + textFill.descent()) / 2
        textHalo.color = halo
        textHalo.strokeWidth = 3.5f
        textHalo.textSize = size
        c.drawText(text, 0f, baseline, textHalo)
        textFill.color = ink
        textFill.textSize = size
        c.drawText(text, 0f, baseline, textFill)
        c.restore()
    }

    /** The middle of the longest nearly straight, on-screen run of a line at least `need` dp long: x, y, angle, length. */
    private fun labelSpot(pts: DoubleArray, need: Double, cam: MapCamera, w: Float, h: Float): DoubleArray? {
        var best: DoubleArray? = null
        var sx = 0.0; var sy = 0.0; var px = 0.0; var py = 0.0; var ang = 0.0; var open = false
        fun close() {
            if (!open) return
            open = false
            val cl = clip(sx, sy, px, py, 8.0, 8.0, w - 8.0, h - 8.0) ?: return
            val len = hypot(cl[2] - cl[0], cl[3] - cl[1])
            if (len < need || (best != null && len <= best!![3])) return
            var a = atan2(cl[3] - cl[1], cl[2] - cl[0])
            if (a > Math.PI / 2) a -= Math.PI else if (a < -Math.PI / 2) a += Math.PI
            best = doubleArrayOf((cl[0] + cl[2]) / 2, (cl[1] + cl[3]) / 2, a, len)
        }
        var i = 0
        while (i + 3 < pts.size) {
            val ax = cam.screenX(pts[i]); val ay = cam.screenY(pts[i + 1])
            val bx = cam.screenX(pts[i + 2]); val by = cam.screenY(pts[i + 3])
            val a = atan2(by - ay, bx - ax)
            // A short jog where a boulevard meets a cross street does not end the run; a real bend does.
            if (open && hypot(bx - ax, by - ay) > 6 && abs(atan2(sin(a - ang), cos(a - ang))) > 0.3) close()
            if (!open) { sx = ax; sy = ay; ang = a; open = true }
            px = bx; py = by
            i += 2
        }
        close()
        return best
    }

    // ---- small things ---------------------------------------------------------------------------------------

    private fun trace(pts: DoubleArray, cam: MapCamera, path: Path, close: Boolean) {
        if (pts.size < 4) return
        path.moveTo(cam.screenX(pts[0]).toFloat(), cam.screenY(pts[1]).toFloat())
        var i = 2
        while (i + 1 < pts.size) {
            path.lineTo(cam.screenX(pts[i]).toFloat(), cam.screenY(pts[i + 1]).toFloat())
            i += 2
        }
        if (close) path.close()
    }

    private fun dash(pattern: List<Double>, unit: Double): DashPathEffect? {
        if (pattern.isEmpty()) return null
        val f = FloatArray(pattern.size) { max(0.1, pattern[it] * unit).toFloat() }
        return DashPathEffect(f, 0f)
    }

    /** Liang-Barsky: the part of a line inside a box, or null. */
    private fun clip(x0: Double, y0: Double, x1: Double, y1: Double, l: Double, t: Double, r: Double, b: Double): DoubleArray? {
        var u0 = 0.0
        var u1 = 1.0
        val dx = x1 - x0
        val dy = y1 - y0
        val ps = doubleArrayOf(-dx, dx, -dy, dy)
        val qs = doubleArrayOf(x0 - l, r - x0, y0 - t, b - y0)
        for (k in 0..3) {
            val p = ps[k]
            val q = qs[k]
            if (p == 0.0) {
                if (q < 0) return null
                continue
            }
            val u = q / p
            if (p < 0) {
                if (u > u1) return null
                u0 = max(u0, u)
            } else {
                if (u < u0) return null
                u1 = min(u1, u)
            }
        }
        return doubleArrayOf(x0 + u0 * dx, y0 + u0 * dy, x0 + u1 * dx, y0 + u1 * dy)
    }

    // ---- TalkBack: the map as real nodes, without AndroidX ------------------------------------------------------

    private val nodes = Nodes()
    private var accessibilityFocus = Int.MIN_VALUE

    override fun getAccessibilityNodeProvider(): AccessibilityNodeProvider = nodes

    /**
     * Explore by touch: a finger dragged over the map must find the thing under it. Without this the whole view is
     * one node and a TalkBack user hears "map" and nothing else, however good the node list is.
     */
    override fun dispatchHoverEvent(event: MotionEvent): Boolean {
        val list = features()
        val at = nodeAt(list, event.x / density.toDouble(), event.y / density.toDouble())
        return when (event.action) {
            MotionEvent.ACTION_HOVER_ENTER, MotionEvent.ACTION_HOVER_MOVE -> {
                if (at != hovered) {
                    hovered?.let { send(it, AccessibilityEvent.TYPE_VIEW_HOVER_EXIT) }
                    hovered = at
                    at?.let { send(it, AccessibilityEvent.TYPE_VIEW_HOVER_ENTER) }
                }
                at != null
            }
            MotionEvent.ACTION_HOVER_EXIT -> {
                hovered?.let { send(it, AccessibilityEvent.TYPE_VIEW_HOVER_EXIT) }
                hovered = null
                false
            }
            else -> super.dispatchHoverEvent(event)
        }
    }

    private var hovered: Int? = null

    private fun nodeAt(list: List<MapFeature>, x: Double, y: Double): Int? {
        for (i in list.indices) {
            val f = list[i]
            if (abs(f.cx - x) <= f.halfWidth && abs(f.cy - y) <= f.halfHeight) return i
        }
        return null
    }

    private fun send(virtualId: Int, type: Int) {
        if (!isShown) return
        val manager = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? android.view.accessibility.AccessibilityManager
        if (manager?.isEnabled != true) return
        val event = AccessibilityEvent.obtain(type)
        event.packageName = context.packageName
        event.className = android.widget.Button::class.java.name
        event.setSource(this, virtualId)
        features().getOrNull(virtualId)?.let { event.text.add(it.label) }
        parent?.requestSendAccessibilityEvent(this, event)
    }

    /**
     * One virtual node per thing on the map, in the reading order of [features]: the greenway stretch by stretch
     * along the route, then the places nearest the middle of the screen. Each is a real, clickable node with its
     * own words and its own bounds on screen, so TalkBack reads "Joe Louis Greenway, Warren to Tireman, open,
     * button" and a double tap opens the same card a finger's tap opens.
     *
     * A platform `AccessibilityNodeProvider`, not AndroidX's `ExploreByTouchHelper`: this app has no libraries at
     * all (apps/android/README.md), and everything the helper does — the node tree, the focus events, the hover
     * mapping — is the fifty lines below.
     */
    private inner class Nodes : AccessibilityNodeProvider() {

        /** What the framework asks for when it wants the host view itself. `HOST_VIEW_ID` is API 26; this is not. */
        private val HOST = View.NO_ID

        override fun createAccessibilityNodeInfo(virtualViewId: Int): AccessibilityNodeInfo? {
            val list = features()
            if (virtualViewId == HOST) {
                val host = AccessibilityNodeInfo.obtain(this@MapView)
                onInitializeAccessibilityNodeInfo(host)
                // The 40 the subway style adds are a cap, and the map says what the cap left out; the list has all.
                if (featuresMore > 0) {
                    host.contentDescription = L.t("map.label_tab") + L.t("list.sep") +
                        L.t("map.list_more", "count" to featuresMore.toString())
                }
                for (i in list.indices) host.addChild(this@MapView, i)
                return host
            }
            val f = list.getOrNull(virtualViewId) ?: return null
            val node = AccessibilityNodeInfo.obtain(this@MapView, virtualViewId)
            node.packageName = context.packageName
            node.className = android.widget.Button::class.java.name
            node.contentDescription = f.label + L.t("list.sep") + L.t("map.details")
            node.setParent(this@MapView)
            node.setSource(this@MapView, virtualViewId)
            node.isEnabled = true
            node.isFocusable = true
            node.isClickable = true
            node.isVisibleToUser = true
            node.addAction(AccessibilityNodeInfo.ACTION_CLICK)
            node.addAction(
                if (accessibilityFocus == virtualViewId) {
                    AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS
                } else {
                    AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS
                },
            )
            node.isAccessibilityFocused = accessibilityFocus == virtualViewId
            val r = Rect(
                ((f.cx - f.halfWidth) * density).toInt(), ((f.cy - f.halfHeight) * density).toInt(),
                ((f.cx + f.halfWidth) * density).toInt(), ((f.cy + f.halfHeight) * density).toInt(),
            )
            @Suppress("DEPRECATION")
            node.setBoundsInParent(r)
            val offset = IntArray(2)
            getLocationOnScreen(offset)
            node.setBoundsInScreen(Rect(r.left + offset[0], r.top + offset[1], r.right + offset[0], r.bottom + offset[1]))
            return node
        }

        override fun performAction(virtualViewId: Int, action: Int, arguments: android.os.Bundle?): Boolean {
            if (virtualViewId == HOST) return performAccessibilityAction(action, arguments)
            val f = features().getOrNull(virtualViewId) ?: return false
            return when (action) {
                AccessibilityNodeInfo.ACTION_CLICK -> {
                    onSelect(f.selection)
                    send(virtualViewId, AccessibilityEvent.TYPE_VIEW_CLICKED)
                    true
                }
                AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS -> {
                    accessibilityFocus = virtualViewId
                    ring = f.id
                    invalidate()
                    send(virtualViewId, AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUSED)
                    true
                }
                AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS -> {
                    if (accessibilityFocus != virtualViewId) return false
                    accessibilityFocus = Int.MIN_VALUE
                    invalidate()
                    send(virtualViewId, AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUS_CLEARED)
                    true
                }
                else -> false
            }
        }

        override fun findFocus(focus: Int): AccessibilityNodeInfo? =
            if (focus == AccessibilityNodeInfo.FOCUS_ACCESSIBILITY && accessibilityFocus != Int.MIN_VALUE) {
                createAccessibilityNodeInfo(accessibilityFocus)
            } else {
                createAccessibilityNodeInfo(HOST)
            }
    }
}

/**
 * How long a frame took. Debug builds only, so panning with the bus stops on can be measured without a profiler;
 * it never runs in a release build and it writes nothing to disk.
 */
object MapFrameClock {
    private var total = 0.0
    private var worst = 0.0
    private var count = 0

    private var style = ""
    private var transit = 0.0

    /** The subway passes' own share of a frame (lines, plan, glyphs, names): the spec's budget is 8 ms of it. */
    fun transit(nanos: Long) {
        if (!BuildConfig.IS_RELEASE) transit += nanos / 1_000_000.0
    }

    fun frame(nanos: Long, drawn: String = "standard", pathBuilds: Int = 0) {
        if (BuildConfig.IS_RELEASE) return
        if (drawn != style) { total = 0.0; worst = 0.0; count = 0; transit = 0.0; style = drawn }
        val ms = nanos / 1_000_000.0
        total += ms
        worst = max(worst, ms)
        count++
        if (count < 30) return
        android.util.Log.i(
            "Help313Timing",
            "map frame ($style): ${"%.2f".format(total / count)} ms average, ${"%.2f".format(worst)} ms worst over $count " +
                "frames; of which the subway passes ${"%.2f".format(transit / count)} ms; subway path builds so far: $pathBuilds",
        )
        total = 0.0; worst = 0.0; count = 0; transit = 0.0
    }
}

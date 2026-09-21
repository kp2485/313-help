// "See this map as a list": the words for the transport layers. No android.* class, so `:core` holds the one rule
// that matters to a test — **the list is identical in both map styles** (docs/MAP-STYLE.md section 9).
//
// It is identical by construction: this file is never told the style, imports nothing from MapStyle.kt, and reads
// the standard layer file only (`names`, `lines`, `points`). MapScreen.list hands it the switched-on layers and
// prints what comes back.
package org.help313.app

/** One transport layer's part of the list: its name, how many things it has, and their names, each once. */
class MapListSection(val title: String, val count: Int, val names: List<String>, val more: Int)

/** A switched-on layer as the list sees it: its name in words and its standard file. Nothing else. */
class MapListLayer(val label: String, val data: MapLayerData)

const val MAP_LIST_NAMES = 40

fun mapListSections(layers: List<MapListLayer>, limit: Int = MAP_LIST_NAMES): List<MapListSection> = layers.map { l ->
    val all = LinkedHashSet((l.data.lines.map { it.name } + l.data.points.map { it.name }).filter { it.isNotEmpty() }).toList()
    MapListSection(l.label, l.data.lines.size + l.data.points.size, all.take(limit), maxOf(0, all.size - limit))
}

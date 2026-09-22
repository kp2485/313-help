// "Type a cross street" — resolved ON THIS DEVICE, from the street geometry the signed bundle already carries
// (Kyle, 2026-09-22; DECISIONS: the map opens on the person's location, then on an intersection they type, then
// on City Hall). Swift port of apps/web/src/intersections.ts, case for case.
//
// Why this file exists at all. A person who will not — or cannot — share a location still has to be able to say
// where they are, and the only honest way to let them is to take the two street names in their head and turn
// them into a point without asking anybody else. Every line below runs on the phone, over `map/base.json` and
// `map/streets.json`, which are already here. **Nothing is sent, and the typed text is never stored**: it lives
// in one `@State` for as long as the screen is open, exactly like the search box, and it never reaches a file,
// a report or a log (docs/08).
//
// It has no import of storage, the network or navigation, so the three clients can be held to the same answers
// case for case.
import DetroitQuery
import Foundation

// MARK: - names
// The City writes "Woodward Ave", "E Warren Ave", "W 7 Mile Rd"; a person types "woodward", "Warren", "seven
// mile". Both sides go through `normStreet`, which throws away everything that is not the name itself.

/// Street-type words, long and short. A name is the same name with or without one on the end.
private let streetSuffixes: Set<String> = [
    "ave", "avenue", "st", "street", "rd", "road", "blvd", "boulevard", "dr", "drive", "hwy", "highway",
    "ln", "lane", "ct", "court", "pkwy", "parkway", "ter", "terrace", "pl", "place", "cir", "circle", "way", "trl", "trail",
]
/// "E", "West", "N.", "southbound" — the side of town, not the name. Kept as one letter so "E Warren" and
/// "East Warren" are one street, and dropped when the other side has no direction at all.
private let streetDirections: [String: String] = [
    "e": "e", "east": "e", "w": "w", "west": "w", "n": "n", "north": "n", "s": "s", "south": "s",
    "ne": "ne", "northeast": "ne", "nw": "nw", "northwest": "nw", "se": "se", "southeast": "se", "sw": "sw", "southwest": "sw",
]
/// "Seven Mile" is "7 Mile" on every sign in the city, and a person may type either.
private let numberWords: [String: String] = [
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "first": "1", "second": "2", "third": "3", "fourth": "4", "fifth": "5", "sixth": "6", "seventh": "7", "eighth": "8", "ninth": "9", "tenth": "10",
]

public struct StreetName: Equatable, Sendable { public var name: String; public var dir: String }

/// A street name as this file compares them: lower case, no accents, no punctuation, number words as digits, no
/// street-type word on the end, and any leading direction kept as a single letter in `dir`.
///
/// The direction is kept apart rather than thrown away, because Detroit really does have an East Warren and a
/// West Warren and they are different halves of one street: a person who types the half they mean should get it,
/// and a person who types neither should get both (`nameMatches`).
public func normStreet(_ raw: String) -> StreetName {
    let folded = raw.folding(options: [.diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX")).lowercased()
    var flat = ""
    var lastWasSpace = true
    for ch in folded {
        if ch == "'" || ch == "\u{2019}" || ch == "." { continue }        // dropped, never turned into a space
        if ch.isASCII && (ch.isLetter || ch.isNumber) { flat.append(ch); lastWasSpace = false }
        else if !lastWasSpace { flat.append(" "); lastWasSpace = true }
    }
    var words = flat.split(separator: " ").map { numberWords[String($0)] ?? String($0) }
    var dir = ""
    if words.count > 1, let d = streetDirections[words[0]] { dir = d; words.removeFirst() }
    // A street-type word only ever comes off the END, and never when it is the whole name ("Way", "Circle").
    while words.count > 1, streetSuffixes.contains(words[words.count - 1]) { words.removeLast() }
    // "Service Drive" is a kind of road, not Woodward: "M-1 Service Drive" keeps its own name.
    return StreetName(name: words.joined(separator: " "), dir: dir)
}

/// Two names are the same street when the names match and neither side contradicts the other's direction.
public func nameMatches(typed: StreetName, known: StreetName) -> Bool {
    typed.name == known.name && (typed.dir.isEmpty || known.dir.isEmpty || typed.dir == known.dir)
}

// MARK: - what a person typed

/// "Woodward and Warren", "Woodward & Warren", "Warren at Woodward", "Woodward/Warren" — or one street name on
/// its own. Returns the pieces exactly as typed; `normStreet` is what makes them comparable.
public func parseCrossing(_ text: String) -> (a: String, b: String)? {
    let clean = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    if clean.isEmpty { return nil }
    // The same separators as the web's regex: the words and/at/x, and the symbols & @ / +.
    let pattern = "\\s+(?:and|at|&|@|x)\\s+|\\s*[/+]\\s*|\\s+&\\s+"
    guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return (clean, "") }
    let ns = clean as NSString
    var parts: [String] = []
    var at = 0
    for m in re.matches(in: clean, range: NSRange(location: 0, length: ns.length)) {
        let piece = ns.substring(with: NSRange(location: at, length: m.range.location - at)).trimmingCharacters(in: .whitespaces)
        if !piece.isEmpty { parts.append(piece) }
        at = m.range.location + m.range.length
    }
    let tail = ns.substring(from: at).trimmingCharacters(in: .whitespaces)
    if !tail.isEmpty { parts.append(tail) }
    if parts.isEmpty { return nil }
    if parts.count == 1 { return (parts[0], "") }
    return (parts[0], parts[1])
}

// MARK: - the streets on this phone

/// One named piece of street geometry, in the map's own units (`MapProjection`).
public struct NamedLine: Sendable { public var name: String; public var points: [Double]; public var box: MapBox }

/// Every named piece of street geometry in the basemap: the city-wide roads, and the ones in the grid cells.
public func namedLines(_ map: BaseMap) -> [NamedLine] {
    var out: [NamedLine] = []
    for r in map.roads where !r.name.isEmpty { out.append(NamedLine(name: r.name, points: r.points, box: r.box)) }
    for cell in map.cells { for r in cell.roads where !r.name.isEmpty { out.append(NamedLine(name: r.name, points: r.points, box: r.box)) } }
    return out
}

public struct StreetIndex: Sendable {
    /// Normalised name -> one bucket per direction of that name.
    var byName: [String: [(dir: String, lines: [NamedLine])]] = [:]

    /// Built once per basemap: 205 neighbourhoods' worth of streets on a cheap phone is a few thousand short
    /// arrays, and a person may type several guesses in a row.
    public init(_ map: BaseMap) {
        for l in namedLines(map) {
            let n = normStreet(l.name)
            if n.name.isEmpty { continue }
            var bucket = byName[n.name] ?? []
            if let at = bucket.firstIndex(where: { $0.dir == n.dir }) { bucket[at].lines.append(l) }
            else { bucket.append((dir: n.dir, lines: [l])) }
            byName[n.name] = bucket
        }
    }

    /// Every piece of the street a person means, or an empty list.
    public func lines(for typed: String) -> [NamedLine] {
        let n = normStreet(typed)
        if n.name.isEmpty { return [] }
        guard let bucket = byName[n.name] else { return [] }
        return bucket.filter { nameMatches(typed: n, known: StreetName(name: n.name, dir: $0.dir)) }.flatMap(\.lines)
    }
}

// MARK: - where two streets cross

/// Where two straight pieces cross, or nil. Plain segment intersection: no touching-at-a-shared-end special
/// case, because two City road records that share an end really do meet there.
public func segmentCross(_ ax: Double, _ ay: Double, _ bx: Double, _ by: Double,
                         _ cx: Double, _ cy: Double, _ dx: Double, _ dy: Double) -> (x: Double, y: Double)? {
    let rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy
    let den = rx * sy - ry * sx
    if den == 0 { return nil }                                  // parallel, or a piece of no length
    let t = ((cx - ax) * sy - (cy - ay) * sx) / den
    let u = ((cx - ax) * ry - (cy - ay) * rx) / den
    if t < 0 || t > 1 || u < 0 || u > 1 { return nil }
    return (ax + t * rx, ay + t * ry)
}

/// Two crossings closer together than this are the same junction drawn twice (a boulevard's two carriageways,
/// a record split at a city line). 120 m is wider than any Detroit intersection and narrower than a block.
public let sameJunctionMeters = 120.0

/// Every place two streets cross, north to south then west to east, already merged.
public func crossingsOf(_ a: [NamedLine], _ b: [NamedLine]) -> [LatLon] {
    let pad = sameJunctionMeters / MapProjection.metersPerUnit
    var hits: [(x: Double, y: Double)] = []
    for la in a {
        for lb in b {
            if !la.box.expanded(by: pad).intersects(lb.box) { continue }
            var i = 0
            while i + 3 < la.points.count {
                var k = 0
                while k + 3 < lb.points.count {
                    if let p = segmentCross(la.points[i], la.points[i + 1], la.points[i + 2], la.points[i + 3],
                                            lb.points[k], lb.points[k + 1], lb.points[k + 2], lb.points[k + 3]) {
                        hits.append(p)
                    }
                    k += 2
                }
                i += 2
            }
        }
    }
    // Merge: a junction is one answer however many road records meet in it.
    var merged: [(x: Double, y: Double)] = []
    for p in hits where !merged.contains(where: { hypot($0.x - p.x, $0.y - p.y) < pad }) { merged.append(p) }
    // North to south, then west to east: the same bundle always offers the same list in the same order.
    merged.sort { $0.y != $1.y ? $0.y < $1.y : $0.x < $1.x }
    return merged.map { LatLon(lat: MapProjection.lat(y: $0.y), lon: MapProjection.lon(x: $0.x)) }
}

/// The middle of the longest piece of one street: an honest answer to one name, and the screen says so.
public func midpointOf(_ lines: [NamedLine]) -> LatLon? {
    var best: (len: Double, x: Double, y: Double)?
    for l in lines {
        var len = 0.0
        var i = 0
        while i + 3 < l.points.count { len += hypot(l.points[i + 2] - l.points[i], l.points[i + 3] - l.points[i + 1]); i += 2 }
        if let b = best, len <= b.len { continue }
        if l.points.count < 2 { continue }
        // Halfway ALONG the street, not the middle of its box: a street that bends would otherwise be answered
        // with a point that is not on it.
        var run = 0.0, x = l.points[0], y = l.points[1]
        i = 0
        while i + 3 < l.points.count {
            let d = hypot(l.points[i + 2] - l.points[i], l.points[i + 3] - l.points[i + 1])
            if run + d >= len / 2 {
                let f = d != 0 ? (len / 2 - run) / d : 0
                x = l.points[i] + (l.points[i + 2] - l.points[i]) * f
                y = l.points[i + 1] + (l.points[i + 3] - l.points[i + 1]) * f
                break
            }
            run += d; x = l.points[i + 2]; y = l.points[i + 3]
            i += 2
        }
        best = (len, x, y)
    }
    guard let b = best else { return nil }
    return LatLon(lat: MapProjection.lat(y: b.y), lon: MapProjection.lon(x: b.x))
}

/// Which end of the street one of several crossings is at: "Woodward & 7 Mile — north / south". The axis is
/// whichever way the answers are actually spread, so two crossings of an east-west pair read east and west.
public func whereWords(_ points: [LatLon]) -> [String] {
    if points.count < 2 { return points.map { _ in "" } }
    let lats = points.map(\.lat), lons = points.map(\.lon)
    let spanLat = lats.max()! - lats.min()!, spanLon = (lons.max()! - lons.min()!) * 0.74
    let byLat = spanLat >= spanLon
    let mid = byLat ? (lats.max()! + lats.min()!) / 2 : (lons.max()! + lons.min()!) / 2
    return points.map { byLat ? ($0.lat >= mid ? "north" : "south") : ($0.lon >= mid ? "east" : "west") }
}

public enum CrossOutcome: Equatable, Sendable {
    /// One junction: the map goes there.
    case point(point: LatLon, a: String, b: String)
    /// Two streets that cross more than once: a short list to pick from, each with the end it is at.
    case choices(a: String, b: String, choices: [Choice])
    /// One street name: the middle of it, and a note saying that is what this is.
    case street(point: LatLon, a: String)
    /// Two streets we know that never meet.
    case noCrossing(a: String, b: String)
    /// A name the bundle's streets do not carry. `unknown` names the first one we could not find.
    case unknown(String)

    public struct Choice: Equatable, Sendable { public var point: LatLon; public var whereWord: String }
}

/// At most this many choices are offered: a street pair with more crossings than this is a service drive, and a
/// list nobody can read is not a choice.
public let maxCrossChoices = 6

/// Resolving a typed cross street, with the answers held for as long as the screen is open.
///
/// The cache is keyed by the NORMALISED names, so it holds no more of what a person typed than
/// "woodward|warren" — and it is in memory in this object, which dies with the screen, never storage.
public final class CrossStreets {
    private let index: StreetIndex
    private var cache: [String: CrossOutcome] = [:]

    public init(map: BaseMap) { index = StreetIndex(map) }

    public func resolve(_ text: String) -> CrossOutcome? {
        guard let parsed = parseCrossing(text) else { return nil }
        let na = normStreet(parsed.a), nb = normStreet(parsed.b)
        let key = "\(na.dir):\(na.name)|\(nb.dir):\(nb.name)"
        if let held = cache[key] { return held }
        let out = compute(parsed)
        cache[key] = out
        return out
    }

    private func compute(_ parsed: (a: String, b: String)) -> CrossOutcome {
        let a = index.lines(for: parsed.a)
        if a.isEmpty { return .unknown(parsed.a) }
        if parsed.b.isEmpty {
            guard let p = midpointOf(a) else { return .unknown(parsed.a) }
            return .street(point: p, a: parsed.a)
        }
        let b = index.lines(for: parsed.b)
        if b.isEmpty { return .unknown(parsed.b) }
        let hits = crossingsOf(a, b)
        if hits.isEmpty { return .noCrossing(a: parsed.a, b: parsed.b) }
        if hits.count == 1 { return .point(point: hits[0], a: parsed.a, b: parsed.b) }
        let kept = Array(hits.prefix(maxCrossChoices))
        let words = whereWords(kept)
        return .choices(a: parsed.a, b: parsed.b,
                        choices: kept.enumerated().map { CrossOutcome.Choice(point: $1, whereWord: words[$0]) })
    }

    /// For a new bundle: the crossings held from the old one mean nothing about the new streets.
    public func forget() { cache.removeAll() }
}

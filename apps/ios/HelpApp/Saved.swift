// Saved places (docs/05), the Swift copy of apps/web/src/saved.ts. Listing ids kept on this phone only:
// never sent, never synced, cleared with one tap.
//
// A phone can be looked through by someone else (audit A8), so listings for domestic violence, a mental-health
// crisis, treatment and help after sexual assault cannot be saved at all, and the screen is named plainly:
// "Saved places."
import Combine
import Foundation

/// Domestic violence and mental-health crisis: no map dot, no distance, and can't be saved (docs/08, 10-A8).
let sensitiveCategories = ["shelter.dv", "health.mental"]
/// Treatment and help after sexual assault (DECISIONS 2026-09-19): never saved either. Every sensitive
/// listing is private too.
let privateCategories = ["treatment", "assault"]

private func matches(_ category: String, _ list: [String]) -> Bool {
    list.contains { category == $0 || category.hasPrefix($0 + ".") }
}
func isSensitive(_ category: String) -> Bool { matches(category, sensitiveCategories) }
func isPrivate(_ category: String) -> Bool { isSensitive(category) || matches(category, privateCategories) }
/// The one rule the Save button obeys.
func canSave(_ category: String) -> Bool { !isPrivate(category) }

/// The saved list. Newest first, 100 at most.
@MainActor final class Saved: ObservableObject {
    static let shared = Saved()
    @Published private(set) var ids: [String] = []
    private let file: URL

    init(dir: URL = DeviceState.dir) {
        file = dir.appendingPathComponent("saved.json")
        if let d = DeviceState.read(file), let list = try? JSONDecoder().decode([String].self, from: d) { ids = list }
    }

    func contains(_ id: String) -> Bool { ids.contains(id) }

    /// Saves or unsaves. A private listing is never added; removing one always works, so a list saved before a
    /// category changed can still be emptied.
    func toggle(_ id: String, category: String) {
        if ids.contains(id) { ids.removeAll { $0 == id } }
        else if canSave(category) { ids = Array(([id] + ids).prefix(100)) }
        write()
    }
    func clear() { ids = []; write() }

    private func write() {
        if let d = try? JSONEncoder().encode(ids) { DeviceState.write(d, to: file) }
    }
}

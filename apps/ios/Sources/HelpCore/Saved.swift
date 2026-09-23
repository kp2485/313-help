// Saved places (docs/05), the Swift copy of apps/web/src/saved.ts. Listing ids kept on this phone only:
// never sent, never synced, cleared with one tap.
//
// A phone can be looked through by someone else (audit A8), so listings for domestic violence, a mental-health
// crisis, treatment and help after sexual assault cannot be saved at all, and the screen is named plainly:
// "Saved places."
import Foundation

/// Domestic violence and mental-health crisis: no map dot, no distance, and can't be saved (docs/08, 10-A8).
public let sensitiveCategories = ["shelter.dv", "health.mental"]
/// Treatment and help after sexual assault (DECISIONS 2026-09-19), and since 2026-09-23 HIV and STI tests and
/// immigration legal help: never saved either. Every sensitive listing is private too.
public let privateCategories = ["treatment", "assault", "health.sexual", "legal.immigration"]

private func matches(_ category: String, _ list: [String]) -> Bool {
    list.contains { category == $0 || category.hasPrefix($0 + ".") }
}
public func isSensitive(_ category: String) -> Bool { matches(category, sensitiveCategories) }
public func isPrivate(_ category: String) -> Bool { isSensitive(category) || matches(category, privateCategories) }
/// The one rule the Save button obeys.
public func canSave(_ category: String) -> Bool { !isPrivate(category) }

/// The saved list, and the file it lives in. No Combine and no SwiftUI here, so `swift test` can run the rules;
/// the app wraps this in an `ObservableObject` (HelpApp/Saved.swift).
public final class SavedStore {
    public private(set) var ids: [String] = []
    private let file: URL

    public init(dir: URL) {
        file = dir.appendingPathComponent("saved.json")
        if let d = DeviceState.read(file), let list = try? JSONDecoder().decode([String].self, from: d) { ids = list }
    }

    public func contains(_ id: String) -> Bool { ids.contains(id) }

    /// Saves or unsaves. A private listing is never added; removing one always works, so a list saved before a
    /// category changed can still be emptied. Returns false when the list could not be written to disk.
    @discardableResult public func toggle(_ id: String, category: String) -> Bool {
        if ids.contains(id) { ids.removeAll { $0 == id } }
        else if canSave(category) { ids = Array(([id] + ids).prefix(100)) }
        return write()
    }

    @discardableResult public func clear() -> Bool { ids = []; return write() }

    private func write() -> Bool {
        guard let d = try? JSONEncoder().encode(ids) else { return false }
        do { try DeviceState.write(d, to: file); return true } catch { return false }
    }
}

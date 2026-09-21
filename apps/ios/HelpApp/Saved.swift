// Saved places (docs/05): the screens' view of them. The rules and the file are in HelpCore (SavedStore), which
// `swift test` checks; this is the ObservableObject the SwiftUI screens watch.
import Combine
import Foundation
import HelpCore

/// The saved list. Newest first, 100 at most, never a listing that docs/08 says cannot be saved.
@MainActor final class Saved: ObservableObject {
    static let shared = Saved()
    @Published private(set) var ids: [String] = []
    /// False when the list could not be written to this phone, so a screen never says "saved" about nothing.
    @Published private(set) var writeFailed = false
    private let store: SavedStore

    init(dir: URL = DeviceState.dir) {
        store = SavedStore(dir: dir)
        ids = store.ids
    }

    func contains(_ id: String) -> Bool { ids.contains(id) }

    func toggle(_ id: String, category: String) {
        writeFailed = !store.toggle(id, category: category)
        ids = store.ids
    }

    func clear() {
        writeFailed = !store.clear()
        ids = store.ids
    }
}

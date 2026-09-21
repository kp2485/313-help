// Where this phone keeps its own few things (docs/08): the random install key, the outbox of reports that have
// not gone yet, and the list of saved places. Plain files in Application Support, protected while the phone is
// locked, and **kept out of every backup**.
//
// Why the backup flag matters: Application Support is included in an iCloud and a Finder backup by default, and a
// backup is restored onto whatever phone the person signs in to next. That would have carried the install key —
// the one secret this app has — off the device and onto another one, which is exactly what docs/08 promises never
// happens. The flag is re-applied on every launch, because a directory that is recreated (by us, or by a restore)
// comes back without it (iPhone review, 2026-09-20).
//
// A write that fails is reported, never swallowed: a caller that says "saved" when nothing was saved is worse
// than an error (iPhone review, 2026-09-20).
import Foundation

public enum DeviceState {
    public enum Failure: Error, Equatable {
        /// The file is there but cannot be read. We do not overwrite it and we do not pretend it is absent.
        case unreadable(String)
        case couldNotWrite(String)
        case couldNotCreateDirectory(String)
    }

    /// `Library/Application Support/state`: the key, the outbox, the saved list.
    public static let dir: URL = stateDir(under: .applicationSupportDirectory)
    /// `Library/Caches/bundle`: the verified copy of the signed list. A cache is rebuilt from the network or from
    /// the snapshot inside the app, so it belongs in Caches, which is never backed up and can be reclaimed.
    public static let cacheDir: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("bundle", isDirectory: true)

    private static func stateDir(under what: FileManager.SearchPathDirectory) -> URL {
        let d = FileManager.default.urls(for: what, in: .userDomainMask)[0].appendingPathComponent("state", isDirectory: true)
        try? prepare(d)
        return d
    }

    /// Makes the directory if it is missing and marks it "not for backup". Call it at every launch.
    public static func prepare(_ dir: URL = DeviceState.dir) throws {
        do { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
        catch { throw Failure.couldNotCreateDirectory(dir.lastPathComponent) }
        try excludeFromBackup(dir)
    }

    /// Marks a file or directory as excluded from iCloud and Finder backups.
    public static func excludeFromBackup(_ url: URL) throws {
        #if canImport(Darwin)
        var target = URL(fileURLWithPath: url.path)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        do { try target.setResourceValues(values) }
        catch { throw Failure.couldNotWrite(url.lastPathComponent) }
        #endif
    }

    /// What the file system says about the flag: true, false, or nil when it cannot be asked (or on a platform
    /// that has no backups). The tests read this rather than trusting the setter's return.
    public static func isExcludedFromBackup(_ url: URL) -> Bool? {
        #if canImport(Darwin)
        // A URL caches the resource values it has been asked for, so this asks the file system again rather than
        // repeating what it was told before the directory was replaced.
        var fresh = URL(fileURLWithPath: url.path)
        fresh.removeAllCachedResourceValues()
        return (try? fresh.resourceValues(forKeys: [.isExcludedFromBackupKey]))?.isExcludedFromBackup
        #else
        return nil
        #endif
    }

    /// The forgiving read, for things that are fine to be missing.
    public static func read(_ url: URL) -> Data? { try? Data(contentsOf: url) }

    /// nil only when the file is not there. A file that exists and cannot be read throws, so a caller never
    /// mistakes "unreadable" for "absent" and writes over it.
    public static func readStrict(_ url: URL) throws -> Data? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        do { return try Data(contentsOf: url) }
        catch { throw Failure.unreadable(url.lastPathComponent) }
    }

    public static func write(_ data: Data, to url: URL) throws {
        let dir = url.deletingLastPathComponent()
        do { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
        catch { throw Failure.couldNotCreateDirectory(dir.lastPathComponent) }
        try? excludeFromBackup(dir)
        // On a phone every one of these files is unreadable while the phone is locked. macOS has no data
        // protection class, and asking for one there makes the write fail, so only iOS asks (the tests run on a
        // Mac and on Linux).
        #if os(iOS) || os(tvOS) || os(watchOS) || os(visionOS)
        let options: Data.WritingOptions = [.atomic, .completeFileProtection]
        #else
        let options: Data.WritingOptions = [.atomic]
        #endif
        do { try data.write(to: url, options: options) }
        catch { throw Failure.couldNotWrite(url.lastPathComponent) }
    }
}

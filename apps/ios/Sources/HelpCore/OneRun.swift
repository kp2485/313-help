// One piece of slow work at a time, and everyone who asks while it runs waits for that same run.
//
// Directions builds the street graph once per bundle, which is a second or two on a cheap phone. A second screen
// can ask while the first build still runs: back, then Directions to somewhere else. That second ask used to be
// told "not built" at once and the screen said "The map could not be read" while the graph was a moment from
// ready. The run also belonged to the first screen's task, so leaving that screen cancelled the file reads under
// it, and the phone said the map files were not here when they were. Here the run is its own task, so no screen
// leaving can cancel it, and every caller waits for it to end (DECISIONS 2026-09-23).
//
// Android's `Directions.prepare` and the web's pending table in `dirscreen.ts` answer every caller the same way.

/// Runs `work` once for any number of overlapping callers. A caller that arrives after a run has ended starts a
/// new one; it is the caller's own state (`built`, for Directions) that says whether it needs to.
@MainActor
public final class OneRun {
    private var running: Task<Void, Never>?

    public init() {}

    /// True while a run is in flight.
    public var isRunning: Bool { running != nil }

    /// Start `work`, or join the run already in flight, and return when that run has ended. Cancelling the caller
    /// does not cancel the run: another caller may be waiting on it.
    public func run(_ work: @escaping @MainActor () async -> Void) async {
        if let running { await running.value; return }
        let task = Task { @MainActor in
            await work()
            self.running = nil
        }
        running = task
        await task.value
    }
}

// The graph build's one-at-a-time rule (HelpCore/OneRun.swift; DECISIONS 2026-09-23). The same case as Android's
// `DirectionsTest.aSecondAskWhileTheFirstBuildRunsIsAnsweredToo` and the web's `dirscreen-worker.test.ts`: a
// second ask while the first build runs waits for that build, and is never told it failed.
import HelpCore
import XCTest

@MainActor
final class OneRunTests: XCTestCase {

    /// Work that runs until the test lets it finish.
    private final class Gate {
        var runs = 0
        var finished = false
        private var open: CheckedContinuation<Void, Never>?
        private var isOpen = false
        func work() async {
            runs += 1
            if !isOpen { await withCheckedContinuation { open = $0 } }
            finished = true
        }
        func release() { isOpen = true; open?.resume(); open = nil }
    }

    private func settle() async { for _ in 0..<20 { await Task.yield() } }

    func testASecondAskWhileTheFirstRunsWaitsForThatRun() async {
        let one = OneRun(), gate = Gate()
        var firstDone = false, secondDone = false
        let first = Task { @MainActor in await one.run { await gate.work() }; firstDone = true }
        await settle()
        XCTAssertTrue(one.isRunning)
        let second = Task { @MainActor in await one.run { await gate.work() }; secondDone = true }
        await settle()
        XCTAssertFalse(secondDone, "the second ask is not answered before the work is done")
        XCTAssertEqual(gate.runs, 1, "and it did not start the work again")

        gate.release()
        await first.value
        await second.value
        XCTAssertTrue(firstDone && secondDone)
        XCTAssertTrue(gate.finished)
        XCTAssertEqual(gate.runs, 1)
        XCTAssertFalse(one.isRunning)
    }

    /// Leaving the Directions screen cancels its task. That must not cancel the build a second screen waits on.
    func testCancellingTheFirstCallerDoesNotCancelTheRun() async {
        let one = OneRun(), gate = Gate()
        var sawCancel = false
        let first = Task { @MainActor in await one.run { await gate.work(); sawCancel = Task.isCancelled } }
        await settle()
        first.cancel()
        let second = Task { @MainActor in await one.run { await gate.work() } }
        await settle()
        gate.release()
        await second.value
        await first.value
        XCTAssertTrue(gate.finished, "the work ran to the end")
        XCTAssertFalse(sawCancel, "and the work itself was never cancelled")
        XCTAssertEqual(gate.runs, 1)
    }

    func testAnAskAfterARunHasEndedStartsANewOne() async {
        let one = OneRun()
        var runs = 0
        await one.run { runs += 1 }
        await one.run { runs += 1 }
        XCTAssertEqual(runs, 2, "whether it needs to run again is the caller's own state, not this")
    }
}

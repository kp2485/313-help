// swift-tools-version:5.9
// Two libraries, both free of UIKit and SwiftUI, so `swift test` checks them on macOS **and** on Linux in CI:
//
// - DetroitQuery: the iOS app's copy of packages/query (open now, next times, badge, ranking, search, greenway).
//   It is tested against the same JSON fixtures as the web app (schema/fixtures), so the two can't drift apart.
// - HelpCore: the parts of the app itself that are not a screen — the install key and its daily dedupe hash, what
//   a report is, the outbox, the saved-places rules, the session every request goes through, the signed-bundle
//   check and what a release build may ship. These used to live in HelpApp/ and were tested only inside the
//   (git-ignored) Xcode project, so CI never ran them (iPhone review, 2026-09-20).
//
// The SwiftUI screens in HelpApp/ still need Xcode on a Mac (see apps/ios/README.md), and they compile against
// HelpCore rather than carrying their own copies. Neither library takes a dependency on anything outside this
// repository.
import PackageDescription

let package = Package(
    name: "Help313",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "DetroitQuery", targets: ["DetroitQuery"]),
        .library(name: "HelpCore", targets: ["HelpCore"]),
    ],
    targets: [
        .target(name: "DetroitQuery", path: "Sources/DetroitQuery"),
        .target(name: "HelpCore", dependencies: ["DetroitQuery"], path: "Sources/HelpCore"),
        .testTarget(name: "DetroitQueryTests", dependencies: ["DetroitQuery"], path: "Tests/DetroitQueryTests"),
        .testTarget(name: "HelpCoreTests", dependencies: ["HelpCore"], path: "Tests/HelpCoreTests"),
        // Reads HelpApp/Help.swift, apps/web/src/needs.ts and strings/*.json as text and fails when the three
        // disagree. It compiles nothing from HelpApp/, so it runs with `swift test` and needs no Xcode.
        .testTarget(name: "AppParityTests", path: "Tests/AppParityTests"),
    ]
)

// swift-tools-version:5.9
// DetroitQuery: the iOS app's copy of packages/query (open now, next times, badge, ranking, search, greenway).
// It is tested against the same JSON fixtures as the web app (schema/fixtures), so the two can't drift apart.
// Builds and tests on macOS, Linux and Windows: `swift test` from apps/ios. The SwiftUI app in
// HelpApp/ needs Xcode on a Mac (see apps/ios/README.md).
import PackageDescription

let package = Package(
    name: "Help313",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "DetroitQuery", targets: ["DetroitQuery"])],
    targets: [
        .target(name: "DetroitQuery", path: "Sources/DetroitQuery"),
        .testTarget(name: "DetroitQueryTests", dependencies: ["DetroitQuery"], path: "Tests/DetroitQueryTests"),
        // Reads HelpApp/Help.swift, apps/web/src/needs.ts and strings/*.json as text and fails when the three
        // disagree. It compiles nothing from HelpApp/, so it runs with `swift test` and needs no Xcode.
        .testTarget(name: "AppParityTests", path: "Tests/AppParityTests"),
    ]
)

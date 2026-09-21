// Every request this app makes goes through one session, configured to remember nothing about the person.
//
// `URLSession.shared` was the wrong thing to fetch a bundle with: it keeps a cookie store and a credential store,
// and it writes a URL cache to disk. A server that set a cookie would have been handed the same cookie back on
// every later request — a stable identifier for this install, which docs/08 says cannot exist (iPhone review,
// 2026-09-20). This session accepts no cookies, sends none, stores no credentials and keeps no URL cache, and it
// identifies itself honestly and identically on every phone: "313Help-iOS/<version>", with nothing about the
// device, the model, the OS build or the language in it.
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum Net {
    /// The one User-Agent this app ever sends. CLAUDE.md: identify our requests honestly; never disguise them.
    public static func userAgent(version: String) -> String { "313Help-iOS/\(version)" }

    public static func configuration(version: String) -> URLSessionConfiguration {
        let c = URLSessionConfiguration.ephemeral
        c.httpCookieStorage = nil
        c.httpShouldSetCookies = false
        c.httpCookieAcceptPolicy = .never
        c.urlCache = nil
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.urlCredentialStorage = nil
        c.httpAdditionalHeaders = ["User-Agent": userAgent(version: version)]
        c.timeoutIntervalForRequest = 20
        return c
    }

    /// Everything the app is wrong about if this is not the only session: set once, at launch.
    public private(set) static var session = URLSession(configuration: configuration(version: "0"))

    public static func start(version: String) {
        session = URLSession(configuration: configuration(version: version))
    }

    /// Everything a well-behaved configuration must be, in one place, so a test can say so and so can a reader.
    public static func problems(_ c: URLSessionConfiguration, version: String) -> [String] {
        var out: [String] = []
        if c.httpCookieStorage != nil { out.append("the session has a cookie store") }
        if c.httpShouldSetCookies { out.append("the session would store cookies a server sets") }
        if c.httpCookieAcceptPolicy != .never { out.append("the session accepts cookies") }
        if c.urlCache != nil { out.append("the session writes a URL cache") }
        if c.urlCredentialStorage != nil { out.append("the session holds credentials") }
        let ua = (c.httpAdditionalHeaders?["User-Agent"] as? String) ?? ""
        if ua != userAgent(version: version) { out.append("the User-Agent is \"\(ua)\", not \"\(userAgent(version: version))\"") }
        return out
    }
}

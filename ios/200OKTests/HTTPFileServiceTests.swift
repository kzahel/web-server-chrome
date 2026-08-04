import Foundation
import Testing
@testable import OK200

struct HTTPFileServiceTests {
    @Test
    func servesIndexMetadataHeadAndConditionalRequests() throws {
        let fixture = try TemporaryFixture()
        let service = try HTTPFileService(rootURL: fixture.root, configuration: .init())

        let get = service.response(to: request("GET", "/"))
        #expect(get.status == 200)
        #expect(get.headers["Content-Type"] == "text/html; charset=utf-8")
        #expect(get.headers["Accept-Ranges"] == "bytes")
        #expect(try responseData(get) == fixture.indexData)
        let etag = try #require(get.headers["ETag"])
        #expect(get.headers["Last-Modified"] != nil)

        let head = service.response(to: request("HEAD", "/"))
        #expect(head.status == 200)
        #expect(head.headers["Content-Length"] == String(fixture.indexData.count))
        guard case .none = head.body else {
            Issue.record("HEAD included a response body")
            return
        }

        let conditional = service.response(to: request(
            "GET",
            "/index.html",
            headers: ["if-none-match": etag]
        ))
        #expect(conditional.status == 304)
        #expect(conditional.headers["Content-Length"] == "0")
    }

    @Test
    func servesSingleByteRangesAndRejectsInvalidRanges() throws {
        let fixture = try TemporaryFixture()
        let service = try HTTPFileService(rootURL: fixture.root, configuration: .init())

        let prefix = service.response(to: request(
            "GET",
            "/hello.txt",
            headers: ["range": "bytes=0-4"]
        ))
        #expect(prefix.status == 206)
        #expect(prefix.headers["Content-Range"] == "bytes 0-4/12")
        #expect(try responseData(prefix) == Data("hello".utf8))

        let suffix = service.response(to: request(
            "GET",
            "/hello.txt",
            headers: ["range": "bytes=-6"]
        ))
        #expect(try responseData(suffix) == Data("world\n".utf8))

        let invalid = service.response(to: request(
            "GET",
            "/hello.txt",
            headers: ["range": "bytes=20-30"]
        ))
        #expect(invalid.status == 416)
        #expect(invalid.headers["Content-Range"] == "bytes */12")
    }

    @Test
    func directoryListingIsEscapedBoundedAndOptional() throws {
        let fixture = try TemporaryFixture(includeIndex: false)
        try Data("unsafe".utf8).write(to: fixture.root.appendingPathComponent("<script>.txt"))

        let listed = try HTTPFileService(rootURL: fixture.root, configuration: .init())
            .response(to: request("GET", "/"))
        let html = String(decoding: try responseData(listed), as: UTF8.self)
        #expect(listed.status == 200)
        #expect(html.contains("&lt;script&gt;.txt"))
        #expect(!html.contains("><script>.txt<"))

        var configuration = ServerConfiguration()
        configuration.directoryListing = false
        let forbidden = try HTTPFileService(rootURL: fixture.root, configuration: configuration)
            .response(to: request("GET", "/"))
        #expect(forbidden.status == 403)
    }

    @Test
    func redirectsDirectoryWithoutTrailingSlash() throws {
        let fixture = try TemporaryFixture()
        let service = try HTTPFileService(rootURL: fixture.root, configuration: .init())
        let response = service.response(to: request("GET", "/nested"))
        #expect(response.status == 308)
        #expect(response.headers["Location"] == "/nested/")
    }

    @Test
    func corsAndSPAOnlyApplyWhenEnabled() throws {
        let fixture = try TemporaryFixture()
        let ordinary = try HTTPFileService(rootURL: fixture.root, configuration: .init())
        #expect(ordinary.response(to: request("OPTIONS", "/")).status == 405)
        #expect(ordinary.response(to: request("GET", "/route")).status == 404)

        var configuration = ServerConfiguration()
        configuration.cors = true
        configuration.spaFallback = true
        let enabled = try HTTPFileService(rootURL: fixture.root, configuration: configuration)

        let options = enabled.response(to: request(
            "OPTIONS",
            "/",
            headers: ["access-control-request-headers": "X-Demo"]
        ))
        #expect(options.status == 204)
        #expect(options.headers["Access-Control-Allow-Origin"] == "*")
        #expect(options.headers["Access-Control-Allow-Headers"] == "X-Demo")

        let fallback = enabled.response(to: request("GET", "/route"))
        #expect(fallback.status == 200)
        #expect(fallback.headers["X-200-OK-SPA-Fallback"] == "index.html")
        #expect(enabled.response(to: request("GET", "/missing.js")).status == 404)
    }

    @Test
    func rejectsWritesAndMalformedPaths() throws {
        let fixture = try TemporaryFixture()
        let service = try HTTPFileService(rootURL: fixture.root, configuration: .init())
        #expect(service.response(to: request("POST", "/hello.txt")).status == 405)
        #expect(service.response(to: request("GET", "/../secret")).status == 400)
        #expect(service.response(to: request("GET", "/encoded%2fseparator")).status == 400)
    }
}

struct SecurityScopedRootStoreTests {
    @Test
    func persistsAndResolvesAReadableDirectoryBookmark() throws {
        let fixture = try TemporaryFixture()
        let suite = "app.ok200.ios.tests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = SecurityScopedRootStore(defaults: defaults)

        let selected = try store.save(url: fixture.root)
        #expect(selected.displayName == fixture.root.lastPathComponent)
        #expect(store.selection == selected)
        let lease = try store.resolveForServing()
        #expect(lease.url.standardizedFileURL == fixture.root.standardizedFileURL)
        lease.release()
    }

    @Test
    func reportsMissingSelection() throws {
        let suite = "app.ok200.ios.tests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = SecurityScopedRootStore(defaults: defaults)
        #expect(throws: SelectedRootError.noSelection) {
            try store.resolveForServing()
        }
    }
}

final class TemporaryFixture {
    let root: URL
    let indexData = Data("<!doctype html><h1>fixture</h1>\n".utf8)

    init(includeIndex: Bool = true) throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("ok200-ios-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        if includeIndex {
            try indexData.write(to: root.appendingPathComponent("index.html"))
        }
        try Data("hello world\n".utf8).write(to: root.appendingPathComponent("hello.txt"))
        let nested = root.appendingPathComponent("nested", isDirectory: true)
        try FileManager.default.createDirectory(at: nested, withIntermediateDirectories: true)
        try Data("nested\n".utf8).write(to: nested.appendingPathComponent("child.txt"))
    }

    deinit {
        try? FileManager.default.removeItem(at: root)
    }
}

private func request(
    _ method: String,
    _ target: String,
    headers: [String: String] = [:]
) -> HTTPRequest {
    HTTPRequest(method: method, target: target, version: .http11, headers: headers)
}

private func responseData(_ response: HTTPResponse) throws -> Data {
    switch response.body {
    case .none:
        return Data()
    case let .data(data):
        return data
    case let .file(url, offset, length):
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        try handle.seek(toOffset: offset)
        return try handle.read(upToCount: Int(length)) ?? Data()
    }
}

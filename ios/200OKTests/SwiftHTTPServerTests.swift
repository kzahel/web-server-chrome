import Foundation
import Testing
@testable import OK200

struct SwiftHTTPServerTests {
    @Test
    func servesStreamedFilesOverARealLoopbackListener() async throws {
        let fixture = try TemporaryFixture()
        var configuration = ServerConfiguration()
        configuration.port = 0
        configuration.allowLocalNetwork = false
        let server = SwiftHTTPServer()
        let port = try await start(server, root: fixture.root, configuration: configuration)
        defer { server.stop() }

        var request = URLRequest(url: try #require(URL(string: "http://127.0.0.1:\(port)/hello.txt")))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, rawResponse) = try await URLSession.shared.data(for: request)
        let response = try #require(rawResponse as? HTTPURLResponse)

        #expect(response.statusCode == 200)
        #expect(data == Data("hello world\n".utf8))
        #expect(response.value(forHTTPHeaderField: "Accept-Ranges") == "bytes")
    }

    @Test
    func stopReleasesAnAutomaticallyAssignedPort() async throws {
        let fixture = try TemporaryFixture()
        var configuration = ServerConfiguration()
        configuration.port = 0
        let first = SwiftHTTPServer()
        let firstPort = try await start(first, root: fixture.root, configuration: configuration)
        #expect(first.isRunning)
        first.stop()
        #expect(!first.isRunning)

        let second = SwiftHTTPServer()
        let secondPort = try await start(second, root: fixture.root, configuration: configuration)
        defer { second.stop() }
        #expect(secondPort > 0)
        #expect(firstPort > 0)
    }

    private func start(
        _ server: SwiftHTTPServer,
        root: URL,
        configuration: ServerConfiguration
    ) async throws -> UInt16 {
        try await withCheckedThrowingContinuation { continuation in
            do {
                try server.start(rootURL: root, configuration: configuration) { result in
                    continuation.resume(with: result)
                }
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }
}

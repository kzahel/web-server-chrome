import Foundation
import Testing
@testable import OK200

struct RequestPathTests {
    @Test
    func decodesOrdinaryComponentsOnce() throws {
        let path = try RequestPath(target: "/hello%20world/%252e%252e?ignored=1")
        #expect(path.components == ["hello world", "%2e%2e"])
        #expect(path.escapedPath == "/hello%20world/%252e%252e")
    }

    @Test(arguments: [
        "/../secret",
        "/.%2e/secret",
        "/folder/%2e%2e/secret"
    ])
    func rejectsTraversal(_ target: String) {
        #expect(throws: RequestPath.PathError.traversal) {
            try RequestPath(target: target)
        }
    }

    @Test(arguments: [
        "relative",
        "/bad%escape",
        "/encoded%2fseparator",
        "/encoded%5Cseparator",
        "/nul%00byte",
        "/raw\\separator"
    ])
    func rejectsMalformedOrAmbiguousPaths(_ target: String) {
        #expect(throws: RequestPath.PathError.malformed) {
            try RequestPath(target: target)
        }
    }

    @Test
    func rejectsSymlinkEscapingRoot() throws {
        let fixture = try TemporaryFixture()
        let outside = fixture.root.deletingLastPathComponent()
            .appendingPathComponent("outside-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: outside, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: outside) }
        try FileManager.default.createSymbolicLink(
            at: fixture.root.appendingPathComponent("escape"),
            withDestinationURL: outside
        )

        let path = try RequestPath(target: "/escape/secret.txt")
        #expect(throws: RequestPath.PathError.traversal) {
            try path.resolve(beneath: fixture.root)
        }
    }
}

#if DEBUG
import Foundation

enum DebugFixture {
    static let launchArgument = "-use-ok200-ui-test-fixture"
    static let resetLaunchArgument = "-reset-ok200-ui-test-state"

    static func installIfRequested(arguments: [String] = ProcessInfo.processInfo.arguments) -> URL? {
        guard arguments.contains(launchArgument) else { return nil }
        do {
            let root = FileManager.default.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            )[0].appendingPathComponent("OK200-QA-Fixture", isDirectory: true)
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            try Data("<!doctype html><title>200 OK iOS QA</title><h1>200 OK iOS QA</h1>\n".utf8)
                .write(to: root.appendingPathComponent("index.html"), options: .atomic)
            try Data("hello from ios\n".utf8)
                .write(to: root.appendingPathComponent("hello.txt"), options: .atomic)
            try Data((0..<256).map { UInt8($0) })
                .write(to: root.appendingPathComponent("bytes.bin"), options: .atomic)
            return root
        } catch {
            return nil
        }
    }
}
#endif

import Foundation
import Testing
@testable import OK200

struct SettingsCompatibilityTests {
    @Test
    func frozenSettingsCoverOldCurrentFutureAndInvalidForms() throws {
        let corpusURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "tests/compatibility/corpus-v1.json")
        let data = try Data(contentsOf: corpusURL)
        let corpus = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let persisted = try #require(corpus["persistedSettings"] as? [String: Any])
        let fixtures = try #require(persisted["ios"] as? [[String: Any]])

        for fixture in fixtures {
            let identifier = try #require(fixture["id"] as? String)
            let json = try #require(fixture["json"])
            let expected = try #require(fixture["expected"] as? [String: Any])
            let suite = "app.ok200.ios.settings-compatibility.\(UUID().uuidString)"
            let defaults = try #require(UserDefaults(suiteName: suite))
            defer { defaults.removePersistentDomain(forName: suite) }
            defaults.set(try JSONSerialization.data(withJSONObject: json), forKey: "server-configuration")

            let configuration = AppSettingsStore(defaults: defaults).load()
            #expect(configuration.port == UInt16(try #require(expected["port"] as? Int)), "\(identifier) port")
            #expect(configuration.allowLocalNetwork == (try #require(expected["allowLocalNetwork"] as? Bool)), "\(identifier) allowLocalNetwork")
            #expect(configuration.directoryListing == (try #require(expected["directoryListing"] as? Bool)), "\(identifier) directoryListing")
            #expect(configuration.cors == (try #require(expected["cors"] as? Bool)), "\(identifier) cors")
            #expect(configuration.spaFallback == (try #require(expected["spaFallback"] as? Bool)), "\(identifier) spaFallback")
        }
    }
}

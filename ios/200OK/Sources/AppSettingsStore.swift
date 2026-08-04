import Foundation

struct AppSettingsStore {
    private let defaults: UserDefaults
    private let key: String

    init(defaults: UserDefaults = .standard, key: String = "server-configuration") {
        self.defaults = defaults
        self.key = key
    }

    func load() -> ServerConfiguration {
        guard let data = defaults.data(forKey: key),
              let configuration = try? JSONDecoder().decode(ServerConfiguration.self, from: data)
        else {
            return ServerConfiguration()
        }
        return configuration
    }

    func save(_ configuration: ServerConfiguration) {
        guard let data = try? JSONEncoder().encode(configuration) else { return }
        defaults.set(data, forKey: key)
    }
}

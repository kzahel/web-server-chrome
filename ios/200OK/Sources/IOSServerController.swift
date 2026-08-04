import Foundation
import Observation
import SwiftUI

@MainActor
@Observable
final class IOSServerController {
    enum Phase: Equatable {
        case stopped
        case starting
        case running
        case stopping
        case error(String)
    }

    private(set) var phase: Phase = .stopped
    private(set) var configuration: ServerConfiguration
    private(set) var selectedRoot: SelectedRoot?
    private(set) var actualPort: UInt16?
    private(set) var wifiAddresses: [String] = []
    private(set) var backgroundStopMessage: String?
    var portText: String

    private let settingsStore: AppSettingsStore
    private let rootStore: SecurityScopedRootStore
    private let serverFactory: () -> any HTTPServing
    private let addressMonitor: NetworkAddressMonitor
    private var server: (any HTTPServing)?
    private var rootLease: SecurityScopedRootLease?
    private var startToken: UUID?

    init(
        defaults: UserDefaults = .standard,
        serverFactory: @escaping () -> any HTTPServing = { SwiftHTTPServer() },
        addressMonitor: NetworkAddressMonitor = NetworkAddressMonitor()
    ) {
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains(DebugFixture.resetLaunchArgument) {
            defaults.removeObject(forKey: "server-configuration")
            defaults.removeObject(forKey: "selected-root")
        }
        if ProcessInfo.processInfo.arguments.contains(DebugFixture.invalidRootLaunchArgument),
           let data = try? JSONEncoder().encode(SelectedRoot(
               bookmark: Data("invalid-bookmark".utf8),
               displayName: "Unavailable folder"
           )) {
            defaults.set(data, forKey: "selected-root")
        }
#endif
        let settingsStore = AppSettingsStore(defaults: defaults)
        let rootStore = SecurityScopedRootStore(defaults: defaults)
        let configuration = settingsStore.load()
        self.settingsStore = settingsStore
        self.rootStore = rootStore
        self.serverFactory = serverFactory
        self.addressMonitor = addressMonitor
        self.configuration = configuration
        selectedRoot = rootStore.selection
        portText = String(configuration.port)

#if DEBUG
        if let debugRoot = DebugFixture.installIfRequested(),
           let debugSelection = try? rootStore.save(url: debugRoot) {
            selectedRoot = debugSelection
        }
#endif

        addressMonitor.start { [weak self] addresses in
            Task { @MainActor in
                self?.wifiAddresses = addresses
            }
        }
    }

    var statusText: String {
        switch phase {
        case .stopped:
            "Stopped"
        case .starting:
            "Starting…"
        case .running:
            "Running"
        case .stopping:
            "Stopping…"
        case let .error(message):
            "Error: \(message)"
        }
    }

    var isRunning: Bool {
        if case .running = phase { return true }
        return false
    }

    var isBusy: Bool {
        switch phase {
        case .starting, .stopping:
            true
        default:
            false
        }
    }

    var settingsLocked: Bool {
        switch phase {
        case .starting, .running, .stopping:
            true
        case .stopped, .error:
            false
        }
    }

    var portError: String? {
        guard let value = UInt32(portText), value <= UInt16.max else {
            return "Enter 0 or a port from 1 to 65535."
        }
        return nil
    }

    var canStart: Bool {
        !settingsLocked && selectedRoot != nil && portError == nil
    }

    var runningURLs: [URL] {
        guard isRunning, let actualPort else { return [] }
        var urls: [URL] = []
        if let local = URL(string: "http://127.0.0.1:\(actualPort)/") {
            urls.append(local)
        }
        if configuration.allowLocalNetwork {
            urls.append(contentsOf: wifiAddresses.compactMap {
                URL(string: "http://\($0):\(actualPort)/")
            })
        }
        return urls
    }

    var previewURL: URL? {
        guard isRunning, let actualPort else { return nil }
        return URL(string: "http://127.0.0.1:\(actualPort)/")
    }

    func chooseFolder(_ url: URL) {
        guard !settingsLocked else { return }
        do {
            selectedRoot = try rootStore.save(url: url)
            if case .error = phase {
                phase = .stopped
            }
        } catch {
            phase = .error(userMessage(for: error))
        }
    }

    func updatePort(_ value: String) {
        guard !settingsLocked else { return }
        portText = value.filter(\.isNumber)
        guard let parsed = UInt32(portText), parsed <= UInt16.max else { return }
        configuration.port = UInt16(parsed)
        persistConfiguration()
    }

    func setAllowLocalNetwork(_ enabled: Bool) {
        updateConfiguration { $0.allowLocalNetwork = enabled }
    }

    func setDirectoryListing(_ enabled: Bool) {
        updateConfiguration { $0.directoryListing = enabled }
    }

    func setCORS(_ enabled: Bool) {
        updateConfiguration { $0.cors = enabled }
    }

    func setSPAFallback(_ enabled: Bool) {
        updateConfiguration { $0.spaFallback = enabled }
    }

    func start() {
        guard canStart else { return }
        backgroundStopMessage = nil
        phase = .starting

        do {
            let lease = try rootStore.resolveForServing()
            guard let parsedPort = UInt16(portText) else {
                lease.release()
                phase = .error("Enter 0 or a port from 1 to 65535.")
                return
            }
            configuration.port = parsedPort
            persistConfiguration()

            let server = serverFactory()
            let token = UUID()
            self.server = server
            rootLease = lease
            startToken = token
            try server.start(rootURL: lease.url, configuration: configuration) { [weak self] result in
                Task { @MainActor in
                    self?.handleStart(result, token: token)
                }
            }
        } catch {
            failStart(error)
        }
    }

    func stop() {
        stop(becauseAppBackgrounded: false)
    }

    func handleScenePhase(_ scenePhase: ScenePhase) {
        if scenePhase == .background, settingsLocked {
            stop(becauseAppBackgrounded: true)
        }
    }

    private func stop(becauseAppBackgrounded: Bool) {
        guard server != nil || rootLease != nil else {
            if becauseAppBackgrounded {
                backgroundStopMessage = nil
            }
            if case .error = phase { return }
            phase = .stopped
            return
        }
        phase = .stopping
        startToken = nil
        server?.stop()
        server = nil
        rootLease?.release()
        rootLease = nil
        actualPort = nil
        phase = .stopped
        if becauseAppBackgrounded {
            backgroundStopMessage = "The server stopped when 200 OK moved to the background. Start it again when you’re ready."
        }
    }

    private func handleStart(_ result: Result<UInt16, Error>, token: UUID) {
        guard token == startToken else { return }
        switch result {
        case let .success(port):
            actualPort = port
            phase = .running
        case let .failure(error):
            failStart(error)
        }
    }

    private func failStart(_ error: Error) {
        startToken = nil
        server?.stop()
        server = nil
        rootLease?.release()
        rootLease = nil
        actualPort = nil
        phase = .error(userMessage(for: error))
    }

    private func updateConfiguration(_ update: (inout ServerConfiguration) -> Void) {
        guard !settingsLocked else { return }
        update(&configuration)
        persistConfiguration()
    }

    private func persistConfiguration() {
        settingsStore.save(configuration)
    }

    private func userMessage(for error: Error) -> String {
        if let localized = error as? LocalizedError,
           let description = localized.errorDescription {
            return description
        }
        return "The server could not start. Check the folder and port, then try again."
    }

}

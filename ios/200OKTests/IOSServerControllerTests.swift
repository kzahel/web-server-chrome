import SwiftUI
import Testing
@testable import OK200

@MainActor
struct IOSServerControllerTests {
    @Test
    func startsStopsAndLocksConfigurationAroundOneServer() async throws {
        let context = try ControllerTestContext()
        let controller = context.controller
        #expect(controller.phase == .stopped)
        #expect(!controller.canStart)

        controller.chooseFolder(context.fixture.root)
        #expect(controller.canStart)
        controller.start()
        #expect(controller.phase == .starting)
        #expect(controller.settingsLocked)
        #expect(context.server.startedConfiguration?.port == 8080)

        context.server.ready(port: 54_321)
        await Task.yield()
        #expect(controller.phase == .running)
        #expect(controller.actualPort == 54_321)
        #expect(controller.runningURLs.first?.absoluteString == "http://127.0.0.1:54321/")

        controller.stop()
        #expect(controller.phase == .stopped)
        #expect(!controller.settingsLocked)
        #expect(context.server.stopCount == 1)
    }

    @Test
    func backgroundStopsWithoutAutoResumeIntent() async throws {
        let context = try ControllerTestContext()
        let controller = context.controller
        controller.chooseFolder(context.fixture.root)
        controller.start()
        context.server.ready(port: 8080)
        await Task.yield()

        controller.handleScenePhase(.inactive)
        #expect(controller.phase == .running)
        controller.handleScenePhase(.background)
        #expect(controller.phase == .stopped)
        #expect(controller.actualPort == nil)
        #expect(controller.backgroundStopMessage != nil)
        #expect(context.server.stopCount == 1)
        controller.handleScenePhase(.active)
        #expect(controller.phase == .stopped)
    }

    @Test
    func validatesAndPersistsConfiguration() throws {
        let suite = "app.ok200.ios.controller-tests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        var retainedControllers: [IOSServerController] = []

        let first = IOSServerController(defaults: defaults)
        first.updatePort("0")
        first.setAllowLocalNetwork(true)
        first.setDirectoryListing(false)
        first.setCORS(true)
        first.setSPAFallback(true)
        retainedControllers.append(first)

        let second = IOSServerController(defaults: defaults)
        #expect(second.portText == "0")
        #expect(second.configuration.allowLocalNetwork)
        #expect(!second.configuration.directoryListing)
        #expect(second.configuration.cors)
        #expect(second.configuration.spaFallback)
        second.updatePort("99999")
        #expect(second.portError != nil)
        retainedControllers.append(second)
        _ = retainedControllers
    }
}

@MainActor
private struct ControllerTestContext {
    let fixture: TemporaryFixture
    let server: StubHTTPServer
    let controller: IOSServerController
    let suite: String

    init() throws {
        fixture = try TemporaryFixture()
        server = StubHTTPServer()
        suite = "app.ok200.ios.controller-tests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let server = server
        controller = IOSServerController(defaults: defaults) { server }
    }
}

private final class StubHTTPServer: HTTPServing, @unchecked Sendable {
    private let lock = NSLock()
    private var handler: SwiftHTTPServer.StateHandler?
    private(set) var startedConfiguration: ServerConfiguration?
    private(set) var stopCount = 0
    private(set) var isRunning = false

    func start(
        rootURL: URL,
        configuration: ServerConfiguration,
        stateHandler: @escaping SwiftHTTPServer.StateHandler
    ) throws {
        lock.withLock {
            startedConfiguration = configuration
            handler = stateHandler
            isRunning = true
        }
    }

    func stop() {
        lock.withLock {
            stopCount += 1
            isRunning = false
            handler = nil
        }
    }

    func ready(port: UInt16) {
        let handler = lock.withLock { self.handler }
        handler?(.success(port))
    }
}

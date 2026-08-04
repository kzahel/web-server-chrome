import Testing
@testable import OK200

@MainActor
struct DeviceSmokeControllerTests {
    @Test
    func beginsStopped() {
        let controller = DeviceSmokeController()
        #expect(controller.phase == .stopped)
        #expect(controller.statusText == "Stopped")
        #expect(controller.displayedURL == nil)
    }
}

import SwiftUI

@main
struct OK200App: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var controller = IOSServerController()

    var body: some Scene {
        WindowGroup {
            ServerScreen(controller: controller)
                .onChange(of: scenePhase) { _, newPhase in
                    controller.handleScenePhase(newPhase)
                }
        }
    }
}

import SwiftUI

@main
struct OK200App: App {
    @State private var controller = DeviceSmokeController()

    var body: some Scene {
        WindowGroup {
            DeviceSmokeView(controller: controller)
        }
    }
}

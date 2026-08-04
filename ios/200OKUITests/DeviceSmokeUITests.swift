import XCTest

final class DeviceSmokeUITests: XCTestCase {
    @MainActor
    func testFirstSlicePresentsAccessibleStartControl() {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.staticTexts["200 OK Web Server"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["start-server"].exists)
        XCTAssertEqual(app.staticTexts["server-status"].label, "Stopped")
    }
}

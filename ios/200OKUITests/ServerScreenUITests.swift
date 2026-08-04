import XCTest

final class ServerScreenUITests: XCTestCase {
    @MainActor
    func testFixtureStartsAndLocksSettings() {
        let app = XCUIApplication()
        app.launchArguments = [
            "-reset-ok200-ui-test-state",
            "-use-ok200-ui-test-fixture"
        ]
        app.launch()

        XCTAssertTrue(app.staticTexts["200 OK Web Server"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["server-status"].label, "Stopped")
        XCTAssertTrue(app.staticTexts["folder-name"].label.contains("OK200-QA-Fixture"))

        let start = app.buttons["start-server"]
        XCTAssertTrue(start.isEnabled)
        start.tap()
        XCTAssertTrue(app.staticTexts["server-status"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["server-status"].label, "Running")
        XCTAssertFalse(app.buttons["choose-folder"].isEnabled)

        let stop = app.buttons["stop-server"]
        XCTAssertTrue(stop.exists)
        stop.tap()
        XCTAssertEqual(app.staticTexts["server-status"].label, "Stopped")
        XCTAssertTrue(app.buttons["choose-folder"].isEnabled)
    }

    @MainActor
    func testInvalidPortPreventsStart() {
        let app = XCUIApplication()
        app.launchArguments = [
            "-reset-ok200-ui-test-state",
            "-use-ok200-ui-test-fixture"
        ]
        app.launch()

        let port = app.textFields["port-field"]
        XCTAssertTrue(port.waitForExistence(timeout: 5))
        port.tap()
        port.press(forDuration: 1)
        app.menuItems["Select All"].tap()
        port.typeText("99999")
        XCTAssertFalse(app.buttons["start-server"].isEnabled)
    }

    @MainActor
    func testFirstRunRequiresAFolder() {
        let app = XCUIApplication()
        app.launchArguments = ["-reset-ok200-ui-test-state"]
        app.launch()

        XCTAssertTrue(app.staticTexts["folder-name"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["folder-name"].label, "No folder selected")
        XCTAssertFalse(app.buttons["start-server"].isEnabled)
        XCTAssertTrue(app.buttons["choose-folder"].isEnabled)
    }

    @MainActor
    func testBackgroundStopsAndResumeIsTruthful() {
        let app = XCUIApplication()
        app.launchArguments = [
            "-reset-ok200-ui-test-state",
            "-use-ok200-ui-test-fixture"
        ]
        app.launch()
        app.buttons["start-server"].tap()
        XCTAssertEqual(app.staticTexts["server-status"].label, "Running")

        XCUIDevice.shared.press(.home)
        app.activate()

        XCTAssertTrue(app.staticTexts["background-stop-message"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["server-status"].label, "Stopped")
        XCTAssertTrue(app.buttons["start-server"].isEnabled)
    }
}

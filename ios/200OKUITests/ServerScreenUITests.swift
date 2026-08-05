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

        let server = app.switches["server-toggle"]
        XCTAssertTrue(server.isEnabled)
        XCTAssertEqual(server.value as? String, "0")
        server.tap()
        XCTAssertTrue(app.staticTexts["server-status"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["server-status"].label, "Running")
        XCTAssertEqual(server.value as? String, "1")
        XCTAssertFalse(app.buttons["choose-folder"].isEnabled)

        server.tap()
        XCTAssertEqual(app.staticTexts["server-status"].label, "Stopped")
        XCTAssertEqual(server.value as? String, "0")
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
        XCTAssertFalse(app.switches["server-toggle"].isEnabled)
    }

    @MainActor
    func testFirstRunRequiresAFolder() {
        let app = XCUIApplication()
        app.launchArguments = ["-reset-ok200-ui-test-state"]
        app.launch()

        XCTAssertTrue(app.staticTexts["folder-name"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["folder-name"].label, "No folder selected")
        XCTAssertFalse(app.switches["server-toggle"].isEnabled)
        XCTAssertTrue(app.buttons["choose-folder"].isEnabled)

        let privacy = app.descendants(matching: .any)["privacy-link"]
        for _ in 0..<4 where !privacy.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(privacy.exists)
        XCTAssertTrue(privacy.isHittable)
        XCTAssertTrue(app.descendants(matching: .any)["feedback-link"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["source-link"].exists)
    }

    @MainActor
    func testInvalidBookmarkShowsRecoveryPath() {
        let app = XCUIApplication()
        app.launchArguments = [
            "-reset-ok200-ui-test-state",
            "-use-ok200-invalid-root"
        ]
        app.launch()

        XCTAssertTrue(app.staticTexts["folder-name"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["folder-name"].label, "Unavailable folder")
        app.switches["server-toggle"].tap()
        XCTAssertTrue(app.staticTexts["server-status"].label.contains("Choose it again"))
        XCTAssertEqual(app.switches["server-toggle"].value as? String, "0")
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
        app.switches["server-toggle"].tap()
        XCTAssertEqual(app.staticTexts["server-status"].label, "Running")

        XCUIDevice.shared.press(.home)
        app.activate()

        XCTAssertTrue(app.staticTexts["background-stop-message"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["server-status"].label, "Stopped")
        XCTAssertTrue(app.switches["server-toggle"].isEnabled)
        XCTAssertEqual(app.switches["server-toggle"].value as? String, "0")
    }
}

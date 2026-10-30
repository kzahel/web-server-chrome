import XCTest

final class ServerScreenUITests: XCTestCase {
    @MainActor
    private func assertStatus(_ expected: String, in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "label == %@", expected),
            object: app.staticTexts["server-status"]
        )
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 10), .completed, file: file, line: line)
    }

    @MainActor
    private func tapServerSwitch(in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        // SwiftUI's modern AX type can briefly disagree with XCTest's Switch
        // classification. The app's unique identifier survives that transition.
        let server = app.descendants(matching: .any)["server-toggle"]
        let ready = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == true AND enabled == true AND hittable == true"),
            object: server
        )
        guard XCTWaiter.wait(for: [ready], timeout: 10) == .completed else {
            XCTFail("Server switch is not ready for input", file: file, line: line)
            return
        }
        let initialValue = server.value as? String
        let initialStatus = app.staticTexts["server-status"].label
        // Delivery can be lost by hosted Simulator input. Retry once only when
        // neither the switch nor status changed; an error is an observed effect
        // too (the corrupt-bookmark test deliberately exercises that path).
        for _ in 0..<2 {
            let thumbX = initialValue == "1" ? 0.75 : 0.25
            server.coordinate(withNormalizedOffset: CGVector(dx: thumbX, dy: 0.5)).tap()
            let changed = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "value != %@", initialValue ?? ""),
                object: server
            )
            if XCTWaiter.wait(for: [changed], timeout: 3) == .completed ||
                app.staticTexts["server-status"].label != initialStatus {
                return
            }
        }
        XCTFail("Server switch input produced no state change after two attempts", file: file, line: line)
    }

    @MainActor
    func testTranslatedServingAndPersistedFolder() {
        let environment = ProcessInfo.processInfo.environment
        let locale = environment["OK200_TEST_LOCALE"] ?? "de"
        let stopped = environment["OK200_TEST_STOPPED"] ?? "Gestoppt"
        let running = environment["OK200_TEST_RUNNING"] ?? "Läuft"
        let app = XCUIApplication()
        app.launchArguments = ["-reset-ok200-ui-test-state", "-use-ok200-ui-test-fixture", "-AppleLanguages", "(\(locale))", "-AppleLocale", locale.replacingOccurrences(of: "-", with: "_")]
        app.launch()
        XCTAssertTrue(app.staticTexts["server-status"].waitForExistence(timeout: 5))
        assertStatus(stopped, in: app)
        let folder = app.staticTexts["folder-name"].label
        tapServerSwitch(in: app)
        assertStatus(running, in: app)
        XCTAssertFalse(app.buttons["choose-folder"].isEnabled)
        tapServerSwitch(in: app)
        app.terminate()
        app.launchArguments = ["-AppleLanguages", "(\(locale))", "-AppleLocale", locale.replacingOccurrences(of: "-", with: "_")]
        app.launch()
        XCTAssertTrue(app.staticTexts["server-status"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["folder-name"].label, folder)
        assertStatus(stopped, in: app)
    }

    @MainActor
    func testFixtureStartsAndLocksSettings() {
        let app = XCUIApplication()
        app.launchArguments = [
            "-reset-ok200-ui-test-state",
            "-use-ok200-ui-test-fixture"
        ]
        app.launch()

        XCTAssertTrue(app.staticTexts["200 OK Web Server"].waitForExistence(timeout: 5))
        assertStatus("Stopped", in: app)
        XCTAssertTrue(app.staticTexts["folder-name"].label.contains("OK200-QA-Fixture"))

        let server = app.switches["server-toggle"]
        XCTAssertTrue(server.isEnabled)
        XCTAssertEqual(server.value as? String, "0")
        tapServerSwitch(in: app)
        XCTAssertTrue(app.staticTexts["server-status"].waitForExistence(timeout: 5))
        assertStatus("Running", in: app)
        XCTAssertEqual(server.value as? String, "1")
        XCTAssertFalse(app.buttons["choose-folder"].isEnabled)

        tapServerSwitch(in: app)
        assertStatus("Stopped", in: app)
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
        tapServerSwitch(in: app)
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
        tapServerSwitch(in: app)
        assertStatus("Running", in: app)

        XCUIDevice.shared.press(.home)
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10))
        app.activate()

        XCTAssertTrue(app.staticTexts["background-stop-message"].waitForExistence(timeout: 5))
        assertStatus("Stopped", in: app)
        XCTAssertTrue(app.switches["server-toggle"].isEnabled)
        XCTAssertEqual(app.switches["server-toggle"].value as? String, "0")
    }
}

import Foundation
import XCTest

/// Drives an independently installed production Release app. No app test hooks.
final class ReleaseSmokeTests: XCTestCase {
    private let fixtureName = "200OK-Smoke-Website"
    private let fixtureTitle = "200 OK Release Smoke"

    @MainActor
    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<8 where !element.isHittable {
            if element.exists && element.frame.midY < app.frame.midY {
                app.swipeDown()
            } else {
                app.swipeUp()
            }
        }
        XCTAssertTrue(element.isHittable, "Control is not visible: \(element)")
    }

    @MainActor
    private func setSwitch(_ id: String, on: Bool, in app: XCUIApplication) {
        let element = app.descendants(matching: .any)[id]
        reveal(element, in: app)
        XCTAssertTrue(element.isEnabled)
        let desired = on ? "1" : "0"
        for _ in 0..<2 where element.value as? String != desired {
            let thumbX = element.value as? String == "1" ? 0.75 : 0.25
            element.coordinate(withNormalizedOffset: CGVector(dx: thumbX, dy: 0.5)).tap()
            let changed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", desired), object: element)
            if XCTWaiter.wait(for: [changed], timeout: 3) == .completed { return }
            if id == "server-toggle" && app.staticTexts["server-status"].label.hasPrefix("Error:") {
                XCTFail("Server entered an error state after input")
                return
            }
        }
        XCTAssertEqual(element.value as? String, desired, "Switch input produced no requested state after two attempts")
    }

    @MainActor
    private func assertStatus(_ value: String, in app: XCUIApplication) {
        let changed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", value), object: app.staticTexts["server-status"])
        XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 10), .completed)
    }

    @MainActor
    private func fetch(_ url: URL, method: String = "GET", headers: [String: String] = [:]) async throws -> (Data, HTTPURLResponse) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 3
        configuration.timeoutIntervalForResource = 5
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData)
        request.httpMethod = method
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        let (data, response) = try await session.data(for: request)
        return (data, try XCTUnwrap(response as? HTTPURLResponse))
    }

    @MainActor
    private func assertUnreachable(_ url: URL) async {
        let deadline = Date().addingTimeInterval(5)
        repeat {
            do {
                _ = try await fetch(url)
            } catch {
                // A cache-free independent client must fail after async close.
                return
            }
            try? await Task.sleep(for: .milliseconds(100))
        } while Date() < deadline
        XCTFail("Stopped/backgrounded app still accepts HTTP after five seconds")
    }

    @MainActor
    private func screenshot(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testReleaseFilesAndLifecycle() async throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "app.ok200.ios")
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        defer { app.terminate() }
        XCTAssertTrue(app.buttons["choose-folder"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["folder-name"].label, "No folder selected")
        XCTAssertFalse(app.descendants(matching: .any)["server-toggle"].isEnabled)
        screenshot("release-first-run", app: app)

        app.buttons["choose-folder"].tap()
        XCTAssertTrue(app.navigationBars.firstMatch.waitForExistence(timeout: 20))
        let browse = app.tabBars.buttons["Browse"]
        XCTAssertTrue(browse.waitForExistence(timeout: 10))
        browse.tap()
        let local = app.staticTexts["On My iPhone"]
        XCTAssertTrue(local.waitForExistence(timeout: 10), app.debugDescription)
        local.tap()
        let folder = app.staticTexts[fixtureName]
        XCTAssertTrue(folder.waitForExistence(timeout: 15), app.debugDescription)
        folder.doubleTap()
        let folderTitle = app.navigationBars.descendants(matching: .any).matching(
            NSPredicate(format: "label == %@ OR label == %@", fixtureName, "\(fixtureName), Actions Menu")
        ).firstMatch
        XCTAssertTrue(folderTitle.waitForExistence(timeout: 10), app.debugDescription)
        screenshot("release-picker-folder", app: app)
        let open = app.navigationBars.buttons["Open"]
        XCTAssertTrue(open.waitForExistence(timeout: 10))
        XCTAssertTrue(open.isEnabled)
        open.tap()
        // Files providers may expose their backing directory's display name.
        // The exact HTTP payload below proves which folder was actually granted.
        let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", "No folder selected"), object: app.staticTexts["folder-name"])
        XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 10), .completed)
        let selectedName = app.staticTexts["folder-name"].label
        XCTAssertFalse(selectedName.isEmpty)
        print("RELEASE_SMOKE_FOLDER_DISPLAY=\(selectedName)")
        screenshot("release-files-selected", app: app)

        let port = app.textFields["port-field"]
        reveal(port, in: app)
        port.tap()
        port.press(forDuration: 1)
        XCTAssertTrue(app.menuItems["Select All"].waitForExistence(timeout: 5))
        app.menuItems["Select All"].tap()
        port.typeText("0")
        app.buttons["Done"].tap()
        XCTAssertEqual(port.value as? String, "0")
        setSwitch("cors-toggle", on: true, in: app)
        setSwitch("server-toggle", on: true, in: app)
        assertStatus("Running", in: app)
        XCTAssertFalse(app.buttons["choose-folder"].isEnabled)
        XCTAssertTrue(app.staticTexts["server-url-local"].waitForExistence(timeout: 10))
        let url = try XCTUnwrap(URL(string: app.staticTexts["server-url-local"].label))
        print("OK200_RELEASE_SMOKE_URL=\(url.absoluteString)")
        screenshot("release-running", app: app)

        let (index, indexResponse) = try await fetch(url)
        XCTAssertEqual(indexResponse.statusCode, 200)
        XCTAssertTrue(String(decoding: index, as: UTF8.self).contains(fixtureTitle))
        let textURL = url.appendingPathComponent("hello.txt")
        let (text, textResponse) = try await fetch(textURL)
        XCTAssertEqual(textResponse.statusCode, 200)
        XCTAssertEqual(String(decoding: text, as: UTF8.self), "hello from release smoke\n")
        XCTAssertEqual(textResponse.value(forHTTPHeaderField: "Access-Control-Allow-Origin"), "*")
        let (range, rangeResponse) = try await fetch(textURL, headers: ["Range": "bytes=0-4"])
        XCTAssertEqual(rangeResponse.statusCode, 206)
        XCTAssertEqual(String(decoding: range, as: UTF8.self), "hello")
        let (_, missing) = try await fetch(url.appendingPathComponent("missing.txt"))
        XCTAssertEqual(missing.statusCode, 404)
        let (_, write) = try await fetch(textURL, method: "POST")
        XCTAssertEqual(write.statusCode, 405)
        print("RELEASE_SMOKE_HTTP=GET200,RANGE206,MISSING404,WRITE405,CORS")

        let preview = app.buttons["preview-url"]
        reveal(preview, in: app)
        preview.tap()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertTrue(app.webViews.staticTexts[fixtureTitle].waitForExistence(timeout: 15), app.debugDescription)
        screenshot("release-preview", app: app)
        let close = app.buttons.matching(NSPredicate(format: "label == 'Close' OR label == 'Done'")).firstMatch
        XCTAssertTrue(close.waitForExistence(timeout: 5))
        close.tap()
        assertStatus("Running", in: app)
        _ = try await fetch(url)

        setSwitch("server-toggle", on: false, in: app)
        assertStatus("Stopped", in: app)
        await assertUnreachable(url)
        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["folder-name"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["folder-name"].label, selectedName)
        XCTAssertEqual(app.textFields["port-field"].value as? String, "0")
        XCTAssertEqual(app.descendants(matching: .any)["cors-toggle"].value as? String, "1")
        XCTAssertEqual(app.descendants(matching: .any)["lan-toggle"].value as? String, "0")
        assertStatus("Stopped", in: app)
        print("RELEASE_SMOKE_PERSISTENCE=folder,port,cors,lan,stopped")

        setSwitch("server-toggle", on: true, in: app)
        assertStatus("Running", in: app)
        let nextURL = try XCTUnwrap(URL(string: app.staticTexts["server-url-local"].label))
        _ = try await fetch(nextURL)
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10) || app.state == .runningBackgroundSuspended)
        await assertUnreachable(nextURL)
        app.activate()
        XCTAssertTrue(app.staticTexts["background-stop-message"].waitForExistence(timeout: 10))
        assertStatus("Stopped", in: app)
        XCTAssertTrue(app.descendants(matching: .any)["server-toggle"].isEnabled)
        screenshot("release-background-stopped", app: app)
        print("RELEASE_SMOKE_LIFECYCLE=foreground200,background-off,resume-stopped")
    }
}

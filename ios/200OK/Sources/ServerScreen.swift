import SwiftUI
import UIKit

struct ServerScreen: View {
    @Bindable var controller: IOSServerController
    @State private var showsDirectoryPicker = false
    @State private var showsPreview = false
    @FocusState private var portIsFocused: Bool

    private let brandYellow = Color(red: 0.98, green: 0.82, blue: 0.02)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    brandHeader
                    if let message = controller.backgroundStopMessage {
                        informationBanner(message)
                    }
                    serverCard
                    if controller.isRunning {
                        urlsCard
                    }
                    folderCard
                    networkCard
                    behaviorCard
                    lifecycleNote
                }
                .frame(maxWidth: 620)
                .padding(.horizontal, 16)
                .padding(.vertical, 18)
                .frame(maxWidth: .infinity)
            }
            .background(Color(.systemGroupedBackground))
            .navigationBarHidden(true)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { portIsFocused = false }
                }
            }
        }
        .sheet(isPresented: $showsDirectoryPicker) {
            DirectoryPicker(
                onSelection: { url in
                    showsDirectoryPicker = false
                    controller.chooseFolder(url)
                },
                onCancel: { showsDirectoryPicker = false }
            )
            .ignoresSafeArea()
        }
        .sheet(isPresented: $showsPreview) {
            if let url = controller.previewURL {
                SafariPreview(url: url)
                    .ignoresSafeArea()
            }
        }
    }

    private var brandHeader: some View {
        HStack(spacing: 12) {
            Image("BrandIcon")
                .resizable()
                .scaledToFit()
                .frame(width: 58, height: 58)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text("200 OK")
                    .font(.system(.largeTitle, design: .rounded, weight: .black))
                Text("Web Server")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("200 OK Web Server")
    }

    private var serverCard: some View {
        card {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(statusColor.opacity(0.18))
                        Circle()
                            .fill(statusColor)
                            .frame(width: 10, height: 10)
                    }
                    .frame(width: 30, height: 30)
                    .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 3) {
                        Text("Server")
                            .font(.headline)
                        Text(controller.statusText)
                            .font(.subheadline)
                            .foregroundStyle(controller.phase.isError ? .red : .secondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("server-status")
                    }
                    Spacer()

                    Toggle("Server", isOn: serverToggleBinding)
                        .labelsHidden()
                        .toggleStyle(.switch)
                        .tint(brandYellow)
                        .disabled(!serverToggleIsOn && !controller.isBusy && !controller.canStart)
                        .accessibilityLabel("Server")
                        .accessibilityHint(serverToggleIsOn ? "Stops the web server" : "Starts the web server")
                        .accessibilityIdentifier("server-toggle")
                }

                if controller.selectedRoot == nil {
                    Text("Choose a serving folder to enable the server.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var serverToggleIsOn: Bool {
        switch controller.phase {
        case .starting, .running:
            true
        case .stopped, .stopping, .error:
            false
        }
    }

    private var serverToggleBinding: Binding<Bool> {
        Binding(
            get: { serverToggleIsOn },
            set: { enabled in
                enabled ? controller.start() : controller.stop()
            }
        )
    }

    private var folderCard: some View {
        card(title: "Serving folder", symbol: "folder") {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(controller.selectedRoot?.displayName ?? "No folder selected")
                        .font(.body.weight(.medium))
                        .lineLimit(2)
                        .accessibilityIdentifier("folder-name")
                    Text("Read-only access through Files")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button(controller.selectedRoot == nil ? "Choose" : "Change") {
                    showsDirectoryPicker = true
                }
                .buttonStyle(.bordered)
                .disabled(controller.settingsLocked)
                .accessibilityIdentifier("choose-folder")
            }
            lockedNote
        }
    }

    private var networkCard: some View {
        card(title: "Network", symbol: "network") {
            VStack(spacing: 14) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Port")
                        Text("Use 0 to choose an available port")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    TextField("8080", text: Binding(
                        get: { controller.portText },
                        set: { value in controller.updatePort(value) }
                    ))
                    .keyboardType(.numberPad)
                    .focused($portIsFocused)
                    .multilineTextAlignment(.trailing)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 110)
                    .disabled(controller.settingsLocked)
                    .accessibilityLabel("Port")
                    .accessibilityIdentifier("port-field")
                }
                if let error = controller.portError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Divider()
                settingToggle(
                    "Local network access",
                    detail: "Allow other devices on this Wi-Fi network to connect.",
                    value: Binding(
                        get: { controller.configuration.allowLocalNetwork },
                        set: { enabled in controller.setAllowLocalNetwork(enabled) }
                    ),
                    identifier: "lan-toggle"
                )
                lockedNote
            }
        }
    }

    private var behaviorCard: some View {
        card(title: "Serving behavior", symbol: "slider.horizontal.3") {
            VStack(spacing: 14) {
                settingToggle(
                    "Directory listing",
                    detail: "Show a file list when a folder has no index.html.",
                    value: Binding(
                        get: { controller.configuration.directoryListing },
                        set: { enabled in controller.setDirectoryListing(enabled) }
                    ),
                    identifier: "listing-toggle"
                )
                Divider()
                settingToggle(
                    "CORS",
                    detail: "Allow cross-origin browser requests.",
                    value: Binding(
                        get: { controller.configuration.cors },
                        set: { enabled in controller.setCORS(enabled) }
                    ),
                    identifier: "cors-toggle"
                )
                Divider()
                settingToggle(
                    "Single-page app fallback",
                    detail: "Serve the root index.html for missing routes without extensions.",
                    value: Binding(
                        get: { controller.configuration.spaFallback },
                        set: { enabled in controller.setSPAFallback(enabled) }
                    ),
                    identifier: "spa-toggle"
                )
                lockedNote
            }
        }
    }

    private var urlsCard: some View {
        card(title: "Running URLs", symbol: "link") {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(Array(displayedRunningURLs.enumerated()), id: \.element) { index, url in
                    let isLocal = url.host == "127.0.0.1"
                    VStack(alignment: .leading, spacing: 9) {
                        Text(isLocal ? "This iPhone" : "Wi-Fi")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(url.absoluteString)
                            .font(.system(.callout, design: .monospaced))
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier(isLocal ? "server-url-local" : "server-url-lan")
                        HStack {
                            Button("Copy", systemImage: "doc.on.doc") {
                                UIPasteboard.general.url = url
                            }
                            .accessibilityIdentifier("copy-url")
                            ShareLink(item: url) {
                                Label("Share", systemImage: "square.and.arrow.up")
                            }
                            .accessibilityIdentifier("share-url")
                            if isLocal {
                                Button("Preview", systemImage: "safari") {
                                    showsPreview = true
                                }
                                .accessibilityIdentifier("preview-url")
                            }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                    if index < displayedRunningURLs.count - 1 {
                        Divider()
                    }
                }
                if controller.configuration.allowLocalNetwork,
                   controller.runningURLs.count == 1 {
                    Text("No current Wi-Fi address is available. The server remains local to this iPhone until Wi-Fi is ready.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var displayedRunningURLs: [URL] {
        controller.runningURLs.sorted { lhs, rhs in
            let lhsPriority = lhs.host == "127.0.0.1" ? 1 : 0
            let rhsPriority = rhs.host == "127.0.0.1" ? 1 : 0
            return lhsPriority < rhsPriority
        }
    }

    private var lifecycleNote: some View {
        Label(
            "Serving works while 200 OK is open. iOS stops the server when the app moves to the background.",
            systemImage: "iphone"
        )
        .font(.footnote)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
    }

    @ViewBuilder
    private var lockedNote: some View {
        if controller.settingsLocked {
            Text("Stop the server to change this setting.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var statusColor: Color {
        switch controller.phase {
        case .running:
            .green
        case .starting, .stopping:
            .orange
        case .error:
            .red
        case .stopped:
            .secondary
        }
    }

    private func settingToggle(
        _ title: String,
        detail: String,
        value: Binding<Bool>,
        identifier: String
    ) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Toggle("", isOn: value)
                .labelsHidden()
                .accessibilityLabel(title)
                .accessibilityHint(detail)
                .accessibilityIdentifier(identifier)
        }
        .disabled(controller.settingsLocked)
    }

    private func card<Content: View>(
        title: String? = nil,
        symbol: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if let title, let symbol {
                Label(title, systemImage: symbol)
                    .font(.headline)
            }
            content()
        }
        .padding(17)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.primary.opacity(0.06), lineWidth: 1)
        }
    }

    private func informationBanner(_ message: String) -> some View {
        Label(message, systemImage: "info.circle.fill")
            .font(.footnote)
            .foregroundStyle(.primary)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(brandYellow.opacity(0.22))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .accessibilityIdentifier("background-stop-message")
    }
}

private extension IOSServerController.Phase {
    var isError: Bool {
        if case .error = self { return true }
        return false
    }
}

#Preview {
    ServerScreen(controller: IOSServerController())
}

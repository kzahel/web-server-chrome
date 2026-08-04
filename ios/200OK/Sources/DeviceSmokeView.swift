import SwiftUI

struct DeviceSmokeView: View {
    let controller: DeviceSmokeController

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header
                serverCard
                explanation
            }
            .frame(maxWidth: 560)
            .padding(20)
        }
        .background(Color(.systemGroupedBackground))
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image("BrandIcon")
                .resizable()
                .scaledToFit()
                .frame(width: 58, height: 58)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 1) {
                Text("200 OK")
                    .font(.title.bold())
                Text("Web Server")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("200 OK Web Server")
    }

    private var serverCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label("Device listener", systemImage: "network")
                    .font(.headline)
                Spacer()
                Text(controller.statusText)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(controller.isRunning ? .green : .secondary)
                    .accessibilityIdentifier("server-status")
            }

            if let url = controller.displayedURL {
                Text(url)
                    .font(.system(.body, design: .monospaced))
                    .textSelection(.enabled)
                    .accessibilityIdentifier("server-url")
            }

            Button(controller.isRunning ? "Stop Server" : "Start Server") {
                controller.toggle()
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.97, green: 0.82, blue: 0.01))
            .foregroundStyle(.black)
            .frame(maxWidth: .infinity)
            .controlSize(.large)
            .accessibilityIdentifier(controller.isRunning ? "stop-server" : "start-server")
        }
        .padding(18)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var explanation: some View {
        Text("This first implementation slice serves a fixed debug fixture while the app is open. Folder selection and the complete server follow after physical LAN binding is proven.")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

#Preview {
    DeviceSmokeView(controller: DeviceSmokeController())
}

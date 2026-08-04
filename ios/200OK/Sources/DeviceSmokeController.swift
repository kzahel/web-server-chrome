import Foundation
import Darwin
import Network
import Observation

@MainActor
@Observable
final class DeviceSmokeController {
    enum Phase: Equatable {
        case stopped
        case starting
        case running
        case error(String)
    }

    private(set) var phase: Phase = .stopped
    private(set) var actualPort: UInt16?

    private var listener: NWListener?
    private let listenerQueue = DispatchQueue(label: "app.ok200.ios.device-smoke")

    var statusText: String {
        switch phase {
        case .stopped:
            "Stopped"
        case .starting:
            "Starting"
        case .running:
            "Running"
        case let .error(message):
            "Error: \(message)"
        }
    }

    var isRunning: Bool {
        if case .running = phase {
            return true
        }
        return false
    }

    var displayedURL: String? {
        guard let actualPort else { return nil }
        let host = Self.wifiIPv4Address() ?? "127.0.0.1"
        return "http://\(host):\(actualPort)"
    }

    func toggle() {
        if listener == nil {
            start()
        } else {
            stop()
        }
    }

    func start() {
        guard listener == nil else { return }
        phase = .starting

        do {
            let parameters = NWParameters.tcp
            parameters.allowLocalEndpointReuse = true
            guard let requestedPort = NWEndpoint.Port(rawValue: 8080) else {
                phase = .error("Invalid port")
                return
            }

            let listener = try NWListener(using: parameters, on: requestedPort)
            listener.stateUpdateHandler = { [weak self] state in
                Task { @MainActor in
                    self?.handle(state)
                }
            }
            listener.newConnectionHandler = { [listenerQueue] connection in
                Self.serveSmokeResponse(on: connection, queue: listenerQueue)
            }
            self.listener = listener
            listener.start(queue: listenerQueue)
        } catch {
            listener = nil
            actualPort = nil
            phase = .error(error.localizedDescription)
        }
    }

    func stop() {
        listener?.stateUpdateHandler = nil
        listener?.newConnectionHandler = nil
        listener?.cancel()
        listener = nil
        actualPort = nil
        phase = .stopped
    }

    private func handle(_ state: NWListener.State) {
        switch state {
        case .setup, .waiting:
            phase = .starting
        case .ready:
            actualPort = listener?.port?.rawValue
            phase = .running
        case let .failed(error):
            listener = nil
            actualPort = nil
            phase = .error(error.localizedDescription)
        case .cancelled:
            listener = nil
            actualPort = nil
            if case .error = phase {
                return
            }
            phase = .stopped
        @unknown default:
            listener = nil
            actualPort = nil
            phase = .error("Unknown listener state")
        }
    }

    private nonisolated static func serveSmokeResponse(
        on connection: NWConnection,
        queue: DispatchQueue
    ) {
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                connection.receive(
                    minimumIncompleteLength: 1,
                    maximumLength: 8_192
                ) { _, _, _, _ in
                    let body = "ok200-ios-device-smoke\n"
                    let response = """
                    HTTP/1.1 200 OK\r
                    Content-Type: text/plain; charset=utf-8\r
                    Content-Length: \(body.utf8.count)\r
                    Connection: close\r
                    \r
                    \(body)
                    """
                    connection.send(
                        content: Data(response.utf8),
                        completion: .contentProcessed { _ in
                            connection.cancel()
                        }
                    )
                }
            case .failed, .cancelled:
                connection.cancel()
            default:
                break
            }
        }
        connection.start(queue: queue)
    }

    private nonisolated static func wifiIPv4Address() -> String? {
        var interfaces: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&interfaces) == 0, let first = interfaces else {
            return nil
        }
        defer { freeifaddrs(interfaces) }

        for interface in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let record = interface.pointee
            guard record.ifa_addr.pointee.sa_family == UInt8(AF_INET) else {
                continue
            }
            let name = String(cString: record.ifa_name)
            guard name == "en0" else { continue }

            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            let result = getnameinfo(
                record.ifa_addr,
                socklen_t(record.ifa_addr.pointee.sa_len),
                &host,
                socklen_t(host.count),
                nil,
                0,
                NI_NUMERICHOST
            )
            if result == 0 {
                let bytes = host.prefix { $0 != 0 }.map(UInt8.init(bitPattern:))
                return String(decoding: bytes, as: UTF8.self)
            }
        }
        return nil
    }
}

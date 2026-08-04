import Foundation
import Network

final class SwiftHTTPServer: @unchecked Sendable {
    static let maximumClients = 32
    static let requestTimeout: TimeInterval = 10
    static let responseTimeout: TimeInterval = 30

    enum ServerError: LocalizedError {
        case alreadyRunning
        case tooManyClients

        var errorDescription: String? {
            switch self {
            case .alreadyRunning:
                "The server is already running."
            case .tooManyClients:
                "The server is busy."
            }
        }
    }

    typealias StateHandler = @Sendable (Result<UInt16, Error>) -> Void

    private let listenerQueue = DispatchQueue(label: "app.ok200.ios.listener")
    private let lock = NSLock()
    private var listener: NWListener?
    private var connections: [UUID: HTTPConnection] = [:]

    func start(
        rootURL: URL,
        configuration: ServerConfiguration,
        stateHandler: @escaping StateHandler
    ) throws {
        let service = try HTTPFileService(rootURL: rootURL, configuration: configuration)
        let parameters = NWParameters.tcp
        parameters.allowLocalEndpointReuse = true
        let host: NWEndpoint.Host = configuration.allowLocalNetwork ? "0.0.0.0" : "127.0.0.1"
        parameters.requiredLocalEndpoint = .hostPort(
            host: host,
            port: configuration.requestedPort
        )
        let listener = try NWListener(using: parameters)

        lock.lock()
        guard self.listener == nil else {
            lock.unlock()
            throw ServerError.alreadyRunning
        }
        self.listener = listener
        lock.unlock()

        listener.stateUpdateHandler = { [weak self, weak listener] state in
            guard let self, let listener, self.isCurrent(listener) else { return }
            switch state {
            case .ready:
                if let port = listener.port?.rawValue {
                    stateHandler(.success(port))
                } else {
                    stateHandler(.failure(NWError.posix(.EINVAL)))
                    self.stop()
                }
            case let .failed(error):
                stateHandler(.failure(error))
                self.stop()
            default:
                break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            self?.accept(connection, service: service)
        }
        listener.start(queue: listenerQueue)
    }

    func stop() {
        lock.lock()
        let listener = self.listener
        self.listener = nil
        let activeConnections = Array(connections.values)
        connections.removeAll()
        lock.unlock()

        listener?.stateUpdateHandler = nil
        listener?.newConnectionHandler = nil
        listener?.cancel()
        activeConnections.forEach { $0.cancel() }
    }

    var isRunning: Bool {
        lock.withLock { listener != nil }
    }

    private func isCurrent(_ candidate: NWListener) -> Bool {
        lock.withLock { listener === candidate }
    }

    private func accept(_ connection: NWConnection, service: HTTPFileService) {
        let id = UUID()
        let handler: HTTPConnection

        lock.lock()
        guard listener != nil, connections.count < Self.maximumClients else {
            lock.unlock()
            connection.cancel()
            return
        }
        handler = HTTPConnection(id: id, connection: connection, service: service) { [weak self] id in
            self?.removeConnection(id)
        }
        connections[id] = handler
        lock.unlock()
        handler.start()
    }

    private func removeConnection(_ id: UUID) {
        _ = lock.withLock {
            connections.removeValue(forKey: id)
        }
    }
}

private final class HTTPConnection: @unchecked Sendable {
    private static let delimiter = Data([13, 10, 13, 10])
    private static let chunkSize = 64 * 1_024

    private let id: UUID
    private let connection: NWConnection
    private let service: HTTPFileService
    private let completion: @Sendable (UUID) -> Void
    private let queue: DispatchQueue
    private var buffer = Data()
    private var timer: DispatchSourceTimer?
    private var fileHandle: FileHandle?
    private var finished = false

    init(
        id: UUID,
        connection: NWConnection,
        service: HTTPFileService,
        completion: @escaping @Sendable (UUID) -> Void
    ) {
        self.id = id
        self.connection = connection
        self.service = service
        self.completion = completion
        queue = DispatchQueue(label: "app.ok200.ios.connection.\(id.uuidString)")
    }

    func start() {
        queue.async { [self] in
            scheduleTimeout(after: SwiftHTTPServer.requestTimeout) {
                self.sendAndClose(.text(408, "Request Timeout", "Request timed out.\n"))
            }
            connection.stateUpdateHandler = { [weak self] state in
                guard let self else { return }
                switch state {
                case .ready:
                    receiveRequestHead()
                case .failed, .cancelled:
                    finish()
                default:
                    break
                }
            }
            connection.start(queue: queue)
        }
    }

    func cancel() {
        queue.async { [self] in finish() }
    }

    private func receiveRequestHead() {
        guard !finished else { return }
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4_096) {
            [weak self] content, _, isComplete, error in
            guard let self, !finished else { return }
            if let content {
                buffer.append(content)
            }
            if let range = buffer.range(of: Self.delimiter) {
                let head = buffer.prefix(upTo: range.upperBound)
                handleRequest(Data(head))
                return
            }
            if buffer.count > HTTPRequestParser.maximumHeadBytes {
                sendAndClose(HTTPRequestParser.ParseError.headTooLarge.response)
                return
            }
            if error != nil || isComplete {
                sendAndClose(HTTPRequestParser.ParseError.malformed.response)
                return
            }
            receiveRequestHead()
        }
    }

    private func handleRequest(_ data: Data) {
        timer?.cancel()
        timer = nil
        do {
            let request = try HTTPRequestParser.parse(data)
            scheduleTimeout(after: SwiftHTTPServer.responseTimeout) { self.finish() }
            sendAndClose(service.response(to: request))
        } catch let error as HTTPRequestParser.ParseError {
            sendAndClose(error.response)
        } catch {
            sendAndClose(.text(400, "Bad Request", "Malformed HTTP request.\n"))
        }
    }

    private func sendAndClose(_ response: HTTPResponse) {
        guard !finished else { return }
        connection.send(content: response.serializedHead(), completion: .contentProcessed {
            [weak self] error in
            guard let self else { return }
            if error != nil {
                finish()
                return
            }
            send(body: response.body)
        })
    }

    private func send(body: HTTPResponseBody) {
        switch body {
        case .none:
            finish()
        case let .data(data):
            connection.send(content: data, completion: .contentProcessed { [weak self] _ in
                self?.finish()
            })
        case let .file(url, offset, length):
            do {
                let handle = try FileHandle(forReadingFrom: url)
                try handle.seek(toOffset: offset)
                fileHandle = handle
                sendFileBytes(remaining: length)
            } catch {
                finish()
            }
        }
    }

    private func sendFileBytes(remaining: UInt64) {
        guard remaining > 0, let fileHandle else {
            finish()
            return
        }
        do {
            let amount = Int(min(UInt64(Self.chunkSize), remaining))
            guard let data = try fileHandle.read(upToCount: amount), !data.isEmpty else {
                finish()
                return
            }
            connection.send(content: data, completion: .contentProcessed { [weak self] error in
                guard let self else { return }
                if error != nil {
                    finish()
                } else {
                    sendFileBytes(remaining: remaining - UInt64(data.count))
                }
            })
        } catch {
            finish()
        }
    }

    private func scheduleTimeout(after interval: TimeInterval, action: @escaping @Sendable () -> Void) {
        timer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + interval)
        timer.setEventHandler(handler: action)
        self.timer = timer
        timer.resume()
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        timer?.cancel()
        timer = nil
        try? fileHandle?.close()
        fileHandle = nil
        connection.stateUpdateHandler = nil
        connection.cancel()
        completion(id)
    }
}

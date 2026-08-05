import Foundation
import Testing
@testable import OK200

struct HTTPConformanceTests {
    @Test
    func passesSharedHTTPConformanceV1() async throws {
        let corpus = try loadCorpus()
        try require(corpus.schemaVersion == 1, "unexpected schema version")
        try require(corpus.runtimes.contains("swift"), "corpus does not name Swift")
        let fixture = try ConformanceFixture(specification: corpus.fixture)
        var claimed = 0

        for testCase in corpus.cases {
            guard testCase.claims.contains("swift") else {
                try require(
                    testCase.exclusions["swift"] != nil,
                    "\(testCase.id): missing Swift exclusion"
                )
                continue
            }
            claimed += 1
            let configuration = try requireValue(
                corpus.configurations[testCase.configuration],
                "\(testCase.id): missing configuration"
            )
            try await run(testCase, configuration: configuration, root: fixture.root)
        }

        print("HTTP conformance \(corpus.contractVersion): swift claimed \(claimed) cases")
    }

    private func loadCorpus() throws -> Corpus {
        let bundle = Bundle(for: ConformanceBundleToken.self)
        let url = try requireValue(
            bundle.url(forResource: "corpus-v1", withExtension: "json"),
            "corpus-v1.json is missing from the test bundle"
        )
        return try JSONDecoder().decode(Corpus.self, from: Data(contentsOf: url))
    }

    private func run(
        _ testCase: ContractCase,
        configuration source: ContractConfiguration,
        root: URL
    ) async throws {
        var configuration = ServerConfiguration()
        configuration.port = 0
        configuration.cors = source.cors
        configuration.spaFallback = source.spa
        configuration.directoryListing = source.directoryListing

        switch testCase.kind {
        case "request":
            let service = try HTTPFileService(rootURL: root, configuration: configuration)
            let request = try resolve(
                try requireValue(testCase.request, "\(testCase.id): missing request"),
                using: service
            )
            try assertResponse(
                testCase,
                response: try ContractResponse(service.response(to: makeRequest(request)))
            )

        case "oversizedHead":
            let count = try requireValue(
                testCase.oversizedHeaderBytes,
                "\(testCase.id): missing oversized byte count"
            )
            let data = Data(
                "GET / HTTP/1.1\r\nHost: localhost\r\nX-Oversized: \(String(repeating: "x", count: count))\r\n\r\n".utf8
            )
            do {
                _ = try HTTPRequestParser.parse(data)
                throw ConformanceFailure("\(testCase.id): parser accepted an oversized head")
            } catch let error as HTTPRequestParser.ParseError {
                try assertResponse(testCase, response: try ContractResponse(error.response))
            }

        case "concurrency":
            let service = try HTTPFileService(rootURL: root, configuration: configuration)
            let request = makeRequest(try requireValue(
                testCase.request,
                "\(testCase.id): missing concurrency request"
            ))
            let count = try requireValue(
                testCase.concurrency,
                "\(testCase.id): missing concurrency count"
            )
            let responses = await withTaskGroup(of: HTTPResponse.self, returning: [HTTPResponse].self) {
                group in
                for _ in 0..<count {
                    group.addTask { service.response(to: request) }
                }
                var values: [HTTPResponse] = []
                for await response in group {
                    values.append(response)
                }
                return values
            }
            for response in responses {
                try assertResponse(testCase, response: try ContractResponse(response))
            }

        case "restart":
            let first = SwiftHTTPServer()
            let firstPort = try await start(first, root: root, configuration: configuration)
            try require(firstPort > 0, "\(testCase.id): automatic port was not assigned")
            first.stop()
            let second = SwiftHTTPServer()
            let secondPort = try await start(second, root: root, configuration: configuration)
            defer { second.stop() }
            var request = URLRequest(url: try requireValue(
                URL(string: "http://127.0.0.1:\(secondPort)/"),
                "\(testCase.id): invalid loopback URL"
            ))
            request.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, rawResponse) = try await URLSession.shared.data(for: request)
            let response = try requireValue(
                rawResponse as? HTTPURLResponse,
                "\(testCase.id): response was not HTTP"
            )
            let headers = response.allHeaderFields.reduce(into: [String: String]()) { values, pair in
                values[String(describing: pair.key).lowercased()] = String(describing: pair.value)
            }
            try assertResponse(
                testCase,
                response: ContractResponse(status: response.statusCode, headers: headers, body: data)
            )

        default:
            throw ConformanceFailure("\(testCase.id): unsupported kind \(testCase.kind)")
        }
    }

    private func resolve(_ source: ContractRequest, using service: HTTPFileService) throws
        -> ContractRequest {
        var request = source
        for (name, value) in source.headers {
            guard value.hasPrefix("$"),
                  let separator = value.firstIndex(of: ":")
            else {
                continue
            }
            let placeholder = String(value[value.index(after: value.startIndex)..<separator])
            let path = String(value[value.index(after: separator)...])
            let preflight = try ContractResponse(service.response(to: makeRequest(
                ContractRequest(method: "GET", target: path)
            )))
            let header = switch placeholder {
            case "etag": "etag"
            case "last-modified": "last-modified"
            default: throw ConformanceFailure("unknown header placeholder \(placeholder)")
            }
            request.headers[name] = try requireValue(
                preflight.headers[header],
                "missing preflight header \(header)"
            )
        }
        return request
    }

    private func makeRequest(_ source: ContractRequest) -> HTTPRequest {
        HTTPRequest(
            method: source.method,
            target: source.target,
            version: .http11,
            headers: Dictionary(uniqueKeysWithValues: source.headers.map {
                ($0.key.lowercased(), $0.value)
            })
        )
    }

    private func start(
        _ server: SwiftHTTPServer,
        root: URL,
        configuration: ServerConfiguration
    ) async throws -> UInt16 {
        try await withCheckedThrowingContinuation { continuation in
            do {
                try server.start(rootURL: root, configuration: configuration) { result in
                    continuation.resume(with: result)
                }
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    private func assertResponse(_ testCase: ContractCase, response: ContractResponse) throws {
        let expectation = testCase.expect
        try require(
            expectation.statuses.contains(response.status),
            "\(testCase.id): unexpected status \(response.status)"
        )
        let body = String(decoding: response.body, as: UTF8.self)
        if let expected = expectation.bodyEquals {
            try require(body == expected, "\(testCase.id): body mismatch")
        }
        if expectation.bodyEmpty == true {
            try require(response.body.isEmpty, "\(testCase.id): expected empty body")
        }
        for expected in expectation.bodyContains {
            try require(body.contains(expected), "\(testCase.id): body missing \(expected)")
        }
        for excluded in expectation.bodyExcludes {
            try require(!body.contains(excluded), "\(testCase.id): body contained \(excluded)")
        }
        for name in expectation.headersPresent {
            try require(response.headers[name.lowercased()] != nil, "\(testCase.id): missing \(name)")
        }
        for name in expectation.headersAbsent {
            try require(response.headers[name.lowercased()] == nil, "\(testCase.id): unexpected \(name)")
        }
        for (name, expected) in expectation.headersEqual {
            try require(
                response.headers[name.lowercased()] == expected,
                "\(testCase.id): header \(name) mismatch"
            )
        }
        for (name, prefix) in expectation.headersPrefix {
            try require(
                response.headers[name.lowercased()]?.hasPrefix(prefix) == true,
                "\(testCase.id): header \(name) did not start with \(prefix)"
            )
        }
    }
}

private final class ConformanceBundleToken {}

private struct ConformanceFailure: Error, CustomStringConvertible {
    let description: String

    init(_ description: String) {
        self.description = description
    }
}

private func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    guard condition() else { throw ConformanceFailure(message) }
}

private func requireValue<T>(_ value: T?, _ message: String) throws -> T {
    guard let value else { throw ConformanceFailure(message) }
    return value
}

private final class ConformanceFixture {
    let root: URL
    private let outside: URL

    init(specification: ContractFixture) throws {
        let temporary = FileManager.default.temporaryDirectory
        root = temporary.appendingPathComponent("ok200-conformance-root-\(UUID().uuidString)")
        outside = temporary.appendingPathComponent("ok200-conformance-outside-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: outside, withIntermediateDirectories: true)
        for directory in specification.directories {
            try FileManager.default.createDirectory(
                at: root.appendingPathComponent(directory),
                withIntermediateDirectories: true
            )
        }
        for file in specification.files {
            let url = root.appendingPathComponent(file.path)
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try Data(file.utf8.utf8).write(to: url)
        }
        for (index, link) in specification.symlinkEscapes.enumerated() {
            let target = outside.appendingPathComponent("outside-\(index).txt")
            try Data(link.outsideUtf8.utf8).write(to: target)
            try FileManager.default.createSymbolicLink(
                at: root.appendingPathComponent(link.path),
                withDestinationURL: target
            )
        }
    }

    deinit {
        try? FileManager.default.removeItem(at: root)
        try? FileManager.default.removeItem(at: outside)
    }
}

private struct ContractResponse {
    let status: Int
    let headers: [String: String]
    let body: Data

    init(status: Int, headers: [String: String], body: Data) {
        self.status = status
        self.headers = headers
        self.body = body
    }

    init(_ response: HTTPResponse) throws {
        status = response.status
        headers = Dictionary(uniqueKeysWithValues: response.headers.map {
            ($0.key.lowercased(), $0.value)
        })
        switch response.body {
        case .none:
            body = Data()
        case let .data(data):
            body = data
        case let .file(url, offset, length):
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            try handle.seek(toOffset: offset)
            body = try handle.read(upToCount: Int(length)) ?? Data()
        }
    }
}

private struct Corpus: Decodable {
    let schemaVersion: Int
    let contractVersion: String
    let runtimes: [String]
    let configurations: [String: ContractConfiguration]
    let fixture: ContractFixture
    let cases: [ContractCase]
}

private struct ContractConfiguration: Decodable {
    let cors: Bool
    let spa: Bool
    let directoryListing: Bool
}

private struct ContractFixture: Decodable {
    let directories: [String]
    let files: [FixtureFile]
    let symlinkEscapes: [FixtureSymlink]
}

private struct FixtureFile: Decodable {
    let path: String
    let utf8: String
}

private struct FixtureSymlink: Decodable {
    let path: String
    let outsideUtf8: String
}

private struct ContractCase: Decodable {
    let id: String
    let kind: String
    let configuration: String
    let request: ContractRequest?
    let concurrency: Int?
    let oversizedHeaderBytes: Int?
    let claims: [String]
    let exclusions: [String: String]
    let expect: ContractExpectation
}

private struct ContractRequest: Decodable {
    let method: String
    let target: String
    var headers: [String: String] = [:]

    init(method: String, target: String, headers: [String: String] = [:]) {
        self.method = method
        self.target = target
        self.headers = headers
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        method = try values.decode(String.self, forKey: .method)
        target = try values.decode(String.self, forKey: .target)
        headers = try values.decodeIfPresent([String: String].self, forKey: .headers) ?? [:]
    }

    private enum CodingKeys: String, CodingKey {
        case method
        case target
        case headers
    }
}

private struct ContractExpectation: Decodable {
    let statuses: [Int]
    let bodyEquals: String?
    let bodyEmpty: Bool?
    let bodyContains: [String]
    let bodyExcludes: [String]
    let headersPresent: [String]
    let headersAbsent: [String]
    let headersEqual: [String: String]
    let headersPrefix: [String: String]

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        statuses = try values.decode([Int].self, forKey: .statuses)
        bodyEquals = try values.decodeIfPresent(String.self, forKey: .bodyEquals)
        bodyEmpty = try values.decodeIfPresent(Bool.self, forKey: .bodyEmpty)
        bodyContains = try values.decodeIfPresent([String].self, forKey: .bodyContains) ?? []
        bodyExcludes = try values.decodeIfPresent([String].self, forKey: .bodyExcludes) ?? []
        headersPresent = try values.decodeIfPresent([String].self, forKey: .headersPresent) ?? []
        headersAbsent = try values.decodeIfPresent([String].self, forKey: .headersAbsent) ?? []
        headersEqual = try values.decodeIfPresent([String: String].self, forKey: .headersEqual) ?? [:]
        headersPrefix = try values.decodeIfPresent([String: String].self, forKey: .headersPrefix) ?? [:]
    }


    private enum CodingKeys: String, CodingKey {
        case statuses
        case bodyEquals
        case bodyEmpty
        case bodyContains
        case bodyExcludes
        case headersPresent
        case headersAbsent
        case headersEqual
        case headersPrefix
    }
}

import Foundation

struct HTTPRequest: Equatable, Sendable {
    enum Version: String, Sendable {
        case http10 = "HTTP/1.0"
        case http11 = "HTTP/1.1"
    }

    let method: String
    let target: String
    let version: Version
    let headers: [String: String]
}

enum HTTPResponseBody: Sendable {
    case none
    case data(Data)
    case file(url: URL, offset: UInt64, length: UInt64)
}

struct HTTPResponse: Sendable {
    var status: Int
    var reason: String
    var headers: [String: String]
    var body: HTTPResponseBody

    init(
        status: Int,
        reason: String,
        headers: [String: String] = [:],
        body: HTTPResponseBody = .none
    ) {
        self.status = status
        self.reason = reason
        self.headers = headers
        self.body = body
    }

    func serializedHead() -> Data {
        var allHeaders = headers
        allHeaders["Connection"] = "close"
        allHeaders["Server"] = "200-OK-iOS"

        let orderedHeaders = allHeaders.keys.sorted().map { key in
            "\(key): \(allHeaders[key]!)\r\n"
        }.joined()
        return Data("HTTP/1.1 \(status) \(reason)\r\n\(orderedHeaders)\r\n".utf8)
    }
}

extension HTTPResponse {
    static func text(
        _ status: Int,
        _ reason: String,
        _ message: String,
        headers: [String: String] = [:]
    ) -> HTTPResponse {
        let data = Data(message.utf8)
        var responseHeaders = headers
        responseHeaders["Content-Type"] = "text/plain; charset=utf-8"
        responseHeaders["Content-Length"] = String(data.count)
        return HTTPResponse(
            status: status,
            reason: reason,
            headers: responseHeaders,
            body: .data(data)
        )
    }
}

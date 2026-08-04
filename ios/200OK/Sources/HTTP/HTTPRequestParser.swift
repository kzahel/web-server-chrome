import Foundation

enum HTTPRequestParser {
    static let maximumHeadBytes = 16 * 1_024
    static let maximumRequestLineBytes = 8 * 1_024
    static let maximumHeaderCount = 100

    enum ParseError: Error, Equatable {
        case headTooLarge
        case malformed
        case requestLineTooLarge
        case tooManyHeaders
        case versionNotSupported
        case missingHost

        var response: HTTPResponse {
            switch self {
            case .headTooLarge, .requestLineTooLarge, .tooManyHeaders:
                .text(431, "Request Header Fields Too Large", "Request headers are too large.\n")
            case .versionNotSupported:
                .text(505, "HTTP Version Not Supported", "Only HTTP/1.0 and HTTP/1.1 are supported.\n")
            case .malformed, .missingHost:
                .text(400, "Bad Request", "Malformed HTTP request.\n")
            }
        }
    }

    static func parse(_ data: Data) throws -> HTTPRequest {
        guard data.count <= maximumHeadBytes else {
            throw ParseError.headTooLarge
        }
        guard data.count >= 4, data.suffix(4) == Data([13, 10, 13, 10]) else {
            throw ParseError.malformed
        }
        guard let text = String(data: data.dropLast(4), encoding: .utf8), !text.contains("\0") else {
            throw ParseError.malformed
        }

        let rawLines = text.components(separatedBy: "\r\n")
        guard let requestLine = rawLines.first, !requestLine.isEmpty else {
            throw ParseError.malformed
        }
        guard requestLine.utf8.count <= maximumRequestLineBytes else {
            throw ParseError.requestLineTooLarge
        }
        guard rawLines.count - 1 <= maximumHeaderCount else {
            throw ParseError.tooManyHeaders
        }

        let parts = requestLine.split(separator: " ", omittingEmptySubsequences: false)
        guard parts.count == 3,
              !parts[0].isEmpty,
              !parts[1].isEmpty,
              parts[0].allSatisfy(isTokenCharacter)
        else {
            throw ParseError.malformed
        }
        guard let version = HTTPRequest.Version(rawValue: String(parts[2])) else {
            throw ParseError.versionNotSupported
        }

        var headers: [String: String] = [:]
        for line in rawLines.dropFirst() {
            guard !line.isEmpty,
                  !line.first!.isWhitespace,
                  let colon = line.firstIndex(of: ":")
            else {
                throw ParseError.malformed
            }
            let name = line[..<colon]
            guard !name.isEmpty, name.allSatisfy(isTokenCharacter) else {
                throw ParseError.malformed
            }
            let value = line[line.index(after: colon)...]
                .trimmingCharacters(in: .whitespaces)
            let key = name.lowercased()
            guard headers[key] == nil else {
                throw ParseError.malformed
            }
            headers[key] = value
        }

        if version == .http11, headers["host"]?.isEmpty != false {
            throw ParseError.missingHost
        }
        return HTTPRequest(
            method: String(parts[0]),
            target: String(parts[1]),
            version: version,
            headers: headers
        )
    }

    private static func isTokenCharacter(_ character: Character) -> Bool {
        guard character.unicodeScalars.count == 1,
              let scalar = character.unicodeScalars.first,
              scalar.isASCII
        else {
            return false
        }
        switch scalar.value {
        case 33, 35...39, 42...43, 45...46, 48...57, 65...90, 94...122, 124, 126:
            return true
        default:
            return false
        }
    }
}

import Foundation

struct RequestPath: Equatable, Sendable {
    let components: [String]
    let hasTrailingSlash: Bool
    let escapedPath: String

    enum PathError: Error, Equatable {
        case malformed
        case traversal
    }

    init(target: String) throws {
        let path = target.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)[0]
        guard path.first == "/", !path.contains("\\"), !path.contains("\0") else {
            throw PathError.malformed
        }
        guard !Self.containsEncodedSeparatorOrNUL(path), Self.hasValidEscapes(path) else {
            throw PathError.malformed
        }
        guard let decoded = String(path).removingPercentEncoding else {
            throw PathError.malformed
        }

        var decodedComponents: [String] = []
        for component in decoded.split(separator: "/", omittingEmptySubsequences: true) {
            let value = String(component)
            guard value != ".", value != ".." else {
                throw PathError.traversal
            }
            decodedComponents.append(value)
        }
        components = decodedComponents
        hasTrailingSlash = decoded.hasSuffix("/")
        escapedPath = String(path)
    }

    func resolve(beneath root: URL) throws -> URL {
        let canonicalRoot = root.standardizedFileURL.resolvingSymlinksInPath()
        var candidate = canonicalRoot
        for component in components {
            candidate.appendPathComponent(component, isDirectory: false)
            candidate = candidate.standardizedFileURL.resolvingSymlinksInPath()
            guard Self.isContained(candidate, beneath: canonicalRoot) else {
                throw PathError.traversal
            }
        }
        return candidate
    }

    private static func isContained(_ candidate: URL, beneath root: URL) -> Bool {
        let rootPath = root.path
        let candidatePath = candidate.path
        return candidatePath == rootPath || candidatePath.hasPrefix(rootPath + "/")
    }

    private static func hasValidEscapes(_ path: Substring) -> Bool {
        let bytes = Array(path.utf8)
        var index = 0
        while index < bytes.count {
            if bytes[index] == 37 {
                guard index + 2 < bytes.count,
                      isHex(bytes[index + 1]),
                      isHex(bytes[index + 2])
                else {
                    return false
                }
                index += 3
            } else {
                index += 1
            }
        }
        return true
    }

    private static func containsEncodedSeparatorOrNUL(_ path: Substring) -> Bool {
        let lowercased = path.lowercased()
        return lowercased.contains("%2f")
            || lowercased.contains("%5c")
            || lowercased.contains("%00")
    }

    private static func isHex(_ byte: UInt8) -> Bool {
        (48...57).contains(byte) || (65...70).contains(byte) || (97...102).contains(byte)
    }
}

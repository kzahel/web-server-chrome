import Foundation
import UniformTypeIdentifiers

struct HTTPFileService: Sendable {
    static let maximumDirectoryEntries = 1_000

    let rootURL: URL
    let configuration: ServerConfiguration

    init(rootURL: URL, configuration: ServerConfiguration) throws {
        let canonicalRoot = rootURL.standardizedFileURL.resolvingSymlinksInPath()
        let values = try canonicalRoot.resourceValues(forKeys: [.isDirectoryKey])
        guard values.isDirectory == true else {
            throw ServiceError.invalidRoot
        }
        self.rootURL = canonicalRoot
        self.configuration = configuration
    }

    enum ServiceError: Error, Equatable {
        case invalidRoot
    }

    func response(to request: HTTPRequest) -> HTTPResponse {
        if request.method == "OPTIONS" {
            guard configuration.cors else {
                return finish(methodNotAllowed(), for: request)
            }
            var headers = [
                "Content-Length": "0",
                "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                "Access-Control-Max-Age": "600"
            ]
            if let requestedHeaders = request.headers["access-control-request-headers"],
               !requestedHeaders.isEmpty {
                headers["Access-Control-Allow-Headers"] = requestedHeaders
            }
            return finish(
                HTTPResponse(status: 204, reason: "No Content", headers: headers),
                for: request
            )
        }
        guard request.method == "GET" || request.method == "HEAD" else {
            return finish(methodNotAllowed(), for: request)
        }

        let requestPath: RequestPath
        do {
            requestPath = try RequestPath(target: request.target)
        } catch {
            return finish(.text(400, "Bad Request", "Malformed request path.\n"), for: request)
        }

        let requestedURL: URL
        do {
            requestedURL = try requestPath.resolve(beneath: rootURL)
        } catch {
            return finish(.text(404, "Not Found", "Not found.\n"), for: request)
        }

        do {
            let resource = try inspect(requestedURL)
            if resource.isDirectory {
                return finish(
                    responseForDirectory(resource.url, requestPath: requestPath, request: request),
                    for: request
                )
            }
            guard resource.isRegularFile else {
                return finish(.text(404, "Not Found", "Not found.\n"), for: request)
            }
            return finish(responseForFile(resource, request: request), for: request)
        } catch {
            return finish(maybeSPAFallback(for: request), for: request)
        }
    }

    private func responseForDirectory(
        _ directory: URL,
        requestPath: RequestPath,
        request: HTTPRequest
    ) -> HTTPResponse {
        guard requestPath.hasTrailingSlash else {
            let location = requestPath.escapedPath + "/"
            return .text(
                308,
                "Permanent Redirect",
                "Redirecting to \(location)\n",
                headers: ["Location": location]
            )
        }

        let indexURL = directory.appendingPathComponent("index.html", isDirectory: false)
        if let index = try? inspect(indexURL), index.isRegularFile {
            return responseForFile(index, request: request)
        }
        guard configuration.directoryListing else {
            return .text(403, "Forbidden", "Directory listing is disabled.\n")
        }

        do {
            let entries = try directoryEntries(at: directory)
            let title = "Index of \(htmlEscape(requestPath.escapedPath))"
            var rows: [String] = []
            if !requestPath.components.isEmpty {
                rows.append("<li><a href=\"../\">../</a></li>")
            }
            rows.append(contentsOf: entries.map { entry in
                let suffix = entry.isDirectory ? "/" : ""
                let href = percentEncodePathComponent(entry.name) + suffix
                return "<li><a href=\"\(href)\">\(htmlEscape(entry.name))\(suffix)</a></li>"
            })
            let truncatedNotice = entries.count == Self.maximumDirectoryEntries
                ? "<p>Listing limited to \(Self.maximumDirectoryEntries) entries.</p>"
                : ""
            let html = """
            <!doctype html>
            <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
            <title>\(title)</title><style>body{font:16px system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem}li{padding:.3rem 0}</style></head>
            <body><h1>\(title)</h1>\(truncatedNotice)<ul>\(rows.joined())</ul></body></html>
            """
            let data = Data(html.utf8)
            return HTTPResponse(
                status: 200,
                reason: "OK",
                headers: [
                    "Content-Type": "text/html; charset=utf-8",
                    "Content-Length": String(data.count),
                    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
                    "X-Content-Type-Options": "nosniff"
                ],
                body: .data(data)
            )
        } catch {
            return .text(500, "Internal Server Error", "The directory could not be read.\n")
        }
    }

    private func maybeSPAFallback(for request: HTTPRequest) -> HTTPResponse {
        guard configuration.spaFallback,
              let path = try? RequestPath(target: request.target),
              path.components.last.map({ !$0.contains(".") }) ?? false,
              let index = try? inspect(rootURL.appendingPathComponent("index.html")),
              index.isRegularFile
        else {
            return .text(404, "Not Found", "Not found.\n")
        }
        var response = responseForFile(index, request: request)
        response.headers["X-200-OK-SPA-Fallback"] = "index.html"
        return response
    }

    private func responseForFile(_ resource: Resource, request: HTTPRequest) -> HTTPResponse {
        let etag = makeETag(size: resource.size, modified: resource.modified)
        let lastModified = httpDate(resource.modified)
        let baseHeaders = [
            "Accept-Ranges": "bytes",
            "Content-Type": mimeType(for: resource.url),
            "ETag": etag,
            "Last-Modified": lastModified,
            "X-Content-Type-Options": "nosniff"
        ]

        if isNotModified(request: request, etag: etag, modified: resource.modified) {
            var headers = baseHeaders
            headers["Content-Length"] = "0"
            return HTTPResponse(status: 304, reason: "Not Modified", headers: headers)
        }

        if let rangeValue = request.headers["range"] {
            switch parseRange(rangeValue, fileSize: resource.size) {
            case let .success(range):
                let length = range.upperBound - range.lowerBound + 1
                var headers = baseHeaders
                headers["Content-Length"] = String(length)
                headers["Content-Range"] = "bytes \(range.lowerBound)-\(range.upperBound)/\(resource.size)"
                return HTTPResponse(
                    status: 206,
                    reason: "Partial Content",
                    headers: headers,
                    body: .file(url: resource.url, offset: range.lowerBound, length: length)
                )
            case .failure:
                return HTTPResponse(
                    status: 416,
                    reason: "Range Not Satisfiable",
                    headers: [
                        "Content-Length": "0",
                        "Content-Range": "bytes */\(resource.size)"
                    ]
                )
            }
        }

        var headers = baseHeaders
        headers["Content-Length"] = String(resource.size)
        return HTTPResponse(
            status: 200,
            reason: "OK",
            headers: headers,
            body: .file(url: resource.url, offset: 0, length: resource.size)
        )
    }

    private func finish(_ response: HTTPResponse, for request: HTTPRequest) -> HTTPResponse {
        var response = response
        if configuration.cors {
            response.headers["Access-Control-Allow-Origin"] = "*"
        }
        if request.method == "HEAD" {
            response.body = .none
        }
        return response
    }

    private func methodNotAllowed() -> HTTPResponse {
        let allow = configuration.cors ? "GET, HEAD, OPTIONS" : "GET, HEAD"
        return .text(
            405,
            "Method Not Allowed",
            "Method not allowed.\n",
            headers: ["Allow": allow]
        )
    }

    private struct Resource: Sendable {
        let url: URL
        let isDirectory: Bool
        let isRegularFile: Bool
        let size: UInt64
        let modified: Date
    }

    private func inspect(_ url: URL) throws -> Resource {
        try coordinatedRead(at: url) { coordinatedURL in
            let values = try coordinatedURL.resourceValues(forKeys: [
                .isDirectoryKey,
                .isRegularFileKey,
                .fileSizeKey,
                .contentModificationDateKey
            ])
            return Resource(
                url: coordinatedURL,
                isDirectory: values.isDirectory == true,
                isRegularFile: values.isRegularFile == true,
                size: UInt64(max(0, values.fileSize ?? 0)),
                modified: values.contentModificationDate ?? .distantPast
            )
        }
    }

    private struct DirectoryEntry {
        let name: String
        let isDirectory: Bool
    }

    private func directoryEntries(at url: URL) throws -> [DirectoryEntry] {
        try coordinatedRead(at: url) { coordinatedURL in
            let keys: [URLResourceKey] = [.isDirectoryKey, .nameKey]
            guard let enumerator = FileManager.default.enumerator(
                at: coordinatedURL,
                includingPropertiesForKeys: keys,
                options: [.skipsSubdirectoryDescendants],
                errorHandler: { _, _ in false }
            ) else {
                throw CocoaError(.fileReadUnknown)
            }

            var entries: [DirectoryEntry] = []
            for case let child as URL in enumerator {
                enumerator.skipDescendants()
                let values = try child.resourceValues(forKeys: Set(keys))
                entries.append(DirectoryEntry(
                    name: values.name ?? child.lastPathComponent,
                    isDirectory: values.isDirectory == true
                ))
                if entries.count >= Self.maximumDirectoryEntries {
                    break
                }
            }
            return entries.sorted {
                $0.name.localizedStandardCompare($1.name) == .orderedAscending
            }
        }
    }

    private func coordinatedRead<T>(at url: URL, _ body: (URL) throws -> T) throws -> T {
        let coordinator = NSFileCoordinator()
        var coordinationError: NSError?
        var result: Result<T, Error>?
        coordinator.coordinate(readingItemAt: url, options: [], error: &coordinationError) {
            coordinatedURL in
            result = Result { try body(coordinatedURL) }
        }
        if let coordinationError {
            throw coordinationError
        }
        guard let result else {
            throw CocoaError(.fileReadUnknown)
        }
        return try result.get()
    }

    private func parseRange(
        _ value: String,
        fileSize: UInt64
    ) -> Result<ClosedRange<UInt64>, RangeError> {
        guard fileSize > 0,
              value.hasPrefix("bytes="),
              !value.contains(",")
        else {
            return .failure(.invalid)
        }
        let specification = value.dropFirst(6)
        let parts = specification.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2 else {
            return .failure(.invalid)
        }

        if parts[0].isEmpty {
            guard let suffix = UInt64(parts[1]), suffix > 0 else {
                return .failure(.invalid)
            }
            let length = min(suffix, fileSize)
            return .success((fileSize - length)...(fileSize - 1))
        }

        guard let start = UInt64(parts[0]), start < fileSize else {
            return .failure(.invalid)
        }
        if parts[1].isEmpty {
            return .success(start...(fileSize - 1))
        }
        guard let requestedEnd = UInt64(parts[1]), requestedEnd >= start else {
            return .failure(.invalid)
        }
        return .success(start...min(requestedEnd, fileSize - 1))
    }

    private enum RangeError: Error {
        case invalid
    }

    private func isNotModified(request: HTTPRequest, etag: String, modified: Date) -> Bool {
        if let condition = request.headers["if-none-match"] {
            return condition == "*" || condition
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .contains(etag)
        }
        if let value = request.headers["if-modified-since"],
           let date = parseHTTPDate(value) {
            return modified.timeIntervalSince1970.rounded(.down)
                <= date.timeIntervalSince1970.rounded(.down)
        }
        return false
    }

    private func makeETag(size: UInt64, modified: Date) -> String {
        let timestamp = UInt64(max(0, modified.timeIntervalSince1970 * 1_000))
        return "\"\(String(size, radix: 16))-\(String(timestamp, radix: 16))\""
    }

    private func httpDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss 'GMT'"
        return formatter.string(from: date)
    }

    private func parseHTTPDate(_ value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss 'GMT'"
        return formatter.date(from: value)
    }

    private func mimeType(for url: URL) -> String {
        if let type = UTType(filenameExtension: url.pathExtension),
           let mime = type.preferredMIMEType {
            if mime.hasPrefix("text/") || mime == "application/javascript" || mime == "application/json" {
                return mime + "; charset=utf-8"
            }
            return mime
        }
        return "application/octet-stream"
    }

    private func htmlEscape(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
    }

    private func percentEncodePathComponent(_ value: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#%")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    }
}

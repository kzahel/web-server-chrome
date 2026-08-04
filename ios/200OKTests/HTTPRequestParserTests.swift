import Foundation
import Testing
@testable import OK200

struct HTTPRequestParserTests {
    @Test
    func parsesHTTP11AndNormalizesHeaderNames() throws {
        let request = try HTTPRequestParser.parse(Data(
            "GET /hello.txt?download=1 HTTP/1.1\r\nHost: phone\r\nRange: bytes=0-4\r\n\r\n".utf8
        ))

        #expect(request.method == "GET")
        #expect(request.target == "/hello.txt?download=1")
        #expect(request.version == .http11)
        #expect(request.headers["range"] == "bytes=0-4")
    }

    @Test
    func acceptsHTTP10WithoutHost() throws {
        let request = try HTTPRequestParser.parse(Data("HEAD / HTTP/1.0\r\n\r\n".utf8))
        #expect(request.version == .http10)
    }

    @Test(arguments: [
        "GET / HTTP/1.1\r\n\r\n",
        "GET  / HTTP/1.1\r\nHost: x\r\n\r\n",
        "GET / HTTP/2\r\nHost: x\r\n\r\n",
        "GET / HTTP/1.1\nHost: x\n\n",
        "GET / HTTP/1.1\r\n Host: x\r\n\r\n",
        "GET / HTTP/1.1\r\nHost: x\r\nHost: y\r\n\r\n"
    ])
    func rejectsMalformedRequestHeads(_ raw: String) {
        #expect(throws: HTTPRequestParser.ParseError.self) {
            try HTTPRequestParser.parse(Data(raw.utf8))
        }
    }

    @Test
    func rejectsOversizedHead() {
        let data = Data(repeating: 65, count: HTTPRequestParser.maximumHeadBytes + 1)
        #expect(throws: HTTPRequestParser.ParseError.headTooLarge) {
            try HTTPRequestParser.parse(data)
        }
    }
}

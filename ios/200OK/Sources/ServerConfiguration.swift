import Foundation
import Network

struct ServerConfiguration: Codable, Equatable, Sendable {
    var port: UInt16 = 8080
    var allowLocalNetwork = false
    var directoryListing = true
    var cors = false
    var spaFallback = false

    var requestedPort: NWEndpoint.Port {
        NWEndpoint.Port(rawValue: port) ?? .any
    }
}

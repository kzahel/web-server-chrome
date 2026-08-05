import Foundation
import Network

struct ServerConfiguration: Codable, Equatable, Sendable {
    var port: UInt16 = 8080
    var allowLocalNetwork = false
    var directoryListing = true
    var cors = false
    var spaFallback = false

    private enum CodingKeys: String, CodingKey {
        case port
        case allowLocalNetwork
        case directoryListing
        case cors
        case spaFallback
    }

    init() {}

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        port = try values.decodeIfPresent(UInt16.self, forKey: .port) ?? 8080
        allowLocalNetwork = try values.decodeIfPresent(Bool.self, forKey: .allowLocalNetwork) ?? false
        directoryListing = try values.decodeIfPresent(Bool.self, forKey: .directoryListing) ?? true
        cors = try values.decodeIfPresent(Bool.self, forKey: .cors) ?? false
        spaFallback = try values.decodeIfPresent(Bool.self, forKey: .spaFallback) ?? false
    }

    var requestedPort: NWEndpoint.Port {
        NWEndpoint.Port(rawValue: port) ?? .any
    }
}

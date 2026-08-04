import Darwin
import Foundation
import Network

final class NetworkAddressMonitor: @unchecked Sendable {
    private let monitor = NWPathMonitor(requiredInterfaceType: .wifi)
    private let queue = DispatchQueue(label: "app.ok200.ios.network-addresses")

    func start(handler: @escaping @Sendable ([String]) -> Void) {
        monitor.pathUpdateHandler = { path in
            guard path.status == .satisfied, path.usesInterfaceType(.wifi) else {
                handler([])
                return
            }
            handler(Self.wifiIPv4Addresses())
        }
        monitor.start(queue: queue)
    }

    func cancel() {
        monitor.cancel()
    }

    private static func wifiIPv4Addresses() -> [String] {
        var interfaces: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&interfaces) == 0, let first = interfaces else {
            return []
        }
        defer { freeifaddrs(interfaces) }

        var addresses: [String] = []
        for interface in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let record = interface.pointee
            guard record.ifa_addr != nil,
                  record.ifa_addr.pointee.sa_family == UInt8(AF_INET),
                  String(cString: record.ifa_name) == "en0"
            else {
                continue
            }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            guard getnameinfo(
                record.ifa_addr,
                socklen_t(record.ifa_addr.pointee.sa_len),
                &host,
                socklen_t(host.count),
                nil,
                0,
                NI_NUMERICHOST
            ) == 0 else {
                continue
            }
            let bytes = host.prefix { $0 != 0 }.map(UInt8.init(bitPattern:))
            let address = String(decoding: bytes, as: UTF8.self)
            if !address.hasPrefix("127."), !address.hasPrefix("169.254.") {
                addresses.append(address)
            }
        }
        return Array(Set(addresses)).sorted()
    }
}

import Foundation

struct SelectedRoot: Codable, Equatable, Sendable {
    let bookmark: Data
    let displayName: String
}

enum SelectedRootError: LocalizedError, Equatable {
    case noSelection
    case stale
    case unavailable
    case notDirectory

    var errorDescription: String? {
        switch self {
        case .noSelection:
            "Choose a folder before starting the server."
        case .stale:
            "The saved folder permission has expired. Choose the folder again."
        case .unavailable:
            "The selected folder is unavailable. Choose it again in Files."
        case .notDirectory:
            "The selected item is not a folder."
        }
    }
}

final class SecurityScopedRootLease: @unchecked Sendable {
    let url: URL
    private let didStartAccess: Bool
    private let lock = NSLock()
    private var released = false

    init(url: URL, didStartAccess: Bool) {
        self.url = url
        self.didStartAccess = didStartAccess
    }

    func release() {
        lock.lock()
        guard !released else {
            lock.unlock()
            return
        }
        released = true
        lock.unlock()
        if didStartAccess {
            url.stopAccessingSecurityScopedResource()
        }
    }

    deinit {
        release()
    }
}

struct SecurityScopedRootStore {
    private let defaults: UserDefaults
    private let key: String

    init(defaults: UserDefaults = .standard, key: String = "selected-root") {
        self.defaults = defaults
        self.key = key
    }

    var selection: SelectedRoot? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(SelectedRoot.self, from: data)
    }

    @discardableResult
    func save(url: URL) throws -> SelectedRoot {
        let didStartAccess = url.startAccessingSecurityScopedResource()
        defer {
            if didStartAccess {
                url.stopAccessingSecurityScopedResource()
            }
        }
        let values = try url.resourceValues(forKeys: [.isDirectoryKey, .isReadableKey, .nameKey])
        guard values.isDirectory == true else {
            throw SelectedRootError.notDirectory
        }
        guard values.isReadable != false else {
            throw SelectedRootError.unavailable
        }
        let bookmark = try url.bookmarkData(
            options: .minimalBookmark,
            includingResourceValuesForKeys: [.isDirectoryKey, .nameKey],
            relativeTo: nil
        )
        let selected = SelectedRoot(
            bookmark: bookmark,
            displayName: values.name ?? url.lastPathComponent
        )
        defaults.set(try JSONEncoder().encode(selected), forKey: key)
        return selected
    }

    func resolveForServing() throws -> SecurityScopedRootLease {
        guard let selection else {
            throw SelectedRootError.noSelection
        }
        var isStale = false
        let url: URL
        do {
            url = try URL(
                resolvingBookmarkData: selection.bookmark,
                options: [.withoutUI],
                relativeTo: nil,
                bookmarkDataIsStale: &isStale
            )
        } catch {
            throw SelectedRootError.unavailable
        }
        guard !isStale else {
            throw SelectedRootError.stale
        }
        let didStartAccess = url.startAccessingSecurityScopedResource()
        do {
            let values = try url.resourceValues(forKeys: [.isDirectoryKey, .isReadableKey])
            guard values.isDirectory == true else {
                throw SelectedRootError.notDirectory
            }
            guard values.isReadable != false else {
                throw SelectedRootError.unavailable
            }
            return SecurityScopedRootLease(url: url, didStartAccess: didStartAccess)
        } catch {
            if didStartAccess {
                url.stopAccessingSecurityScopedResource()
            }
            if let selectedError = error as? SelectedRootError {
                throw selectedError
            }
            throw SelectedRootError.unavailable
        }
    }

    func clear() {
        defaults.removeObject(forKey: key)
    }
}

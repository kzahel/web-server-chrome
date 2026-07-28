# Filebrowser Analysis

Status: competitor research. The 200 OK comparison was reconciled on
2026-07-28 with the accepted desktop Rust-core direction; Filebrowser facts
remain a dated research snapshot.

**Repo**: https://github.com/filebrowser/filebrowser
**Local clone**: `references/filebrowser/`
**Stars**: 33.6k | **Contributors**: 226 | **License**: Apache 2.0
**Created**: Sept 2015 | **Status**: Maintenance-only (bug fixes and security only)

## The Author

**Henrique Dias** (@hacdias) — Portuguese software engineer based in the Netherlands. Passionate about open source, digital identity, and the IndieWeb. Also a core contributor to **IPFS Kubo** (16.9k stars) and maintains a standalone **WebDAV** server. GitHub Developer Program member with 14 security advisory credits. Website: https://hacdias.com

## Architecture

**Backend: Go** | **Frontend: Vue 3 + TypeScript** | **Storage: BoltDB (embedded)**

```
main.go → cmd/ (Cobra CLI)
              ├── http/        REST API via Gorilla Mux
              ├── auth/        Pluggable auth (JSON, Hook, Proxy, None)
              ├── users/       RBAC permissions model
              ├── files/       File info, MIME detection, checksums
              ├── fileutils/   Copy, delete, move operations
              ├── storage/     Abstract store interfaces → bolt/ impl
              ├── search/      Filesystem search
              ├── share/       Shareable links with expiry/passwords
              ├── runner/      Command hooks (before/after operations)
              ├── img/         Thumbnail generation, EXIF
              ├── diskcache/   Preview caching (disk or Redis)
              ├── rules/       Path-based access control (regex)
              ├── settings/    Config (CLI flags > env vars > config file > DB)
              └── frontend/    Vue 3 SPA (Vite, Pinia, Vue Router)
```

## Key Design Patterns

### Pluggable Auth (`auth/` package)

`Auther` interface with 4 implementations:
- **JSON Auth** — username/password, optional ReCAPTCHA, timing attack protection
- **Hook Auth** — external command execution for auth decisions
- **Proxy Auth** — trust upstream proxy headers (LDAP integration)
- **No Auth** — bypass entirely

JWT tokens (HS256, configurable expiry, extracted from header or cookie).

### Filesystem Abstraction

Uses **Afero** (Go's virtual filesystem library). Each user gets an isolated filesystem rooted at their scope. Validates our `IFileSystem` adapter approach.

### Storage Backend Interfaces

Separate interfaces for Users, Auth, Settings, Shares — all with a BoltDB concrete implementation. Easy to swap backends.

### Handler Middleware

Custom `handleFunc` signature: `(w, r, *data) → (int, error)` where `*data` carries injected deps (storage, settings, user, rules). `monkey` wrapper applies auth, logging, error handling, global headers.

### Command Hooks

Pre/post hooks for file operations (`before_copy`, `after_upload`, etc.) with env var substitution (`$FILE`, `$SCOPE`, `$USERNAME`, `$DESTINATION`). Non-blocking commands via `&` suffix.

### Config Precedence

CLI flags > env vars > config file > database > defaults. Config auto-discovered in `./`, `$HOME/`, `/etc/filebrowser/`.

### TUS Protocol

Resumable uploads via tus-js-client. Useful for large files on mobile/flaky connections.

## Permissions Model

```
Admin, Execute, Create, Rename, Modify, Delete, Share, Download
```

Plus path-based rules (prefix and regex matching) at both global and per-user levels.

## Frontend Stack

Vue 3, TypeScript, Vite, Pinia (state), Vue Router. Key features:
- Ace editor (syntax highlighting)
- Video.js player
- EPub reader
- Markdown rendering (Marked)
- QR codes for shares
- CSV parsing
- TUS resumable uploads

## Comparison to 200 OK

| Filebrowser | 200 OK |
|---|---|
| Go monolith | Desktop target is Rust core + Tauri control UI; Android/CLI retain their current runtimes |
| Server-side rendering decisions | Desktop Rust core owns HTTP behavior; platform UI owns control |
| Single embedded DB (BoltDB) | No DB needed (Phase 0) |
| Multi-user with RBAC | Single-user initially |
| Gorilla Mux routing | Rust HTTP library is not yet selected |
| Afero for FS abstraction | Native desktop filesystem boundary; existing `IFileSystem` remains in Android/CLI engine |

## Lessons for Us

- **UI polish matters enormously** — the Vue frontend is what made it popular, not the Go backend
- **Sensible defaults + zero config** — works out of the box with just `filebrowser` command
- **Docker-first deployment** drove adoption in the self-hosted community
- **Maintenance mode is telling** — feature-complete for its scope; we can learn from what they built
- **Their interfaces validate clear ownership boundaries** (pluggable auth,
  filesystem abstraction, storage backends), but do not require a
  TypeScript-native-I/O desktop core
- **Shareable links** are a killer feature for file servers
- **Resumable uploads (TUS)** important for reliability on mobile/flaky connections

# Architecture

One Bun package. Core owns inventory and writes. The TUI and web UI are views over the same functions.

```
src/cli.ts          commands
src/core/           scan, catalog, install, uninstall, backups
src/core/adapters/  one adapter per agent
src/tui/            Ink
src/web/            Hono API + React SPA
catalog/            built-in install sources
```

## Scan

`scan()` detects each adapter (binary on PATH or well-known home dir), lists global items, then project items from that agent's own project index plus `--local`. Parse errors become `warnings` on the agent. They do not abort the rest of the scan.

Inventory is derived from disk plus `~/.agent-cleaner/ledger.json`. The ledger records what this tool installed so uninstall can reverse it.

## Writes

Adapters never write. They return a `MutationPlan` (copy dir, merge JSON/TOML, remove, ...). Core:

1. Copies every target path into `~/.agent-cleaner/backups/<iso>/`
2. Applies the ops
3. On failure, restores that backup
4. Appends a ledger row

Interactive UIs always confirm. Headless requires `--yes`.

## Redaction

`redactInventory` strips MCP `env` / `headers` and keys matching `/token|key|secret|password|authorization|cookie/i` before TUI, web, and `scan --json`.

## Web

`GET /api/inventory`, `GET /api/catalog`, `POST /api/plan/install`, `POST /api/plan/uninstall`, `POST /api/apply`. Plans expire after five minutes. Bind is `127.0.0.1` unless `config.toml` sets `bind = "0.0.0.0"`.

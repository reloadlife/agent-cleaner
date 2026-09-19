# Contributing

You need [Bun](https://bun.sh) 1.2+.

```bash
bun install
bun test
bun src/cli.ts scan --json
```

## Layout

- `src/core` - scan, adapters, catalog, install/uninstall
- `src/core/adapters` - one file per agent; adapters plan file ops, they do not write
- `src/tui` - Ink TUI
- `src/web` - Hono API + React UI
- `catalog` - built-in install sources
- `test/fixtures` - fake home directories; tests never touch the real `$HOME`

## Adding an agent

1. Implement `AgentAdapter` in `src/core/adapters/<id>.ts`.
2. Register it in `src/core/adapters/index.ts`.
3. Add a fixture under `test/fixtures/` and a scan test.

Writes must go through `MutationPlan` so backups still apply. Keep MCP `env` / `headers` out of logs; `redactInventory` is the serialization boundary.

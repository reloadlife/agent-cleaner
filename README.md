# Agent Cleaner

Scan what your coding agents will actually load, then install or uninstall the same skill, hook, MCP, or plugin on the agents you pick.

Supports Claude Code, Cursor, Codex, Grok, OpenCode, and Gemini CLI. Local only. No account, no upload.

## Install

Needs [Bun](https://bun.sh) 1.2+.

```bash
bunx @reloadlife/agent-cleaner
```

Or install the CLI:

```bash
bun add -g @reloadlife/agent-cleaner
agent-cleaner
```

From GitHub Packages (needs a GitHub token in `.npmrc`):

```bash
bunx --registry https://npm.pkg.github.com @reloadlife/agent-cleaner
```

From source:

```bash
git clone https://github.com/reloadlife/agent-cleaner.git
cd agent-cleaner
bun install
bun src/cli.ts
```

Release binaries: [GitHub Releases](https://github.com/reloadlife/agent-cleaner/releases). Unpack the archive and keep `catalog/` next to `./agent-cleaner`.

## Usage

```bash
bun src/cli.ts                 # TUI
bun src/cli.ts --local .       # TUI, pin this project
bun src/cli.ts serve           # web UI at http://127.0.0.1:8787
bun src/cli.ts scan --json     # inventory on stdout
bun src/cli.ts install ./my-skill --to claude,cursor --yes
bun src/cli.ts uninstall '<item-id>' --yes
```

`install` source can be a catalog id (`find-skills`), a git URL, or a local path. Without `--yes`, headless install/uninstall print a plan and exit 2.

Keys in the TUI: arrows, tab, `/` search, `i` install, `u` uninstall, enter detail, `r` rescan, `q` quit.

## Safety

- Writes go to the files those agents already read.
- Every mutate copies the targets into `~/.agent-cleaner/backups/` first.
- Vendor-bundled extras are view-only.
- MCP `env` / `headers` and token-like keys are redacted unless you pass `--show-secrets`.
- The web UI binds `127.0.0.1`. Set `bind = "0.0.0.0"` in config to opt in.

## Config

`~/.agent-cleaner/config.toml`:

```toml
bind = "127.0.0.1"
port = 8787
# last_local = "/path/to/project"
# disabled_adapters = ["gemini"]
```

`--home` or `AGENT_CLEANER_HOME` overrides the home directory (used in tests).

## Development

```bash
bun test
bun run typecheck
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Docs

- [Usage](docs/usage.md) — TUI keys, web, headless CLI
- [Architecture](docs/architecture.md) — scan, plans, backups
- [Agents](docs/agents.md) — paths and what each adapter reads
- [CI / CD](docs/ci-cd.md) — tests and tagged releases
- [Security](SECURITY.md)

## License

MIT. See [LICENSE](LICENSE).

# Usage

```bash
bunx @reloadlife/agent-cleaner
bunx @reloadlife/agent-cleaner --local .
bunx @reloadlife/agent-cleaner serve
bunx @reloadlife/agent-cleaner scan --json
```

## TUI

```bash
bun src/cli.ts
bun src/cli.ts --local /path/to/project
```

| Key | Action |
|---|---|
| arrows | move |
| tab | cycle panes (agents, scopes, items) |
| left / right | cycle kind (skills, hooks, MCPs, ...) |
| `/` | filter |
| enter | item detail |
| `i` | install wizard |
| `u` | uninstall (confirm with `y`) |
| `r` | rescan |
| `q` | quit |

Install wizard: source (catalog / git URL / local path) → target agents → confirm file list.

## Web UI

```bash
bun src/cli.ts serve
bun src/cli.ts serve --port 9000
```

Opens on `http://127.0.0.1:8787` by default. Same inventory and install flow as the TUI.

## Headless

```bash
bun src/cli.ts scan --json
bun src/cli.ts scan --json --local .
bun src/cli.ts scan --json --show-secrets   # includes MCP env/headers; do not share
```

Install:

```bash
bun src/cli.ts install find-skills --to claude,cursor
bun src/cli.ts install find-skills --to claude,cursor --yes
bun src/cli.ts install ./my-skill --to grok --kind skill --name my-skill --yes
bun src/cli.ts install https://github.com/org/repo --to claude --yes
```

Without `--yes`, the command prints the mutation plan and exits `2`.

Uninstall (item id comes from `scan --json`):

```bash
bun src/cli.ts uninstall 'claude:skill:/Users/you/.claude/skills/my-skill' --yes
```

## Flags

| Flag | Meaning |
|---|---|
| `--local [path]` | include a project (default: last `--local`, else cwd) |
| `--home <path>` | override home (or `AGENT_CLEANER_HOME`) |
| `--to <ids>` | comma-separated agent ids |
| `--kind <kind>` | `skill` `hook` `mcp` `plugin` `command` `rule` `subagent` |
| `--name <name>` | override installed name |
| `--project <path>` | install into that project instead of global |
| `--overwrite` | replace existing files |
| `--yes` | apply headless mutate |
| `--port <n>` | web port |
| `--show-secrets` | skip redaction on `scan --json` |

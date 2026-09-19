# Agent adapters

v1 adapters: Claude Code, Cursor, Codex, Grok, OpenCode, Gemini CLI / Antigravity.

An agent is **installed** if its binary is on `PATH` or its home directory exists. Bundled/vendor extras are listed as `mutable: false` and cannot be uninstalled.

| Agent | Home | Typical extras |
|---|---|---|
| `claude` | `~/.claude` (+ `~/.claude.json`) | skills, hooks in `settings.json`, MCP in `~/.claude.json`, plugins, agents, project `.claude/` and `.mcp.json` |
| `cursor` | `~/.cursor` | skills, `mcp.json`, `hooks.json`, plugins, agents; projects from `~/.cursor/projects/` (hyphen-encoded paths) |
| `codex` | `~/.codex` | skills, `hooks.json`, `config.toml` MCP, `AGENTS.md`, project `.codex/` |
| `grok` | `~/.grok` | skills, `hooks/*.json`, `config.toml` MCP, `installed-plugins/`, bundled skills (view-only) |
| `opencode` | `~/.config/opencode` | `opencode.jsonc` MCP/plugins, skills, commands, `AGENTS.md` |
| `gemini` | `~/.gemini` | `settings.json` MCP/hooks, skills, `config/mcp_config.json`; `antigravity*` trees listed under the same agent |

Disable an adapter in `~/.agent-cleaner/config.toml`:

```toml
disabled_adapters = ["gemini"]
```

Project discovery is the agent's own index plus `--local`. The tool does not walk the whole disk.

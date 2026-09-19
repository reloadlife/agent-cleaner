# Security

Agent Cleaner reads and can write local coding-agent config files (`~/.claude`, `~/.cursor`, and similar). It never uploads those files.

## Secrets

MCP configs often contain API keys. The TUI, web UI, and `scan --json` redact `env`, `headers`, and token-like keys. Do not pass `--show-secrets` into a gist, issue, or chat log.

Install and uninstall copy the files they will change into `~/.agent-cleaner/backups/` first. Bundled/vendor extras are view-only.

## Reporting

Open a GitHub issue for non-sensitive bugs. For a vulnerability in backup handling, redaction, or bind defaults, email the maintainer listed in `package.json` instead of filing a public issue.

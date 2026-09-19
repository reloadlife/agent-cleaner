# CI / CD

## CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- `bun install --frozen-lockfile`
- `bun test`
- `bun run typecheck`
- CLI smoke (`--help` and `scan --json`) on Ubuntu and macOS

## CD

`.github/workflows/release.yml` runs on tags matching `v*`.

It tests, compiles `agent-cleaner` for linux/macOS (x64 and arm64), packs each binary with `catalog/` and the prebuilt web UI, then publishes a GitHub Release.

Cut a release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The tag should match `package.json` `version` and a `## v0.1.0` section in `CHANGELOG.md`.

Install a release binary:

```bash
tar -xzf agent-cleaner-darwin-arm64.tar.gz
cd agent-cleaner-darwin-arm64
./agent-cleaner scan --json
```

Keep `catalog/` next to the binary so built-in catalog items resolve.

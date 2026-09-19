# CI / CD

## CI

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- `bun install --frozen-lockfile`
- `bun test`
- `bun run typecheck`
- CLI smoke (`--help` and `scan --json`) on Ubuntu and macOS

## CD

`.github/workflows/release.yml` runs on tags matching `v*`.

It tests, compiles `agent-cleaner` for linux/macOS (x64 and arm64), packs each binary with `catalog/` and the prebuilt web UI, then:

1. Publishes a GitHub Release with those archives
2. Publishes `@reloadlife/agent-cleaner` to [GitHub Packages](https://github.com/reloadlife/agent-cleaner/pkgs/npm/agent-cleaner)
3. Publishes the same package to [npmjs](https://www.npmjs.com/package/@reloadlife/agent-cleaner) when the `NPM_TOKEN` repo secret is set

Cut a release:

```bash
git tag v0.1.1
git push origin v0.1.1
```

The tag should match `package.json` `version` and a `## v0.1.1` section in `CHANGELOG.md`.

Then:

```bash
bunx @reloadlife/agent-cleaner
```

Install a release binary:

```bash
tar -xzf agent-cleaner-darwin-arm64.tar.gz
cd agent-cleaner-darwin-arm64
./agent-cleaner scan --json
```

Keep `catalog/` next to the binary so built-in catalog items resolve.

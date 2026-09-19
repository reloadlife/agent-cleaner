#!/usr/bin/env bun
import { homedir } from "node:os"
import { resolve } from "node:path"
import { inspectStaging, loadCatalog, stageOrigin } from "./core/catalog"
import { loadAppConfig, saveAppConfig } from "./core/config"
import { install, previewInstall } from "./core/install"
import { defaultAppDir } from "./core/paths"
import { redactInventory } from "./core/redact"
import { scan } from "./core/scan"
import type { AgentId, ItemKind, Origin, ScanOptions } from "./core/types"
import { previewUninstall, uninstall } from "./core/uninstall"

function usage(): string {
  return `agent-cleaner - inspect and manage coding-agent skills, hooks, MCPs, and plugins

Usage:
  agent-cleaner                     open the TUI
  agent-cleaner --local [path]      TUI, pin a project
  agent-cleaner scan --json         print inventory
  agent-cleaner serve [--port N]    localhost web UI
  agent-cleaner install <source> --to claude,cursor [--kind skill] [--name demo] --yes
  agent-cleaner uninstall <item-id> --yes

Source is a catalog id, git URL, or local path.

Options:
  --local [path]     include this project (default: last --local, else cwd)
  --show-secrets     do not redact MCP env/headers
  --port <n>         web port
  --to <agents>      comma-separated agent ids
  --kind <kind>      skill | hook | mcp | plugin | command | rule | subagent
  --name <name>      override installed name
  --project <path>   install into this project instead of global
  --overwrite        replace existing files
  --yes              apply headless install/uninstall (prints plan and exits 2 without this)
  --home <path>      override home (or AGENT_CLEANER_HOME)
`
}

type Flags = {
  positional: string[]
  home?: string
  port?: number
  local?: string | true
  yes: boolean
  json: boolean
  showSecrets: boolean
  overwrite: boolean
  to?: string
  kind?: string
  name?: string
  project?: string
  agent?: string
}

function parseArgs(argv: string[]): Flags {
  const out: Flags = {
    positional: [],
    yes: false,
    json: false,
    showSecrets: false,
    overwrite: false,
  }
  const take = new Map<string, (v: string) => void>([
    ["--home", (v) => { out.home = v }],
    ["--port", (v) => { out.port = Number(v) }],
    ["--to", (v) => { out.to = v }],
    ["--kind", (v) => { out.kind = v }],
    ["--name", (v) => { out.name = v }],
    ["--project", (v) => { out.project = v }],
    ["--agent", (v) => { out.agent = v }],
    ["--from", (v) => { out.positional.push(v) }],
  ])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === "--yes") out.yes = true
    else if (a === "--json") out.json = true
    else if (a === "--show-secrets") out.showSecrets = true
    else if (a === "--overwrite") out.overwrite = true
    else if (a === "--local") {
      const n = argv[i + 1]
      if (n && !n.startsWith("-")) {
        out.local = n
        i++
      } else out.local = true
    } else if (take.has(a)) {
      const v = argv[i + 1]
      if (!v || v.startsWith("-")) throw new Error(`${a} needs a value`)
      take.get(a)!(v)
      i++
    } else if (a === "-h" || a === "--help") out.positional.unshift("help")
    else if (a.startsWith("-")) throw new Error(`unknown flag ${a}`)
    else out.positional.push(a)
  }
  return out
}

export function parseHome(args: string[]): string {
  return parseArgs(args).home ?? process.env.AGENT_CLEANER_HOME ?? homedir()
}

export async function run(argv = process.argv.slice(2)): Promise<number> {
  let flags: Flags
  try {
    flags = parseArgs(argv)
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : err}\n\n${usage()}`)
    return 1
  }
  if (flags.positional[0] === "help") {
    process.stdout.write(usage())
    return 0
  }
  const home = flags.home ?? process.env.AGENT_CLEANER_HOME ?? homedir()
  const appDir = defaultAppDir(home)
  const cfg = await loadAppConfig(appDir)
  let localPath: string | undefined
  if (flags.local === true) localPath = cfg.lastLocal ?? process.cwd()
  else if (typeof flags.local === "string") {
    localPath = resolve(flags.local)
    await saveAppConfig(appDir, { ...cfg, lastLocal: localPath })
  }
  const opts: ScanOptions = {
    home,
    appDir,
    localPath,
    disabledAdapters: cfg.disabledAdapters,
  }
  const cmd = flags.positional[0] ?? ""

  if (cmd === "scan" || flags.json) {
    const inv = await scan(opts)
    const out = flags.showSecrets ? inv : redactInventory(inv)
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
    return 0
  }

  if (cmd === "serve") {
    const { serveWeb } = await import("./web/server")
    await serveWeb({ ...opts, port: flags.port ?? cfg.port, bind: cfg.bind })
    return 0
  }

  if (cmd === "install") {
    return runInstall(flags, opts)
  }
  if (cmd === "uninstall") {
    return runUninstall(flags, opts)
  }

  if (cmd && cmd !== "tui") {
    process.stderr.write(`unknown command: ${cmd}\n\n${usage()}`)
    return 1
  }

  if (!process.stdin.isTTY) {
    process.stderr.write("run in a terminal (or use: agent-cleaner scan --json)\n")
    return 1
  }

  const { renderTui } = await import("./tui/app")
  await renderTui(opts)
  return 0
}

async function runInstall(flags: Flags, opts: ScanOptions): Promise<number> {
  const source = flags.positional[1]
  if (!source) {
    process.stderr.write("install needs a source (catalog id, git URL, or path)\n")
    return 1
  }
  if (!flags.to) {
    process.stderr.write("install needs --to <agent,agent>\n")
    return 1
  }
  const agents = flags.to.split(",").map((s) => s.trim()) as AgentId[]
  const catalog = await loadCatalog(opts.appDir)
  const cat = catalog.find((c) => c.id === source || c.name === source)
  let origin: Origin
  if (cat) origin = { type: "catalog", id: cat.id }
  else if (/^(https?:\/\/|git@)/.test(source)) origin = { type: "git", url: source }
  else origin = { type: "local", path: resolve(source) }
  const staged = await stageOrigin(origin, `${opts.appDir}/cache`, catalog)
  const inspected = await inspectStaging(staged.stagingDir)
  const kind = (flags.kind as ItemKind) ?? cat?.kind ?? inspected.kind
  const name = flags.name ?? cat?.name ?? inspected.name
  const scope = flags.project
    ? ({ kind: "project", path: resolve(flags.project) } as const)
    : ({ kind: "global" } as const)
  const input = {
    origin,
    stagingDir: staged.stagingDir,
    kind,
    name,
    mcp: inspected.mcp,
    targets: agents.map((agentId) => ({ agentId, scope })),
    overwrite: flags.overwrite,
    runtime: { home: opts.home, appDir: opts.appDir, now: () => new Date() },
  }
  const plan = await previewInstall(input)
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
  if (!flags.yes) {
    process.stderr.write("pass --yes to apply\n")
    return 2
  }
  const result = await install({ ...input, yes: true })
  process.stdout.write(`${JSON.stringify({ backupId: result.backupId, ok: true }, null, 2)}\n`)
  return 0
}

async function runUninstall(flags: Flags, opts: ScanOptions): Promise<number> {
  const id = flags.positional[1]
  if (!id) {
    process.stderr.write("uninstall needs an item id (from scan --json)\n")
    return 1
  }
  const inv = await scan(opts)
  const item = inv.agents
    .flatMap((a) => a.items)
    .find((i) => i.id === id || (flags.agent === i.agentId && i.name === id))
  if (!item) {
    process.stderr.write(`item not found: ${id}\n`)
    return 1
  }
  const runtime = { home: opts.home, appDir: opts.appDir, now: () => new Date() }
  const plan = await previewUninstall(item, runtime)
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
  if (!flags.yes) {
    process.stderr.write("pass --yes to apply\n")
    return 2
  }
  const result = await uninstall({ item, yes: true, runtime })
  process.stdout.write(`${JSON.stringify({ backupId: result.backupId, ok: true }, null, 2)}\n`)
  return 0
}

if (import.meta.main) {
  run().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.message : err}\n`)
      process.exit(1)
    },
  )
}

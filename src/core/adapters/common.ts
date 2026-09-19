import { join } from "node:path"
import { listDirs, listFiles, pathExists } from "../io"
import type { AgentId, Item, ItemKind, ItemSource, ScanOptions, Scope } from "../types"

export function itemId(agentId: AgentId, kind: ItemKind, path: string): string {
  return `${agentId}:${kind}:${path}`
}

export async function findBinary(name: string, pathDirs?: string[]): Promise<string | undefined> {
  const dirs = pathDirs ?? (process.env.PATH ?? "").split(":")
  for (const dir of dirs) {
    if (!dir) continue
    const p = join(dir, name)
    if (await pathExists(p)) return p
  }
  return undefined
}

export function parseSkillFrontmatter(text: string): { name?: string; description?: string } {
  const block = text.match(/^---\n([\s\S]*?)\n---/)
  const src = block ? block[1] : text.slice(0, 400)
  const name = src.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const description = src.match(/^description:\s*(.+)$/m)?.[1]?.trim()
  return { name, description }
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", "__pycache__"])

export async function listSkillDirs(input: {
  agentId: AgentId
  root: string
  scope: Scope
  source: ItemSource
  mutable: boolean
  depth?: number
  budget?: { n: number }
}): Promise<Item[]> {
  const depth = input.depth ?? 1
  const budget = input.budget ?? { n: 0 }
  if (budget.n > 400) return []
  const names = await listDirs(input.root)
  const items: Item[] = []
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue
    budget.n++
    const dir = join(input.root, name)
    const skillMd = join(dir, "SKILL.md")
    if (await pathExists(skillMd)) {
      const text = await Bun.file(skillMd).text()
      const fm = parseSkillFrontmatter(text)
      items.push({
        id: itemId(input.agentId, "skill", dir),
        agentId: input.agentId,
        kind: "skill",
        name: fm.name || name,
        description: fm.description,
        scope: input.scope,
        source: input.source,
        path: dir,
        enabled: true,
        mutable: input.mutable,
        missing: false,
      })
      continue
    }
    if (depth > 1) {
      items.push(
        ...(await listSkillDirs({ ...input, root: dir, depth: depth - 1, budget })),
      )
    }
  }
  return items
}

export function mcpItemsFromMap(input: {
  agentId: AgentId
  configPath: string
  servers: Record<string, unknown> | undefined
  scope: Scope
  source: ItemSource
}): Item[] {
  if (!input.servers || typeof input.servers !== "object") return []
  return Object.entries(input.servers).map(([name, config]) => ({
    id: itemId(input.agentId, "mcp", `${input.configPath}#${name}`),
    agentId: input.agentId,
    kind: "mcp" as const,
    name,
    scope: input.scope,
    source: input.source,
    path: `${input.configPath}#${name}`,
    configPath: input.configPath,
    enabled: true,
    mutable: true,
    missing: false,
    meta: config && typeof config === "object" ? (config as Record<string, unknown>) : { value: config },
  }))
}

export function hookItemsFromClaudeStyle(input: {
  agentId: AgentId
  configPath: string
  hooks: unknown
  scope: Scope
}): Item[] {
  if (!input.hooks || typeof input.hooks !== "object") return []
  const items: Item[] = []
  for (const [event, entries] of Object.entries(input.hooks as Record<string, unknown>)) {
    const list = Array.isArray(entries) ? entries : []
    let i = 0
    for (const entry of list) {
      const commands = collectHookCommands(entry)
      for (const command of commands) {
        const idPart = `${input.configPath}#${event}:${i}`
        i++
        items.push({
          id: itemId(input.agentId, "hook", idPart),
          agentId: input.agentId,
          kind: "hook",
          name: `${event} ${basenameCmd(command)}`,
          scope: input.scope,
          source: "user",
          path: idPart,
          configPath: input.configPath,
          enabled: true,
          mutable: true,
          missing: false,
          meta: { event, command },
        })
      }
    }
  }
  return items
}

function collectHookCommands(entry: unknown): string[] {
  if (!entry || typeof entry !== "object") return []
  const rec = entry as Record<string, unknown>
  if (typeof rec.command === "string") return [rec.command]
  const nested = rec.hooks
  if (Array.isArray(nested)) {
    return nested.flatMap(collectHookCommands)
  }
  return []
}

function basenameCmd(command: string): string {
  const token = command.trim().split(/\s+/)[0] ?? "hook"
  const parts = token.replace(/"/g, "").split("/")
  return parts[parts.length - 1] || "hook"
}

export async function listMarkdownFiles(input: {
  agentId: AgentId
  dir: string
  kind: ItemKind
  scope: Scope
  source: ItemSource
  mutable: boolean
}): Promise<Item[]> {
  const files = await listFiles(input.dir)
  return files
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const path = join(input.dir, f)
      return {
        id: itemId(input.agentId, input.kind, path),
        agentId: input.agentId,
        kind: input.kind,
        name: f.replace(/\.md$/, ""),
        scope: input.scope,
        source: input.source,
        path,
        enabled: true,
        mutable: input.mutable,
        missing: false,
      }
    })
}

export async function detectIfRootExists(
  opts: ScanOptions,
  globalRoot: string,
  extraPaths: string[] = [],
  binaryName?: string,
): Promise<{ binary?: string; version?: string; globalRoot: string } | null> {
  const exists = await pathExists(globalRoot)
  const extra = await Promise.all(extraPaths.map(pathExists))
  if (!exists && !extra.some(Boolean)) return null
  const binary = binaryName ? await findBinary(binaryName, opts.pathDirs) : undefined
  return { globalRoot, binary }
}

export const globalScope: Scope = { kind: "global" }

export function projectScope(path: string): Scope {
  return { kind: "project", path }
}

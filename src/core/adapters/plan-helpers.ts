import { join } from "node:path"
import { pathExists, readJson, readJsonc, readToml } from "../io"
import type { AgentId, FileOp, Item, ItemKind, MutationPlan, Scope } from "../types"
import type { InstallRequest } from "./types"

export type Dest = {
  agentId: AgentId
  skillsDir: (scope: Scope) => string
  mcpFile: (scope: Scope) => string
  mcpContainer: string
  mcpFormat: "json" | "jsonc" | "toml"
  hooksFile: (scope: Scope) => string
  hooksStyle: "claude" | "cursor" | "file"
  pluginsDir?: (scope: Scope) => string
  markdownDir?: (kind: ItemKind, scope: Scope) => string
  installedPluginsFile?: (scope: Scope) => string
}

export async function planSkillMcpHook(req: InstallRequest, dest: Dest): Promise<MutationPlan> {
  const ops: FileOp[] = []
  const warnings: string[] = []
  for (const t of req.targets) {
    if (t.agentId !== dest.agentId) continue
    if (req.kind === "skill") {
      const to = join(dest.skillsDir(t.scope), req.name)
      if ((await pathExists(to)) && !req.overwrite) {
        warnings.push(`exists: ${to}`)
        continue
      }
      ops.push({ op: "copy-dir", from: req.stagingDir, to })
    } else if (req.kind === "mcp" && req.mcp) {
      const file = dest.mcpFile(t.scope)
      const { map, exists } = await readContainer(file, dest.mcpFormat, dest.mcpContainer)
      if (exists && map[req.mcp.name] && !req.overwrite) {
        if (JSON.stringify(map[req.mcp.name]) !== JSON.stringify(req.mcp.config)) {
          warnings.push(`exists: ${file}#${req.mcp.name}`)
          continue
        }
        continue
      }
      map[req.mcp.name] = req.mcp.config
      if (dest.mcpFormat === "toml") {
        ops.push({
          op: "merge-toml",
          path: file,
          table: dest.mcpContainer,
          key: req.mcp.name,
          value: req.mcp.config,
        })
      } else {
        ops.push(writeContainer(file, dest.mcpFormat, dest.mcpContainer, map))
      }
    } else if (req.kind === "hook" && req.hook) {
      const file = dest.hooksFile(t.scope)
      if (dest.hooksStyle === "file") {
        ops.push({
          op: "write",
          path: join(file, `${req.name}.json`),
          content: `${JSON.stringify({ hooks: { [req.hook.event]: [{ hooks: [{ type: "command", command: req.hook.command }] }] } }, null, 2)}\n`,
        })
        continue
      }
      const current = await readJson<Record<string, unknown>>(file)
      const root = current.ok ? current.value : {}
      const hooks = { ...((root.hooks as Record<string, unknown>) ?? {}) }
      const list = Array.isArray(hooks[req.hook.event]) ? [...(hooks[req.hook.event] as unknown[])] : []
      if (dest.hooksStyle === "cursor") list.push({ command: req.hook.command })
      else list.push({ hooks: [{ type: "command", command: req.hook.command }] })
      hooks[req.hook.event] = list
      ops.push({ op: "merge-json", path: file, key: "hooks", value: hooks })
    } else if (req.kind === "plugin" && dest.pluginsDir) {
      const to = join(dest.pluginsDir(t.scope), req.name)
      if ((await pathExists(to)) && !req.overwrite) {
        warnings.push(`exists: ${to}`)
        continue
      }
      ops.push({ op: "copy-dir", from: req.stagingDir, to })
      if (dest.installedPluginsFile) {
        const file = dest.installedPluginsFile(t.scope)
        const current = await readJson<Record<string, unknown>>(file)
        const map = current.ok ? { ...current.value } : {}
        map[req.name] = map[req.name] ?? {}
        ops.push({ op: "merge-json", path: file, key: req.name, value: map[req.name] })
      }
    } else if (
      (req.kind === "command" || req.kind === "subagent" || req.kind === "rule") &&
      dest.markdownDir
    ) {
      const to = join(dest.markdownDir(req.kind, t.scope), req.name.endsWith(".md") ? req.name : `${req.name}.md`)
      const fromFile = (await pathExists(join(req.stagingDir, "SKILL.md")))
        ? join(req.stagingDir, "SKILL.md")
        : join(req.stagingDir, `${req.name}.md`)
      const text = (await pathExists(fromFile))
        ? await Bun.file(fromFile).text()
        : `# ${req.name}\n`
      if ((await pathExists(to)) && !req.overwrite) {
        warnings.push(`exists: ${to}`)
        continue
      }
      ops.push({ op: "write", path: to, content: text })
    } else {
      warnings.push(`no destination for ${req.kind} on ${dest.agentId}`)
    }
  }
  return { summary: `install ${req.kind} ${req.name}`, ops, warnings }
}

export async function planItemUninstall(item: Item, dest: Dest): Promise<MutationPlan> {
  if (!item.mutable) {
    return { summary: `refuse ${item.name}`, ops: [], warnings: ["bundled, view only"] }
  }
  if (item.kind === "mcp" && item.configPath) {
    const name = item.path.includes("#") ? item.path.split("#").slice(1).join("#") : item.name
    if (dest.mcpFormat === "toml") {
      return {
        summary: `uninstall mcp ${item.name}`,
        ops: [{ op: "unmerge-toml", path: item.configPath, table: dest.mcpContainer, key: name }],
        warnings: [],
      }
    }
    const { map } = await readContainer(item.configPath, dest.mcpFormat, dest.mcpContainer)
    delete map[name]
    return {
      summary: `uninstall mcp ${item.name}`,
      ops: [writeContainer(item.configPath, dest.mcpFormat, dest.mcpContainer, map)],
      warnings: [],
    }
  }
  if (item.kind === "hook") {
    if (!item.path.includes("#")) {
      return {
        summary: `uninstall hook ${item.name}`,
        ops: [{ op: "remove", path: item.path }],
        warnings: [],
      }
    }
    if (!item.configPath) {
      return { summary: `uninstall hook ${item.name}`, ops: [], warnings: ["missing config path"] }
    }
    const event = String(item.meta?.event ?? item.path.split("#")[1]?.split(":")[0] ?? "")
    const command = String(item.meta?.command ?? "")
    const current = await readJson<Record<string, unknown>>(item.configPath)
    const hooks = { ...(((current.ok ? current.value.hooks : {}) as Record<string, unknown>) ?? {}) }
    const list = Array.isArray(hooks[event]) ? [...(hooks[event] as unknown[])] : []
    let removed = false
    const next = list.filter((entry) => {
      if (removed) return true
      if (hookEntryMatches(entry, command)) {
        removed = true
        return false
      }
      return true
    })
    if (next.length) hooks[event] = next
    else delete hooks[event]
    return {
      summary: `uninstall hook ${item.name}`,
      ops: [{ op: "merge-json", path: item.configPath, key: "hooks", value: hooks }],
      warnings: removed ? [] : ["hook command not found"],
    }
  }
  if (item.kind === "plugin" && item.configPath && dest.installedPluginsFile) {
    const key = item.name
    return {
      summary: `uninstall plugin ${item.name}`,
      ops: [
        { op: "remove", path: item.path.split("#")[0] },
        { op: "unmerge-json", path: item.configPath, key },
      ],
      warnings: [],
    }
  }
  const path = item.path.split("#")[0]
  return {
    summary: `uninstall ${item.kind} ${item.name}`,
    ops: [{ op: "remove", path }],
    warnings: [],
  }
}

function hookEntryMatches(entry: unknown, command: string): boolean {
  if (!command || !entry || typeof entry !== "object") return false
  const rec = entry as Record<string, unknown>
  if (rec.command === command) return true
  if (Array.isArray(rec.hooks)) return rec.hooks.some((h) => hookEntryMatches(h, command))
  return false
}

async function readContainer(
  file: string,
  format: Dest["mcpFormat"],
  container: string,
): Promise<{ map: Record<string, unknown>; exists: boolean }> {
  if (format === "toml") {
    const r = await readToml<Record<string, unknown>>(file)
    if (!r.ok) return { map: {}, exists: false }
    const table = r.value[container]
    if (table && typeof table === "object") return { map: { ...(table as Record<string, unknown>) }, exists: true }
    return { map: {}, exists: true }
  }
  const r = format === "jsonc" ? await readJsonc<Record<string, unknown>>(file) : await readJson<Record<string, unknown>>(file)
  if (!r.ok) return { map: {}, exists: false }
  const table = r.value[container]
  if (table && typeof table === "object") return { map: { ...(table as Record<string, unknown>) }, exists: true }
  return { map: {}, exists: true }
}

function writeContainer(
  file: string,
  format: Dest["mcpFormat"],
  container: string,
  map: Record<string, unknown>,
): FileOp {
  if (format === "toml") return { op: "merge-toml", path: file, table: container, key: "", value: map }
  return { op: "merge-json", path: file, key: container, value: map }
}

import { join } from "node:path"
import { listDirs, listFiles, pathExists, readJson, readToml } from "../io"
import { agentRoot } from "../paths"
import type { Item, ScanOptions } from "../types"
import {
  detectIfRootExists,
  globalScope,
  hookItemsFromClaudeStyle,
  itemId,
  listSkillDirs,
  mcpItemsFromMap,
  projectScope,
} from "./common"
import { planItemUninstall, planSkillMcpHook, type Dest } from "./plan-helpers"
import type { AgentAdapter } from "./types"

function dest(opts: ScanOptions): Dest {
  const root = agentRoot(opts.home, "grok")
  return {
    agentId: "grok",
    skillsDir: (scope) =>
      scope.kind === "global" ? join(root, "skills") : join(scope.path, ".grok", "skills"),
    mcpFile: () => join(root, "config.toml"),
    mcpContainer: "mcp_servers",
    mcpFormat: "toml",
    hooksFile: () => join(root, "hooks"),
    hooksStyle: "file",
    pluginsDir: () => join(root, "installed-plugins"),
  }
}

export const grokAdapter: AgentAdapter = {
  id: "grok",
  name: "Grok",

  async detect(opts) {
    return detectIfRootExists(opts, agentRoot(opts.home, "grok"), [], "grok")
  },

  async listProjects(opts) {
    const trusted = await readToml<Record<string, unknown>>(join(agentRoot(opts.home, "grok"), "trusted_folders.toml"))
    if (!trusted.ok) return []
    const folders = trusted.value.folders ?? trusted.value.trusted
    if (Array.isArray(folders)) return folders.filter((p): p is string => typeof p === "string")
    if (folders && typeof folders === "object") {
      return Object.keys(folders as Record<string, unknown>).filter((p) => p.startsWith("/"))
    }
    return []
  },

  async listItems(opts, globalRoot, projects) {
    const items: Item[] = []
    const warnings: string[] = []
    const g = globalScope
    items.push(
      ...(await listSkillDirs({
        agentId: "grok",
        root: join(globalRoot, "skills"),
        scope: g,
        source: "user",
        mutable: true,
      })),
    )
    items.push(
      ...(await listSkillDirs({
        agentId: "grok",
        root: join(globalRoot, "bundled", "skills"),
        scope: g,
        source: "bundled",
        mutable: false,
      })),
    )
    const hookDir = join(globalRoot, "hooks")
    for (const name of await listDirs(hookDir)) {
      const path = join(hookDir, name)
      items.push({
        id: itemId("grok", "hook", path),
        agentId: "grok",
        kind: "hook",
        name,
        scope: g,
        source: "user",
        path,
        enabled: true,
        mutable: true,
        missing: false,
      })
    }
    for (const f of await listFiles(hookDir)) {
      if (!f.endsWith(".json")) continue
      const path = join(hookDir, f)
      const json = await readJson<{ hooks?: unknown }>(path)
      if (json.ok) {
        items.push(
          ...hookItemsFromClaudeStyle({
            agentId: "grok",
            configPath: path,
            hooks: json.value.hooks,
            scope: g,
          }),
        )
      }
    }
    const tomlPath = join(globalRoot, "config.toml")
    const cfg = await readToml<Record<string, unknown>>(tomlPath)
    if (!cfg.ok) {
      if (await pathExists(tomlPath)) warnings.push(`${tomlPath}: ${cfg.error}`)
    } else if (cfg.value.mcp_servers && typeof cfg.value.mcp_servers === "object") {
      items.push(
        ...mcpItemsFromMap({
          agentId: "grok",
          configPath: tomlPath,
          servers: cfg.value.mcp_servers as Record<string, unknown>,
          scope: g,
          source: "user",
        }),
      )
    }
    const pluginRoot = join(globalRoot, "installed-plugins")
    for (const name of await listDirs(pluginRoot)) {
      if (name === "registry.json") continue
      const path = join(pluginRoot, name)
      items.push({
        id: itemId("grok", "plugin", path),
        agentId: "grok",
        kind: "plugin",
        name,
        scope: g,
        source: "plugin",
        path,
        enabled: true,
        mutable: true,
        missing: false,
      })
    }
    for (const proj of projects) {
      if (!(await pathExists(proj))) continue
      const scope = projectScope(proj)
      items.push(
        ...(await listSkillDirs({
          agentId: "grok",
          root: join(proj, ".grok", "skills"),
          scope,
          source: "project",
          mutable: true,
        })),
      )
    }
    return { items, warnings }
  },

  planInstall(req, opts) {
    return planSkillMcpHook(req, dest(opts))
  },

  planUninstall(item) {
    return planItemUninstall(item, dest({ home: "", appDir: "" }))
  },
}

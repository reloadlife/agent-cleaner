import { join } from "node:path"
import { pathExists, readJsonc } from "../io"
import { agentRoot } from "../paths"
import type { Item, ScanOptions } from "../types"
import {
  detectIfRootExists,
  globalScope,
  itemId,
  listMarkdownFiles,
  listSkillDirs,
  mcpItemsFromMap,
  projectScope,
} from "./common"
import { planItemUninstall, planSkillMcpHook, type Dest } from "./plan-helpers"
import type { AgentAdapter } from "./types"

function dest(opts: ScanOptions): Dest {
  const root = agentRoot(opts.home, "opencode")
  return {
    agentId: "opencode",
    skillsDir: (scope) =>
      scope.kind === "global" ? join(root, "skills") : join(scope.path, ".opencode", "skills"),
    mcpFile: (scope) =>
      scope.kind === "global" ? join(root, "opencode.jsonc") : join(scope.path, "opencode.json"),
    mcpContainer: "mcp",
    mcpFormat: "jsonc",
    hooksFile: () => join(root, "opencode.jsonc"),
    hooksStyle: "claude",
    pluginsDir: () => join(root, "plugins"),
    markdownDir: (kind) => (kind === "command" ? join(root, "commands") : root),
  }
}

export const opencodeAdapter: AgentAdapter = {
  id: "opencode",
  name: "OpenCode",

  async detect(opts) {
    const root = agentRoot(opts.home, "opencode")
    return detectIfRootExists(opts, root, [join(opts.home, ".opencode")], "opencode")
  },

  async listProjects() {
    return []
  },

  async listItems(opts, globalRoot, projects) {
    const items: Item[] = []
    const warnings: string[] = []
    const g = globalScope
    items.push(
      ...(await listSkillDirs({
        agentId: "opencode",
        root: join(globalRoot, "skills"),
        scope: g,
        source: "user",
        mutable: true,
      })),
    )
    items.push(
      ...(await listMarkdownFiles({
        agentId: "opencode",
        dir: join(globalRoot, "commands"),
        kind: "command",
        scope: g,
        source: "user",
        mutable: true,
      })),
    )
    const cfgPath = join(globalRoot, "opencode.jsonc")
    const alt = join(globalRoot, "opencode.json")
    const path = (await pathExists(cfgPath)) ? cfgPath : alt
    const cfg = await readJsonc<{ mcp?: Record<string, unknown>; plugin?: unknown }>(path)
    if (!cfg.ok) {
      if (await pathExists(path)) warnings.push(`${path}: ${cfg.error}`)
    } else {
      items.push(
        ...mcpItemsFromMap({
          agentId: "opencode",
          configPath: path,
          servers: cfg.value.mcp,
          scope: g,
          source: "user",
        }),
      )
      if (Array.isArray(cfg.value.plugin)) {
        for (const name of cfg.value.plugin) {
          if (typeof name !== "string") continue
          items.push({
            id: itemId("opencode", "plugin", `${path}#plugin:${name}`),
            agentId: "opencode",
            kind: "plugin",
            name,
            scope: g,
            source: "plugin",
            path: `${path}#plugin:${name}`,
            configPath: path,
            enabled: true,
            mutable: true,
            missing: false,
          })
        }
      }
    }
    const agentsMd = join(globalRoot, "AGENTS.md")
    if (await pathExists(agentsMd)) {
      items.push({
        id: itemId("opencode", "rule", agentsMd),
        agentId: "opencode",
        kind: "rule",
        name: "AGENTS.md",
        scope: g,
        source: "user",
        path: agentsMd,
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
          agentId: "opencode",
          root: join(proj, ".opencode", "skills"),
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

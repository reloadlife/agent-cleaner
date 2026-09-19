import { join } from "node:path"
import { pathExists, readJson } from "../io"
import { agentRoot, claudeJsonPath } from "../paths"
import type { Item, ScanOptions } from "../types"
import {
  detectIfRootExists,
  globalScope,
  hookItemsFromClaudeStyle,
  itemId,
  listMarkdownFiles,
  listSkillDirs,
  mcpItemsFromMap,
  projectScope,
} from "./common"
import { planItemUninstall, planSkillMcpHook, type Dest } from "./plan-helpers"
import type { AgentAdapter } from "./types"

type ClaudeJson = {
  mcpServers?: Record<string, unknown>
  projects?: Record<string, unknown>
}

function dest(opts: ScanOptions): Dest {
  const root = agentRoot(opts.home, "claude")
  return {
    agentId: "claude",
    skillsDir: (scope) =>
      scope.kind === "global" ? join(root, "skills") : join(scope.path, ".claude", "skills"),
    mcpFile: (scope) => (scope.kind === "global" ? claudeJsonPath(opts.home) : join(scope.path, ".mcp.json")),
    mcpContainer: "mcpServers",
    mcpFormat: "json",
    hooksFile: () => join(root, "settings.json"),
    hooksStyle: "claude",
    pluginsDir: () => join(root, "plugins"),
    installedPluginsFile: () => join(root, "plugins", "installed_plugins.json"),
    markdownDir: (kind, scope) => {
      const base = scope.kind === "global" ? root : join(scope.path, ".claude")
      if (kind === "subagent") return join(base, "agents")
      if (kind === "rule") return base
      return join(base, "commands")
    },
  }
}

export const claudeAdapter: AgentAdapter = {
  id: "claude",
  name: "Claude Code",

  async detect(opts) {
    const root = agentRoot(opts.home, "claude")
    return detectIfRootExists(opts, root, [claudeJsonPath(opts.home)], "claude")
  },

  async listProjects(opts) {
    const r = await readJson<ClaudeJson>(claudeJsonPath(opts.home))
    if (!r.ok || !r.value.projects) return []
    return Object.keys(r.value.projects).filter((p) => p.startsWith("/"))
  },

  async listItems(opts, globalRoot, projects) {
    const items: Item[] = []
    const warnings: string[] = []
    const g = globalScope

    items.push(
      ...(await listSkillDirs({
        agentId: "claude",
        root: join(globalRoot, "skills"),
        scope: g,
        source: "user",
        mutable: true,
      })),
    )
    items.push(
      ...(await listSkillDirs({
        agentId: "claude",
        root: join(globalRoot, "plugins", "cache"),
        scope: g,
        source: "bundled",
        mutable: false,
        depth: 2,
      })),
    )

    const cj = claudeJsonPath(opts.home)
    const json = await readJson<ClaudeJson>(cj)
    if (!json.ok) {
      if (await pathExists(cj)) warnings.push(`${cj}: ${json.error}`)
    } else {
      items.push(
        ...mcpItemsFromMap({
          agentId: "claude",
          configPath: cj,
          servers: json.value.mcpServers,
          scope: g,
          source: "user",
        }),
      )
    }

    const settingsPath = join(globalRoot, "settings.json")
    const settings = await readJson<{ hooks?: unknown }>(settingsPath)
    if (!settings.ok) {
      if (await pathExists(settingsPath)) warnings.push(`${settingsPath}: ${settings.error}`)
    } else {
      items.push(
        ...hookItemsFromClaudeStyle({
          agentId: "claude",
          configPath: settingsPath,
          hooks: settings.value.hooks,
          scope: g,
        }),
      )
    }

    items.push(
      ...(await listMarkdownFiles({
        agentId: "claude",
        dir: join(globalRoot, "agents"),
        kind: "subagent",
        scope: g,
        source: "user",
        mutable: true,
      })),
    )

    const pluginsPath = join(globalRoot, "plugins", "installed_plugins.json")
    const plugins = await readJson<Record<string, unknown>>(pluginsPath)
    if (plugins.ok) {
      for (const key of Object.keys(plugins.value)) {
        const path = join(globalRoot, "plugins", key)
        items.push({
          id: itemId("claude", "plugin", path),
          agentId: "claude",
          kind: "plugin",
          name: key,
          scope: g,
          source: key.includes("cache") || key.includes("marketplace") ? "bundled" : "plugin",
          path,
          configPath: pluginsPath,
          enabled: true,
          mutable: !(key.includes("cache") || key.includes("marketplace")),
          missing: false,
        })
      }
    }

    for (const proj of projects) {
      if (!(await pathExists(proj))) continue
      const scope = projectScope(proj)
      items.push(
        ...(await listSkillDirs({
          agentId: "claude",
          root: join(proj, ".claude", "skills"),
          scope,
          source: "project",
          mutable: true,
        })),
      )
      const mcpPath = join(proj, ".mcp.json")
      const mcp = await readJson<{ mcpServers?: Record<string, unknown> }>(mcpPath)
      if (mcp.ok) {
        items.push(
          ...mcpItemsFromMap({
            agentId: "claude",
            configPath: mcpPath,
            servers: mcp.value.mcpServers,
            scope,
            source: "project",
          }),
        )
      }
      const claudeMd = join(proj, "CLAUDE.md")
      if (await pathExists(claudeMd)) {
        items.push({
          id: itemId("claude", "rule", claudeMd),
          agentId: "claude",
          kind: "rule",
          name: "CLAUDE.md",
          scope,
          source: "project",
          path: claudeMd,
          enabled: true,
          mutable: true,
          missing: false,
        })
      }
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

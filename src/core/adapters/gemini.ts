import { join } from "node:path"
import { listDirs, pathExists, readJson } from "../io"
import { agentRoot } from "../paths"
import type { Item, ScanOptions } from "../types"
import {
  detectIfRootExists,
  globalScope,
  hookItemsFromClaudeStyle,
  listSkillDirs,
  mcpItemsFromMap,
  projectScope,
} from "./common"
import { planItemUninstall, planSkillMcpHook, type Dest } from "./plan-helpers"
import type { AgentAdapter } from "./types"

function dest(opts: ScanOptions): Dest {
  const root = agentRoot(opts.home, "gemini")
  return {
    agentId: "gemini",
    skillsDir: (scope) =>
      scope.kind === "global" ? join(root, "skills") : join(scope.path, ".gemini", "skills"),
    mcpFile: () => join(root, "settings.json"),
    mcpContainer: "mcpServers",
    mcpFormat: "json",
    hooksFile: () => join(root, "settings.json"),
    hooksStyle: "claude",
    pluginsDir: () => join(root, "config", "plugins"),
  }
}

export const geminiAdapter: AgentAdapter = {
  id: "gemini",
  name: "Gemini CLI",

  async detect(opts) {
    return detectIfRootExists(opts, agentRoot(opts.home, "gemini"), [], "gemini")
  },

  async listProjects(opts) {
    const dir = join(agentRoot(opts.home, "gemini"), "config", "projects")
    const names = await listDirs(dir)
    return names
  },

  async listItems(opts, globalRoot, projects) {
    const items: Item[] = []
    const warnings: string[] = []
    const g = globalScope

    const roots = [globalRoot]
    for (const name of await listDirs(globalRoot)) {
      if (name.startsWith("antigravity")) roots.push(join(globalRoot, name))
    }

    for (const root of roots) {
      items.push(
        ...(await listSkillDirs({
          agentId: "gemini",
          root: join(root, "skills"),
          scope: g,
          source: "user",
          mutable: true,
        })),
      )
      const settingsPath = join(root, "settings.json")
      const settings = await readJson<{ mcpServers?: Record<string, unknown>; hooks?: unknown }>(settingsPath)
      if (settings.ok) {
        items.push(
          ...mcpItemsFromMap({
            agentId: "gemini",
            configPath: settingsPath,
            servers: settings.value.mcpServers,
            scope: g,
            source: "user",
          }),
        )
        items.push(
          ...hookItemsFromClaudeStyle({
            agentId: "gemini",
            configPath: settingsPath,
            hooks: settings.value.hooks,
            scope: g,
          }),
        )
      } else if (await pathExists(settingsPath)) {
        warnings.push(`${settingsPath}: ${settings.error}`)
      }
      const mcpPath = join(root, "config", "mcp_config.json")
      const mcp = await readJson<{ mcpServers?: Record<string, unknown> } | Record<string, unknown>>(mcpPath)
      if (mcp.ok) {
        const servers = (mcp.value.mcpServers as Record<string, unknown> | undefined) ?? (mcp.value as Record<string, unknown>)
        const looksLikeServers = Object.values(servers).every((v) => v && typeof v === "object")
        if (looksLikeServers && !("mcpServers" in mcp.value && mcp.value.mcpServers)) {
          // mcp_config.json may be a raw map or wrapped
        }
        const map = (mcp.value as { mcpServers?: Record<string, unknown> }).mcpServers ?? servers
        items.push(
          ...mcpItemsFromMap({
            agentId: "gemini",
            configPath: mcpPath,
            servers: map,
            scope: g,
            source: "user",
          }),
        )
      }
    }

    for (const proj of projects) {
      const path = proj.startsWith("/") ? proj : proj
      if (!(await pathExists(path))) continue
      const scope = projectScope(path)
      items.push(
        ...(await listSkillDirs({
          agentId: "gemini",
          root: join(path, ".gemini", "skills"),
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

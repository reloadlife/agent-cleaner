import { join } from "node:path"
import { pathExists, readJson, readToml } from "../io"
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
  const root = agentRoot(opts.home, "codex")
  return {
    agentId: "codex",
    skillsDir: (scope) =>
      scope.kind === "global" ? join(root, "skills") : join(scope.path, ".codex", "skills"),
    mcpFile: () => join(root, "config.toml"),
    mcpContainer: "mcp_servers",
    mcpFormat: "toml",
    hooksFile: () => join(root, "hooks.json"),
    hooksStyle: "claude",
    pluginsDir: () => join(root, "plugins"),
    markdownDir: (kind) => (kind === "rule" ? root : join(root, "agents")),
  }
}

export const codexAdapter: AgentAdapter = {
  id: "codex",
  name: "Codex",

  async detect(opts) {
    return detectIfRootExists(opts, agentRoot(opts.home, "codex"), [], "codex")
  },

  async listProjects(opts) {
    const cfg = await readToml<Record<string, unknown>>(join(agentRoot(opts.home, "codex"), "config.toml"))
    if (!cfg.ok) return []
    const projects = cfg.value.projects
    if (!projects || typeof projects !== "object") return []
    return Object.keys(projects as Record<string, unknown>).filter((p) => p.startsWith("/"))
  },

  async listItems(opts, globalRoot, projects) {
    const items: Item[] = []
    const warnings: string[] = []
    const g = globalScope
    items.push(
      ...(await listSkillDirs({
        agentId: "codex",
        root: join(globalRoot, "skills"),
        scope: g,
        source: "user",
        mutable: true,
      })),
    )
    const hooksPath = join(globalRoot, "hooks.json")
    const hooks = await readJson<{ hooks?: unknown }>(hooksPath)
    if (hooks.ok) {
      items.push(
        ...hookItemsFromClaudeStyle({
          agentId: "codex",
          configPath: hooksPath,
          hooks: hooks.value.hooks,
          scope: g,
        }),
      )
    }
    const tomlPath = join(globalRoot, "config.toml")
    const cfg = await readToml<Record<string, unknown>>(tomlPath)
    if (!cfg.ok) {
      if (await pathExists(tomlPath)) warnings.push(`${tomlPath}: ${cfg.error}`)
    } else {
      const servers = cfg.value.mcp_servers
      if (servers && typeof servers === "object") {
        items.push(
          ...mcpItemsFromMap({
            agentId: "codex",
            configPath: tomlPath,
            servers: servers as Record<string, unknown>,
            scope: g,
            source: "user",
          }),
        )
      }
    }
    const agentsMd = join(globalRoot, "AGENTS.md")
    if (await pathExists(agentsMd)) {
      items.push({
        id: itemId("codex", "rule", agentsMd),
        agentId: "codex",
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
          agentId: "codex",
          root: join(proj, ".codex", "skills"),
          scope,
          source: "project",
          mutable: true,
        })),
      )
      const pagents = join(proj, "AGENTS.md")
      if (await pathExists(pagents)) {
        items.push({
          id: itemId("codex", "rule", pagents),
          agentId: "codex",
          kind: "rule",
          name: "AGENTS.md",
          scope,
          source: "project",
          path: pagents,
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

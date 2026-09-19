import { existsSync } from "node:fs"
import { join } from "node:path"
import { decodeHyphenatedPath } from "../hyphen-path"
import { listDirs, pathExists, readJson } from "../io"
import { agentRoot } from "../paths"
import type { Item, ScanOptions } from "../types"
import {
  detectIfRootExists,
  globalScope,
  hookItemsFromClaudeStyle,
  listMarkdownFiles,
  listSkillDirs,
  mcpItemsFromMap,
  projectScope,
} from "./common"
import { planItemUninstall, planSkillMcpHook, type Dest } from "./plan-helpers"
import type { AgentAdapter } from "./types"

function dest(opts: ScanOptions): Dest {
  const root = agentRoot(opts.home, "cursor")
  return {
    agentId: "cursor",
    skillsDir: (scope) =>
      scope.kind === "global" ? join(root, "skills") : join(scope.path, ".cursor", "skills"),
    mcpFile: (scope) =>
      scope.kind === "global" ? join(root, "mcp.json") : join(scope.path, ".mcp.json"),
    mcpContainer: "mcpServers",
    mcpFormat: "json",
    hooksFile: () => join(root, "hooks.json"),
    hooksStyle: "cursor",
    pluginsDir: () => join(root, "plugins"),
    markdownDir: (kind, scope) => {
      const base = scope.kind === "global" ? root : join(scope.path, ".cursor")
      if (kind === "subagent") return join(base, "agents")
      if (kind === "rule") return join(base, "rules")
      return join(base, "commands")
    },
  }
}

export const cursorAdapter: AgentAdapter = {
  id: "cursor",
  name: "Cursor",

  async detect(opts) {
    return detectIfRootExists(opts, agentRoot(opts.home, "cursor"), [], "cursor")
  },

  async listProjects(_opts, globalRoot) {
    const names = await listDirs(join(globalRoot, "projects"))
    const paths: string[] = []
    for (const name of names) {
      const decoded = decodeHyphenatedPath(name, existsSync)
      if (decoded) paths.push(decoded)
    }
    return paths
  },

  async listItems(opts, globalRoot, projects) {
    const items: Item[] = []
    const warnings: string[] = []
    const g = globalScope
    items.push(
      ...(await listSkillDirs({
        agentId: "cursor",
        root: join(globalRoot, "skills"),
        scope: g,
        source: "user",
        mutable: true,
      })),
    )
    items.push(
      ...(await listSkillDirs({
        agentId: "cursor",
        root: join(globalRoot, "skills-cursor"),
        scope: g,
        source: "bundled",
        mutable: false,
      })),
    )
    const mcpPath = join(globalRoot, "mcp.json")
    const mcp = await readJson<{ mcpServers?: Record<string, unknown> }>(mcpPath)
    if (!mcp.ok) {
      if (await pathExists(mcpPath)) warnings.push(`${mcpPath}: ${mcp.error}`)
    } else {
      items.push(
        ...mcpItemsFromMap({
          agentId: "cursor",
          configPath: mcpPath,
          servers: mcp.value.mcpServers,
          scope: g,
          source: "user",
        }),
      )
    }
    const hooksPath = join(globalRoot, "hooks.json")
    const hooks = await readJson<{ hooks?: unknown }>(hooksPath)
    if (hooks.ok) {
      items.push(
        ...hookItemsFromClaudeStyle({
          agentId: "cursor",
          configPath: hooksPath,
          hooks: hooks.value.hooks,
          scope: g,
        }),
      )
    }
    items.push(
      ...(await listMarkdownFiles({
        agentId: "cursor",
        dir: join(globalRoot, "agents"),
        kind: "subagent",
        scope: g,
        source: "user",
        mutable: true,
      })),
    )
    for (const proj of projects) {
      if (!(await pathExists(proj))) continue
      const scope = projectScope(proj)
      items.push(
        ...(await listSkillDirs({
          agentId: "cursor",
          root: join(proj, ".cursor", "skills"),
          scope,
          source: "project",
          mutable: true,
        })),
      )
      const pm = join(proj, ".mcp.json")
      const pjson = await readJson<{ mcpServers?: Record<string, unknown> }>(pm)
      if (pjson.ok) {
        items.push(
          ...mcpItemsFromMap({
            agentId: "cursor",
            configPath: pm,
            servers: pjson.value.mcpServers,
            scope,
            source: "project",
          }),
        )
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

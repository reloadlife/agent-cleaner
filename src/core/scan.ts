import { resolve } from "node:path"
import { adapters } from "./adapters"
import { pathExists } from "./io"
import { loadLedger } from "./ledger"
import { agentRoot } from "./paths"
import { AGENT_NAMES, type AgentInstance, type Inventory, type Item, type ScanOptions } from "./types"

export async function scan(opts: ScanOptions): Promise<Inventory> {
  const agents: AgentInstance[] = []
  const extraProjects = opts.localPath ? [resolve(opts.localPath)] : []
  const ledger = await loadLedger(opts.appDir)

  const disabled = new Set(opts.disabledAdapters ?? [])
  for (const adapter of adapters) {
    const globalRoot = agentRoot(opts.home, adapter.id)
    let detected: { binary?: string; version?: string; globalRoot: string } | null = null
    const warnings: string[] = []
    if (disabled.has(adapter.id)) {
      agents.push({
        id: adapter.id,
        name: AGENT_NAMES[adapter.id],
        installed: false,
        globalRoot,
        warnings: ["disabled in config"],
        projects: [],
        items: [],
      })
      continue
    }
    try {
      detected = await adapter.detect(opts)
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err))
    }

    const instance: AgentInstance = {
      id: adapter.id,
      name: AGENT_NAMES[adapter.id],
      installed: Boolean(detected),
      binary: detected?.binary,
      version: detected?.version,
      globalRoot: detected?.globalRoot ?? globalRoot,
      warnings,
      projects: [],
      items: [],
    }

    if (detected) {
      let projects: string[] = []
      try {
        projects = await adapter.listProjects(opts, detected.globalRoot)
      } catch (err) {
        instance.warnings.push(err instanceof Error ? err.message : String(err))
      }
      const all = [...new Set([...projects, ...extraProjects])]
      instance.projects = await Promise.all(
        all.map(async (path) => ({ path, exists: await pathExists(path) })),
      )
      try {
        const listed = await adapter.listItems(opts, detected.globalRoot, all)
        instance.items = listed.items
        instance.warnings.push(...listed.warnings)
      } catch (err) {
        instance.warnings.push(err instanceof Error ? err.message : String(err))
      }
    }

    overlayLedger(instance, ledger)
    const seen = new Set<string>()
    instance.items = instance.items.filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    agents.push(instance)
  }

  return {
    scannedAt: new Date().toISOString(),
    localPath: opts.localPath ? resolve(opts.localPath) : undefined,
    agents,
  }
}

function overlayLedger(instance: AgentInstance, ledger: Awaited<ReturnType<typeof loadLedger>>) {
  for (const entry of ledger) {
    for (const target of entry.targets) {
      if (target.agentId !== instance.id) continue
      const hit = instance.items.find((i) => i.path === target.path)
      if (hit) {
        hit.origin = entry.origin
        if (entry.origin.type === "catalog") hit.source = "catalog"
      } else {
        const missing: Item = {
          id: `${target.agentId}:${target.kind}:${target.path}`,
          agentId: target.agentId,
          kind: target.kind,
          name: target.key ?? target.path.split("/").pop() ?? target.kind,
          scope: { kind: "global" },
          source: entry.origin.type === "catalog" ? "catalog" : "user",
          origin: entry.origin,
          path: target.path,
          configPath: target.configPath,
          enabled: false,
          mutable: true,
          missing: true,
        }
        instance.items.push(missing)
      }
    }
  }
}

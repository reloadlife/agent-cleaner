import type { AgentId, Item, ItemKind, MutationPlan, ScanOptions, Scope } from "../types"

export type InstallRequest = {
  kind: ItemKind
  name: string
  stagingDir: string
  mcp?: { name: string; config: Record<string, unknown> }
  hook?: { event: string; command: string }
  targets: { agentId: AgentId; scope: Scope }[]
  overwrite: boolean
}

export type AgentAdapter = {
  id: AgentId
  name: string
  detect(opts: ScanOptions): Promise<{ binary?: string; version?: string; globalRoot: string } | null>
  listProjects(opts: ScanOptions, globalRoot: string): Promise<string[]>
  listItems(
    opts: ScanOptions,
    globalRoot: string,
    projects: string[],
  ): Promise<{ items: Item[]; warnings: string[] }>
  planInstall(req: InstallRequest, opts: ScanOptions): Promise<MutationPlan>
  planUninstall(item: Item): Promise<MutationPlan>
}

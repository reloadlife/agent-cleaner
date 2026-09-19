import { adapters } from "./adapters"
import type { InstallRequest } from "./adapters/types"
import { appendLedger } from "./ledger"
import { applyPlan } from "./mutate"
import type { AgentId, ItemKind, MutationPlan, Origin, Runtime, Scope } from "./types"

export async function previewInstall(input: {
  origin: Origin
  stagingDir: string
  kind: ItemKind
  name: string
  mcp?: { name: string; config: Record<string, unknown> }
  hook?: { event: string; command: string }
  targets: { agentId: AgentId; scope: Scope }[]
  overwrite: boolean
  runtime: Runtime
}): Promise<MutationPlan> {
  const req: InstallRequest = {
    kind: input.kind,
    name: input.name,
    stagingDir: input.stagingDir,
    mcp: input.mcp,
    hook: input.hook,
    targets: input.targets,
    overwrite: input.overwrite,
  }
  const ops: MutationPlan["ops"] = []
  const warnings: string[] = []
  const opts = { home: input.runtime.home, appDir: input.runtime.appDir }
  for (const adapter of adapters) {
    if (!input.targets.some((t) => t.agentId === adapter.id)) continue
    const mine: InstallRequest = {
      ...req,
      targets: req.targets.filter((t) => t.agentId === adapter.id),
    }
    const plan = await adapter.planInstall(mine, opts)
    ops.push(...plan.ops)
    warnings.push(...plan.warnings)
  }
  return { summary: `install ${input.kind} ${input.name}`, ops, warnings }
}

export async function install(input: {
  origin: Origin
  stagingDir: string
  kind: ItemKind
  name: string
  mcp?: { name: string; config: Record<string, unknown> }
  hook?: { event: string; command: string }
  targets: { agentId: AgentId; scope: Scope }[]
  overwrite: boolean
  yes: boolean
  runtime: Runtime
}): Promise<{ backupId: string; plan: MutationPlan }> {
  if (!input.yes) throw new Error("confirm required")
  const plan = await previewInstall(input)
  const { backupId } = await applyPlan(plan, input.runtime)
  await appendLedger(input.runtime.appDir, {
    id: `${backupId}:${input.name}`,
    installedAt: input.runtime.now().toISOString(),
    origin: input.origin,
    backupId,
    targets: collectTargets(input, plan),
  })
  return { backupId, plan }
}

function collectTargets(
  input: {
    kind: ItemKind
    name: string
    targets: { agentId: AgentId; scope: Scope }[]
    mcp?: { name: string }
  },
  plan: MutationPlan,
) {
  const targets: {
    agentId: AgentId
    kind: ItemKind
    path: string
    configPath?: string
    key?: string
  }[] = []
  for (const op of plan.ops) {
    if (op.op === "copy-dir") {
      const agentId = guessAgent(op.to, input.targets)
      if (agentId) targets.push({ agentId, kind: input.kind, path: op.to })
    }
    if (op.op === "merge-json" || op.op === "merge-toml") {
      const agentId = guessAgent(op.path, input.targets)
      const key = input.mcp?.name ?? input.name
      if (agentId) {
        targets.push({
          agentId,
          kind: input.kind,
          path: `${op.path}#${key}`,
          configPath: op.path,
          key,
        })
      }
    }
    if (op.op === "write") {
      const agentId = guessAgent(op.path, input.targets)
      if (agentId) targets.push({ agentId, kind: input.kind, path: op.path })
    }
  }
  return targets
}

function guessAgent(path: string, targets: { agentId: AgentId; scope: Scope }[]): AgentId | undefined {
  if (path.includes(".claude")) return "claude"
  if (path.includes(".cursor")) return "cursor"
  if (path.includes(".codex")) return "codex"
  if (path.includes(".grok")) return "grok"
  if (path.includes("opencode")) return "opencode"
  if (path.includes(".gemini")) return "gemini"
  return targets[0]?.agentId
}

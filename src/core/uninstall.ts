import { adapters } from "./adapters"
import { removeLedgerTargets } from "./ledger"
import { applyPlan } from "./mutate"
import type { Item, MutationPlan, Runtime } from "./types"

export async function previewUninstall(item: Item, _runtime: Runtime): Promise<MutationPlan> {
  if (!item.mutable) {
    return { summary: `refuse ${item.name}`, ops: [], warnings: ["bundled, view only"] }
  }
  const adapter = adapters.find((a) => a.id === item.agentId)
  if (!adapter) throw new Error(`unknown agent ${item.agentId}`)
  return adapter.planUninstall(item)
}

export async function uninstall(input: {
  item: Item
  yes: boolean
  runtime: Runtime
}): Promise<{ backupId: string; plan: MutationPlan }> {
  if (!input.yes) throw new Error("confirm required")
  if (!input.item.mutable) throw new Error("bundled, view only")
  const plan = await previewUninstall(input.item, input.runtime)
  if (plan.ops.length === 0 && plan.warnings.includes("bundled, view only")) {
    throw new Error("bundled, view only")
  }
  const { backupId } = await applyPlan(plan, input.runtime)
  await removeLedgerTargets(input.runtime.appDir, [input.item.path])
  return { backupId, plan }
}

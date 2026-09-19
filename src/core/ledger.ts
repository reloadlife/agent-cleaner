import { join } from "node:path"
import { readJson, writeJson } from "./io"
import type { LedgerEntry } from "./types"

export async function loadLedger(appDir: string): Promise<LedgerEntry[]> {
  const r = await readJson<{ entries?: LedgerEntry[] }>(join(appDir, "ledger.json"))
  if (!r.ok) return []
  return r.value.entries ?? []
}

export async function appendLedger(appDir: string, entry: LedgerEntry): Promise<void> {
  const entries = await loadLedger(appDir)
  entries.push(entry)
  await writeJson(join(appDir, "ledger.json"), { entries })
}

export async function removeLedgerTargets(appDir: string, paths: string[]): Promise<void> {
  const drop = new Set(paths)
  const entries = await loadLedger(appDir)
  const next = entries
    .map((e) => ({ ...e, targets: e.targets.filter((t) => !drop.has(t.path)) }))
    .filter((e) => e.targets.length > 0)
  await writeJson(join(appDir, "ledger.json"), { entries: next })
}

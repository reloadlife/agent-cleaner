import { cp, mkdir, rm } from "node:fs/promises"
import { dirname } from "node:path"
import { createBackup, restoreBackup } from "./backup"
import { pathExists, readJson, readToml, writeJson, writeToml } from "./io"
import type { FileOp, MutationPlan, Runtime } from "./types"

function pathsFrom(ops: FileOp[]): string[] {
  const out: string[] = []
  for (const op of ops) {
    if ("path" in op) out.push(op.path)
    if (op.op === "copy-dir") out.push(op.to)
  }
  return out
}

export async function applyPlan(plan: MutationPlan, runtime: Runtime): Promise<{ backupId: string }> {
  const backupId = await createBackup(runtime, pathsFrom(plan.ops))
  try {
    for (const op of plan.ops) {
      await applyOp(op)
    }
  } catch (err) {
    await restoreBackup(runtime.appDir, backupId, runtime.home)
    throw err
  }
  return { backupId }
}

async function applyOp(op: FileOp): Promise<void> {
  switch (op.op) {
    case "write":
      await mkdir(dirname(op.path), { recursive: true })
      await Bun.write(op.path, op.content)
      return
    case "copy-dir":
      await mkdir(dirname(op.to), { recursive: true })
      await cp(op.from, op.to, { recursive: true })
      return
    case "remove":
      await rm(op.path, { recursive: true, force: true })
      return
    case "merge-json": {
      const r = await readJson<Record<string, unknown>>(op.path)
      const obj = r.ok ? r.value : {}
      obj[op.key] = op.value
      await writeJson(op.path, obj)
      return
    }
    case "unmerge-json": {
      const r = await readJson<Record<string, unknown>>(op.path)
      if (!r.ok) return
      delete r.value[op.key]
      await writeJson(op.path, r.value)
      return
    }
    case "merge-toml": {
      const r = await readToml<Record<string, unknown>>(op.path)
      const obj = r.ok ? r.value : {}
      const table = { ...((obj[op.table] as Record<string, unknown>) ?? {}) }
      if (op.key) table[op.key] = op.value
      else Object.assign(table, op.value as Record<string, unknown>)
      obj[op.table] = table
      await writeToml(op.path, obj)
      return
    }
    case "unmerge-toml": {
      const r = await readToml<Record<string, unknown>>(op.path)
      if (!r.ok) return
      const table = { ...((r.value[op.table] as Record<string, unknown>) ?? {}) }
      delete table[op.key]
      r.value[op.table] = table
      await writeToml(op.path, r.value)
      return
    }
  }
}

export async function pathExistsOr(path: string): Promise<boolean> {
  return pathExists(path)
}

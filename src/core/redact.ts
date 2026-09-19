import type { Inventory } from "./types"

const SECRET_KEY = /token|key|secret|password|authorization|cookie/i

export function redactValue(key: string, value: unknown): unknown {
  if (key === "env" || key === "headers") {
    if (value && typeof value === "object") return "***"
  }
  if (SECRET_KEY.test(key)) return "***"
  if (Array.isArray(value)) return value.map((v, i) => redactValue(String(i), v))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(k, v)
    }
    return out
  }
  return value
}

export function redactInventory(inv: Inventory): Inventory {
  const clone = structuredClone(inv)
  for (const agent of clone.agents) {
    for (const item of agent.items) {
      if (item.meta) item.meta = redactValue("meta", item.meta) as Record<string, unknown>
    }
  }
  return clone
}

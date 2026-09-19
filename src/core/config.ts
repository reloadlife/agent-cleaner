import { join } from "node:path"
import { pathExists, readToml, writeToml } from "./io"
import type { AgentId } from "./types"

export type AppConfig = {
  bind: string
  port: number
  lastLocal?: string
  disabledAdapters: AgentId[]
}

export const defaultAppConfig = (): AppConfig => ({
  bind: "127.0.0.1",
  port: 8787,
  disabledAdapters: [],
})

export function configPath(appDir: string): string {
  return join(appDir, "config.toml")
}

export async function loadAppConfig(appDir: string): Promise<AppConfig> {
  const path = configPath(appDir)
  const base = defaultAppConfig()
  if (!(await pathExists(path))) return base
  const r = await readToml<Record<string, unknown>>(path)
  if (!r.ok) return base
  const bind = typeof r.value.bind === "string" ? r.value.bind : base.bind
  const port = typeof r.value.port === "number" ? r.value.port : base.port
  const lastLocal = typeof r.value.last_local === "string" ? r.value.last_local : undefined
  const disabled = Array.isArray(r.value.disabled_adapters)
    ? (r.value.disabled_adapters.filter((x): x is AgentId => typeof x === "string") as AgentId[])
    : []
  return { bind, port, lastLocal, disabledAdapters: disabled }
}

export async function saveAppConfig(appDir: string, cfg: AppConfig): Promise<void> {
  const body: Record<string, unknown> = {
    bind: cfg.bind,
    port: cfg.port,
    disabled_adapters: cfg.disabledAdapters,
  }
  if (cfg.lastLocal) body.last_local = cfg.lastLocal
  await writeToml(configPath(appDir), body)
}

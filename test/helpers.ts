import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Runtime } from "../src/core/types"

export async function makeTempHome() {
  const home = await mkdtemp(join(tmpdir(), "agent-cleaner-"))
  const appDir = join(home, ".agent-cleaner")
  await mkdir(appDir, { recursive: true })
  const runtime: Runtime = {
    home,
    appDir,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  }
  return {
    home,
    appDir,
    runtime,
    cleanup: () => rm(home, { recursive: true, force: true }),
  }
}

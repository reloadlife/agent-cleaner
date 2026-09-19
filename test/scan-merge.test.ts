import { expect, test } from "bun:test"
import { cp, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { scan } from "../src/core/scan"
import { makeTempHome } from "./helpers"

test("scan merges two adapters and keeps missing project", async () => {
  const { home, appDir, cleanup } = await makeTempHome()
  const fx = join(import.meta.dir, "fixtures/claude-home")
  await cp(join(fx, ".claude"), join(home, ".claude"), { recursive: true })
  await cp(join(fx, ".claude.json"), join(home, ".claude.json"))
  await cp(join(import.meta.dir, "fixtures/multi-home/.cursor"), join(home, ".cursor"), { recursive: true })
  const inv = await scan({ home, appDir })
  expect(inv.agents.find((a) => a.id === "claude")?.installed).toBe(true)
  expect(inv.agents.find((a) => a.id === "cursor")?.installed).toBe(true)
  expect(
    inv.agents.find((a) => a.id === "claude")?.projects.some((p) => p.path === "/no/such/proj" && !p.exists),
  ).toBe(true)
  await cleanup()
})

test("disabled adapters are listed but not scanned", async () => {
  const { home, appDir, cleanup } = await makeTempHome()
  await cp(join(import.meta.dir, "fixtures/claude-home/.claude"), join(home, ".claude"), { recursive: true })
  const inv = await scan({ home, appDir, disabledAdapters: ["claude"] })
  const claude = inv.agents.find((a) => a.id === "claude")
  expect(claude?.installed).toBe(false)
  expect(claude?.items).toEqual([])
  expect(claude?.warnings.some((w) => w.includes("disabled"))).toBe(true)
  await cleanup()
})

test("broken json is a warning not a crash", async () => {
  const { home, appDir, cleanup } = await makeTempHome()
  await cp(join(import.meta.dir, "fixtures/claude-home/.claude"), join(home, ".claude"), { recursive: true })
  await writeFile(join(home, ".claude.json"), "{")
  const inv = await scan({ home, appDir })
  expect(inv.agents.find((a) => a.id === "claude")?.warnings.length).toBeGreaterThan(0)
  await cleanup()
})

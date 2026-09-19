import { expect, test } from "bun:test"
import { cp } from "node:fs/promises"
import { join } from "node:path"
import { claudeAdapter } from "../src/core/adapters/claude"
import { makeTempHome } from "./helpers"

test("claude lists skills, mcp, hooks from a fixture home", async () => {
  const { home, appDir, cleanup } = await makeTempHome()
  const fx = join(import.meta.dir, "fixtures/claude-home")
  await cp(join(fx, ".claude"), join(home, ".claude"), { recursive: true })
  await cp(join(fx, ".claude.json"), join(home, ".claude.json"))
  const opts = { home, appDir }
  const det = await claudeAdapter.detect(opts)
  expect(det).not.toBeNull()
  const { items, warnings } = await claudeAdapter.listItems(opts, det!.globalRoot, [])
  const names = items.filter((i) => i.kind === "skill").map((i) => i.name)
  expect(names).toContain("Cloudflare")
  expect(items.find((i) => i.kind === "mcp" && i.name === "shadcn")).toBeTruthy()
  expect(items.find((i) => i.source === "bundled")?.mutable).toBe(false)
  expect(warnings).toEqual([])
  await cleanup()
})

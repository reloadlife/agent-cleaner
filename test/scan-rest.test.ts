import { expect, test } from "bun:test"
import { cp, readdir } from "node:fs/promises"
import { join } from "node:path"
import { adapters } from "../src/core/adapters"
import { makeTempHome } from "./helpers"

test("each remaining adapter detects and lists sample skill or codegraph mcp", async () => {
  const { home, appDir, cleanup } = await makeTempHome()
  const fx = join(import.meta.dir, "fixtures/multi-home")
  for (const name of await readdir(fx)) {
    await cp(join(fx, name), join(home, name), { recursive: true })
  }
  const opts = { home, appDir }
  for (const id of ["cursor", "codex", "grok", "opencode", "gemini"] as const) {
    const adapter = adapters.find((a) => a.id === id)!
    const det = await adapter.detect(opts)
    expect(det).not.toBeNull()
    const { items } = await adapter.listItems(opts, det!.globalRoot, [])
    const ok =
      items.some((i) => i.kind === "skill" && i.name === "sample") ||
      items.some((i) => i.kind === "mcp" && i.name === "codegraph")
    expect(ok).toBe(true)
  }
  await cleanup()
})

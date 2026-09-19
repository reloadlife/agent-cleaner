import { describe, expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { listDirs, readJson, readJsonc } from "../src/core/io"
import { makeTempHome } from "./helpers"

describe("io", () => {
  test("readJson returns error on invalid json without throwing", async () => {
    const { home, cleanup } = await makeTempHome()
    const p = join(home, "broken.json")
    await writeFile(p, "{ not json")
    const r = await readJson(p)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0)
    await cleanup()
  })

  test("readJsonc strips comments", async () => {
    const { home, cleanup } = await makeTempHome()
    const p = join(home, "c.jsonc")
    await writeFile(
      p,
      `{
      // hi
      "mcp": { "a": 1 }
    }`,
    )
    const r = await readJsonc<{ mcp: { a: number } }>(p)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.mcp.a).toBe(1)
    await cleanup()
  })

  test("listDirs returns [] when missing", async () => {
    expect(await listDirs("/no/such/agent-cleaner-dir")).toEqual([])
  })
})

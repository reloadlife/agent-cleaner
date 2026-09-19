import { expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { applyPlan } from "../src/core/mutate"
import type { MutationPlan } from "../src/core/types"
import { makeTempHome } from "./helpers"

test("failed apply restores backup", async () => {
  const { home, runtime, cleanup } = await makeTempHome()
  const target = join(home, ".cursor/mcp.json")
  await mkdir(join(home, ".cursor"), { recursive: true })
  await writeFile(target, JSON.stringify({ mcpServers: { keep: { command: "x" } } }, null, 2))
  const plan: MutationPlan = {
    summary: "test",
    warnings: [],
    ops: [
      { op: "merge-json", path: target, key: "mcpServers", value: { keep: { command: "x" }, new: { command: "y" } } },
      { op: "copy-dir", from: join(home, "missing-src"), to: join(home, "out") },
    ],
  }
  await expect(applyPlan(plan, runtime)).rejects.toThrow()
  const body = JSON.parse(await readFile(target, "utf8"))
  expect(body.mcpServers.new).toBeUndefined()
  expect(body.mcpServers.keep.command).toBe("x")
  await cleanup()
})

test("merge-json adds a key", async () => {
  const { home, runtime, cleanup } = await makeTempHome()
  const target = join(home, "mcp.json")
  await writeFile(target, JSON.stringify({ mcpServers: {} }))
  await applyPlan(
    {
      summary: "add",
      warnings: [],
      ops: [{ op: "merge-json", path: target, key: "mcpServers", value: { a: { command: "x" } } }],
    },
    runtime,
  )
  const body = JSON.parse(await readFile(target, "utf8"))
  expect(body.mcpServers.a.command).toBe("x")
  await cleanup()
})

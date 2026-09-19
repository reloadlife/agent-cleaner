import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { install } from "../src/core/install"
import { scan } from "../src/core/scan"
import { uninstall } from "../src/core/uninstall"
import type { Item } from "../src/core/types"
import { makeTempHome } from "./helpers"

test("install skill onto claude and cursor, uninstall one keeps the other", async () => {
  const { home, appDir, runtime, cleanup } = await makeTempHome()
  await mkdir(join(home, ".claude/skills"), { recursive: true })
  await mkdir(join(home, ".cursor/skills"), { recursive: true })
  const staging = join(home, "staging/demo")
  await mkdir(staging, { recursive: true })
  await writeFile(join(staging, "SKILL.md"), "---\nname: demo\n---\n")
  await install({
    origin: { type: "local", path: staging },
    stagingDir: staging,
    kind: "skill",
    name: "demo",
    targets: [
      { agentId: "claude", scope: { kind: "global" } },
      { agentId: "cursor", scope: { kind: "global" } },
    ],
    overwrite: false,
    yes: true,
    runtime,
  })
  expect(existsSync(join(home, ".claude/skills/demo/SKILL.md"))).toBe(true)
  expect(existsSync(join(home, ".cursor/skills/demo/SKILL.md"))).toBe(true)
  const inv = await scan({ home, appDir })
  const cursorItem = inv.agents.find((a) => a.id === "cursor")!.items.find((i) => i.name === "demo")!
  await uninstall({ item: cursorItem, yes: true, runtime })
  expect(existsSync(join(home, ".cursor/skills/demo/SKILL.md"))).toBe(false)
  expect(existsSync(join(home, ".claude/skills/demo/SKILL.md"))).toBe(true)
  await cleanup()
})

test("uninstalls a hook entry from claude settings.json", async () => {
  const { home, appDir, runtime, cleanup } = await makeTempHome()
  await mkdir(join(home, ".claude"), { recursive: true })
  await writeFile(
    join(home, ".claude/settings.json"),
    JSON.stringify({
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: "/tmp/keep.sh" }] },
          { hooks: [{ type: "command", command: "/tmp/drop.sh" }] },
        ],
      },
    }),
  )
  const inv = await scan({ home, appDir })
  const drop = inv.agents.find((a) => a.id === "claude")!.items.find((i) => i.kind === "hook" && String(i.meta?.command).includes("drop.sh"))
  expect(drop).toBeTruthy()
  await uninstall({ item: drop!, yes: true, runtime })
  const again = await scan({ home, appDir })
  const hooks = again.agents.find((a) => a.id === "claude")!.items.filter((i) => i.kind === "hook")
  expect(hooks.some((i) => String(i.meta?.command).includes("drop.sh"))).toBe(false)
  expect(hooks.some((i) => String(i.meta?.command).includes("keep.sh"))).toBe(true)
  await cleanup()
})

test("installs a plugin folder with plugin.json", async () => {
  const { home, appDir, runtime, cleanup } = await makeTempHome()
  await mkdir(join(home, ".claude/plugins"), { recursive: true })
  const staging = join(home, "staging/myplug")
  await mkdir(staging, { recursive: true })
  await writeFile(join(staging, "plugin.json"), JSON.stringify({ name: "myplug" }))
  await writeFile(join(staging, "index.md"), "# plugin\n")
  await install({
    origin: { type: "local", path: staging },
    stagingDir: staging,
    kind: "plugin",
    name: "myplug",
    targets: [{ agentId: "claude", scope: { kind: "global" } }],
    overwrite: false,
    yes: true,
    runtime,
  })
  expect(existsSync(join(home, ".claude/plugins/myplug/plugin.json"))).toBe(true)
  const inv = await scan({ home, appDir })
  const plug = inv.agents.find((a) => a.id === "claude")!.items.find((i) => i.kind === "plugin" && i.name === "myplug")
  expect(plug?.mutable).toBe(true)
  await cleanup()
})

test("refuses bundled uninstall", async () => {
  const { runtime, cleanup } = await makeTempHome()
  const item: Item = {
    id: "claude:skill:/bundled",
    agentId: "claude",
    kind: "skill",
    name: "bundled",
    scope: { kind: "global" },
    source: "bundled",
    path: "/bundled",
    enabled: true,
    mutable: false,
    missing: false,
  }
  await expect(uninstall({ item, yes: true, runtime })).rejects.toThrow(/view only/)
  await cleanup()
})

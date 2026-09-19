import { expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { loadCatalog, stageOrigin } from "../src/core/catalog"
import { makeTempHome } from "./helpers"

test("user catalog wins on id", async () => {
  const { appDir, cleanup } = await makeTempHome()
  await writeFile(
    join(appDir, "catalog.json"),
    JSON.stringify({
      items: [
        {
          id: "find-skills",
          kind: "skill",
          name: "find-skills-user",
          description: "overridden",
          source: { type: "local", path: "/tmp" },
          compatible: ["claude"],
        },
      ],
    }),
  )
  const items = await loadCatalog(appDir)
  expect(items.find((i) => i.id === "find-skills")?.name).toBe("find-skills-user")
  await cleanup()
})

test("stageOrigin local dir", async () => {
  const { home, cleanup } = await makeTempHome()
  const dir = join(home, "myskill")
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, "SKILL.md"), "---\nname: myskill\n---\n")
  const staged = await stageOrigin({ type: "local", path: dir }, join(home, "cache"))
  expect(staged.stagingDir).toBe(dir)
  await cleanup()
})

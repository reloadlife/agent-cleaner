import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { cursorAdapter } from "../src/core/adapters/cursor"
import { encodeHyphenatedPath } from "../src/core/hyphen-path"
import { makeTempHome } from "./helpers"

test("cursor listProjects decodes hyphenated project dirs", async () => {
  const { home, appDir, cleanup } = await makeTempHome()
  const work = join(home, "work", "app.site")
  await mkdir(work, { recursive: true })
  await mkdir(join(home, ".cursor/projects", encodeHyphenatedPath(work)), { recursive: true })
  const opts = { home, appDir }
  const det = await cursorAdapter.detect(opts)
  expect(det).not.toBeNull()
  const projects = await cursorAdapter.listProjects(opts, det!.globalRoot)
  expect(projects).toContain(work)
  await cleanup()
})

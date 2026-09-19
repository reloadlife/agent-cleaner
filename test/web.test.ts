import { expect, test } from "bun:test"
import { cp } from "node:fs/promises"
import { join } from "node:path"
import { createWebApp } from "../src/web/server"
import { makeTempHome } from "./helpers"

test("inventory API redacts secrets and apply without planId is 400", async () => {
  const { home, appDir, cleanup } = await makeTempHome()
  const fx = join(import.meta.dir, "fixtures/claude-home")
  await cp(join(fx, ".claude"), join(home, ".claude"), { recursive: true })
  await cp(join(fx, ".claude.json"), join(home, ".claude.json"))
  const app = createWebApp({ home, appDir })
  const invRes = await app.request("/api/inventory")
  expect(invRes.status).toBe(200)
  const body = await invRes.text()
  expect(body).not.toContain("test-secret-value")
  expect(Array.isArray(JSON.parse(body).agents)).toBe(true)
  const apply = await app.request("/api/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  })
  expect(apply.status).toBe(400)
  await cleanup()
})

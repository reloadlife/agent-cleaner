import { expect, test } from "bun:test"
import { loadAppConfig, saveAppConfig } from "../src/core/config"
import { makeTempHome } from "./helpers"

test("defaults and round-trip config.toml", async () => {
  const { appDir, cleanup } = await makeTempHome()
  const fresh = await loadAppConfig(appDir)
  expect(fresh.bind).toBe("127.0.0.1")
  expect(fresh.port).toBe(8787)
  expect(fresh.disabledAdapters).toEqual([])
  await saveAppConfig(appDir, {
    bind: "0.0.0.0",
    port: 9000,
    lastLocal: "/tmp/work",
    disabledAdapters: ["gemini"],
  })
  const loaded = await loadAppConfig(appDir)
  expect(loaded.bind).toBe("0.0.0.0")
  expect(loaded.port).toBe(9000)
  expect(loaded.lastLocal).toBe("/tmp/work")
  expect(loaded.disabledAdapters).toEqual(["gemini"])
  await cleanup()
})

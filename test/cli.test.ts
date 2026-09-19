import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { cp, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { makeTempHome } from "./helpers"

test("scan --json redacts secrets", async () => {
  const { home, cleanup } = await makeTempHome()
  const fx = join(import.meta.dir, "fixtures/claude-home")
  await cp(join(fx, ".claude"), join(home, ".claude"), { recursive: true })
  await cp(join(fx, ".claude.json"), join(home, ".claude.json"))
  const proc = Bun.spawn(["bun", "src/cli.ts", "scan", "--json", "--home", home], {
    cwd: join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
  })
  const code = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  expect(code).toBe(0)
  expect(stdout).not.toContain("test-secret-value")
  const json = JSON.parse(stdout)
  expect(Array.isArray(json.agents)).toBe(true)
  await cleanup()
})

test("headless install prints plan without --yes and applies with --yes", async () => {
  const { home, cleanup } = await makeTempHome()
  await mkdir(join(home, ".claude/skills"), { recursive: true })
  const staging = join(home, "skill")
  await mkdir(staging, { recursive: true })
  await writeFile(join(staging, "SKILL.md"), "---\nname: cli-demo\n---\n")
  const cwd = join(import.meta.dir, "..")
  const dry = Bun.spawn(["bun", "src/cli.ts", "install", staging, "--to", "claude", "--home", home], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(await dry.exited).toBe(2)
  expect(existsSync(join(home, ".claude/skills/cli-demo/SKILL.md"))).toBe(false)
  const apply = Bun.spawn(["bun", "src/cli.ts", "install", staging, "--to", "claude", "--home", home, "--yes"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(await apply.exited).toBe(0)
  expect(existsSync(join(home, ".claude/skills/cli-demo/SKILL.md"))).toBe(true)
  const scan = Bun.spawn(["bun", "src/cli.ts", "scan", "--json", "--home", home], { cwd, stdout: "pipe", stderr: "pipe" })
  await scan.exited
  const inv = JSON.parse(await new Response(scan.stdout).text())
  const item = inv.agents.find((a: { id: string }) => a.id === "claude").items.find((i: { name: string }) => i.name === "cli-demo")
  const rm = Bun.spawn(["bun", "src/cli.ts", "uninstall", item.id, "--home", home, "--yes"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(await rm.exited).toBe(0)
  expect(existsSync(join(home, ".claude/skills/cli-demo/SKILL.md"))).toBe(false)
  await cleanup()
})

test("default command on non-tty exits 1", async () => {
  const proc = Bun.spawn(["bun", "src/cli.ts"], {
    cwd: join(import.meta.dir, ".."),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const code = await proc.exited
  const stderr = await new Response(proc.stderr).text()
  expect(code).toBe(1)
  expect(stderr).toContain("terminal")
})

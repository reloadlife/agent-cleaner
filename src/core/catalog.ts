import { createHash } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseSkillFrontmatter } from "./adapters/common"
import { pathExists, readJson } from "./io"
import type { CatalogItem, ItemKind, Origin } from "./types"

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)))

export function builtinCatalogPath(): string {
  return join(repoRoot, "catalog", "default.json")
}

export async function loadCatalog(appDir: string, builtinPath = builtinCatalogPath()): Promise<CatalogItem[]> {
  const builtin = await readJson<{ items?: CatalogItem[] }>(builtinPath)
  const items = new Map<string, CatalogItem>()
  if (builtin.ok) {
    for (const item of builtin.value.items ?? []) items.set(item.id, item)
  }
  const user = await readJson<{ items?: CatalogItem[] }>(join(appDir, "catalog.json"))
  if (user.ok) {
    for (const item of user.value.items ?? []) items.set(item.id, item)
  }
  return [...items.values()]
}

export async function stageOrigin(
  origin: Origin,
  cacheDir: string,
  catalog?: CatalogItem[],
): Promise<{ stagingDir: string; kind: CatalogItem["kind"]; name: string }> {
  if (origin.type === "catalog") {
    const item = (catalog ?? []).find((c) => c.id === origin.id)
    if (!item) throw new Error(`catalog id not found: ${origin.id}`)
    const staged = await stageOrigin(item.source, cacheDir, catalog)
    return { stagingDir: staged.stagingDir, kind: item.kind, name: item.name }
  }
  if (origin.type === "local") {
    const path = isAbsolute(origin.path) ? origin.path : resolve(repoRoot, origin.path)
    if (!(await pathExists(path))) throw new Error(`local path missing: ${path}`)
    const file = Bun.file(path)
    const stat = await file.stat()
    if (stat.isFile()) {
      return { stagingDir: dirname(path), kind: "skill", name: dirname(path).split("/").pop() ?? "skill" }
    }
    return { stagingDir: path, kind: "skill", name: path.split("/").pop() ?? "skill" }
  }
  if (origin.type === "git") {
    const dest = join(cacheDir, "git", hash(origin.url + (origin.ref ?? "")))
    await mkdir(dirname(dest), { recursive: true })
    if (!(await pathExists(join(dest, ".git")))) {
      await rmrf(dest)
      const args = ["clone", "--depth", "1"]
      if (origin.ref) args.push("--branch", origin.ref)
      args.push(origin.url, dest)
      const proc = Bun.spawn(["git", ...args], { stderr: "pipe", stdout: "pipe" })
      const code = await proc.exited
      if (code !== 0) {
        const err = await new Response(proc.stderr).text()
        throw new Error(`git clone failed: ${err}`)
      }
    }
    const stagingDir = origin.subpath ? join(dest, origin.subpath) : dest
    return { stagingDir, kind: "skill", name: stagingDir.split("/").pop() ?? "skill" }
  }
  const res = await fetch(origin.url)
  if (!res.ok) throw new Error(`fetch ${origin.url} failed: ${res.status}`)
  const text = await res.text()
  if (!text.includes("SKILL.md") && !text.startsWith("---") && !text.includes("# ")) {
    throw new Error("only git, local path, or raw SKILL.md url")
  }
  const dir = join(cacheDir, "url", hash(origin.url))
  await mkdir(dir, { recursive: true })
  await Bun.write(join(dir, "SKILL.md"), text)
  return { stagingDir: dir, kind: "skill", name: "downloaded" }
}

export async function inspectStaging(dir: string): Promise<{
  kind: ItemKind
  name: string
  mcp?: { name: string; config: Record<string, unknown> }
}> {
  const plugin = join(dir, "plugin.json")
  if (await pathExists(plugin)) {
    const r = await readJson<{ name?: string }>(plugin)
    return { kind: "plugin", name: (r.ok && r.value.name) || basename(dir) }
  }
  const mcpFile = join(dir, "mcp.json")
  if (await pathExists(mcpFile)) {
    const r = await readJson<{ name: string; config: Record<string, unknown> }>(mcpFile)
    if (r.ok) return { kind: "mcp", name: r.value.name, mcp: r.value }
  }
  const skill = join(dir, "SKILL.md")
  if (await pathExists(skill)) {
    const fm = parseSkillFrontmatter(await Bun.file(skill).text())
    return { kind: "skill", name: fm.name || basename(dir) }
  }
  return { kind: "skill", name: basename(dir) }
}

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16)
}

async function rmrf(path: string) {
  const { rm } = await import("node:fs/promises")
  await rm(path, { recursive: true, force: true })
}

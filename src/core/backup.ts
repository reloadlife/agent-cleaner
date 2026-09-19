import { cp, mkdir, readdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { pathExists, readJson, writeJson } from "./io"
import type { Runtime } from "./types"

export function backupIdFrom(now: Date): string {
  return now.toISOString().replaceAll(":", "-")
}

function relPath(path: string, home: string): string {
  if (path.startsWith(home)) return path.slice(home.length).replace(/^\//, "")
  return `_abs/${path.replaceAll("/", "_")}`
}

export async function createBackup(runtime: Runtime, paths: string[]): Promise<string> {
  const id = backupIdFrom(runtime.now())
  const root = join(runtime.appDir, "backups", id)
  await mkdir(root, { recursive: true })
  const unique = [...new Set(paths)]
  const manifest: { from: string; rel: string }[] = []
  for (const from of unique) {
    if (!(await pathExists(from))) continue
    const rel = relPath(from, runtime.home)
    const to = join(root, rel)
    await mkdir(dirname(to), { recursive: true })
    await cp(from, to, { recursive: true })
    manifest.push({ from, rel })
  }
  await writeJson(join(root, "manifest.json"), { files: manifest })
  await pruneBackups(runtime.appDir, 50)
  return id
}

export async function restoreBackup(appDir: string, backupId: string, home: string): Promise<void> {
  const root = join(appDir, "backups", backupId)
  const man = await readJson<{ files: { from: string; rel: string }[] }>(join(root, "manifest.json"))
  if (!man.ok) throw new Error(`backup ${backupId} missing manifest`)
  for (const file of man.value.files) {
    const from = join(root, file.rel)
    await rm(file.from, { recursive: true, force: true })
    await mkdir(dirname(file.from), { recursive: true })
    await cp(from, file.from, { recursive: true })
  }
  void home
}

async function pruneBackups(appDir: string, keep: number): Promise<void> {
  const dir = join(appDir, "backups")
  let names: string[] = []
  try {
    names = (await readdir(dir)).sort()
  } catch {
    return
  }
  const extra = names.slice(0, Math.max(0, names.length - keep))
  for (const name of extra) {
    await rm(join(dir, name), { recursive: true, force: true })
  }
}

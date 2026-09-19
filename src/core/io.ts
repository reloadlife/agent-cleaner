import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { parse as parseToml, stringify as stringifyToml } from "smol-toml"

export type ReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export function stripJsonc(text: string): string {
  let out = ""
  let i = 0
  let inStr = false
  let quote = ""
  let escape = false
  while (i < text.length) {
    const c = text[i]
    const n = text[i + 1]
    if (inStr) {
      out += c
      if (escape) escape = false
      else if (c === "\\") escape = true
      else if (c === quote) inStr = false
      i++
      continue
    }
    if (c === '"') {
      inStr = true
      quote = c
      out += c
      i++
      continue
    }
    if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") i++
      continue
    }
    if (c === "/" && n === "*") {
      i += 2
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++
      i += 2
      continue
    }
    out += c
    i++
  }
  return out
}

export async function readJson<T>(path: string): Promise<ReadResult<T>> {
  try {
    const text = await readFile(path, "utf8")
    return { ok: true, value: JSON.parse(text) as T }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function readJsonc<T>(path: string): Promise<ReadResult<T>> {
  try {
    const text = await readFile(path, "utf8")
    return { ok: true, value: JSON.parse(stripJsonc(text)) as T }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function readToml<T>(path: string): Promise<ReadResult<T>> {
  try {
    const text = await readFile(path, "utf8")
    return { ok: true, value: parseToml(text) as T }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export async function writeToml(path: string, value: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, stringifyToml(value), "utf8")
}

export async function listDirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

export async function listFiles(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter((e) => e.isFile()).map((e) => e.name)
  } catch {
    return []
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

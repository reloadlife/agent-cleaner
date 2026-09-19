export function encodeHyphenatedPath(abs: string): string {
  return abs.replace(/^\//, "").replace(/[/.]/g, "-")
}

export function decodeHyphenatedPath(encoded: string, exists: (path: string) => boolean): string | undefined {
  if (!encoded || /^\d+$/.test(encoded) || encoded.startsWith(".")) return undefined
  const parts = encoded.split("-").filter(Boolean)
  if (parts.length < 2) return undefined
  let current = ""
  let i = 0
  while (i < parts.length) {
    let next: string | undefined
    let consumed = 0
    for (let j = parts.length; j > i; j--) {
      const slice = parts.slice(i, j)
      const dash = `${current}/${slice.join("-")}`
      const dot = `${current}/${slice.join(".")}`
      if (exists(dash)) {
        next = dash
        consumed = j - i
        break
      }
      if (slice.length > 1 && exists(dot)) {
        next = dot
        consumed = j - i
        break
      }
    }
    if (!next) {
      current = `${current}/${parts.slice(i).join("/")}`
      break
    }
    current = next
    i += consumed
  }
  return current || undefined
}

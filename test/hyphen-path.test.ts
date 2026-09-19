import { expect, test } from "bun:test"
import { decodeHyphenatedPath, encodeHyphenatedPath } from "../src/core/hyphen-path"

test("round-trips a path with a dotted segment when it exists", () => {
  const real = "/Users/alex/work/acme/app.site"
  const encoded = encodeHyphenatedPath(real)
  expect(encoded).toBe("Users-alex-work-acme-app-site")
  const exists = (p: string) =>
    ["/Users", "/Users/alex", "/Users/alex/work", "/Users/alex/work/acme", real].includes(p)
  expect(decodeHyphenatedPath(encoded, exists)).toBe(real)
})

test("skips numeric session ids", () => {
  expect(decodeHyphenatedPath("1770361863060", () => true)).toBeUndefined()
})

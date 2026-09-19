import { expect, test } from "bun:test"
import { redactInventory } from "../src/core/redact"
import type { Inventory, Item } from "../src/core/types"

const mcp = (meta: Record<string, unknown>): Item => ({
  id: "claude:mcp:/tmp/x",
  agentId: "claude",
  kind: "mcp",
  name: "context7",
  scope: { kind: "global" },
  source: "user",
  path: "/tmp/x",
  enabled: true,
  mutable: true,
  missing: false,
  meta,
})

test("redacts MCP headers and token-like keys", () => {
  const inv: Inventory = {
    scannedAt: "2026-01-01T00:00:00.000Z",
    agents: [
      {
        id: "claude",
        name: "Claude Code",
        installed: true,
        globalRoot: "/tmp",
        warnings: [],
        projects: [],
        items: [
          mcp({
            command: "npx",
            headers: { CONTEXT7_API_KEY: "test-secret-value" },
            env: { FOO: "bar" },
            otherToken: "abc",
          }),
        ],
      },
    ],
  }
  const out = redactInventory(inv)
  const meta = out.agents[0].items[0].meta as Record<string, unknown>
  expect(meta.headers).toBe("***")
  expect(meta.env).toBe("***")
  expect(meta.otherToken).toBe("***")
  expect(meta.command).toBe("npx")
  expect((inv.agents[0].items[0].meta as { headers: { CONTEXT7_API_KEY: string } }).headers.CONTEXT7_API_KEY).toBe(
    "test-secret-value",
  )
})

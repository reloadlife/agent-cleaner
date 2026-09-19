import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Hono } from "hono"
import { loadCatalog, stageOrigin } from "../core/catalog"
import { install, previewInstall } from "../core/install"
import { pathExists, readJson } from "../core/io"
import { redactInventory } from "../core/redact"
import { scan } from "../core/scan"
import { previewUninstall, uninstall } from "../core/uninstall"
import type { AgentId, ItemKind, MutationPlan, Origin, ScanOptions, Scope } from "../core/types"

type StoredPlan = {
  expires: number
  plan: MutationPlan
  apply: () => Promise<unknown>
}

export function createWebApp(opts: ScanOptions) {
  const app = new Hono()
  const plans = new Map<string, StoredPlan>()
  const runtime = { home: opts.home, appDir: opts.appDir, now: () => new Date() }

  app.get("/api/inventory", async (c) => {
    const local = c.req.query("local")
    const showSecrets = c.req.query("showSecrets") === "1"
    const inv = await scan({ ...opts, localPath: local || opts.localPath })
    return c.json(showSecrets ? inv : redactInventory(inv))
  })

  app.get("/api/catalog", async (c) => {
    return c.json(await loadCatalog(opts.appDir))
  })

  app.post("/api/plan/install", async (c) => {
    const body = await c.req.json<{
      origin: Origin
      kind: ItemKind
      name: string
      targets: { agentId: AgentId; scope: Scope }[]
      overwrite?: boolean
      mcp?: { name: string; config: Record<string, unknown> }
      hook?: { event: string; command: string }
    }>()
    const catalog = await loadCatalog(opts.appDir)
    const staged = await stageOrigin(body.origin, join(opts.appDir, "cache"), catalog)
    let mcp = body.mcp
    const mcpFile = join(staged.stagingDir, "mcp.json")
    if (!mcp && (await pathExists(mcpFile))) {
      const r = await readJson<{ name: string; config: Record<string, unknown> }>(mcpFile)
      if (r.ok) mcp = r.value
    }
    const input = {
      origin: body.origin,
      stagingDir: staged.stagingDir,
      kind: body.kind ?? staged.kind,
      name: body.name ?? staged.name,
      mcp,
      hook: body.hook,
      targets: body.targets,
      overwrite: Boolean(body.overwrite),
      yes: true,
      runtime,
    }
    const plan = await previewInstall(input)
    const planId = randomUUID()
    plans.set(planId, {
      expires: Date.now() + 5 * 60 * 1000,
      plan,
      apply: () => install(input),
    })
    return c.json({ planId, plan })
  })

  app.post("/api/plan/uninstall", async (c) => {
    const body = await c.req.json<{ itemId: string }>()
    const inv = await scan(opts)
    const item = inv.agents.flatMap((a) => a.items).find((i) => i.id === body.itemId)
    if (!item) return c.json({ error: "item not found" }, 404)
    const plan = await previewUninstall(item, runtime)
    const planId = randomUUID()
    plans.set(planId, {
      expires: Date.now() + 5 * 60 * 1000,
      plan,
      apply: () => uninstall({ item, yes: true, runtime }),
    })
    return c.json({ planId, plan })
  })

  app.post("/api/apply", async (c) => {
    const body = await c.req.json<{ planId?: string }>()
    if (!body.planId) return c.json({ error: "planId required" }, 400)
    const stored = plans.get(body.planId)
    if (!stored || stored.expires < Date.now()) return c.json({ error: "stale or missing plan" }, 400)
    plans.delete(body.planId)
    const result = await stored.apply()
    return c.json({ ok: true, result, plan: stored.plan })
  })

  return app
}

export async function serveWeb(opts: ScanOptions & { port: number; bind?: string }) {
  const api = createWebApp(opts)
  const uiRoot = join(fileURLToPath(new URL(".", import.meta.url)), "ui")
  const dist = join(fileURLToPath(new URL("../..", import.meta.url)), "dist", "ui")
  await Bun.build({
    entrypoints: [join(uiRoot, "index.html")],
    outdir: dist,
    minify: true,
  })

  const hostname = opts.bind ?? "127.0.0.1"
  const server = Bun.serve({
    hostname,
    port: opts.port,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname.startsWith("/api/")) return api.fetch(req)
      const filePath = url.pathname === "/" ? join(dist, "index.html") : join(dist, url.pathname)
      const file = Bun.file(filePath)
      if (await file.exists()) return new Response(file)
      return new Response(Bun.file(join(dist, "index.html")))
    },
  })
  process.stdout.write(`agent-cleaner web  http://${hostname}:${server.port}\n`)
  await new Promise(() => {})
}

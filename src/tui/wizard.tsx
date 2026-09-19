import { Box, Text, useInput } from "ink"
import { join } from "node:path"
import React, { useEffect, useState } from "react"
import { loadCatalog, stageOrigin } from "../core/catalog"
import { install, previewInstall } from "../core/install"
import { pathExists, readJson } from "../core/io"
import type { AgentId, CatalogItem, Inventory, ItemKind, MutationPlan, Origin, ScanOptions, Scope } from "../core/types"
import { colors } from "./theme"

type Step = "source" | "targets" | "confirm"

export function Wizard({
  opts,
  inv,
  currentAgent,
  currentScope,
  onClose,
  onDone,
}: {
  opts: ScanOptions
  inv: Inventory
  currentAgent: AgentId
  currentScope: Scope
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [step, setStep] = useState<Step>("source")
  const [sourceKind, setSourceKind] = useState<"catalog" | "git" | "local">("catalog")
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [catIdx, setCatIdx] = useState(0)
  const [typed, setTyped] = useState("")
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [plan, setPlan] = useState<MutationPlan | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void loadCatalog(opts.appDir).then(setCatalog)
    const init: Record<string, boolean> = {}
    for (const a of inv.agents.filter((a) => a.installed)) {
      init[`${a.id}|global`] = a.id === currentAgent && currentScope.kind === "global"
      if (currentScope.kind === "project") {
        init[`${a.id}|project|${currentScope.path}`] = a.id === currentAgent
      }
    }
    setChecks(init)
  }, [])

  const selected = catalog[catIdx]

  async function buildPlan(): Promise<{
    origin: Origin
    stagingDir: string
    kind: ItemKind
    name: string
    mcp?: { name: string; config: Record<string, unknown> }
  } | null> {
    let origin: Origin
    if (sourceKind === "catalog") {
      if (!selected) return null
      origin = { type: "catalog", id: selected.id }
    } else if (sourceKind === "git") {
      origin = { type: "git", url: typed.trim() }
    } else {
      origin = { type: "local", path: typed.trim() }
    }
    const staged = await stageOrigin(origin, join(opts.appDir, "cache"), catalog)
    let mcp: { name: string; config: Record<string, unknown> } | undefined
    const mcpFile = join(staged.stagingDir, "mcp.json")
    if (await pathExists(mcpFile)) {
      const r = await readJson<{ name: string; config: Record<string, unknown> }>(mcpFile)
      if (r.ok) mcp = r.value
    }
    const kind = selected?.kind ?? staged.kind
    const name = selected?.name ?? staged.name
    return { origin, stagingDir: staged.stagingDir, kind, name, mcp }
  }

  useInput(async (input, key) => {
    if (busy) return
    if (key.escape) {
      onClose()
      return
    }
    if (step === "source") {
      if (input === "1") setSourceKind("catalog")
      if (input === "2") setSourceKind("git")
      if (input === "3") setSourceKind("local")
      if (sourceKind === "catalog") {
        if (key.upArrow) setCatIdx((i) => Math.max(0, i - 1))
        if (key.downArrow) setCatIdx((i) => Math.min(catalog.length - 1, i + 1))
      } else if (key.backspace || key.delete) {
        setTyped((t) => t.slice(0, -1))
      } else if (input && !key.return && !key.ctrl && input.length === 1) {
        setTyped((t) => t + input)
      }
      if (key.return) setStep("targets")
      return
    }
    if (step === "targets") {
      const keys = Object.keys(checks)
      if (key.upArrow || key.downArrow) {
        /* keep simple: toggle by number */
      }
      const n = Number(input)
      if (n >= 1 && n <= keys.length) {
        const k = keys[n - 1]!
        setChecks((c) => ({ ...c, [k]: !c[k] }))
      }
      if (key.return) {
        setBusy(true)
        try {
          const built = await buildPlan()
          if (!built) throw new Error("pick a source")
          const targets = parseChecks(checks)
          if (targets.length === 0) throw new Error("pick at least one target")
          const p = await previewInstall({
            ...built,
            targets,
            overwrite: false,
            runtime: { home: opts.home, appDir: opts.appDir, now: () => new Date() },
          })
          setPlan(p)
          setStep("confirm")
          setError("")
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setBusy(false)
        }
      }
      return
    }
    if (step === "confirm" && key.return && plan) {
      setBusy(true)
      try {
        const built = await buildPlan()
        if (!built) throw new Error("missing source")
        await install({
          ...built,
          targets: parseChecks(checks),
          overwrite: false,
          yes: true,
          runtime: { home: opts.home, appDir: opts.appDir, now: () => new Date() },
        })
        onDone(`installed ${built.name}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setBusy(false)
      }
    }
  })

  const keys = Object.keys(checks)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.green} paddingX={1} margin={1}>
      <Text color={colors.bright}>Install</Text>
      <Text color={colors.dim}>
        {step === "source" ? "1 source" : "source"} → {step === "targets" ? "2 targets" : "targets"} →{" "}
        {step === "confirm" ? "3 confirm" : "confirm"}
      </Text>
      {step === "source" ? (
        <Box flexDirection="column">
          <Text>
            {sourceKind === "catalog" ? "●" : "○"} catalog  {sourceKind === "git" ? "●" : "○"} git url  {sourceKind === "local" ? "●" : "○"} local
            path
          </Text>
          <Text color={colors.dim}>1 catalog  2 git  3 local</Text>
          {sourceKind === "catalog"
            ? catalog.map((c, i) => (
                <Text key={c.id} inverse={i === catIdx}>
                  {c.name}  {c.kind}  {c.description}
                </Text>
              ))
            : (
              <Text>
                {sourceKind}: {typed}_
              </Text>
            )}
        </Box>
      ) : null}
      {step === "targets" ? (
        <Box flexDirection="column">
          {keys.map((k, i) => (
            <Text key={k}>
              {i + 1}. {checks[k] ? "[x]" : "[ ]"} {k}
            </Text>
          ))}
          <Text color={colors.dim}>number toggles  enter preview</Text>
        </Box>
      ) : null}
      {step === "confirm" && plan ? (
        <Box flexDirection="column">
          <Text>{plan.summary}</Text>
          {plan.ops.map((op, i) => (
            <Text key={i} color={colors.dim}>
              {op.op} {"path" in op ? op.path : ""} {"to" in op ? op.to : ""}
            </Text>
          ))}
          {plan.warnings.map((w) => (
            <Text key={w} color={colors.yellow}>
              {w}
            </Text>
          ))}
          <Text color={colors.dim}>enter apply  esc cancel</Text>
        </Box>
      ) : null}
      {error ? <Text color={colors.yellow}>{error}</Text> : null}
      {busy ? <Text color={colors.dim}>working…</Text> : null}
    </Box>
  )
}

function parseChecks(checks: Record<string, boolean>): { agentId: AgentId; scope: Scope }[] {
  const out: { agentId: AgentId; scope: Scope }[] = []
  for (const [k, on] of Object.entries(checks)) {
    if (!on) continue
    const [agentId, kind, path] = k.split("|")
    if (kind === "global") out.push({ agentId: agentId as AgentId, scope: { kind: "global" } })
    else out.push({ agentId: agentId as AgentId, scope: { kind: "project", path: path ?? "" } })
  }
  return out
}

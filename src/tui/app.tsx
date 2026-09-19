import { Box, Text, useApp, useInput, render } from "ink"
import React, { useEffect, useMemo, useState } from "react"
import { redactInventory } from "../core/redact"
import { scan } from "../core/scan"
import { uninstall } from "../core/uninstall"
import type { Inventory, Item, ItemKind, ScanOptions, Scope } from "../core/types"
import { colors } from "./theme"
import { Wizard } from "./wizard"

const KINDS: ItemKind[] = ["skill", "hook", "mcp", "plugin", "command", "rule", "subagent"]

export async function renderTui(opts: ScanOptions) {
  const instance = await render(<App opts={opts} />)
  await instance.waitUntilExit()
}

function App({ opts }: { opts: ScanOptions }) {
  const { exit } = useApp()
  const [inv, setInv] = useState<Inventory | null>(null)
  const [agentIdx, setAgentIdx] = useState(0)
  const [scopeIdx, setScopeIdx] = useState(0)
  const [kindIdx, setKindIdx] = useState(0)
  const [itemIdx, setItemIdx] = useState(0)
  const [pane, setPane] = useState<"agents" | "scopes" | "items">("agents")
  const [filter, setFilter] = useState("")
  const [searching, setSearching] = useState(false)
  const [status, setStatus] = useState("")
  const [detail, setDetail] = useState(false)
  const [wizard, setWizard] = useState(false)
  const [confirmUninstall, setConfirmUninstall] = useState(false)

  async function rescan() {
    setStatus("scanning…")
    const next = redactInventory(await scan(opts))
    setInv(next)
    setStatus("")
  }

  useEffect(() => {
    void rescan()
  }, [])

  const agent = inv?.agents[agentIdx]
  const scopes = useMemo(() => {
    if (!agent) return [] as { label: string; scope: Scope }[]
    const list: { label: string; scope: Scope }[] = [{ label: "global", scope: { kind: "global" } }]
    for (const p of agent.projects.filter((p) => p.exists)) {
      list.push({ label: p.path.split("/").pop() ?? p.path, scope: { kind: "project", path: p.path } })
    }
    return list
  }, [agent])

  const scope = scopes[scopeIdx]?.scope ?? { kind: "global" as const }
  const kind = KINDS[kindIdx]!
  const items = (agent?.items ?? []).filter((it) => {
    if (it.kind !== kind) return false
    if (scope.kind === "global") {
      if (it.scope.kind !== "global") return false
    } else if (it.scope.kind !== "project" || it.scope.path !== scope.path) {
      return false
    }
    if (filter && !`${it.name} ${it.path}`.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })
  const item = items[Math.min(itemIdx, Math.max(0, items.length - 1))]

  useInput(async (input, key) => {
    if (wizard) return
    if (searching) {
      if (key.return || key.escape) setSearching(false)
      else if (key.backspace || key.delete) setFilter((f) => f.slice(0, -1))
      else if (input && !key.ctrl) setFilter((f) => f + input)
      return
    }
    if (confirmUninstall) {
      if (input === "y" && item) {
        setConfirmUninstall(false)
        try {
          await uninstall({
            item,
            yes: true,
            runtime: { home: opts.home, appDir: opts.appDir, now: () => new Date() },
          })
          setStatus(`uninstalled ${item.name}`)
          await rescan()
        } catch (err) {
          setStatus(err instanceof Error ? err.message : String(err))
        }
      } else {
        setConfirmUninstall(false)
      }
      return
    }
    if (detail) {
      if (key.escape || input === "q") setDetail(false)
      return
    }
    if (input === "q") {
      exit()
      return
    }
    if (input === "r") {
      void rescan()
      return
    }
    if (input === "/") {
      setSearching(true)
      return
    }
    if (input === "i") {
      setWizard(true)
      return
    }
    if (input === "u" && item) {
      setConfirmUninstall(true)
      return
    }
    if (key.return && item) {
      setDetail(true)
      return
    }
    if (key.tab) {
      setPane(pane === "agents" ? "scopes" : pane === "scopes" ? "items" : "agents")
      return
    }
    if (key.leftArrow) setKindIdx((i) => (i + KINDS.length - 1) % KINDS.length)
    if (key.rightArrow) setKindIdx((i) => (i + 1) % KINDS.length)
    if (key.upArrow) {
      if (pane === "agents") setAgentIdx((i) => Math.max(0, i - 1))
      else if (pane === "scopes") setScopeIdx((i) => Math.max(0, i - 1))
      else setItemIdx((i) => Math.max(0, i - 1))
    }
    if (key.downArrow) {
      if (pane === "agents") setAgentIdx((i) => Math.min((inv?.agents.length ?? 1) - 1, i + 1))
      else if (pane === "scopes") setScopeIdx((i) => Math.min(Math.max(0, scopes.length - 1), i + 1))
      else setItemIdx((i) => Math.min(Math.max(0, items.length - 1), i + 1))
    }
  })

  if (!inv) {
    return (
      <Box padding={1}>
        <Text color={colors.dim}>scanning agents…</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" width="100%">
      <Box paddingX={1} borderStyle="single" borderColor={colors.line}>
        <Text color={colors.dim}>agent-cleaner  </Text>
        <Text color={colors.bright}>{agent?.name ?? ""}</Text>
        <Text color={colors.dim}>  {scope.kind === "global" ? "global" : scope.path}</Text>
        {status ? <Text color={colors.yellow}>  {status}</Text> : null}
      </Box>
      <Box>
        <Box width={24} flexDirection="column" borderStyle="single" borderColor={pane === "agents" || pane === "scopes" ? colors.green : colors.line}>
          {inv.agents.map((a, i) => (
            <Text key={a.id} inverse={pane === "agents" && i === agentIdx} color={a.installed ? colors.text : colors.muted}>
              {a.installed ? "● " : "○ "}
              {a.name}
            </Text>
          ))}
          <Text color={colors.muted}> </Text>
          <Text color={colors.muted}>scope</Text>
          {scopes.map((s, i) => (
            <Text
              key={s.scope.kind === "global" ? "global" : s.scope.path}
              inverse={pane === "scopes" && i === scopeIdx}
              color={colors.dim}
            >
              {s.label}
            </Text>
          ))}
        </Box>
        <Box flexGrow={1} flexDirection="column" borderStyle="single" borderColor={pane === "items" ? colors.green : colors.line}>
          <Box>
            {KINDS.map((k, i) => (
              <Text key={k} color={i === kindIdx ? colors.bright : colors.dim}>
                {k} {(agent?.items ?? []).filter((it) => it.kind === k).length}
                {i < KINDS.length - 1 ? "  " : ""}
              </Text>
            ))}
          </Box>
          {searching ? <Text color={colors.yellow}>/ {filter}</Text> : null}
          {items.length === 0 ? (
            <Text color={colors.muted}>no {kind}s</Text>
          ) : (
            items.map((it, i) => (
              <Text key={it.id} inverse={i === Math.min(itemIdx, items.length - 1)}>
                {it.name}  {it.source}
                {it.mutable ? "" : "  view only"}
              </Text>
            ))
          )}
        </Box>
      </Box>
      <Box paddingX={1}>
        <Text color={colors.dim}>tab pane  ←→ kind  / search  i install  u uninstall  enter detail  r rescan  q quit</Text>
      </Box>
      {detail && item ? <Detail item={item} inv={inv} /> : null}
      {confirmUninstall && item ? (
        <Box paddingX={1}>
          <Text color={colors.yellow}>uninstall {item.name}? y/n</Text>
        </Box>
      ) : null}
      {wizard ? (
        <Wizard
          opts={opts}
          inv={inv}
          currentAgent={agent?.id ?? "claude"}
          currentScope={scope}
          onClose={() => setWizard(false)}
          onDone={async (msg) => {
            setWizard(false)
            setStatus(msg)
            await rescan()
          }}
        />
      ) : null}
    </Box>
  )
}

function Detail({ item, inv }: { item: Item; inv: Inventory }) {
  const also = inv.agents
    .filter((a) => a.id !== item.agentId)
    .filter((a) => a.items.some((i) => i.kind === item.kind && i.name === item.name))
    .map((a) => a.name)
  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor={colors.line}>
      <Text color={colors.bright}>{item.name}</Text>
      {item.description ? <Text color={colors.dim}>{item.description}</Text> : null}
      <Text color={colors.dim}>{item.path}</Text>
      <Text color={colors.dim}>
        {item.source}
        {item.origin ? `  ${item.origin.type}` : ""}
        {item.mutable ? "" : "  view only"}
      </Text>
      {also.length ? <Text color={colors.dim}>also on {also.join(", ")}</Text> : null}
    </Box>
  )
}

import { useEffect, useMemo, useState } from "react"

type ItemKind = "skill" | "hook" | "mcp" | "plugin" | "command" | "rule" | "subagent"
type AgentId = "claude" | "cursor" | "codex" | "grok" | "opencode" | "gemini"
type Scope = { kind: "global" } | { kind: "project"; path: string }

type Item = {
  id: string
  agentId: AgentId
  kind: ItemKind
  name: string
  description?: string
  scope: Scope
  source: string
  path: string
  mutable: boolean
  missing: boolean
}

type Agent = {
  id: AgentId
  name: string
  installed: boolean
  warnings: string[]
  projects: { path: string; exists: boolean }[]
  items: Item[]
}

type Inventory = { scannedAt: string; localPath?: string; agents: Agent[] }
type CatalogItem = {
  id: string
  kind: ItemKind
  name: string
  description: string
  source: { type: string; id?: string; path?: string; url?: string }
  compatible: AgentId[]
}

const KINDS: ItemKind[] = ["skill", "hook", "mcp", "plugin", "command", "rule", "subagent"]

export function App() {
  const [inv, setInv] = useState<Inventory | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [agentId, setAgentId] = useState<AgentId>("claude")
  const [scope, setScope] = useState<Scope>({ kind: "global" })
  const [kind, setKind] = useState<ItemKind>("skill")
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<Item | null>(null)
  const [wizard, setWizard] = useState(false)
  const [error, setError] = useState("")

  async function reload() {
    const inv = await (await fetch("/api/inventory")).json()
    setInv(inv)
    setCatalog(await (await fetch("/api/catalog")).json())
  }

  useEffect(() => {
    void reload()
  }, [])

  const agent = inv?.agents.find((a) => a.id === agentId) ?? inv?.agents[0]
  const items = useMemo(() => {
    if (!agent) return []
    return agent.items.filter((it) => {
      if (it.kind !== kind) return false
      if (scope.kind === "global") {
        if (it.scope.kind !== "global") return false
      } else if (it.scope.kind !== "project" || it.scope.path !== scope.path) return false
      if (q && !`${it.name} ${it.path}`.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [agent, kind, scope, q])

  async function doUninstall(item: Item) {
    if (!item.mutable) return
    if (!confirm(`Uninstall ${item.name} from ${agent?.name}?`)) return
    const plan = await (await fetch("/api/plan/uninstall", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: item.id }),
    })).json()
    if (!plan.planId) {
      setError(plan.error ?? "could not plan uninstall")
      return
    }
    await fetch("/api/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: plan.planId }),
    })
    setSelected(null)
    await reload()
  }

  if (!inv || !agent) return <div className="empty">Scanning agents…</div>

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">Agent Cleaner</div>
        {inv.agents.map((a) => (
          <div
            key={a.id}
            className={`agent ${a.installed ? "live" : ""} ${a.id === agent.id ? "on" : ""}`}
            onClick={() => {
              setAgentId(a.id)
              setScope({ kind: "global" })
              setSelected(null)
            }}
          >
            <span className="dot" />
            {a.name}
          </div>
        ))}
        <div className="scope-label">Scope</div>
        <div className={`agent ${scope.kind === "global" ? "on" : ""}`} onClick={() => setScope({ kind: "global" })}>
          global
        </div>
        {agent.projects.filter((p) => p.exists).map((p) => (
          <div
            key={p.path}
            className={`agent ${scope.kind === "project" && scope.path === p.path ? "on" : ""}`}
            onClick={() => setScope({ kind: "project", path: p.path })}
          >
            {p.path.split("/").pop()}
          </div>
        ))}
      </aside>
      <main className="main">
        <div className="top">
          <div className="tabs">
            {KINDS.map((k) => (
              <button key={k} className={`tab ${k === kind ? "on" : ""}`} onClick={() => setKind(k)}>
                {k}s {agent.items.filter((i) => i.kind === k).length}
              </button>
            ))}
          </div>
          <div className="actions">
            <button className="ghost" onClick={() => void reload()}>
              Rescan
            </button>
            <button className="primary" onClick={() => setWizard(true)}>
              Install
            </button>
          </div>
        </div>
        <div className="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" />
        </div>
        {error ? <div className="empty warn">{error}</div> : null}
        <div className="table">
          <div className="row head">
            <span>Name</span>
            <span>Source</span>
            <span>Path</span>
            <span></span>
          </div>
          {items.length === 0 ? <div className="empty">No {kind}s in this scope.</div> : null}
          {items.map((it) => (
            <div key={it.id} className={`row ${selected?.id === it.id ? "on" : ""}`} onClick={() => setSelected(it)}>
              <span>{it.name}</span>
              <span className="muted">{it.source}{it.mutable ? "" : " · view only"}</span>
              <span className="muted">{it.path}</span>
              <span>
                {it.mutable ? (
                  <button className="danger" onClick={(e) => { e.stopPropagation(); void doUninstall(it) }}>
                    Uninstall
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        {selected ? (
          <div className="detail">
            <strong>{selected.name}</strong>
            <div className="muted">{selected.description}</div>
            <div className="muted">{selected.path}</div>
          </div>
        ) : null}
      </main>
      {wizard ? (
        <InstallModal
          catalog={catalog}
          inv={inv}
          current={agent.id}
          scope={scope}
          onClose={() => setWizard(false)}
          onDone={async () => {
            setWizard(false)
            await reload()
          }}
        />
      ) : null}
    </div>
  )
}

function InstallModal({
  catalog,
  inv,
  current,
  scope,
  onClose,
  onDone,
}: {
  catalog: CatalogItem[]
  inv: Inventory
  current: AgentId
  scope: Scope
  onClose: () => void
  onDone: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [sourceKind, setSourceKind] = useState<"catalog" | "git" | "local">("catalog")
  const [picked, setPicked] = useState(catalog[0]?.id ?? "")
  const [typed, setTyped] = useState("")
  const [targets, setTargets] = useState<Record<string, boolean>>(() => {
    const t: Record<string, boolean> = {}
    for (const a of inv.agents.filter((a) => a.installed)) t[a.id] = a.id === current
    return t
  })
  const [plan, setPlan] = useState<{ planId: string; plan: { summary: string; ops: { op: string; path?: string; to?: string }[]; warnings: string[] } } | null>(null)
  const [err, setErr] = useState("")

  const item = catalog.find((c) => c.id === picked)

  async function preview() {
    setErr("")
    const origin =
      sourceKind === "catalog"
        ? item?.source.type === "local"
          ? { type: "catalog" as const, id: item.id }
          : { type: "catalog" as const, id: picked }
        : sourceKind === "git"
          ? { type: "git" as const, url: typed }
          : { type: "local" as const, path: typed }
    const body = {
      origin,
      kind: item?.kind ?? "skill",
      name: item?.name ?? "item",
      targets: Object.entries(targets)
        .filter(([, on]) => on)
        .map(([agentId]) => ({ agentId, scope })),
    }
    const res = await fetch("/api/plan/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!json.planId) {
      setErr(json.error ?? "plan failed")
      return
    }
    setPlan(json)
    setStep(3)
  }

  async function apply() {
    if (!plan) return
    const res = await fetch("/api/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: plan.planId }),
    })
    const json = await res.json()
    if (!json.ok) {
      setErr(json.error ?? "apply failed")
      return
    }
    onDone()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Install</h2>
        <div className="steps">
          {step === 1 ? "1 source" : "source"} → {step === 2 ? "2 targets" : "targets"} → {step === 3 ? "3 confirm" : "confirm"}
        </div>
        {step === 1 ? (
          <>
            <div className="tabs">
              {(["catalog", "git", "local"] as const).map((k) => (
                <button key={k} className={`tab ${sourceKind === k ? "on" : ""}`} onClick={() => setSourceKind(k)}>
                  {k}
                </button>
              ))}
            </div>
            {sourceKind === "catalog" ? (
              <div className="list">
                {catalog.map((c) => (
                  <label key={c.id} className="check">
                    <input type="radio" checked={picked === c.id} onChange={() => setPicked(c.id)} />
                    <span>
                      {c.name} <span className="muted">{c.kind} - {c.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={sourceKind === "git" ? "https://github.com/org/repo" : "/path/to/skill"} />
            )}
            <div className="modal-actions">
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={() => setStep(2)}>Next</button>
            </div>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <div className="list">
              {inv.agents.filter((a) => a.installed).map((a) => (
                <label key={a.id} className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(targets[a.id])}
                    onChange={(e) => setTargets((t) => ({ ...t, [a.id]: e.target.checked }))}
                  />
                  {a.name} {scope.kind === "global" ? "global" : scope.path}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setStep(1)}>Back</button>
              <button className="primary" onClick={() => void preview()}>Preview</button>
            </div>
          </>
        ) : null}
        {step === 3 && plan ? (
          <>
            <div>{plan.plan.summary}</div>
            <div className="list">
              {plan.plan.ops.map((op, i) => (
                <div key={i} className="muted">{op.op} {op.path ?? op.to}</div>
              ))}
              {plan.plan.warnings.map((w) => (
                <div key={w} className="warn">{w}</div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setStep(2)}>Back</button>
              <button className="primary" onClick={() => void apply()}>Install</button>
            </div>
          </>
        ) : null}
        {err ? <div className="warn">{err}</div> : null}
      </div>
    </div>
  )
}

export type AgentId =
  | "claude"
  | "cursor"
  | "codex"
  | "grok"
  | "opencode"
  | "gemini"

export type ItemKind =
  | "skill"
  | "hook"
  | "mcp"
  | "plugin"
  | "command"
  | "rule"
  | "subagent"

export type Scope = { kind: "global" } | { kind: "project"; path: string }

export type ItemSource = "user" | "project" | "plugin" | "bundled" | "catalog"

export type Origin =
  | { type: "git"; url: string; ref?: string; subpath?: string }
  | { type: "url"; url: string }
  | { type: "local"; path: string }
  | { type: "catalog"; id: string }

export type Item = {
  id: string
  agentId: AgentId
  kind: ItemKind
  name: string
  description?: string
  scope: Scope
  source: ItemSource
  origin?: Origin
  path: string
  configPath?: string
  enabled: boolean
  mutable: boolean
  missing: boolean
  meta?: Record<string, unknown>
}

export type AgentInstance = {
  id: AgentId
  name: string
  installed: boolean
  binary?: string
  version?: string
  globalRoot: string
  warnings: string[]
  projects: { path: string; exists: boolean }[]
  items: Item[]
}

export type Inventory = {
  scannedAt: string
  localPath?: string
  agents: AgentInstance[]
}

export type ScanOptions = {
  home: string
  appDir: string
  localPath?: string
  pathDirs?: string[]
  disabledAdapters?: AgentId[]
}

export type FileOp =
  | { op: "write"; path: string; content: string }
  | { op: "copy-dir"; from: string; to: string }
  | { op: "remove"; path: string }
  | { op: "merge-json"; path: string; key: string; value: unknown }
  | { op: "unmerge-json"; path: string; key: string }
  | { op: "merge-toml"; path: string; table: string; key: string; value: unknown }
  | { op: "unmerge-toml"; path: string; table: string; key: string }

export type MutationPlan = {
  summary: string
  ops: FileOp[]
  warnings: string[]
}

export type Runtime = {
  home: string
  appDir: string
  now: () => Date
}

export type LedgerEntry = {
  id: string
  installedAt: string
  origin: Origin
  backupId: string
  targets: {
    agentId: AgentId
    kind: ItemKind
    path: string
    configPath?: string
    key?: string
  }[]
}

export type CatalogItem = {
  id: string
  kind: ItemKind
  name: string
  description: string
  source: Origin
  compatible: AgentId[]
}

export const AGENT_IDS: AgentId[] = [
  "claude",
  "cursor",
  "codex",
  "grok",
  "opencode",
  "gemini",
]

export const AGENT_NAMES: Record<AgentId, string> = {
  claude: "Claude Code",
  cursor: "Cursor",
  codex: "Codex",
  grok: "Grok",
  opencode: "OpenCode",
  gemini: "Gemini CLI",
}

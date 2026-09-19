import { join } from "node:path"
import type { AgentId } from "./types"

export function agentRoot(home: string, id: AgentId): string {
  switch (id) {
    case "claude":
      return join(home, ".claude")
    case "cursor":
      return join(home, ".cursor")
    case "codex":
      return join(home, ".codex")
    case "grok":
      return join(home, ".grok")
    case "opencode":
      return join(home, ".config", "opencode")
    case "gemini":
      return join(home, ".gemini")
  }
}

export function defaultAppDir(home: string): string {
  return join(home, ".agent-cleaner")
}

export function claudeJsonPath(home: string): string {
  return join(home, ".claude.json")
}

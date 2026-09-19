import type { AgentAdapter } from "./types"
import { claudeAdapter } from "./claude"
import { cursorAdapter } from "./cursor"
import { codexAdapter } from "./codex"
import { grokAdapter } from "./grok"
import { opencodeAdapter } from "./opencode"
import { geminiAdapter } from "./gemini"

export const adapters: AgentAdapter[] = [
  claudeAdapter,
  cursorAdapter,
  codexAdapter,
  grokAdapter,
  opencodeAdapter,
  geminiAdapter,
]

export { claudeAdapter, cursorAdapter, codexAdapter, grokAdapter, opencodeAdapter, geminiAdapter }
export type { AgentAdapter, InstallRequest } from "./types"

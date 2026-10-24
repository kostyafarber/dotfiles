/** A file Claude mentioned or touched, resolved to a path on disk. */
export type Mention = {
  /** Absolute path. */
  path: string
  /** Path as shown: relative to the repo root when inside it. */
  label: string
  /** Line to open at, when the mention carried one. */
  line?: number
  /** How it came up: named in Claude's text, or read/edited/written by a tool. */
  how: 'mentioned' | 'read' | 'edited'
}

declare module 'claude-code' {
  interface PluginState {
    'open-files': { mentions: Shaped<Mention[]> }
  }
}

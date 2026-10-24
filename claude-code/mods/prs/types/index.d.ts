/** One open pull request, as the pane lists it. */
export type Pr = {
  number: number
  title: string
  author: string
  isDraft: boolean
  /** Review requested from the user, or opened by them. */
  group: 'review' | 'mine'
  /** CI checks: failed, still running, passed. */
  checks: { failed: number; pending: number; passed: number }
}

/** A branch of the user's with no PR yet (the look skill's work-list). */
export type Work = {
  branch: string
  /** Its worktree, or null when only the branch exists. */
  path: string | null
  /** Commits ahead of origin/main. */
  ahead: number
  /** Uncommitted files in its worktree. */
  dirty: number
  age_days: number
}

/** What the pane shows, and what it is doing right now. */
export type PrList = {
  prs: Pr[]
  work: Work[]
  status: 'loading' | 'ready' | 'error'
  message?: string
  /** Page of the list shown, from 0, when it doesn't fit the pane. */
  page?: number
}

declare module 'claude-code' {
  interface PluginState {
    prs: { list: Shaped<PrList> }
  }
}

// /prs: the user's own work, in a pane: their open PRs and their branches with no PR yet (the look skill's work-list). Picking one runs the look
// skill's review-pr script: a worktree (a new local review/pr-N branch for a PR, the branch's
// own worktree otherwise) and a Rex tab with nvim on the review page, or the tab it already has.

import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { Pr, PrList, Work } from '../types'

type Api = Parameters<Hook<'command.run'>>[0]

// Row keys: 1–9, then letters, leaving n/p (pages), q (close) and r (refresh) free.
const KEYS = '123456789abcdefghijklmostuvwxyz'

const PANE = 'prs'

type Row = { kind: 'pr'; pr: Pr } | { kind: 'work'; w: Work }

// One line: anything longer than `width` ends in an ellipsis.
const cut = (text: string, width: number) => (text.length > width ? text.slice(0, Math.max(width - 1, 1)) + '…' : text)
const list = atom({ plugin: 'prs', key: 'list' } as const, { prs: [], work: [], status: 'loading' } as PrList, {
  shape: 'list-2',
})

// Whether the pane is up, so /prs toggles it. A reload forgets: /prs then just opens it.
let paneOpen = false

type GhPr = {
  number: number
  title: string
  isDraft: boolean
  author: { login: string }
  statusCheckRollup?: { conclusion?: string; state?: string; status?: string }[]
}

const FIELDS = 'number,title,isDraft,author,statusCheckRollup'

function checks(pr: GhPr): Pr['checks'] {
  const out = { failed: 0, pending: 0, passed: 0 }
  for (const c of pr.statusCheckRollup ?? []) {
    const s = (c.conclusion || c.state || c.status || '').toUpperCase()
    if (['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(s)) out.failed++
    else if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(s)) out.passed++
    else out.pending++
  }
  return out
}

async function gh($: Api, cwd: string, args: string[]): Promise<GhPr[]> {
  const r = await $.process.run(['gh', 'pr', 'list', '--json', FIELDS, '--limit', '20', ...args], {
    cwd,
    timeoutMs: 20_000,
  })
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || 'gh pr list failed')
  return JSON.parse(r.stdout) as GhPr[]
}

async function script($: Api, name: string): Promise<string> {
  const home = (await $.env.get('HOME')) ?? ''
  return home + '/.claude/skills/look/scripts/' + name
}

// Branches with no PR: slower (a few seconds), so it fills in after the PRs.
async function refreshWork($: Api, cwd: string): Promise<void> {
  try {
    const r = await $.process.run([await script($, 'work-list')], { cwd, timeoutMs: 60_000 })
    if (r.exitCode !== 0) throw new Error(r.stderr.trim() || 'work-list failed')
    const work = JSON.parse(r.stdout) as Work[]
    await update($, list, l => ({ ...l, work }))
  } catch (err) {
    await update($, list, l => ({ ...l, status: 'error' as const, message: String(err) }))
  }
}

async function refresh($: Api): Promise<void> {
  await update($, list, l => ({ ...l, status: 'loading' as const }))
  try {
    const cwd = await $.session.cwd()
    void refreshWork($, cwd)
    const mine = await gh($, cwd, ['--author', '@me'])
    const toPr = (group: Pr['group']) => (p: GhPr): Pr => ({
      number: p.number,
      title: p.title,
      author: p.author.login,
      isDraft: p.isDraft,
      group,
      checks: checks(p),
    })
    const prs = mine.map(toPr('mine'))
    await update($, list, l => ({ ...l, prs, status: 'ready' as const }))
  } catch (err) {
    await update($, list, l => ({ ...l, status: 'error' as const, message: String(err) }))
  }
}

// Opens a PR (by number) or a branch on the review page in its own Rex tab.
async function review($: Api, target: { pr: number } | { branch: string }): Promise<void> {
  const args = 'pr' in target ? [String(target.pr)] : ['--branch', target.branch]
  const name = 'pr' in target ? '#' + target.pr : target.branch
  $.ui.toast(`Opening ${name}…`)
  try {
    const r = await $.process.run([await script($, 'review-pr'), ...args], {
      cwd: await $.session.cwd(),
      timeoutMs: 120_000,
    })
    $.ui.toast(r.exitCode === 0 ? r.stdout.trim() : `${name}: ${r.stderr.trim()}`)
  } catch (err) {
    $.ui.toast(`${name}: ${String(err)}`)
  }
}

async function closePane($: Api): Promise<void> {
  paneOpen = false
  await $.ui.close({ id: PANE })
}

// /prs toggles the pane; opening it fetches the list.
const runPrs: Hook<'command.run'> = async $ => {
  if (paneOpen) {
    await closePane($)
    return {}
  }
  paneOpen = true
  await $.ui.open({ id: PANE, title: 'Pull requests', focus: true })
  void refresh($)
  return {}
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prs',
      description: 'Your open PRs and branches with no PR yet; pick one to review it in nvim',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'prs' }, runPrs)

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) paneOpen = false
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { prs, work, status, message, page = 0 } = await read($, list)
    const cols = Math.max(40, (e.viewport?.columns ?? 100) - 6)
    // Rows that fit: the viewport less two headings, two gaps, the footer and the border.
    const capacity = Math.max(3, (e.viewport?.rows ?? 24) - 8)
    const rows: Row[] = [...prs.map(pr => ({ kind: 'pr' as const, pr })), ...work.map(w => ({ kind: 'work' as const, w }))]
    const pages = Math.max(1, Math.ceil(rows.length / capacity))
    const at = Math.min(page, pages - 1)
    const shown = rows.slice(at * capacity, (at + 1) * capacity)
    const turn = (to: number) => update($, list, l => ({ ...l, page: Math.max(0, Math.min(to, pages - 1)) }))

    const prRow = (pr: Pr, key: string | undefined) => {
      const c = pr.checks
      const mark = c.failed > 0 ? '✗' + c.failed : c.pending > 0 ? '…' : c.passed > 0 ? '✓' : ''
      const tail = (mark ? ' ' + mark : '') + (pr.isDraft ? ' draft' : '')
      const title = cut('#' + pr.number + ' ' + pr.title, cols - tail.length - 3)
      return (
        <Button key={'pr' + pr.number} plain hotkey={key} onPress={() => review($, { pr: pr.number })}>
          {title}
          {c.failed > 0 && <Text color="error">{' ' + mark}</Text>}
          {c.failed === 0 && c.pending > 0 && <Text color="warning">{' ' + mark}</Text>}
          {c.failed === 0 && c.pending === 0 && c.passed > 0 && <Text color="success">{' ' + mark}</Text>}
          {pr.isDraft && <Text dimColor>{' draft'}</Text>}
        </Button>
      )
    }
    const workRow = (w: Work, key: string | undefined) => {
      const state = [w.ahead > 0 ? w.ahead + ' ahead' : '', w.dirty > 0 ? w.dirty + ' uncommitted' : '']
        .filter(Boolean)
        .join(' · ')
      const tail = ' ' + state + ' · ' + (w.age_days === 0 ? 'today' : w.age_days + 'd')
      return (
        <Button key={'work' + w.branch} plain hotkey={key} onPress={() => review($, { branch: w.branch })}>
          {cut(w.branch, cols - tail.length - 3)}
          <Text dimColor>{tail}</Text>
        </Button>
      )
    }

    const shownPrs = shown.filter(r => r.kind === 'pr')
    const shownWork = shown.filter(r => r.kind === 'work')
    let i = 0
    return (
      <Box flexDirection="column">
        {status === 'error' && <Text color="error">{message ?? 'Could not load PRs'}</Text>}
        {(shownPrs.length > 0 || at === 0) && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>Your PRs</Text>
            {prs.length === 0 && <Text dimColor>{status === 'loading' ? '  loading…' : '  none'}</Text>}
            {shownPrs.map(r => (r.kind === 'pr' ? prRow(r.pr, KEYS[i++]) : null))}
          </Box>
        )}
        {(shownWork.length > 0 || at === pages - 1) && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>In progress (no PR)</Text>
            {work.length === 0 && <Text dimColor>{status === 'loading' ? '  looking…' : '  none'}</Text>}
            {shownWork.map(r => (r.kind === 'work' ? workRow(r.w, KEYS[i++]) : null))}
          </Box>
        )}
        <Box>
          {pages > 1 && (
            <Button hotkey="p" onPress={() => turn(at - 1)}>
              Prev
            </Button>
          )}
          {pages > 1 && <Text>{' ' + (at + 1) + '/' + pages + ' '}</Text>}
          {pages > 1 && (
            <Button hotkey="n" onPress={() => turn(at + 1)}>
              Next
            </Button>
          )}
          {pages > 1 && <Text> </Text>}
          <Button hotkey="r" onPress={() => refresh($)}>
            {status === 'loading' ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Text> </Text>
          <Button role="dismiss" hotkey="q" onPress={() => closePane($)}>
            Close
          </Button>
        </Box>
      </Box>
    )
  })
}

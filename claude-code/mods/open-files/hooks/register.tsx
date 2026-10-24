// /open: open the files Claude mentions in the user's nvim.
//
// Collects every file path in Claude's replies (paths, `file:line`, bare names like
// `check-move.mjs`) plus files Claude read or edited, newest first, resolved against the
// repo's tracked files. `/open name` opens the best match; `/open` alone opens a pane of
// them with 1–9 hotkeys. Opening goes through `nvo` (the nvim in this Rex tab); with no
// nvim there, it splits one in on the left.

import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { Mention } from '../types'

type Api = Parameters<Hook<'command.run'>>[0]

// Row keys: 1–9, then letters, leaving q (close) and r (refresh) free.
const KEYS = '123456789abcdefghijklmnopstuvwxyz'

const PANE = 'open-files'
const MAX = 40
const mentions = atom({ plugin: 'open-files', key: 'mentions' } as const, [] as Mention[], {
  shape: 'mentions-1',
})

const EXT = 'ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|mdx|lua|sh|bash|zsh|yml|yaml|toml|css|html|nix|rs|py|go|sql|txt'
// A path-looking token with a known extension, and an optional :line (or :line-end / :line:col).
const TOKEN = new RegExp(
  String.raw`(?:~\/|\/|\.\.?\/)?[\w@.+-]+(?:\/[\w@.+-]+)*\.(?:${EXT})(?::(\d+)(?:[-:]\d+)?)?(?![\w/])`,
  'g',
)
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

// `git ls-files` of the repo, cached for a minute. A module variable: a reload refetches.
let tracked: { root: string; files: string[]; at: number } | undefined

const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const dirname = (p: string) => p.slice(0, Math.max(p.lastIndexOf('/'), 1))

async function repoRoot($: Api): Promise<string | undefined> {
  try {
    const r = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd: await $.session.cwd() })
    return r.exitCode === 0 ? r.stdout.trim() : undefined
  } catch {
    return undefined
  }
}

async function trackedFiles($: Api, root: string): Promise<string[]> {
  const now = await $.clock.now()
  if (tracked && tracked.root === root && now - tracked.at < 60_000) return tracked.files
  let files: string[] = []
  try {
    const r = await $.process.run(['git', 'ls-files'], { cwd: root, timeoutMs: 10_000 })
    if (r.exitCode === 0) files = r.stdout.split('\n').filter(Boolean)
  } catch {
    // Not a repo, or too slow: only absolute and existing relative paths resolve.
  }
  tracked = { root, files, at: now }
  return files
}

type Ctx = { root?: string; files: string[]; home: string }

function label(ctx: Ctx, path: string): string {
  if (ctx.root && path.startsWith(ctx.root + '/')) return path.slice(ctx.root.length + 1)
  if (path.startsWith(ctx.home + '/')) return '~' + path.slice(ctx.home.length)
  return path
}

// The files a token can mean: an absolute or ~ path if it exists, a repo-relative path, a
// path suffix of a tracked file, or a bare name matching tracked files' basenames.
async function resolve($: Api, ctx: Ctx, token: string): Promise<string[]> {
  let p = token.replace(/^\.\//, '')
  if (p.startsWith('~/')) p = ctx.home + p.slice(1)
  if (p.startsWith('/')) return (await $.fs.exists(p)) ? [p] : []
  if (!ctx.root) return []
  const matches = p.includes('/')
    ? ctx.files.filter(f => f === p || f.endsWith('/' + p))
    : ctx.files.filter(f => basename(f) === p)
  return matches.slice(0, 3).map(f => ctx.root + '/' + f)
}

async function context($: Api): Promise<Ctx> {
  const root = await repoRoot($)
  const home = (await $.env.get('HOME')) ?? ''
  return { root, files: root ? await trackedFiles($, root) : [], home }
}

// Newest first: what Claude mentioned or touched, most recent message first.
async function collect($: Api): Promise<Mention[]> {
  const ctx = await context($)
  const messages = await $.session.messages()
  const seen = new Map<string, Mention>()
  const add = (path: string, how: Mention['how'], line?: number) => {
    if (!seen.has(path)) seen.set(path, { path, label: label(ctx, path), line, how })
  }
  for (let i = messages.length - 1; i >= 0 && seen.size < MAX; i--) {
    const m = messages[i]
    if (!m || m.role !== 'assistant') continue
    for (const use of [...m.toolUses].reverse()) {
      const file = use.input.file_path
      if (typeof file !== 'string') continue
      if (EDIT_TOOLS.has(use.tool)) add(file, 'edited')
      else if (use.tool === 'Read') add(file, 'read')
    }
    for (const hit of [...m.text.matchAll(TOKEN)].reverse()) {
      const token = hit[0].replace(/:\d+(?:[-:]\d+)?$/, '')
      const line = hit[1] ? Number(hit[1]) : undefined
      for (const path of await resolve($, ctx, token)) add(path, 'mentioned', line)
    }
  }
  return [...seen.values()]
}

// Opens a file in the nvim of this Rex tab, or splits one in on the left.
async function openFile($: Api, m: Mention): Promise<void> {
  const home = (await $.env.get('HOME')) ?? ''
  const target = m.line ? `${m.path}:${m.line}` : m.path
  try {
    const r = await $.process.run([home + '/.local/bin/nvo', target], { timeoutMs: 10_000 })
    if (r.exitCode === 0) return
  } catch {
    // No nvo, or it timed out: fall through to a new split.
  }
  const session = await $.env.get('REX_SESSION')
  const block = await $.env.get('REX_BLOCK')
  if (!session || !block) {
    $.ui.toast('Not in a Rex pane: open ' + target + ' yourself')
    return
  }
  const root = await repoRoot($)
  const cwd = root && m.path.startsWith(root + '/') ? root : dirname(m.path)
  const argv = ['rex', 'split', '-s', session, '-b', block, '--split', 'left', '--ratio', '66', '-c', cwd, '--', 'nvim']
  if (m.line) argv.push('+' + m.line)
  argv.push(m.path)
  try {
    const r = await $.process.run(argv, { timeoutMs: 10_000 })
    if (r.exitCode !== 0) $.ui.toast('Could not open ' + m.label + ': ' + r.stderr.trim())
  } catch (err) {
    $.ui.toast('Could not open ' + m.label + ': ' + String(err))
  }
}

// The mention a query means: a number picks from the list; otherwise the best path match
// among mentions, then among all tracked files.
async function pick($: Api, list: Mention[], query: string): Promise<Mention | undefined> {
  if (/^\d+$/.test(query)) return list[Number(query) - 1]
  const lineMatch = query.match(/^(.*?):(\d+)$/)
  const q = (lineMatch?.[1] ?? query).toLowerCase()
  const line = lineMatch ? Number(lineMatch[2]) : undefined
  const score = (p: string) => {
    const name = basename(p).toLowerCase()
    if (name === q) return 3
    if (name.startsWith(q)) return 2
    return p.toLowerCase().includes(q) ? 1 : 0
  }
  const fromList = list
    .map(m => ({ m, s: score(m.label) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)[0]
  if (fromList) return line ? { ...fromList.m, line } : fromList.m
  const ctx = await context($)
  const file = ctx.files
    .map(f => ({ f, s: score(f) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.f.length - b.f.length)[0]
  if (!file || !ctx.root) return undefined
  const path = ctx.root + '/' + file.f
  return { path, label: file.f, line, how: 'mentioned' }
}

// Whether the pane is up, so /open toggles it. A reload forgets: /open then just opens it.
let paneOpen = false

async function closePane($: Api): Promise<void> {
  paneOpen = false
  await $.ui.close({ id: PANE })
}

// /open [query]: no query toggles the pane; otherwise opens the best match.
const runOpen: Hook<'command.run'> = async ($, e) => {
  const query = e.args.trim()
  if (!query && paneOpen) {
    await closePane($)
    return {}
  }
  const list = await collect($)
  await update($, mentions, () => list)
  if (!query) {
    paneOpen = true
    await $.ui.open({ id: PANE, title: 'Files Claude mentioned', focus: true })
    return {}
  }
  const m = await pick($, list, query)
  if (!m) {
    $.ui.toast('No file matches ' + query)
    return {}
  }
  await openFile($, m)
  return {}
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'open',
        description: 'Open a file Claude mentioned in nvim (no argument: list them)',
        argumentHint: '[name | path[:line] | n]',
        immediate: true,
      })
    } catch {
      $.ui.log('open-files: /open is taken, so the command is /files')
      await $.command.register({
        name: 'files',
        description: 'Open a file Claude mentioned in nvim (no argument: list them)',
        argumentHint: '[name | path[:line] | n]',
        immediate: true,
      })
    }
    return next(e)
  })

  on('command.run', { command: 'open' }, runOpen)
  on('command.run', { command: 'files' }, runOpen)

  // Keep the pane current as the conversation goes on.
  on('turn.complete', async ($, e, next) => {
    const list = await collect($)
    await update($, mentions, () => list)
    return next(e)
  })

  // Closed some other way (the engine's own close): the next /open opens it again.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) paneOpen = false
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = (await read($, mentions)).filter(m => !m.path.includes('/scratchpad/'))
    const room = Math.max(1, Math.min(15, (e.viewport?.rows ?? 24) - 4))
    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No files mentioned yet.</Text>}
        {list.slice(0, room).map((m, i) => {
          const dir = m.label.includes('/') ? m.label.slice(0, m.label.lastIndexOf('/')) : ''
          return (
            <Button
              key={m.path}
              plain
              hotkey={KEYS[i]}
              onPress={async () => {
                await closePane($)
                await openFile($, m)
              }}
            >
              {basename(m.label) + (m.line ? ':' + m.line : '')} <Text dimColor>{dir}</Text>
            </Button>
          )
        })}
        <Box marginTop={1}>
          <Button role="dismiss" hotkey="q" onPress={() => closePane($)}>
            Close
          </Button>
        </Box>
      </Box>
    )
  })
}

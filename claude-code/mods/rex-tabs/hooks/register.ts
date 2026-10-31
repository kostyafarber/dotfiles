// @:rex name an open Rex tab, on this machine or any Rex host, in the prompt.
//
// Typing `@:rex` (or just `@:r`) lists every open tab (a Rex window) on this machine's server and on each
// host `rex hosts` knows, as `@:rex/<host>/<tab>`. Taking one writes that ref; when the
// prompt is sent, each ref attaches the tab's ids (session, window, blocks, and the
// `rex -S` to reach it) and the last screenful of its focused pane, for Claude to read.

import type { Hook, Register } from 'claude-code'

type Api = Parameters<Hook<'prompt.submit'>>[0]

type Tab = {
  ref: string // what follows `@:rex/`, as `<host>/<session>` or `<host>/<session>/<n>`
  host: string // the host's label, or "local"
  server?: string // the `-S` value; absent for this machine's own server
  sessionId: string
  sessionLabel: string
  windowId: string
  windowLabel: string
  active: boolean
  focusedBlockId?: string
  blocks: { id: string; label: string }[]
}

const TTL = 20_000
const MAX_ROWS = 12
const CAPTURE_LINES = 80
const REF = /@:rex\/([^\s/]+\/[^\s/]+(?:\/\d+)?)/g

// Module variables: a reload just refetches.
let cache: { at: number; tabs: Tab[] } | undefined
let inflight: Promise<Tab[]> | undefined

const rex = (server: string | undefined, ...args: string[]) =>
  server ? ['rex', '-S', server, '--timeout', '3s', ...args] : ['rex', '--timeout', '3s', ...args]

async function json<T>($: Api, argv: string[]): Promise<T | undefined> {
  try {
    const r = await $.process.run(argv, { timeoutMs: 5_000 })
    return r.exitCode === 0 ? (JSON.parse(r.stdout) as T) : undefined
  } catch {
    return undefined
  }
}

const short = (id: string) => id.slice(-6)
const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tab'

type SessionsJson = { sessions: { session_id: string; label?: string }[] }
type WindowsJson = {
  active_window_id?: string
  windows: {
    window_id: string
    label?: string
    focused_block_id?: string
    layers: { blocks: { block_id: string; label?: string }[] }[]
  }[]
}

async function hostTabs($: Api, host: string, server: string | undefined): Promise<Omit<Tab, 'ref'>[]> {
  const sessions = await json<SessionsJson>($, rex(server, 'ls', '--json'))
  if (!sessions) return []
  const perSession = await Promise.all(
    sessions.sessions.map(async s => {
      const view = await json<WindowsJson>($, rex(server, 'window', 'ls', '-s', s.session_id, '--json'))
      return Promise.all((view?.windows ?? []).map(async w => ({
        host,
        server,
        sessionId: s.session_id,
        sessionLabel: s.label ?? short(s.session_id),
        windowId: w.window_id,
        windowLabel: await tabName($, server, s.session_id, w),
        active: w.window_id === view?.active_window_id,
        focusedBlockId: w.focused_block_id,
        blocks: w.layers.flatMap(l => l.blocks.map(b => ({ id: b.block_id, label: b.label ?? '' }))),
      })))
    }),
  )
  return perSession.flat()
}

// The name Rex's sidebar shows: a label you gave the tab, else its focused pane's title
// (what Claude Code or the shell set), else the default `Window <id>` label.
async function tabName(
  $: Api,
  server: string | undefined,
  sessionId: string,
  w: WindowsJson['windows'][number],
): Promise<string> {
  const fallback = w.label ?? 'Window ' + w.window_id.slice(-8)
  if (w.label && w.label !== 'Window ' + w.window_id.slice(-8)) return w.label
  if (!w.focused_block_id) return fallback
  const t = await json<{ title?: string }>(
    $,
    rex(server, 'api', 'call', '-s', sessionId, 'com.superlogical.terminal.title', JSON.stringify({ block_id: w.focused_block_id })),
  )
  return t?.title?.trim() || fallback
}

type WhoamiJson = { instance_id?: string }
type HostsJson = { hosts: { host: { label: string } }[] }

// Every tab on this machine's server and on each reachable host. A host that is this
// machine's own server (same instance) is listed once, under its label.
async function fetchTabs($: Api): Promise<Tab[]> {
  const [me, hosts] = await Promise.all([
    json<WhoamiJson>($, rex(undefined, 'whoami', '--json')),
    json<HostsJson>($, ['rex', 'hosts', '--json']),
  ])
  const labels = [...new Set((hosts?.hosts ?? []).map(h => h.host.label))]
  const ids = await Promise.all(labels.map(l => json<WhoamiJson>($, rex(l, 'whoami', '--json'))))
  const self = labels.find((_, i) => me?.instance_id && ids[i]?.instance_id === me.instance_id)
  const remotes = labels.filter((l, i) => l !== self && ids[i] && ids[i]?.instance_id !== me?.instance_id)

  const groups = await Promise.all([
    hostTabs($, self ?? 'local', undefined),
    ...remotes.map(l => hostTabs($, l, l)),
  ])

  // Refs are `<host>/<session label>`, plus the tab's place in the session (`/2`) when the
  // session has more than one tab. Tabs arrive in window order, per session.
  const tabs = groups.flat()
  const key = (t: Omit<Tab, 'ref'>) => t.host + '/' + slug(t.sessionLabel)
  const total = new Map<string, number>()
  for (const t of tabs) total.set(key(t), (total.get(key(t)) ?? 0) + 1)
  const seen = new Map<string, number>()
  return tabs.map(t => {
    const n = (seen.get(key(t)) ?? 0) + 1
    seen.set(key(t), n)
    return { ...t, ref: (total.get(key(t)) ?? 0) > 1 ? key(t) + '/' + n : key(t) }
  })
}

function refresh($: Api): Promise<Tab[]> {
  inflight ??= fetchTabs($)
    .then(async tabs => {
      cache = { at: await $.clock.now(), tabs }
      return tabs
    })
    .finally(() => {
      inflight = undefined
    })
  return inflight
}

// The cached tabs, refetched in the background once stale; awaited only when there are none.
async function tabs($: Api): Promise<Tab[]> {
  if (!cache) return refresh($)
  if ((await $.clock.now()) - cache.at > TTL) void refresh($).catch(() => {})
  return cache.tabs
}

function matches(t: Tab, query: string): boolean {
  const hay = `${t.ref} ${t.host} ${t.sessionLabel} ${t.windowLabel}`.toLowerCase()
  return query
    .toLowerCase()
    .split(/[\s/:]+/)
    .filter(Boolean)
    .every(w => hay.includes(w))
}

async function describe($: Api, t: Tab): Promise<string> {
  const reach = t.server ? `rex -S ${t.server}` : 'rex'
  const lines = [
    `Rex tab @:rex/${t.ref} — "${t.windowLabel}" in session "${t.sessionLabel}" on ${t.server ? `host ${t.server}` : 'this machine'}.`,
    `session: ${t.sessionId}`,
    `window: ${t.windowId}${t.active ? ' (the session’s active tab)' : ''}`,
    'panes:',
    ...t.blocks.map(b => `  ${b.id} ${b.label}${b.id === t.focusedBlockId ? ' (focused)' : ''}`),
    `Reach it with \`${reach} capture -s ${t.sessionId} -b <pane>\`, \`${reach} send …\`, and so on.`,
  ]
  if (t.focusedBlockId) {
    try {
      const r = await $.process.run(
        rex(t.server, 'capture', '-s', t.sessionId, '-b', t.focusedBlockId, '--trim', '--unwrap'),
        { timeoutMs: 5_000 },
      )
      if (r.exitCode === 0) {
        const screen = r.stdout.split('\n').slice(-CAPTURE_LINES).join('\n')
        lines.push(`Last ${CAPTURE_LINES} lines of the focused pane:`, '```', screen, '```')
      }
    } catch {
      // No capture: the ids are still there to reach it.
    }
  }
  return lines.join('\n')
}

export const register: Register = on => {
  // Warm the cache so the first `@` lists right away.
  on('session.start', async ($, e, next) => {
    void refresh($).catch(() => {})
    return next(e)
  })

  // Only on `@:`: the engine draws its own file rows first for a bare `@` and a plugin
  // can't rank beneath them, so tabs get a prefix no path starts with.
  on('prompt.autocomplete', { token: /^@:/ }, async ($, e, next) => {
    const below = await next(e)
    // `@:`, `@:r`, `@:re`, `@:rex` and `@:rex/` list every tab; what follows `@:rex/` narrows it.
    const rest = e.token.slice(2)
    if (rest && !'rex'.startsWith(rest) && !rest.startsWith('rex')) return below
    const query = rest.startsWith('rex') ? rest.slice(3).replace(/^\//, '') : ''
    const rows = (await tabs($))
      .filter(t => matches(t, query))
      .slice(0, MAX_ROWS)
      .map(t => ({
        text: `@:rex/${t.ref} `,
        label: `@:rex/${t.ref}`,
        description: t.windowLabel,
      }))
    return { suggestions: [...below.suggestions, ...rows] }
  })

  on('prompt.submit', async ($, e, next) => {
    const refs = [...e.text.matchAll(REF)].map(m => m[1] ?? '')
    if (refs.length === 0) return next(e)
    let list = cache?.tabs ?? []
    if (refs.some(r => !list.find(t => t.ref === r))) list = await refresh($).catch(() => list)
    const found = [...new Set(refs)].map(r => list.find(t => t.ref === r)).filter((t): t is Tab => !!t)
    if (found.length === 0) return next(e)
    const blocks = await Promise.all(found.map(t => describe($, t)))
    return next({ ...e, context: [...(e.context ?? []), ...blocks] })
  }).catch(($, e, next) => next(e))
}

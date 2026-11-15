// /fork-pane (the built-in /fork owns that name): open a fork of this session in a new Rex pane below this one. The mod
// answers the command itself, so no model turn runs; `immediate` lets it run
// while a turn is still streaming. Extra args go to the forked claude.

import type { Register } from 'claude-code'

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'fork-pane',
      description: 'Fork this session into a new Rex pane below',
      argumentHint: '[claude args]',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'fork-pane' }, async ($, e) => {
    const block = await $.env.get('REX_BLOCK')
    if (!block) return { text: 'fork-pane: not inside a Rex pane' }
    const rexSession = await $.env.get('REX_SESSION')
    const id = await $.session.id()
    const cwd = await $.session.cwd()
    const extra = e.args.trim() ? e.args.trim().split(/\s+/) : []

    const argv = ['rex', 'split', '--split=below', '-b', block]
    if (rexSession) argv.push('-s', rexSession)
    argv.push('-c', cwd, '--label', `fork-${id.slice(0, 8)}`, '--')
    argv.push('claude', '--resume', id, '--fork-session', ...extra)

    const r = await $.process.run(argv, { timeoutMs: 15_000 })
    if (r.exitCode !== 0) return { text: `fork-pane: rex split failed: ${r.stderr.trim() || r.stdout.trim()}` }
    return { text: `Forked into a new pane below (fork-${id.slice(0, 8)})` }
  })
}

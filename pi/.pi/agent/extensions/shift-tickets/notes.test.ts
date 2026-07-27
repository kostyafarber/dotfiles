import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import {
	isShiftRemote,
	isShiftTicketEnvironment,
	parseTicketMarkers,
	parseTicketNote,
	ticketMarker,
	ticketMarkerMatches,
} from './notes.ts'

test('parses frontmatter metadata and the first heading', () => {
	const note = parseTicketNote(
		'/vault/ticket.md',
		'ticket.md',
		'---\nstatus: Todo\ntype: Architecture\n---\n# Async Bridge Architecture\n\nBody'
	)

	assert.equal(note.title, 'Async Bridge Architecture')
	assert.equal(note.status, 'Todo')
	assert.equal(note.noteType, 'Architecture')
})

test('parses plain ticket metadata and falls back to the filename', () => {
	const note = parseTicketNote(
		'/vault/Ticket - Example.md',
		'Ticket - Example.md',
		'Status: Ready\n\nBody'
	)

	assert.equal(note.title, 'Ticket - Example')
	assert.equal(note.status, 'Ready')
	assert.equal(note.noteType, undefined)
})

test('creates and finds compact ticket markers in draft order', () => {
	assert.equal(ticketMarker(3), '[Ticket 3]')
	assert.deepEqual(parseTicketMarkers('[Ticket 2] then [Ticket 1] and [Ticket 2]'), [
		'[Ticket 2]',
		'[Ticket 1]',
	])
	assert.deepEqual(ticketMarkerMatches('x [Ticket 4] y'), [
		{ marker: '[Ticket 4]', start: 2, end: 12 },
	])
})

test('recognizes Shift HTTPS and SSH remotes only', () => {
	assert.equal(isShiftRemote('https://github.com/shift-editor/shift.git\n'), true)
	assert.equal(isShiftRemote('git@github.com:shift-editor/shift.git'), true)
	assert.equal(isShiftRemote('ssh://git@github.com/shift-editor/shift.git'), true)
	assert.equal(isShiftRemote('https://github.com/example/shift.git'), false)
})

test('stays inactive when the local Obsidian vault is missing', async () => {
	let execCalled = false
	const pi = {
		exec: async () => {
			execCalled = true
			return { code: 0, stdout: 'https://github.com/shift-editor/shift.git', stderr: '' }
		},
	} as unknown as ExtensionAPI

	assert.equal(await isShiftTicketEnvironment(pi, '/repo', join(tmpdir(), 'missing-shift-vault')), false)
	assert.equal(execCalled, false)
})

test('activates only when the vault exists and the Git remote is Shift', async () => {
	const vault = await mkdtemp(join(tmpdir(), 'shift-ticket-vault-'))
	try {
		const remotePi = (remote: string) =>
			({
				exec: async () => ({ code: 0, stdout: remote, stderr: '' }),
			}) as unknown as ExtensionAPI

		assert.equal(
			await isShiftTicketEnvironment(
				remotePi('https://github.com/example/shift.git'),
				'/repo',
				vault
			),
			false
		)
		assert.equal(
			await isShiftTicketEnvironment(
				remotePi('https://github.com/shift-editor/shift.git'),
				'/repo',
				vault
			),
			true
		)
	} finally {
		await rm(vault, { recursive: true, force: true })
	}
})

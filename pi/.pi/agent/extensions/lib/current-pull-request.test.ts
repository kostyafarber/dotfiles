import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { resolveCurrentPullRequest } from './current-pull-request.ts'

type CommandResult = { code: number; stdout: string; stderr: string }

function piWithResults(results: CommandResult[]): ExtensionAPI {
	return {
		exec: async () => {
			const result = results.shift()
			if (!result) throw new Error('Unexpected command')
			return result
		},
	} as ExtensionAPI
}

test('resolves the single open pull request for the current branch', async () => {
	const pi = piWithResults([
		{ code: 0, stdout: 'feature/current-pr\n', stderr: '' },
		{ code: 0, stdout: 'shift-editor/shift\n', stderr: '' },
		{
			code: 0,
			stdout: JSON.stringify([
				{
					number: 312,
					title: 'Add current PR reference',
					url: 'https://github.com/shift-editor/shift/pull/312',
					headRefName: 'feature/current-pr',
				},
			]),
			stderr: '',
		},
	])

	assert.deepEqual(await resolveCurrentPullRequest(pi, '/repo'), {
		number: 312,
		title: 'Add current PR reference',
		url: 'https://github.com/shift-editor/shift/pull/312',
		repo: 'shift-editor/shift',
		headRefName: 'feature/current-pr',
	})
})

test('returns null when the branch has no open pull request', async () => {
	const pi = piWithResults([
		{ code: 0, stdout: 'main\n', stderr: '' },
		{ code: 0, stdout: 'shift-editor/shift\n', stderr: '' },
		{ code: 0, stdout: '[]\n', stderr: '' },
	])

	assert.equal(await resolveCurrentPullRequest(pi, '/repo'), null)
})

test('returns null for a detached head without querying GitHub', async () => {
	const pi = piWithResults([{ code: 0, stdout: '', stderr: '' }])

	assert.equal(await resolveCurrentPullRequest(pi, '/repo'), null)
})

test('rejects ambiguous branch pull requests', async () => {
	const pi = piWithResults([
		{ code: 0, stdout: 'feature/current-pr\n', stderr: '' },
		{ code: 0, stdout: 'shift-editor/shift\n', stderr: '' },
		{
			code: 0,
			stdout: JSON.stringify([
				{ number: 311, title: 'First', url: 'https://example.com/311', headRefName: 'feature/current-pr' },
				{ number: 312, title: 'Second', url: 'https://example.com/312', headRefName: 'feature/current-pr' },
			]),
			stderr: '',
		},
	])

	await assert.rejects(
		resolveCurrentPullRequest(pi, '/repo'),
		/Multiple open pull requests use branch feature\/current-pr/
	)
})

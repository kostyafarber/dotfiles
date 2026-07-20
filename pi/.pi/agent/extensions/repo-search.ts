import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
	truncateLine,
} from '@earendil-works/pi-coding-agent'
import { Text } from '@earendil-works/pi-tui'
import { Type } from 'typebox'

const DEFAULT_MAX_MATCHES = 100
const SEARCH_TIMEOUT_MS = 60_000

const RepoSearchParams = Type.Object({
	repo: Type.String({
		description: 'Public GitHub repository as owner/name or a github.com URL',
	}),
	query: Type.String({ description: 'ripgrep regular expression or fixed string' }),
	path: Type.Optional(
		Type.String({
			description:
				'Repository-relative directory to sparse-checkout and search. Strongly recommended for large repos.',
		})
	),
	ref: Type.Optional(
		Type.String({ description: 'Branch or tag to search (default: repository default branch)' })
	),
	glob: Type.Optional(Type.String({ description: "Optional ripgrep glob, for example '*.rs'" })),
	fixedString: Type.Optional(
		Type.Boolean({ description: 'Treat query literally instead of as a regex' })
	),
	ignoreCase: Type.Optional(Type.Boolean({ description: 'Search case-insensitively' })),
	maxMatches: Type.Optional(
		Type.Integer({
			minimum: 1,
			maximum: 500,
			description: `Maximum matching lines to return (default: ${DEFAULT_MAX_MATCHES})`,
		})
	),
	cleanup: Type.Optional(
		Type.Boolean({
			description:
				'Delete the temporary checkout immediately after searching (default: true). Set false only when follow-up local reads are needed; retained checkouts are deleted on session shutdown or by repo_cleanup.',
		})
	),
})

type SearchMatch = {
	path: string
	line: number
	column: number
	text: string
}

type RepoSearchDetails = {
	repo: string
	commit: string
	searchPath: string
	matchCount: number
	limited: boolean
	checkoutPath?: string
}

function parseRepo(input: string): { slug: string; cloneUrl: string } {
	let value = input.trim().replace(/\/$/, '')
	value = value
		.replace(/^https:\/\/github\.com\//, '')
		.replace(/^http:\/\/github\.com\//, '')
		.replace(/^git@github\.com:/, '')
		.replace(/^github\.com\//, '')
		.replace(/\.git$/, '')

	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
		throw new Error(`Invalid GitHub repository: ${input}. Expected owner/name or a github.com URL.`)
	}

	return { slug: value, cloneUrl: `https://github.com/${value}.git` }
}

function normalizeRelativePath(input: string | undefined): string {
	if (!input || input.trim() === '' || input.trim() === '.') return '.'
	const value = input.trim().replace(/^\.\//, '').replace(/\/$/, '')
	if (
		value.startsWith('/') ||
		value.startsWith('-') ||
		value.includes('\\') ||
		value.includes('\0') ||
		value.split('/').some((part) => part === '..' || part === '.git')
	) {
		throw new Error(`Invalid repository-relative path: ${input}`)
	}
	return value
}

function validateRef(ref: string | undefined): string | undefined {
	if (!ref) return undefined
	const value = ref.trim()
	if (!value || value.startsWith('-') || /[\0\r\n]/.test(value)) {
		throw new Error(`Invalid git ref: ${ref}`)
	}
	return value
}

function githubBlobUrl(repo: string, commit: string, path: string, line: number): string {
	const encodedPath = path.split('/').map(encodeURIComponent).join('/')
	return `https://github.com/${repo}/blob/${commit}/${encodedPath}#L${line}`
}

async function runRipgrep(
	cwd: string,
	args: string[],
	maxMatches: number,
	signal: AbortSignal | undefined
): Promise<{ matches: SearchMatch[]; limited: boolean }> {
	return new Promise((resolve, reject) => {
		const child = spawn('rg', args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
		const matches: SearchMatch[] = []
		let stdoutBuffer = ''
		let stderr = ''
		let limited = false
		let timedOut = false
		let aborted = false
		let settled = false

		const finish = (fn: () => void) => {
			if (settled) return
			settled = true
			clearTimeout(timeout)
			signal?.removeEventListener('abort', onAbort)
			fn()
		}

		const processLine = (line: string) => {
			if (!line.trim() || limited) return
			let event: any
			try {
				event = JSON.parse(line)
			} catch {
				return
			}
			if (event.type !== 'match') return

			const data = event.data
			const path = data?.path?.text
			const text = data?.lines?.text
			const lineNumber = data?.line_number
			if (typeof path !== 'string' || typeof text !== 'string' || typeof lineNumber !== 'number')
				return

			const firstSubmatch = data.submatches?.[0]
			matches.push({
				path,
				line: lineNumber,
				column: typeof firstSubmatch?.start === 'number' ? firstSubmatch.start + 1 : 1,
				text: text.replace(/[\r\n]+$/, ''),
			})

			if (matches.length >= maxMatches) {
				limited = true
				child.kill('SIGTERM')
			}
		}

		child.stdout.on('data', (chunk) => {
			stdoutBuffer += chunk.toString()
			const lines = stdoutBuffer.split('\n')
			stdoutBuffer = lines.pop() ?? ''
			for (const line of lines) processLine(line)
		})
		child.stderr.on('data', (chunk) => {
			stderr += chunk.toString()
		})

		const onAbort = () => {
			aborted = true
			child.kill('SIGTERM')
		}
		if (signal?.aborted) onAbort()
		else signal?.addEventListener('abort', onAbort, { once: true })

		const timeout = setTimeout(() => {
			timedOut = true
			child.kill('SIGTERM')
		}, SEARCH_TIMEOUT_MS)

		child.once('error', (error) => finish(() => reject(error)))
		child.once('close', (code) => {
			if (stdoutBuffer) processLine(stdoutBuffer)
			finish(() => {
				if (aborted) return reject(new Error('repo_search cancelled'))
				if (timedOut)
					return reject(new Error(`ripgrep timed out after ${SEARCH_TIMEOUT_MS / 1000}s`))
				if (!limited && code !== 0 && code !== 1) {
					return reject(new Error(stderr.trim() || `ripgrep exited with code ${code}`))
				}
				resolve({ matches, limited })
			})
		})
	})
}

export default function (pi: ExtensionAPI) {
	const activeWorkspaces = new Set<string>()

	const cleanupWorkspace = async (workspace: string) => {
		activeWorkspaces.delete(workspace)
		await rm(workspace, { recursive: true, force: true })
	}

	const cleanupAll = async () => {
		const workspaces = [...activeWorkspaces]
		await Promise.allSettled(workspaces.map(cleanupWorkspace))
		return workspaces.length
	}

	pi.registerTool({
		name: 'repo_search',
		label: 'Repository search',
		description: `Search a known public GitHub repository by creating a temporary shallow, blob-filtered, optionally sparse checkout and running ripgrep locally. This avoids GitHub's code-search API limit. Results are capped at 500 matches and ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}. Temporary files are deleted after each search by default.`,
		promptSnippet:
			'Search a known public GitHub repository with a temporary sparse clone and local ripgrep',
		promptGuidelines: [
			'Use repo_search instead of gh search code when the GitHub repository is known.',
			'Give repo_search the narrowest known path and glob so it fetches as little repository data as possible.',
			'Keep repo_search cleanup enabled unless follow-up local file reads are necessary; call repo_cleanup after retained checkouts are no longer needed.',
		],
		parameters: RepoSearchParams,

		async execute(_toolCallId, params, signal) {
			const { slug, cloneUrl } = parseRepo(params.repo)
			const searchPath = normalizeRelativePath(params.path)
			const ref = validateRef(params.ref)
			const maxMatches = params.maxMatches ?? DEFAULT_MAX_MATCHES
			const cleanup = params.cleanup ?? true
			const workspace = await mkdtemp(join(tmpdir(), 'pi-repo-search-'))
			const checkout = join(workspace, 'repo')
			activeWorkspaces.add(workspace)
			let succeeded = false

			try {
				const cloneArgs = ['clone', '--quiet', '--depth=1', '--filter=blob:none']
				if (searchPath !== '.') cloneArgs.push('--sparse')
				if (ref) cloneArgs.push('--branch', ref)
				cloneArgs.push(cloneUrl, checkout)

				const cloneResult = await pi.exec('git', cloneArgs, { signal, timeout: 120_000 })
				if (cloneResult.code !== 0) {
					throw new Error(
						cloneResult.stderr.trim() || `git clone exited with code ${cloneResult.code}`
					)
				}

				if (searchPath !== '.') {
					const sparseResult = await pi.exec(
						'git',
						['-C', checkout, 'sparse-checkout', 'set', '--cone', searchPath],
						{ signal, timeout: 120_000 }
					)
					if (sparseResult.code !== 0) {
						throw new Error(
							sparseResult.stderr.trim() ||
								`git sparse-checkout exited with code ${sparseResult.code}`
						)
					}
				}

				const commitResult = await pi.exec('git', ['-C', checkout, 'rev-parse', 'HEAD'], {
					signal,
					timeout: 5_000,
				})
				if (commitResult.code !== 0) {
					throw new Error(commitResult.stderr.trim() || 'Unable to resolve checkout commit')
				}
				const commit = commitResult.stdout.trim()

				const rgArgs = ['--json', '--color=never']
				if (params.fixedString) rgArgs.push('--fixed-strings')
				if (params.ignoreCase) rgArgs.push('--ignore-case')
				if (params.glob) rgArgs.push('--glob', params.glob)
				rgArgs.push('--', params.query, searchPath)

				const { matches, limited } = await runRipgrep(checkout, rgArgs, maxMatches, signal)
				const lines: string[] = [
					`Repository: ${slug}`,
					`Commit: ${commit}`,
					`Path: ${searchPath}`,
					`Matches: ${matches.length}${limited ? ` (limited to ${maxMatches})` : ''}`,
				]

				if (matches.length === 0) {
					lines.push('', 'No matches found.')
				} else {
					lines.push('')
					for (const match of matches) {
						lines.push(
							`${match.path}:${match.line}:${match.column}: ${truncateLine(match.text, 1_000).text}`
						)
						lines.push(`  ${githubBlobUrl(slug, commit, match.path, match.line)}`)
					}
				}

				if (!cleanup) {
					lines.push('', `Temporary checkout retained until cleanup: ${checkout}`)
				}

				const formatted = truncateHead(lines.join('\n'), {
					maxBytes: DEFAULT_MAX_BYTES,
					maxLines: DEFAULT_MAX_LINES,
				})
				let text = formatted.content
				if (formatted.truncated) {
					if (cleanup) {
						text +=
							'\n\n[Output truncated. Rerun with a narrower path, glob, query, or maxMatches.]'
					} else {
						const fullOutputPath = join(workspace, 'results.txt')
						await writeFile(fullOutputPath, lines.join('\n'), 'utf8')
						text += `\n\n[Output truncated. Full results: ${fullOutputPath}]`
					}
				}

				succeeded = true
				const details: RepoSearchDetails = {
					repo: slug,
					commit,
					searchPath,
					matchCount: matches.length,
					limited,
					checkoutPath: cleanup ? undefined : checkout,
				}
				return { content: [{ type: 'text', text }], details }
			} finally {
				if (cleanup || !succeeded) await cleanupWorkspace(workspace)
			}
		},

		renderCall(args, theme) {
			let text = theme.fg('toolTitle', theme.bold('repo_search '))
			text += theme.fg('accent', args.repo)
			text += theme.fg('muted', ` /${args.path ?? ''}`)
			text += `\n${theme.fg('dim', args.query)}`
			return new Text(text, 0, 0)
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as RepoSearchDetails | undefined
			if (!details) {
				const content = result.content[0]
				return new Text(content?.type === 'text' ? content.text : 'Search failed', 0, 0)
			}
			let text = theme.fg('success', `${details.matchCount} matches`)
			if (details.limited) text += theme.fg('warning', ' (limited)')
			text += theme.fg('muted', ` in ${details.repo}/${details.searchPath}`)
			if (details.checkoutPath) text += `\n${theme.fg('dim', `Retained: ${details.checkoutPath}`)}`
			if (expanded) {
				const content = result.content[0]
				if (content?.type === 'text') text += `\n${content.text}`
			}
			return new Text(text, 0, 0)
		},
	})

	pi.registerTool({
		name: 'repo_cleanup',
		label: 'Repository cleanup',
		description: 'Delete every temporary checkout retained by repo_search in this Pi session.',
		parameters: Type.Object({}),
		async execute() {
			const count = await cleanupAll()
			return {
				content: [{ type: 'text', text: `Deleted ${count} temporary repo_search checkout(s).` }],
				details: { count },
			}
		},
	})

	pi.registerCommand('repo-clean', {
		description: 'Delete temporary checkouts retained by repo_search',
		handler: async (_args, ctx) => {
			const count = await cleanupAll()
			ctx.ui.notify(`Deleted ${count} temporary repo_search checkout(s).`, 'info')
		},
	})

	pi.on('session_shutdown', async () => {
		await cleanupAll()
	})
}

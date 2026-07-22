import type { ExtensionAPI, Theme } from '@earendil-works/pi-coding-agent'
import {
	CURSOR_MARKER,
	type Focusable,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	type TUI,
} from '@earendil-works/pi-tui'

const MAX_ISSUES = 100
const MAX_VISIBLE_ISSUES = 12
const GH_TIMEOUT_MS = 15_000
const SEARCH_DEBOUNCE_MS = 300

type GitHubIssue = {
	number: number
	title: string
	url: string
	updatedAt: string
	labels: Array<{ name: string }>
	assignees: Array<{ login: string }>
}

type RepoResolution = { ok: true; repo: string } | { ok: false; error: string }

function cleanText(value: string): string {
	return value
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function parseIssues(stdout: string): GitHubIssue[] {
	const value: unknown = JSON.parse(stdout)
	if (!Array.isArray(value)) throw new Error('Expected an array from gh issue list')

	return value.map((item) => {
		if (
			typeof item !== 'object' ||
			item === null ||
			typeof (item as GitHubIssue).number !== 'number' ||
			typeof (item as GitHubIssue).title !== 'string' ||
			typeof (item as GitHubIssue).url !== 'string' ||
			typeof (item as GitHubIssue).updatedAt !== 'string'
		) {
			throw new Error('Unexpected issue data from gh issue list')
		}

		const issue = item as GitHubIssue
		return {
			number: issue.number,
			title: cleanText(issue.title),
			url: issue.url,
			updatedAt: issue.updatedAt,
			labels: Array.isArray(issue.labels)
				? issue.labels
						.filter((label) => label && typeof label.name === 'string')
						.map((label) => ({ name: cleanText(label.name) }))
				: [],
			assignees: Array.isArray(issue.assignees)
				? issue.assignees
						.filter((assignee) => assignee && typeof assignee.login === 'string')
						.map((assignee) => ({ login: cleanText(assignee.login) }))
				: [],
		}
	})
}

async function resolveRepo(pi: ExtensionAPI, cwd: string): Promise<RepoResolution> {
	const result = await pi.exec(
		'gh',
		['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
		{ cwd, timeout: GH_TIMEOUT_MS }
	)

	if (result.code !== 0) {
		return {
			ok: false,
			error:
				cleanText(result.stderr) || 'Unable to resolve a GitHub repository from this directory',
		}
	}

	const repo = result.stdout.trim()
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
		return { ok: false, error: 'This directory is not connected to a GitHub repository' }
	}

	return { ok: true, repo }
}

function filterIssues(issues: GitHubIssue[], query: string): GitHubIssue[] {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
	if (terms.length === 0) return issues

	return issues.filter((issue) => {
		const searchable = [
			String(issue.number),
			issue.title,
			...issue.labels.map((label) => label.name),
			...issue.assignees.map((assignee) => assignee.login),
		]
			.join(' ')
			.toLowerCase()
		return terms.every((term) => searchable.includes(term))
	})
}

function relativeTime(value: string): string {
	const timestamp = Date.parse(value)
	if (!Number.isFinite(timestamp)) return ''

	const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000))
	if (seconds < 60) return 'now'
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h`
	const days = Math.floor(hours / 24)
	if (days < 30) return `${days}d`
	const months = Math.floor(days / 30)
	if (months < 12) return `${months}mo`
	return `${Math.floor(months / 12)}y`
}

class GitHubIssuesComponent implements Focusable {
	focused = false

	private allIssues: GitHubIssue[] = []
	private issues: GitHubIssue[] = []
	private selected = 0
	private scrollOffset = 0
	private searchMode = false
	private query = ''
	private loading = true
	private error: string | undefined
	private openingIssue: number | undefined
	private requestId = 0
	private searchTimer: ReturnType<typeof setTimeout> | undefined
	private disposed = false

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly pi: ExtensionAPI,
		private readonly cwd: string,
		private readonly repo: string,
		private readonly done: (issue: GitHubIssue | undefined) => void
	) {
		void this.loadIssues('')
	}

	private async loadIssues(query: string): Promise<void> {
		const requestId = ++this.requestId
		this.loading = true
		this.error = undefined
		this.tui.requestRender()

		const args = [
			'issue',
			'list',
			'--repo',
			this.repo,
			'--state',
			'open',
			'--limit',
			String(MAX_ISSUES),
			'--json',
			'number,title,url,updatedAt,labels,assignees',
		]
		if (query) args.push('--search', query)

		const result = await this.pi.exec('gh', args, { cwd: this.cwd, timeout: GH_TIMEOUT_MS })
		if (this.disposed || requestId !== this.requestId) return

		this.loading = false
		if (result.code !== 0) {
			this.error = cleanText(result.stderr) || `gh issue list exited with code ${result.code}`
			this.tui.requestRender()
			return
		}

		try {
			const issues = parseIssues(result.stdout)
			if (!query) this.allIssues = issues
			this.issues = issues
			this.query = query
			this.selected = 0
			this.scrollOffset = 0
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Unable to parse issues'
		}
		this.tui.requestRender()
	}

	private selectedIssue(): GitHubIssue | undefined {
		return this.issues[this.selected]
	}

	private updateSearch(query: string): void {
		this.query = query
		this.error = undefined
		this.selected = 0
		this.scrollOffset = 0
		this.requestId++
		if (this.searchTimer) clearTimeout(this.searchTimer)
		this.searchTimer = undefined

		const trimmedQuery = query.trim()
		const issuePool = [...this.issues, ...this.allIssues].filter(
			(issue, index, issues) =>
				issues.findIndex((candidate) => candidate.number === issue.number) === index
		)
		this.issues = filterIssues(issuePool, trimmedQuery)

		if (!trimmedQuery) {
			this.loading = false
			this.issues = this.allIssues
			this.tui.requestRender()
			return
		}

		this.loading = true
		this.searchTimer = setTimeout(() => {
			this.searchTimer = undefined
			void this.loadIssues(trimmedQuery)
		}, SEARCH_DEBOUNCE_MS)
		this.tui.requestRender()
	}

	private moveSelection(delta: number): void {
		if (this.issues.length === 0) return
		this.selected = Math.max(0, Math.min(this.issues.length - 1, this.selected + delta))
		if (this.selected < this.scrollOffset) this.scrollOffset = this.selected
		if (this.selected >= this.scrollOffset + MAX_VISIBLE_ISSUES) {
			this.scrollOffset = this.selected - MAX_VISIBLE_ISSUES + 1
		}
	}

	private async openSelectedIssue(): Promise<void> {
		const issue = this.selectedIssue()
		if (!issue || this.openingIssue !== undefined) return

		this.openingIssue = issue.number
		this.error = undefined
		this.tui.requestRender()
		const result = await this.pi.exec(
			'gh',
			['issue', 'view', String(issue.number), '--repo', this.repo, '--web'],
			{ cwd: this.cwd, timeout: GH_TIMEOUT_MS }
		)
		if (this.disposed) return

		this.openingIssue = undefined
		if (result.code !== 0) {
			this.error = cleanText(result.stderr) || `Unable to open #${issue.number}`
		}
		this.tui.requestRender()
	}

	private handleSearchInput(data: string): void {
		if (matchesKey(data, 'escape')) {
			this.searchMode = false
			return
		}
		if (matchesKey(data, 'up')) {
			this.moveSelection(-1)
			return
		}
		if (matchesKey(data, 'down')) {
			this.moveSelection(1)
			return
		}
		if (matchesKey(data, 'pageUp')) {
			this.moveSelection(-MAX_VISIBLE_ISSUES)
			return
		}
		if (matchesKey(data, 'pageDown')) {
			this.moveSelection(MAX_VISIBLE_ISSUES)
			return
		}
		if (matchesKey(data, 'enter') || matchesKey(data, 'return')) {
			const issue = this.selectedIssue()
			if (issue) this.done(issue)
			return
		}
		if (matchesKey(data, 'backspace')) {
			this.updateSearch(Array.from(this.query).slice(0, -1).join(''))
			return
		}
		if (matchesKey(data, 'ctrl+u')) {
			this.updateSearch('')
			return
		}
		if (
			!data.includes('\x1b') &&
			Array.from(data).every((character) => character >= ' ' && character !== '\x7f')
		) {
			this.updateSearch(this.query + data)
		}
	}

	handleInput(data: string): void {
		if (this.searchMode) {
			this.handleSearchInput(data)
			return
		}

		if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c') || data === 'q') {
			this.done(undefined)
			return
		}
		if (data === '/') {
			this.searchMode = true
			return
		}
		if (matchesKey(data, 'up') || data === 'k') {
			this.moveSelection(-1)
			return
		}
		if (matchesKey(data, 'down') || data === 'j') {
			this.moveSelection(1)
			return
		}
		if (matchesKey(data, 'pageUp')) {
			this.moveSelection(-MAX_VISIBLE_ISSUES)
			return
		}
		if (matchesKey(data, 'pageDown')) {
			this.moveSelection(MAX_VISIBLE_ISSUES)
			return
		}
		if (matchesKey(data, 'enter') || matchesKey(data, 'return')) {
			const issue = this.selectedIssue()
			if (issue) this.done(issue)
			return
		}
		if (data === 'o') {
			void this.openSelectedIssue()
			return
		}
		if (data === 'r') {
			void this.loadIssues(this.query.trim())
		}
	}

	private renderIssue(issue: GitHubIssue, selected: boolean, width: number): string {
		const th = this.theme
		const marker = selected ? th.fg('accent', '›') : ' '
		const number = th.fg('accent', `#${issue.number}`)
		const title = selected ? th.bold(issue.title) : issue.title
		const labels = issue.labels
			.slice(0, 2)
			.map((label) => label.name)
			.filter(Boolean)
		const assignee = issue.assignees[0]?.login
		const metadata = [
			labels.length > 0 ? labels.join(', ') : undefined,
			assignee ? `@${assignee}` : undefined,
			relativeTime(issue.updatedAt),
		]
			.filter(Boolean)
			.join(' · ')
		const suffix = metadata ? th.fg('dim', `  ${metadata}`) : ''
		return truncateToWidth(`  ${marker} ${number} ${title}${suffix}`, width, th.fg('dim', '…'))
	}

	render(width: number): string[] {
		const th = this.theme
		const lines: string[] = ['']
		const title = `${th.fg('accent', th.bold('GitHub issues'))}${th.fg('dim', ` · ${this.repo}`)}`
		const count = this.loading
			? this.issues.length > 0
				? `${this.issues.length} · searching…`
				: 'loading…'
			: `${this.issues.length} open`
		const gap = ' '.repeat(Math.max(2, width - visibleWidth(title) - visibleWidth(count) - 2))
		lines.push(truncateToWidth(`  ${title}${gap}${th.fg('dim', count)}`, width))
		lines.push(th.fg('borderMuted', '─'.repeat(Math.max(0, width))))

		if (this.searchMode) {
			const marker = this.focused ? CURSOR_MARKER : ''
			lines.push(
				truncateToWidth(
					`  ${th.fg('accent', '/')} ${this.query}${marker}${th.fg('accent', '▌')}`,
					width,
					th.fg('dim', '…')
				)
			)
			lines.push(`  ${th.fg('dim', '↑↓ navigate · Enter insert · Ctrl+U clear · Esc done')}`)
		} else {
			const summary = this.query ? `Results for “${this.query}”` : 'Open issues'
			lines.push(truncateToWidth(`  ${th.fg('muted', summary)}`, width, th.fg('dim', '…')))
			lines.push(`  ${th.fg('dim', 'Press / to search GitHub')}`)
		}
		lines.push('')

		if (this.error) {
			lines.push(truncateToWidth(`  ${th.fg('error', this.error)}`, width, th.fg('dim', '…')))
		} else if (this.loading && this.issues.length === 0) {
			lines.push(`  ${th.fg('dim', 'Searching issues…')}`)
		} else if (this.issues.length === 0) {
			lines.push(`  ${th.fg('dim', this.query ? 'No matching open issues.' : 'No open issues.')}`)
		} else {
			const visibleIssues = this.issues.slice(
				this.scrollOffset,
				this.scrollOffset + MAX_VISIBLE_ISSUES
			)
			for (let index = 0; index < visibleIssues.length; index++) {
				const absoluteIndex = this.scrollOffset + index
				lines.push(this.renderIssue(visibleIssues[index]!, absoluteIndex === this.selected, width))
			}

			if (this.issues.length > MAX_VISIBLE_ISSUES) {
				lines.push(
					`  ${th.fg('dim', `${this.selected + 1}/${this.issues.length} · scroll for more`)}`
				)
			}
		}

		lines.push('')
		if (this.openingIssue !== undefined) {
			lines.push(`  ${th.fg('dim', `Opening #${this.openingIssue} in GitHub…`)}`)
		} else if (!this.searchMode) {
			lines.push(
				`  ${th.fg('dim', '↑↓/jk navigate · / search · Enter insert · o open · r refresh · Esc close')}`
			)
		}
		lines.push('')
		return lines.map((line) => truncateToWidth(line, width, th.fg('dim', '…')))
	}

	invalidate(): void {}

	dispose(): void {
		this.disposed = true
		this.requestId++
		if (this.searchTimer) clearTimeout(this.searchTimer)
	}
}

export default function githubIssuesExtension(pi: ExtensionAPI): void {
	pi.registerCommand('issues', {
		description: 'Browse and search open GitHub issues for the current repository',
		handler: async (_args, ctx) => {
			if (ctx.mode !== 'tui') {
				ctx.ui.notify('The issue browser requires interactive mode', 'error')
				return
			}

			const resolved = await resolveRepo(pi, ctx.cwd)
			if (!resolved.ok) {
				ctx.ui.notify(`GitHub issues: ${resolved.error}`, 'error')
				return
			}

			const issue = await ctx.ui.custom<GitHubIssue | undefined>(
				(tui, theme, _keybindings, done) =>
					new GitHubIssuesComponent(tui, theme, pi, ctx.cwd, resolved.repo, done)
			)
			if (!issue) return

			const current = ctx.ui.getEditorText()
			const separator = current.length > 0 && !/\s$/.test(current) ? ' ' : ''
			ctx.ui.setEditorText(`${current}${separator}#${issue.number} `)
		},
	})
}

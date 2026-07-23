import type { ExtensionAPI, Theme } from '@earendil-works/pi-coding-agent'
import {
	CURSOR_MARKER,
	type Focusable,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	type TUI,
} from '@earendil-works/pi-tui'
import {
	GITHUB_REFERENCE_SELECTED_CHANNEL,
	githubReferenceMarker,
	type GitHubReferenceSelection,
} from './lib/github-reference.ts'
import { appendDraftItems, draftForAttachmentCommand } from './lib/editor-draft.ts'

const MAX_PULL_REQUESTS = 100
const MAX_VISIBLE_PULL_REQUESTS = 12
const GH_TIMEOUT_MS = 15_000
const SEARCH_DEBOUNCE_MS = 300

type GitHubPullRequest = {
	number: number
	title: string
	url: string
	updatedAt: string
	labels: Array<{ name: string }>
	author: { login: string } | null
	isDraft: boolean
	reviewDecision: string
}

type RepoResolution = { ok: true; repo: string } | { ok: false; error: string }

function cleanText(value: string): string {
	return value
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function parsePullRequests(stdout: string): GitHubPullRequest[] {
	const value: unknown = JSON.parse(stdout)
	if (!Array.isArray(value)) throw new Error('Expected an array from gh pr list')

	return value.map((item) => {
		if (
			typeof item !== 'object' ||
			item === null ||
			typeof (item as GitHubPullRequest).number !== 'number' ||
			typeof (item as GitHubPullRequest).title !== 'string' ||
			typeof (item as GitHubPullRequest).url !== 'string' ||
			typeof (item as GitHubPullRequest).updatedAt !== 'string'
		) {
			throw new Error('Unexpected pull request data from gh pr list')
		}

		const pullRequest = item as GitHubPullRequest
		return {
			number: pullRequest.number,
			title: cleanText(pullRequest.title),
			url: pullRequest.url,
			updatedAt: pullRequest.updatedAt,
			labels: Array.isArray(pullRequest.labels)
				? pullRequest.labels
						.filter((label) => label && typeof label.name === 'string')
						.map((label) => ({ name: cleanText(label.name) }))
				: [],
			author:
				pullRequest.author && typeof pullRequest.author.login === 'string'
					? { login: cleanText(pullRequest.author.login) }
					: null,
			isDraft: pullRequest.isDraft === true,
			reviewDecision:
				typeof pullRequest.reviewDecision === 'string'
					? cleanText(pullRequest.reviewDecision)
					: '',
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

function filterPullRequests(
	pullRequests: GitHubPullRequest[],
	query: string
): GitHubPullRequest[] {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
	if (terms.length === 0) return pullRequests

	return pullRequests.filter((pullRequest) => {
		const searchable = [
			String(pullRequest.number),
			pullRequest.title,
			...pullRequest.labels.map((label) => label.name),
			pullRequest.author?.login,
			pullRequest.isDraft ? 'draft' : undefined,
			pullRequest.reviewDecision,
		]
			.filter(Boolean)
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

function formatReviewDecision(value: string): string | undefined {
	switch (value) {
		case 'APPROVED':
			return 'approved'
		case 'CHANGES_REQUESTED':
			return 'changes requested'
		case 'REVIEW_REQUIRED':
			return 'review required'
		default:
			return undefined
	}
}

class GitHubPullRequestsComponent implements Focusable {
	focused = false

	private allPullRequests: GitHubPullRequest[] = []
	private pullRequests: GitHubPullRequest[] = []
	private selected = 0
	private scrollOffset = 0
	private selectedPullRequests = new Map<number, GitHubPullRequest>()
	private searchMode = false
	private query = ''
	private loading = true
	private error: string | undefined
	private openingPullRequest: number | undefined
	private requestId = 0
	private searchTimer: ReturnType<typeof setTimeout> | undefined
	private disposed = false

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly pi: ExtensionAPI,
		private readonly cwd: string,
		private readonly repo: string,
		private readonly done: (pullRequests: GitHubPullRequest[] | undefined) => void
	) {
		void this.loadPullRequests('')
	}

	private async loadPullRequests(query: string): Promise<void> {
		const requestId = ++this.requestId
		this.loading = true
		this.error = undefined
		this.tui.requestRender()

		const args = [
			'pr',
			'list',
			'--repo',
			this.repo,
			'--state',
			'open',
			'--limit',
			String(MAX_PULL_REQUESTS),
			'--json',
			'number,title,url,updatedAt,labels,author,isDraft,reviewDecision',
		]
		if (query) args.push('--search', query)

		const result = await this.pi.exec('gh', args, { cwd: this.cwd, timeout: GH_TIMEOUT_MS })
		if (this.disposed || requestId !== this.requestId) return

		this.loading = false
		if (result.code !== 0) {
			this.error = cleanText(result.stderr) || `gh pr list exited with code ${result.code}`
			this.tui.requestRender()
			return
		}

		try {
			const pullRequests = parsePullRequests(result.stdout)
			if (!query) this.allPullRequests = pullRequests
			this.pullRequests = pullRequests
			this.query = query
			this.selected = 0
			this.scrollOffset = 0
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Unable to parse pull requests'
		}
		this.tui.requestRender()
	}

	private selectedPullRequest(): GitHubPullRequest | undefined {
		return this.pullRequests[this.selected]
	}

	private toggleSelectedPullRequest(): void {
		const pullRequest = this.selectedPullRequest()
		if (!pullRequest) return
		if (this.selectedPullRequests.has(pullRequest.number)) {
			this.selectedPullRequests.delete(pullRequest.number)
		} else {
			this.selectedPullRequests.set(pullRequest.number, pullRequest)
		}
	}

	private confirmSelection(): void {
		const selected = [...this.selectedPullRequests.values()]
		if (selected.length > 0) {
			this.done(selected)
			return
		}
		const pullRequest = this.selectedPullRequest()
		if (pullRequest) this.done([pullRequest])
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
		const pullRequestPool = [...this.pullRequests, ...this.allPullRequests].filter(
			(pullRequest, index, pullRequests) =>
				pullRequests.findIndex((candidate) => candidate.number === pullRequest.number) === index
		)
		this.pullRequests = filterPullRequests(pullRequestPool, trimmedQuery)

		if (!trimmedQuery) {
			this.loading = false
			this.pullRequests = this.allPullRequests
			this.tui.requestRender()
			return
		}

		this.loading = true
		this.searchTimer = setTimeout(() => {
			this.searchTimer = undefined
			void this.loadPullRequests(trimmedQuery)
		}, SEARCH_DEBOUNCE_MS)
		this.tui.requestRender()
	}

	private moveSelection(delta: number): void {
		if (this.pullRequests.length === 0) return
		this.selected = Math.max(
			0,
			Math.min(this.pullRequests.length - 1, this.selected + delta)
		)
		if (this.selected < this.scrollOffset) this.scrollOffset = this.selected
		if (this.selected >= this.scrollOffset + MAX_VISIBLE_PULL_REQUESTS) {
			this.scrollOffset = this.selected - MAX_VISIBLE_PULL_REQUESTS + 1
		}
	}

	private async openSelectedPullRequest(): Promise<void> {
		const pullRequest = this.selectedPullRequest()
		if (!pullRequest || this.openingPullRequest !== undefined) return

		this.openingPullRequest = pullRequest.number
		this.error = undefined
		this.tui.requestRender()
		const result = await this.pi.exec(
			'gh',
			['pr', 'view', String(pullRequest.number), '--repo', this.repo, '--web'],
			{ cwd: this.cwd, timeout: GH_TIMEOUT_MS }
		)
		if (this.disposed) return

		this.openingPullRequest = undefined
		if (result.code !== 0) {
			this.error = cleanText(result.stderr) || `Unable to open #${pullRequest.number}`
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
			this.moveSelection(-MAX_VISIBLE_PULL_REQUESTS)
			return
		}
		if (matchesKey(data, 'pageDown')) {
			this.moveSelection(MAX_VISIBLE_PULL_REQUESTS)
			return
		}
		if (matchesKey(data, 'tab')) {
			this.toggleSelectedPullRequest()
			return
		}
		if (matchesKey(data, 'enter') || matchesKey(data, 'return')) {
			this.confirmSelection()
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
			this.moveSelection(-MAX_VISIBLE_PULL_REQUESTS)
			return
		}
		if (matchesKey(data, 'pageDown')) {
			this.moveSelection(MAX_VISIBLE_PULL_REQUESTS)
			return
		}
		if (matchesKey(data, 'space') || matchesKey(data, 'tab')) {
			this.toggleSelectedPullRequest()
			return
		}
		if (matchesKey(data, 'enter') || matchesKey(data, 'return')) {
			this.confirmSelection()
			return
		}
		if (data === 'o') {
			void this.openSelectedPullRequest()
			return
		}
		if (data === 'r') {
			void this.loadPullRequests(this.query.trim())
		}
	}

	private renderPullRequest(
		pullRequest: GitHubPullRequest,
		selected: boolean,
		width: number
	): string {
		const th = this.theme
		const marker = selected ? th.fg('accent', '›') : ' '
		const checked = this.selectedPullRequests.has(pullRequest.number)
			? th.fg('success', '✓')
			: th.fg('dim', '○')
		const number = th.fg('accent', `#${pullRequest.number}`)
		const title = selected ? th.bold(pullRequest.title) : pullRequest.title
		const labels = pullRequest.labels
			.slice(0, 2)
			.map((label) => label.name)
			.filter(Boolean)
		const reviewDecision = formatReviewDecision(pullRequest.reviewDecision)
		const metadata = [
			pullRequest.isDraft ? 'draft' : undefined,
			labels.length > 0 ? labels.join(', ') : undefined,
			pullRequest.author?.login ? `@${pullRequest.author.login}` : undefined,
			reviewDecision,
			relativeTime(pullRequest.updatedAt),
		]
			.filter(Boolean)
			.join(' · ')
		const suffix = metadata ? th.fg('dim', `  ${metadata}`) : ''
		return truncateToWidth(
			`  ${marker} ${checked} ${number} ${title}${suffix}`,
			width,
			th.fg('dim', '…')
		)
	}

	render(width: number): string[] {
		const th = this.theme
		const lines: string[] = ['']
		const title = `${th.fg('accent', th.bold('GitHub pull requests'))}${th.fg('dim', ` · ${this.repo}`)}`
		const resultCount = this.loading
			? this.pullRequests.length > 0
				? `${this.pullRequests.length} · searching…`
				: 'loading…'
			: `${this.pullRequests.length} open`
		const count = this.selectedPullRequests.size > 0
			? `${resultCount} · ${this.selectedPullRequests.size} selected`
			: resultCount
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
			lines.push(`  ${th.fg('dim', '↑↓ navigate · Tab select · Enter insert · Ctrl+U clear · Esc done')}`)
		} else {
			const summary = this.query ? `Results for “${this.query}”` : 'Open pull requests'
			lines.push(truncateToWidth(`  ${th.fg('muted', summary)}`, width, th.fg('dim', '…')))
			lines.push(`  ${th.fg('dim', 'Press / to search GitHub')}`)
		}
		lines.push('')

		if (this.error) {
			lines.push(truncateToWidth(`  ${th.fg('error', this.error)}`, width, th.fg('dim', '…')))
		} else if (this.loading && this.pullRequests.length === 0) {
			lines.push(`  ${th.fg('dim', 'Searching pull requests…')}`)
		} else if (this.pullRequests.length === 0) {
			lines.push(
				`  ${th.fg('dim', this.query ? 'No matching open pull requests.' : 'No open pull requests.')}`
			)
		} else {
			const visiblePullRequests = this.pullRequests.slice(
				this.scrollOffset,
				this.scrollOffset + MAX_VISIBLE_PULL_REQUESTS
			)
			for (let index = 0; index < visiblePullRequests.length; index++) {
				const absoluteIndex = this.scrollOffset + index
				lines.push(
					this.renderPullRequest(
						visiblePullRequests[index]!,
						absoluteIndex === this.selected,
						width
					)
				)
			}

			if (this.pullRequests.length > MAX_VISIBLE_PULL_REQUESTS) {
				lines.push(
					`  ${th.fg('dim', `${this.selected + 1}/${this.pullRequests.length} · scroll for more`)}`
				)
			}
		}

		lines.push('')
		if (this.openingPullRequest !== undefined) {
			lines.push(`  ${th.fg('dim', `Opening #${this.openingPullRequest} in GitHub…`)}`)
		} else if (!this.searchMode) {
			lines.push(
				`  ${th.fg('dim', '↑↓/jk navigate · Space/Tab select · Enter insert selected · / search · o open · Esc close')}`
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

export default function githubPullRequestsExtension(pi: ExtensionAPI): void {
	pi.registerCommand('prs', {
		description: 'Browse and search open GitHub pull requests for the current repository',
		handler: async (args, ctx) => {
			if (ctx.mode !== 'tui') {
				ctx.ui.notify('The pull request browser requires interactive mode', 'error')
				return
			}

			const resolved = await resolveRepo(pi, ctx.cwd)
			if (!resolved.ok) {
				ctx.ui.notify(`GitHub pull requests: ${resolved.error}`, 'error')
				return
			}

			const pullRequests = await ctx.ui.custom<GitHubPullRequest[] | undefined>(
				(tui, theme, _keybindings, done) =>
					new GitHubPullRequestsComponent(tui, theme, pi, ctx.cwd, resolved.repo, done)
			)
			if (!pullRequests || pullRequests.length === 0) return

			const draft = draftForAttachmentCommand(ctx.ui.getEditorText(), args, 'prs')
			const markers = pullRequests.map((pullRequest) =>
				githubReferenceMarker('pr', pullRequest.number)
			)
			ctx.ui.setEditorText(appendDraftItems(draft, markers))
			for (const pullRequest of pullRequests) {
				pi.events.emit(GITHUB_REFERENCE_SELECTED_CHANNEL, {
					kind: 'pr',
					number: pullRequest.number,
					repo: resolved.repo,
					title: pullRequest.title,
					url: pullRequest.url,
					state: pullRequest.isDraft ? 'DRAFT · OPEN' : 'OPEN',
				} satisfies GitHubReferenceSelection)
			}
		},
	})
}

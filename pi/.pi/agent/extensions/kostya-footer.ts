import * as path from 'node:path'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent'
import { truncateToWidth, type TUI, visibleWidth } from '@earendil-works/pi-tui'

const COLLABORATION_MODE_STATUS = 'kostya-collaboration-mode'

function formatTokens(count: number): string {
	if (count < 1_000) return count.toString()
	if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`
	if (count < 1_000_000) return `${Math.round(count / 1_000)}k`
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`
	return `${Math.round(count / 1_000_000)}M`
}

function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, ' ')
		.replace(/ +/g, ' ')
		.trim()
}

function formatCwd(cwd: string): string {
	const home = process.env.HOME ?? process.env.USERPROFILE
	if (!home) return cwd

	const resolvedCwd = path.resolve(cwd)
	const resolvedHome = path.resolve(home)
	const relativeToHome = path.relative(resolvedHome, resolvedCwd)
	const isInsideHome =
		relativeToHome === '' ||
		(relativeToHome !== '..' &&
			!relativeToHome.startsWith(`..${path.sep}`) &&
			!path.isAbsolute(relativeToHome))

	if (!isInsideHome) return cwd
	return relativeToHome === '' ? '~' : `~${path.sep}${relativeToHome}`
}

function collectUsage(ctx: ExtensionContext): {
	input: number
	output: number
	cacheRead: number
	cacheWrite: number
	cost: number
	latestCacheHitRate?: number
} {
	let input = 0
	let output = 0
	let cacheRead = 0
	let cacheWrite = 0
	let cost = 0
	let latestCacheHitRate: number | undefined

	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type !== 'message' || entry.message.role !== 'assistant') continue

		const message = entry.message as AssistantMessage
		input += message.usage.input
		output += message.usage.output
		cacheRead += message.usage.cacheRead
		cacheWrite += message.usage.cacheWrite
		cost += message.usage.cost.total

		const latestPromptTokens =
			message.usage.input + message.usage.cacheRead + message.usage.cacheWrite
		latestCacheHitRate =
			latestPromptTokens > 0 ? (message.usage.cacheRead / latestPromptTokens) * 100 : undefined
	}

	return { input, output, cacheRead, cacheWrite, cost, latestCacheHitRate }
}

function renderProjectLine(
	width: number,
	theme: Theme,
	projectPath: string,
	branch: string | null,
	modeStatus: string | undefined,
	sessionName: string | undefined
): string {
	let line = theme.fg('mdLink', projectPath)
	if (branch) line += theme.fg('success', ` (${branch})`)
	if (modeStatus) line += `  ${sanitizeStatusText(modeStatus)}`
	if (sessionName) line += theme.fg('dim', `  •  ${sessionName}`)
	return truncateToWidth(line, width, theme.fg('dim', '…'))
}

function renderStats(ctx: ExtensionContext, theme: Theme, autoCompactEnabled: boolean): string {
	const totals = collectUsage(ctx)
	const parts: string[] = []
	const dim = (text: string) => theme.fg('dim', text)

	if (totals.input) parts.push(dim(`↑${formatTokens(totals.input)}`))
	if (totals.output) parts.push(dim(`↓${formatTokens(totals.output)}`))
	if (totals.cacheRead) parts.push(dim(`R${formatTokens(totals.cacheRead)}`))
	if (totals.cacheWrite) parts.push(dim(`W${formatTokens(totals.cacheWrite)}`))
	if ((totals.cacheRead > 0 || totals.cacheWrite > 0) && totals.latestCacheHitRate !== undefined) {
		parts.push(dim(`CH${totals.latestCacheHitRate.toFixed(1)}%`))
	}

	const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false
	if (totals.cost || usingSubscription) {
		parts.push(dim(`$${totals.cost.toFixed(3)}${usingSubscription ? ' (sub)' : ''}`))
	}

	const context = ctx.getContextUsage()
	const contextWindow = context?.contextWindow ?? ctx.model?.contextWindow ?? 0
	const percent = context?.percent
	const auto = autoCompactEnabled ? ' (auto)' : ''
	const contextText = `${percent === null || percent === undefined ? '?' : `${percent.toFixed(1)}%`}/${formatTokens(contextWindow)}${auto}`
	parts.push(
		percent !== null && percent !== undefined && percent > 90
			? theme.fg('error', contextText)
			: percent !== null && percent !== undefined && percent > 70
				? theme.fg('warning', contextText)
				: dim(contextText)
	)

	return parts.join(' ')
}

function renderModel(theme: Theme, ctx: ExtensionContext, pi: ExtensionAPI): string {
	const model = ctx.model?.id ?? 'no-model'
	let text = theme.fg('customMessageLabel', model)
	if (ctx.model?.reasoning) {
		text += " [" + theme.fg('syntaxNumber', pi.getThinkingLevel()) + "]"
	}
	return text
}

function combineStatsAndModel(width: number, stats: string, model: string): string {
	const gap = 2
	let left = stats
	if (visibleWidth(left) > width) return truncateToWidth(left, width, '…')

	const availableForModel = width - visibleWidth(left) - gap
	if (availableForModel <= 0) return left

	const right = truncateToWidth(model, availableForModel, '')
	const padding = ' '.repeat(Math.max(gap, width - visibleWidth(left) - visibleWidth(right)))
	return left + padding + right
}

export default function kostyaFooterExtension(pi: ExtensionAPI): void {
	let activeTui: TUI | undefined
	let currentContext: ExtensionContext | undefined
	let projectPath = ''
	let enabled = true

	function requestRender(): void {
		activeTui?.requestRender()
	}

	function enableFooter(ctx: ExtensionContext): void {
		if (ctx.mode !== 'tui') return
		currentContext = ctx
		enabled = true

		ctx.ui.setFooter((tui, theme, footerData) => {
			activeTui = tui
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender())

			return {
				dispose() {
					unsubscribe()
					if (activeTui === tui) activeTui = undefined
				},
				invalidate() {},
				render(width: number): string[] {
					const renderContext = currentContext ?? ctx
					const extensionStatuses = footerData.getExtensionStatuses()
					const projectLine = renderProjectLine(
						width,
						theme,
						projectPath,
						footerData.getGitBranch(),
						extensionStatuses.get(COLLABORATION_MODE_STATUS),
						renderContext.sessionManager.getSessionName()
					)
					const statsLine = combineStatsAndModel(
						width,
						renderStats(renderContext, theme, true),
						renderModel(theme, renderContext, pi)
					)
					const lines = [projectLine, statsLine]

					const statuses = Array.from(extensionStatuses.entries())
						.filter(([key]) => key !== COLLABORATION_MODE_STATUS)
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([, text]) => sanitizeStatusText(text))
					if (statuses.length > 0) {
						lines.push(truncateToWidth(statuses.join(' '), width, theme.fg('dim', '…')))
					}

					return lines
				},
			}
		})
	}

	pi.on('session_start', (_event, ctx) => {
		projectPath = formatCwd(ctx.cwd)
		enableFooter(ctx)
	})

	pi.on('model_select', (_event, ctx) => {
		currentContext = ctx
		requestRender()
	})

	pi.on('thinking_level_select', (_event, ctx) => {
		currentContext = ctx
		requestRender()
	})

	pi.on('session_info_changed', (_event, ctx) => {
		currentContext = ctx
		requestRender()
	})

	pi.registerCommand('kostya-footer', {
		description: 'Enable the Kostya Catppuccin footer',
		handler: async (_args, ctx) => {
			if (!projectPath) projectPath = formatCwd(ctx.cwd)
			enableFooter(ctx)
			ctx.ui.notify('Kostya footer enabled', 'info')
		},
	})

	pi.registerCommand('builtin-footer', {
		description: "Restore pi's built-in footer",
		handler: async (_args, ctx) => {
			enabled = false
			activeTui = undefined
			ctx.ui.setFooter(undefined)
			ctx.ui.notify('Built-in footer restored', 'info')
		},
	})

	pi.on('agent_end', () => {
		if (enabled && currentContext) requestRender()
	})
}

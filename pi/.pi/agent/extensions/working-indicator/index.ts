import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type {
	ExtensionAPI,
	ExtensionContext,
	Theme,
} from '@earendil-works/pi-coding-agent'
import cliSpinners, { type Spinner } from 'cli-spinners'
import {
	isKeyRelease,
	Key,
	matchesKey,
	truncateToWidth,
	type TUI,
} from '@earendil-works/pi-tui'

const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), 'config.json')
const PAGE_SIZE = 16
const GALLERY_INTERVAL_MS = 33
const SHIMMER_INTERVAL_MS = 65
const VERB_CYCLE_INTERVAL_MS = 1_800
const SPINNERS: Readonly<Record<string, Spinner>> = cliSpinners
const SPINNER_NAMES = Object.keys(SPINNERS)
const DEFAULT_VERB_ID = 'texo'
const OPTION_KEY_EVENT = /^\x1b\[(?:57443|57449)(?:(?:;\d+)?:([123]))?u$/

type VerbDefinition = {
	id: string
	word: string
	language: string
	meaning: string
}

type WorkingIndicatorConfig = {
	spinner: string | null
	verb: string | null
	verbMode: 'cycle' | 'pinned'
}

type OptionReader = () => boolean

const VERBS = [
	{ id: 'texo', word: 'Texō', language: 'Latin', meaning: 'I weave · compose · construct' },
	{ id: 'excogito', word: 'Excōgitō', language: 'Latin', meaning: 'I devise · think something out' },
	{ id: 'quaero', word: 'Quaerō', language: 'Latin', meaning: 'I seek · inquire' },
	{ id: 'invenio', word: 'Inveniō', language: 'Latin', meaning: 'I discover · invent' },
	{ id: 'smeagan', word: 'Smēagan', language: 'Old English', meaning: 'Investigate · ponder · devise' },
	{ id: 'thencan', word: 'Þencan', language: 'Old English', meaning: 'Think · reflect' },
	{ id: 'smida', word: 'Smíða', language: 'Old Norse', meaning: 'Forge · craft · build' },
	{ id: 'hyggja', word: 'Hyggja', language: 'Old Norse', meaning: 'Think · intend' },
	{ id: 'mekhanomai', word: 'Mēkhanōmai', language: 'Ancient Greek', meaning: 'Devise · contrive cleverly' },
	{ id: 'heurisko', word: 'Heurískō', language: 'Ancient Greek', meaning: 'Discover · find' },
	{ id: 'epesu', word: 'Epēšu', language: 'Akkadian', meaning: 'Make · build · perform' },
	{ id: 'hasasu', word: 'Ḫasāsu', language: 'Akkadian', meaning: 'Think · remember' },
	{ id: 'dim', word: 'Dím', language: 'Sumerian', meaning: 'Fashion · form · create' },
	{ id: 'king', word: 'Kiŋ', language: 'Sumerian', meaning: 'Seek · search' },
] as const satisfies readonly VerbDefinition[]

const VERB_BY_ID: Readonly<Record<string, VerbDefinition>> = Object.fromEntries(
	VERBS.map((verb) => [verb.id, verb]),
)

function readConfig(): WorkingIndicatorConfig {
	try {
		const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<WorkingIndicatorConfig>
		const verbMode = config.verbMode === 'pinned' ? 'pinned' : 'cycle'
		const configuredVerb =
			config.verb === null
				? null
				: typeof config.verb === 'string' && VERB_BY_ID[config.verb]
					? config.verb
					: DEFAULT_VERB_ID
		return {
			spinner:
				typeof config.spinner === 'string' && SPINNERS[config.spinner]
					? config.spinner
					: null,
			verb: verbMode === 'cycle' && configuredVerb === null ? DEFAULT_VERB_ID : configuredVerb,
			verbMode,
		}
	} catch {
		return { spinner: null, verb: DEFAULT_VERB_ID, verbMode: 'cycle' }
	}
}

function writeConfig(config: WorkingIndicatorConfig): void {
	writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

function applySpinner(ctx: ExtensionContext, name: string | null): void {
	if (!name) {
		ctx.ui.setWorkingIndicator()
		return
	}

	const spinner = SPINNERS[name]
	if (!spinner) return
	ctx.ui.setWorkingIndicator({
		frames: spinner.frames.map((frame) => ctx.ui.theme.fg('accent', frame)),
		intervalMs: spinner.interval,
	})
}

function shimmer(text: string, phase: number, theme: Theme): string {
	const characters = Array.from(text)
	const center = (phase % (characters.length + 8)) - 4
	return characters
		.map((character, index) => {
			if (character === ' ') return character
			const distance = Math.abs(index - center)
			if (distance === 0) return theme.bold(theme.fg('accent', character))
			if (distance === 1) return theme.fg('text', character)
			if (distance === 2) return theme.fg('muted', character)
			return theme.fg('dim', character)
		})
		.join('')
}

function parseOptionKeyEvent(data: string): 'pressed' | 'released' | undefined {
	const match = OPTION_KEY_EVENT.exec(data)
	if (!match) return undefined
	return match[1] === '3' ? 'released' : 'pressed'
}

async function loadOptionReader(): Promise<OptionReader | undefined> {
	if (process.platform !== 'darwin') return undefined

	const roots = [
		process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined,
		import.meta.url,
	].filter((value): value is string => Boolean(value))

	for (const root of roots) {
		try {
			const requireFromRoot = createRequire(root)
			const modulePath = requireFromRoot.resolve(
				'@earendil-works/pi-tui/dist/native-modifiers.js',
			)
			const nativeModifiers = (await import(pathToFileURL(modulePath).href)) as {
				isNativeModifierPressed(key: 'option'): boolean
			}
			return () => nativeModifiers.isNativeModifierPressed('option')
		} catch {
			// Try the next module-resolution root. Kitty key events remain as a fallback.
		}
	}
	return undefined
}

class SpinnerGallery {
	private selectedIndex: number
	private offset = 0
	private readonly startedAt = Date.now()
	private readonly timer: ReturnType<typeof setInterval>

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly names: string[],
		private readonly filter: string,
		currentName: string | null,
		private readonly done: (name: string | null) => void,
	) {
		this.selectedIndex = Math.max(0, currentName ? names.indexOf(currentName) : 0)
		this.ensureVisible()
		this.timer = setInterval(() => this.tui.requestRender(), GALLERY_INTERVAL_MS)
	}

	private ensureVisible(): void {
		if (this.selectedIndex < this.offset) this.offset = this.selectedIndex
		if (this.selectedIndex >= this.offset + PAGE_SIZE) {
			this.offset = this.selectedIndex - PAGE_SIZE + 1
		}
	}

	private move(delta: number): void {
		this.selectedIndex = Math.max(0, Math.min(this.names.length - 1, this.selectedIndex + delta))
		this.ensureVisible()
		this.tui.requestRender()
	}

	private select(index: number): void {
		this.selectedIndex = Math.max(0, Math.min(this.names.length - 1, index))
		this.ensureVisible()
		this.tui.requestRender()
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.up) || data === 'k') {
			this.move(-1)
			return
		}
		if (matchesKey(data, Key.down) || data === 'j') {
			this.move(1)
			return
		}
		if (matchesKey(data, Key.pageUp)) {
			this.move(-PAGE_SIZE)
			return
		}
		if (matchesKey(data, Key.pageDown)) {
			this.move(PAGE_SIZE)
			return
		}
		if (matchesKey(data, Key.home)) {
			this.select(0)
			return
		}
		if (matchesKey(data, Key.end)) {
			this.select(this.names.length - 1)
			return
		}
		if (matchesKey(data, Key.enter)) {
			const selected = this.names[this.selectedIndex] ?? null
			this.dispose()
			this.done(selected)
			return
		}
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c'))) {
			this.dispose()
			this.done(null)
		}
	}

	render(width: number): string[] {
		const count = this.names.length
		const first = Math.min(this.offset + 1, count)
		const last = Math.min(this.offset + PAGE_SIZE, count)
		const title = `cli-spinners gallery · ${count} spinner${count === 1 ? '' : 's'}`
		const subtitle = this.filter
			? `filter: ${this.filter} · showing ${first}–${last}`
			: `showing ${first}–${last} of ${count}`
		const maxNameWidth = Math.max(...this.names.map((name) => name.length))
		const nameWidth = Math.min(maxNameWidth, Math.max(12, Math.min(24, Math.floor(width * 0.35))))
		const elapsed = Date.now() - this.startedAt
		const rows = this.names.slice(this.offset, this.offset + PAGE_SIZE).map((name, rowIndex) => {
			const index = this.offset + rowIndex
			const selected = index === this.selectedIndex
			const spinner = SPINNERS[name]!
			const frameIndex = Math.floor(elapsed / spinner.interval) % spinner.frames.length
			const frame = spinner.frames[frameIndex] ?? ''
			const prefix = selected ? this.theme.fg('accent', '›') : ' '
			const label = selected
				? this.theme.fg('accent', this.theme.bold(name.padEnd(nameWidth)))
				: this.theme.fg('text', name.padEnd(nameWidth))
			const preview = `${this.theme.fg('accent', frame)} ${this.theme.fg('muted', 'Working…')}`
			return truncateToWidth(`${prefix} ${label}  ${preview}`, width, this.theme.fg('dim', '…'))
		})

		return [
			truncateToWidth(this.theme.fg('accent', this.theme.bold(title)), width),
			truncateToWidth(this.theme.fg('dim', subtitle), width),
			'',
			...rows,
			'',
			truncateToWidth(
				this.theme.fg('dim', '↑↓/jk navigate · pgup/pgdn jump · enter use · esc cancel'),
				width,
			),
		]
	}

	invalidate(): void {}

	dispose(): void {
		clearInterval(this.timer)
	}
}

export default function workingIndicatorExtension(pi: ExtensionAPI): void {
	let config = readConfig()
	let activeVerbId = config.verb
	let currentContext: ExtensionContext | undefined
	let working = false
	let kittyOptionPressed = false
	let stickyReveal = false
	let wasRevealed = false
	let shimmerPhase = 0
	let optionReader: OptionReader | undefined
	let shimmerTimer: ReturnType<typeof setInterval> | undefined
	let verbCycleTimer: ReturnType<typeof setInterval> | undefined
	let unsubscribeInput: (() => void) | undefined

	function stopShimmer(): void {
		if (shimmerTimer) clearInterval(shimmerTimer)
		shimmerTimer = undefined
	}

	function stopVerbCycle(): void {
		if (verbCycleTimer) clearInterval(verbCycleTimer)
		verbCycleTimer = undefined
	}

	function updateWorkingMessage(force = false): void {
		if (!working || !currentContext || !activeVerbId) return
		const verb = VERB_BY_ID[activeVerbId]
		if (!verb) return

		const revealed = kittyOptionPressed || stickyReveal || (optionReader?.() ?? false)
		if (revealed) {
			currentContext.ui.setWorkingMessage(
				shimmer(`${verb.meaning}…`, shimmerPhase, currentContext.ui.theme),
			)
		} else if (force || wasRevealed) {
			currentContext.ui.setWorkingMessage(`${verb.word}…`)
		}
		wasRevealed = revealed
	}

	function advanceVerb(): void {
		if (config.verbMode !== 'cycle' || !activeVerbId) return
		const currentIndex = VERBS.findIndex((verb) => verb.id === activeVerbId)
		activeVerbId = VERBS[(currentIndex + 1) % VERBS.length]!.id
		shimmerPhase = 0
		updateWorkingMessage(true)
	}

	function startVerbCycle(): void {
		stopVerbCycle()
		if (!working || config.verbMode !== 'cycle' || !activeVerbId) return
		verbCycleTimer = setInterval(advanceVerb, VERB_CYCLE_INTERVAL_MS)
	}

	function startWorking(ctx: ExtensionContext): void {
		stopShimmer()
		stopVerbCycle()
		currentContext = ctx
		working = true
		kittyOptionPressed = false
		stickyReveal = false
		wasRevealed = false
		shimmerPhase = 0
		if (!activeVerbId) {
			ctx.ui.setWorkingMessage()
			return
		}
		updateWorkingMessage(true)
		shimmerTimer = setInterval(() => {
			shimmerPhase += 1
			updateWorkingMessage()
		}, SHIMMER_INTERVAL_MS)
		startVerbCycle()
	}

	function stopWorking(ctx?: ExtensionContext): void {
		stopShimmer()
		stopVerbCycle()
		working = false
		kittyOptionPressed = false
		stickyReveal = false
		wasRevealed = false
		;(ctx ?? currentContext)?.ui.setWorkingMessage()
	}

	pi.on('session_start', (_event, ctx) => {
		stopWorking()
		unsubscribeInput?.()
		currentContext = ctx
		config = readConfig()
		activeVerbId = config.verb
		applySpinner(ctx, config.spinner)

		if (ctx.mode === 'tui') {
			unsubscribeInput = ctx.ui.onTerminalInput((data) => {
				if (!working) return undefined

				const optionEvent = parseOptionKeyEvent(data)
				if (optionEvent) {
					kittyOptionPressed = optionEvent === 'pressed'
					updateWorkingMessage(true)
					return { consume: true }
				}

				if (matchesKey(data, Key.alt('v'))) {
					if (!isKeyRelease(data)) {
						stickyReveal = !stickyReveal
						updateWorkingMessage(true)
					}
					return { consume: true }
				}
				return undefined
			})

			void loadOptionReader().then((reader) => {
				optionReader = reader
			})
		}
	})

	pi.on('agent_start', (_event, ctx) => startWorking(ctx))
	pi.on('agent_settled', (_event, ctx) => stopWorking(ctx))
	pi.on('session_shutdown', () => {
		stopWorking()
		unsubscribeInput?.()
		unsubscribeInput = undefined
	})

	pi.registerCommand('spinner-gallery', {
		description: 'Browse animated cli-spinners and choose the working indicator',
		handler: async (args, ctx) => {
			if (ctx.mode !== 'tui') {
				ctx.ui.notify('The spinner gallery is available in interactive mode only', 'error')
				return
			}

			const filter = args.trim().toLowerCase()
			const names = filter
				? SPINNER_NAMES.filter((name) => name.toLowerCase().includes(filter))
				: SPINNER_NAMES
			if (names.length === 0) {
				ctx.ui.notify(`No cli-spinners match “${filter}”`, 'warning')
				return
			}

			const choice = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) =>
				new SpinnerGallery(tui, theme, names, filter, config.spinner, done),
			)
			if (!choice) return

			config = { ...config, spinner: choice }
			writeConfig(config)
			applySpinner(ctx, config.spinner)
			ctx.ui.notify(`Working spinner set to ${config.spinner}`, 'info')
		},
	})

	pi.registerCommand('spinner', {
		description: 'Set a cli-spinner by name, show the current choice, or reset to Pi default',
		getArgumentCompletions: (prefix) => {
			const normalized = prefix.trim().toLowerCase()
			return ['reset', ...SPINNER_NAMES]
				.filter((name) => name.toLowerCase().startsWith(normalized))
				.map((name) => ({ value: name, label: name }))
		},
		handler: async (args, ctx) => {
			const name = args.trim()
			if (!name) {
				ctx.ui.notify(`Working spinner: ${config.spinner ?? 'Pi default'}`, 'info')
				return
			}
			if (name === 'reset') {
				config = { ...config, spinner: null }
				writeConfig(config)
				applySpinner(ctx, null)
				ctx.ui.notify('Restored Pi default spinner', 'info')
				return
			}
			if (!SPINNERS[name]) {
				ctx.ui.notify(`Unknown spinner “${name}”. Try /spinner-gallery ${name}`, 'error')
				return
			}

			config = { ...config, spinner: name }
			writeConfig(config)
			applySpinner(ctx, config.spinner)
			ctx.ui.notify(`Working spinner set to ${config.spinner}`, 'info')
		},
	})

	pi.registerCommand('verb', {
		description: 'Cycle ancient verbs while working, pin one by name, advance, or reset',
		getArgumentCompletions: (prefix) => {
			const normalized = prefix.trim().toLowerCase()
			return [
				{ value: 'cycle', label: 'cycle', description: 'Rotate verbs every 1.8s while working' },
				{ value: 'next', label: 'next', description: 'Pin the next verb' },
				{ value: 'reset', label: 'reset', description: 'Restore Working…' },
				...VERBS.map((verb) => ({
					value: verb.id,
					label: `${verb.word} — ${verb.language}`,
					description: verb.meaning,
				})),
			].filter((item) => item.value.startsWith(normalized))
		},
		handler: async (args, ctx) => {
			const requested = args.trim().toLowerCase()
			if (!requested) {
				const verb = activeVerbId ? VERB_BY_ID[activeVerbId] : undefined
				ctx.ui.notify(
					verb
						? `Working verb (${config.verbMode}): ${verb.word} — ${verb.meaning}`
						: 'Working verb: Pi default',
					'info',
				)
				return
			}

			if (requested === 'reset') {
				config = { ...config, verb: null, verbMode: 'pinned' }
				activeVerbId = null
			} else if (requested === 'cycle') {
				activeVerbId ??= DEFAULT_VERB_ID
				config = { ...config, verb: activeVerbId, verbMode: 'cycle' }
			} else if (requested === 'next') {
				const currentIndex = VERBS.findIndex((verb) => verb.id === activeVerbId)
				activeVerbId = VERBS[(currentIndex + 1) % VERBS.length]!.id
				config = { ...config, verb: activeVerbId, verbMode: 'pinned' }
			} else if (VERB_BY_ID[requested]) {
				activeVerbId = requested
				config = { ...config, verb: requested, verbMode: 'pinned' }
			} else {
				ctx.ui.notify(`Unknown verb “${requested}”`, 'error')
				return
			}

			writeConfig(config)
			if (working) {
				if (activeVerbId && !shimmerTimer) startWorking(ctx)
				else if (!activeVerbId) stopWorking(ctx)
				else {
					shimmerPhase = 0
					updateWorkingMessage(true)
					startVerbCycle()
				}
			}
			const verb = activeVerbId ? VERB_BY_ID[activeVerbId] : undefined
			ctx.ui.notify(
				verb
					? `Working verb ${config.verbMode === 'cycle' ? 'cycling from' : 'pinned to'} ${verb.word}`
					: 'Restored Working…',
				'info',
			)
		},
	})
}

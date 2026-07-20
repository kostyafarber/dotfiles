import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ImageContent } from '@earendil-works/pi-ai'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import {
	Container,
	SelectList,
	Text,
	truncateToWidth,
	visibleWidth,
	type AutocompleteItem,
	type AutocompleteProvider,
	type AutocompleteSuggestions,
	type Component,
	type SelectItem,
} from '@earendil-works/pi-tui'
import { ImageGallery } from './image-attachments/src/image-gallery.ts'

const LATEST_IMAGE_TOKEN = '@clipboard-image'
const CURRENT_TOKEN = '@clipboard'
const LATEST_IMAGE_TOKEN_PATTERN = /(^|[\s([{])@clipboard-image(?=$|[\s)\]},.!?;])/gi
const CURRENT_TOKEN_PATTERN = /(^|[\s([{])@clipboard(?=$|[\s)\]},.!?;:])/gi
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_TEXT_CHARS = 100_000
const MAX_HISTORY_IMAGES = 30
const RAYCAST_CLIPBOARD_DIR = join(homedir(), 'Library', 'Caches', 'com.raycast.macos', 'Clipboard')

type ClipboardImage = {
	bytes: Uint8Array
	mimeType: string
}

type ClipboardCandidate = {
	id: string
	label: string
	description: string
	filename: string
	mimeType: string
	path?: string
	bytes?: Uint8Array
}

type NativeClipboard = {
	hasImage(): boolean
	getImageBinary(): Promise<Uint8Array | number[] | null>
	getText(): Promise<string>
}

class ClipboardSplitPane implements Component {
	constructor(
		private readonly left: Component,
		private readonly right: Component,
		private readonly divider: (text: string) => string
	) {}

	invalidate(): void {
		this.left.invalidate()
		this.right.invalidate()
	}

	render(width: number): string[] {
		if (width < 88) {
			return [
				...this.left.render(width),
				this.divider('─'.repeat(Math.max(1, width))),
				...this.right.render(width),
			]
		}

		const dividerText = this.divider(' │ ')
		const dividerWidth = visibleWidth(dividerText)
		const leftWidth = Math.min(52, Math.max(34, Math.floor(width * 0.34)))
		const rightWidth = Math.max(1, width - leftWidth - dividerWidth)
		const leftLines = this.left.render(leftWidth)
		const rightLines = this.right.render(rightWidth)
		const lineCount = Math.max(leftLines.length, rightLines.length)
		const output: string[] = []

		for (let index = 0; index < lineCount; index++) {
			const rawLeft = leftLines[index] ?? ''
			const left =
				visibleWidth(rawLeft) > leftWidth
					? truncateToWidth(rawLeft, leftWidth, '')
					: `${rawLeft}${' '.repeat(Math.max(0, leftWidth - visibleWidth(rawLeft)))}`
			const rawRight = rightLines[index] ?? ''
			const right =
				visibleWidth(rawRight) > rightWidth ? truncateToWidth(rawRight, rightWidth, '') : rawRight
			output.push(`${left}${dividerText}${right}`)
		}
		return output
	}
}

function extractAtToken(textBeforeCursor: string): string | undefined {
	return textBeforeCursor.match(/(?:^|[\s([{])@([^\s@]*)$/)?.[1]
}

function createClipboardAutocompleteProvider(
	current: AutocompleteProvider,
	getClipboardItems: () => Promise<AutocompleteItem[]>
): AutocompleteProvider {
	return {
		triggerCharacters: [...new Set([...(current.triggerCharacters ?? []), '@'])],

		async getSuggestions(
			lines,
			cursorLine,
			cursorCol,
			options
		): Promise<AutocompleteSuggestions | null> {
			const currentSuggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options)
			if (options.signal.aborted) return null

			const line = lines[cursorLine] ?? ''
			const token = extractAtToken(line.slice(0, cursorCol))
			if (token === undefined) return currentSuggestions

			const clipboardItems = await getClipboardItems()
			if (options.signal.aborted) return null
			const matchingClipboardItems = clipboardItems.filter((item) =>
				item.label.slice(1).startsWith(token.toLowerCase())
			)
			if (matchingClipboardItems.length === 0) return currentSuggestions

			const prefix = `@${token}`
			const existingItems = currentSuggestions?.prefix === prefix ? currentSuggestions.items : []
			const clipboardLabels = new Set(clipboardItems.map((item) => item.label))
			return {
				prefix,
				items: [
					...matchingClipboardItems,
					...existingItems.filter((item) => !clipboardLabels.has(item.label)),
				],
			}
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix)
		},

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true
		},
	}
}

function getPiCliPath(): string | undefined {
	const cliPath = process.argv[1]
	if (!cliPath) return undefined
	try {
		return realpathSync(cliPath)
	} catch {
		return cliPath
	}
}

async function readClipboardImageFromPi(): Promise<ClipboardImage | null> {
	const cliPath = getPiCliPath()
	if (!cliPath) return null

	try {
		const modulePath = join(dirname(cliPath), 'utils', 'clipboard-image.js')
		const module = (await import(pathToFileURL(modulePath).href)) as {
			readClipboardImage(): Promise<ClipboardImage | null>
		}
		return await module.readClipboardImage()
	} catch {
		return null
	}
}

function loadNativeClipboard(): NativeClipboard | null {
	const requireRoots = [getPiCliPath(), import.meta.url].filter(
		(value): value is string => typeof value === 'string' && value.length > 0
	)

	for (const root of requireRoots) {
		try {
			const requireClipboard = root.startsWith('file:')
				? createRequire(root)
				: createRequire(pathToFileURL(root).href)
			return requireClipboard('@mariozechner/clipboard') as NativeClipboard
		} catch {
			// Try the next module-resolution root.
		}
	}
	return null
}

const MAC_PUBLIC_PNG_SCRIPT = `ObjC.import('AppKit');
const pasteboard = $.NSPasteboard.generalPasteboard;
const data = pasteboard.dataForType('public.png');
if (!data) {
  $.exit(2);
}
$.NSFileHandle.fileHandleWithStandardOutput.writeData(data);`

function readMacClipboardImage(): ClipboardImage | null {
	if (process.platform !== 'darwin') return null
	const result = spawnSync(
		'/usr/bin/osascript',
		['-l', 'JavaScript', '-e', MAC_PUBLIC_PNG_SCRIPT],
		{
			timeout: 5_000,
			maxBuffer: 50 * 1024 * 1024,
			stdio: ['ignore', 'pipe', 'ignore'],
		}
	)
	if (result.error || result.status !== 0 || !result.stdout || result.stdout.length === 0) {
		return null
	}
	return { bytes: new Uint8Array(result.stdout), mimeType: 'image/png' }
}

async function readNativeClipboardImage(
	nativeClipboard: NativeClipboard | null
): Promise<ClipboardImage | null> {
	try {
		if (!nativeClipboard?.hasImage()) return null
		const data = await nativeClipboard.getImageBinary()
		if (!data) return null
		const bytes = data instanceof Uint8Array ? data : Uint8Array.from(data)
		return bytes.byteLength > 0 ? { bytes, mimeType: 'image/png' } : null
	} catch {
		return null
	}
}

async function readCurrentClipboardImage(
	nativeClipboard: NativeClipboard | null
): Promise<ClipboardImage | null> {
	return (
		readMacClipboardImage() ??
		(await readClipboardImageFromPi()) ??
		(await readNativeClipboardImage(nativeClipboard))
	)
}

async function readClipboardText(pi: ExtensionAPI, nativeClipboard: NativeClipboard | null) {
	try {
		const text = await nativeClipboard?.getText()
		if (text) return text
	} catch {
		// Fall back to platform clipboard commands.
	}

	const commands: Array<{ command: string; args: string[] }> =
		process.platform === 'darwin'
			? [{ command: 'pbpaste', args: [] }]
			: process.platform === 'win32'
				? [
						{
							command: 'powershell.exe',
							args: ['-NoProfile', '-Command', 'Get-Clipboard -Raw'],
						},
					]
				: process.env.WAYLAND_DISPLAY
					? [{ command: 'wl-paste', args: ['--no-newline'] }]
					: [
							{ command: 'xclip', args: ['-selection', 'clipboard', '-o'] },
							{ command: 'xsel', args: ['--clipboard', '--output'] },
						]

	for (const { command, args } of commands) {
		const result = await pi.exec(command, args, { timeout: 5_000 })
		if (result.code === 0 && result.stdout) return result.stdout
	}
	return null
}

function replaceToken(text: string, pattern: RegExp, replacement: string): string {
	let replaced = false
	pattern.lastIndex = 0
	const result = text.replace(pattern, (_match, prefix: string) => {
		if (replaced) return `${prefix}[same clipboard item]`
		replaced = true
		return `${prefix}${replacement}`
	})
	pattern.lastIndex = 0
	return result
}

function hasToken(text: string, pattern: RegExp): boolean {
	pattern.lastIndex = 0
	const found = pattern.test(text)
	pattern.lastIndex = 0
	return found
}

function mimeTypeForPath(path: string): string | undefined {
	switch (extname(path).toLowerCase()) {
		case '.png':
			return 'image/png'
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg'
		case '.webp':
			return 'image/webp'
		case '.gif':
			return 'image/gif'
		default:
			return undefined
	}
}

function formatAge(timestamp: number): string {
	const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
	if (seconds < 60) return `${seconds}s ago`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	return `${Math.floor(hours / 24)}d ago`
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
	return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

async function loadClipboardCandidates(
	nativeClipboard: NativeClipboard | null
): Promise<ClipboardCandidate[]> {
	const candidates: ClipboardCandidate[] = []
	const current = await readCurrentClipboardImage(nativeClipboard)
	let currentHash: string | undefined
	if (current) {
		currentHash = createHash('sha256').update(current.bytes).digest('hex')
		candidates.push({
			id: 'current',
			label: 'Current clipboard',
			description: `${formatBytes(current.bytes.byteLength)} · live`,
			filename: `clipboard.${current.mimeType.split('/')[1] ?? 'png'}`,
			mimeType: current.mimeType,
			bytes: current.bytes,
		})
	}

	try {
		const entries = await readdir(RAYCAST_CLIPBOARD_DIR, { withFileTypes: true })
		const imageEntries = entries.filter(
			(entry) => entry.isFile() && mimeTypeForPath(entry.name) !== undefined
		)
		const withStats = await Promise.all(
			imageEntries.map(async (entry) => {
				const path = join(RAYCAST_CLIPBOARD_DIR, entry.name)
				try {
					return { entry, path, stats: await stat(path) }
				} catch {
					return null
				}
			})
		)
		for (const item of withStats
			.filter((item): item is NonNullable<typeof item> => item !== null)
			.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs)) {
			const fileHash = basename(item.entry.name, extname(item.entry.name))
			if (currentHash && fileHash === currentHash) continue
			const mimeType = mimeTypeForPath(item.path)
			if (!mimeType) continue
			candidates.push({
				id: item.entry.name,
				label: formatAge(item.stats.mtimeMs),
				description: `${formatBytes(item.stats.size)} · Raycast image history`,
				filename: item.entry.name,
				mimeType,
				path: item.path,
			})
			if (candidates.length >= MAX_HISTORY_IMAGES + (current ? 1 : 0)) break
		}
	} catch {
		// Raycast is optional; the live clipboard still works without it.
	}

	return candidates
}

async function getCandidateBytes(candidate: ClipboardCandidate): Promise<Uint8Array> {
	if (candidate.bytes) return candidate.bytes
	if (!candidate.path) throw new Error('Clipboard image is no longer available')
	return new Uint8Array(await readFile(candidate.path))
}

async function showClipboardViewer(
	ctx: Parameters<Parameters<ExtensionAPI['registerCommand']>[1]['handler']>[1],
	nativeClipboard: NativeClipboard | null
): Promise<ClipboardCandidate | null> {
	const candidates = await loadClipboardCandidates(nativeClipboard)
	if (candidates.length === 0) {
		ctx.ui.notify('No clipboard images found.', 'warning')
		return null
	}

	return ctx.ui.custom<ClipboardCandidate | null>((tui, theme, _keybindings, done) => {
		const left = new Container()
		const right = new Container()
		const items: SelectItem[] = candidates.map((candidate) => ({
			value: candidate.id,
			label: candidate.label,
			description: candidate.description,
		}))
		const list = new SelectList(items, Math.min(items.length, 16), {
			selectedPrefix: (text) => theme.fg('accent', text),
			selectedText: (text) => theme.fg('accent', text),
			description: (text) => theme.fg('muted', text),
			scrollInfo: (text) => theme.fg('dim', text),
			noMatch: (text) => theme.fg('warning', text),
		})
		left.addChild(new Text(theme.fg('accent', theme.bold('Clipboard images')), 1, 0))
		left.addChild(list)
		left.addChild(new Text(theme.fg('dim', '↑↓ browse · enter attach · esc cancel'), 1, 0))

		let selected = candidates[0]
		let preview: { candidateId: string; base64: string } | undefined
		let previewError: string | undefined
		let previewRequest = 0
		let gallery: ImageGallery | null = null
		const split = new ClipboardSplitPane(left, right, (text) => theme.fg('borderMuted', text))

		const disposeGallery = () => {
			gallery?.dispose()
			gallery = null
		}

		const rebuildRight = () => {
			disposeGallery()
			right.clear()
			const selectedPosition = candidates.findIndex((candidate) => candidate.id === selected.id) + 1
			right.addChild(
				new Text(
					theme.fg('accent', theme.bold(`Preview · ${selectedPosition}/${candidates.length}`)),
					1,
					0
				)
			)
			right.addChild(new Text(theme.fg('muted', selected.filename), 1, 0))
			if (preview?.candidateId === selected.id) {
				gallery = new ImageGallery(
					{
						accent: (text) => theme.fg('accent', text),
						muted: (text) => theme.fg('muted', text),
						dim: (text) => theme.fg('dim', text),
						bold: (text) => theme.bold(text),
					},
					{ maxWidthCells: 100, maxRows: 32, showHeader: false, showLabels: false }
				)
				gallery.setImages([
					{ data: preview.base64, mimeType: selected.mimeType, label: selected.filename },
				])
				right.addChild(gallery)
			} else if (previewError) {
				right.addChild(new Text(theme.fg('warning', previewError), 1, 1))
			} else {
				right.addChild(new Text(theme.fg('dim', 'Loading preview…'), 1, 1))
			}
			tui.requestRender()
		}

		const loadPreview = async (candidate: ClipboardCandidate) => {
			selected = candidate
			preview = undefined
			previewError = undefined
			const request = ++previewRequest
			rebuildRight()
			try {
				const bytes = await getCandidateBytes(candidate)
				if (request !== previewRequest) return
				preview = { candidateId: candidate.id, base64: Buffer.from(bytes).toString('base64') }
			} catch (error) {
				if (request !== previewRequest) return
				previewError = error instanceof Error ? error.message : 'Unable to load preview'
			}
			rebuildRight()
		}

		list.onSelectionChange = (item) => {
			const candidate = candidates.find((entry) => entry.id === item.value)
			if (candidate) void loadPreview(candidate)
		}
		list.onSelect = (item) => {
			disposeGallery()
			const candidate = candidates.find((entry) => entry.id === item.value)
			done(candidate ?? null)
		}
		list.onCancel = () => {
			disposeGallery()
			done(null)
		}

		void loadPreview(selected)
		return {
			render: (width) => split.render(width),
			invalidate: () => split.invalidate(),
			handleInput: (data) => {
				list.handleInput(data)
				tui.requestRender()
			},
		}
	})
}

export default function (pi: ExtensionAPI) {
	const nativeClipboard = loadNativeClipboard()
	const temporaryImageDirectories = new Set<string>()
	const materializedImages = new Map<string, string>()
	let clipboardItemsPromise: Promise<AutocompleteItem[]> | undefined
	let clipboardItemsExpiresAt = 0

	const materializeCandidatePath = async (candidate: ClipboardCandidate): Promise<string> => {
		if (candidate.path) return candidate.path
		const bytes = await getCandidateBytes(candidate)
		const hash = createHash('sha256').update(bytes).digest('hex')
		const existing = materializedImages.get(hash)
		if (existing) return existing

		const directory = await mkdtemp(join(tmpdir(), 'pi-clipboard-reference-'))
		temporaryImageDirectories.add(directory)
		const extension = extname(candidate.filename) || '.png'
		const path = join(directory, `clipboard${extension}`)
		await writeFile(path, bytes)
		materializedImages.set(hash, path)
		return path
	}

	const editorPath = (path: string) => path.replaceAll(' ', '\\ ')

	const getClipboardItems = async (): Promise<AutocompleteItem[]> => {
		if (!clipboardItemsPromise || Date.now() >= clipboardItemsExpiresAt) {
			clipboardItemsExpiresAt = Date.now() + 2_000
			clipboardItemsPromise = (async () => {
				const candidates = await loadClipboardCandidates(nativeClipboard)
				const latestImage = candidates[0]
				const currentImage = candidates.find((candidate) => candidate.id === 'current')
				const latestValue = latestImage
					? editorPath(await materializeCandidatePath(latestImage))
					: LATEST_IMAGE_TOKEN
				const currentValue = currentImage
					? editorPath(await materializeCandidatePath(currentImage))
					: CURRENT_TOKEN
				return [
					{
						value: latestValue,
						label: LATEST_IMAGE_TOKEN,
						description: latestImage
							? `Preview and attach ${latestImage.label}`
							: 'No current or recent image found',
					},
					{
						value: currentValue,
						label: CURRENT_TOKEN,
						description: currentImage
							? 'Preview and attach the current clipboard image'
							: 'Insert the exact current clipboard text',
					},
				]
			})()
		}
		return clipboardItemsPromise
	}

	pi.on('session_start', (_event, ctx) => {
		if (ctx.mode !== 'tui') return
		ctx.ui.addAutocompleteProvider((current) =>
			createClipboardAutocompleteProvider(current, getClipboardItems)
		)
	})

	pi.registerCommand('clipboard', {
		description: 'Browse current and recent Raycast clipboard images, preview one, and attach it',
		handler: async (_args, ctx) => {
			if (ctx.mode !== 'tui') {
				ctx.ui.notify('Clipboard viewer is available only in interactive mode.', 'warning')
				return
			}
			const selected = await showClipboardViewer(ctx, nativeClipboard)
			if (!selected) return

			try {
				const bytes = await getCandidateBytes(selected)
				if (bytes.byteLength > MAX_IMAGE_BYTES) {
					ctx.ui.notify(
						`Clipboard image is too large (${formatBytes(bytes.byteLength)}; max ${formatBytes(MAX_IMAGE_BYTES)}).`,
						'warning'
					)
					return
				}
				const path = editorPath(await materializeCandidatePath(selected))
				const existing = ctx.ui.getEditorText().trim()
				const editorText =
					existing && existing !== '/clipboard' ? `${existing} ${path}` : `${path} `
				ctx.ui.setEditorText(editorText)
				ctx.ui.notify('Image selected. Add your prompt and press Enter.', 'info')
			} catch (error) {
				ctx.ui.notify(
					error instanceof Error ? error.message : 'Unable to attach clipboard image',
					'error'
				)
			}
		},
	})

	pi.on('input', async (event, ctx) => {
		if (event.source !== 'interactive') return { action: 'continue' }

		let text = event.text
		const images: ImageContent[] = [...(event.images ?? [])]
		let transformed = false

		if (hasToken(text, LATEST_IMAGE_TOKEN_PATTERN)) {
			transformed = true
			const candidate = (await loadClipboardCandidates(nativeClipboard))[0]
			if (!candidate) {
				ctx.ui.notify('No current or recent Raycast clipboard image found.', 'warning')
				text = replaceToken(text, LATEST_IMAGE_TOKEN_PATTERN, '[no clipboard image was available]')
			} else {
				try {
					const bytes = await getCandidateBytes(candidate)
					if (bytes.byteLength > MAX_IMAGE_BYTES) {
						ctx.ui.notify(
							`Clipboard image is too large (${formatBytes(bytes.byteLength)}; max ${formatBytes(MAX_IMAGE_BYTES)}).`,
							'warning'
						)
						text = replaceToken(
							text,
							LATEST_IMAGE_TOKEN_PATTERN,
							'[clipboard image was too large to attach]'
						)
					} else {
						images.push({
							type: 'image',
							data: Buffer.from(bytes).toString('base64'),
							mimeType: candidate.mimeType,
						})
						text = replaceToken(
							text,
							LATEST_IMAGE_TOKEN_PATTERN,
							`[clipboard image attached: ${candidate.label}]`
						)
						ctx.ui.notify(`Attached clipboard image: ${candidate.label}.`, 'info')
					}
				} catch (error) {
					ctx.ui.notify(
						error instanceof Error ? error.message : 'Unable to attach clipboard image',
						'error'
					)
					text = replaceToken(text, LATEST_IMAGE_TOKEN_PATTERN, '[clipboard image was unavailable]')
				}
			}
		}

		if (hasToken(text, CURRENT_TOKEN_PATTERN)) {
			transformed = true
			const image = await readCurrentClipboardImage(nativeClipboard)
			if (image) {
				if (image.bytes.byteLength > MAX_IMAGE_BYTES) {
					ctx.ui.notify(
						`Clipboard image is too large (${formatBytes(image.bytes.byteLength)}; max ${formatBytes(MAX_IMAGE_BYTES)}).`,
						'warning'
					)
					text = replaceToken(
						text,
						CURRENT_TOKEN_PATTERN,
						'[clipboard image was too large to attach]'
					)
				} else {
					images.push({
						type: 'image',
						data: Buffer.from(image.bytes).toString('base64'),
						mimeType: image.mimeType,
					})
					text = replaceToken(text, CURRENT_TOKEN_PATTERN, '[clipboard image attached]')
					ctx.ui.notify('Attached image from clipboard.', 'info')
				}
			} else {
				const clipboardText = await readClipboardText(pi, nativeClipboard)
				if (clipboardText) {
					const truncated = clipboardText.length > MAX_TEXT_CHARS
					const replacement = truncated
						? `${clipboardText.slice(0, MAX_TEXT_CHARS)}\n[clipboard text truncated]`
						: clipboardText
					if (truncated) {
						ctx.ui.notify('Clipboard text was truncated to 100,000 characters.', 'warning')
					}
					text = replaceToken(text, CURRENT_TOKEN_PATTERN, replacement)
				} else {
					ctx.ui.notify('No image or text found in the clipboard.', 'warning')
					text = replaceToken(text, CURRENT_TOKEN_PATTERN, '[clipboard was empty or unavailable]')
				}
			}
		}

		if (!transformed) return { action: 'continue' }
		return { action: 'transform', text, images }
	})

	pi.on('session_shutdown', async () => {
		const directories = [...temporaryImageDirectories]
		temporaryImageDirectories.clear()
		materializedImages.clear()
		await Promise.allSettled(
			directories.map((directory) => rm(directory, { recursive: true, force: true }))
		)
	})
}

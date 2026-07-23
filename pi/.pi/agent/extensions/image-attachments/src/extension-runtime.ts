import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
} from '@earendil-works/pi-coding-agent'
import { Container, matchesKey, Text, type AutocompleteProvider } from '@earendil-works/pi-tui'
import type { ImageContent } from './content.ts'
import { debugLog } from './debug.ts'
import { ImageGallery } from './image-gallery.ts'
import { upgradeScreenshotToolResult } from './tool-result-upgrader.ts'
import {
	DRAFT_MEDIA_ACTIVATE_CHANNEL,
	DRAFT_MEDIA_COLLECT_CHANNEL,
	isDraftMediaActivateRequest,
	isDraftMediaCollectRequest,
} from '../../lib/draft-media.ts'

export type ExtensionDeps = {
	readImageContentFromPathAsync: (filePath: string) => Promise<ImageContent | null>
	maybeResizeImage?: (image: ImageContent) => Promise<ImageContent>
	loadImageContentFromPath: (filePath: string) => Promise<ImageContent | null>
}

type TrackedImage = {
	filePath: string
	image: ImageContent
	label: string
	placeholder: string
}

type EditableEditor = {
	handleInput(data: string): void
	getText(): string
	setText(text: string): void
	onSubmit?: (text: string) => void | Promise<void>
}

const WIDGET_KEY = 'image-attachments-preview'
const POLL_INTERVAL_MS = 200
const DEFAULT_KNOWN_SLASH_COMMANDS = [
	'settings',
	'model',
	'scoped-models',
	'export',
	'import',
	'share',
	'copy',
	'name',
	'session',
	'changelog',
	'hotkeys',
	'fork',
	'clone',
	'tree',
	'trust',
	'login',
	'logout',
	'new',
	'compact',
	'resume',
	'reload',
	'quit',
]
const IMAGE_PATH_RE = /((?:~\/|\.\.?\/|\/)(?:\\ |[^\s:*?"<>|])+\.(?:png|jpe?g|gif|webp))(?=\s|$)/gi

function unescapeEditorPath(path: string): string {
	return path.replaceAll('\\ ', ' ')
}

function imageNumber(placeholder: string): number {
	return Number.parseInt(placeholder.match(/\d+/)?.[0] ?? '0', 10)
}

function findInlineSlashCommand(text: string, knownCommands: Set<string>) {
	if (!/\[Image \d+]/.test(text)) return undefined

	let selected: { start: number; command: string } | undefined
	const commandPattern = /(^|\s)\/([a-z0-9:_-]+)(?=\s|$)/gi
	for (const match of text.matchAll(commandPattern)) {
		const command = match[2]
		if (!command || !knownCommands.has(command)) continue
		selected = {
			start: (match.index ?? 0) + (match[1]?.length ?? 0),
			command,
		}
	}
	if (!selected) return undefined

	const draft = text.slice(0, selected.start).trimEnd()
	const commandText = text.slice(selected.start).trim()
	return draft && commandText ? { draft, commandText, command: selected.command } : undefined
}

function createInlineSlashAutocompleteProvider(
	current: AutocompleteProvider,
	knownCommands: Set<string>
): AutocompleteProvider {
	const isInlineSlash = (lines: string[], cursorLine: number, cursorCol: number) => {
		const beforeCursor = (lines[cursorLine] ?? '').slice(0, cursorCol)
		const match = beforeCursor.match(/(?:^|\s)(\/[a-z0-9:_-]*)$/i)
		if (!match?.[1]) return undefined
		const draftBeforeCommand = beforeCursor.slice(0, -match[1].length)
		return /\[Image \d+]/.test(draftBeforeCommand) ? match[1] : undefined
	}

	return {
		triggerCharacters: [...new Set([...(current.triggerCharacters ?? []), '/'])],
		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const prefix = isInlineSlash(lines, cursorLine, cursorCol)
			if (!prefix) return current.getSuggestions(lines, cursorLine, cursorCol, options)

			const suggestions = await current.getSuggestions([prefix], 0, prefix.length, options)
			if (!suggestions) return null
			for (const item of suggestions.items) {
				const command = item.value.match(/^\/([^\s]+)/)?.[1]
				if (command) knownCommands.add(command)
			}
			return { ...suggestions, prefix }
		},
		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			if (!isInlineSlash(lines, cursorLine, cursorCol)) {
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix)
			}
			const updatedLines = [...lines]
			const line = updatedLines[cursorLine] ?? ''
			const insertionStart = cursorCol - prefix.length
			updatedLines[cursorLine] = line.slice(0, insertionStart) + item.value + line.slice(cursorCol)
			const command = item.value.match(/^\/([^\s]+)/)?.[1]
			if (command) knownCommands.add(command)
			return {
				lines: updatedLines,
				cursorLine,
				cursorCol: insertionStart + item.value.length,
			}
		},
		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			if (isInlineSlash(lines, cursorLine, cursorCol)) return false
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true
		},
	}
}

export function registerImagePreviewExtension(pi: ExtensionAPI, deps: ExtensionDeps): void {
	let tracked = new Map<string, TrackedImage>()
	let activePlaceholders = new Set<string>()
	let nextImageNumber = 1
	let expanded = false
	let selectedIndex = 0
	let gallery: ImageGallery | null = null
	let pollTimer: ReturnType<typeof setInterval> | null = null
	let editorHookTimer: ReturnType<typeof setTimeout> | null = null
	let latestCtx: ExtensionContext | null = null
	let scanInFlight = false
	let executingInlineCommand = false
	let draftGeneration = 0
	const pendingImages = new Map<string, Promise<void>>()
	const knownSlashCommands = new Set(DEFAULT_KNOWN_SLASH_COMMANDS)

	const allEntries = () =>
		[...tracked.values()].sort((a, b) => imageNumber(a.placeholder) - imageNumber(b.placeholder))
	const entries = () =>
		allEntries().filter((entry) => activePlaceholders.has(entry.placeholder))

	const disposeGallery = () => {
		gallery?.dispose()
		gallery = null
	}

	const clearPreviewWidget = (ctx: ExtensionContext) => {
		disposeGallery()
		ctx.ui.setWidget(WIDGET_KEY, undefined)
	}

	const refreshWidget = (ctx: ExtensionContext) => {
		const images = entries()
		if (!expanded || images.length === 0) {
			clearPreviewWidget(ctx)
			return
		}

		selectedIndex = Math.max(0, Math.min(selectedIndex, images.length - 1))
		const selected = images[selectedIndex]
		disposeGallery()
		ctx.ui.setWidget(
			WIDGET_KEY,
			(_tui, theme) => {
				const container = new Container()
				container.addChild(
					new Text(
						theme.fg(
							'accent',
							theme.bold(`${selected.placeholder} · ${selectedIndex + 1}/${images.length}`)
						),
						1,
						0
					)
				)
				gallery = new ImageGallery(
					{
						accent: (text) => theme.fg('accent', text),
						muted: (text) => theme.fg('muted', text),
						dim: (text) => theme.fg('dim', text),
						bold: (text) => theme.bold(text),
					},
					{ maxWidthCells: 110, maxRows: 32, showHeader: false, showLabels: false }
				)
				gallery.setImages([
					{
						data: selected.image.data,
						mimeType: selected.image.mimeType,
						label: selected.placeholder,
					},
				])
				container.addChild(gallery)
				container.addChild(
					new Text(
						theme.fg('dim', '[m previous · ]m next · <leader>x close'),
						1,
						0
					)
				)
				return container
			},
			{ placement: 'belowEditor' }
		)
	}

	const resetDraft = (ctx: ExtensionContext) => {
		draftGeneration++
		executingInlineCommand = false
		tracked = new Map()
		activePlaceholders = new Set()
		pendingImages.clear()
		nextImageNumber = 1
		expanded = false
		selectedIndex = 0
		clearPreviewWidget(ctx)
	}

	const scanEditorText = async (ctx: ExtensionContext) => {
		let text: string
		try {
			text = ctx.ui.getEditorText()
		} catch (error) {
			debugLog('Failed to read editor text', error)
			return
		}

		let nextText = text
		let changed = false
		const matches = [...text.matchAll(new RegExp(IMAGE_PATH_RE.source, IMAGE_PATH_RE.flags))]

		for (const match of matches) {
			const rawPath = match[1]
			if (!rawPath) continue
			const filePath = unescapeEditorPath(rawPath)
			const image = await deps.readImageContentFromPathAsync(filePath)
			if (!image) continue

			const placeholder = `[Image ${nextImageNumber++}]`
			const entry: TrackedImage = { filePath, image, label: placeholder, placeholder }
			tracked.set(placeholder, entry)
			const pathIndex = nextText.indexOf(rawPath)
			if (pathIndex >= 0) {
				nextText = `${nextText.slice(0, pathIndex)}${placeholder}${nextText.slice(pathIndex + rawPath.length)}`
			}
			changed = true

			if (deps.maybeResizeImage) {
				void deps
					.maybeResizeImage(image)
					.then((resized) => {
						if (tracked.get(placeholder) === entry) {
							entry.image = resized
							if (latestCtx) refreshWidget(latestCtx)
						}
					})
					.catch((error) => debugLog(`Failed to resize ${filePath}`, error))
			}
		}

		const nextActivePlaceholders = new Set(
			[...tracked.keys()].filter((placeholder) => nextText.includes(placeholder))
		)
		if (
			nextActivePlaceholders.size !== activePlaceholders.size ||
			[...nextActivePlaceholders].some((placeholder) => !activePlaceholders.has(placeholder))
		) {
			changed = true
		}
		activePlaceholders = nextActivePlaceholders

		if (nextText !== text) ctx.ui.setEditorText(nextText)
		if (changed) {
			selectedIndex = Math.max(0, Math.min(selectedIndex, entries().length - 1))
			refreshWidget(ctx)
		}
	}

	const captureReservedImage = async (
		ctx: ExtensionContext,
		filePath: string,
		rawPath: string,
		placeholder: string,
		generation: number
	) => {
		const image = await deps.readImageContentFromPathAsync(filePath)
		if (generation !== draftGeneration) return

		const editorText = ctx.ui.getEditorText()
		if (!editorText.includes(placeholder)) return
		if (!image) {
			ctx.ui.setEditorText(editorText.replace(placeholder, rawPath))
			return
		}

		const entry: TrackedImage = { filePath, image, label: placeholder, placeholder }
		tracked.set(placeholder, entry)
		activePlaceholders.add(placeholder)
		refreshWidget(ctx)

		if (deps.maybeResizeImage) {
			void deps
				.maybeResizeImage(image)
				.then((resized) => {
					if (generation === draftGeneration && tracked.get(placeholder) === entry) {
						entry.image = resized
						refreshWidget(ctx)
					}
				})
				.catch((error) => debugLog(`Failed to resize ${filePath}`, error))
		}
	}

	const reservePastedImagePaths = (ctx: ExtensionContext, editor: EditableEditor) => {
		const currentText = editor.getText()
		const reservations: Array<{ filePath: string; rawPath: string; placeholder: string }> = []
		const nextText = currentText.replace(
			new RegExp(IMAGE_PATH_RE.source, IMAGE_PATH_RE.flags),
			(rawPath: string) => {
				const placeholder = `[Image ${nextImageNumber++}]`
				reservations.push({ filePath: unescapeEditorPath(rawPath), rawPath, placeholder })
				return placeholder
			}
		)
		if (reservations.length === 0) return

		// This runs in the same input event as the terminal paste, before the TUI can
		// render the inserted path, so the user only sees the compact placeholder.
		editor.setText(nextText)
		const generation = draftGeneration
		for (const reservation of reservations) {
			let promise: Promise<void>
			promise = captureReservedImage(
				ctx,
				reservation.filePath,
				reservation.rawPath,
				reservation.placeholder,
				generation
			)
				.catch((error) => debugLog(`Failed to capture ${reservation.filePath}`, error))
				.finally(() => {
					if (pendingImages.get(reservation.placeholder) === promise) {
						pendingImages.delete(reservation.placeholder)
					}
				})
			pendingImages.set(reservation.placeholder, promise)
		}
	}

	const installEditorHook = (ctx: ExtensionContext) => {
		const previousFactory = ctx.ui.getEditorComponent()
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			const editor = previousFactory
				? previousFactory(tui, theme, keybindings)
				: new CustomEditor(tui, theme, keybindings)
			let draftToRestore: string | undefined
			let submitHandler = editor.onSubmit

			const wrappedSubmit = (text: string) => {
				const draft = draftToRestore
				draftToRestore = undefined
				const restoreDraft = () => {
					executingInlineCommand = false
					if (!draft || latestCtx !== ctx) return
					if (!editor.getText().trim()) editor.setText(draft)
				}

				try {
					const result = submitHandler?.(text)
					if (draft) void Promise.resolve(result).finally(restoreDraft)
					return result
				} catch (error) {
					restoreDraft()
					throw error
				}
			}

			Object.defineProperty(editor, 'onSubmit', {
				configurable: true,
				get: () => wrappedSubmit,
				set: (handler: typeof submitHandler) => {
					submitHandler = handler
				},
			})

			const originalHandleInput = editor.handleInput.bind(editor)
			editor.handleInput = (data: string) => {
				if (matchesKey(data, 'enter')) {
					const inlineCommand = findInlineSlashCommand(editor.getText(), knownSlashCommands)
					if (inlineCommand) {
						draftToRestore = inlineCommand.draft
						executingInlineCommand = true
						editor.setText(inlineCommand.commandText)
					}
				}

				originalHandleInput(data)
				const completedPaste = data.includes('\x1b[201~')
				const bulkPlainText = !data.includes('\x1b') && data.length > 1
				if (completedPaste || bulkPlainText) reservePastedImagePaths(ctx, editor)
			}
			return editor
		})
	}

	const stopPolling = () => {
		if (!pollTimer) return
		clearInterval(pollTimer)
		pollTimer = null
	}

	const startPolling = () => {
		stopPolling()
		pollTimer = setInterval(() => {
			if (!latestCtx || scanInFlight) return
			scanInFlight = true
			void scanEditorText(latestCtx).finally(() => {
				scanInFlight = false
			})
		}, POLL_INTERVAL_MS)
		pollTimer.unref?.()
	}

	const offMediaCollect = pi.events.on(DRAFT_MEDIA_COLLECT_CHANNEL, (value) => {
		if (!isDraftMediaCollectRequest(value)) return
		for (const match of value.text.matchAll(/\[Image \d+]/g)) {
			const placeholder = match[0]
			if (!placeholder || !tracked.has(placeholder) || match.index === undefined) continue
			value.items.push({
				provider: 'image',
				id: placeholder,
				label: placeholder,
				start: match.index,
				end: match.index + placeholder.length,
			})
		}
	})

	const offMediaActivate = pi.events.on(DRAFT_MEDIA_ACTIVATE_CHANNEL, (value) => {
		if (!latestCtx || !isDraftMediaActivateRequest(value)) return
		if (value.item.provider !== 'image') {
			if (expanded) {
				expanded = false
				refreshWidget(latestCtx)
			}
			return
		}

		const images = entries()
		const index = images.findIndex((image) => image.placeholder === value.item.id)
		if (index < 0) return
		const isCurrent = expanded && selectedIndex === index
		selectedIndex = index
		expanded = value.toggle && isCurrent ? false : true
		value.handled = true
		refreshWidget(latestCtx)
	})

	pi.on('session_start', async (_event, ctx) => {
		latestCtx = ctx
		resetDraft(ctx)
		startPolling()
		if (ctx.mode === 'tui') {
			ctx.ui.addAutocompleteProvider((current) =>
				createInlineSlashAutocompleteProvider(current, knownSlashCommands)
			)
		}
		// Other extensions may install their own editor during session_start. Defer
		// by one task so we can decorate the final editor rather than replace it.
		editorHookTimer = setTimeout(() => {
			editorHookTimer = null
			if (latestCtx === ctx) installEditorHook(ctx)
		}, 0)
	})

	pi.on('session_shutdown', async () => {
		stopPolling()
		if (editorHookTimer) clearTimeout(editorHookTimer)
		editorHookTimer = null
		disposeGallery()
		latestCtx = null
		scanInFlight = false
		executingInlineCommand = false
		offMediaCollect()
		offMediaActivate()
	})

	pi.on('tool_result', async (event, ctx) => {
		latestCtx = ctx
		return upgradeScreenshotToolResult(event as never, ctx.cwd, deps.loadImageContentFromPath)
	})

	pi.on('input', async (event, ctx) => {
		latestCtx = ctx
		if (pendingImages.size > 0) {
			await Promise.allSettled([...pendingImages.values()])
		}
		if (tracked.size === 0) return { action: 'continue' }

		const fullText = (event.text || '').trim()
		if (fullText.startsWith('/') || fullText.startsWith('!')) return { action: 'continue' }

		const used = allEntries()
			.filter((entry) => fullText.includes(entry.placeholder))
			.sort((a, b) => fullText.indexOf(a.placeholder) - fullText.indexOf(b.placeholder))
		if (used.length === 0) return { action: 'continue' }

		resetDraft(ctx)
		return {
			action: 'transform',
			text: fullText,
			images: [...(event.images ?? []), ...used.map((entry) => entry.image)],
		}
	})
}

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import {
	type AutocompleteItem,
	type AutocompleteProvider,
	fuzzyFilter,
} from '@earendil-works/pi-tui'

type OpenDoc = { id: string; filePath: string; name: string; ownership: string }
type DocPage = { id: string; name: string }

type SearchResponse<T> = { success: true; result: T } | { success: false; error: string }

const SERVER_FILE = join(homedir(), 'Library/Application Support/tldraw (Nightly)/server.json')
const ROUTE = 'tldraw/'
const MAX_SUGGESTIONS = 20

function quoteRoute(rest: string): string {
	return `@${JSON.stringify(`${ROUTE}${rest}`)}`
}

// Prefer readable names; use a path or id only when names would be ambiguous.
function docKey(doc: OpenDoc, docs: OpenDoc[]): string {
	const name = basename(doc.filePath)
	return docs.filter((item) => basename(item.filePath) === name).length === 1 ? name : doc.filePath
}

function pageKey(page: DocPage, pages: DocPage[]): string {
	return pages.filter((item) => item.name === page.name).length === 1 ? page.name : page.id
}

async function request<T>(path: string, code: string, signal?: AbortSignal): Promise<T> {
	const { port, token } = JSON.parse(await readFile(SERVER_FILE, 'utf8')) as {
		port: number
		token: string
	}
	if (!Number.isInteger(port) || port < 1 || port > 65535 || !token) {
		throw new Error('tldraw offline server configuration is invalid')
	}
	const response = await fetch(`http://127.0.0.1:${port}${path}`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ code }),
		signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(4000)]),
	})
	if (!response.ok) throw new Error(`tldraw offline returned HTTP ${response.status}`)
	const payload = (await response.json()) as SearchResponse<T>
	if (!payload.success) throw new Error(payload.error || 'tldraw offline request failed')
	return payload.result
}

async function getOpenDocs(signal?: AbortSignal): Promise<OpenDoc[]> {
	const docs = await request<OpenDoc[]>('/api/search', 'return await api.getDocs()', signal)
	return docs.filter((doc) => doc.ownership === 'local' && typeof doc.filePath === 'string')
}

async function getDocPages(doc: OpenDoc, signal?: AbortSignal): Promise<DocPage[]> {
	// Local document ids consist of a prefix and base64url-encoded file path.
	if (!/^tldr:file:[A-Za-z0-9_-]+$/.test(doc.id)) throw new Error('Invalid local document id')
	return request<DocPage[]>(
		`/api/doc/${doc.id}/exec`,
		'return editor.getPages().map(page => ({ id: page.id, name: page.name }))',
		signal
	)
}

function createProvider(current: AutocompleteProvider): AutocompleteProvider {
	return {
		triggerCharacters: current.triggerCharacters,
		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const before = (lines[cursorLine] ?? '').slice(0, cursorCol)
			const token = before.match(/(?:^|[\s([{])(@"tldraw(?:\/(?:\\.|[^"\\])*)?)$/)?.[1]
				?? before.match(/(?:^|[\s([{])(@tldraw(?:\/[^\s]*)?)$/)?.[1]
			if (!token) {
				const partial = before.match(/(?:^|[\s([{])@([^\s@]*)$/)?.[1]
				if (!partial || !'tldraw'.startsWith(partial.toLowerCase())) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options)
				}
				const existing = await current.getSuggestions(lines, cursorLine, cursorCol, options)
				let openDocs: OpenDoc[] = []
				try { openDocs = await getOpenDocs(options.signal) } catch { /* Still offer the tldraw shortcut. */ }
				if (options.signal.aborted) return null
				const prefix = `@${partial}`
				return {
					prefix,
					items: [
						{ value: '@tldraw/', label: 'tldraw/', description: 'Open tldraw offline files' },
						...openDocs.map((doc): AutocompleteItem => ({
							value: quoteRoute(`${docKey(doc, openDocs)}/`),
							label: `${basename(doc.filePath)}/`,
							description: `tldraw offline — ${doc.filePath}`,
						})),
						...(existing?.prefix === prefix ? existing.items : []),
					].slice(0, MAX_SUGGESTIONS),
				}
			}

			let docs: OpenDoc[]
			try {
				docs = await getOpenDocs(options.signal)
			} catch {
				return current.getSuggestions(lines, cursorLine, cursorCol, options)
			}
			if (options.signal.aborted) return null

			const rawRest = token.startsWith(`@"${ROUTE}`) ? token.slice(ROUTE.length + 2)
				: token.startsWith(`@${ROUTE}`) ? token.slice(ROUTE.length + 1) : ''
			let rest = rawRest
			try { rest = JSON.parse(`"${rawRest}"`) as string } catch { /* Incomplete escape while typing. */ }
			const doc = docs.find((item) => rest.startsWith(`${docKey(item, docs)}/`))
			if (doc) {
				let pages: DocPage[]
				try {
					pages = await getDocPages(doc, options.signal)
				} catch {
					return null
				}
				if (options.signal.aborted) return null
				const query = rest.slice(docKey(doc, docs).length + 1)
				const matches = fuzzyFilter(pages, query, (page) => page.name).slice(0, MAX_SUGGESTIONS)
				return matches.length ? {
					prefix: token,
					items: matches.map((page) => ({
						value: quoteRoute(`${docKey(doc, docs)}/${pageKey(page, pages)}`),
						label: page.name,
						description: basename(doc.filePath),
					})),
				} : null
			}

			const matches = fuzzyFilter(docs, rest, (item) => `${basename(item.filePath)} ${item.filePath}`)
				.slice(0, MAX_SUGGESTIONS)
			return matches.length ? {
				prefix: token,
				items: matches.map((item): AutocompleteItem => ({
					value: quoteRoute(`${docKey(item, docs)}/`),
					label: `${basename(item.filePath)}/`,
					description: item.filePath,
				})),
			} : null
		},
		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix)
		},
		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true
		},
	}
}

async function resolveTldrawMention(route: string): Promise<string> {
	let reference: string
	try { reference = JSON.parse(route.slice(1)) as string } catch {
		return `[Invalid tldraw mention: ${route}]`
	}
	if (!reference.startsWith(ROUTE)) return `[Unrecognized tldraw mention: ${route}]`
	const rest = reference.slice(ROUTE.length)
	const docs = await getOpenDocs()
	const candidates = docs.filter((item) => rest === docKey(item, docs) || rest.startsWith(`${docKey(item, docs)}/`))
	const doc = candidates.length === 1 ? candidates[0] : undefined
	if (!doc) return `[Tldraw file is no longer open or is ambiguous: ${rest}]`
	const pageNameOrId = rest.slice(docKey(doc, docs).length).replace(/^\//, '')
	const pages = await getDocPages(doc)
	if (!pageNameOrId) {
		return `[Open tldraw offline file: ${JSON.stringify(doc.filePath)}; docId: ${JSON.stringify(doc.id)}; pages: ${pages.map((page) => `${JSON.stringify(page.name)} (${page.id})`).join(', ')}. Inspect with the tldraw-offline skill; do not switch the app's page merely to inspect it.]`
	}
	const page = pages.find((item) => pageKey(item, pages) === pageNameOrId)
	if (!page) return `[Tldraw page is no longer present or is ambiguous in ${JSON.stringify(doc.filePath)}: ${pageNameOrId}]`
	return `[Open tldraw offline page: ${JSON.stringify(page.name)}; filePath: ${JSON.stringify(doc.filePath)}; docId: ${JSON.stringify(doc.id)}; pageId: ${JSON.stringify(page.id)}. Inspect with the tldraw-offline skill before acting: /api/doc/:id/exec can read editor.getPageShapeIds(pageId) and editor.getShape(id) without changing the current page. Edit only when the user requests an edit.]`
}

export default function (pi: ExtensionAPI): void {
	pi.on('session_start', (_event, ctx) => {
		if (ctx.mode === 'tui') ctx.ui.addAutocompleteProvider(createProvider)
	})

	pi.on('input', async (event, ctx) => {
		if (event.source === 'extension') return { action: 'continue' }
		const mentions = [...event.text.matchAll(/(?<![\w@])@"tldraw\/(?:\\.|[^"\\])*"/g)]
		if (mentions.length === 0) return { action: 'continue' }

		let text = ''
		let offset = 0
		for (const match of mentions) {
			text += event.text.slice(offset, match.index)
			try {
				text += await resolveTldrawMention(match[0])
			} catch {
				text += `[Unable to inspect tldraw offline reference ${match[0]}: the app may be closed or unresponsive]`
				if (ctx.hasUI) ctx.ui.notify('Unable to resolve tldraw mention; is tldraw offline running?', 'warning')
			}
			offset = match.index + match[0].length
		}
		return { action: 'transform', text: text + event.text.slice(offset), images: event.images }
	})
}

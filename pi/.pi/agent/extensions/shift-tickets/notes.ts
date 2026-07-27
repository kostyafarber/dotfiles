import { constants } from 'node:fs'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, relative, sep } from 'node:path'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import type { TicketMarkerMatch, TicketNote } from './types.ts'

const SHIFT_REPOSITORY = 'shift-editor/shift'
const MARKER_PATTERN_SOURCE = String.raw`\[Ticket ([1-9]\d*)\]`

function cleanLine(value: string): string {
	return value
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function frontmatter(content: string): string | undefined {
	if (!content.startsWith('---\n')) return undefined
	const end = content.indexOf('\n---\n', 4)
	return end < 0 ? undefined : content.slice(4, end)
}

function metadataValue(content: string, key: string): string | undefined {
	const block = frontmatter(content)
	if (block) {
		const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))
		if (match?.[1]) return cleanLine(match[1])
	}

	const head = content.split('\n').slice(0, 30).join('\n')
	const match = head.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))
	return match?.[1] ? cleanLine(match[1]) : undefined
}

export function parseTicketNote(path: string, relativePath: string, content: string): TicketNote {
	const heading = content.match(/^#\s+(.+)$/m)?.[1]
	const fallbackTitle = basename(path, extname(path))

	return {
		id: relativePath,
		path,
		relativePath,
		title: cleanLine(heading ?? fallbackTitle),
		status: metadataValue(content, 'status'),
		noteType: metadataValue(content, 'type'),
		content,
	}
}

async function markdownPaths(directory: string): Promise<string[]> {
	const paths: string[] = []
	const entries = await readdir(directory, { withFileTypes: true })

	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue
		const path = join(directory, entry.name)
		if (entry.isDirectory()) {
			paths.push(...(await markdownPaths(path)))
			continue
		}
		if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') paths.push(path)
	}

	return paths
}

export async function discoverTicketNotes(vaultPath: string): Promise<TicketNote[]> {
	const paths = await markdownPaths(vaultPath)
	const notes = await Promise.all(
		paths.map(async (path) => {
			const relativePath = relative(vaultPath, path).split(sep).join('/')
			return parseTicketNote(path, relativePath, await readFile(path, 'utf8'))
		})
	)

	return notes.sort((left, right) =>
		left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: 'base' })
	)
}

export function ticketMarker(number: number): string {
	return `[Ticket ${number}]`
}

export function ticketMarkerMatches(text: string): TicketMarkerMatch[] {
	const matches: TicketMarkerMatch[] = []

	for (const match of text.matchAll(new RegExp(MARKER_PATTERN_SOURCE, 'g'))) {
		if (match.index === undefined) continue
		matches.push({
			marker: match[0],
			start: match.index,
			end: match.index + match[0].length,
		})
	}

	return matches
}

export function parseTicketMarkers(text: string): string[] {
	const markers: string[] = []
	const seen = new Set<string>()

	for (const match of ticketMarkerMatches(text)) {
		if (seen.has(match.marker)) continue
		seen.add(match.marker)
		markers.push(match.marker)
	}

	return markers
}

export function isShiftRemote(remote: string): boolean {
	const normalized = remote.trim().replace(/\.git$/i, '')
	return new RegExp(`github\\.com[/:]${SHIFT_REPOSITORY.replace('/', '\\/')}$`, 'i').test(
		normalized
	)
}

export async function isShiftTicketEnvironment(
	pi: ExtensionAPI,
	cwd: string,
	vaultPath: string
): Promise<boolean> {
	try {
		const vault = await stat(vaultPath)
		if (!vault.isDirectory()) return false
		await access(vaultPath, constants.R_OK)
	} catch {
		return false
	}

	const remote = await pi.exec('git', ['config', '--get', 'remote.origin.url'], {
		cwd,
		timeout: 5_000,
	})
	return remote.code === 0 && isShiftRemote(remote.stdout)
}

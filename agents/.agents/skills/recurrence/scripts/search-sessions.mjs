#!/usr/bin/env node
// Search past agent sessions (Claude Code and pi) for a pattern; print one block per session,
// newest first, with the session's first prompt and the matching snippets.
//
//   search-sessions.mjs <regex> [--days N] [--project SUBSTRING] [--limit N] [--hits N]
//
// Logs: ~/.claude/projects/*/*.jsonl and ~/.pi/agent/sessions/*/*.jsonl. Extra roots can be added
// with SESSION_LOG_DIRS (colon-separated).
import { createReadStream, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
	const i = args.indexOf(`--${name}`)
	if (i === -1) return fallback
	const value = args[i + 1]
	args.splice(i, 2)
	return value
}
const days = Number(flag('days', 365))
const project = flag('project', '')
const limit = Number(flag('limit', 20))
const hitsPerSession = Number(flag('hits', 3))
if (!args[0]) {
	console.error('usage: search-sessions.mjs <regex> [--days N] [--project S] [--limit N] [--hits N]')
	process.exit(2)
}
const pattern = new RegExp(args[0], 'i')
const since = Date.now() - days * 86_400_000

const roots = [
	join(homedir(), '.claude/projects'),
	join(homedir(), '.pi/agent/sessions'),
	...(process.env.SESSION_LOG_DIRS?.split(':').filter(Boolean) ?? []),
]

const files = []
for (const root of roots) {
	let dirs
	try {
		dirs = readdirSync(root, { withFileTypes: true })
	} catch {
		continue
	}
	for (const dir of dirs) {
		if (!dir.isDirectory() || !dir.name.includes(project)) continue
		for (const name of readdirSync(join(root, dir.name))) {
			if (!name.endsWith('.jsonl')) continue
			const path = join(root, dir.name, name)
			const mtime = statSync(path).mtimeMs
			if (mtime >= since) files.push({ path, project: dir.name, mtime })
		}
	}
}
files.sort((a, b) => b.mtime - a.mtime)

/** Every string a log line carries as conversation text, wherever the tool nests it. */
function texts(value, out = []) {
	if (typeof value === 'string') out.push(value)
	else if (Array.isArray(value)) for (const item of value) texts(item, out)
	else if (value && typeof value === 'object') {
		for (const [key, inner] of Object.entries(value)) {
			if (key === 'signature' || key === 'id' || key === 'parentUuid' || key === 'uuid') continue
			texts(inner, out)
		}
	}
	return out
}

function snippet(text, match) {
	const start = Math.max(0, match.index - 100)
	const end = Math.min(text.length, match.index + match[0].length + 140)
	return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`.replace(
		/\s+/g,
		' '
	)
}

let printed = 0
for (const file of files) {
	if (printed >= limit) break
	let firstPrompt = null
	const hits = []
	const lines = createInterface({ input: createReadStream(file.path), crlfDelay: Infinity })
	for await (const line of lines) {
		let entry
		try {
			entry = JSON.parse(line)
		} catch {
			continue
		}
		const role = entry.message?.role ?? entry.type
		const message = entry.message ?? entry
		if (!firstPrompt && role === 'user' && typeof message.content === 'string') {
			if (!message.content.startsWith('<')) firstPrompt = message.content.slice(0, 160)
		}
		if (hits.length >= hitsPerSession) continue
		for (const text of texts(message.content ?? message)) {
			const match = pattern.exec(text)
			if (!match) continue
			hits.push({ when: entry.timestamp?.slice(0, 16) ?? '', role, text: snippet(text, match) })
			break
		}
	}
	if (hits.length === 0) continue
	printed++
	const day = new Date(file.mtime).toISOString().slice(0, 10)
	console.log(`## ${day}  ${file.project}  ${file.path}`)
	if (firstPrompt) console.log(`   started with: ${firstPrompt.replace(/\s+/g, ' ')}`)
	for (const hit of hits) console.log(`   [${hit.when} ${hit.role}] ${hit.text}`)
	console.log()
}
if (printed === 0) console.log(`no session in the last ${days} days matches /${args[0]}/i`)

import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, DEFAULT_MAX_LINES, truncateHead } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	Container,
	fuzzyFilter,
	type AutocompleteItem,
	type AutocompleteProvider,
	type AutocompleteSuggestions,
	type SelectItem,
	SelectList,
	Text,
} from "@earendil-works/pi-tui";

const VAULT_ROOT = "/Users/kostyafarber/Documents/KostyaVault";
const PROJECTS_ROOT = join(VAULT_ROOT, "projects");
const MAX_AUTOCOMPLETE = 20;
const MAX_COMMAND_ITEMS = 80;
const MAX_SEARCH_RESULTS = 20;
const MAX_INJECTED_NOTE_BYTES = 30_000;
const MAX_INJECTED_NOTES = 5;

const SKIPPED_DIRS = new Set([".git", ".obsidian", ".trash", "node_modules"]);

type Note = {
	absolutePath: string;
	relativePath: string;
	title: string;
	basename: string;
	scope: "project" | "vault";
};

type SearchMatch = {
	absolutePath: string;
	relativePath: string;
	line: number;
	preview: string;
};

type SearchResult = {
	query: string;
	output: string;
	matches: SearchMatch[];
	truncated: boolean;
	error?: string;
};

function normalizeQuery(value: string): string {
	return value.trim().replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0]?.trim() ?? "";
}

function noteSearchText(note: Note): string {
	return `${note.title} ${note.basename} ${note.relativePath}`;
}

function noteLabel(note: Note): string {
	return note.title === note.basename ? note.title : `${note.title} (${note.basename})`;
}

function noteDescription(note: Note): string {
	return `${note.scope} • ${note.relativePath}`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseRipgrepMatch(line: string): SearchMatch | undefined {
	const match = line.match(/^(.+?):(\d+):(.*)$/);
	if (!match) return undefined;

	const absolutePath = match[1];
	const lineNumber = Number(match[2]);
	const preview = match[3]?.trim() ?? "";
	if (!absolutePath || !Number.isFinite(lineNumber)) return undefined;

	return {
		absolutePath,
		relativePath: absolutePath.startsWith(`${VAULT_ROOT}/`) ? absolutePath.slice(VAULT_ROOT.length + 1) : absolutePath,
		line: lineNumber,
		preview,
	};
}

function highlightQuery(text: string, query: string, theme: { fg: (color: "accent", value: string) => string }): string {
	const normalized = query.trim();
	if (!normalized) return text;

	const pattern = new RegExp(escapeRegExp(normalized), "ig");
	return text.replace(pattern, (match) => theme.fg("accent", match));
}

function renderSearchResult(result: SearchResult, theme: any): Text {
	if (result.matches.length === 0) {
		const message = result.error ? `Search failed: ${result.error}` : "No matching Obsidian notes found";
		return new Text(theme.fg(result.error ? "error" : "warning", message), 0, 0);
	}

	const lines = [`${theme.fg("accent", "◆")} ${theme.bold("Obsidian matches")} ${theme.fg("muted", `for “${result.query}”`)}`];

	for (const match of result.matches) {
		lines.push(`${theme.fg("accent", match.relativePath)}${theme.fg("dim", `:${match.line}`)}`);
		lines.push(`  ${highlightQuery(match.preview, result.query, theme)}`);
	}

	if (result.truncated) {
		lines.push(theme.fg("dim", `… showing first ${result.matches.length} matches`));
	}

	return new Text(lines.join("\n"), 0, 0);
}

async function walkMarkdownFiles(root: string): Promise<string[]> {
	const files: string[] = [];

	async function visit(dir: string): Promise<void> {
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			if (entry.name.startsWith(".") || SKIPPED_DIRS.has(entry.name)) {
				continue;
			}

			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				await visit(path);
				continue;
			}

			if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
				files.push(path);
			}
		}
	}

	await visit(root);
	return files;
}

function extractTitle(content: string, path: string): string {
	const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
	if (heading) return heading;

	return basename(path, extname(path));
}

async function buildIndex(): Promise<Note[]> {
	const files = await walkMarkdownFiles(VAULT_ROOT);
	const notes = await Promise.all(
		files.map(async (absolutePath): Promise<Note> => {
			let content = "";
			try {
				content = await readFile(absolutePath, "utf8");
			} catch {
				// Keep the note discoverable even if title extraction fails.
			}

			const relativePath = relative(VAULT_ROOT, absolutePath);
			return {
				absolutePath,
				relativePath,
				title: extractTitle(content, absolutePath),
				basename: basename(absolutePath, extname(absolutePath)),
				scope: absolutePath.startsWith(PROJECTS_ROOT) ? "project" : "vault",
			};
		}),
	);

	return notes.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function filterNotes(notes: Note[], query: string, options?: { projectsOnly?: boolean; limit?: number }): Note[] {
	const scoped = options?.projectsOnly ? notes.filter((note) => note.scope === "project") : notes;
	const limit = options?.limit ?? MAX_COMMAND_ITEMS;
	const normalized = normalizeQuery(query);

	if (!normalized) {
		return scoped.slice(0, limit);
	}

	return fuzzyFilter(scoped, normalized, noteSearchText).slice(0, limit);
}

function resolveNote(notes: Note[], rawToken: string): Note | undefined {
	const token = normalizeQuery(rawToken);
	if (!token) return undefined;

	const exact = notes.find(
		(note) =>
			note.relativePath === token ||
			note.relativePath.replace(/\.md$/i, "") === token ||
			note.title === token ||
			note.basename === token,
	);
	if (exact) return exact;

	return filterNotes(notes, token, { limit: 1 })[0];
}

function extractWikiToken(textBeforeCursor: string): string | undefined {
	return textBeforeCursor.match(/(?:^|[\s])\[\[([^\]\n]*)$/)?.[1];
}

function createAutocompleteProvider(current: AutocompleteProvider, getNotes: () => Promise<Note[]>): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
			const line = lines[cursorLine] ?? "";
			const token = extractWikiToken(line.slice(0, cursorCol));
			if (token === undefined) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const notes = await getNotes();
			if (options.signal.aborted) return null;

			const items: AutocompleteItem[] = filterNotes(notes, token, { limit: MAX_AUTOCOMPLETE }).map((note) => ({
				value: `[[${note.relativePath}]]`,
				label: noteLabel(note),
				description: noteDescription(note),
			}));

			if (items.length === 0) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			return { prefix: `[[${token}`, items };
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

async function showNotePicker(ctx: ExtensionContext, notes: Note[], options: { query: string; projectsOnly: boolean }): Promise<void> {
	if (!ctx.hasUI) return;

	const matches = filterNotes(notes, options.query, { projectsOnly: options.projectsOnly, limit: MAX_COMMAND_ITEMS });
	if (matches.length === 0) {
		ctx.ui.notify("No matching Obsidian notes found", "warning");
		return;
	}

	const items: SelectItem[] = matches.map((note) => ({
		value: note.relativePath,
		label: noteLabel(note),
		description: noteDescription(note),
	}));

	const result = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(new Text(theme.fg("accent", theme.bold(options.projectsOnly ? "Pick Project Ticket" : "Pick Obsidian Note")), 1, 0));

		const selectList = new SelectList(items, Math.min(items.length, 15), {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});
		selectList.onSelect = (item) => done(item.value);
		selectList.onCancel = () => done(null);
		container.addChild(selectList);

		container.addChild(new Text(theme.fg("dim", "Type to filter • enter inserts [[note]] • esc cancels"), 1, 0));
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

		return {
			render(width: number) {
				return container.render(width);
			},
			invalidate() {
				container.invalidate();
			},
			handleInput(data: string) {
				selectList.handleInput(data);
				tui.requestRender();
			},
		};
	});

	if (!result) return;

	const current = ctx.ui.getEditorText();
	const insertion = `[[${result}]]`;
	ctx.ui.setEditorText(current.trim() ? `${current} ${insertion}` : insertion);
}

async function expandWikiLinks(text: string, notes: Note[]): Promise<string> {
	const matches = [...text.matchAll(/\[\[([^\]\n]+)\]\]/g)].slice(0, MAX_INJECTED_NOTES);
	if (matches.length === 0) return text;

	let expanded = text;
	for (const match of matches) {
		const raw = match[1] ?? "";
		const note = resolveNote(notes, raw);
		if (!note) continue;

		let content = await readFile(note.absolutePath, "utf8");
		const truncation = truncateHead(content, {
			maxBytes: MAX_INJECTED_NOTE_BYTES,
			maxLines: DEFAULT_MAX_LINES,
		});
		content = truncation.content;
		if (truncation.truncated) {
			content += `\n\n[Note truncated: ${truncation.outputBytes} of ${truncation.totalBytes} bytes shown. Path: ${note.absolutePath}]`;
		}

		const replacement = `\n\n<obsidian-note path="${note.relativePath}" absolutePath="${note.absolutePath}">\n${content}\n</obsidian-note>\n`;
		expanded = expanded.replace(match[0], replacement);
	}

	return expanded;
}

async function obsidianSearch(pi: ExtensionAPI, query: string): Promise<SearchResult> {
	const result = await pi.exec(
		"rg",
		["--line-number", "--ignore-case", "--glob", "*.md", "--", query, VAULT_ROOT],
		{ timeout: 10_000 },
	);

	if (result.code !== 0 && !result.stdout.trim()) {
		const error = result.stderr.trim();
		return {
			query,
			output: error || "No matching Obsidian notes found.",
			matches: [],
			truncated: false,
			error: error || undefined,
		};
	}

	const allMatches = result.stdout.split("\n").filter(Boolean).map(parseRipgrepMatch).filter((match): match is SearchMatch => Boolean(match));
	const matches = allMatches.slice(0, MAX_SEARCH_RESULTS);
	const output = matches.map((match) => `${match.relativePath}:${match.line}:${match.preview}`).join("\n");

	return {
		query,
		output: output || "No matching Obsidian notes found.",
		matches,
		truncated: allMatches.length > matches.length,
	};
}

export default function obsidianNotesExtension(pi: ExtensionAPI): void {
	let indexPromise: Promise<Note[]> | undefined;

	const getNotes = (): Promise<Note[]> => {
		indexPromise ||= buildIndex();
		return indexPromise;
	};

	pi.on("session_start", async (_event, ctx) => {
		try {
			await stat(VAULT_ROOT);
		} catch {
			ctx.ui.notify(`Obsidian vault not found: ${VAULT_ROOT}`, "warning");
			return;
		}

		void getNotes();
		if (ctx.hasUI) {
			ctx.ui.addAutocompleteProvider((current) => createAutocompleteProvider(current, getNotes));
			ctx.ui.setStatus("obsidian", ctx.ui.theme.fg("muted", "obsidian:[["));
		}
	});

	pi.on("input", async (event) => {
		if (!event.text.includes("[[")) return { action: "continue" as const };

		const notes = await getNotes();
		const text = await expandWikiLinks(event.text, notes);
		if (text === event.text) return { action: "continue" as const };

		return { action: "transform" as const, text, images: event.images };
	});

	pi.registerCommand("note", {
		description: "Search Obsidian vault notes and insert a [[note]] context link",
		handler: async (args, ctx) => {
			const notes = await getNotes();
			await showNotePicker(ctx, notes, { query: args, projectsOnly: false });
		},
	});

	pi.registerCommand("ticket", {
		description: "Search Obsidian project tickets and insert a [[ticket]] context link",
		handler: async (args, ctx) => {
			const notes = await getNotes();
			await showNotePicker(ctx, notes, { query: args, projectsOnly: true });
		},
	});

	pi.registerCommand("obsidian-reindex", {
		description: "Rebuild the Obsidian note index",
		handler: async (_args, ctx) => {
			indexPromise = buildIndex();
			const notes = await indexPromise;
			ctx.ui.notify(`Indexed ${notes.length} Obsidian notes`, "info");
		},
	});


	pi.registerTool({
		name: "obsidian_search",
		label: "Obsidian Search",
		description: "Search Kostya's Obsidian vault markdown notes. Returns compact ripgrep-style matches with vault-relative paths.",
		promptSnippet: "Search Kostya's Obsidian vault notes for tickets, design notes, and handoffs",
		promptGuidelines: [
			"Use obsidian_search when Kostya asks about Obsidian notes, tickets, handoffs, or prior project context that may live in his vault.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Search query to run across markdown notes" }),
		}),
		renderCall(args, theme) {
			return new Text(`${theme.fg("toolTitle", theme.bold("obsidian_search"))} ${theme.fg("muted", args.query ?? "")}`, 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as SearchResult | undefined;
			if (!details) {
				return new Text(result.content.map((part) => (part.type === "text" ? part.text : "")).join("\n"), 0, 0);
			}

			return renderSearchResult(details, theme);
		},
		async execute(_toolCallId, params) {
			const result = await obsidianSearch(pi, params.query);
			return {
				content: [{ type: "text", text: result.output }],
				details: result,
			};
		},
	});
}

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	copyToClipboard,
	CustomEditor,
	type AppKeybinding,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	type AutocompleteItem,
	type AutocompleteProvider,
	CURSOR_MARKER,
	type Component,
	type EditorTheme,
	type Focusable,
	fuzzyFilter,
	Input,
	matchesKey,
	parseKey,
	truncateToWidth,
	type TUI,
	visibleWidth,
} from "@earendil-works/pi-tui";
import {
	COMMAND_PALETTE_DISCOVER_CHANNEL,
	COMMAND_PALETTE_RUN_CHANNEL,
	type CommandPaletteDiscoverEvent,
} from "./lib/command-palette.ts";
import {
	DRAFT_MEDIA_ACTIVATE_CHANNEL,
	DRAFT_MEDIA_COLLECT_CHANNEL,
	type DraftMediaActivateRequest,
	type DraftMediaCollectRequest,
	type DraftMediaItem,
} from "./lib/draft-media.ts";

const PROMPT_SYMBOL = "󰜴";

const YANK_FLASH_MS = 100;
const YANK_HIGHLIGHT = "\x1b[30;103m";
const VISUAL_HIGHLIGHT = "\x1b[97;44m";
const INSERT_MODE_COLOR = "\x1b[38;2;64;160;43m";
const NORMAL_MODE_COLOR = "\x1b[38;2;30;102;245m";
const ANSI_RESET = "\x1b[0m";
const ANSI_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const FAKE_CURSOR = /\x1b\[7m(.*?)\x1b\[0m/;
const BLOCK_CURSOR = "\x1b[2 q";
const BAR_CURSOR = "\x1b[6 q";
const DEFAULT_CURSOR = "\x1b[0 q";

type Mode = "normal" | "insert" | "visual";
type ModeLabelKind = Mode | "leader" | "operator";
type Operator = "yank" | "delete" | "change";
type Motion = "h" | "l" | "w" | "b" | "e" | "0" | "$";
type EditorAction = "preview-media";
type DraftMediaDirection = "cursor" | "next" | "previous";

type LeaderBinding = {
	key: string;
	label: string;
	description?: string;
	action?: AppKeybinding;
	command?: string;
	prefill?: string;
	palette?: boolean;
	editorAction?: EditorAction;
};

type LeaderConfig = {
	leader: string;
	bindings: LeaderBinding[];
};

type LoadedLeaderConfig = {
	config?: LeaderConfig;
	error?: string;
};

type CommandPaletteCommand = {
	kind: "command";
	command: string;
	description?: string;
	source: string;
};

type CommandPaletteAction = {
	kind: "action";
	id: string;
	label: string;
	description?: string;
	source: string;
};

type CommandPaletteItem = CommandPaletteCommand | CommandPaletteAction;
type CommandPaletteCommandSpec = Omit<CommandPaletteCommand, "kind">;

type InlineSlashPrefix = {
	prefix: string;
	startCol: number;
};

type LeaderPaletteEntry = {
	segment: string;
	path: string[];
	binding?: LeaderBinding;
	hasChildren: boolean;
};

const LEADER_CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), "vim-editor-keymap.json");
const MAX_PALETTE_ROWS = 10;

const BUILTIN_COMMANDS: CommandPaletteCommandSpec[] = [
	{ command: "model", description: "Choose the active model", source: "built-in" },
	{ command: "scoped-models", description: "Configure models used by model cycling", source: "built-in" },
	{ command: "settings", description: "Open Pi settings", source: "built-in" },
	{ command: "resume", description: "Resume a previous session", source: "built-in" },
	{ command: "new", description: "Start a new session", source: "built-in" },
	{ command: "name", description: "Name the current session", source: "built-in" },
	{ command: "session", description: "Show current session information", source: "built-in" },
	{ command: "tree", description: "Navigate the current session tree", source: "built-in" },
	{ command: "fork", description: "Fork from an earlier user message", source: "built-in" },
	{ command: "clone", description: "Clone the current branch into a new session", source: "built-in" },
	{ command: "compact", description: "Compact the current context", source: "built-in" },
	{ command: "copy", description: "Copy the last assistant message", source: "built-in" },
	{ command: "export", description: "Export the current session", source: "built-in" },
	{ command: "import", description: "Import a session", source: "built-in" },
	{ command: "share", description: "Share the current session", source: "built-in" },
	{ command: "reload", description: "Reload extensions and resources", source: "built-in" },
	{ command: "hotkeys", description: "Show keyboard shortcuts", source: "built-in" },
	{ command: "changelog", description: "Show Pi's changelog", source: "built-in" },
	{ command: "trust", description: "Save a project trust decision", source: "built-in" },
	{ command: "login", description: "Authenticate with a provider", source: "built-in" },
	{ command: "logout", description: "Remove provider authentication", source: "built-in" },
	{ command: "quit", description: "Quit Pi", source: "built-in" },
];

function inlineSlashPrefix(lines: string[], cursorLine: number, cursorCol: number): InlineSlashPrefix | undefined {
	const currentLine = lines[cursorLine] ?? "";
	const textBeforeCursor = currentLine.slice(0, cursorCol);
	const match = /(?:^|[ \t])\/(\S*)$/.exec(textBeforeCursor);
	if (!match || match[1]?.includes("/")) return undefined;

	const startCol = (match.index ?? 0) + match[0].lastIndexOf("/");
	const hasEarlierText =
		lines.slice(0, cursorLine).some((line) => line.trim().length > 0) ||
		currentLine.slice(0, startCol).trim().length > 0;
	if (!hasEarlierText) return undefined;

	return { prefix: textBeforeCursor.slice(startCol), startCol };
}

function commandAutocompleteItems(pi: ExtensionAPI): AutocompleteItem[] {
	const byName = new Map<string, AutocompleteItem>();
	for (const command of BUILTIN_COMMANDS) {
		byName.set(command.command, {
			value: command.command,
			label: command.command,
			description: command.description,
		});
	}
	for (const command of pi.getCommands()) {
		if (byName.has(command.name)) continue;
		byName.set(command.name, {
			value: command.name,
			label: command.name,
			description: command.description,
		});
	}
	return [...byName.values()];
}

function inlineSlashAutocomplete(pi: ExtensionAPI, current: AutocompleteProvider): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const inlinePrefix = inlineSlashPrefix(lines, cursorLine, cursorCol);
			if (!inlinePrefix) return current.getSuggestions(lines, cursorLine, cursorCol, options);

			const query = inlinePrefix.prefix.slice(1);
			const items = fuzzyFilter(commandAutocompleteItems(pi), query, (item) => item.value);
			if (items.length === 0) return null;

			return { items, prefix: inlinePrefix.prefix };
		},
		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			const inlinePrefix = inlineSlashPrefix(lines, cursorLine, cursorCol);
			if (!inlinePrefix || inlinePrefix.prefix !== prefix) {
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			}

			const currentLine = lines[cursorLine] ?? "";
			const draftLines = [...lines];
			draftLines[cursorLine] =
				currentLine.slice(0, inlinePrefix.startCol) + currentLine.slice(cursorCol);
			const draft = draftLines.join("\n").trim();
			const command = `/${item.value}`;
			const completedText = draft ? `${command} ${draft}` : `${command} `;

			return {
				lines: completedText.split("\n"),
				cursorLine: 0,
				cursorCol: command.length + 1,
			};
		},
		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			if (inlineSlashPrefix(lines, cursorLine, cursorCol)) return true;
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasLeaderAction(binding: LeaderBinding): boolean {
	return Boolean(
		binding.action || binding.command || binding.prefill || binding.palette || binding.editorAction,
	);
}

function keyParts(binding: LeaderBinding): string[] {
	return binding.key.split(" ");
}

function formatKey(key: string): string {
	if (key === "space") return "SPC";
	return key
		.split("+")
		.map((part) => (part === "ctrl" ? "C" : part === "shift" ? "S" : part === "alt" ? "A" : part))
		.join("-");
}

function loadLeaderConfig(): LoadedLeaderConfig {
	try {
		const parsed = JSON.parse(readFileSync(LEADER_CONFIG_PATH, "utf8")) as unknown;
		if (!isRecord(parsed)) throw new Error("root must be an object");
		if (typeof parsed.leader !== "string" || !parsed.leader.trim() || /\s/.test(parsed.leader.trim())) {
			throw new Error('"leader" must be one key identifier, such as "space"');
		}
		if (!Array.isArray(parsed.bindings) || parsed.bindings.length === 0) {
			throw new Error('"bindings" must be a non-empty array');
		}

		const bindings: LeaderBinding[] = parsed.bindings.map((value, index) => {
			if (!isRecord(value)) throw new Error(`binding ${index + 1} must be an object`);
			if (typeof value.key !== "string" || !value.key.trim()) {
				throw new Error(`binding ${index + 1} needs a key`);
			}
			if (typeof value.label !== "string" || !value.label.trim()) {
				throw new Error(`binding ${index + 1} needs a label`);
			}

			const action = typeof value.action === "string" ? (value.action as AppKeybinding) : undefined;
			const command = typeof value.command === "string" ? value.command : undefined;
			const prefill = typeof value.prefill === "string" ? value.prefill : undefined;
			const palette = value.palette === true ? true : undefined;
			if (value.editorAction !== undefined && value.editorAction !== "preview-media") {
				throw new Error(`binding "${value.key}" has an unknown editorAction`);
			}
			const editorAction = value.editorAction === "preview-media" ? value.editorAction : undefined;
			const actionCount =
				Number(Boolean(action)) +
				Number(Boolean(command)) +
				Number(Boolean(prefill)) +
				Number(Boolean(palette)) +
				Number(Boolean(editorAction));
			if (actionCount > 1) {
				throw new Error(
					`binding "${value.key}" must use only one of action, command, prefill, palette, or editorAction`,
				);
			}
			if (command && !command.startsWith("/")) {
				throw new Error(`command for binding "${value.key}" must start with /`);
			}

			return {
				key: value.key.trim().replace(/\s+/g, " "),
				label: value.label.trim(),
				description: typeof value.description === "string" ? value.description.trim() : undefined,
				action,
				command,
				prefill,
				palette,
				editorAction,
			};
		});

		const seen = new Set<string>();
		for (const binding of bindings) {
			if (seen.has(binding.key)) throw new Error(`duplicate binding: "${binding.key}"`);
			seen.add(binding.key);
		}
		for (const binding of bindings) {
			if (hasLeaderAction(binding)) continue;
			if (!bindings.some((candidate) => candidate.key.startsWith(`${binding.key} `))) {
				throw new Error(`group "${binding.key}" has no child bindings`);
			}
		}

		return { config: { leader: parsed.leader.trim(), bindings } };
	} catch (error) {
		return {
			error: `Leader keys disabled: ${error instanceof Error ? error.message : String(error)} (${LEADER_CONFIG_PATH})`,
		};
	}
}

class LeaderPalette implements Component {
	private prefix: string[] = [];
	private selectedIndex = 0;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		private readonly config: LeaderConfig,
		private readonly done: (binding: LeaderBinding | null) => void,
	) {}

	private entries(): LeaderPaletteEntry[] {
		const entries = new Map<string, LeaderPaletteEntry>();
		for (const binding of this.config.bindings) {
			const parts = keyParts(binding);
			if (parts.length <= this.prefix.length) continue;
			if (!this.prefix.every((part, index) => parts[index] === part)) continue;

			const segment = parts[this.prefix.length]!;
			const path = [...this.prefix, segment];
			const exact = this.config.bindings.find((candidate) => candidate.key === path.join(" "));
			const hasChildren = this.config.bindings.some((candidate) =>
				candidate.key.startsWith(`${path.join(" ")} `),
			);
			if (!entries.has(segment)) entries.set(segment, { segment, path, binding: exact, hasChildren });
		}
		return [...entries.values()];
	}

	private activate(entry: LeaderPaletteEntry): void {
		if (entry.binding && hasLeaderAction(entry.binding)) {
			this.done(entry.binding);
			return;
		}
		if (entry.hasChildren) {
			this.prefix = entry.path;
			this.selectedIndex = 0;
			this.tui.requestRender();
		}
	}

	private goBack(): void {
		if (this.prefix.length === 0) {
			this.done(null);
			return;
		}
		this.prefix.pop();
		this.selectedIndex = 0;
		this.tui.requestRender();
	}

	handleInput(data: string): void {
		const entries = this.entries();
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.done(null);
			return;
		}
		if (data === "h" || matchesKey(data, "left") || matchesKey(data, "backspace")) {
			this.goBack();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up")) {
			if (entries.length > 0) {
				this.selectedIndex = (this.selectedIndex - 1 + entries.length) % entries.length;
				this.tui.requestRender();
			}
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			if (entries.length > 0) {
				this.selectedIndex = (this.selectedIndex + 1) % entries.length;
				this.tui.requestRender();
			}
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm")) {
			const selected = entries[this.selectedIndex];
			if (selected) this.activate(selected);
			return;
		}

		const key = parseKey(data);
		const direct = key ? entries.find((entry) => entry.segment === key) : undefined;
		if (direct) this.activate(direct);
		else this.tui.terminal.write("\x07");
	}

	render(width: number): string[] {
		if (width < 4) return [truncateToWidth("keys", Math.max(1, width), "")];
		const safeWidth = width;
		const innerWidth = safeWidth - 2;
		const entries = this.entries();
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, entries.length - 1));
		const start = Math.max(
			0,
			Math.min(
				this.selectedIndex - Math.floor(MAX_PALETTE_ROWS / 2),
				Math.max(0, entries.length - MAX_PALETTE_ROWS),
			),
		);
		const visibleEntries = entries.slice(start, start + MAX_PALETTE_ROWS);
		const keyWidth = Math.max(3, ...visibleEntries.map((entry) => formatKey(entry.segment).length));
		const path = [formatKey(this.config.leader), ...this.prefix.map(formatKey)].join(" ");
		const rawLines = [
			` ${this.theme.fg("accent", this.theme.bold("Leader commands"))}${this.theme.fg("dim", `  ${path}`)}`,
			"",
		];

		for (let index = 0; index < visibleEntries.length; index++) {
			const entry = visibleEntries[index]!;
			const absoluteIndex = start + index;
			const selected = absoluteIndex === this.selectedIndex;
			const key = formatKey(entry.segment).padEnd(keyWidth);
			const label = entry.binding?.label ?? `${entry.segment} commands`;
			const group = entry.hasChildren && !hasLeaderAction(entry.binding ?? { key: "", label: "" });
			const description = entry.binding?.description;
			let line = `${selected ? this.theme.fg("accent", " › ") : "   "}`;
			line += this.theme.fg("accent", key);
			line += `  ${selected ? this.theme.bold(label) : label}`;
			if (group) line += this.theme.fg("muted", "  ›");
			if (description) line += this.theme.fg("dim", `  — ${description}`);
			rawLines.push(line);
		}

		if (start > 0 || start + visibleEntries.length < entries.length) {
			rawLines.push(this.theme.fg("dim", `  ${this.selectedIndex + 1}/${entries.length}`));
		}
		const backHint = this.prefix.length > 0 ? "h/←/⌫ back  ·  " : "";
		rawLines.push(
			"",
			this.theme.fg("dim", `  key select  ·  ↑↓ navigate  ·  ${backHint}enter run  ·  esc close`),
		);

		const horizontal = "─".repeat(innerWidth);
		const top = this.theme.fg("borderAccent", `╭${horizontal}╮`);
		const bottom = this.theme.fg("borderAccent", `╰${horizontal}╯`);
		const framed = rawLines.map((line) => {
			const clipped = truncateToWidth(line, innerWidth, "");
			const padded = `${clipped}${" ".repeat(Math.max(0, innerWidth - visibleWidth(clipped)))}`;
			return (
				this.theme.fg("borderAccent", "│") +
				this.theme.bg("customMessageBg", padded) +
				this.theme.fg("borderAccent", "│")
			);
		});
		return [top, ...framed, bottom];
	}

	invalidate(): void {}
}

class CommandPalette implements Component, Focusable {
	private readonly search = new Input();
	private selectedIndex = 0;
	private _focused = false;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		private readonly items: CommandPaletteItem[],
		private readonly done: (item: CommandPaletteItem | null) => void,
	) {}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.search.focused = value;
	}

	private filteredItems(): CommandPaletteItem[] {
		const query = this.search.getValue().trim();
		if (!query) return this.items;
		return fuzzyFilter(this.items, query, (item) => {
			const name = item.kind === "command" ? item.command : item.label;
			return `${name} ${item.description ?? ""} ${item.source}`;
		});
	}

	handleInput(data: string): void {
		const items = this.filteredItems();
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.done(null);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up")) {
			if (items.length > 0) {
				this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
				this.tui.requestRender();
			}
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			if (items.length > 0) {
				this.selectedIndex = (this.selectedIndex + 1) % items.length;
				this.tui.requestRender();
			}
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm")) {
			const selected = items[this.selectedIndex];
			if (selected) this.done(selected);
			return;
		}

		const previousQuery = this.search.getValue();
		this.search.handleInput(data);
		if (this.search.getValue() !== previousQuery) this.selectedIndex = 0;
		this.tui.requestRender();
	}

	render(width: number): string[] {
		if (width < 4) return [truncateToWidth("cmd", Math.max(1, width), "")];
		const innerWidth = width - 2;
		const items = this.filteredItems();
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, items.length - 1));
		const start = Math.max(
			0,
			Math.min(
				this.selectedIndex - Math.floor(MAX_PALETTE_ROWS / 2),
				Math.max(0, items.length - MAX_PALETTE_ROWS),
			),
		);
		const visibleItems = items.slice(start, start + MAX_PALETTE_ROWS);
		const rawLines = [
			` ${this.theme.fg("accent", this.theme.bold("Command palette"))}${this.theme.fg("dim", `  ${items.length} items`)}`,
			"",
		];
		const inputWidth = Math.max(1, innerWidth - 5);
		const input = this.search.render(inputWidth)[0] ?? "";
		rawLines.push(` ${this.theme.fg("accent", "❯")} ${input}`, "");

		for (let index = 0; index < visibleItems.length; index++) {
			const item = visibleItems[index]!;
			const absoluteIndex = start + index;
			const selected = absoluteIndex === this.selectedIndex;
			const label = item.kind === "command" ? `/${item.command}` : item.label;
			let line = selected ? this.theme.fg("accent", " › ") : "   ";
			line += selected ? this.theme.bold(label) : label;
			line += this.theme.fg("muted", `  [${item.source}]`);
			if (item.description) line += this.theme.fg("dim", `  — ${item.description}`);
			rawLines.push(line);
		}
		if (items.length === 0) rawLines.push(this.theme.fg("warning", "   No matching commands"));
		if (start > 0 || start + visibleItems.length < items.length) {
			rawLines.push(this.theme.fg("dim", `  ${this.selectedIndex + 1}/${items.length}`));
		}
		rawLines.push("", this.theme.fg("dim", "  type to search  ·  ↑↓ navigate  ·  enter select  ·  esc close"));

		const horizontal = "─".repeat(innerWidth);
		const top = this.theme.fg("borderAccent", `╭${horizontal}╮`);
		const bottom = this.theme.fg("borderAccent", `╰${horizontal}╯`);
		const framed = rawLines.map((line) => {
			const clipped = truncateToWidth(line, innerWidth, "");
			const padded = `${clipped}${" ".repeat(Math.max(0, innerWidth - visibleWidth(clipped)))}`;
			return (
				this.theme.fg("borderAccent", "│") +
				this.theme.bg("customMessageBg", padded) +
				this.theme.fg("borderAccent", "│")
			);
		});
		return [top, ...framed, bottom];
	}

	invalidate(): void {
		this.search.invalidate();
	}
}

type EditorState = {
	lines: string[];
	cursorLine: number;
	cursorCol: number;
};

type YankFlash = {
	line: number;
	startCol: number;
	text: string;
};

function characterClass(character: string): "space" | "word" | "punctuation" {
	if (/\s/u.test(character)) return "space";
	if (/[\p{L}\p{N}_]/u.test(character)) return "word";
	return "punctuation";
}

function wordMotionText(line: string, column: number, includeTrailingWhitespace = true): string {
	const rest = line.slice(column);
	if (!rest) return "";

	const characters = [...rest];
	const initialClass = characterClass(characters[0]!);
	let count = 0;

	while (count < characters.length && characterClass(characters[count]!) === initialClass) count++;
	if (includeTrailingWhitespace && initialClass !== "space") {
		while (count < characters.length && characterClass(characters[count]!) === "space") count++;
	}

	return characters.slice(0, count).join("");
}

function previousWordStart(line: string, column: number): number {
	const characters = [...line.slice(0, column)];
	let index = characters.length;
	while (index > 0 && characterClass(characters[index - 1]!) === "space") index--;
	if (index === 0) return 0;

	const targetClass = characterClass(characters[index - 1]!);
	while (index > 0 && characterClass(characters[index - 1]!) === targetClass) index--;
	return characters.slice(0, index).join("").length;
}

function characterOffsets(line: string): { characters: string[]; offsets: number[] } {
	const characters = [...line];
	const offsets: number[] = [];
	let offset = 0;
	for (const character of characters) {
		offsets.push(offset);
		offset += character.length;
	}
	return { characters, offsets };
}

function characterIndexAt(line: string, column: number): number {
	const { characters, offsets } = characterOffsets(line);
	const index = offsets.findIndex((offset, candidate) => column < offset + characters[candidate]!.length);
	return index < 0 ? characters.length : index;
}

function wordEndColumn(line: string, column: number): number {
	const { characters, offsets } = characterOffsets(line);
	let index = characterIndexAt(line, column);
	if (index >= characters.length) return line.length;

	const currentClass = characterClass(characters[index]!);
	if (currentClass !== "space") {
		let end = index + 1;
		while (end < characters.length && characterClass(characters[end]!) === currentClass) end++;
		if (end > index + 1) return offsets[end - 1]!;
		index = end;
	}

	while (index < characters.length && characterClass(characters[index]!) === "space") index++;
	if (index >= characters.length) return line.length;

	const targetClass = characterClass(characters[index]!);
	let end = index + 1;
	while (end < characters.length && characterClass(characters[end]!) === targetClass) end++;
	return offsets[end - 1]!;
}

function wordTextObjectRange(line: string, column: number, around: boolean): { start: number; end: number } | undefined {
	const { characters, offsets } = characterOffsets(line);
	if (characters.length === 0) return undefined;

	let index = Math.min(characterIndexAt(line, column), characters.length - 1);
	if (characterClass(characters[index]!) === "space") {
		let next = index;
		while (next < characters.length && characterClass(characters[next]!) === "space") next++;
		if (next < characters.length) index = next;
		else {
			let previous = index;
			while (previous >= 0 && characterClass(characters[previous]!) === "space") previous--;
			if (previous < 0) return undefined;
			index = previous;
		}
	}

	const targetClass = characterClass(characters[index]!);
	let startIndex = index;
	let endIndex = index + 1;
	while (startIndex > 0 && characterClass(characters[startIndex - 1]!) === targetClass) startIndex--;
	while (endIndex < characters.length && characterClass(characters[endIndex]!) === targetClass) endIndex++;

	if (around) {
		const originalEnd = endIndex;
		while (endIndex < characters.length && characterClass(characters[endIndex]!) === "space") endIndex++;
		if (endIndex === originalEnd) {
			while (startIndex > 0 && characterClass(characters[startIndex - 1]!) === "space") startIndex--;
		}
	}

	const start = offsets[startIndex]!;
	const end = endIndex < offsets.length ? offsets[endIndex]! : line.length;
	return { start, end };
}

function addCursorMarker(text: string, position: number): string {
	const safePosition = Math.max(0, Math.min(position, text.length));
	return `${text.slice(0, safePosition)}${CURSOR_MARKER}${text.slice(safePosition)}`;
}

function highlightRangeOnCursorLine(line: string, cursorCol: number, flash: YankFlash, style: string): string {
	const markerIndex = line.indexOf(CURSOR_MARKER);
	if (markerIndex < 0 || !flash.text) return line;

	const beforeCursor = line.slice(0, markerIndex).replace(ANSI_SEQUENCE, "");
	const afterCursor = line.slice(markerIndex + CURSOR_MARKER.length).replace(ANSI_SEQUENCE, "");
	const plain = beforeCursor + afterCursor;
	const cursorPosition = beforeCursor.length;
	const start = Math.max(0, cursorPosition + flash.startCol - cursorCol);
	const end = Math.min(plain.length, start + flash.text.length);
	if (end <= start) return line;

	let before = plain.slice(0, start);
	let selected = plain.slice(start, end);
	let after = plain.slice(end);
	if (cursorPosition <= start) before = addCursorMarker(before, cursorPosition);
	else if (cursorPosition <= end) selected = addCursorMarker(selected, cursorPosition - start);
	else after = addCursorMarker(after, cursorPosition - end);

	return `${before}${style}${selected}${ANSI_RESET}${after}`;
}

class VimEditor extends CustomEditor {
	private mode: Mode = "insert";
	private readonly promptSymbol: string;
	private pendingOperator: Operator | undefined;
	private pendingTextObjectScope: "inner" | "around" | undefined;
	private pendingMediaMotion: "[" | "]" | undefined;
	private visualAnchor: { line: number; col: number } | undefined;
	private register = "";
	private registerLinewise = false;
	private yankFlash: YankFlash | undefined;
	private yankFlashTimer: ReturnType<typeof setTimeout> | undefined;
	private renderedCursorMode: Mode | undefined;
	private leaderActive = false;

	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		promptSymbol: string,
		private readonly styleBashPrompt: (text: string) => string,
		private readonly styleModeLabel: (kind: ModeLabelKind, text: string) => string,
		private readonly leaderConfig: LeaderConfig | undefined,
		private readonly showLeaderPalette: () => Promise<LeaderBinding | null>,
		private readonly showCommandPalette: () => Promise<CommandPaletteItem | null>,
		private readonly runCommandPaletteAction: (id: string) => void,
		private readonly activateDraftMedia: (
			text: string,
			cursor: { line: number; col: number },
			direction: DraftMediaDirection,
		) => DraftMediaItem | undefined,
		private readonly reportLeaderError: (message: string) => void,
	) {
		super(tui, theme, keybindings);
		this.promptSymbol = promptSymbol;
	}

	private editorState(): EditorState {
		return (this as unknown as { state: EditorState }).state;
	}

	private setCursor(line: number, column: number): void {
		const state = this.editorState();
		state.cursorLine = Math.max(0, Math.min(line, state.lines.length - 1));
		state.cursorCol = Math.max(0, Math.min(column, state.lines[state.cursorLine]?.length ?? 0));
		this.tui.requestRender();
	}

	private replaceText(text: string, line: number, column: number): void {
		this.setText(text);
		this.setCursor(line, column);
	}

	private setMode(mode: Mode): void {
		this.mode = mode;
		this.pendingOperator = undefined;
		this.pendingTextObjectScope = undefined;
		this.pendingMediaMotion = undefined;
		if (mode !== "visual") this.visualAnchor = undefined;
		this.syncCursorStyle();
		this.tui.requestRender();
	}

	private syncCursorStyle(): void {
		if (this.renderedCursorMode === this.mode) return;
		this.renderedCursorMode = this.mode;
		this.tui.terminal.write(this.mode === "insert" ? BAR_CURSOR : BLOCK_CURSOR);
	}

	resetCursorStyle(): void {
		if (this.yankFlashTimer) clearTimeout(this.yankFlashTimer);
		this.tui.terminal.write(DEFAULT_CURSOR);
	}

	private flashYank(line: number, startCol: number, text: string): void {
		if (!text) return;
		if (this.yankFlashTimer) clearTimeout(this.yankFlashTimer);
		this.yankFlash = { line, startCol, text };
		this.tui.requestRender();
		this.yankFlashTimer = setTimeout(() => {
			this.yankFlash = undefined;
			this.yankFlashTimer = undefined;
			this.tui.requestRender();
		}, YANK_FLASH_MS);
	}

	private saveRegister(text: string, linewise = false): void {
		if (!text) return;
		this.register = text;
		this.registerLinewise = linewise;
		void copyToClipboard(text).catch(() => {
			// Keep the internal register usable without a system clipboard.
		});
	}

	private visualSelection(): YankFlash | undefined {
		const anchor = this.visualAnchor;
		const cursor = this.getCursor();
		if (!anchor || anchor.line !== cursor.line) return undefined;

		const line = this.getLines()[cursor.line] ?? "";
		const startCol = Math.min(anchor.col, cursor.col);
		const lastCol = Math.max(anchor.col, cursor.col);
		const lastCharacter = [...line.slice(lastCol)][0];
		const endCol = Math.min(line.length, lastCol + (lastCharacter?.length ?? 0));
		const text = line.slice(startCol, endCol);
		return text ? { line: cursor.line, startCol, text } : undefined;
	}

	private applyVisualOperator(operator: Operator): void {
		const selection = this.visualSelection();
		if (!selection) {
			this.setMode(operator === "change" ? "insert" : "normal");
			return;
		}

		this.saveRegister(selection.text);
		if (operator === "yank") {
			this.setMode("normal");
			this.flashYank(selection.line, selection.startCol, selection.text);
			return;
		}

		const lines = this.getLines();
		const line = lines[selection.line] ?? "";
		lines[selection.line] =
			line.slice(0, selection.startCol) + line.slice(selection.startCol + selection.text.length);
		this.replaceText(lines.join("\n"), selection.line, selection.startCol);
		this.setMode(operator === "change" ? "insert" : "normal");
	}

	private handleVisualInput(data: string): void {
		switch (data) {
			case "v":
				this.setMode("normal");
				return;
			case "y":
				this.applyVisualOperator("yank");
				return;
			case "d":
			case "x":
				this.applyVisualOperator("delete");
				return;
			case "c":
			case "s":
				this.applyVisualOperator("change");
				return;
			case "e": {
				const cursor = this.getCursor();
				this.setCursor(cursor.line, wordEndColumn(this.getLines()[cursor.line] ?? "", cursor.col));
				return;
			}
		}

		const motions: Record<string, string> = {
			h: "\x1b[D",
			l: "\x1b[C",
			b: "\x1bb",
			w: "\x1bf",
			"0": "\x01",
			$: "\x05",
		};
		if (data in motions) {
			super.handleInput(motions[data]!);
			this.tui.requestRender();
			return;
		}

		if (data.length === 1 && data.charCodeAt(0) >= 32) return;
		super.handleInput(data);
	}

	private motionRange(motion: Motion): { start: number; end: number } | undefined {
		const cursor = this.getCursor();
		const line = this.getLines()[cursor.line] ?? "";
		switch (motion) {
			case "h":
				return cursor.col > 0 ? { start: cursor.col - 1, end: cursor.col } : undefined;
			case "l": {
				const char = [...line.slice(cursor.col)][0];
				return char ? { start: cursor.col, end: cursor.col + char.length } : undefined;
			}
			case "w": {
				const text = wordMotionText(line, cursor.col);
				return text ? { start: cursor.col, end: cursor.col + text.length } : undefined;
			}
			case "b":
				return { start: previousWordStart(line, cursor.col), end: cursor.col };
			case "e": {
				const endColumn = wordEndColumn(line, cursor.col);
				const char = [...line.slice(endColumn)][0];
				return { start: cursor.col, end: endColumn + (char?.length ?? 0) };
			}
			case "0":
				return { start: 0, end: cursor.col };
			case "$":
				return { start: cursor.col, end: line.length };
		}
	}

	private applyTextObject(operator: Operator, scope: "inner" | "around"): void {
		const cursor = this.getCursor();
		const lines = this.getLines();
		const line = lines[cursor.line] ?? "";
		const range = wordTextObjectRange(line, cursor.col, scope === "around");
		if (!range || range.end <= range.start) return;

		const text = line.slice(range.start, range.end);
		this.saveRegister(text);
		if (operator === "yank") {
			this.flashYank(cursor.line, range.start, text);
			return;
		}

		lines[cursor.line] = line.slice(0, range.start) + line.slice(range.end);
		this.replaceText(lines.join("\n"), cursor.line, range.start);
		if (operator === "change") this.setMode("insert");
	}

	private applyLineOperator(operator: Operator): void {
		const cursor = this.getCursor();
		const lines = this.getLines();
		const line = lines[cursor.line] ?? "";
		this.saveRegister(`${line}\n`, true);

		if (operator === "yank") {
			this.flashYank(cursor.line, 0, line);
			return;
		}

		if (operator === "change") {
			lines[cursor.line] = "";
			this.replaceText(lines.join("\n"), cursor.line, 0);
			this.setMode("insert");
			return;
		}

		lines.splice(cursor.line, 1);
		if (lines.length === 0) lines.push("");
		const targetLine = Math.min(cursor.line, lines.length - 1);
		this.replaceText(lines.join("\n"), targetLine, 0);
	}

	private applyOperator(operator: Operator, motion: Motion): void {
		const cursor = this.getCursor();
		const lines = this.getLines();
		const line = lines[cursor.line] ?? "";
		const range = this.motionRange(motion);
		if (!range || range.end <= range.start) return;

		const text = line.slice(range.start, range.end);
		this.saveRegister(text);
		if (operator === "yank") {
			this.flashYank(cursor.line, range.start, text);
			return;
		}

		lines[cursor.line] = line.slice(0, range.start) + line.slice(range.end);
		this.replaceText(lines.join("\n"), cursor.line, range.start);
		if (operator === "change") this.setMode("insert");
	}

	private deleteCharacter(enterInsert = false): void {
		this.applyOperator(enterInsert ? "change" : "delete", "l");
		if (enterInsert) this.setMode("insert");
	}

	private paste(before: boolean): void {
		if (!this.register) return;
		const cursor = this.getCursor();
		const lines = this.getLines();

		if (this.registerLinewise) {
			const inserted = this.register.replace(/\n$/, "").split("\n");
			const targetLine = before ? cursor.line : cursor.line + 1;
			lines.splice(targetLine, 0, ...inserted);
			this.replaceText(lines.join("\n"), targetLine, 0);
			return;
		}

		const line = lines[cursor.line] ?? "";
		const currentChar = [...line.slice(cursor.col)][0];
		const insertion = before ? cursor.col : Math.min(line.length, cursor.col + (currentChar?.length ?? 0));
		lines[cursor.line] = line.slice(0, insertion) + this.register + line.slice(insertion);
		this.replaceText(lines.join("\n"), cursor.line, insertion + Math.max(0, this.register.length - 1));
	}

	private openLine(above: boolean): void {
		const cursor = this.getCursor();
		const lines = this.getLines();
		const targetLine = above ? cursor.line : cursor.line + 1;
		lines.splice(targetLine, 0, "");
		this.replaceText(lines.join("\n"), targetLine, 0);
		this.setMode("insert");
	}

	private undoEdit(): void {
		const editorPrototype = Object.getPrototypeOf(CustomEditor.prototype) as { undo: (this: VimEditor) => void };
		editorPrototype.undo.call(this);
		this.tui.requestRender();
	}

	private submitCommand(command: string): void {
		const draft = this.getText();
		this.setText(command);
		super.handleInput("\r");
		this.setText(draft);
	}

	private previewDraftMedia(direction: DraftMediaDirection): void {
		const item = this.activateDraftMedia(this.getText(), this.getCursor(), direction);
		if (!item) {
			this.reportLeaderError(
				direction === "cursor"
					? "No previewable attachment under the cursor"
					: "No previewable attachments in the draft",
			);
			return;
		}
		if (direction === "cursor") return;

		const before = this.getText().slice(0, item.start);
		const lines = before.split("\n");
		this.setCursor(lines.length - 1, lines.at(-1)?.length ?? 0);
	}

	private async executeLeaderBinding(binding: LeaderBinding): Promise<void> {
		if (binding.palette) {
			const selected = await this.showCommandPalette();
			if (selected?.kind === "action") {
				this.runCommandPaletteAction(selected.id);
			} else if (selected) {
				const draft = this.getText();
				this.setText(`/${selected.command}${draft ? ` ${draft}` : " "}`);
				this.setMode("insert");
			}
			return;
		}
		if (binding.action) {
			const handler = this.actionHandlers.get(binding.action);
			if (handler) handler();
			else this.reportLeaderError(`No handler is registered for ${binding.action}`);
			return;
		}
		if (binding.editorAction === "preview-media") {
			this.previewDraftMedia("cursor");
			return;
		}
		if (binding.command) {
			this.submitCommand(binding.command);
			return;
		}
		if (binding.prefill !== undefined) {
			this.setText(`${binding.prefill}${this.getText()}`);
			this.setMode("insert");
		}
	}

	private async openLeaderPalette(): Promise<void> {
		if (!this.leaderConfig || this.leaderActive) return;
		this.leaderActive = true;
		this.tui.requestRender();
		try {
			const binding = await this.showLeaderPalette();
			if (binding) await this.executeLeaderBinding(binding);
		} catch (error) {
			this.reportLeaderError(error instanceof Error ? error.message : String(error));
		} finally {
			this.leaderActive = false;
			this.tui.requestRender();
		}
	}

	private tryInlineSlashAutocomplete(): void {
		if (this.isShowingAutocomplete()) return;

		const cursor = this.getCursor();
		if (!inlineSlashPrefix(this.getLines(), cursor.line, cursor.col)) return;

		const editor = this as unknown as { tryTriggerAutocomplete: () => void };
		editor.tryTriggerAutocomplete();
	}

	handleInput(data: string): void {
		if (matchesKey(data, "ctrl+shift+r")) {
			this.submitCommand("/reload");
			return;
		}

		if (matchesKey(data, "escape")) {
			if (this.pendingOperator || this.pendingMediaMotion) {
				this.pendingOperator = undefined;
				this.pendingTextObjectScope = undefined;
				this.pendingMediaMotion = undefined;
				this.tui.requestRender();
			} else if (this.mode === "insert" || this.mode === "visual") {
				this.setMode("normal");
			} else {
				super.handleInput(data);
			}
			return;
		}

		if (this.mode === "insert") {
			super.handleInput(data);
			this.tryInlineSlashAutocomplete();
			return;
		}

		if (this.mode === "visual") {
			this.handleVisualInput(data);
			return;
		}

		if (this.pendingMediaMotion) {
			const direction = this.pendingMediaMotion === "]" ? "next" : "previous";
			this.pendingMediaMotion = undefined;
			if (data === "m") this.previewDraftMedia(direction);
			else this.tui.terminal.write("\x07");
			this.tui.requestRender();
			return;
		}

		if (this.pendingOperator) {
			const operator = this.pendingOperator;
			if (this.pendingTextObjectScope) {
				const scope = this.pendingTextObjectScope;
				this.pendingOperator = undefined;
				this.pendingTextObjectScope = undefined;
				if (data === "w") this.applyTextObject(operator, scope);
				this.tui.requestRender();
				return;
			}

			if (data === "i" || data === "a") {
				this.pendingTextObjectScope = data === "i" ? "inner" : "around";
				this.tui.requestRender();
				return;
			}

			this.pendingOperator = undefined;
			if (data === operator[0]) this.applyLineOperator(operator);
			else if (["h", "l", "w", "b", "e", "0", "$"].includes(data)) this.applyOperator(operator, data as Motion);
			this.tui.requestRender();
			return;
		}

		if (data === "[" || data === "]") {
			this.pendingMediaMotion = data;
			this.tui.requestRender();
			return;
		}

		if (this.leaderConfig && matchesKey(data, this.leaderConfig.leader as Parameters<typeof matchesKey>[1])) {
			void this.openLeaderPalette();
			return;
		}

		if (data === "y" || data === "d" || data === "c") {
			this.pendingOperator = data === "y" ? "yank" : data === "d" ? "delete" : "change";
			this.tui.requestRender();
			return;
		}

		switch (data) {
			case "v":
				this.visualAnchor = this.getCursor();
				this.setMode("visual");
				return;
			case "p":
				this.paste(false);
				return;
			case "P":
				this.paste(true);
				return;
			case "x":
				this.deleteCharacter();
				return;
			case "s":
				this.deleteCharacter(true);
				return;
			case "D":
				this.applyOperator("delete", "$");
				return;
			case "C":
				this.applyOperator("change", "$");
				return;
			case "Y":
				this.applyLineOperator("yank");
				return;
			case "u":
				this.undoEdit();
				return;
			case "o":
				this.openLine(false);
				return;
			case "O":
				this.openLine(true);
				return;
			case "e": {
				const cursor = this.getCursor();
				this.setCursor(cursor.line, wordEndColumn(this.getLines()[cursor.line] ?? "", cursor.col));
				return;
			}
		}

		const normalKeys: Record<string, string> = {
			h: "\x1b[D",
			j: "\x1b[B",
			k: "\x1b[A",
			l: "\x1b[C",
			b: "\x1bb",
			w: "\x1bf",
			"0": "\x01",
			$: "\x05",
		};
		if (data in normalKeys) {
			super.handleInput(normalKeys[data]!);
			return;
		}

		switch (data) {
			case "i":
				this.setMode("insert");
				return;
			case "a":
				super.handleInput("\x1b[C");
				this.setMode("insert");
				return;
			case "I":
				super.handleInput("\x01");
				this.setMode("insert");
				return;
			case "A":
				super.handleInput("\x05");
				this.setMode("insert");
				return;
		}

		// Keep application control shortcuts working; ignore other printable input.
		if (data.length === 1 && data.charCodeAt(0) >= 32) return;
		super.handleInput(data);
	}

	render(width: number): string[] {
		this.syncCursorStyle();

		const isBashMode = this.getText().trimStart().startsWith("!");
		if (isBashMode) {
			const state = this.editorState();
			const bashLine = state.lines.findIndex((line) => line.trimStart().startsWith("!"));
			const bangColumn = bashLine >= 0 ? state.lines[bashLine]!.indexOf("!") : -1;
			if (state.cursorLine === bashLine && state.cursorCol <= bangColumn) {
				state.cursorCol = bangColumn + 1;
			}
		}

		const lines = super.render(width);
		if (lines.length === 0) return lines;

		const cursor = this.getCursor();
		const visualSelection = this.mode === "visual" ? this.visualSelection() : undefined;
		if (visualSelection) {
			const cursorLine = lines.findIndex((line) => line.includes(CURSOR_MARKER));
			if (cursorLine >= 0) {
				lines[cursorLine] = highlightRangeOnCursorLine(
					lines[cursorLine]!,
					cursor.col,
					visualSelection,
					VISUAL_HIGHLIGHT,
				);
			}
		} else if (this.yankFlash?.line === cursor.line) {
			const cursorLine = lines.findIndex((line) => line.includes(CURSOR_MARKER));
			if (cursorLine >= 0) {
				lines[cursorLine] = highlightRangeOnCursorLine(
					lines[cursorLine]!,
					cursor.col,
					this.yankFlash,
					YANK_HIGHLIGHT,
				);
			}
		} else if (this.mode === "insert") {
			const cursorLine = lines.findIndex((line) => line.includes(CURSOR_MARKER));
			if (cursorLine >= 0) lines[cursorLine] = lines[cursorLine]!.replace(FAKE_CURSOR, "$1");
		}

		if (lines[1]?.startsWith("  ")) {
			const content = lines[1].slice(2);
			if (isBashMode) {
				const bangIndex = content.indexOf("!");
				const command = bangIndex >= 0 ? content.slice(0, bangIndex) + content.slice(bangIndex + 1) : content;
				lines[1] = `${this.styleBashPrompt("!")} ${command}`;
			} else {
				lines[1] = `${this.promptSymbol} ${content}`;
			}
		}

		let labelKind: ModeLabelKind = this.mode;
		let labelText = ` ${this.mode.toUpperCase()} `;
		if (this.leaderActive) {
			labelKind = "leader";
			labelText = " LEADER ";
		} else if (this.pendingMediaMotion) {
			labelKind = "operator";
			labelText = this.pendingMediaMotion === "]" ? " NEXT ATTACHMENT " : " PREVIOUS ATTACHMENT ";
		} else if (this.pendingOperator) {
			labelKind = "operator";
			labelText = ` ${this.pendingOperator.toUpperCase()}${this.pendingTextObjectScope ? ` ${this.pendingTextObjectScope.toUpperCase()}` : ""} `;
		}

		const label = this.styleModeLabel(labelKind, labelText);
		const labelWidth = visibleWidth(label);
		const last = lines.length - 1;
		if (visibleWidth(lines[last]!) >= labelWidth) {
			lines[last] = truncateToWidth(lines[last]!, width - labelWidth, "") + label;
		}

		return lines;
	}
}

export default function vimEditorExtension(pi: ExtensionAPI): void {
	let editor: VimEditor | undefined;
	const loadedLeaderConfig = loadLeaderConfig();

	function cursorOffset(text: string, cursor: { line: number; col: number }): number {
		const lines = text.split("\n");
		const line = Math.max(0, Math.min(cursor.line, lines.length - 1));
		let offset = 0;
		for (let index = 0; index < line; index++) offset += (lines[index]?.length ?? 0) + 1;
		return offset + Math.max(0, Math.min(cursor.col, lines[line]?.length ?? 0));
	}

	function activateMedia(
		text: string,
		cursor: { line: number; col: number },
		direction: DraftMediaDirection,
	): DraftMediaItem | undefined {
		const collectRequest: DraftMediaCollectRequest = { text, items: [] };
		pi.events.emit(DRAFT_MEDIA_COLLECT_CHANNEL, collectRequest);
		const seen = new Set<string>();
		const items = collectRequest.items
			.filter((item) => {
				if (item.start < 0 || item.end <= item.start || item.end > text.length) return false;
				const key = `${item.provider}\u0000${item.id}\u0000${item.start}`;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			})
			.sort((left, right) => left.start - right.start || left.end - right.end);
		if (items.length === 0) return undefined;

		const offset = cursorOffset(text, cursor);
		const underCursor = items.find((item) => offset >= item.start && offset < item.end);
		let item: DraftMediaItem | undefined;
		if (direction === "cursor") {
			item = underCursor;
		} else if (direction === "next") {
			const anchor = underCursor?.start ?? offset;
			item = items.find((candidate) => candidate.start > anchor) ?? items[0];
		} else {
			const anchor = underCursor?.start ?? offset;
			item = [...items].reverse().find((candidate) => candidate.start < anchor) ?? items.at(-1);
		}
		if (!item) return undefined;

		const activateRequest: DraftMediaActivateRequest = {
			item,
			toggle: direction === "cursor",
			handled: false,
		};
		pi.events.emit(DRAFT_MEDIA_ACTIVATE_CHANNEL, activateRequest);
		return activateRequest.handled ? item : undefined;
	}

	async function showPalette(ctx: ExtensionContext): Promise<LeaderBinding | null> {
		const config = loadedLeaderConfig.config;
		if (!config || ctx.mode !== "tui") return null;
		return ctx.ui.custom<LeaderBinding | null>(
			(tui, theme, keybindings, done) => new LeaderPalette(tui, theme, keybindings, config, done),
			{
				overlay: true,
				overlayOptions: {
					anchor: "bottom-center",
					width: "72%",
					minWidth: 48,
					maxHeight: "70%",
					margin: 1,
				},
			},
		);
	}

	async function showCommands(ctx: ExtensionContext): Promise<CommandPaletteItem | null> {
		if (ctx.mode !== "tui") return null;
		const discovered: CommandPaletteCommand[] = pi.getCommands().map((command) => ({
			kind: "command",
			command: command.name,
			description: command.description,
			source: command.source,
		}));
		const builtins: CommandPaletteCommand[] = BUILTIN_COMMANDS.map((command) => ({
			kind: "command",
			...command,
		}));
		const byName = new Map<string, CommandPaletteCommand>();
		for (const command of [...builtins, ...discovered]) {
			if (!byName.has(command.command)) byName.set(command.command, command);
		}
		const actions: CommandPaletteAction[] = [];
		const discoverEvent: CommandPaletteDiscoverEvent = {
			add(items) {
				for (const item of items) actions.push({ kind: "action", ...item });
			},
		};
		pi.events.emit(COMMAND_PALETTE_DISCOVER_CHANNEL, discoverEvent);
		const items: CommandPaletteItem[] = [...actions, ...byName.values()];
		return ctx.ui.custom<CommandPaletteItem | null>(
			(tui, theme, keybindings, done) => new CommandPalette(tui, theme, keybindings, items, done),
			{
				overlay: true,
				overlayOptions: {
					anchor: "center",
					width: "76%",
					minWidth: 52,
					maxHeight: "80%",
					margin: 1,
				},
			},
		);
	}

	function runPaletteAction(id: string): void {
		pi.events.emit(COMMAND_PALETTE_RUN_CHANNEL, { id });
	}

	pi.on("session_start", (_event, ctx) => {
		if (loadedLeaderConfig.error) ctx.ui.notify(loadedLeaderConfig.error, "warning");
		ctx.ui.addAutocompleteProvider((current) => inlineSlashAutocomplete(pi, current));
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			const promptSymbol = `\x1b[1;30m${PROMPT_SYMBOL}\x1b[22;39m`;
			const styleBashPrompt = (text: string): string => {
				const uiTheme = ctx.ui.theme;
				return uiTheme.fg("error", uiTheme.bold(text));
			};
			const styleModeLabel = (kind: ModeLabelKind, text: string): string => {
				const uiTheme = ctx.ui.theme;
				switch (kind) {
					case "normal":
						return `${NORMAL_MODE_COLOR}${uiTheme.bold(text)}${ANSI_RESET}`;
					case "insert":
						return `${INSERT_MODE_COLOR}${uiTheme.bold(text)}${ANSI_RESET}`;
					case "visual":
						return uiTheme.fg("warning", uiTheme.bold(text));
					case "leader":
					case "operator":
						return uiTheme.fg("syntaxNumber", uiTheme.bold(text));
				}
			};
			editor = new VimEditor(
				tui,
				theme,
				keybindings,
				promptSymbol,
				styleBashPrompt,
				styleModeLabel,
				loadedLeaderConfig.config,
				() => showPalette(ctx),
				() => showCommands(ctx),
				runPaletteAction,
				activateMedia,
				(message) => ctx.ui.notify(`Leader key: ${message}`, "warning"),
			);
			return editor;
		});
	});

	pi.on("session_shutdown", () => {
		editor?.resetCursorStyle();
		editor = undefined;
	});
}

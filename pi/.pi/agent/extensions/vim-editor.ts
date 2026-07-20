import {
	copyToClipboard,
	CustomEditor,
	type ExtensionAPI,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import {
	CURSOR_MARKER,
	type EditorTheme,
	matchesKey,
	truncateToWidth,
	type TUI,
	visibleWidth,
} from "@earendil-works/pi-tui";

const PROMPT_SYMBOL = "󰜴";

const YANK_FLASH_MS = 100;
const YANK_HIGHLIGHT = "\x1b[30;103m";
const VISUAL_HIGHLIGHT = "\x1b[97;44m";
const ANSI_RESET = "\x1b[0m";
const ANSI_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const FAKE_CURSOR = /\x1b\[7m(.*?)\x1b\[0m/;
const BLOCK_CURSOR = "\x1b[2 q";
const BAR_CURSOR = "\x1b[6 q";
const DEFAULT_CURSOR = "\x1b[0 q";

type Mode = "normal" | "insert" | "visual";
type Operator = "yank" | "delete" | "change";
type Motion = "h" | "l" | "w" | "b" | "e" | "0" | "$";

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
	private visualAnchor: { line: number; col: number } | undefined;
	private register = "";
	private registerLinewise = false;
	private yankFlash: YankFlash | undefined;
	private yankFlashTimer: ReturnType<typeof setTimeout> | undefined;
	private renderedCursorMode: Mode | undefined;

	constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, promptSymbol: string) {
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

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			if (this.pendingOperator) {
				this.pendingOperator = undefined;
				this.pendingTextObjectScope = undefined;
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
			return;
		}

		if (this.mode === "visual") {
			this.handleVisualInput(data);
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
			lines[1] = `${this.promptSymbol} ${lines[1].slice(2)}`;
		}

		const label = this.pendingOperator
			? ` ${this.pendingOperator.toUpperCase()}${this.pendingTextObjectScope ? ` ${this.pendingTextObjectScope.toUpperCase()}` : ""} `
			: this.mode === "normal"
				? " NORMAL "
				: this.mode === "visual"
					? " VISUAL "
					: " INSERT ";
		const last = lines.length - 1;
		if (visibleWidth(lines[last]!) >= label.length) {
			lines[last] = truncateToWidth(lines[last]!, width - label.length, "") + label;
		}
		return lines;
	}
}

export default function vimEditorExtension(pi: ExtensionAPI): void {
	let editor: VimEditor | undefined;

	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			const promptSymbol = `\x1b[1;30m${PROMPT_SYMBOL}\x1b[22;39m`;
			editor = new VimEditor(tui, theme, keybindings, promptSymbol);
			return editor;
		});
	});

	pi.on("session_shutdown", () => {
		editor?.resetCursorStyle();
		editor = undefined;
	});
}

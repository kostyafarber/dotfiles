import {
	createBashToolDefinition,
	createEditToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	type ExtensionAPI,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { Box, Container, Spacer, Text } from "@earendil-works/pi-tui";
import {
	ExpressiveHighlighter,
	languageFromPath,
	SHIKI_THEMES,
	type ShikiTheme,
	type SupportedLanguage,
} from "./syntax.ts";

const COLLAPSED_WRITE_LINES = 12;
const COLLAPSED_EDIT_LINES = 16;
const MAX_EXPANDED_LINES = 400;
const DIFF_LINE_BACKGROUNDS: Record<
	ShikiTheme,
	{ addition: string; deletion: string }
> = {
	"catppuccin-latte": {
		addition: "\u001b[48;2;231;240;229m", // #e7f0e5
		deletion: "\u001b[48;2;242;228;232m", // #f2e4e8
	},
	"catppuccin-mocha": {
		addition: "\u001b[48;2;33;51;38m", // #213326
		deletion: "\u001b[48;2;56;36;45m", // #38242d
	},
};
const RESET_BACKGROUND = "\u001b[49m";

type RenderTheme = Pick<Theme, "bold" | "fg" | "bg" | "name">;

type EditInput = {
	path?: string;
	file_path?: string;
	edits?: Array<{ oldText?: string; newText?: string }>;
	oldText?: string;
	newText?: string;
};

type ShikiEditState = {
	shikiCall?: Box;
	shikiUsed?: boolean;
};

export default async function (pi: ExtensionAPI): Promise<void> {
	let syntax: ExpressiveHighlighter | undefined;
	try {
		syntax = await ExpressiveHighlighter.create();
	} catch {
		// Tool execution must remain available if Shiki cannot initialize.
	}

	const cwd = process.cwd();
	const bash = createBashToolDefinition(cwd);
	const read = createReadToolDefinition(cwd);
	const write = createWriteToolDefinition(cwd);
	const edit = createEditToolDefinition(cwd);

	pi.registerTool({
		...bash,
		renderCall(args, theme, context) {
			const component = bash.renderCall?.(args, theme, context);
			if (!(component instanceof Text) || !syntax || typeof args.command !== "string") {
				return component ?? new Text("", 0, 0);
			}

			const commandLines = syntax.highlight(args.command, "bash", shikiThemeFor(theme));
			let output = theme.fg("toolTitle", theme.bold("Ran"));
			if (commandLines.length > 0) {
				output += ` ${commandLines[0] ?? ""}`;
				for (const line of commandLines.slice(1)) output += `\n    ${line}`;
			}
			if (args.timeout !== undefined) {
				output += theme.fg("dim", ` (timeout: ${args.timeout}s)`);
			}
			component.setText(output);
			return component;
		},
	});

	pi.registerTool({
		...read,
		renderResult(result, options, theme, context) {
			const path = toolPath(context.args);
			const language = languageFromPath(path);
			const textOutput = getTextOutput(result);
			const hasImage = result.content.some((item) => item.type === "image");
			const sourceLines = textOutput?.replace(/\r\n?/g, "\n").split("\n") ?? [];

			if (
				!syntax ||
				!language ||
				!options.expanded ||
				context.isError ||
				hasImage ||
				textOutput === undefined ||
				sourceLines.length > MAX_EXPANDED_LINES
			) {
				return read.renderResult?.(result, options, theme, context) ?? new Text("", 0, 0);
			}

			const component = context.lastComponent instanceof Text
				? context.lastComponent
				: new Text("", 0, 0);
			component.setText(
				`\n${syntax.highlight(replaceTabs(textOutput), language, shikiThemeFor(theme)).join("\n")}`,
			);
			return component;
		},
	});

	pi.registerTool({
		...write,
		renderCall(args, theme, context) {
			const path = toolPath(args);
			const language = languageFromPath(path);
			if (!syntax || !language || typeof args.content !== "string") {
				return write.renderCall?.(args, theme, context) ?? new Text("", 0, 0);
			}

			const component = context.lastComponent instanceof Text
				? context.lastComponent
				: new Text("", 0, 0);
			const preview = renderCodePreview(
				syntax,
				args.content,
				language,
				context.expanded ? MAX_EXPANDED_LINES : COLLAPSED_WRITE_LINES,
				shikiThemeFor(theme),
			);
			let output = `${theme.fg("toolTitle", theme.bold("write"))} ${theme.fg("accent", path ?? "")}`;
			if (preview.text) output += `\n\n${preview.text}`;
			if (preview.remaining > 0) {
				output += theme.fg("muted", `\n… ${preview.remaining} more lines`);
			}
			component.setText(output);
			return component;
		},
	});

	pi.registerTool({
		...edit,
		renderCall(args, theme, context) {
			const path = toolPath(args);
			const language = languageFromPath(path);
			const edits = getEdits(args as EditInput);
			const state = context.state as typeof context.state & ShikiEditState;
			state.shikiUsed = Boolean(syntax && language && edits.length > 0);

			if (!syntax || !language || edits.length === 0) {
				return edit.renderCall?.(args, theme, context) ?? new Container();
			}

			const box = state.shikiCall ?? new Box(1, 1, (text: string) => theme.bg("toolPendingBg", text));
			state.shikiCall = box;
			box.setBgFn((text: string) => theme.bg("toolPendingBg", text));
			box.clear();
			box.addChild(new Text(
				`${theme.fg("toolTitle", theme.bold("edit"))} ${theme.fg("accent", path ?? "")}`,
				0,
				0,
			));
			box.addChild(new Spacer(1));
			box.addChild(new Text(
				renderEdits(
					syntax,
					edits,
					language,
					context.expanded ? MAX_EXPANDED_LINES : COLLAPSED_EDIT_LINES,
					theme,
					shikiThemeFor(theme),
				),
				0,
				0,
			));
			return box;
		},
		renderResult(result, options, theme, context) {
			const state = context.state as typeof context.state & ShikiEditState;
			if (!state.shikiUsed) {
				return edit.renderResult?.(result, options, theme, context) ?? new Container();
			}

			if (state.shikiCall) {
				const background = context.isError
					? "toolErrorBg"
					: options.isPartial
						? "toolPendingBg"
						: "toolSuccessBg";
				state.shikiCall.setBgFn((text: string) => theme.bg(background, text));
				state.shikiCall.invalidate();
			}

			const component = context.lastComponent instanceof Container
				? context.lastComponent
				: new Container();
			component.clear();
			if (context.isError) {
				const error = getTextOutput(result);
				if (error) {
					component.addChild(new Spacer(1));
					component.addChild(new Text(theme.fg("error", error), 1, 0));
				}
			}
			return component;
		},
	});

	pi.on("session_shutdown", () => {
		syntax?.dispose();
		syntax = undefined;
	});
}

function shikiThemeFor(theme: Pick<Theme, "name">): ShikiTheme {
	return theme.name?.toLowerCase().includes("mocha")
		? SHIKI_THEMES.dark
		: SHIKI_THEMES.light;
}

function toolPath(args: unknown): string | undefined {
	if (!args || typeof args !== "object") return undefined;
	const input = args as { path?: unknown; file_path?: unknown };
	if (typeof input.path === "string") return input.path;
	return typeof input.file_path === "string" ? input.file_path : undefined;
}

function getEdits(args: EditInput): Array<{ oldText: string; newText: string }> {
	if (Array.isArray(args.edits)) {
		return args.edits.flatMap((edit) =>
			typeof edit?.oldText === "string" && typeof edit?.newText === "string"
				? [{ oldText: edit.oldText, newText: edit.newText }]
				: [],
		);
	}
	return typeof args.oldText === "string" && typeof args.newText === "string"
		? [{ oldText: args.oldText, newText: args.newText }]
		: [];
}

function renderCodePreview(
	syntax: ExpressiveHighlighter,
	content: string,
	language: SupportedLanguage,
	lineLimit: number,
	shikiTheme: ShikiTheme,
): { text: string; remaining: number } {
	const lines = replaceTabs(content).replace(/\r\n?/g, "\n").split("\n");
	const visible = lines.slice(0, lineLimit);
	const highlighted = syntax.highlight(visible.join("\n"), language, shikiTheme);
	return {
		text: highlighted.join("\n"),
		remaining: Math.max(0, lines.length - visible.length),
	};
}

function renderEdits(
	syntax: ExpressiveHighlighter,
	edits: Array<{ oldText: string; newText: string }>,
	language: SupportedLanguage,
	lineLimit: number,
	theme: RenderTheme,
	shikiTheme: ShikiTheme,
): string {
	const output: string[] = [];
	const totalChangedLines = edits.reduce(
		(total, edit) => total + lineCount(edit.oldText) + lineCount(edit.newText),
		0,
	);
	const perSideLimit = totalChangedLines <= lineLimit
		? Number.POSITIVE_INFINITY
		: Math.max(1, Math.floor(lineLimit / Math.max(2, edits.length * 2)));
	let omitted = 0;

	for (const [index, edit] of edits.entries()) {
		if (edits.length > 1) output.push(theme.fg("dim", `@@ replacement ${index + 1} @@`));
		omitted += appendChangedSnippet(
			output,
			syntax,
			edit.oldText,
			language,
			perSideLimit,
			"-",
			"error",
			theme,
			shikiTheme,
		);
		omitted += appendChangedSnippet(
			output,
			syntax,
			edit.newText,
			language,
			perSideLimit,
			"+",
			"success",
			theme,
			shikiTheme,
		);
	}

	if (omitted > 0) output.push(theme.fg("muted", `… ${omitted} more changed lines`));
	return output.join("\n");
}

function appendChangedSnippet(
	output: string[],
	syntax: ExpressiveHighlighter,
	content: string,
	language: SupportedLanguage,
	lineLimit: number,
	prefix: "-" | "+",
	color: "error" | "success",
	theme: RenderTheme,
	shikiTheme: ShikiTheme,
): number {
	const lines = replaceTabs(content).replace(/\r\n?/g, "\n").split("\n");
	const visible = lines.slice(0, lineLimit);
	const diffBackgrounds = DIFF_LINE_BACKGROUNDS[shikiTheme];
	const background = prefix === "+"
		? diffBackgrounds.addition
		: diffBackgrounds.deletion;
	for (const line of syntax.highlight(visible.join("\n"), language, shikiTheme)) {
		output.push(`${background}${theme.fg(color, prefix)} ${line}${RESET_BACKGROUND}`);
	}
	return Math.max(0, lines.length - visible.length);
}

function getTextOutput(result: { content: Array<{ type: string; text?: string }> }): string | undefined {
	const parts = result.content
		.filter((item) => item.type === "text" && typeof item.text === "string")
		.map((item) => item.text ?? "");
	return parts.length > 0 ? parts.join("\n") : undefined;
}

function lineCount(text: string): number {
	return text.replace(/\r\n?/g, "\n").split("\n").length;
}

function replaceTabs(text: string): string {
	return text.replaceAll("\t", "    ");
}

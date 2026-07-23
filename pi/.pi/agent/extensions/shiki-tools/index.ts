import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	formatSize,
	keyHint,
	type ExtensionAPI,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { Box, Container, Spacer, Text } from "@earendil-works/pi-tui";
import {
	changeStats,
	compactDisplayDiff,
	contentLineCount,
	displayDiffStats,
	findResultCount,
	formatElapsed,
	grepResultStats,
	parseBashResult,
	parseDisplayDiff,
	stripTrailingNotice,
	type DisplayDiffLine,
} from "./hierarchy.ts";
import {
	pairedIntraLineRanges,
	styleAnsiRanges,
} from "./intraline.ts";
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
	{ addition: string; additionEmphasis: string; deletion: string; deletionEmphasis: string }
> = {
	"catppuccin-latte": {
		addition: "\u001b[48;2;231;240;229m", // #e7f0e5
		additionEmphasis: "\u001b[48;2;172;238;187m", // #aceebb
		deletion: "\u001b[48;2;242;228;232m", // #f2e4e8
		deletionEmphasis: "\u001b[48;2;255;206;203m", // #ffcecb
	},
	"catppuccin-mocha": {
		addition: "\u001b[48;2;33;51;38m", // #213326
		additionEmphasis: "\u001b[48;2;48;80;57m", // #305039
		deletion: "\u001b[48;2;56;36;45m", // #38242d
		deletionEmphasis: "\u001b[48;2;82;46;59m", // #522e3b
	},
};
const BOLD = "\u001b[1m";
const RESET_BOLD = "\u001b[22m";
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

type BashHierarchyState = {
	startedAt?: number;
	endedAt?: number;
};

type TruncationDetails = {
	truncation?: {
		truncated?: boolean;
		totalLines?: number;
		totalBytes?: number;
		outputLines?: number;
		outputBytes?: number;
	};
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
	const grep = createGrepToolDefinition(cwd);
	const find = createFindToolDefinition(cwd);
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
			let output = theme.fg("toolTitle", theme.bold("run"));
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
		renderResult(result, options, theme, context) {
			const state = context.state as typeof context.state & BashHierarchyState;
			if (!options.isPartial) state.endedAt ??= Date.now();

			const rawOutput = getTextOutput(result) ?? "";
			const parsed = parseBashResult(rawOutput);
			const outputLines = contentLineCount(parsed.body);
			const status = context.isError
				? parsed.exitCode === undefined
					? theme.fg("error", "failed")
					: theme.fg("error", `exit ${parsed.exitCode}`)
				: options.isPartial
					? theme.fg("accent", "running")
					: theme.fg("success", "exit 0");
			const metrics = [status];
			if (state.startedAt !== undefined) {
				metrics.push(theme.fg("muted", formatElapsed((state.endedAt ?? Date.now()) - state.startedAt)));
			}
			if (outputLines > 0) metrics.push(countMetric(theme, outputLines, "output line"));

			const summary = branchSummary(theme, metrics);
			const text = options.expanded && parsed.body
				? `${summary}\n\n${plainOutput(theme, parsed.body)}`
				: summary;
			const component = context.lastComponent instanceof Text
				? context.lastComponent
				: new Text("", 0, 0);
			component.setText(text);
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

			if (hasImage || textOutput === undefined) {
				return read.renderResult?.(result, options, theme, context) ?? new Text("", 0, 0);
			}
			if (context.isError) return errorResult(theme, textOutput);

			const body = stripTrailingNotice(textOutput);
			const truncation = (result.details as TruncationDetails | undefined)?.truncation;
			const lineTotal = truncation?.truncated
				? (truncation.outputLines ?? contentLineCount(body))
				: (truncation?.totalLines ?? contentLineCount(body));
			const byteTotal = truncation?.truncated
				? (truncation.outputBytes ?? Buffer.byteLength(body))
				: (truncation?.totalBytes ?? Buffer.byteLength(body));
			const metrics = [
				countMetric(theme, lineTotal, "line"),
				theme.fg("muted", formatSize(byteTotal)),
			];
			if (truncation?.truncated) metrics.push(theme.fg("warning", "truncated"));
			const summary = branchSummary(theme, metrics);

			let text = summary;
			if (options.expanded && body) {
				const sourceLines = body.replace(/\r\n?/g, "\n").split("\n");
				const highlighted = syntax && language && sourceLines.length <= MAX_EXPANDED_LINES
					? syntax.highlight(replaceTabs(body), language, shikiThemeFor(theme)).join("\n")
					: plainOutput(theme, body);
				text += `\n\n${highlighted}`;
			}

			const component = context.lastComponent instanceof Text
				? context.lastComponent
				: new Text("", 0, 0);
			component.setText(text);
			return component;
		},
	});

	pi.registerTool({
		...grep,
		renderResult(result, options, theme, context) {
			const textOutput = getTextOutput(result) ?? "";
			if (context.isError) return errorResult(theme, textOutput);

			const body = stripTrailingNotice(textOutput);
			const stats = grepResultStats(body);
			const metrics = [countMetric(theme, stats.matches, "match")];
			if (stats.files > 0) metrics.push(countMetric(theme, stats.files, "file"));
			if (isTruncated(result.details)) metrics.push(theme.fg("warning", "truncated"));
			return summaryResult(theme, branchSummary(theme, metrics), body, options.expanded, context.lastComponent);
		},
	});

	pi.registerTool({
		...find,
		renderResult(result, options, theme, context) {
			const textOutput = getTextOutput(result) ?? "";
			if (context.isError) return errorResult(theme, textOutput);

			const body = stripTrailingNotice(textOutput);
			const metrics = [countMetric(theme, findResultCount(body), "file")];
			if (isTruncated(result.details)) metrics.push(theme.fg("warning", "truncated"));
			return summaryResult(theme, branchSummary(theme, metrics), body, options.expanded, context.lastComponent);
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
		renderResult(result, _options, theme, context) {
			const content = typeof context.args.content === "string" ? context.args.content : "";
			if (context.isError) return errorResult(theme, getTextOutput(result) ?? "");
			const summary = branchSummary(theme, [
				countMetric(theme, contentLineCount(content), "line"),
				theme.fg("muted", formatSize(Buffer.byteLength(content))),
			]);
			const component = context.lastComponent instanceof Text
				? context.lastComponent
				: new Text("", 0, 0);
			component.setText(summary);
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
			let resultComponent: unknown = context.lastComponent;
			if (!state.shikiUsed) {
				// Preserve the built-in preview's settled diff/error state, then replace
				// its result row with our compact hierarchy summary.
				resultComponent = edit.renderResult?.(result, options, theme, context);
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

			const component = resultComponent instanceof Container
				? resultComponent
				: new Container();
			component.clear();
			if (context.isError) {
				component.addChild(errorResult(theme, getTextOutput(result) ?? ""));
				return component;
			}

			const edits = getEdits(context.args as EditInput);
			const inputStats = changeStats(edits);
			const actualDiff = resultDisplayDiff(result.details);
			const actualLines = actualDiff ? parseDisplayDiff(actualDiff) : [];
			const actualStats = displayDiffStats(actualLines);
			const stats = actualLines.length > 0
				? { ...actualStats, replacements: edits.length }
				: inputStats;

			const path = toolPath(context.args);
			const language = languageFromPath(path);
			if (state.shikiCall && syntax && language && actualLines.length > 0) {
				renderCompletedEdit(
					state.shikiCall,
					path,
					actualLines,
					language,
					options.expanded,
					syntax,
					theme,
					shikiThemeFor(theme),
				);
			}

			component.addChild(new Text(branchSummary(theme, [
				theme.fg("success", `+${stats.additions}`),
				theme.fg("error", `−${stats.deletions}`),
				countMetric(theme, stats.replacements, "replacement"),
			]), 0, 0));
			return component;
		},
	});

	pi.on("session_shutdown", () => {
		syntax?.dispose();
		syntax = undefined;
	});
}

function branchSummary(theme: RenderTheme, metrics: string[]): string {
	const rail = theme.fg("text", theme.bold("  ╰ "));
	return `${rail}${metrics.join(theme.fg("muted", " · "))}`;
}

function countMetric(theme: RenderTheme, count: number, singular: string): string {
	const label = count === 1 ? singular : `${singular}s`;
	return `${theme.fg("text", theme.bold(String(count)))}${theme.fg("muted", ` ${label}`)}`;
}

function plainOutput(theme: RenderTheme, text: string): string {
	return replaceTabs(text)
		.split("\n")
		.map((line) => theme.fg("toolOutput", line))
		.join("\n");
}

function errorResult(theme: RenderTheme, output: string): Text {
	const summary = branchSummary(theme, [theme.fg("error", "failed")]);
	return new Text(output ? `${summary}\n\n${plainOutput(theme, output)}` : summary, 0, 0);
}

function summaryResult(
	theme: RenderTheme,
	summary: string,
	body: string,
	expanded: boolean,
	lastComponent: unknown,
): Text {
	const component = lastComponent instanceof Text ? lastComponent : new Text("", 0, 0);
	component.setText(expanded && body ? `${summary}\n\n${plainOutput(theme, body)}` : summary);
	return component;
}

function resultDisplayDiff(details: unknown): string | undefined {
	if (!details || typeof details !== "object") return undefined;
	const diff = (details as { diff?: unknown }).diff;
	return typeof diff === "string" ? diff : undefined;
}

function isTruncated(details: unknown): boolean {
	if (!details || typeof details !== "object") return false;
	const value = details as {
		truncation?: { truncated?: boolean };
		matchLimitReached?: number;
		resultLimitReached?: number;
		linesTruncated?: boolean;
	};
	return Boolean(
		value.truncation?.truncated ||
		value.matchLimitReached ||
		value.resultLimitReached ||
		value.linesTruncated,
	);
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

function renderCompletedEdit(
	box: Box,
	path: string | undefined,
	lines: DisplayDiffLine[],
	language: SupportedLanguage,
	expanded: boolean,
	syntax: ExpressiveHighlighter,
	theme: RenderTheme,
	shikiTheme: ShikiTheme,
): void {
	box.clear();
	box.addChild(new Text(
		`${theme.fg("toolTitle", theme.bold("edit"))} ${theme.fg("accent", path ?? "")}`,
		0,
		0,
	));
	box.addChild(new Spacer(1));
	box.addChild(new Text(
		renderDisplayDiff(
			syntax,
			lines,
			language,
			expanded ? Number.POSITIVE_INFINITY : COLLAPSED_EDIT_LINES,
			theme,
			shikiTheme,
		),
		0,
		0,
	));
}

function renderDisplayDiff(
	syntax: ExpressiveHighlighter,
	lines: DisplayDiffLine[],
	language: SupportedLanguage,
	lineLimit: number,
	theme: RenderTheme,
	shikiTheme: ShikiTheme,
): string {
	const compact = Number.isFinite(lineLimit)
		? compactDisplayDiff(lines, lineLimit)
		: { lines, omittedChangedLines: 0 };
	const lineNumberWidth = Math.max(
		1,
		...lines.flatMap((line) => line.lineNumber === undefined ? [] : [String(line.lineNumber).length]),
	);
	const displayLines = compact.lines.map((line) => ({
		...line,
		content: line.kind === "ellipsis" ? "" : replaceTabs(line.content),
	}));
	const highlighted = syntax.highlight(
		displayLines.map((line) => line.content).join("\n"),
		language,
		shikiTheme,
	);
	const intraLineRanges = pairedIntraLineRanges(displayLines);
	const diffBackgrounds = DIFF_LINE_BACKGROUNDS[shikiTheme];
	const output = displayLines.map((line, index) => {
		if (line.kind === "ellipsis") {
			return theme.fg("muted", `${" ".repeat(lineNumberWidth)}  ⋮`);
		}

		const lineNumber = line.lineNumber === undefined
			? " ".repeat(lineNumberWidth)
			: String(line.lineNumber).padStart(lineNumberWidth, " ");
		const gutter = theme.fg("muted", `${lineNumber} `);
		const sign = line.kind === "add"
			? theme.fg("success", theme.bold("+"))
			: line.kind === "delete"
				? theme.fg("error", theme.bold("-"))
				: theme.fg("muted", " ");
		const lineBackground = line.kind === "add"
			? diffBackgrounds.addition
			: line.kind === "delete"
				? diffBackgrounds.deletion
				: undefined;
		const emphasisBackground = line.kind === "add"
			? diffBackgrounds.additionEmphasis
			: diffBackgrounds.deletionEmphasis;
		const code = intraLineRanges.has(index) && lineBackground
			? styleAnsiRanges(
				highlighted[index] ?? line.content,
				intraLineRanges.get(index)!,
				`${emphasisBackground}${BOLD}`,
				`${RESET_BOLD}${lineBackground}`,
			)
			: (highlighted[index] ?? line.content);
		const rendered = `${gutter}${sign}${code}`;
		return lineBackground ? `${lineBackground}${rendered}${RESET_BACKGROUND}` : rendered;
	});

	if (compact.omittedChangedLines > 0) {
		const noun = compact.omittedChangedLines === 1 ? "line" : "lines";
		output.push(
			`${theme.fg("muted", `… ${compact.omittedChangedLines} more changed ${noun} · `)}` +
			keyHint("app.tools.expand", "to expand"),
		);
	}
	return output.join("\n");
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

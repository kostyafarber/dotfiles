import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";

type HeaderModel = { id?: string } | undefined;
type ThinkingLevel = string | undefined;

const PIXEL_LOGO_LINES = [
	"  ███████",
	"  ███████",
	"████",
	"█████████",
	"████",
];

const LEFT_MARGIN = "  ";
const PIXEL_LOGO_WIDTH = 9;

function piBlue(text: string): string {
	return `\x1b[38;2;76;96;230m${text}\x1b[39m`;
}

function readDefaultThinkingLevel(): ThinkingLevel {
	try {
		const settingsPath = path.join(process.env.HOME ?? "", ".pi", "agent", "settings.json");
		const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as { defaultThinkingLevel?: string };
		return settings.defaultThinkingLevel;
	} catch {
		return undefined;
	}
}

function headerLines(
	theme: { fg: (color: any, text: string) => string; bold: (text: string) => string },
	model: HeaderModel,
	thinkingLevel: ThinkingLevel,
): string[] {
	const muted = (text: string) => theme.fg("muted", text);
	const text = (text: string) => theme.fg("text", text);
	const modelText = model?.id ?? "no model";
	const thinkingText = thinkingLevel ? `thinking ${thinkingLevel}` : "thinking";
	const rightColumn = [
		`${theme.bold(text("Pi"))} ${muted(`v${VERSION}`)}`,
		muted(`${modelText} · ${thinkingText}`),
		muted(`٩(◕‿◕｡)۶ “I'm not much but I'm all I have.”`),
	];

	return [
		"",
		...PIXEL_LOGO_LINES.map((line, index) => {
			const gap = " ".repeat(PIXEL_LOGO_WIDTH - line.length + 3);
			return `${LEFT_MARGIN}${piBlue(line)}${gap}${rightColumn[index] ?? ""}`;
		}),
		"",
	];
}

export default function kostyaHeaderExtension(pi: ExtensionAPI): void {
	let currentModel: HeaderModel;
	let currentThinkingLevel: ThinkingLevel = readDefaultThinkingLevel();

	function enableHeader(ctx: { hasUI: boolean; ui: any; model?: HeaderModel }): void {
		if (!ctx.hasUI) return;

		currentModel = ctx.model;
		ctx.ui.setHeader((_tui: unknown, theme: any) => ({
			render() {
				return headerLines(theme, currentModel, currentThinkingLevel);
			},
			invalidate() {},
		}));
	}

	pi.on("session_start", (_event, ctx) => {
		enableHeader(ctx);
	});

	pi.on("model_select", (event, ctx) => {
		currentModel = event.model;
		enableHeader(ctx);
	});

	pi.on("thinking_level_select", (event, ctx) => {
		currentThinkingLevel = event.level;
		enableHeader(ctx);
	});

	pi.registerCommand("kostya-header", {
		description: "Enable the Kostya Pi startup header",
		handler: async (_args, ctx) => {
			enableHeader(ctx);
			ctx.ui.notify("Kostya header enabled", "info");
		},
	});

	pi.registerCommand("builtin-header", {
		description: "Restore pi's built-in startup header",
		handler: async (_args, ctx) => {
			ctx.ui.setHeader(undefined);
			ctx.ui.notify("Built-in header restored", "info");
		},
	});
}

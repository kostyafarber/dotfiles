import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

type RenderOptions = {
	paddingX: number;
	boxBorderPadding: number;
	colorMode: "none";
};

type RenderMermaid = (source: string, options: RenderOptions) => string;

type AsciiVariant = {
	key: string;
	ascii: string;
	maxLineWidth: number;
};

type MermaidToolDetails = {
	variants: AsciiVariant[];
};

const MAX_SOURCE_CHARS = 20_000;
const MAX_SOURCE_LINES = 400;
const PRESETS = [
	{ key: "default", paddingX: 5, boxBorderPadding: 1 },
	{ key: "compact", paddingX: 3, boxBorderPadding: 1 },
	{ key: "tight", paddingX: 2, boxBorderPadding: 1 },
	{ key: "squeezed", paddingX: 1, boxBorderPadding: 0 },
] as const;

let rendererPromise: Promise<RenderMermaid> | undefined;

function loadRenderer(): Promise<RenderMermaid> {
	rendererPromise ??= (async () => {
		const npmRoot = join(homedir(), ".pi", "agent", "npm", "node_modules");
		const candidates = [
			join(npmRoot, "beautiful-mermaid", "dist", "index.js"),
			join(npmRoot, "pi-mermaid", "node_modules", "beautiful-mermaid", "dist", "index.js"),
		];
		const modulePath = candidates.find(existsSync);
		if (!modulePath) throw new Error("beautiful-mermaid is not installed in Pi's npm package directory");
		const module = (await import(pathToFileURL(modulePath).href)) as {
			renderMermaidASCII?: RenderMermaid;
			renderMermaidAscii?: RenderMermaid;
		};
		const renderer = module.renderMermaidASCII ?? module.renderMermaidAscii;
		if (!renderer) throw new Error("beautiful-mermaid does not export an ASCII renderer");
		return renderer;
	})();
	return rendererPromise;
}

function lineWidth(text: string): number {
	return text.split(/\r?\n/).reduce((width, line) => Math.max(width, visibleWidth(line)), 0);
}

function selectVariant(width: number, variants: AsciiVariant[]): { variant: AsciiVariant; clipped: boolean } {
	const fitting = variants.find((variant) => variant.maxLineWidth <= width);
	const variant = fitting ?? variants[variants.length - 1]!;
	return { variant, clipped: variant.maxLineWidth > width };
}

export default function renderMermaidExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "render_mermaid",
		label: "Mermaid (ASCII)",
		description:
			"Render Mermaid source as a polished, terminal-width-aware ASCII diagram with a concise, topic-specific title. The source stays hidden and the diagram is always fully expanded.",
		promptSnippet: "Before explaining a non-linear system in prose, render one focused terminal-friendly ASCII diagram when it will anchor the explanation.",
		promptGuidelines: [
			"Before drafting an explanation, check whether the concept has branching paths, loops, parallel work, multiple actors or layers, state transitions, ownership boundaries, or non-obvious relationships. If one diagram would replace or anchor more than one paragraph, call render_mermaid first; do not wait for the user to request a diagram.",
			"Give every render_mermaid call a concise, topic-specific title that says what the diagram explains; never use a generic title such as 'Mermaid' or 'Diagram'.",
			"Remain selective: do not diagram simple lists, short linear flows, or ideas that are clearer in a few sentences. Every diagram should answer a concrete structural question, and one focused diagram is usually enough.",
			"Prefer a compact top-to-bottom layout unless a left-to-right layout will fit comfortably in a terminal.",
			"Do not include a fenced Mermaid block or repeat the ASCII diagram in the response; the tool result is the visible diagram.",
		],
		parameters: Type.Object({
			title: Type.String({
				description: "Concise, topic-specific diagram title, usually 2–8 words.",
			}),
			source: Type.String({
				description: "Mermaid diagram source, including its graph/flowchart/sequence/class/ER/state declaration.",
			}),
		}),

		async execute(_toolCallId, params) {
			const source = params.source.trim();
			if (!source) throw new Error("Mermaid source is empty");
			const sourceLines = source.split(/\r?\n/).length;
			if (source.length > MAX_SOURCE_CHARS || sourceLines > MAX_SOURCE_LINES) {
				throw new Error(
					`Mermaid source is too large (${sourceLines} lines, ${source.length} characters; maximum ${MAX_SOURCE_LINES} lines and ${MAX_SOURCE_CHARS} characters)`,
				);
			}

			const render = await loadRenderer();
			const variants: AsciiVariant[] = [];
			let lastError: unknown;
			for (const preset of PRESETS) {
				try {
					const ascii = render(source, {
						paddingX: preset.paddingX,
						boxBorderPadding: preset.boxBorderPadding,
						colorMode: "none",
					}).trimEnd();
					if (ascii) variants.push({ key: preset.key, ascii, maxLineWidth: lineWidth(ascii) });
				} catch (error) {
					lastError = error;
				}
			}
			if (variants.length === 0) {
				throw new Error(
					`Could not render Mermaid source: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
				);
			}

			return {
				content: [{ type: "text" as const, text: variants[0]!.ascii }],
				details: { variants } satisfies MermaidToolDetails,
			};
		},

		renderCall(args, theme) {
			const title = typeof args.title === "string" && args.title.trim() ? args.title.trim() : "Mermaid (ASCII)";
			return new Text(theme.fg("customMessageLabel", theme.bold(title)), 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as MermaidToolDetails | undefined;
			const fallback = result.content.find((part) => part.type === "text")?.text ?? "";
			const variants = details?.variants?.length
				? details.variants
				: [{ key: "fallback", ascii: fallback, maxLineWidth: lineWidth(fallback) }];

			return {
				render(width: number): string[] {
					const safeWidth = Math.max(1, width);
					const { variant, clipped } = selectVariant(safeWidth, variants);
					const lines = variant.ascii
						.split(/\r?\n/)
						.map((line) => (clipped ? truncateToWidth(line, safeWidth, "") : line));
					if (clipped) {
						lines.push(
							truncateToWidth(
								theme.fg("muted", "… clipped to terminal width; widen the terminal to see more"),
								safeWidth,
								"",
							),
						);
					}
					return lines;
				},
				invalidate(): void {},
			};
		},
	});
}

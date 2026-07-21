import { createHighlighter, type ThemedToken } from "shiki";

export const SHIKI_THEMES = {
	light: "catppuccin-latte",
	dark: "catppuccin-mocha",
} as const;

export type ShikiTheme = (typeof SHIKI_THEMES)[keyof typeof SHIKI_THEMES];

export const SUPPORTED_LANGUAGES = [
	"bash",
	"python",
	"typescript",
	"tsx",
	"javascript",
	"jsx",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

type ShikiHighlighter = Awaited<ReturnType<typeof createHighlighter>>;

const PATH_LANGUAGES: Readonly<Record<string, SupportedLanguage>> = {
	bash: "bash",
	cjs: "javascript",
	cts: "typescript",
	js: "javascript",
	jsx: "jsx",
	mjs: "javascript",
	mts: "typescript",
	py: "python",
	sh: "bash",
	ts: "typescript",
	tsx: "tsx",
	zsh: "bash",
};

const CACHE_LIMIT = 128;

export class ExpressiveHighlighter {
	private readonly cache = new Map<string, string[]>();
	private readonly highlighter: ShikiHighlighter;

	private constructor(highlighter: ShikiHighlighter) {
		this.highlighter = highlighter;
	}

	static async create(): Promise<ExpressiveHighlighter> {
		const highlighter = await createHighlighter({
			themes: Object.values(SHIKI_THEMES),
			langs: [...SUPPORTED_LANGUAGES],
		});
		return new ExpressiveHighlighter(highlighter);
	}

	highlight(
		code: string,
		language: SupportedLanguage,
		theme: ShikiTheme = SHIKI_THEMES.light,
	): string[] {
		const normalized = sanitizeForTerminal(code).replace(/\r\n?/g, "\n");
		const cacheKey = `${theme}\0${language}\0${normalized}`;
		const cached = this.cache.get(cacheKey);
		if (cached) {
			this.cache.delete(cacheKey);
			this.cache.set(cacheKey, cached);
			return cached;
		}

		const lines = this.highlighter
			.codeToTokensBase(normalized, {
				lang: language,
				theme,
			})
			.map((line) => line.map(ansiFromToken).join(""));

		this.cache.set(cacheKey, lines);
		while (this.cache.size > CACHE_LIMIT) {
			const oldest = this.cache.keys().next().value;
			if (oldest === undefined) break;
			this.cache.delete(oldest);
		}
		return lines;
	}

	dispose(): void {
		this.cache.clear();
		this.highlighter.dispose();
	}
}

export function languageFromPath(filePath: string | undefined): SupportedLanguage | undefined {
	if (!filePath) return undefined;
	const cleanPath = filePath.split(/[?#]/, 1)[0]?.toLowerCase();
	const extension = cleanPath?.match(/\.([^.\/]+)$/)?.[1];
	return extension ? PATH_LANGUAGES[extension] : undefined;
}

function sanitizeForTerminal(text: string): string {
	return text.replaceAll("\u001b", "\\x1b");
}

function ansiFromToken(token: ThemedToken): string {
	let open = token.color ? ansiForeground(token.color) : "";
	let close = token.color ? "\u001b[39m" : "";
	const fontStyle = token.fontStyle ?? 0;

	// Shiki/TextMate bit flags: italic=1, bold=2, underline=4.
	if (fontStyle & 2) {
		open += "\u001b[1m";
		close = `\u001b[22m${close}`;
	}
	if (fontStyle & 1) {
		open += "\u001b[3m";
		close = `\u001b[23m${close}`;
	}
	if (fontStyle & 4) {
		open += "\u001b[4m";
		close = `\u001b[24m${close}`;
	}

	return `${open}${token.content}${close}`;
}

function ansiForeground(color: string): string {
	const match = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
	if (!match) return "";
	const [, red, green, blue] = match;
	return `\u001b[38;2;${Number.parseInt(red, 16)};${Number.parseInt(green, 16)};${Number.parseInt(blue, 16)}m`;
}

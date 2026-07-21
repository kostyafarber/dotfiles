import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
	ExpressiveHighlighter,
	languageFromPath,
	SHIKI_THEMES,
	type SupportedLanguage,
} from "./syntax.ts";

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
let syntax: ExpressiveHighlighter;

before(async () => {
	syntax = await ExpressiveHighlighter.create();
});

after(() => {
	syntax.dispose();
});

const SAMPLES = [
	["bash", `for file in *.ts; do printf '%s\\n' "$file" | sed -n '1p'; done`],
	["python", `def greet(name: str) -> str:\n    return f"Hello, {name}"`],
	["typescript", `const answer: number = 42;\nexport { answer };`],
	["javascript", `const answer = 42;\nexport { answer };`],
	["tsx", `export const App = () => <main>Hello</main>;`],
	["jsx", `export const App = () => <main>Hello</main>;`],
] satisfies Array<[SupportedLanguage, string]>;

for (const theme of Object.values(SHIKI_THEMES)) {
	for (const [language, source] of SAMPLES) {
		test(`highlights ${language} with ${theme} without changing its visible text`, () => {
			const rendered = syntax.highlight(source, language, theme).join("\n");
			assert.match(rendered, ANSI_PATTERN);
			assert.equal(rendered.replace(ANSI_PATTERN, ""), source);
			assert.ok(new Set(rendered.match(/\u001b\[38;2;[0-9;]+m/g) ?? []).size >= 2);
		});
	}
}

test("uses distinct colors for light and dark themes", () => {
	const source = `const answer: number = 42;`;
	const light = syntax.highlight(source, "typescript", SHIKI_THEMES.light).join("\n");
	const dark = syntax.highlight(source, "typescript", SHIKI_THEMES.dark).join("\n");
	assert.notEqual(light, dark);
});

test("recognizes the supported file extensions", () => {
	assert.equal(languageFromPath("src/index.ts"), "typescript");
	assert.equal(languageFromPath("src/view.tsx"), "tsx");
	assert.equal(languageFromPath("src/index.js"), "javascript");
	assert.equal(languageFromPath("src/view.jsx"), "jsx");
	assert.equal(languageFromPath("script.py"), "python");
	assert.equal(languageFromPath("script.sh"), "bash");
	assert.equal(languageFromPath("README.md"), undefined);
});

test("sanitizes literal terminal escape characters", () => {
	const rendered = syntax.highlight("echo \u001b[31mred", "bash").join("\n");
	assert.equal(rendered.replace(ANSI_PATTERN, ""), "echo \\x1b[31mred");
});

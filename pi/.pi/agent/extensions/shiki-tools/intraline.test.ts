import assert from "node:assert/strict";
import test from "node:test";
import {
	changedWordRanges,
	pairedIntraLineRanges,
	styleAnsiRanges,
} from "./intraline.ts";

test("finds changed word offsets on both sides of a replacement", () => {
	assert.deepEqual(changedWordRanges("const value = old;", "const value = new;"), {
		oldRanges: [{ start: 14, end: 17 }],
		newRanges: [{ start: 14, end: 17 }],
	});
});

test("pairs only unambiguous one-line replacements", () => {
	const ranges = pairedIntraLineRanges([
		{ kind: "delete", content: "return oldValue;" },
		{ kind: "add", content: "return newValue;" },
		{ kind: "context", content: "}" },
	]);
	assert.deepEqual([...ranges.entries()], [
		[0, [{ start: 7, end: 15 }]],
		[1, [{ start: 7, end: 15 }]],
	]);

	assert.equal(pairedIntraLineRanges([
		{ kind: "delete", content: "old one" },
		{ kind: "delete", content: "old two" },
		{ kind: "add", content: "new one" },
		{ kind: "add", content: "new two" },
	]).size, 0);
});

test("styles visible ranges without corrupting syntax ANSI escapes", () => {
	const highlighted = "\u001b[34mconst\u001b[39m value";
	assert.equal(
		styleAnsiRanges(highlighted, [{ start: 6, end: 11 }], "<strong>", "</strong>"),
		"\u001b[34mconst\u001b[39m <strong>value</strong>",
	);
});

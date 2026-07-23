import assert from "node:assert/strict";
import test from "node:test";
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
} from "./hierarchy.ts";

test("counts file lines without treating the final newline as an extra line", () => {
	assert.equal(contentLineCount(""), 0);
	assert.equal(contentLineCount("one"), 1);
	assert.equal(contentLineCount("one\ntwo\n"), 2);
	assert.equal(contentLineCount("one\n\n"), 2);
});

test("strips tool truncation notices from result counts", () => {
	const output = "src/a.ts\nsrc/b.ts\n\n[100 results limit reached]";
	assert.equal(stripTrailingNotice(output), "src/a.ts\nsrc/b.ts");
	assert.equal(findResultCount(output), 2);
});

test("summarizes ripgrep output while ignoring context lines", () => {
	const output = [
		"src/a.ts:4:first match",
		"src/a.ts-5-context",
		"--",
		"src/b.ts:12:second match",
	].join("\n");
	assert.deepEqual(grepResultStats(output), { files: 2, matches: 2 });
});

test("falls back to result-line counts for custom grep backends", () => {
	assert.deepEqual(grepResultStats("alpha\nbeta"), { files: 0, matches: 2 });
});

test("counts changed lines and replacement blocks", () => {
	assert.deepEqual(
		changeStats([
			{ oldText: "old\nline", newText: "new" },
			{ oldText: "", newText: "one\ntwo\n" },
		]),
		{ additions: 3, deletions: 2, replacements: 2 },
	);
});

test("parses Pi display diffs and counts actual changed lines", () => {
	const lines = parseDisplayDiff([
		"  8 context",
		"- 9 old value",
		"+ 9 new value",
		"    ...",
		" 20 later context",
	].join("\n"));
	assert.deepEqual(lines, [
		{ kind: "context", lineNumber: 8, content: "context" },
		{ kind: "delete", lineNumber: 9, content: "old value" },
		{ kind: "add", lineNumber: 9, content: "new value" },
		{ kind: "ellipsis", content: "⋮" },
		{ kind: "context", lineNumber: 20, content: "later context" },
	]);
	assert.deepEqual(displayDiffStats(lines), { additions: 1, deletions: 1 });
});

test("compact diffs keep changed groups but omit context", () => {
	const lines = parseDisplayDiff([
		"  1 before",
		"- 2 first old",
		"+ 2 first new",
		"  3 between",
		"    ...",
		"-20 second old",
		"+20 second new",
		" 21 after",
	].join("\n"));
	assert.deepEqual(compactDisplayDiff(lines, 4), {
		lines: [
			{ kind: "delete", lineNumber: 2, content: "first old" },
			{ kind: "add", lineNumber: 2, content: "first new" },
			{ kind: "ellipsis", content: "⋮" },
			{ kind: "delete", lineNumber: 20, content: "second old" },
			{ kind: "add", lineNumber: 20, content: "second new" },
		],
		omittedChangedLines: 0,
	});
});

test("compact diffs balance a tight budget across change groups", () => {
	const lines = parseDisplayDiff([
		"- 1 old a",
		"- 2 old b",
		"- 3 old c",
		"+ 1 new a",
		"+ 2 new b",
		"+ 3 new c",
		"  4 context",
		"-20 old later",
		"+20 new later",
	].join("\n"));
	const compact = compactDisplayDiff(lines, 4);
	assert.equal(compact.lines.filter((line) => line.kind !== "ellipsis").length, 4);
	assert.equal(compact.lines.some((line) => line.lineNumber === 20), true);
	assert.equal(compact.omittedChangedLines, 4);
});

test("extracts bash exit status from the rendered error body", () => {
	assert.deepEqual(parseBashResult("failure\nCommand exited with code 7"), {
		body: "failure",
		exitCode: 7,
	});
	assert.deepEqual(parseBashResult("all good\n"), { body: "all good" });
});

test("formats compact elapsed durations", () => {
	assert.equal(formatElapsed(420), "420ms");
	assert.equal(formatElapsed(4_240), "4.2s");
	assert.equal(formatElapsed(12_400), "12s");
	assert.equal(formatElapsed(65_000), "1m 5s");
});

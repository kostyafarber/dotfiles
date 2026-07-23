export type ChangeStats = {
	additions: number;
	deletions: number;
	replacements: number;
};

export type GrepStats = {
	files: number;
	matches: number;
};

export type DisplayDiffLine = {
	kind: "add" | "delete" | "context" | "ellipsis";
	lineNumber?: number;
	content: string;
};

const TRAILING_NOTICE = /\n\n\[[^\n]*\]\s*$/;
const BASH_EXIT_STATUS = /(?:^|\n)Command exited with code (\d+)\s*$/;

export function stripTrailingNotice(text: string): string {
	return text.replace(/\r\n?/g, "\n").replace(TRAILING_NOTICE, "");
}

export function contentLines(text: string): string[] {
	const normalized = text.replace(/\r\n?/g, "\n");
	if (normalized === "") return [];
	const withoutTerminator = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
	return withoutTerminator.split("\n");
}

export function contentLineCount(text: string): number {
	return contentLines(text).length;
}

export function findResultCount(text: string): number {
	return contentLines(stripTrailingNotice(text)).filter((line) => line.trim() !== "").length;
}

export function grepResultStats(text: string): GrepStats {
	const lines = contentLines(stripTrailingNotice(text)).filter(
		(line) => line.trim() !== "" && line.trim() !== "--",
	);
	const files = new Set<string>();
	let matches = 0;

	for (const line of lines) {
		const match = /^(.+?):\d+(?::\d+)?:/.exec(line);
		if (!match) continue;
		matches += 1;
		files.add(match[1]!);
	}

	// Custom grep backends may not emit ripgrep's path:line:content shape.
	if (matches === 0 && lines.length > 0) matches = lines.length;
	return { files: files.size, matches };
}

export function changeStats(
	edits: Array<{ oldText: string; newText: string }>,
): ChangeStats {
	return {
		additions: edits.reduce((total, edit) => total + contentLineCount(edit.newText), 0),
		deletions: edits.reduce((total, edit) => total + contentLineCount(edit.oldText), 0),
		replacements: edits.length,
	};
}

export function parseDisplayDiff(diff: string): DisplayDiffLine[] {
	return contentLines(diff).flatMap((line): DisplayDiffLine[] => {
		const match = /^([+\- ])\s*(\d*)\s(.*)$/.exec(line);
		if (!match) return [];
		const content = match[3] ?? "";
		if (match[1] === " " && content === "...") {
			return [{ kind: "ellipsis", content: "⋮" }];
		}
		const lineNumber = match[2] ? Number(match[2]) : undefined;
		const kind = match[1] === "+" ? "add" : match[1] === "-" ? "delete" : "context";
		return [{ kind, ...(lineNumber === undefined ? {} : { lineNumber }), content }];
	});
}

export function displayDiffStats(lines: DisplayDiffLine[]): { additions: number; deletions: number } {
	return {
		additions: lines.filter((line) => line.kind === "add").length,
		deletions: lines.filter((line) => line.kind === "delete").length,
	};
}

export function compactDisplayDiff(
	lines: DisplayDiffLine[],
	lineLimit: number,
): { lines: DisplayDiffLine[]; omittedChangedLines: number } {
	const changedGroups: Array<Array<{ line: DisplayDiffLine; sourceIndex: number }>> = [];
	for (const [sourceIndex, line] of lines.entries()) {
		if (line.kind !== "add" && line.kind !== "delete") continue;
		const previous = changedGroups.at(-1)?.at(-1);
		if (!previous || sourceIndex !== previous.sourceIndex + 1) changedGroups.push([]);
		changedGroups.at(-1)!.push({ line, sourceIndex });
	}

	const changedCount = changedGroups.reduce((total, group) => total + group.length, 0);
	if (changedCount === 0 || lineLimit <= 0) {
		return { lines: [], omittedChangedLines: changedCount };
	}

	const visibleGroups = changedGroups.slice(0, lineLimit);
	const allocations = visibleGroups.map(() => 1);
	let remainingBudget = lineLimit - visibleGroups.length;
	while (remainingBudget > 0) {
		let distributed = false;
		for (const [index, group] of visibleGroups.entries()) {
			if (remainingBudget === 0) break;
			if (allocations[index]! >= group.length) continue;
			allocations[index] = allocations[index]! + 1;
			remainingBudget -= 1;
			distributed = true;
		}
		if (!distributed) break;
	}

	const selected = visibleGroups.flatMap((group, index) => {
		const budget = allocations[index]!;
		if (budget >= group.length) return group;
		// With room for one line, prefer the final line in a replacement group:
		// it is usually the added line and therefore shows the resulting code.
		if (budget === 1) return group.slice(-1);
		const headCount = Math.ceil(budget / 2);
		return [...group.slice(0, headCount), ...group.slice(-(budget - headCount))];
	}).sort((left, right) => left.sourceIndex - right.sourceIndex);

	const output: DisplayDiffLine[] = [];
	for (const [index, selectedLine] of selected.entries()) {
		const previous = selected[index - 1];
		if (previous && selectedLine.sourceIndex > previous.sourceIndex + 1) {
			output.push({ kind: "ellipsis", content: "⋮" });
		}
		output.push(selectedLine.line);
	}

	return {
		lines: output,
		omittedChangedLines: changedCount - selected.length,
	};
}

export function parseBashResult(text: string): { body: string; exitCode?: number } {
	const normalized = text.replace(/\r\n?/g, "\n");
	const match = BASH_EXIT_STATUS.exec(normalized);
	const body = normalized.replace(BASH_EXIT_STATUS, "").trimEnd();
	return match ? { body, exitCode: Number(match[1]) } : { body };
}

export function formatElapsed(milliseconds: number): string {
	if (milliseconds < 1_000) return `${Math.max(0, Math.round(milliseconds))}ms`;
	if (milliseconds < 10_000) return `${(milliseconds / 1_000).toFixed(1)}s`;
	if (milliseconds < 60_000) return `${Math.round(milliseconds / 1_000)}s`;
	const minutes = Math.floor(milliseconds / 60_000);
	const seconds = Math.round((milliseconds % 60_000) / 1_000);
	return `${minutes}m ${seconds}s`;
}

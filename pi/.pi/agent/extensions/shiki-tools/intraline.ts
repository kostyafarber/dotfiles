import { diffWordsWithSpace } from "diff";

export type TextRange = {
	start: number;
	end: number;
};

type DiffLikeLine = {
	kind: "add" | "delete" | "context" | "ellipsis";
	content: string;
};

export function changedWordRanges(
	oldText: string,
	newText: string,
): { oldRanges: TextRange[]; newRanges: TextRange[] } {
	const oldRanges: TextRange[] = [];
	const newRanges: TextRange[] = [];
	let oldOffset = 0;
	let newOffset = 0;

	for (const change of diffWordsWithSpace(oldText, newText)) {
		const length = change.value.length;
		if (change.removed) {
			oldRanges.push({ start: oldOffset, end: oldOffset + length });
			oldOffset += length;
		} else if (change.added) {
			newRanges.push({ start: newOffset, end: newOffset + length });
			newOffset += length;
		} else {
			oldOffset += length;
			newOffset += length;
		}
	}

	return { oldRanges, newRanges };
}

/**
 * Highlight one-to-one replacement lines only. Pairing larger delete/add
 * groups can imply correspondences that the diff algorithm did not establish.
 */
export function pairedIntraLineRanges(lines: DiffLikeLine[]): Map<number, TextRange[]> {
	const ranges = new Map<number, TextRange[]>();
	let index = 0;

	while (index < lines.length) {
		if (lines[index]?.kind !== "delete") {
			index += 1;
			continue;
		}

		const deletedStart = index;
		while (lines[index]?.kind === "delete") index += 1;
		const addedStart = index;
		while (lines[index]?.kind === "add") index += 1;

		if (addedStart - deletedStart !== 1 || index - addedStart !== 1) continue;
		const deleted = lines[deletedStart]!;
		const added = lines[addedStart]!;
		const changed = changedWordRanges(deleted.content, added.content);
		if (changed.oldRanges.length > 0) ranges.set(deletedStart, changed.oldRanges);
		if (changed.newRanges.length > 0) ranges.set(addedStart, changed.newRanges);
	}

	return ranges;
}

/** Insert ANSI styling around visible-text offsets without disturbing Shiki escapes. */
export function styleAnsiRanges(
	ansiText: string,
	ranges: TextRange[],
	open: string,
	close: string,
): string {
	const sorted = ranges
		.filter((range) => range.end > range.start)
		.toSorted((left, right) => left.start - right.start);
	if (sorted.length === 0) return ansiText;

	let output = "";
	let sourceIndex = 0;
	let visibleOffset = 0;
	let rangeIndex = 0;
	let active = false;

	while (sourceIndex < ansiText.length) {
		if (ansiText[sourceIndex] === "\u001b") {
			const escape = /^\u001b\[[0-9;]*m/.exec(ansiText.slice(sourceIndex));
			if (escape) {
				output += escape[0];
				sourceIndex += escape[0].length;
				continue;
			}
		}

		const range = sorted[rangeIndex];
		if (!active && range && visibleOffset === range.start) {
			output += open;
			active = true;
		}

		const codePoint = ansiText.codePointAt(sourceIndex);
		if (codePoint === undefined) break;
		const character = String.fromCodePoint(codePoint);
		output += character;
		sourceIndex += character.length;
		visibleOffset += character.length;

		if (active && range && visibleOffset === range.end) {
			output += close;
			active = false;
			rangeIndex += 1;
		}
	}

	if (active) output += close;
	return output;
}

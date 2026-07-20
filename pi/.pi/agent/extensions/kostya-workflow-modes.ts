import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";

const VAULT_ROOT = "/Users/kostyafarber/Documents/KostyaVault";
const SHIFT_BOARD_PATH = join(VAULT_ROOT, "projects", "shift-board.md");

type WorkflowMode = "design" | "implement";

type ModeConfig = {
	label: string;
	description: string;
	thinking: "high";
	tools: string[];
	instructions: string;
};

const MODES: Record<WorkflowMode, ModeConfig> = {
	design: {
		label: "Design",
		description: "Read-only API/design discussion; snippets are illustrative, not edits",
		thinking: "high",
		tools: ["read", "grep", "find", "ls", "obsidian_search"],
		instructions: [
			"You are in DESIGN MODE.",
			"Do not edit or write files. Do not run mutation commands.",
			"Focus on API shape, architecture boundaries, tradeoffs, naming, and incremental implementation chunks.",
			"Code snippets are illustrative unless Kostya explicitly switches to implementation mode.",
			"Prefer back-and-forth design discussion over rushing to a patch.",
		].join("\n"),
	},
	implement: {
		label: "Implement",
		description: "Make focused edits, run relevant checks, summarize the diff",
		thinking: "high",
		tools: ["read", "grep", "find", "ls", "bash", "edit", "write", "obsidian_search"],
		instructions: [
			"You are in IMPLEMENT MODE.",
			"Make focused, direct edits that match the agreed design. Keep scope tight.",
			"Read before editing, prefer surgical edits, and run relevant tests/checks when practical.",
			"If the design seems wrong during implementation, stop and explain the issue instead of pushing through.",
			"After implementation, summarize changed files, tests run, and any follow-ups.",
			"If work clearly completes an Obsidian ticket, ask before marking it done on the board.",
		].join("\n"),
	},
};

function validTools(pi: ExtensionAPI, requested: string[]): string[] {
	const available = new Set(pi.getAllTools().map((tool) => tool.name));
	return requested.filter((tool) => available.has(tool));
}

function updateStatus(ctx: ExtensionContext, mode: WorkflowMode | undefined): void {
	if (!ctx.hasUI) return;

	if (!mode) {
		ctx.ui.setStatus("workflow-mode", undefined);
		return;
	}

	const color = mode === "design" ? "accent" : "success";
	ctx.ui.setStatus("workflow-mode", ctx.ui.theme.fg(color, `mode:${mode}`));
}

async function applyMode(pi: ExtensionAPI, ctx: ExtensionContext, mode: WorkflowMode): Promise<void> {
	const config = MODES[mode];
	pi.setThinkingLevel(config.thinking);
	pi.setActiveTools(validTools(pi, config.tools));
	updateStatus(ctx, mode);
	ctx.ui.notify(`${config.label} mode enabled`, "info");
}

async function showModePicker(pi: ExtensionAPI, ctx: ExtensionContext, currentMode: WorkflowMode | undefined): Promise<WorkflowMode | null> {
	const items: SelectItem[] = (Object.keys(MODES) as WorkflowMode[]).map((mode) => ({
		value: mode,
		label: mode === currentMode ? `${MODES[mode].label} (active)` : MODES[mode].label,
		description: MODES[mode].description,
	}));

	return ctx.ui.custom<WorkflowMode | null>((tui, theme, _keybindings, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(new Text(theme.fg("accent", theme.bold("Choose Workflow Mode")), 1, 0));

		const selectList = new SelectList(items, items.length, {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});
		selectList.onSelect = (item) => done(item.value as WorkflowMode);
		selectList.onCancel = () => done(null);
		container.addChild(selectList);
		container.addChild(new Text(theme.fg("dim", "design = read-only API discussion • implement = patch files"), 1, 0));
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

		return {
			render(width: number) {
				return container.render(width);
			},
			invalidate() {
				container.invalidate();
			},
			handleInput(data: string) {
				selectList.handleInput(data);
				tui.requestRender();
			},
		};
	});
}

function normalizeTicketToken(value: string): string {
	const token = value.trim().replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0] ?? "";
	const base = basename(token, extname(token));
	return base || token;
}

function ticketTokenFromEditor(ctx: ExtensionContext): string | undefined {
	const text = ctx.ui.getEditorText();
	return text.match(/\[\[([^\]\n]+)\]\]/)?.[1];
}

async function markShiftTicketDone(ctx: ExtensionContext, rawToken: string): Promise<void> {
	const ticket = normalizeTicketToken(rawToken);
	if (!ticket) {
		ctx.ui.notify("Usage: /ticket-done <ticket link or name>", "warning");
		return;
	}

	const ok = await ctx.ui.confirm("Mark ticket done?", `Update ${SHIFT_BOARD_PATH}\n\nTicket: ${ticket}`);
	if (!ok) return;

	const before = await readFile(SHIFT_BOARD_PATH, "utf8");
	const lines = before.split("\n");
	let changed = false;

	const after = lines
		.map((line) => {
			if (changed || !line.includes("- [ ]") || !line.includes("[[") || !line.includes(ticket)) {
				return line;
			}

			changed = true;
			return line.replace("- [ ]", "- [x]");
		})
		.join("\n");

	if (!changed) {
		ctx.ui.notify(`No unchecked board item found for ${ticket}`, "warning");
		return;
	}

	await writeFile(SHIFT_BOARD_PATH, after, "utf8");
	ctx.ui.notify(`Marked ${ticket} done on shift-board.md`, "info");
}

export default function workflowModesExtension(pi: ExtensionAPI): void {
	let activeMode: WorkflowMode | undefined;

	pi.on("session_start", (_event, ctx) => {
		updateStatus(ctx, activeMode);
	});

	pi.on("before_agent_start", (event) => {
		if (!activeMode) return;

		return {
			systemPrompt: `${event.systemPrompt}\n\n${MODES[activeMode].instructions}`,
		};
	});

	pi.registerCommand("mode", {
		description: "Switch between design and implement workflow modes",
		handler: async (args, ctx) => {
			const requested = args.trim().toLowerCase();
			if (requested === "design" || requested === "implement") {
				activeMode = requested;
				await applyMode(pi, ctx, activeMode);
				return;
			}

			const picked = await showModePicker(pi, ctx, activeMode);
			if (!picked) return;

			activeMode = picked;
			await applyMode(pi, ctx, activeMode);
		},
	});

	pi.registerCommand("design", {
		description: "Switch to read-only high-thinking design mode",
		handler: async (_args, ctx) => {
			activeMode = "design";
			await applyMode(pi, ctx, activeMode);
		},
	});

	pi.registerCommand("implement", {
		description: "Switch to high-thinking implementation mode",
		handler: async (_args, ctx) => {
			activeMode = "implement";
			await applyMode(pi, ctx, activeMode);
		},
	});

	pi.registerCommand("ticket-done", {
		description: "Mark a Shift Obsidian board item done; defaults to the first [[ticket]] in the editor",
		handler: async (args, ctx) => {
			const token = args.trim() || ticketTokenFromEditor(ctx);
			if (!token) {
				ctx.ui.notify("No ticket argument or [[ticket]] found in the editor", "warning");
				return;
			}

			await markShiftTicketDone(ctx, token);
		},
	});
}

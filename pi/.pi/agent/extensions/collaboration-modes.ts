import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	COMMAND_PALETTE_DISCOVER_CHANNEL,
	COMMAND_PALETTE_RUN_CHANNEL,
	type CommandPaletteDiscoverEvent,
	type CommandPaletteRunEvent,
	type ExternalCommandPaletteAction,
} from "./lib/command-palette.ts";

type CollaborationMode = "default" | "design";

type ModeEntryData = {
	mode: CollaborationMode;
	restoreTools: string[];
};

const MODE_ENTRY_TYPE = "kostya-collaboration-mode";
const MODE_DEFAULT_ACTION = "collaboration-mode.default";
const MODE_DESIGN_ACTION = "collaboration-mode.design";
const MODE_IMPLEMENT_ACTION = "collaboration-mode.implement";
const MUTATING_TOOLS = new Set(["edit", "write"]);

const DESIGN_INSTRUCTIONS = `You are in Design mode. Do not edit files or external state. Inspect the existing system and work conversationally with me until the change has an implementable shape.

Sketch concrete types, API signatures, representative call sites, data flow, ownership, lifecycle, invalidation, failure semantics, and a loose file-by-file diff. Scale the depth to the change and omit categories that do not apply. Challenge unnecessary abstractions and ensure the design fits the existing system.

Label agreed decisions, open questions, and deferred work. Repository-specific architectural principles remain in AGENTS.md, skills, and architecture documentation.

You may use Bash only for read-only inspection. Do not modify project files, version-control state, configuration, or remote systems. Stop at the coding boundary and wait until I switch out of Design mode and explicitly ask you to proceed.`;

function isMode(value: unknown): value is CollaborationMode {
	return value === "default" || value === "design";
}

function parseModeEntry(entry: SessionEntry): ModeEntryData | undefined {
	if (entry.type !== "custom" || entry.customType !== MODE_ENTRY_TYPE) return undefined;
	const data = entry.data;
	if (!data || typeof data !== "object") return undefined;
	const candidate = data as { mode?: unknown; restoreTools?: unknown };
	if (!isMode(candidate.mode) || !Array.isArray(candidate.restoreTools)) return undefined;
	return {
		mode: candidate.mode,
		restoreTools: candidate.restoreTools.filter((tool): tool is string => typeof tool === "string"),
	};
}

function validTools(pi: ExtensionAPI, tools: string[]): string[] {
	const available = new Set(pi.getAllTools().map((tool) => tool.name));
	return tools.filter((tool) => available.has(tool));
}

function designTools(tools: string[]): string[] {
	return tools.filter((tool) => !MUTATING_TOOLS.has(tool));
}

function latestModeEntry(entries: SessionEntry[]): ModeEntryData | undefined {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = parseModeEntry(entries[index]!);
		if (entry) return entry;
	}
	return undefined;
}

function isPaletteDiscoverEvent(value: unknown): value is CommandPaletteDiscoverEvent {
	return Boolean(value && typeof value === "object" && typeof (value as { add?: unknown }).add === "function");
}

function isPaletteRunEvent(value: unknown): value is CommandPaletteRunEvent {
	return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string");
}

export default function collaborationModesExtension(pi: ExtensionAPI): void {
	let activeMode: CollaborationMode = "default";
	let restoreTools: string[] = [];
	let sessionDefaultTools: string[] = [];
	let sessionContext: ExtensionContext | undefined;

	function updateStatus(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		if (activeMode === "default") {
			ctx.ui.setStatus(MODE_ENTRY_TYPE, undefined);
			return;
		}
		ctx.ui.setStatus(MODE_ENTRY_TYPE, ctx.ui.theme.fg("accent", "mode:design"));
	}

	function applyTools(): void {
		const restored = validTools(pi, restoreTools.length > 0 ? restoreTools : sessionDefaultTools);
		pi.setActiveTools(activeMode === "design" ? designTools(restored) : restored);
	}

	function persistMode(): void {
		pi.appendEntry<ModeEntryData>(MODE_ENTRY_TYPE, {
			mode: activeMode,
			restoreTools: [...restoreTools],
		});
	}

	function setMode(mode: CollaborationMode, ctx: ExtensionContext, options: { persist?: boolean; notify?: boolean } = {}): void {
		if (mode === "design" && activeMode !== "design") {
			restoreTools = pi.getActiveTools();
		} else if (mode === "default" && activeMode === "default") {
			restoreTools = pi.getActiveTools();
		}
		activeMode = mode;
		if (restoreTools.length === 0) restoreTools = [...sessionDefaultTools];
		applyTools();
		updateStatus(ctx);
		if (options.persist !== false) persistMode();
		if (options.notify !== false && ctx.hasUI) {
			const message = mode === "design"
				? "Design mode — read-only collaboration; Ctrl+Shift+S returns to Default"
				: "Default mode";
			ctx.ui.notify(message, "info");
		}
	}

	function restoreFromSession(ctx: ExtensionContext): void {
		const entry = latestModeEntry(ctx.sessionManager.getBranch());
		activeMode = entry?.mode ?? "default";
		restoreTools = validTools(pi, entry?.restoreTools ?? sessionDefaultTools);
		if (entry?.restoreTools.length) sessionDefaultTools = [...restoreTools];
		if (restoreTools.length === 0) restoreTools = [...sessionDefaultTools];
		applyTools();
		updateStatus(ctx);
	}

	async function implementDesign(ctx: ExtensionContext): Promise<void> {
		if (activeMode !== "design") {
			if (ctx.hasUI) ctx.ui.notify("Implement agreed design is available while Design mode is active", "warning");
			return;
		}
		setMode("default", ctx);
		pi.sendUserMessage(
			"Implement the design agreed in this conversation now. Follow the agreed decisions and deferred scope. If an open question still blocks implementation, stop and ask instead of guessing.",
		);
	}

	pi.registerShortcut("ctrl+shift+s", {
		description: "Cycle collaboration mode",
		handler: (ctx) => {
			setMode(activeMode === "design" ? "default" : "design", ctx);
		},
	});

	pi.registerCommand("mode", {
		description: "Set collaboration mode: design, default, or implement",
		handler: async (args, ctx) => {
			switch (args.trim().toLowerCase()) {
				case "design":
					setMode("design", ctx);
					return;
				case "default":
				case "normal":
					setMode("default", ctx);
					return;
				case "implement":
					await implementDesign(ctx);
					return;
				case "":
					ctx.ui.notify(`Collaboration mode: ${activeMode}`, "info");
					return;
				default:
					ctx.ui.notify("Usage: /mode design|default|implement", "warning");
			}
		},
	});

	const unsubscribePaletteDiscovery = pi.events.on(COMMAND_PALETTE_DISCOVER_CHANNEL, (data) => {
		if (!isPaletteDiscoverEvent(data)) return;
		const items: ExternalCommandPaletteAction[] = [
			{
				id: MODE_DESIGN_ACTION,
				label: `Mode: Design${activeMode === "design" ? " (active)" : ""}`,
				description: "Enter read-only collaborative design mode",
				source: "mode",
			},
			{
				id: MODE_DEFAULT_ACTION,
				label: `Mode: Default${activeMode === "default" ? " (active)" : ""}`,
				description: "Return to normal collaboration without starting work",
				source: "mode",
			},
			{
				id: MODE_IMPLEMENT_ACTION,
				label: "Implement agreed design",
				description: "Leave Design mode and implement the agreed decisions",
				source: "mode",
			},
		];
		data.add(items);
	});

	const unsubscribePaletteRun = pi.events.on(COMMAND_PALETTE_RUN_CHANNEL, (data) => {
		if (!sessionContext || !isPaletteRunEvent(data)) return;
		const ctx = sessionContext;
		void (async () => {
			switch (data.id) {
				case MODE_DESIGN_ACTION:
					setMode("design", ctx);
					return;
				case MODE_DEFAULT_ACTION:
					setMode("default", ctx);
					return;
				case MODE_IMPLEMENT_ACTION:
					await implementDesign(ctx);
			}
		})().catch((error) => {
			if (sessionContext?.hasUI) {
				sessionContext.ui.notify(
					`Mode action failed: ${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
			}
		});
	});

	pi.on("session_start", (_event, ctx) => {
		sessionContext = ctx;
		sessionDefaultTools = pi.getActiveTools();
		restoreFromSession(ctx);
	});

	pi.on("session_tree", (_event, ctx) => {
		sessionContext = ctx;
		restoreFromSession(ctx);
	});

	pi.on("before_agent_start", (event) => {
		if (activeMode !== "design") return;
		return { systemPrompt: `${event.systemPrompt}\n\n${DESIGN_INSTRUCTIONS}` };
	});

	pi.on("session_shutdown", () => {
		sessionContext = undefined;
		unsubscribePaletteDiscovery();
		unsubscribePaletteRun();
	});
}

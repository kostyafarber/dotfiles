import { readFileSync, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const MODE_FILE = join(homedir(), ".local", "state", "theme", "mode");
const THEMES = {
	dark: "catppuccin-mocha-clean",
	light: "catppuccin-latte-clean",
} as const;

type ThemeMode = keyof typeof THEMES;

function readMode(): ThemeMode {
	try {
		return readFileSync(MODE_FILE, "utf8").trim() === "dark" ? "dark" : "light";
	} catch {
		return "light";
	}
}

export default function themeSyncExtension(pi: ExtensionAPI): void {
	let watcher: FSWatcher | undefined;
	let reloadTimer: ReturnType<typeof setTimeout> | undefined;

	function stopWatcher(): void {
		watcher?.close();
		watcher = undefined;
		if (reloadTimer) clearTimeout(reloadTimer);
		reloadTimer = undefined;
	}

	function applyTheme(ctx: ExtensionContext): void {
		const mode = readMode();
		const themeName = THEMES[mode];
		const theme = ctx.ui.getTheme(themeName);
		if (!theme) {
			ctx.ui.notify(`Theme sync could not load ${themeName}`, "warning");
			return;
		}

		// Use an in-memory theme so syncing does not rewrite settings.json.
		ctx.ui.setTheme(theme);
	}

	pi.on("session_start", (_event, ctx) => {
		stopWatcher();
		if (ctx.mode !== "tui") return;

		applyTheme(ctx);
		try {
			watcher = watch(dirname(MODE_FILE), (_eventType, filename) => {
				if (filename && filename.toString() !== "mode") return;
				if (reloadTimer) clearTimeout(reloadTimer);
				reloadTimer = setTimeout(() => applyTheme(ctx), 25);
			});
		} catch (error) {
			ctx.ui.notify(
				`Theme sync watcher failed: ${error instanceof Error ? error.message : String(error)}`,
				"warning",
			);
		}
	});

	pi.on("session_shutdown", stopWatcher);
}

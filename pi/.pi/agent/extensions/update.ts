import { writeSync } from "node:fs"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

function schedulePiRestart(sessionFile: string): void {
	const piExecutable = process.argv[1]

	if (!piExecutable || !process.execve) {
		throw new Error("Automatic restart requires Node.js 22.15 or newer on macOS or Linux")
	}

	process.once("exit", () => {
		try {
			process.execve!(piExecutable, ["pi", "--session", sessionFile], process.env)
		} catch (error) {
			writeSync(2, `Failed to restart Pi: ${error instanceof Error ? error.message : String(error)}\n`)
		}
	})
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("update", {
		description: "Update Pi and all installed packages",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle()
			ctx.ui.setStatus("pi-update", "Updating Pi and packages…")

			try {
				const result = await pi.exec("pi", ["update", "--all"])
				const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n")

				if (result.code !== 0) {
					ctx.ui.notify(output || `Update failed with exit code ${result.code}`, "error")
					ctx.ui.setStatus("pi-update", undefined)
					return
				}

				ctx.ui.setStatus("pi-update", undefined)
				const sessionFile = ctx.sessionManager.getSessionFile()
				if (!sessionFile) {
					ctx.ui.notify(
						`${output ? `${output}\n\n` : ""}Pi and packages updated, but this ephemeral session cannot be resumed automatically.`,
						"warning"
					)
					return
				}

				try {
					schedulePiRestart(sessionFile)
				} catch (error) {
					ctx.ui.notify(
						`${output ? `${output}\n\n` : ""}${error instanceof Error ? error.message : String(error)}`,
						"warning"
					)
					return
				}

				ctx.ui.notify(output ? `${output}\n\nRestarting Pi…` : "Pi and packages updated. Restarting Pi…", "info")
				ctx.shutdown()
			} catch (error) {
				ctx.ui.setStatus("pi-update", undefined)
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error")
			}
		},
	})
}

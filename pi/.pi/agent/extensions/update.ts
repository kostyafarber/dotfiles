import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

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
					return
				}

				ctx.ui.notify(
					output
						? `${output}\n\nRestart Pi to load the updates.`
						: "Pi and packages updated. Restart Pi to load the updates.",
					"info"
				)
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error")
			} finally {
				ctx.ui.setStatus("pi-update", undefined)
			}
		},
	})
}

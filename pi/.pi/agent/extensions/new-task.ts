import { chmod, mkdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent"

const MAX_CONTEXT_CHARS = 30_000
const TASK_BRANCH_PREFIX = "task/"

const STOP_WORDS = new Set([
	"a",
	"additional",
	"an",
	"and",
	"another",
	"audit",
	"beyond",
	"can",
	"confidence",
	"continue",
	"create",
	"current",
	"determine",
	"do",
	"explore",
	"figure",
	"find",
	"finding",
	"fix",
	"for",
	"further",
	"get",
	"how",
	"high",
	"identify",
	"identifying",
	"implement",
	"improve",
	"investigate",
	"investigating",
	"make",
	"more",
	"of",
	"on",
	"out",
	"please",
	"research",
	"some",
	"task",
	"the",
	"this",
	"to",
	"ways",
	"we",
	"work",
	"working",
])

const WORD_ALIASES: Record<string, string> = {
	accelerate: "speed",
	accelerating: "speed",
	faster: "speed",
	performance: "perf",
	speeding: "speed",
}

export function deriveTaskId(goal: string): string {
	const normalized = goal
		.toLowerCase()
		.replace(/end[ -]?to[ -]?end/g, "e2e")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()

	const words: string[] = []
	for (const rawWord of normalized.split(/\s+/).filter(Boolean)) {
		if (STOP_WORDS.has(rawWord)) continue
		const word = WORD_ALIASES[rawWord] ?? rawWord
		if (!words.includes(word)) words.push(word)
		if (words.length === 4) break
	}

	const taskId = (words.length > 0 ? words.join("-") : "task").slice(0, 40).replace(/-+$/g, "")
	return taskId || "task"
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`
}

function textContent(content: unknown): string {
	if (typeof content === "string") return content
	if (!Array.isArray(content)) return ""
	return content
		.filter((part): part is { type: "text"; text: string } => {
			return Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text")
		})
		.map((part) => part.text)
		.join("\n")
}

function entryContext(entry: SessionEntry): string | undefined {
	if (entry.type === "compaction") return `### Compacted context\n${entry.summary}`
	if (entry.type === "branch_summary") return `### Branch context\n${entry.summary}`
	if (entry.type !== "message") return undefined

	const role = entry.message.role
	if (role !== "user" && role !== "assistant") return undefined
	const text = textContent(entry.message.content).trim()
	if (!text) return undefined
	return `### ${role === "user" ? "User" : "Assistant"}\n${text}`
}

export function buildConversationExcerpt(entries: SessionEntry[]): string {
	const chunks = entries.map(entryContext).filter((chunk): chunk is string => Boolean(chunk))
	const selected: string[] = []
	let length = 0

	for (let index = chunks.length - 1; index >= 0; index--) {
		const chunk = chunks[index]
		const nextLength = length + chunk.length + 2
		if (nextLength > MAX_CONTEXT_CHARS) {
			if (selected.length === 0) selected.unshift(chunk.slice(-MAX_CONTEXT_CHARS))
			break
		}
		selected.unshift(chunk)
		length = nextLength
	}

	return selected.join("\n\n")
}

function repositoryName(remoteUrl: string, commonDir: string): string {
	const remoteName = remoteUrl
		.trim()
		.replace(/\.git$/i, "")
		.split(/[/:]/)
		.filter(Boolean)
		.pop()
	const fallback = basename(commonDir.replace(/\/.git\/?$/, ""))
	return (remoteName || fallback || "repo").toLowerCase().replace(/[^a-z0-9-]+/g, "-")
}

async function requireSuccess(
	pi: ExtensionAPI,
	command: string,
	args: string[],
	cwd: string,
	description: string,
): Promise<string> {
	const result = await pi.exec(command, args, { cwd, timeout: 120_000 })
	if (result.code !== 0) {
		const details = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n")
		throw new Error(`${description} failed${details ? `:\n${details}` : ""}`)
	}
	return result.stdout.trim()
}

export default function newTaskExtension(pi: ExtensionAPI): void {
	pi.registerCommand("new-task", {
		description: "Open an independent Pi task in a new window of the current tmux session",
		handler: async (args, ctx) => {
			const goal = args.trim()
			if (!goal) {
				ctx.ui.notify("Usage: /new-task <goal>", "error")
				return
			}
			if (!process.env.TMUX) {
				ctx.ui.notify("/new-task must be run from Pi inside tmux", "error")
				return
			}

			ctx.ui.setStatus("new-task", "Preparing new Pi task…")
			let worktreeCreated = false
			let windowCreated = false
			let worktree = ""
			let branch = ""
			let repoRoot = ""

			try {
				await ctx.waitForIdle()
				repoRoot = await requireSuccess(pi, "git", ["rev-parse", "--show-toplevel"], ctx.cwd, "Git repository lookup")
				const commonDirRaw = await requireSuccess(
					pi,
					"git",
					["rev-parse", "--path-format=absolute", "--git-common-dir"],
					repoRoot,
					"Git common directory lookup",
				)
				const remoteUrlResult = await pi.exec("git", ["config", "--get", "remote.origin.url"], { cwd: repoRoot })
				const repo = repositoryName(remoteUrlResult.code === 0 ? remoteUrlResult.stdout : "", commonDirRaw)
				const commit = await requireSuccess(pi, "git", ["rev-parse", "HEAD"], repoRoot, "Current commit lookup")
				const sourceBranchResult = await pi.exec("git", ["symbolic-ref", "--short", "-q", "HEAD"], { cwd: repoRoot })
				const sourceBranch = sourceBranchResult.code === 0 ? sourceBranchResult.stdout.trim() : "detached HEAD"
				const sourceStatus = await requireSuccess(pi, "git", ["status", "--short"], repoRoot, "Git status")
				const tmuxSession = await requireSuccess(
					pi,
					"tmux",
					["display-message", "-p", "#{session_name}"],
					ctx.cwd,
					"tmux session lookup",
				)
				const existingWindows = new Set(
					(
						await requireSuccess(
							pi,
							"tmux",
							["list-windows", "-t", tmuxSession, "-F", "#{window_name}"],
							ctx.cwd,
							"tmux window lookup",
						)
					)
						.split("\n")
						.filter(Boolean),
				)

				const baseTaskId = deriveTaskId(goal)
				let taskId = baseTaskId
				for (let suffix = 1; suffix <= 100; suffix++) {
					if (suffix > 1) taskId = `${baseTaskId}-${suffix}`
					branch = `${TASK_BRANCH_PREFIX}${taskId}`
					worktree = join(homedir(), "worktrees", `${repo}-${taskId}`)
					const stateDir = join(homedir(), ".local", "state", "pi-new-task", taskId)
					const branchResult = await pi.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
						cwd: repoRoot,
					})
					if (!existingWindows.has(taskId) && branchResult.code !== 0 && !existsSync(worktree) && !existsSync(stateDir)) {
						break
					}
					if (suffix === 100) throw new Error(`Could not allocate a unique task ID from ${baseTaskId}`)
				}

				await mkdir(join(homedir(), "worktrees"), { recursive: true })
				await requireSuccess(
					pi,
					"git",
					["worktree", "add", "-b", branch, worktree, commit],
					repoRoot,
					"Worktree creation",
				)
				worktreeCreated = true

				let environmentCommand = "pi"
				if (existsSync(join(worktree, ".envrc"))) {
					await requireSuccess(
						pi,
						"git",
						["ls-files", "--error-unmatch", ".envrc"],
						worktree,
						"Tracked .envrc verification",
					)
					await requireSuccess(pi, "direnv", ["allow"], worktree, "direnv approval")
					const verificationScript = existsSync(join(worktree, "flake.nix"))
						? 'test -n "$IN_NIX_SHELL" && command -v pi'
						: "command -v pi"
					await requireSuccess(
						pi,
						"direnv",
						["exec", worktree, "sh", "-c", verificationScript],
						worktree,
						"Activated environment verification",
					)
					environmentCommand = `direnv exec ${shellQuote(worktree)} pi`
				} else if (existsSync(join(worktree, "flake.nix"))) {
					await requireSuccess(
						pi,
						"nix",
						["develop", worktree, "--command", "sh", "-c", "command -v pi"],
						worktree,
						"Nix development environment verification",
					)
					environmentCommand = `nix develop ${shellQuote(worktree)} --command pi`
				}

				const stateDir = join(homedir(), ".local", "state", "pi-new-task", taskId)
				const promptPath = join(stateDir, "context.md")
				const launcherPath = join(stateDir, "launch.zsh")
				await mkdir(stateDir, { recursive: true, mode: 0o700 })

				const conversation = buildConversationExcerpt(ctx.sessionManager.buildContextEntries())
				const prompt = `# Independent Pi task: ${taskId}\n\nYou are running as an independent interactive Pi session in a separate tmux window. The user will visit this window and continue the conversation here. Do not report back to, message, or coordinate with the source Pi session automatically.\n\n## Task\n\n${goal}\n\n## Working copy\n\n- Worktree: \`${worktree}\`\n- Branch: \`${branch}\`\n- Starting commit: \`${commit}\`\n- Source branch: \`${sourceBranch}\`\n- Source session: \`${ctx.sessionManager.getSessionFile() ?? "ephemeral"}\`\n\nWork only in this worktree. Read and follow its repository instructions before changing files. Do not commit, push, open or modify pull requests/issues, or clean up the worktree unless the user explicitly asks in this Pi chat.\n\nThe source worktree status at launch was:\n\n\`\`\`text\n${sourceStatus || "clean"}\n\`\`\`\n\nUncommitted source-worktree changes are not copied into this independent worktree.\n\n## Relevant source conversation\n\n${conversation || "No prior conversation context was available."}\n`
				await writeFile(promptPath, prompt, { encoding: "utf8", mode: 0o600 })

				const modelArgs = ctx.model ? ["--model", `${ctx.model.provider}/${ctx.model.id}`] : []
				const thinkingArgs = ctx.thinkingLevel ? ["--thinking", ctx.thinkingLevel] : []
				const piArgs = ["--approve", "--name", taskId, ...modelArgs, ...thinkingArgs]
					.map(shellQuote)
					.join(" ")
				const launcher = `#!/bin/zsh\nset +e\ncd ${shellQuote(worktree)}\nprompt="$(cat ${shellQuote(promptPath)})"\n${environmentCommand} ${piArgs} "$prompt"\nstatus=$?\nprintf '\\n[new-task] Pi exited with status %s. This shell remains open for inspection.\\n' "$status"\nexec "\${SHELL:-/bin/zsh}" -l\n`
				await writeFile(launcherPath, launcher, { encoding: "utf8", mode: 0o700 })
				await chmod(launcherPath, 0o700)

				await requireSuccess(
					pi,
					"tmux",
					["new-window", "-d", "-t", tmuxSession, "-n", taskId, "-c", worktree, launcherPath],
					ctx.cwd,
					"tmux window creation",
				)
				windowCreated = true

				ctx.ui.notify(
					`Opened independent Pi task in tmux window ${taskId}. Switch with Ctrl-b w.\n${worktree}`,
					"info",
				)
			} catch (error) {
				if (worktreeCreated && !windowCreated && worktree && repoRoot) {
					await pi.exec("git", ["worktree", "remove", worktree], { cwd: repoRoot, timeout: 30_000 })
					if (branch) await pi.exec("git", ["branch", "-d", branch], { cwd: repoRoot, timeout: 30_000 })
				}
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error")
			} finally {
				ctx.ui.setStatus("new-task", undefined)
			}
		},
	})
}

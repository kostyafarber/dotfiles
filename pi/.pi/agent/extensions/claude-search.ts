import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface TraceItem {
	time: string;
	type: "status" | "tool_call" | "tool_result" | "text" | "result" | "error";
	message: string;
	toolName?: string;
	input?: unknown;
}

function nowTime(): string {
	return new Date().toLocaleTimeString();
}

function truncate(text: string, max = 1200): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}…`;
}

function parseMaybeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function summarizeToolInput(input: unknown): string {
	if (!input || typeof input !== "object") return "";
	const value = input as Record<string, unknown>;
	if (typeof value.query === "string") return `: ${value.query}`;
	if (typeof value.url === "string") return `: ${value.url}`;
	const json = JSON.stringify(value);
	return json === "{}" ? "" : `: ${truncate(json, 160)}`;
}

function summarizeToolResult(event: any): string | undefined {
	const toolResult = event.tool_use_result;
	if (!toolResult) return undefined;
	if (typeof toolResult.query === "string") {
		const count = Array.isArray(toolResult.results) ? toolResult.results.length : undefined;
		return `WebSearch result: ${toolResult.query}${count ? ` (${count} result group${count === 1 ? "" : "s"})` : ""}`;
	}
	if (typeof toolResult.url === "string") return `WebFetch result: ${toolResult.url}`;
	return "Claude tool result received";
}

function makeProgress(trace: TraceItem[], partialText: string, status = "Claude search running..."): string {
	const recent = trace.slice(-8).map((item) => `- ${item.message}`).join("\n");
	const partial = partialText.trim() ? `\n\nPartial answer:\n${truncate(partialText.trim(), 1800)}` : "";
	return `${status}${recent ? `\n${recent}` : ""}${partial}`;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "claude_search",
		label: "Claude Search",
		description:
			"Delegate web research to the local Claude Code CLI subscription. It runs `claude -p` with WebSearch/WebFetch and streams Claude's tool calls/progress back into pi.",
		promptSnippet: "Use local Claude Code WebSearch/WebFetch for web research and return sourced findings.",
		promptGuidelines: [
			"Use claude_search when the user asks for web search, current information, source discovery, or research that benefits from Claude Code's WebSearch/WebFetch tools.",
			"When using claude_search, pass a focused research prompt and ask Claude to include source URLs.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Research prompt to send to local Claude Code." }),
			maxBudgetUsd: Type.Optional(
				Type.Number({ description: "Maximum Claude Code spend for this invocation. Default: 1.00", minimum: 0.01 }),
			),
			timeoutSeconds: Type.Optional(
				Type.Number({ description: "Kill Claude if it runs longer than this. Default: 180", minimum: 5 }),
			),
			model: Type.Optional(Type.String({ description: "Optional Claude Code model alias/name, e.g. sonnet, opus, fable." })),
			effort: Type.Optional(Type.String({ description: "Optional Claude effort: low, medium, high, xhigh, max." })),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const trace: TraceItem[] = [];
			const toolInputs = new Map<number, { name: string; partialJson: string; input?: unknown }>();
			let partialText = "";
			let finalResult = "";
			let stderr = "";
			let resultEvent: any | undefined;
			let wasAborted = false;
			let lastProgress = 0;

			const addTrace = (item: Omit<TraceItem, "time">) => {
				trace.push({ time: nowTime(), ...item });
			};
			const emit = (status?: string, force = false) => {
				if (!onUpdate) return;
				const now = Date.now();
				if (!force && now - lastProgress < 350) return;
				lastProgress = now;
				onUpdate({
					content: [{ type: "text", text: makeProgress(trace, partialText, status) }],
					details: { trace, partialText },
				});
			};

			const defaultClaude = existsSync("/Users/kostyafarber/.local/bin/claude")
				? "/Users/kostyafarber/.local/bin/claude"
				: "claude";
			const claudeBin = process.env.CLAUDE_BIN || defaultClaude;
			const maxBudget = params.maxBudgetUsd ?? 1.0;
			const timeoutSeconds = params.timeoutSeconds ?? 180;
			const prompt = [
				"Use web search/fetch as needed. Return a concise, useful answer with markdown source links.",
				"Research prompt:",
				params.query,
			].join("\n\n");

			const args = [
				"-p",
				"--verbose",
				"--output-format",
				"stream-json",
				"--include-partial-messages",
				"--forward-subagent-text",
				"--tools",
				"WebSearch,WebFetch",
				"--max-budget-usd",
				String(maxBudget),
			];
			if (params.model) args.push("--model", params.model);
			if (params.effort) args.push("--effort", params.effort);
			args.push(prompt);

			addTrace({ type: "status", message: `Starting Claude Code web research (budget $${maxBudget})` });
			emit("Starting Claude search...", true);

			const exitCode = await new Promise<number>((resolve) => {
				const proc = spawn(claudeBin, args, {
					cwd: ctx.cwd,
					shell: false,
					stdio: ["ignore", "pipe", "pipe"],
				});

				let stdoutBuffer = "";
				const timeout = setTimeout(() => {
					wasAborted = true;
					addTrace({ type: "error", message: `Timeout after ${timeoutSeconds}s; terminating Claude` });
					emit("Claude search timed out", true);
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				}, timeoutSeconds * 1000);

				const processLine = (line: string) => {
					if (!line.trim()) return;
					let event: any;
					try {
						event = JSON.parse(line);
					} catch {
						return;
					}

					if (event.type === "system") {
						if (event.subtype === "init") {
							addTrace({ type: "status", message: `Claude ${event.model ?? ""} initialized` });
							emit();
						} else if (event.subtype === "status" && event.status) {
							addTrace({ type: "status", message: `Claude status: ${event.status}` });
							emit();
						}
						return;
					}

					if (event.type === "stream_event" && event.event) {
						const inner = event.event;
						if (inner.type === "content_block_start" && inner.content_block?.type === "tool_use") {
							const name = inner.content_block.name ?? "tool";
							const input = inner.content_block.input ?? {};
							toolInputs.set(inner.index, { name, partialJson: "", input });
							addTrace({ type: "tool_call", toolName: name, input, message: `${name}${summarizeToolInput(input)}` });
							emit("Claude is using a web tool...", true);
						} else if (inner.type === "content_block_delta") {
							if (inner.delta?.type === "input_json_delta") {
								const state = toolInputs.get(inner.index);
								if (state) {
									state.partialJson += inner.delta.partial_json ?? "";
									const parsed = parseMaybeJson(state.partialJson);
									if (parsed !== undefined) {
										state.input = parsed;
										const last = trace[trace.length - 1];
										if (last?.type === "tool_call" && last.toolName === state.name) {
											last.input = parsed;
											last.message = `${state.name}${summarizeToolInput(parsed)}`;
										}
										emit("Claude is preparing a web tool call...");
									}
								}
							} else if (inner.delta?.type === "text_delta") {
								partialText += inner.delta.text ?? "";
								emit("Claude is drafting the answer...");
							}
						}
						return;
					}

					if (event.type === "user") {
						const summary = summarizeToolResult(event);
						if (summary) {
							addTrace({ type: "tool_result", message: summary, input: event.tool_use_result });
							emit("Claude got web results", true);
						}
						return;
					}

					if (event.type === "result") {
						resultEvent = event;
						finalResult = event.result ?? finalResult;
						const cost = typeof event.total_cost_usd === "number" ? `, $${event.total_cost_usd.toFixed(4)}` : "";
						const turns = typeof event.num_turns === "number" ? `${event.num_turns} turn${event.num_turns === 1 ? "" : "s"}` : "done";
						addTrace({ type: "result", message: `Claude completed: ${turns}${cost}` });
						emit("Claude search completed", true);
					}
				};

				proc.stdout.on("data", (data) => {
					stdoutBuffer += data.toString();
					const lines = stdoutBuffer.split("\n");
					stdoutBuffer = lines.pop() ?? "";
					for (const line of lines) processLine(line);
				});

				proc.stderr.on("data", (data) => {
					stderr += data.toString();
					addTrace({ type: "error", message: truncate(data.toString().trim(), 300) });
					emit("Claude wrote to stderr");
				});

				proc.on("close", (code) => {
					clearTimeout(timeout);
					if (stdoutBuffer.trim()) processLine(stdoutBuffer);
					resolve(code ?? 0);
				});

				proc.on("error", (error) => {
					clearTimeout(timeout);
					stderr += error.message;
					addTrace({ type: "error", message: error.message });
					resolve(1);
				});

				const abort = () => {
					wasAborted = true;
					addTrace({ type: "error", message: "Aborted by pi" });
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (signal?.aborted) abort();
				else signal?.addEventListener("abort", abort, { once: true });
			});

			if (wasAborted) throw new Error("Claude search was aborted");
			if (!finalResult.trim()) {
				finalResult = partialText.trim();
			}
			if (exitCode !== 0) {
				if (!finalResult.trim()) {
					throw new Error(`Claude search failed with exit code ${exitCode}${stderr ? `: ${stderr}` : ""}`);
				}
				const errors = Array.isArray(resultEvent?.errors) ? ` (${resultEvent.errors.join("; ")})` : "";
				addTrace({ type: "error", message: `Claude exited with code ${exitCode}${errors}; returning captured output` });
				finalResult = `${finalResult}\n\n[Claude exited with code ${exitCode}${errors}; output above was captured before exit.]`;
			}

			return {
				content: [
					{
						type: "text",
						text: finalResult || "Claude search completed without a text result.",
					},
				],
				details: {
					trace,
					result: finalResult,
					usage: resultEvent?.usage,
					modelUsage: resultEvent?.modelUsage,
					totalCostUsd: resultEvent?.total_cost_usd,
					sessionId: resultEvent?.session_id,
					stderr,
				},
			};
		},
	});
}

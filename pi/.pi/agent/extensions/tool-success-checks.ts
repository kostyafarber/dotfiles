import {
	ToolExecutionComponent,
	type ExtensionAPI,
	type Theme,
} from '@earendil-works/pi-coding-agent'
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'

type ToolExecutionRuntime = {
	isPartial?: boolean
	result?: { isError?: boolean }
}

type RenderToolExecution = (this: ToolExecutionComponent, width: number) => string[]

const originalRender = ToolExecutionComponent.prototype.render as RenderToolExecution
let activeTheme: Theme | undefined

function escapeSequenceLength(text: string, index: number): number {
	if (text[index] !== '\x1b') return 0

	const sequence = text.slice(index)
	const match = /^(?:\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][\s\S]*?(?:\x07|\x1b\\)|\x1b_[\s\S]*?\x1b\\)/.exec(
		sequence
	)
	return match?.[0].length ?? 0
}

function hasVisibleContent(line: string): boolean {
	for (let index = 0; index < line.length; ) {
		const escapeLength = escapeSequenceLength(line, index)
		if (escapeLength > 0) {
			index += escapeLength
			continue
		}
		if (!/\s/.test(line[index]!)) return true
		index++
	}
	return false
}

function statusInsertionIndex(line: string): number {
	let index = 0
	let insertionIndex = 0

	while (index < line.length) {
		const escapeLength = escapeSequenceLength(line, index)
		if (escapeLength > 0) {
			index += escapeLength
			continue
		}
		if (line[index] === ' ' || line[index] === '\t') {
			index++
			insertionIndex = index
			continue
		}
		break
	}

	return insertionIndex
}

function addSuccessCheck(line: string, width: number, theme: Theme): string {
	const insertionIndex = statusInsertionIndex(line)
	const check = `${theme.fg('success', theme.bold('●'))} `
	const decorated = `${line.slice(0, insertionIndex)}${check}${line.slice(insertionIndex)}`
	return visibleWidth(decorated) > width ? truncateToWidth(decorated, width, '') : decorated
}

const renderWithSuccessCheck: RenderToolExecution = function (width) {
	const lines = originalRender.call(this, width)
	const runtime = this as unknown as ToolExecutionRuntime
	if (!activeTheme || runtime.isPartial || !runtime.result || runtime.result.isError) return lines

	const titleLine = lines.findIndex(hasVisibleContent)
	if (titleLine >= 0) lines[titleLine] = addSuccessCheck(lines[titleLine]!, width, activeTheme)
	return lines
}

export default function toolSuccessChecksExtension(pi: ExtensionAPI): void {
	ToolExecutionComponent.prototype.render = renderWithSuccessCheck

	pi.on('session_start', (_event, ctx) => {
		activeTheme = ctx.ui.theme
	})

	pi.on('session_shutdown', () => {
		activeTheme = undefined
		if (ToolExecutionComponent.prototype.render === renderWithSuccessCheck) {
			ToolExecutionComponent.prototype.render = originalRender
		}
	})
}

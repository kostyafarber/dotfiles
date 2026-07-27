import type { Theme } from '@earendil-works/pi-coding-agent'
import {
	CURSOR_MARKER,
	fuzzyFilter,
	type Focusable,
	matchesKey,
	truncateToWidth,
	type TUI,
	visibleWidth,
} from '@earendil-works/pi-tui'
import type { TicketNote } from './types.ts'

const MAX_VISIBLE_NOTES = 12

export class TicketPickerComponent implements Focusable {
	focused = false

	private notes: TicketNote[]
	private selected = 0
	private scrollOffset = 0
	private selectedNotes = new Map<string, TicketNote>()
	private searchMode = false
	private query = ''

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly allNotes: TicketNote[],
		private readonly done: (notes: TicketNote[] | undefined) => void
	) {
		this.notes = allNotes
	}

	private selectedNote(): TicketNote | undefined {
		return this.notes[this.selected]
	}

	private toggleSelectedNote(): void {
		const note = this.selectedNote()
		if (!note) return
		if (this.selectedNotes.has(note.id)) this.selectedNotes.delete(note.id)
		else this.selectedNotes.set(note.id, note)
	}

	private confirmSelection(): void {
		const selected = [...this.selectedNotes.values()]
		if (selected.length > 0) {
			this.done(selected)
			return
		}

		const note = this.selectedNote()
		if (note) this.done([note])
	}

	private updateSearch(query: string): void {
		this.query = query
		this.notes = query.trim()
			? fuzzyFilter(
					this.allNotes,
					query,
					(note) =>
						`${note.title} ${note.status ?? ''} ${note.noteType ?? ''} ${note.relativePath}`
				)
			: this.allNotes
		this.selected = 0
		this.scrollOffset = 0
	}

	private moveSelection(delta: number): void {
		if (this.notes.length === 0) return
		this.selected = Math.max(0, Math.min(this.notes.length - 1, this.selected + delta))
		if (this.selected < this.scrollOffset) this.scrollOffset = this.selected
		if (this.selected >= this.scrollOffset + MAX_VISIBLE_NOTES) {
			this.scrollOffset = this.selected - MAX_VISIBLE_NOTES + 1
		}
	}

	private handleSearchInput(data: string): void {
		if (matchesKey(data, 'escape')) {
			this.searchMode = false
			return
		}
		if (matchesKey(data, 'up')) {
			this.moveSelection(-1)
			return
		}
		if (matchesKey(data, 'down')) {
			this.moveSelection(1)
			return
		}
		if (matchesKey(data, 'pageUp')) {
			this.moveSelection(-MAX_VISIBLE_NOTES)
			return
		}
		if (matchesKey(data, 'pageDown')) {
			this.moveSelection(MAX_VISIBLE_NOTES)
			return
		}
		if (matchesKey(data, 'tab')) {
			this.toggleSelectedNote()
			return
		}
		if (matchesKey(data, 'enter') || matchesKey(data, 'return')) {
			this.confirmSelection()
			return
		}
		if (matchesKey(data, 'backspace')) {
			this.updateSearch(Array.from(this.query).slice(0, -1).join(''))
			return
		}
		if (matchesKey(data, 'ctrl+u')) {
			this.updateSearch('')
			return
		}
		if (
			!data.includes('\x1b') &&
			Array.from(data).every((character) => character >= ' ' && character !== '\x7f')
		) {
			this.updateSearch(this.query + data)
		}
	}

	handleInput(data: string): void {
		if (this.searchMode) {
			this.handleSearchInput(data)
			this.tui.requestRender()
			return
		}

		if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c') || data === 'q') {
			this.done(undefined)
			return
		}
		if (data === '/') {
			this.searchMode = true
			this.tui.requestRender()
			return
		}
		if (matchesKey(data, 'up') || data === 'k') this.moveSelection(-1)
		else if (matchesKey(data, 'down') || data === 'j') this.moveSelection(1)
		else if (matchesKey(data, 'pageUp')) this.moveSelection(-MAX_VISIBLE_NOTES)
		else if (matchesKey(data, 'pageDown')) this.moveSelection(MAX_VISIBLE_NOTES)
		else if (matchesKey(data, 'space') || matchesKey(data, 'tab')) this.toggleSelectedNote()
		else if (matchesKey(data, 'enter') || matchesKey(data, 'return')) this.confirmSelection()
		this.tui.requestRender()
	}

	private renderNote(note: TicketNote, selected: boolean, width: number): string {
		const marker = selected ? this.theme.fg('accent', '›') : ' '
		const checked = this.selectedNotes.has(note.id)
			? this.theme.fg('success', '✓')
			: this.theme.fg('dim', '○')
		const title = selected ? this.theme.bold(note.title) : note.title
		const metadata = [note.status, note.noteType, note.relativePath]
			.filter(Boolean)
			.join(' · ')
		const suffix = metadata ? this.theme.fg('dim', `  ${metadata}`) : ''
		return truncateToWidth(
			`  ${marker} ${checked} ${title}${suffix}`,
			width,
			this.theme.fg('dim', '…')
		)
	}

	render(width: number): string[] {
		const lines: string[] = ['']
		const title = this.theme.fg('accent', this.theme.bold('Shift tickets'))
		const selectedCount = this.selectedNotes.size
		const count = `${this.notes.length} note${this.notes.length === 1 ? '' : 's'}${selectedCount > 0 ? ` · ${selectedCount} selected` : ''}`
		const gap = ' '.repeat(Math.max(2, width - visibleWidth(title) - visibleWidth(count) - 4))
		lines.push(`  ${title}${gap}${this.theme.fg('dim', count)}`)
		lines.push(this.theme.fg('borderMuted', '─'.repeat(Math.max(0, width))))

		if (this.searchMode) {
			const cursor = this.focused ? CURSOR_MARKER : ''
			lines.push(
				truncateToWidth(
					`  ${this.theme.fg('accent', '/')} ${this.query}${cursor}${this.theme.fg('accent', '▌')}`,
					width,
					this.theme.fg('dim', '…')
				)
			)
			lines.push(
				`  ${this.theme.fg('dim', '↑↓ navigate · Tab select · Enter insert · Ctrl+U clear · Esc done')}`
			)
		} else {
			lines.push(
				`  ${this.theme.fg('muted', this.query ? `Results for “${this.query}”` : 'All Shift notes')}`
			)
			lines.push(`  ${this.theme.fg('dim', 'Press / to search')}`)
		}
		lines.push('')

		if (this.notes.length === 0) {
			lines.push(`  ${this.theme.fg('dim', 'No matching tickets.')}`)
		} else {
			const visible = this.notes.slice(
				this.scrollOffset,
				this.scrollOffset + MAX_VISIBLE_NOTES
			)
			for (let index = 0; index < visible.length; index++) {
				const absoluteIndex = this.scrollOffset + index
				lines.push(this.renderNote(visible[index]!, absoluteIndex === this.selected, width))
			}
			if (this.notes.length > MAX_VISIBLE_NOTES) {
				lines.push(
					`  ${this.theme.fg('dim', `${this.selected + 1}/${this.notes.length} · scroll for more`)}`
				)
			}
		}

		lines.push('')
		if (!this.searchMode) {
			lines.push(
				`  ${this.theme.fg('dim', '↑↓/jk navigate · Space/Tab select · Enter insert · / search · Esc close')}`
			)
		}
		lines.push('')
		return lines.map((line) => truncateToWidth(line, width, this.theme.fg('dim', '…')))
	}

	invalidate(): void {}
}

export function draftForAttachmentCommand(
	editorText: string,
	args: string,
	command: string
): string {
	const trimmedEditor = editorText.trim()
	const commandText = `/${command}`
	if (
		trimmedEditor.length === 0 ||
		trimmedEditor === commandText ||
		trimmedEditor.startsWith(`${commandText} `)
	) {
		return args.trim()
	}
	return editorText.trimEnd()
}

export function appendDraftItems(draft: string, items: string[]): string {
	const additions = items.map((item) => item.trim()).filter(Boolean)
	const base = draft.trimEnd()
	if (additions.length === 0) return base
	return `${base}${base ? ' ' : ''}${additions.join(' ')} `
}

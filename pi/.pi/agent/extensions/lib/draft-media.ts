export const DRAFT_MEDIA_COLLECT_CHANNEL = 'draft-media:collect'
export const DRAFT_MEDIA_ACTIVATE_CHANNEL = 'draft-media:activate'

export type DraftMediaItem = {
	provider: string
	id: string
	label: string
	start: number
	end: number
}

export type DraftMediaCollectRequest = {
	text: string
	items: DraftMediaItem[]
}

export type DraftMediaActivateRequest = {
	item: DraftMediaItem
	toggle: boolean
	handled: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isDraftMediaCollectRequest(
	value: unknown
): value is DraftMediaCollectRequest {
	return isRecord(value) && typeof value.text === 'string' && Array.isArray(value.items)
}

export function isDraftMediaActivateRequest(
	value: unknown
): value is DraftMediaActivateRequest {
	if (!isRecord(value) || !isRecord(value.item)) return false
	return (
		typeof value.item.provider === 'string' &&
		typeof value.item.id === 'string' &&
		typeof value.item.label === 'string' &&
		typeof value.item.start === 'number' &&
		typeof value.item.end === 'number' &&
		typeof value.toggle === 'boolean' &&
		typeof value.handled === 'boolean'
	)
}

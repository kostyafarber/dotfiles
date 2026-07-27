export type TicketNote = Readonly<{
	id: string
	path: string
	relativePath: string
	title: string
	status?: string
	noteType?: string
	content: string
}>

export type DraftTicket = Readonly<{
	marker: string
	note: TicketNote
}>

export type TicketMarkerMatch = Readonly<{
	marker: string
	start: number
	end: number
}>

export type AttachedTicketSummary = Readonly<{
	marker: string
	title: string
	path: string
	status?: string
	error?: string
}>

export type AttachedTicketMessageDetails = Readonly<{
	tickets: AttachedTicketSummary[]
	omittedCount: number
}>

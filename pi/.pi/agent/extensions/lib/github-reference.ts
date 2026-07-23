export const GITHUB_REFERENCE_SELECTED_CHANNEL = 'github-reference:selected'

export type GitHubReferenceKind = 'issue' | 'pr'

export type GitHubReferenceSelection = {
	kind: GitHubReferenceKind
	number: number
	repo: string
	title: string
	url: string
	state?: string
}

export function githubReferenceMarker(
	kind: GitHubReferenceKind,
	number: number
): string {
	return kind === 'pr' ? `[PR #${number}]` : `[issue #${number}]`
}

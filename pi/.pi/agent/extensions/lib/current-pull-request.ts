import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

const GH_TIMEOUT_MS = 15_000

export type CurrentPullRequest = {
	number: number
	title: string
	url: string
	repo: string
	headRefName: string
}

function cleanLine(value: string): string {
	return value
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

export async function resolveCurrentPullRequest(
	pi: ExtensionAPI,
	cwd: string
): Promise<CurrentPullRequest | null> {
	const branchResult = await pi.exec('git', ['branch', '--show-current'], {
		cwd,
		timeout: GH_TIMEOUT_MS,
	})
	if (branchResult.code !== 0) {
		throw new Error(cleanLine(branchResult.stderr) || 'Unable to resolve the current Git branch')
	}

	const branch = branchResult.stdout.trim()
	if (!branch) return null

	const repoResult = await pi.exec(
		'gh',
		['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
		{ cwd, timeout: GH_TIMEOUT_MS }
	)
	if (repoResult.code !== 0) {
		throw new Error(cleanLine(repoResult.stderr) || 'Unable to resolve the GitHub repository')
	}

	const repo = repoResult.stdout.trim()
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
		throw new Error('This directory is not connected to a GitHub repository')
	}

	const pullRequestsResult = await pi.exec(
		'gh',
		[
			'pr',
			'list',
			'--repo',
			repo,
			'--head',
			branch,
			'--state',
			'open',
			'--limit',
			'2',
			'--json',
			'number,title,url,headRefName',
		],
		{ cwd, timeout: GH_TIMEOUT_MS }
	)
	if (pullRequestsResult.code !== 0) {
		throw new Error(
			cleanLine(pullRequestsResult.stderr) || 'Unable to resolve the current pull request'
		)
	}

	let value: unknown
	try {
		value = JSON.parse(pullRequestsResult.stdout)
	} catch {
		throw new Error('Unable to parse pull requests from GitHub CLI')
	}
	if (!Array.isArray(value)) throw new Error('Unexpected pull request data from GitHub CLI')
	if (value.length === 0) return null
	if (value.length > 1) {
		throw new Error(`Multiple open pull requests use branch ${branch}; select one with /prs`)
	}

	const pullRequest = value[0]
	if (
		typeof pullRequest !== 'object' ||
		pullRequest === null ||
		typeof pullRequest.number !== 'number' ||
		typeof pullRequest.title !== 'string' ||
		typeof pullRequest.url !== 'string' ||
		typeof pullRequest.headRefName !== 'string'
	) {
		throw new Error('Unexpected pull request data from GitHub CLI')
	}

	return {
		number: pullRequest.number,
		title: cleanLine(pullRequest.title),
		url: pullRequest.url,
		repo,
		headRefName: pullRequest.headRefName,
	}
}

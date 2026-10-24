#!/usr/bin/env bash
# List, reply to and resolve Cursor Bugbot review threads on a PR.
# Usage: bugbot.sh [-R owner/repo] list <pr>
#        bugbot.sh [-R owner/repo] reply <pr> <comment-id> <text>
#        bugbot.sh resolve <thread-id>
set -euo pipefail

if [ "${1:-}" = -R ]; then
	repo=$2
	shift 2
else
	repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
fi
owner=${repo%/*}
name=${repo#*/}
cmd=${1:?usage: bugbot.sh [-R owner/repo] list|reply|resolve ...}
shift

case $cmd in
list)
	pr=${1:?pr number}
	gh api graphql -F owner="$owner" -F name="$name" -F pr="$pr" -f query='
		query($owner: String!, $name: String!, $pr: Int!) {
			repository(owner: $owner, name: $name) {
				pullRequest(number: $pr) {
					reviewThreads(first: 100) {
						nodes {
							id isResolved path line
							comments(first: 1) { nodes { databaseId author { login } body } }
						}
					}
				}
			}
		}' --jq '
		.data.repository.pullRequest.reviewThreads.nodes[]
		| select(.isResolved | not)
		| .comments.nodes[0] as $c
		| select($c.author.login | test("cursor"))
		| ($c.body | gsub("<[^>]+>"; "") | gsub("#+ *"; "") | gsub("\\*\\*"; "") | split("\n") | map(select(test("\\S"))) ) as $lines
		| "\(.id)\t\($c.databaseId)\t\(.path):\(.line // "-")\t\($lines[0])\t\($lines[1] // "")"'
	;;
reply)
	pr=${1:?pr number}
	id=${2:?comment id}
	body=${3:?reply text}
	gh api "repos/$repo/pulls/$pr/comments/$id/replies" -f body="$body" --jq .html_url
	;;
resolve)
	thread=${1:?thread id}
	gh api graphql -f id="$thread" -f query='
		mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { isResolved } } }' \
		--jq '"resolved: \(.data.resolveReviewThread.thread.isResolved)"'
	;;
*)
	echo "unknown command: $cmd" >&2
	exit 2
	;;
esac

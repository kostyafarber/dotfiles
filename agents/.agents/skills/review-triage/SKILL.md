---
name: review-triage
description: Triage a PR for Kostya's review in the review app: which files to read (in order), skim or skip, each with a reason, the key-change hunks, and notes on lines a stacked PR changes again. Use when he says "triage", "open and triage #N", "get #N ready for review", when `review wait` hands over a review not triaged yet, or when a PR is reopened or rewritten and its triage needs carrying over.
---

# Review triage

The review tool has the whole brief; follow it.

- **On his Mac**, from the repo's checkout: `review triage <N>`. It opens the PR's review if it isn't
  running, then prints where it is, the PR's description, his taste for the repo, every file with any
  mark it already has, the PRs stacked on it, and the steps, each as a `review` command.
- **From another machine**: `curl -s http://kostyas-macbook-pro:7400/pr/<N>/api/triage` (the review
  must be open). The steps come as HTTP calls there.

Do every step it lists, finish with `review triaged` (or `POST …/api/triaged`), and report what it
asks for. On a big PR, give the brief to a subagent and check its report.

A PR reopened under a new number or rewritten: copy the old worktree's `review/importance.json` into
the new one's (with `"triaged": false`) before running it; files whose contents didn't change keep
their marks, and the brief lists them, so only the rest need triage.

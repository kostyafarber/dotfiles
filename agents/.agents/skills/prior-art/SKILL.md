---
name: prior-art
description: Before proposing a design, a setup recipe or an API, look at how established projects already solve the same problem — vendor docs, well-known open-source repos and their docs, and respected blog posts — and report the common pattern, the variations and the pitfalls, with links. Use when about to recommend how something "should" work (secrets setup, auth, plugins, webhooks, sandboxing, config files, deploy recipes), when the user asks "what's the usual way", "how do others do this", "prior art", "what are the usual setups", "is there a standard for this", or when a design discussion keeps circling. For what WE already built or decided, use shift-prior-work (or the repo's own specs and memory) instead.
---

# Prior art

Designs invented from first principles drift into shapes nobody else uses, and the user then has to
ask "what do others do?" after the fact. Look first. Most problems here (secrets, plugins,
webhooks, sandboxes, self-hosting recipes) have been solved in public many times.

## When

Run it **before** you recommend, not after you are challenged. One short pass per decision; skip it
for choices with an obvious house convention already in the repo.

## Steps

1. **Name the problem generically**, without our words: not "keys.json for connectors" but
   "self-hosted app reading API credentials from a secret manager".
2. **Search three kinds of source**, in parallel (WebSearch `standard`; `extended` only if thin):
   - **The vendor's own docs** for the tool involved (1Password, Docker, Tailscale, GitHub…): what
     they officially recommend for this setup.
   - **Established open-source projects** that solved the same thing (prefer widely used ones:
     Home Assistant, n8n, Grafana, Immich, Gitea, Supabase, VS Code, Obsidian, Cloudflare Workers…).
     Read their docs, and their code when the docs are vague (`gh search code`, the repo itself).
   - **One or two respected write-ups**: an RFC, a well-known blog, a conference talk. Not SEO
     listicles.
3. **Collect 3–6 concrete examples**: who, what exactly they do, a link. Quote config or commands
   when they make the point.
4. **Find the pattern**: what most do (the default to match), the variations and when each applies,
   and the known pitfalls (what someone got burned by).
5. **Hold our design against it**: where we match, where we differ, and whether each difference is
   deliberate (with the reason) or accidental (then propose matching).

## Answer shape

- **Lead with the pattern** in one sentence: "Most self-hosted apps do X; Y is the common variant."
- **A table**: project, what they do, link. Mark the one closest to our situation.
- **Then our design against it**, as before → after if a change follows.
- Cite every claim with a link. Say "not found" rather than guessing what a project does.
- Keep it short: the user wants the pattern and the decision, not a literature review.

## Pitfalls

- A vendor's marketing page is not its docs; find the reference or how-to page.
- Check dates: prefer current docs; note when a pattern is deprecated.
- Don't stop at the first match. One project doing something is an example, not a convention.
- Don't import a big project's complexity wholesale; take the shape, size it to our problem.

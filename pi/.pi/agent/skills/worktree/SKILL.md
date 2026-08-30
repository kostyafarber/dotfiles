---
name: worktree
description: Create, add, initialize, or prepare a Git worktree, including its trusted project environment. Use whenever the user asks to create or set up a worktree, work on a branch in an isolated checkout, or prepare a newly created worktree for an agent session.
---

# Worktree

Create worktrees predictably and leave them ready for development without weakening repository trust boundaries.

## Before creating

1. Read the source repository's `AGENTS.md` and worktree-specific instructions.
2. Confirm the requested branch and destination path. Treat names as part of the specification; do not invent unresolved branch or worktree names.
3. Inspect `git status` and existing worktrees. Do not disturb unrelated changes or reuse an occupied branch/path.
4. Ask before deleting, pruning, force-resetting, or replacing any existing worktree.

## Create the worktree

Use normal Git worktree commands rather than copying a checkout:

```sh
git worktree add <destination> <branch>
```

Create a new branch only when the user explicitly requested and approved its name:

```sh
git worktree add -b <new-branch> <destination> <start-point>
```

Do not initialize submodules, install dependencies, or mutate generated files unless repository instructions require it or the user requested it.

## Activate a trusted project environment

After creation, inspect the destination's tracked environment files and repository instructions.

When all of the following are true:

- the worktree belongs to the repository the user asked to work on;
- its tracked `.envrc` exists;
- the repository is already trusted by the user; and
- `direnv` is available;

approve the worktree's environment from inside the destination:

```sh
(cd <destination> && direnv allow)
```

Never create, rewrite, or auto-approve an untracked or unexpectedly modified `.envrc`. Stop and ask the user when trust is unclear.

If `.envrc` uses a Nix flake, verify the activated environment without relying on the caller's shell hook:

```sh
direnv exec <destination> env
```

Use a small repository-specific version check when documented, such as `node --version`, `pnpm --version`, or `rustc --version`. Do not install fallback toolchains when the declared environment fails.

If `direnv` is unavailable, report that the worktree is not automatically activated. For Nix projects, use the repository's documented fallback for commands and agent launch, typically:

```sh
nix develop <destination> --command <command>
nix develop <destination> --command pi
```

Do not claim that a new worktree is ready while its required environment is inactive.

## Finish

1. Read the destination's own context files before changing code there.
2. Report the worktree path, branch, environment activation result, and any remaining setup.
3. Do not launch a nested interactive Pi session unless the user explicitly asks; provide the launch command instead.

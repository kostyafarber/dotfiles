---
name: worktrees
description: Make a new git worktree start warm instead of cold — reflink the main checkout's Rust target/ into it with worktrunk (`wt step copy-ignored`), lean on turbo's shared worktree cache, and keep disk in check. Use whenever creating a worktree, when a worktree's first build, typecheck or install is slow, when the user asks why builds take minutes, or before cleaning up worktrees to free disk.
---

# Worktrees

A fresh worktree has no `target/`, so the first Rust build in it starts from nothing. Everything else is already shared. Fix the Rust part, and know which costs are left.

This is the user's own machine setup. Never commit any of it to a project repo.

## What is already shared (do nothing)

- **turbo cache.** turbo ≥ 2.8 points every linked worktree at the main checkout's `.turbo/cache`, unless `turbo.json` sets `cacheDir`. A task whose inputs match any earlier run in any worktree is a cache hit, including built `.node` and wasm outputs.
- **pnpm store.** `node_modules` is cloned from the content-addressed store, so `pnpm install` in a new worktree takes about 5 s. pnpm's global virtual store did not make it faster here, and it makes every later `pnpm run` abort until the worktree is reinstalled with the same setting. Don't use it.

## Warm a new worktree

```bash
git -C <main> worktree add -b <branch> <dir> origin/main   # or pr-worktree's new.sh
cd <dir>
~/.claude/skills/worktrees/scripts/warm.sh
```

`warm.sh` runs `wt step copy-ignored --require-include` (worktrunk), which copies only what the main checkout's `.worktreeinclude` names, as reflinks: instant clones that take no extra disk until a file changes. Then it installs dependencies and prints how long each part took and how much disk is free.

The main checkout's `.worktreeinclude` lists the build caches to copy, in gitignore syntax. For repos with a file in `includes/` (named after the `origin` remote, such as `github.com_shift-editor_shift`), `warm.sh` writes it on first use and lists it in `.git/info/exclude`, so every machine gets it without setup. For other repos, write it yourself and keep it untracked the same way, never in `.gitignore`:

```
target/
```

Without `.worktreeinclude`, copy-ignored copies every ignored file, including `node_modules`, `.pnpm-store`, `.direnv`, E2E results and nested worktrees. Don't run it without one.

If `wt` is not installed, `warm.sh` runs it through `nix run nixpkgs#worktrunk`.

Gotchas:
- `wt step copy-ignored` copies from the main checkout, and the `.worktreeinclude` it reads is the main checkout's. `--from <other branch>` copies nothing from a linked worktree that has no `.worktreeinclude`.
- The `cp` on PATH inside the Nix shell is GNU coreutils, which has no `-c`. To clone by hand on macOS, use `/bin/cp -c -R`.
- Don't pass pnpm settings on one command (`pnpm install --config.x=…`). The next `pnpm run` sees a different setting, refuses with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, and exits, which looks like a 0-second success in a timing script.

## Measured (Shift, M-series MacBook, 2026-10-24)

| Step | Cold worktree | Warmed |
|---|---|---|
| `git worktree add` | 0 s | 0 s |
| copy `target/` (23.6 GiB, 91k files) | — | 7 s |
| `pnpm install` | 4 s | 5 s |
| `pnpm typecheck`, no Rust change | 6 s | 1 s |
| `pnpm typecheck` after a Rust change | 186 s | 97 s |

In Shift, `typecheck` depends on the release `shift-bridge` build and the release `@shift/wasm` builds. Any Rust change on a branch therefore costs release builds before a single type is checked. The 97 s, after a change to `shift-font` in a warmed worktree:

| Part | Time |
|---|---|
| release bridge build: the 11 Shift crates that depend on `shift-font` | 48 s |
| wasm, first build in a new worktree | 64 s |
| wasm, every later build | 31 s |

- **The 33 s first-build penalty** (removed by #791; drop this line once it merges) comes from `packages/wasm/scripts/build.mjs`, which puts `--remap-path-prefix=<checkout path>=/shift` in `RUSTFLAGS`. The path differs per worktree, and `RUSTFLAGS` is part of every crate's fingerprint, so all 68 third-party crates rebuild once in each new worktree, even from a copied `target/`.
- **The 31 s** is three release builds, one per variant (plain, `reference`, `shaping`), run one after another.

## Benchmark

**Target: any check after a single change finishes in 10 s or less** on the MacBook, with one agent, timed with a unique probe edit (see below).

Why 10 s: it's where people lose focus and switch tasks (Nielsen's response-time limits). In the [Rust compiler performance survey 2025](https://blog.rust-lang.org/2025/09/10/rust-compiler-performance-survey-2025-results), 55% of respondents wait longer than that after a small change, and it was the top complaint. Google's build-latency study ([Jaspan & Green](https://newsletter.getdx.com/p/build-times-and-developer-productivity)) found no threshold below which faster builds stop helping.

| Loop (after a change to `shift-font`) | 2026-10-24 before | After #791 + incremental release (`loop-bench.sh`) | Target |
|---|---|---|---|
| Full `pnpm typecheck` | 97 s (186 s cold) | 11 s | ≈ |
| `turbo run typecheck --only` | — | 0–10 s (a cache hit when no TypeScript changed) | ✅ |
| `cargo check -p shift-bridge` | — | 2 s | ✅ |
| Release bridge build | 30–48 s | 5 s | ✅ |
| wasm app build | 31 s (64 s first time per worktree) | 3 s | ✅ |
| New worktree ready | 5 s, Rust cold | 12 s, Rust warm | ≈ |

Rerun the rows you touch after any build change, and update this table. `scripts/loop-bench.sh`, run from a Shift worktree, times them all in one go (it warms up first, then makes a unique change to `shift-font` before each step and restores the file afterwards).

## Incremental release builds

`~/repos/.cargo/config.toml` and `~/worktrees/.cargo/config.toml` link to `~/.dotfiles/cargo/local-builds.toml`, which sets `incremental = true` and `codegen-units = 256` for the release profile, for projects under those folders only. The release binaries run somewhat slower. Before measuring performance (`pnpm profile:build`, `profile:desktop`, perf specs), override with:

```bash
CARGO_PROFILE_RELEASE_INCREMENTAL=false CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16
```

## Checking without the Rust builds

When a branch changes Rust but not the bridge or wasm API, skip the Rust builds:

| Command | Time | Checks |
|---|---|---|
| `pnpm turbo run typecheck --only` | 10 s | TypeScript, against the generated types already on disk |
| `cargo check -p shift-bridge` | 11 s | that the Rust compiles |

Run the full `pnpm typecheck` once before pushing, or when the Rust API the TypeScript sees has changed.

## Timing honestly

- Give every probe edit a unique value (`// probe $(date +%s)`). The shared turbo cache will otherwise replay another worktree's run, and the step looks instant.
- Check the exit code and the turbo summary (`Cached: N cached, M total`) before believing a fast number.
- Don't run `du` over several `target/` folders on any machine. Each one is tens of GB and takes minutes. Use `df -h /`.

## Other machines

reflinks need APFS, btrfs, XFS or ReFS. Linux machines on ext4 (check with `df -T`) get a full copy, which costs both time and disk. There, build in the existing checkout instead of a new worktree.

## Disk and cleanup

- Check `df -h /` before creating a worktree and before a long build or test run. Below about 30 GB free, run `scripts/sweep.sh` (it deletes Rust build files unused for 7 days in every worktree and checkout; pass another number of days as its argument). Below about 15 GB, stop and tell the user before building anything: at 0 the shell itself cannot start, and only the user can free space.
- A reflinked `target/` costs nothing at first, but every rebuild in it writes new files, so its real size grows with each build. Incremental release builds (below) add a cache per crate on top. Reflinks make worktrees fast, not small.
- Remove worktrees you created once their work is pushed: `git worktree remove <dir>`, then `git worktree prune`. Ask before removing any worktree you did not create.

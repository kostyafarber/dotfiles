---
description: Hand off the current Git task to Pi on a remote host
argument-hint: "[goal]"
---
Hand off the current task to a new Pi agent on the appropriate remote host, then return control without waiting for that agent to finish.

Additional goal: `$@`

Follow this contract:

1. Choose the execution host automatically by what the delegated agent must actually do, not merely by which APIs or files it edits:
   - Use `beelink` for code implementation, Rust/TypeScript work, unit tests, lint, typecheck, builds, and Linux/headless Playwright GPU or performance checks; Beelink has hardware GPU access. Electron or native-dialog source edits remain suitable when they do not require opening or inspecting a native window.
   - Use `mini` when the delegated agent must launch or inspect macOS GUI/native windows, run macOS Playwright visual or platform checks, or perform other Aqua-session work.
   - For hybrid work, implement on `beelink` and record the focused `mini` verification as a separate completion step unless the GUI verification is the task's main work.
   - Refuse only when no available host can satisfy a required step.
2. Inspect the current Git repository, branch, status, upstream, relevant changes, tests, decisions, failures, and open questions. Refuse to include unrelated dirty work. Batch independent read-only checks in parallel: perform the local Git inspection and one non-interactive remote preflight rather than issuing many sequential probes. The remote preflight should report the hostname, repository, worktree and tmux-session collisions, branch ownership when present, `pi`, and usable Nix paths.
3. Make the current task available remotely. This command invocation authorizes necessary logical commits and a normal push of the current branch. Load the repository's commit skill when present. Never force-push, rewrite published history, or push secrets. Do not rerun already-recorded validation merely to dispatch the task; run checks required by the repository's commit policy and never bypass commit hooks. Skip creating a commit when the intended branch is already clean and pushed.
4. Build a concise evidence-based handoff prompt. Include the goal, branch and commit, relevant issue or PR, files, expected invariants, exact failures, commands already run, constraints, next steps, and completion rules. Store it outside the repository.
5. Connect non-interactively with `ssh <selected-host>`. Minimize SSH round trips by combining compatible fetch, verification, worktree creation, startup-script installation, and tmux launch operations. Do not run the remote Pi directly as an SSH child. It must run in a persistent tmux session on that host.
6. Create an isolated remote Git worktree from the pushed branch. Use `~/worktrees/<repo>-<task>` and a tmux session named `pi-<repo>-<task>`, with shell-safe lowercase slugs. If either already exists, verify that it belongs to the same branch and is clean; otherwise stop rather than resetting, deleting, or overwriting it.
7. On `mini`, verify during the preflight that the default tmux server is the GUI-born server managed by `com.shift.gui-tmux` before dispatching GUI work. Creating a new session on that server preserves the logged-in Aqua context. On `beelink`, use its existing default tmux server.
8. Install a temporary startup script outside the repository and invoke that script only inside tmux. If the repository contains `flake.nix`, launch Pi inside the project dev shell; otherwise launch Pi directly. Resolve Nix before launch and do not trust the tmux server's inherited `PATH`: the startup script must export `$HOME/.nix-profile/bin`, `/nix/var/nix/profiles/default/bin`, and `$HOME/.npm-global/bin`, then invoke the preflighted absolute Nix path (falling back to `/nix/var/nix/profiles/default/bin/nix` when executable). Pass `--approve` for this known pushed worktree, assign a concise session name, give it the handoff prompt as its initial prompt, and keep a shell available after Pi exits so the tmux session remains inspectable.
9. Confirm startup with `tmux has-session` and a short bounded `capture-pane` poll. Return as soon as the Pi header plus initial prompt, thinking indicator, or tool activity proves the agent started. If the pane shows a trust prompt, missing toolchain, or immediate exit, report the exact blocker. Do not wait for task completion.
10. Report:
    - selected host, routing reason, branch, commit, worktree, and tmux session;
    - that `ssh <selected-host>` followed by `Ctrl-b s` can select the active handoff;
    - a direct attach command as a fallback;
    - safe cleanup commands.

Cleanup must never be automatic. Tell the user to inspect and preserve the remote work first. The cleanup sequence must:

1. verify the worktree is clean and all intended commits are pushed;
2. kill only the named `pi-*` tmux session;
3. remove the worktree with `git worktree remove` without `--force`;
4. prune worktree metadata;
5. preserve the pushed branch unless the user explicitly requests branch deletion.

If any prerequisite is uncertain, stop and report the exact blocker instead of guessing or weakening safety checks.

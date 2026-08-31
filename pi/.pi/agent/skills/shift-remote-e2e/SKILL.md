---
name: shift-remote-e2e
description: Runs Shift Playwright/Electron E2E tests through serialized queues on SSH-accessible macOS or headless Linux targets so application windows do not interrupt the local desktop. Use whenever E2E verification, visual snapshots, platform tests, GPU tests, or Playwright performance tests are needed in Shift.
compatibility: Requires Nix and a Shift checkout on the selected SSH target. The mini target requires an active macOS GUI login; the Beelink target requires a DRM render node.
---

# Shift Remote E2E

Run Shift's Playwright/Electron tests on the selected remote target instead of opening Electron on the user's current desktop. The default `mini` target preserves the macOS behavior; select `beelink` explicitly for Linux platform or headless GPU verification.

## Runner

From the Shift repository, invoke:

```bash
~/.pi/agent/bin/shift-remote-e2e visual e2e/landing.spec.ts
~/.pi/agent/bin/shift-remote-e2e visual e2e/document-recovery.spec.ts --grep "Save As"
~/.pi/agent/bin/shift-remote-e2e gpu e2e/glyph-grid.spec.ts --grep "source switching"
~/.pi/agent/bin/shift-remote-e2e perf e2e/glyph-grid-perf.spec.ts
~/.pi/agent/bin/shift-remote-e2e --target beelink platform e2e/document-recovery.spec.ts
~/.pi/agent/bin/shift-remote-e2e --target beelink gpu e2e/font-preview.spec.ts --grep "opens through home"
```

Choose the smallest relevant project, file, and title filter. Follow `apps/desktop/e2e/README.md` for project selection and impact checks.

## Queue behavior

Each target uses the Pueue package from Nixpkgs and maintains its own `shift-e2e` group with parallelism `1`. Competing requests on one target queue in submission order; the Mini and Beelink queues may run independently. Pueue owns process execution, persisted task state, and logs, so a task continues if its submitting SSH session disconnects.

The runner:

1. Captures local HEAD, tracked modifications, and untracked non-ignored files.
2. Rejects dirty submodules rather than silently testing incomplete source.
3. Uploads each source overlay into an isolated run directory.
4. Applies queued overlays to a dedicated cached clone without touching the runner's normal Shift checkout.
5. Runs in the Nix dev shell with CI behavior. Mini uses `caffeinate`; Beelink starts a per-job GPU-backed Weston headless compositor and Xwayland, then wraps Electron with nixGL/RADV.
6. Streams Pueue output and returns Playwright artifacts under the local temporary directory printed at startup. Beelink results also include `weston.log`.
7. Resets the cached clone after every completed task and removes collected run directories.
8. Retains dependency and build caches (`node_modules`, Nix, pnpm, Cargo, Turbo, and Vite) to keep later runs fast.

When the local wait is interrupted, do not resubmit the same test automatically. The Pueue task continues remotely and keeps its log and artifacts. Uncollected run directories expire after 24 hours.

## Results

Always report:

- The exact project, file, and title filter.
- Pass or failure status.
- The local result directory printed by the runner.
- Relevant diagnostics from `run.log`, traces, screenshots, or diffs when a test fails.

After a failure, inspect the returned artifacts locally and continue debugging in the local working tree. Do not edit source on the remote runner.

## Configuration

The default target and SSH alias are `mini`. The `beelink` target uses the `beelink` SSH alias. Both default to `~/repos/shift`. Select a target with `--target`; override its host or checkout without editing the skill:

```bash
~/.pi/agent/bin/shift-remote-e2e --target beelink gpu e2e/font-preview.spec.ts

SHIFT_E2E_REMOTE_HOST=mac-runner \
SHIFT_E2E_REMOTE_REPO=/path/to/shift \
~/.pi/agent/bin/shift-remote-e2e visual e2e/landing.spec.ts
```

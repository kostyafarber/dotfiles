#!/usr/bin/env bash
# Time Shift's check loop after one Rust change, against the 10 s target in SKILL.md.
# Run from a Shift checkout or worktree with nothing to lose in crates/shift-font/src/lib.rs:
# it appends a unique public function there before each step and restores the file at the end.
# Usage: loop-bench.sh
set -uo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"
probe_file=crates/shift-font/src/lib.rs
[ -f "$probe_file" ] || { echo "loop-bench.sh: run inside a Shift checkout" >&2; exit 1; }
git diff --quiet -- "$probe_file" || { echo "loop-bench.sh: $probe_file has local changes" >&2; exit 1; }
trap 'git checkout -q -- "$probe_file"' EXIT

log=$(mktemp "${TMPDIR:-/tmp}/loop-bench.XXXXXX")
probe() {
	local n="$(date +%s)$RANDOM"
	printf '\n#[doc(hidden)]\npub fn loop_bench_probe_%s() -> u64 { %s }\n' "$n" "$n" >>"$probe_file"
}
step() {
	local name=$1
	shift
	local t0 rc
	t0=$(date +%s)
	"$@" >>"$log" 2>&1
	rc=$?
	printf '%-36s %4ss  %s\n' "$name" "$(($(date +%s) - t0))" "$([ $rc -eq 0 ] && echo ok || echo "FAILED (exit $rc)")"
}

steps=(
	"pnpm typecheck|pnpm typecheck"
	"cargo check -p shift-bridge|cargo check -q -p shift-bridge"
	"bridge release build|pnpm --filter shift-bridge build"
	"wasm app build|pnpm --filter @shift/wasm build"
	"turbo typecheck --only|pnpm turbo run typecheck --only"
)

# Warm up by running every step once after a change, untimed. turbo can restore a
# step from its cache without running cargo, which would leave the first timed
# run to pay for a cold build (for example after a cargo profile change).
echo "Warming up (not timed)..."
for entry in "${steps[@]}"; do
	probe
	bash -c "${entry#*|}" >>"$log" 2>&1
done

echo "After one change to shift-font (target: 10 s):"
for entry in "${steps[@]}"; do
	probe
	step "${entry%%|*}" bash -c "${entry#*|}"
done
echo "Log: $log"

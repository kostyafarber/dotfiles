# shift-editor/shift. Sourced by pr-run.sh in the worktree, with $PR set.

pick_app() { :; }
default_app=desktop

# The dev app with its own profile per PR, so it runs beside the everyday Shift Dev.
run_desktop() {
	pnpm build:native:debug &&
		pnpm --filter @shift/desktop exec electron-forge start -- \
			--user-data-dir="$HOME/Library/Application Support/Shift Dev PR $PR"
}

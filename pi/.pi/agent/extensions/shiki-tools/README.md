# Shiki tool highlighting

Live [Shiki](https://shiki.style/) syntax highlighting and compact hierarchy
summaries for Pi's built-in tools. Tool execution and model-visible results are
unchanged.

## Coverage

- `bash`: highlighted command plus exit status, duration, and output-line summary
- `edit`: actual applied diff with line numbers, syntax colors, emphasized changed tokens, and `+`/`−` counts; collapsed cards show changed lines only, while expanded cards include context
- `write`: highlighted content preview plus line and byte counts
- `read`: line/byte summary with Shiki output when expanded
- `grep` / `find`: match/file summaries with full output when expanded

Completed results use a muted `╰` hierarchy rail. The companion
`tool-success-checks.ts` extension marks running, successful, and failed tools
with `◇`, `◆`, and `×`.

Supported languages: Bash, Python, TypeScript, TSX, JavaScript, and JSX.
Shiki follows Pi's active theme: `catppuccin-latte` in light mode and
`catppuccin-mocha` in dark mode. Existing tool blocks rerender when the Pi theme changes.

## Install dependencies

```bash
cd ~/.dotfiles/pi/.pi/agent/extensions/shiki-tools
npm ci
```

Then run `/reload` in Pi (or restart it).

## Verify

```bash
npm test
```

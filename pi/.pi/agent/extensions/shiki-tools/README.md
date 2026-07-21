# Shiki tool highlighting

Live [Shiki](https://shiki.style/) syntax highlighting for Pi's built-in tools.
Tool execution and model-visible results are unchanged.

## Coverage

- `bash`: command shown with Bash highlighting while arguments stream
- `edit`: old/new replacement snippets highlighted while the edit is prepared, with subtle addition/deletion tints
- `write`: live content preview highlighted from the destination extension
- `read`: expanded file output highlighted with Shiki

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

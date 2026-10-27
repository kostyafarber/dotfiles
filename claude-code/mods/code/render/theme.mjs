// The terminal the cards sit in: its light or dark, background, text colour and font, from Rex's own
// settings (as nvim's core/rex_theme.lua reads them), else macOS's appearance. CTREE_MODE=light|dark
// overrides the mode.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const modules = join(dirname(fileURLToPath(import.meta.url)), 'node_modules')

export function terminalTheme() {
  const read = (...args) => {
    const res = spawnSync('defaults', ['read', ...args], { encoding: 'utf8' })
    return res.status === 0 ? res.stdout.trim() : undefined
  }
  const appearance = read('com.superlogical.rex', 'Workspace.appearance')
  const mode = process.env.CTREE_MODE
    ?? (appearance === 'light' || appearance === 'dark' ? appearance : read('-g', 'AppleInterfaceStyle') === 'Dark' ? 'dark' : 'light')
  const font = read('com.superlogical.rex', 'Workspace.terminalFontName')
  const id = read('com.superlogical.rex', mode === 'dark' ? 'Workspace.darkThemeID' : 'Workspace.lightThemeID')
  try {
    const themes = JSON.parse(readFileSync('/Applications/Rex Beta.app/Contents/Resources/SuperUI_SuperDesignTokens.bundle/Contents/Resources/themes.json', 'utf8'))
    const theme = themes.find((t) => t.id === id)
    if (theme) return { mode, font, bg: theme.source.background, fg: theme.source.foreground }
  } catch {}
  return { mode, font }
}

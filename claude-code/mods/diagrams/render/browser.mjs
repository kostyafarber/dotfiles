// What the image renderers share: Chrome through playwright-core, and the terminal's look.
import { readFileSync, readdirSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
export const modules = join(here, 'node_modules')
const cache = join(homedir(), '.cache/diagrams')
mkdirSync(cache, { recursive: true })
export const endpointFile = join(cache, 'chrome.ws')

// The installed Chrome (its .app name may be decorated), else playwright's own channel.
export function chromeOptions() {
  const app = readdirSync('/Applications', { withFileTypes: true }).find((e) => e.isDirectory() && e.name.endsWith('Chrome.app'))
  return app ? { executablePath: join('/Applications', app.name, 'Contents/MacOS/Google Chrome') } : { channel: 'chrome' }
}

// The running Chrome from chrome-server.mjs, started when none answers. `close()` on it only
// disconnects, so the next render finds it again.
export async function launchChrome() {
  const { chromium } = await import(join(modules, 'playwright-core/index.mjs'))
  const connect = async () => chromium.connect(readFileSync(endpointFile, 'utf8').trim(), { timeout: 2000 })
  try {
    return await connect()
  } catch {}
  spawn(process.execPath, [join(here, 'chrome-server.mjs')], { detached: true, stdio: 'ignore' }).unref()
  for (let tries = 0; tries < 50; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    try {
      return await connect()
    } catch {}
  }
  // The server did not come up: launch one for this render alone.
  return chromium.launch(chromeOptions())
}

// Light or dark, the background and text colours, and the font of the terminal the image will sit
// in: Rex's own settings (as nvim's core/rex_theme.lua reads them), else macOS's appearance with
// style.css's fallbacks. CTREE_MODE=light|dark overrides the mode.
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

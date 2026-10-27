// A Chrome that outlives one render, so each show_diagram or show_code call connects to it instead
// of launching its own (about a third of a second each). Started by browser.mjs when none answers;
// writes its endpoint to the cache folder and quits after half an hour.
import { writeFileSync, rmSync } from 'node:fs'
import { chromeOptions, endpointFile, modules } from './browser.mjs'
import { join } from 'node:path'

const LIFETIME_MS = 30 * 60 * 1000
const { chromium } = await import(join(modules, 'playwright-core/index.mjs'))
const server = await chromium.launchServer(chromeOptions())
writeFileSync(endpointFile, server.wsEndpoint())
const stop = async () => {
  rmSync(endpointFile, { force: true })
  await server.close()
  process.exit(0)
}
setTimeout(stop, LIFETIME_MS).unref()
process.on('SIGTERM', stop)
// Keep running until the timer or a signal stops it.
setInterval(() => {}, 60_000)

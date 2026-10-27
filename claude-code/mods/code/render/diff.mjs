// { before, after } JSON on stdin -> unified-diff hunks on stdout (git diff --no-index).
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const { before, after } = JSON.parse(readFileSync(0, 'utf8'))
const dir = mkdtempSync(join(tmpdir(), 'show-code-'))
const end = (s) => (s.endsWith('\n') ? s : s + '\n')
writeFileSync(join(dir, 'a'), end(before))
writeFileSync(join(dir, 'b'), end(after))
const { stdout } = spawnSync('git', ['diff', '--no-index', '--no-color', '-U3', 'a', 'b'], { cwd: dir, encoding: 'utf8' })
rmSync(dir, { recursive: true })
process.stdout.write(stdout.slice(Math.max(0, stdout.indexOf('@@'))))

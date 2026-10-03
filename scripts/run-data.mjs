// npm run data : télécharge les sources (si absentes), reconstruit public/data/ puis les contours.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const win = process.platform === 'win32'
const venvPy = win ? '.venv-data/Scripts/python.exe' : '.venv-data/bin/python'
const py = existsSync(venvPy) ? venvPy : win ? 'python' : 'python3'

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run(py, ['scripts/build-data/build.py', '--download'])
run(process.execPath, ['scripts/build-geo.mjs'])

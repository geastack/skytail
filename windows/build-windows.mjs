// Builds Skytail for Windows desktop, on Windows: three.js through the native
// WebGL host on threejs-rendozer (rendozer on D3D12).
//
//   set RENDOZER_PATH=C:\path\to\rendozer
//   node windows/build-windows.mjs [--rendozer <dir>] [--threejs-rendozer <dir>]
//                                  [--skip-generate] [--no-shortcut]
//
// Needs Node, git and the Visual Studio C++ Build Tools. Generates the game's
// C++ with xbox/build-xbox.mjs --stage-only (the program the Xbox build uses),
// fetches glslang and SPIRV-Cross at the commits threejs-rendozer pins, and
// runs windows/build-windows.ps1, which builds Skytail.exe into
// windows/build/skytail/Skytail.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const project = path.dirname(here)
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`)
  return args[index + 1]
}
if (process.platform !== 'win32') throw new Error('Run this on Windows')

// rendozer comes from RENDOZER_PATH (or --rendozer); threejs-rendozer sits
// next to the skytail checkout unless --threejs-rendozer says otherwise. A
// sibling rendozer checkout is picked up too.
const sibling = name => path.join(path.dirname(project), name)
const firstExisting = (...dirs) => dirs.find(dir => dir && fs.existsSync(dir))
const fail = message => {
  console.error(`\n${message}\n`)
  process.exit(1)
}
const threejsRendozer = path.resolve(firstExisting(option('--threejs-rendozer', process.env.THREEJS_RENDOZER_ROOT), sibling('threejs-rendozer')) ?? '')
const statedRendozer = option('--rendozer', process.env.RENDOZER_PATH ?? process.env.RENDOZER_ROOT)
const rendozer = path.resolve(statedRendozer ?? firstExisting(sibling('rendozer'), path.join(path.dirname(project), '../General-Arcade/rendozer')) ?? '')
if (!fs.existsSync(path.join(threejsRendozer, 'native/rdz_gles.cpp'))) {
  fail(`threejs-rendozer not found next to ${project}. Pass --threejs-rendozer <dir>.`)
}
if (!fs.existsSync(path.join(rendozer, 'include/rdz')) || !fs.existsSync(path.join(rendozer, 'data/dxc/dxcompiler.dll'))) {
  fail(statedRendozer
    ? `RENDOZER_PATH does not point at a rendozer checkout: ${rendozer}\nIt must contain include\\rdz and data\\dxc\\dxcompiler.dll.`
    : 'Set RENDOZER_PATH to your rendozer checkout first, e.g.\n  set RENDOZER_PATH=C:\\src\\rendozer')
}
console.log(`rendozer: ${rendozer}`)

function run(command, argv, options = {}) {
  const result = spawnSync(command, argv, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${argv[0] ?? ''} failed (${result.status})`)
}

const stage = path.join(project, 'xbox/build/package')
if (!args.includes('--skip-generate')) {
  run(process.execPath, [path.join(project, 'xbox/build-xbox.mjs'), '--stage-only'], { cwd: project })
} else if (!fs.existsSync(path.join(stage, 'generated-sources.txt'))) {
  throw new Error('--skip-generate needs a previous generation')
}
// The worker host: the UWP project gets it elsewhere.
const requireFromProject = createRequire(path.join(project, 'package.json'))
const hostPackage = path.dirname(requireFromProject.resolve('@geastack/host/package.json'))
fs.copyFileSync(path.join(hostPackage, 'host/worker.cpp'), path.join(stage, 'framework/host/host/worker.cpp'))

// glslang + SPIRV-Cross at the commits threejs-rendozer is tested with.
const vendor = path.join(threejsRendozer, 'vendor')
const pins = JSON.parse(fs.readFileSync(path.join(threejsRendozer, 'vendor.json'), 'utf8'))
for (const [name, { url, commit }] of Object.entries(pins)) {
  const dir = path.join(vendor, name)
  const head = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim()
  if (head === commit) continue
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(dir, { recursive: true })
    run('git', ['-C', dir, 'init', '-q'])
    run('git', ['-C', dir, 'remote', 'add', 'origin', url])
  }
  run('git', ['-C', dir, 'fetch', '-q', '--depth', '1', 'origin', commit])
  run('git', ['-C', dir, 'checkout', '-q', 'FETCH_HEAD'])
}

run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'build-windows.ps1'),
  '-App', stage, '-ThreeJsRendozer', threejsRendozer, '-Rendozer', rendozer, '-Vendor', vendor,
  '-BuildDir', path.join(here, 'build'), ...(args.includes('--no-shortcut') ? ['-NoShortcut'] : [])])

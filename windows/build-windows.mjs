// Builds Skytail for Windows desktop on a remote Windows machine over SSH:
// three.js through the native WebGL host on threejs-rendozer (rendozer DX12).
//
//   node windows/build-windows.mjs --host <ssh-host> [--remote-dir C:/geastack/skytail-rendozer]
//                                  [--skip-generate]
//
// Game C++ is generated here by xbox/build-xbox.mjs --stage-only (the same
// generated program the Xbox build uses); the Windows machine builds the
// rendozer GLES DLL, links Skytail.exe and puts a desktop shortcut to it.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const project = path.dirname(here)
const geastack = path.dirname(project)
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`)
  return args[index + 1]
}
const host = option('--host', process.env.GEA_WINDOWS_BUILD_HOST)
const remote = option('--remote-dir', process.env.GEA_WINDOWS_BUILD_DIR ?? 'C:/geastack/skytail-rendozer')
const rendozer = path.resolve(option('--rendozer', process.env.RENDOZER_ROOT ?? path.join(geastack, '../General-Arcade/rendozer')))
const threejsRendozer = path.join(geastack, 'threejs-rendozer')
if (!host || !/^[a-zA-Z0-9_.@-]+$/.test(host)) throw new Error('Pass --host or set GEA_WINDOWS_BUILD_HOST to the Windows SSH build host')
if (!/^[A-Za-z]:\/[a-zA-Z0-9_./-]+$/.test(remote) || remote.split('/').includes('..')) {
  throw new Error('The remote build directory must be an absolute Windows path with forward slashes and no spaces')
}

function run(command, argv, options = {}) {
  const result = spawnSync(command, argv, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`)
}
const powershell = script => ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-OutputFormat', 'Text',
  '-EncodedCommand', Buffer.from(`$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; ${script}`, 'utf16le').toString('base64')]
const remoteShell = script => run('ssh', ['-o', 'BatchMode=yes', host, ...powershell(script)])

// Pipes `paths` (relative to `cwd`) into `${remote}/${destination}`.
async function send(cwd, paths, destination, exclude = []) {
  const target = `${remote}/${destination}`
  remoteShell(`New-Item -ItemType Directory -Force '${target}' | Out-Null`)
  await new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-cf', '-', ...exclude.flatMap(pattern => ['--exclude', pattern]), '-C', cwd, ...paths],
      { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, COPYFILE_DISABLE: '1' } })
    const ssh = spawn('ssh', ['-o', 'BatchMode=yes', host, 'tar.exe', '-xf', '-', '-C', target], { stdio: ['pipe', 'inherit', 'inherit'] })
    tar.stdout.pipe(ssh.stdin)
    Promise.all([tar, ssh].map(child => new Promise((done, fail) => {
      child.on('error', fail)
      child.on('exit', code => code === 0 ? done() : fail(new Error(`transfer to ${target} failed (${code})`)))
    }))).then(resolve, reject)
  })
}

const stage = path.join(project, 'xbox/build/package')
if (!args.includes('--skip-generate')) {
  run(process.execPath, [path.join(project, 'xbox/build-xbox.mjs'), '--stage-only'], { cwd: project })
} else if (!fs.existsSync(path.join(stage, 'generated-sources.txt'))) {
  throw new Error('--skip-generate needs a previous xbox/build-xbox.mjs --stage-only')
}

// Desktop additions to the Xbox staging: the worker host (the UWP project
// gets it elsewhere) and the WebGL host from the sibling native-webgl-angle
// checkout, which carries the desktop library loading and input setters.
const requireFromProject = createRequire(path.join(project, 'package.json'))
const hostPackage = path.dirname(requireFromProject.resolve('@geastack/host/package.json'))
fs.copyFileSync(path.join(hostPackage, 'host/worker.cpp'), path.join(stage, 'framework/host/host/worker.cpp'))
const webglHost = path.join(geastack, 'native-webgl-angle/native/angle_webgl_host.mm')
if (fs.existsSync(webglHost)) fs.copyFileSync(webglHost, path.join(stage, 'native/angle_webgl_host.mm'))

const gitHead = dir => spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
const vendors = [
  ['glslang', 'https://github.com/KhronosGroup/glslang', gitHead(path.join(threejsRendozer, 'vendor/glslang'))],
  ['SPIRV-Cross', 'https://github.com/KhronosGroup/SPIRV-Cross', gitHead(path.join(threejsRendozer, 'vendor/SPIRV-Cross'))],
]
for (const [name, url, commit] of vendors) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`threejs-rendozer/vendor/${name} is not a git checkout; run threejs-rendozer/scripts/build-rendozer.sh once`)
  remoteShell(`$dir = '${remote}/vendor/${name}'
if (!(Test-Path "$dir/.git")) { New-Item -ItemType Directory -Force $dir | Out-Null; git -C $dir init -q; git -C $dir remote add origin '${url}' }
if ((git -C $dir rev-parse HEAD 2>$null) -ne '${commit}') { git -C $dir fetch -q --depth 1 origin ${commit}; git -C $dir checkout -q FETCH_HEAD }
if ($LASTEXITCODE) { exit 1 }`)
}

await send(stage, ['.'], 'app')
await send(here, ['win32_main.cpp', 'CMakeLists.txt', 'skytail.rc', 'build-windows.ps1'], 'windows')
await send(threejsRendozer, ['native', 'test/gles_smoke_win32.cpp'], 'threejs-rendozer')
await send(rendozer, ['include', 'internal', 'external', 'data/d3d12/D3D12Core.dll', 'data/dxc/dxcompiler.dll', 'data/dxc/dxil.dll'], 'rendozer')

remoteShell(`& '${remote}/windows/build-windows.ps1'; if (!$?) { exit 1 }`)
console.log(`Built ${remote}/build/skytail/Skytail/Skytail.exe on ${host}`)

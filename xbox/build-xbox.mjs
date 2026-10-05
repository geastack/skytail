import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.join(here, '../package.json'))
const packageDir = name => path.dirname(require.resolve(`${name}/package.json`))
const compilerDir = packageDir('@geastack/compiler')
const viteBin = path.join(packageDir('vite'), 'bin/vite.js')
const angleNative = path.join(packageDir('@geastack/native-webgl-angle'), 'native')
const packages = path.dirname(packageDir('@geastack/core'))
const build = path.join(here, 'build')
const stage = path.join(build, 'package')
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`)
  return args[index + 1]
}
const stageOnly = args.includes('--stage-only')
const host = option('--host', process.env.GEA_XBOX_BUILD_HOST)
const remote = option('--remote-dir', process.env.GEA_XBOX_BUILD_DIR)
const angleDir = option('--angle-dir', process.env.GEA_XBOX_ANGLE_DIR)
const manifest = fs.readFileSync(path.join(here, 'Three.appxmanifest'), 'utf8')
const identityVersion = /(<Identity\b[^>]*\bVersion=")[^"]+(")/
const version = option('--version', manifest.match(/<Identity\b[^>]*\bVersion="([^"]+)"/)?.[1])
if (!stageOnly) {
  if (!host) throw new Error('Pass --host or set GEA_XBOX_BUILD_HOST to the Windows SSH build host')
  if (!remote) throw new Error('Pass --remote-dir or set GEA_XBOX_BUILD_DIR to a Windows build directory')
  if (!angleDir) throw new Error('Pass --angle-dir or set GEA_XBOX_ANGLE_DIR to the UWP ANGLE directory on the build host')
  if (!/^[a-zA-Z0-9_.@-]+$/.test(host)) throw new Error('Invalid SSH host')
  if (!/^[A-Za-z]:\/[a-zA-Z0-9_./-]+$/.test(remote) || remote.split('/').includes('..')) {
    throw new Error('The remote build directory must be an absolute Windows path with forward slashes and no spaces')
  }
  for (const directory of [remote, angleDir]) {
    if (!/^[A-Za-z]:[\\/][a-zA-Z0-9_ .\\/-]+$/.test(directory) || directory.split(/[\\/]/).includes('..')) {
      throw new Error('Windows build paths must be absolute and contain only letters, digits, spaces, dots, underscores, hyphens, and path separators')
    }
  }
}
if (!/^\d+\.\d+\.\d+\.\d+$/.test(version) || version.split('.').some(value => Number(value) > 65535)) throw new Error('Invalid package version')

function run(command, argv, options = {}) {
  const result = spawnSync(command, argv, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`)
}
function writeStable(destination, bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (fs.existsSync(destination) && fs.readFileSync(destination).equals(content)) return
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, content)
}
function copy(source, destination) { writeStable(destination, fs.readFileSync(source)) }
function headers(source, destination) {
  if (!fs.existsSync(source)) return
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'build') continue
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    if (entry.isDirectory()) headers(from, to)
    else if (/\.(h|hpp|inc|inl)$/.test(entry.name)) copy(from, to)
  }
}

if (!args.includes('--skip-generate')) {
  run(process.execPath, [viteBin, 'build', '--config', path.join(here, 'vite.config.mjs')])
  // Compiler generation can exceed Node's default heap limit.
  // Disable member and numeric absence proofs for Three.js compilation.
  process.env.GEA_FAMILY_MEMBER_ABSENT_KEYS ??= '0'
  process.env.GEA_NUMERIC_ABSENCE ??= '0'
  run(process.execPath, ['--max-old-space-size=32768', path.join(compilerDir, 'dist/cli.js'), 'compile-module-graph', path.join(build, 'module-graph/gea-module-graph.json'),
    '--entry', path.join(here, 'index.ts'), '--module-graph-stage', 'hybrid', '--out-dir', build,
    '--entry-symbol', 'gea_xbox_top_level', '--translation-units', 'per-file'])
} else {
  console.log('Reusing generated C++ (--skip-generate); use only after changes to native build inputs.')
}
// Refresh canonical runtime headers so staged sources use the installed compiler's runtime ABI.
for (const name of ['gea_runtime.h', 'gea_dynamic_proxy.h', 'gea_eval.h']) {
  copy(path.join(compilerDir, 'src/targets/cpp/runtime', name), path.join(build, name))
}
const sources = fs.readFileSync(path.join(build, 'geatsc-sources.txt'), 'utf8').trim().split(/\r?\n/)
const sourceNames = new Set(sources.map(source => path.basename(source)))
writeStable(path.join(stage, 'generated-sources.txt'), [...sourceNames].map(name => `generated/${name}`).join('\n') + '\n')
fs.mkdirSync(path.join(stage, 'generated'), { recursive: true })
for (const entry of fs.readdirSync(path.join(stage, 'generated'))) {
  if (entry.endsWith('.cpp') && !sourceNames.has(entry)) fs.unlinkSync(path.join(stage, 'generated', entry))
}
for (const source of sources) copy(source, path.join(stage, 'generated', path.basename(source)))
for (const name of fs.readdirSync(build)) {
  if (/\.(h|hpp)$/.test(name)) copy(path.join(build, name), path.join(stage, 'generated', name))
}
for (const name of ['CMakeLists.txt', 'build-native.ps1', 'GeaAviatorThree.vcxproj', 'three_runtime.cpp', 'three_uwp_main.cpp']) {
  copy(path.join(here, name), path.join(stage, name))
}
writeStable(path.join(stage, 'Package.appxmanifest'), manifest.replace(identityVersion, (_, before, after) => `${before}${version}${after}`))
for (const name of ['angle_webgl_host.mm', 'audio_host.mm', 'audio_uwp.h']) {
  copy(path.join(angleNative, name), path.join(stage, 'native', name))
}
for (const name of ['core', 'host', 'engine', 'elements', 'geaos']) headers(path.join(packages, name), path.join(stage, 'framework', name))
copy(path.join(packages, 'host/host/timers.cpp'), path.join(stage, 'framework/host/host/timers.cpp'))
const includes = spawnSync('bash', ['-c', 'source "$GEA_CORE/gea_sources.sh"; gea_fw_include_flags'], {
  encoding: 'utf8', env: { ...process.env, GEA_CORE: path.join(packages, 'core'), GEA_HOST_DIR: path.join(packages, 'host'),
    GEA_ENGINE_DIR: path.join(packages, 'engine'), GEA_ELEMENTS_DIR: path.join(packages, 'elements'), GEA_GEAOS_PACKAGE_DIR: path.join(packages, 'geaos') },
})
if (includes.status !== 0) throw new Error(includes.stderr)
writeStable(path.join(stage, 'framework-includes.txt'), includes.stdout.trim().split('\n').map(flag => `framework/${path.relative(packages, flag.slice(2))}`).join('\n') + '\n')
for (const name of fs.readdirSync(path.join(here, '../src/sounds'))) {
  if (name.endsWith('.mp3') || name.endsWith('.wav')) copy(path.join(here, '../src/sounds', name), path.join(stage, 'Sounds', name))
}
console.log(`Staged ${sources.length} generated C++ units and native UWP hosts in ${stage}`)
if (stageOnly) process.exit(0)

const powershell = (script) => ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-OutputFormat', 'Text', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
run('ssh', ['-o', 'BatchMode=yes', host, ...powershell(`New-Item -ItemType Directory -Force '${remote}' | Out-Null`)])
await new Promise((resolve, reject) => {
  const tar = spawn('tar', ['-cf', '-', '-C', stage, '.'], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, COPYFILE_DISABLE: '1' } })
  const ssh = spawn('ssh', ['-o', 'BatchMode=yes', host, 'tar.exe', '-xf', '-', '-C', remote], { stdio: ['pipe', 'inherit', 'inherit'] })
  tar.stdout.pipe(ssh.stdin)
  Promise.all([tar, ssh].map(child => new Promise((done, fail) => {
    child.on('error', fail)
    child.on('exit', code => code === 0 ? done() : fail(new Error(`Source transfer failed (${code})`)))
  }))).then(resolve, reject)
})
run('ssh', ['-o', 'BatchMode=yes', host, ...powershell(`& '${remote}/build-native.ps1' -AngleDir '${angleDir}'; if (!$?) { exit 1 }`)])
fs.mkdirSync(path.join(build, 'artifacts'), { recursive: true })
run('scp', ['-o', 'BatchMode=yes', `${host}:${remote}/build/artifacts/*`, path.join(build, 'artifacts')])

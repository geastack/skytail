import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const address = args.includes('--xbox') ? args[args.indexOf('--xbox') + 1] : process.env.GEA_XBOX_HOST
if (!address || !/^[a-zA-Z0-9.-]+(?::\d+)?$/.test(address)) throw new Error('Pass --xbox <address> or set GEA_XBOX_HOST')
if (!process.env.GEA_XBOX_AUTH) throw new Error('Set GEA_XBOX_AUTH to the Device Portal username:password')
const base = new URL(`https://${address.includes(':') ? address : `${address}:11443`}`)
const artifacts = path.join(here, 'build/artifacts')
const packageName = args.includes('--package') ? args[args.indexOf('--package') + 1] : 'GeaSkytailXbox.msix'
if (!packageName || path.basename(packageName) !== packageName) throw new Error('--package must name a file in xbox/build/artifacts')
const identity = args.includes('--identity') ? args[args.indexOf('--identity') + 1] : 'GeaSkytailXbox'
const cookies = new Map()
async function request(route, method = 'GET', files = []) {
  // The system client can have macOS Local Network access when Node does not.
  // Send credentials through stdin to keep them out of process arguments.
  const headers = { Authorization: `Basic ${Buffer.from(process.env.GEA_XBOX_AUTH).toString('base64')}`, Expect: '' }
  if (cookies.size) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join('; ')
  if (method !== 'GET') {
    const csrf = cookies.get('CSRF-Token')
    if (!csrf) throw new Error('Device Portal did not supply a CSRF token')
    headers['X-CSRF-Token'] = decodeURIComponent(csrf)
    if (!files.length) headers['Content-Length'] = '0'
  }
  const command = ['--config', '-', '--silent', '--show-error', '--include', '--max-time', '120', '--request', method]
  if (args.includes('--insecure')) command.push('--insecure')
  for (const file of files) command.push('--form', `${file}=@${path.join(artifacts, file)};type=application/octet-stream`)
  command.push(new URL(route, base).href)
  const config = Object.entries(headers).map(([key, value]) => `header = ${JSON.stringify(`${key}: ${value}`)}`).join('\n') + '\n'
  const result = spawnSync(process.platform === 'win32' ? 'curl.exe' : 'curl', command, { input: config, maxBuffer: 64 * 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Device Portal request failed: ${result.stderr.toString().trim()}`)
  let data = result.stdout
  let status = 0
  do {
    const end = data.indexOf('\r\n\r\n')
    if (end < 0) throw new Error('Device Portal returned an invalid HTTP response')
    const lines = data.subarray(0, end).toString().split('\r\n')
    status = Number(lines[0].split(' ')[1])
    for (const line of lines.slice(1)) {
      if (!line.toLowerCase().startsWith('set-cookie:')) continue
      const pair = line.slice(line.indexOf(':') + 1).trim().split(';')[0]
      const index = pair.indexOf('=')
      cookies.set(pair.slice(0, index), pair.slice(index + 1))
    }
    data = data.subarray(end + 4)
  } while (status < 200)
  if (status < 200 || status >= 300) throw new Error(`Device Portal ${method} ${route}: HTTP ${status}: ${data.toString().slice(0, 1000)}`)
  return { status, data }
}
const json = async route => JSON.parse((await request(route)).data.toString())
await request('/')
let expectedVersion = null
if (!args.includes('--launch-only')) {
  const files = fs.readdirSync(artifacts).filter(name => name === packageName || /^Microsoft\..*\.appx$/.test(name) || name === 'GeaDev.cer')
  if (!files.includes(packageName)) throw new Error('Build the Xbox package first')
  const manifest = spawnSync(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-xOf', path.join(artifacts, packageName), 'AppxManifest.xml'], { encoding: 'utf8' })
  expectedVersion = manifest.stdout?.match(/<Identity\b[^>]*\bVersion="([^"]+)"/)?.[1]
  if (manifest.status !== 0 || !expectedVersion) throw new Error('Cannot read the signed package version')
  console.log(`Installing ${packageName} on ${address}…`)
  await request(`/api/app/packagemanager/package?package=${packageName}`, 'POST', files)
  const deadline = Date.now() + 180000
  let installed = false
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    const result = await request('/api/app/packagemanager/state')
    if (result.status === 204) continue
    const state = JSON.parse(result.data.toString())
    if (state.Success === false) throw new Error(`Installation failed: ${JSON.stringify(state)}`)
    if (state.Success === true) { installed = true; break }
  }
  if (!installed) throw new Error('Installation did not report success before the timeout')
}
// The package listing can refresh after installation completes. Wait for the signed version before launch.
let app = null
const registrationDeadline = Date.now() + 60000
do {
  const packages = await json('/api/app/packagemanager/packages')
  const candidates = packages.InstalledPackages.filter(item => item.PackageFullName.startsWith(`${identity}_${expectedVersion ? `${expectedVersion}_` : ''}`))
  candidates.sort((a, b) => b.PackageFullName.localeCompare(a.PackageFullName, undefined, { numeric: true }))
  app = candidates[0]
  if (app || !expectedVersion) break
  await new Promise(resolve => setTimeout(resolve, 1000))
} while (Date.now() < registrationDeadline)
if (!app) throw new Error('Device Portal did not list the Skytail package')
const query = new URLSearchParams({ appid: Buffer.from(app.PackageRelativeId).toString('base64'), package: Buffer.from(app.PackageFullName).toString('base64') })
await request(`/api/taskmanager/app?${query}`, 'POST')
console.log(`Launched ${app.PackageFullName}`)

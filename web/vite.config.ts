import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// Resolve dependencies from web/node_modules because imports from ../src/ do not search that directory.
function webModule(name: string): string {
  const dir = resolve(here, 'node_modules', name)
  const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')) as {
    module?: string
    main?: string
  }
  return resolve(dir, pkg.module ?? pkg.main ?? 'index.js')
}

// Use one Three.js module for the game and troika-three-text.
// The audio shim selects browser Web Audio by returning null.
export default {
  root: here,
  resolve: {
    dedupe: ['three'],
    alias: [
      {
        find: '@geastack/native-webgl-angle/nativeAudioHost',
        replacement: resolve(here, 'shims/native-audio-host.ts'),
      },
      { find: /^three$/, replacement: resolve(here, 'node_modules/three/src/Three.js') },
      { find: /^three\/(.*)$/, replacement: resolve(here, 'node_modules/three/$1') },
      { find: /^troika-three-text$/, replacement: webModule('troika-three-text') },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
  server: {
    port: 5184,
    strictPort: true,
  },
}

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.dirname(here)
const require = createRequire(path.join(appDir, 'package.json'))
const nativeModule = (name) => fs.realpathSync(require.resolve(`@geastack/native-webgl-angle/${name}`))
const coreDir = path.dirname(require.resolve('@geastack/core/package.json'))
const { geaAppleNativeModuleAliases, geaModuleGraphPlugins } = await import(
  pathToFileURL(path.join(coreDir, 'scripts/gea-vite-module-graph-plugin.mjs')).href
)

export default {
  root: appDir,
  resolve: {
    // These aliases preserve Three.js class identity across native modules.
    alias: [
      ...geaAppleNativeModuleAliases({
        threeSrcDir: path.dirname(fs.realpathSync(require.resolve('three/src/Three.js'))),
        threeUtilsModule: nativeModule('nativeThreeUtils'),
        threeWebGLAnimationModule: nativeModule('nativeWebGLAnimation'),
        threeWebXRManagerModule: nativeModule('nativeWebXRManager'),
        troikaThreeTextModule: nativeModule('troika-three-text'),
      }),
      { find: '@geastack/native-webgl-angle', replacement: path.dirname(nativeModule('nativeWebGL')) },
    ],
  },
  plugins: geaModuleGraphPlugins({ outDir: path.join(here, 'build/module-graph'), entryReachableOnly: true }),
  build: {
    outDir: path.join(here, 'build/vite'),
    lib: { entry: path.join(here, 'index.ts'), formats: ['iife'], name: 'gea_skytail_xbox', fileName: () => 'index.js' },
    emptyOutDir: true,
    minify: false,
  },
}

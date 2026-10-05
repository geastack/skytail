import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    dedupe: ['three'],
    alias: [
      { find: /^three$/, replacement: resolve(here, 'node_modules/three/src/Three.js') },
    ],
  },
  test: {
    include: ['test/**/*.test.ts'],
    maxWorkers: 2,
  },
})

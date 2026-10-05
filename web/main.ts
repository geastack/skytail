import { Color } from 'three/src/math/Color.js'
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js'
import { createAviator } from '../src/aviator'
import { Controls } from '../src/io/input'
import type { World } from '../src/world/world'

const canvas = document.getElementById('c') as HTMLCanvasElement
const renderer = new WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor(new Color(0xf7d9aa), 1)

let w = window.innerWidth
let h = window.innerHeight
renderer.setSize(w, h, false)

const aviator = createAviator(w, h)
aviator.resize(w, h, w / h)
aviator.preload(renderer)

const controls = new Controls()
controls.bind()

const world = (aviator as unknown as { world: World }).world
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
world.plane.reducedMotion = motionPreference.matches
motionPreference.addEventListener('change', () => {
  world.plane.reducedMotion = motionPreference.matches
})

let prev = -1
requestAnimationFrame(function frame(ts: number): void {
  const nw = window.innerWidth
  const nh = window.innerHeight
  if (nw !== w || nh !== h) {
    w = nw
    h = nh
    renderer.setSize(w, h, false)
    aviator.resize(w, h, w / h)
  }
  // The 100-millisecond limit prevents a large time step when a background tab resumes.
  const dt = prev < 0 ? 16 : Math.min(ts - prev, 100)
  prev = ts
  aviator.update(dt, controls)
  aviator.render(renderer)
  requestAnimationFrame(frame)
})

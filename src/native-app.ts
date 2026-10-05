// The native host must attach its ANGLE surface before calling mountNativeAviator.

import { Color } from 'three/src/math/Color.js'
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js'
import { createNativeWebGLCanvas } from '@geastack/native-webgl-angle/nativeWebGL'
import {
  logNativeWebGL,
  nativeKeyPressed,
  nativePointerState,
  nativeWebGLDevicePixelRatio,
  nativeWebGLHeight,
  nativeWebGLSwap,
  nativeWebGLWidth,
  syncNativeWebGLSize,
} from '@geastack/native-webgl-angle/nativeWebGLHost'
import { createAviator } from './aviator'
import { registerFontAtlas } from '@geastack/native-webgl-angle/troika-three-text'
import { unboundedBlackAtlas } from './fonts/atlas-unbounded-900'
import { unboundedBoldAtlas } from './fonts/atlas-unbounded-700'
import { interAtlas } from './fonts/atlas-inter-600'
import { Controls } from './io/input'


export function mountNativeAviator(gamepad: ((channel: number) => number) | null = null): void {
  // Register the glyph atlases before creating the HUD to prevent fallback fonts.
  // Atlas selection matches a substring of the font asset URL.
  registerFontAtlas('unbounded-900', unboundedBlackAtlas)
  registerFontAtlas('unbounded-700', unboundedBoldAtlas)
  registerFontAtlas('inter-600', interAtlas)

  const width = Math.max(1, nativeWebGLWidth())
  const height = Math.max(1, nativeWebGLHeight())
  const aspect = width / height
  const canvas = createNativeWebGLCanvas(width, height)
  const context = canvas.getContext('webgl2')
  if (!context) {
    logNativeWebGL('ANGLE webgl2 context missing')
    return
  }

  const renderer = new WebGLRenderer({
    alpha: false,
    antialias: true,
    // Pass the native canvas and context directly to preserve their class types.
    canvas,
    context,
    depth: true,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
    stencil: false,
  })
  renderer.setClearColor(new Color(0xf7d9aa), 1)

  // The native host reports device pixels. The game and HUD use logical pixels.
  // Divide by the pixel ratio before sizing the renderer and HUD.
  let pixelWidth = Math.max(1, Math.floor(nativeWebGLWidth()))
  let pixelHeight = Math.max(1, Math.floor(nativeWebGLHeight()))
  let pixelRatio = Math.max(1, nativeWebGLDevicePixelRatio())
  let logicalWidth = Math.max(1, Math.round(pixelWidth / pixelRatio))
  let logicalHeight = Math.max(1, Math.round(pixelHeight / pixelRatio))
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(logicalWidth, logicalHeight, false)

  const aviator = createAviator(logicalWidth, logicalHeight)
  aviator.resize(logicalWidth, logicalHeight, logicalWidth / logicalHeight)
  aviator.preload(renderer)

  const controls = new Controls()
  if (gamepad) controls.setNativeGamepadSource(gamepad)
  // Do not call controls.bind() here. Native input uses host polling instead of DOM event listeners.
  controls.setNativeKeySource((code: number) => nativeKeyPressed(code))
  controls.setNativePointerSource((channel: number) => nativePointerState(channel))

  let prevMs = -1
  requestAnimationFrame(function frame(timestampMs: number): void {
    const aspectNow = syncNativeWebGLSize(aspect)
    const nextW = Math.max(1, Math.floor(nativeWebGLWidth()))
    const nextH = Math.max(1, Math.floor(nativeWebGLHeight()))
    const nextRatio = Math.max(1, nativeWebGLDevicePixelRatio())
    if (nextW !== pixelWidth || nextH !== pixelHeight || nextRatio !== pixelRatio) {
      pixelWidth = nextW
      pixelHeight = nextH
      pixelRatio = nextRatio
      logicalWidth = Math.max(1, Math.round(pixelWidth / pixelRatio))
      logicalHeight = Math.max(1, Math.round(pixelHeight / pixelRatio))
      canvas.width = pixelWidth
      canvas.height = pixelHeight
      canvas.clientWidth = logicalWidth
      canvas.clientHeight = logicalHeight
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(logicalWidth, logicalHeight, false)
      aviator.resize(logicalWidth, logicalHeight, aspectNow)
    }

    const dt = prevMs < 0 ? 16 : timestampMs - prevMs
    prevMs = timestampMs
    aviator.update(dt, controls)
    aviator.render(renderer)
    nativeWebGLSwap()
    requestAnimationFrame(frame)
  })
}

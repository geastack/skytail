// Multiplying the legacy light intensities by PI preserves their irradiance in current Three.js.
import { AmbientLight } from 'three/src/lights/AmbientLight.js'
import { DirectionalLight } from 'three/src/lights/DirectionalLight.js'
import { HemisphereLight } from 'three/src/lights/HemisphereLight.js'
import type { Scene } from 'three/src/scenes/Scene.js'
import { AMBIENT_REST } from '../config'

export interface SceneLights {
  hemisphere: HemisphereLight;
  /** The game pulses this ambient light toward white after an enemy hit. */
  ambient: AmbientLight;
  /** The sun direction and shadow camera stay fixed. Daylight changes only colour and intensity. */
  sun: DirectionalLight;
}

export function addLights(scene: Scene): SceneLights {
  const hemisphere = new HemisphereLight(0xaaaaaa, 0x000000, 0.9 * Math.PI)
  scene.add(hemisphere)

  const ambient = new AmbientLight(0xdc8874, AMBIENT_REST)
  scene.add(ambient)

  const sun = new DirectionalLight(0xffffff, 0.9 * Math.PI)
  sun.position.set(150, 350, 350)
  sun.castShadow = true
  sun.shadow.mapSize.width = 2048
  sun.shadow.mapSize.height = 2048
  sun.shadow.camera.left = -400
  sun.shadow.camera.right = 400
  sun.shadow.camera.top = 400
  sun.shadow.camera.bottom = -400
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 1000
  // The shadow radius softens texel steps in the cape shadow.
  // The normal bias reduces self-shadow stripes where the cape is close to the body.
  sun.shadow.radius = 4
  sun.shadow.normalBias = 0.6
  scene.add(sun)

  return { hemisphere, ambient, sun }
}

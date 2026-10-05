declare module 'troika-three-text' {
  import { Object3D } from 'three/src/core/Object3D.js'
  export class Text extends Object3D {
    text: string
    font: string | null
    fontSize: number
    color: number
    anchorX: 'left' | 'center' | 'right' | number
    anchorY: 'top' | 'middle' | 'bottom' | 'top-baseline' | number
    letterSpacing: number
    fillOpacity: number
    outlineWidth: number | string
    outlineColor: number
    depthOffset: number
    sync(callback?: () => void): void
    dispose(): void
  }
  export function preloadFont(
    options: { font?: string; characters?: string | string[] },
    callback: () => void,
  ): void
}

declare module '*.woff' {
  const url: string
  export default url
}

declare module '*.wav' {
  const url: string
  export default url
}

declare module '*.mp3' {
  const url: string
  export default url
}

// Preserve the native canvas and context class types at the renderer call site.
// DOM type assertions would remove that identity.

import type {
  WebGLRenderer as UpstreamWebGLRenderer,
  WebGLRendererParameters as UpstreamWebGLRendererParameters,
} from '../node_modules/@types/three/src/renderers/WebGLRenderer'
import type {
  NativeWebGLCanvas,
  NativeWebGL2RenderingContext,
} from '@geastack/native-webgl-angle/nativeWebGL'

export type { WebGLDebug, Effect, NodesHandler } from '../node_modules/@types/three/src/renderers/WebGLRenderer'

export interface WebGLRendererParameters extends Omit<UpstreamWebGLRendererParameters, 'canvas' | 'context'> {
  canvas?: UpstreamWebGLRendererParameters['canvas'] | NativeWebGLCanvas
  context?: UpstreamWebGLRendererParameters['context'] | NativeWebGL2RenderingContext
}

export declare class WebGLRenderer extends UpstreamWebGLRenderer {
  constructor(parameters?: WebGLRendererParameters)
}

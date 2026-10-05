import { CGRectMake } from '@geastack/apple/CoreGraphics'
import { NSView, NSViewHeightSizable, NSViewWidthSizable, installRootView } from '@geastack/apple/AppKit'
import { attachNativeWebGL, logNativeWebGL } from '@geastack/native-webgl-angle/nativeWebGLHost'
import { mountNativeAviator } from './native-app'

export function mountAviator(): void {
  const width = 1280
  const height = 800

  const stageView = (
    <NSView
      frame={CGRectMake(0, 0, width, height)}
      wantsLayer={true}
      autoresizingMask={NSViewWidthSizable + NSViewHeightSizable}
      layer={{ cornerRadius: 0 }}
    />
  ) as NSView

  const root = (
    <NSView
      frame={CGRectMake(0, 0, width, height)}
      wantsLayer={true}
      autoresizingMask={NSViewWidthSizable + NSViewHeightSizable}
    >
      {stageView}
    </NSView>
  ) as NSView

  installRootView(root)

  const hostReady = attachNativeWebGL(stageView, width, height, 2)
  if (!hostReady) {
    logNativeWebGL('ANGLE host unavailable')
    return
  }

  mountNativeAviator()
}

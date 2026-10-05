// The last input source used for steering controls the cursor. Action buttons can come from any source.
// The gamepad moves the cursor and retains its position on release. The mouse maps pointer position to the cursor.
// Arrow keys and WASD provide keyboard steering. Each unavailable input source produces no input.

import { globalField } from '../lib/globals'

export interface StickInput {
  x: number // -1 means left. 1 means right.
  y: number // -1 means down. 1 means up.
  action: boolean
}

interface GamepadButtonLike {
  pressed?: boolean
}
interface GamepadLike {
  axes?: number[]
  buttons?: GamepadButtonLike[]
}
interface NavigatorLike {
  getGamepads?: () => (GamepadLike | null)[]
}
interface KeyEventLike {
  code?: string
  key?: string
  preventDefault?: () => void
}
interface MouseEventLike {
  clientX?: number
  clientY?: number
}
interface EventTargetLike {
  addEventListener?: (type: string, handler: (event: never) => void) => void
  innerWidth?: number
  innerHeight?: number
}

const DEAD_ZONE = 0.12
// Normalized cursor units per second. Full stick crosses [-1, 1] in 2/3 second.
const GAMEPAD_CURSOR_SPEED = 3

// Rescale values outside the dead zone continuously from 0 to -1 or 1.
function scaleAxis(v: number): number {
  const a = Math.abs(v)
  if (a <= DEAD_ZONE) return 0
  const scaled = (a - DEAD_ZONE) / (1 - DEAD_ZONE)
  return v < 0 ? -scaled : scaled
}

type Source = 'keyboard' | 'gamepad' | 'mouse'

// Detect the frame when a button press starts. Supply the held state each frame.
export class Edge {
  private prev = false

  rising(pressed: boolean): boolean {
    const fired = pressed && !this.prev
    this.prev = pressed
    return fired
  }
}

export class Controls {
  x = 0
  y = 0
  action = false // A, Space, or click starts or replays.
  back = false // B returns to the start screen.
  flip = false // Y or F triggers a barrel roll.
  mute = false // D-pad down or native M toggles mute. Sound.bind handles browser M.
  muteMusic = false // D-pad left toggles music mute.

  private keyLeft = false
  private keyRight = false
  private keyUp = false
  private keyDown = false
  private keyAction = false
  private keyFlip = false
  private keyMute = false

  private mouseX = 0
  private mouseY = 0
  private mouseAction = false

  private stickX = 0
  private stickY = 0
  private padA = false
  private padB = false
  private padY = false
  private padMute = false
  private padMuteMusic = false

  private lastSource: Source = 'keyboard'

  get relativeCursor(): boolean {
    return this.lastSource === 'gamepad'
  }

  // The native host supplies a key probe using macOS virtual key codes. Read it each frame.
  private nativeKeys: ((code: number) => boolean) | null = null

  private nativeGamepad: ((channel: number) => number) | null = null

  // Channels 0 through 7: connected, left X, left Y (browser sign), A, B, Y, D-pad down, D-pad left.
  setNativeGamepadSource(probe: (channel: number) => number): void {
    this.nativeGamepad = probe
  }

  setNativeKeySource(probe: (code: number) => boolean): void {
    this.nativeKeys = probe
  }

  // Pointer channels: 0=x, 1=y, 2=width, 3=height, 4=move sequence, 5=primary button.
  // Positions use a top-left origin. Width and height use the same units as x and y.
  // A move sequence of 0 means the pointer was never seen.
  private nativePointer: ((channel: number) => number) | null = null
  private nativePointerSeq = 0

  setNativePointerSource(probe: (channel: number) => number): void {
    this.nativePointer = probe
  }

  // Claim mouse steering only when the move sequence changes. An idle pointer must preserve keyboard or gamepad steering.
  private pollNativePointer(): void {
    const p = this.nativePointer
    if (!p) return
    this.mouseAction = p(5) > 0
    const seq = p(4)
    if (seq === this.nativePointerSeq) return
    this.nativePointerSeq = seq
    const w = p(2)
    const h = p(3)
    if (w <= 0 || h <= 0) return
    this.mouseX = -1 + (p(0) / w) * 2
    this.mouseY = 1 - (p(1) / h) * 2
    this.lastSource = 'mouse'
  }

  // Retain held key states. Game uses Edge to produce one action per press and rearms after release.
  private pollNativeKeys(): void {
    const k = this.nativeKeys
    if (!k) return
    this.keyLeft = k(123) || k(0)
    this.keyRight = k(124) || k(2)
    this.keyUp = k(126) || k(13)
    this.keyDown = k(125) || k(1)
    this.keyAction = k(49) || k(36) || k(15)
    this.keyFlip = k(3)
    this.keyMute = k(46)
    if (this.keyLeft || this.keyRight || this.keyUp || this.keyDown) this.lastSource = 'keyboard'
  }

  // Bind browser input when window or document supplies event listeners.
  bind(): void {
    const target = this.eventTarget()
    if (!target || !target.addEventListener) return

    target.addEventListener('keydown', (event: KeyEventLike) => this.setKey(event, true))
    target.addEventListener('keyup', (event: KeyEventLike) => this.setKey(event, false))

    target.addEventListener('mousemove', (event: MouseEventLike) => {
      const w = target.innerWidth || 1
      const h = target.innerHeight || 1
      const cx = event.clientX || 0
      const cy = event.clientY || 0
      this.mouseX = -1 + (cx / w) * 2
      this.mouseY = 1 - (cy / h) * 2
      this.lastSource = 'mouse'
    })
    target.addEventListener('mousedown', () => {
      this.mouseAction = true
    })
    target.addEventListener('mouseup', () => {
      this.mouseAction = false
    })
  }

  private eventTarget(): EventTargetLike | null {
    const win = globalField('window') as EventTargetLike | undefined
    if (win && win.addEventListener) return win
    const doc = globalField('document') as EventTargetLike | undefined
    if (doc && doc.addEventListener) return doc
    return null
  }

  private setKey(event: KeyEventLike, down: boolean): void {
    const code = event.code || event.key || ''
    let handled = true
    let steering = false
    if (code === 'ArrowLeft' || code === 'KeyA' || code === 'a') {
      this.keyLeft = down
      steering = true
    } else if (code === 'ArrowRight' || code === 'KeyD' || code === 'd') {
      this.keyRight = down
      steering = true
    } else if (code === 'ArrowUp' || code === 'KeyW' || code === 'w') {
      this.keyUp = down
      steering = true
    } else if (code === 'ArrowDown' || code === 'KeyS' || code === 's') {
      this.keyDown = down
      steering = true
    } else if (code === 'Space' || code === 'Enter' || code === 'KeyR' || code === ' ' || code === 'r') {
      this.keyAction = down
    } else if (code === 'KeyF' || code === 'f') {
      this.keyFlip = down
    } else {
      handled = false
    }
    // Only steering keys change the input source. Action keys must preserve the current mouse target.
    if (steering && down) this.lastSource = 'keyboard'
    if (handled && event.preventDefault) event.preventDefault()
  }

  private readGamepad(): void {
    this.stickX = 0
    this.stickY = 0
    this.padA = false
    this.padB = false
    this.padY = false
    this.padMute = false
    this.padMuteMusic = false
    const native = this.nativeGamepad
    if (native) {
      if (native(0) > 0) {
        this.stickX = scaleAxis(native(1))
        this.stickY = -scaleAxis(native(2))
        this.padA = native(3) > 0
        this.padB = native(4) > 0
        this.padY = native(5) > 0
        this.padMute = native(6) > 0
        this.padMuteMusic = native(7) > 0
        if (this.stickX !== 0 || this.stickY !== 0) this.lastSource = 'gamepad'
      }
      return
    }
    this.readBrowserGamepad()
  }

  private readBrowserGamepad(): void {
    const nav = globalField('navigator') as NavigatorLike | undefined
    if (!nav || !nav.getGamepads) return
    const pads = nav.getGamepads()
    if (!pads || pads.length === 0) return
    let pad: GamepadLike | null = null
    for (let i = 0; i < pads.length; i++) {
      const candidate = pads[i]
      if (candidate) {
        pad = candidate
        break
      }
    }
    if (!pad) return

    const axes = pad.axes
    if (axes && axes.length >= 2) {
      this.stickX = scaleAxis(axes[0])
      this.stickY = -scaleAxis(axes[1]) // Up is negative in browser gamepad axes.
    }
    const buttons = pad.buttons
    if (buttons) {
      this.padA = !!(buttons[0] && buttons[0].pressed)
      this.padB = !!(buttons[1] && buttons[1].pressed)
      this.padY = !!(buttons[3] && buttons[3].pressed)
      this.padMute = !!(buttons[13] && buttons[13].pressed)
      this.padMuteMusic = !!(buttons[14] && buttons[14].pressed)
    }
    if (this.stickX !== 0 || this.stickY !== 0) this.lastSource = 'gamepad'
  }

  poll(dtMs: number = 1000 / 60): void {
    this.pollNativeKeys()
    this.pollNativePointer()
    this.readGamepad()

    if (this.lastSource === 'mouse') {
      this.x = this.mouseX
      this.y = this.mouseY
    } else if (this.lastSource === 'gamepad') {
      // Stick deflection controls cursor velocity. Retain the current target when changing sources, releasing the stick, or disconnecting.
      // Clamp the cursor to prevent accumulated travel beyond the edges.
      const travel = GAMEPAD_CURSOR_SPEED * Math.max(0, Math.min(dtMs, 60)) / 1000
      this.x = Math.max(-1, Math.min(1, this.x + this.stickX * travel))
      this.y = Math.max(-1, Math.min(1, this.y + this.stickY * travel))
    } else {
      let kx = 0
      let ky = 0
      if (this.keyLeft) kx -= 1
      if (this.keyRight) kx += 1
      if (this.keyDown) ky -= 1
      if (this.keyUp) ky += 1
      this.x = kx
      this.y = ky
    }

    this.action = this.keyAction || this.padA || this.mouseAction
    this.back = this.padB
    this.flip = this.keyFlip || this.padY
    this.mute = this.keyMute || this.padMute
    this.muteMusic = this.padMuteMusic
  }
}

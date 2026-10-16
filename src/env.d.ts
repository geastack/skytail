/**
 * The host's frame scheduler: it retains and later invokes the callback, and
 * writes no property on any script object.
 * @gea-host-no-property-writes
 */
declare function requestAnimationFrame(callback: (timestampMs: number) => void): number

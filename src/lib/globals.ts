// The native compiler stores globalThis as a dictionary.
// Indexed access avoids an unsupported conversion to a record with optional fields.
export function globalField(name: string): unknown {
  return (globalThis as unknown as Record<string, unknown>)[name]
}

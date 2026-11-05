type Intersection<U> = (U extends unknown ? (part: U) => void : never) extends (
  part: infer I,
) => void
  ? I
  : never;

/** The parts of one config or text file as one shape. A key two parts claim
 * is refused: spread, the later part would win silently. */
export function mergeShapes<const Parts extends readonly object[]>(
  ...parts: Parts
): Intersection<Parts[number]> {
  const merged: Record<string, unknown> = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (key in merged) throw new Error(`"${key}" is claimed twice`);
      merged[key] = value;
    }
  }
  return merged as Intersection<Parts[number]>;
}

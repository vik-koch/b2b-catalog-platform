/** True if the parent map contains a cycle (walking up from any node loops). */
export function hasCycle(parentById: Map<string, string | null>): boolean {
  for (const start of parentById.keys()) {
    const seen = new Set<string>();
    let current: string | null | undefined = start;
    while (current) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = parentById.get(current) ?? null;
    }
  }
  return false;
}

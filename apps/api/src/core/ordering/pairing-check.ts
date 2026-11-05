/**
 * Whether a cart holds enough of what its products are sold with (FR-SET-02),
 * and by how much it falls short. Symmetric and in pieces: each paired product
 * must be covered by its counterparts' pieces, allocated, not summed. Ten lids
 * shared by ten cups and ten mugs cover either, not both.
 *
 * Each product is a demand and a supply, so it is a max-flow; with few paired
 * lines per cart, an augmenting-path search is enough. The cart states it and
 * checkout may refuse on it.
 */

/** A cart line as the check reads it: how many pieces, and which of the other
 * lines in this cart are its counterparts. */
export interface PairingLine {
  slug: string;
  pieces: number;
  /** Whether it is sold with anything: an empty list cannot tell a product
   * sold alone from one whose counterparts are all missing. */
  paired: boolean;
  /** Those of its counterparts that are also in this cart. Slugs that are not
   * among the lines are ignored, so a caller may pass the whole neighbourhood
   * if that is what it has. */
  counterpartSlugs: readonly string[];
}

/** How many pieces of cover a product is missing. Only products that are
 * actually short appear. */
export interface PairingShortfall {
  slug: string;
  shortPieces: number;
}

/** An edge of the flow network. Residual capacities live here; `reverse` is the
 * index of the paired edge, which is how flow is pushed back. */
interface Edge {
  to: number;
  capacity: number;
  reverse: number;
}

/**
 * What each product is short of, most first, ties by slug. Only paired lines
 * demand; one with no counterpart in the cart demands all its pieces.
 *
 * Where two share a counterpart, the total missing is fixed but who is told
 * depends on the search order, which is the lines' order, so one cart always
 * gets one answer.
 */
export function pairingShortfalls(
  lines: readonly PairingLine[],
): PairingShortfall[] {
  const paired = lines.filter((line) => line.paired);
  if (paired.length === 0) return [];

  const index = new Map(paired.map((line, at) => [line.slug, at]));
  const n = paired.length;
  // Source, one demand node and one supply node per product, sink. A product
  // is both: its pieces ask for cover and offer it, and the two must not be
  // the same node or a product would cover itself.
  const source = 2 * n;
  const sink = 2 * n + 1;
  const graph: Edge[][] = Array.from({ length: 2 * n + 2 }, () => []);

  const connect = (from: number, to: number, capacity: number): void => {
    graph[from].push({ to, capacity, reverse: graph[to].length });
    graph[to].push({ to: from, capacity: 0, reverse: graph[from].length - 1 });
  };

  const demand = (at: number) => at;
  const supply = (at: number) => n + at;

  for (const [at, line] of paired.entries()) {
    connect(source, demand(at), line.pieces);
    connect(supply(at), sink, line.pieces);
    for (const slug of line.counterpartSlugs) {
      const other = index.get(slug);
      // Unbounded between the two: what limits the draw is the counterpart's
      // own pieces, which its edge to the sink already says.
      if (other !== undefined) connect(demand(at), supply(other), line.pieces);
    }
  }

  maximizeFlow(graph, source, sink);

  // What is left on the source's edges is what could not be covered: the edge
  // was created with the product's whole piece count, and every unit of flow
  // through it took one away.
  const shortfalls: PairingShortfall[] = [];
  for (const [at, line] of paired.entries()) {
    const edge = graph[source].find((candidate) => candidate.to === demand(at));
    const shortPieces = edge?.capacity ?? 0;
    if (shortPieces > 0) shortfalls.push({ slug: line.slug, shortPieces });
  }

  return shortfalls.sort(
    (a, b) => b.shortPieces - a.shortPieces || a.slug.localeCompare(b.slug),
  );
}

/** Edmonds-Karp, shortest augmenting path first: the least machinery that
 * ends predictably on a few dozen nodes. */
function maximizeFlow(graph: Edge[][], source: number, sink: number): void {
  for (;;) {
    // BFS over the residual graph, recording the edge each node was reached by.
    const cameFrom: (Edge | null)[] = Array(graph.length).fill(null);
    const queue = [source];
    cameFrom[source] = { to: source, capacity: 0, reverse: -1 };

    for (let head = 0; head < queue.length && cameFrom[sink] === null; head++) {
      for (const edge of graph[queue[head]]) {
        if (edge.capacity > 0 && cameFrom[edge.to] === null) {
          cameFrom[edge.to] = edge;
          queue.push(edge.to);
        }
      }
    }
    if (cameFrom[sink] === null) return;

    // The path's bottleneck, walked backwards through the reverse edges.
    let pushed = Infinity;
    for (let at = sink; at !== source;) {
      const edge = cameFrom[at] as Edge;
      pushed = Math.min(pushed, edge.capacity);
      at = graph[edge.to][edge.reverse].to;
    }
    for (let at = sink; at !== source;) {
      const edge = cameFrom[at] as Edge;
      edge.capacity -= pushed;
      graph[edge.to][edge.reverse].capacity += pushed;
      at = graph[edge.to][edge.reverse].to;
    }
  }
}

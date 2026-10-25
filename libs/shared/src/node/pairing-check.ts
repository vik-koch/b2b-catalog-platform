/**
 * Whether a cart holds enough of what its products are sold with (FR-SET-02),
 * and where it does not, by how much.
 *
 * The rule is symmetric and counted in pieces: every paired product in the cart
 * must have its own piece count covered by pieces of its counterparts. The
 * catch is that cover is **allocated, not summed** — a cart of 10 cups, 10 mugs
 * and 10 lids, where both the cup and the mug take that lid, has enough lids for
 * either but not for both, and adding the lid's ten pieces up twice would call
 * that cart satisfied.
 *
 * Stated properly it is a bipartite feasibility question: each product appears
 * once as a demand and once as a supply, an edge lets a demand draw on a
 * counterpart's supply, and the cart is satisfied exactly when every demand can
 * be met at once. That is a max-flow, and at this size — fewer than one product
 * in a hundred is paired, so a realistic cart has a handful of paired lines —
 * an augmenting-path search is the whole implementation.
 *
 * Shared rather than server-only because the same answer is needed twice: the
 * cart states it, and checkout may refuse on it.
 */

/** A cart line as the check reads it: how many pieces, and which of the other
 * lines in this cart are its counterparts. */
export interface PairingLine {
  slug: string;
  pieces: number;
  /**
   * Whether this product is sold with anything at all — separate from the list
   * below, and the whole difference between a product sold alone and one whose
   * counterparts are simply not in the cart. The second is *maximally* short,
   * and a list that is empty in both cases cannot say which is which.
   */
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
 * What each product is short of, most short first, ties broken by slug.
 *
 * Only paired lines demand anything, and a paired line whose counterparts are
 * none of them in the cart demands its whole piece count with nothing to draw
 * on — which is why `paired` is a field of its own and not read off the list.
 *
 * The shortfall of a product that shares its counterpart with another is not
 * uniquely determined: the total missing is, but which of the two is told about
 * it depends on the order the paths are found in. That order is the order the
 * lines arrive in, so the same cart always gets the same answer.
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

  maximiseFlow(graph, source, sink);

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

/**
 * Edmonds–Karp: shortest augmenting path first, until none is left. Chosen for
 * being the least machinery that terminates predictably — the graph has a few
 * dozen nodes at the very most, so nothing here is worth making faster.
 */
function maximiseFlow(graph: Edge[][], source: number, sink: number): void {
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

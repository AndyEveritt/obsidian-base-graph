import type { GraphLink, GraphNode } from '../graph/types';

/** Passes up and down the rows when ordering them; more rarely changes the order further. */
const ORDER_SWEEPS = 8;

const endId = (end: GraphNode | string) => (typeof end === 'string' ? end : end.id);

/**
 * Layer of each node in the top down layout, by node id. Notes with no outgoing links
 * are layer 0, and every other note is one layer below the lowest note it links to, so
 * links always point up. Mutual links don't say which note is above, so they're ignored,
 * and a link that would close a cycle is skipped.
 */
export function topDownLayers(nodes: GraphNode[], links: GraphLink[]): Map<string, number> {
	const targets = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
	for (const link of links) {
		if (link.mutual) continue;
		targets.get(endId(link.source))?.push(endId(link.target));
	}

	const layers = new Map<string, number>();
	const visiting = new Set<string>();
	// Iterative depth-first search, as long chains of links could overflow the stack.
	for (const root of targets.keys()) {
		if (layers.has(root)) continue;
		const stack: { id: string; next: number }[] = [{ id: root, next: 0 }];
		visiting.add(root);
		while (stack.length > 0) {
			const top = stack[stack.length - 1]!;
			const out = targets.get(top.id)!;
			if (top.next < out.length) {
				const target = out[top.next++]!;
				if (layers.has(target) || visiting.has(target) || !targets.has(target)) continue;
				visiting.add(target);
				stack.push({ id: target, next: 0 });
				continue;
			}
			let layer = 0;
			for (const target of out) {
				const above = layers.get(target);
				if (above !== undefined) layer = Math.max(layer, above + 1);
			}
			layers.set(top.id, layer);
			visiting.delete(top.id);
			stack.pop();
		}
	}
	return layers;
}

/**
 * Order of the nodes within each row, by node id, so nodes sit near the nodes they link
 * to and links cross less. Starts from where the nodes are now, then sweeps down and up
 * the rows, sorting each by the mean position of its nodes' links in the row before.
 * Clusters are kept together. With `sweeps` of 0, the rows are just sorted by position.
 */
export function topDownOrder(
	nodes: GraphNode[],
	links: GraphLink[],
	layers: Map<string, number>,
	sweeps = ORDER_SWEEPS,
): Map<string, number> {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const layerOf = (n: GraphNode) => layers.get(n.id) ?? 0;
	const cluster = (n: GraphNode) => n.clusters[0] ?? -1;

	const rows: GraphNode[][] = [];
	for (const n of nodes) (rows[layerOf(n)] ??= []).push(n);
	const position = new Map<GraphNode, number>();
	const place = (row: GraphNode[]) => {
		// Centred, so rows of different lengths line up around the middle.
		row.forEach((n, i) => position.set(n, i - (row.length - 1) / 2));
	};
	for (const row of rows) {
		if (!row) continue;
		row.sort((a, b) => cluster(a) - cluster(b) || (a.x ?? 0) - (b.x ?? 0));
		place(row);
	}

	const above = new Map<GraphNode, GraphNode[]>(nodes.map((n) => [n, []]));
	const below = new Map<GraphNode, GraphNode[]>(nodes.map((n) => [n, []]));
	for (const link of links) {
		const a = byId.get(endId(link.source));
		const b = byId.get(endId(link.target));
		if (!a || !b || layerOf(a) === layerOf(b)) continue;
		const [upper, lower] = layerOf(a) < layerOf(b) ? [a, b] : [b, a];
		below.get(upper)!.push(lower);
		above.get(lower)!.push(upper);
	}

	const sortRow = (row: GraphNode[], neighbours: Map<GraphNode, GraphNode[]>) => {
		const key = new Map<GraphNode, number>();
		for (const n of row) {
			const linked = neighbours.get(n)!;
			key.set(
				n,
				linked.length === 0
					? position.get(n)!
					: linked.reduce((sum, m) => sum + position.get(m)!, 0) / linked.length,
			);
		}
		row.sort(
			(a, b) =>
				cluster(a) - cluster(b) ||
				key.get(a)! - key.get(b)! ||
				position.get(a)! - position.get(b)!,
		);
		place(row);
	};
	for (let sweep = 0; sweep < sweeps; sweep++) {
		for (let i = 1; i < rows.length; i++) if (rows[i]) sortRow(rows[i]!, above);
		for (let i = rows.length - 2; i >= 0; i--) if (rows[i]) sortRow(rows[i]!, below);
	}

	const order = new Map<string, number>();
	for (const row of rows) row?.forEach((n, i) => order.set(n.id, i));
	return order;
}

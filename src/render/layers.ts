import type { GraphLink, GraphNode } from '../graph/types';

/** Passes back and forth over the layers when ordering them; more rarely changes the order further. */
const ORDER_SWEEPS = 8;

const endId = (end: GraphNode | string) => (typeof end === 'string' ? end : end.id);

/**
 * Layer of each node in the layered layout, by node id. Notes with no outgoing links
 * are layer 0, and every other note is one layer after the furthest note it links to, so
 * links always point back towards layer 0. Mutual links don't say which note comes
 * first, so they're ignored.
 *
 * A link that would close a cycle is skipped too. Links are taken in the order of the link
 * properties, then other links, so when properties disagree, such as `blocked_by` and
 * `blocks` between the same notes, the property listed first decides.
 */
export function nodeLayers(nodes: GraphNode[], links: GraphLink[]): Map<string, number> {
	const targets = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
	const priority = (link: GraphLink) => (link.kind < 0 ? Infinity : link.kind);
	for (const link of [...links].sort((a, b) => priority(a) - priority(b))) {
		if (link.mutual) continue;
		const source = endId(link.source);
		const target = endId(link.target);
		const out = targets.get(source);
		if (!out || !targets.has(target) || reaches(targets, target, source)) continue;
		out.push(target);
	}

	const layers = new Map<string, number>();
	// Iterative depth-first search, as long chains of links could overflow the stack.
	for (const root of targets.keys()) {
		if (layers.has(root)) continue;
		const stack: { id: string; next: number }[] = [{ id: root, next: 0 }];
		while (stack.length > 0) {
			const top = stack[stack.length - 1]!;
			const out = targets.get(top.id)!;
			if (top.next < out.length) {
				const target = out[top.next++]!;
				if (!layers.has(target)) stack.push({ id: target, next: 0 });
				continue;
			}
			let layer = 0;
			for (const target of out) layer = Math.max(layer, layers.get(target)! + 1);
			layers.set(top.id, layer);
			stack.pop();
		}
	}
	return layers;
}

/** Whether `to` can be reached from `from` by following links. */
function reaches(targets: Map<string, string[]>, from: string, to: string): boolean {
	if (from === to) return true;
	const seen = new Set([from]);
	const stack = [from];
	while (stack.length > 0) {
		for (const next of targets.get(stack.pop()!)!) {
			if (next === to) return true;
			if (!seen.has(next)) {
				seen.add(next);
				stack.push(next);
			}
		}
	}
	return false;
}

/**
 * Order of the nodes within each layer, by node id, so nodes sit near the nodes they link
 * to and links cross less. Starts from where the nodes are now across the layers, given by
 * `across`, then sweeps back and forth over the layers, sorting each by the mean place of
 * its nodes' links in the layer before. Clusters are kept together. With `sweeps` of 0,
 * the layers are just sorted by where the nodes are.
 */
export function layerOrder(
	nodes: GraphNode[],
	links: GraphLink[],
	layers: Map<string, number>,
	across: (node: GraphNode) => number | undefined,
	sweeps = ORDER_SWEEPS,
): Map<string, number> {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const layerOf = (n: GraphNode) => layers.get(n.id) ?? 0;
	const cluster = (n: GraphNode) => n.clusters[0] ?? -1;

	const byLayer: GraphNode[][] = [];
	for (const n of nodes) (byLayer[layerOf(n)] ??= []).push(n);
	const position = new Map<GraphNode, number>();
	const place = (layer: GraphNode[]) => {
		// Centred, so layers of different lengths line up around the middle.
		layer.forEach((n, i) => position.set(n, i - (layer.length - 1) / 2));
	};
	for (const layer of byLayer) {
		if (!layer) continue;
		layer.sort((a, b) => cluster(a) - cluster(b) || (across(a) ?? 0) - (across(b) ?? 0));
		place(layer);
	}

	const earlier = new Map<GraphNode, GraphNode[]>(nodes.map((n) => [n, []]));
	const later = new Map<GraphNode, GraphNode[]>(nodes.map((n) => [n, []]));
	for (const link of links) {
		const a = byId.get(endId(link.source));
		const b = byId.get(endId(link.target));
		if (!a || !b || layerOf(a) === layerOf(b)) continue;
		const [first, second] = layerOf(a) < layerOf(b) ? [a, b] : [b, a];
		later.get(first)!.push(second);
		earlier.get(second)!.push(first);
	}

	const sortLayer = (layer: GraphNode[], neighbours: Map<GraphNode, GraphNode[]>) => {
		const key = new Map<GraphNode, number>();
		for (const n of layer) {
			const linked = neighbours.get(n)!;
			key.set(
				n,
				linked.length === 0
					? position.get(n)!
					: linked.reduce((sum, m) => sum + position.get(m)!, 0) / linked.length,
			);
		}
		layer.sort(
			(a, b) =>
				cluster(a) - cluster(b) ||
				key.get(a)! - key.get(b)! ||
				position.get(a)! - position.get(b)!,
		);
		place(layer);
	};
	for (let sweep = 0; sweep < sweeps; sweep++) {
		for (let i = 1; i < byLayer.length; i++) if (byLayer[i]) sortLayer(byLayer[i]!, earlier);
		for (let i = byLayer.length - 2; i >= 0; i--) if (byLayer[i]) sortLayer(byLayer[i]!, later);
	}

	const order = new Map<string, number>();
	for (const layer of byLayer) layer?.forEach((n, i) => order.set(n.id, i));
	return order;
}

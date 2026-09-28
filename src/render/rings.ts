import type { GraphNode } from '../graph/types';

/** Space around each node on a ring, as a multiple of the largest node's diameter. */
const NODE_SPACING = 1.5;

/**
 * Radius of the ring for each depth level. The base's notes form a disc in the middle,
 * and each ring is at least `gap` outside the one before it, and large enough for its
 * nodes to fit around it.
 */
export function ringRadii(
	nodes: GraphNode[],
	radiusOf: (node: GraphNode) => number,
	gap: number,
): number[] {
	const counts: number[] = [];
	let largest = 0;
	for (const node of nodes) {
		counts[node.level] = (counts[node.level] ?? 0) + 1;
		largest = Math.max(largest, radiusOf(node));
	}
	const spacing = 2 * largest * NODE_SPACING;

	const radii = [0];
	// Roughly the radius of the disc the middle notes pack into.
	let inner = spacing * Math.sqrt((counts[0] ?? 0) / Math.PI);
	for (let level = 1; level < counts.length; level++) {
		const fit = ((counts[level] ?? 0) * spacing) / (2 * Math.PI);
		inner = Math.max(inner + gap, fit);
		radii[level] = inner;
	}
	return radii;
}

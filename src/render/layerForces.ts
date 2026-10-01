import type { GraphLink, GraphNode } from '../graph/types';

/** The axis layers are stacked along: y for top to bottom or bottom to top, x for sideways. */
export type Axis = 'x' | 'y';

export const crossAxis = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x');
const VELOCITY = { x: 'vx', y: 'vy' } as const;
const FIXED = { x: 'fx', y: 'fy' } as const;

/**
 * Holds each node on its layer, in its place in the layer's order, at least `gap` from its
 * neighbours, so nodes spread across the layer instead of stacking. Add it after the other
 * forces, as it overrides the movement along `axis` they add. Nodes being dragged are left
 * alone.
 */
export function forceLayers(
	axis: Axis,
	position: (node: GraphNode) => number,
	order: (node: GraphNode) => number,
	gap: (before: GraphNode, after: GraphNode) => number,
) {
	const cross = crossAxis(axis);
	const v = VELOCITY[axis];
	const crossV = VELOCITY[cross];
	let nodes: GraphNode[] = [];

	const force = () => {
		const layers = new Map<number, GraphNode[]>();
		for (const n of nodes) {
			if (n[FIXED[axis]] !== null && n[FIXED[axis]] !== undefined) continue;
			const p = position(n);
			n[axis] = p;
			n[v] = 0;
			const layer = layers.get(p);
			if (layer) layer.push(n);
			else layers.set(p, [n]);
		}
		// Where each node is heading this tick, as in d3's collide force.
		const next = (n: GraphNode) => n[cross]! + n[crossV]!;
		for (const layer of layers.values()) {
			layer.sort((a, b) => order(a) - order(b));
			for (let i = 1; i < layer.length; i++) {
				const before = layer[i - 1]!;
				const after = layer[i]!;
				const overlap = gap(before, after) - (next(after) - next(before));
				if (overlap <= 0) continue;
				before[crossV] = before[crossV]! - overlap / 2;
				after[crossV] = after[crossV]! + overlap / 2;
			}
		}
	};
	force.initialize = (n: GraphNode[]) => {
		nodes = n;
	};
	return force;
}

/**
 * Pulls linked nodes into line across the layers, for the layered layout. The usual link
 * force barely does this: linked nodes in neighbouring layers are already a link's length
 * apart, so an offset across the layers hardly stretches the link. As in d3's link force,
 * the node with fewer links moves more, so a parent stays put while its children gather
 * in line with it.
 */
export function forceLinksAcross(
	axis: Axis,
	links: () => GraphLink[],
	strength: (link: GraphLink) => number,
) {
	const cross = crossAxis(axis);
	const v = VELOCITY[cross];
	return (alpha: number) => {
		for (const link of links()) {
			const { source, target } = link;
			// Ids until the link force resolves them.
			if (typeof source === 'string' || typeof target === 'string') continue;
			const d = target[cross]! + target[v]! - (source[cross]! + source[v]!);
			const k = d * strength(link) * alpha;
			const s = Math.max(1, source.degree);
			const t = Math.max(1, target.degree);
			target[v] = target[v]! - (k * s) / (s + t);
			source[v] = source[v]! + (k * t) / (s + t);
		}
	};
}

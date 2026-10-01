import type { GraphLink, GraphNode } from '../graph/types';

/**
 * Holds each node on its row, in its place in the row's order, at least `gap` from its
 * neighbours, so nodes spread sideways instead of stacking. Add it after the other forces,
 * as it overrides the vertical movement they add. Nodes being dragged are left alone.
 */
export function forceRows(
	rowY: (node: GraphNode) => number,
	order: (node: GraphNode) => number,
	gap: (left: GraphNode, right: GraphNode) => number,
) {
	let nodes: GraphNode[] = [];

	const force = () => {
		const rows = new Map<number, GraphNode[]>();
		for (const n of nodes) {
			if (n.fy !== null && n.fy !== undefined) continue;
			const y = rowY(n);
			n.y = y;
			n.vy = 0;
			const row = rows.get(y);
			if (row) row.push(n);
			else rows.set(y, [n]);
		}
		// Where each node is heading this tick, as in d3's collide force.
		const next = (n: GraphNode) => n.x! + n.vx!;
		for (const row of rows.values()) {
			row.sort((a, b) => order(a) - order(b));
			for (let i = 1; i < row.length; i++) {
				const left = row[i - 1]!;
				const right = row[i]!;
				const overlap = gap(left, right) - (next(right) - next(left));
				if (overlap <= 0) continue;
				left.vx! -= overlap / 2;
				right.vx! += overlap / 2;
			}
		}
	};
	force.initialize = (n: GraphNode[]) => {
		nodes = n;
	};
	return force;
}

/**
 * Pulls linked nodes into line horizontally, for the top down layout. The usual link force
 * barely pulls sideways there: linked nodes on neighbouring rows are already a link's
 * length apart, so a sideways offset hardly stretches the link. As in d3's link force, the
 * node with fewer links moves more, so a parent stays put while its children gather under it.
 */
export function forceLinksX(links: () => GraphLink[], strength: (link: GraphLink) => number) {
	return (alpha: number) => {
		for (const link of links()) {
			const { source, target } = link;
			// Ids until the link force resolves them.
			if (typeof source === 'string' || typeof target === 'string') continue;
			const dx = target.x! + target.vx! - (source.x! + source.vx!);
			const k = dx * strength(link) * alpha;
			const s = Math.max(1, source.degree);
			const t = Math.max(1, target.degree);
			target.vx! -= (k * s) / (s + t);
			source.vx! += (k * t) / (s + t);
		}
	};
}

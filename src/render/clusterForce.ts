import type { GraphNode } from '../graph/types';

/**
 * Pulls each node towards the centre of its cluster. Centres are recomputed on every
 * tick, so clusters form wherever the layout puts them rather than at fixed points.
 */
export function forceCluster(strength: number) {
	let nodes: GraphNode[] = [];

	const force = (alpha: number) => {
		const centres = new Map<number, { x: number; y: number; count: number }>();
		for (const n of nodes) {
			if (n.cluster < 0) continue;
			const c = centres.get(n.cluster);
			if (c) {
				c.x += n.x!;
				c.y += n.y!;
				c.count++;
			} else {
				centres.set(n.cluster, { x: n.x!, y: n.y!, count: 1 });
			}
		}
		const k = strength * alpha;
		for (const n of nodes) {
			const c = n.cluster < 0 ? undefined : centres.get(n.cluster);
			if (!c || c.count < 2) continue;
			n.vx! += (c.x / c.count - n.x!) * k;
			n.vy! += (c.y / c.count - n.y!) * k;
		}
	};
	force.initialize = (n: GraphNode[]) => {
		nodes = n;
	};
	return force;
}

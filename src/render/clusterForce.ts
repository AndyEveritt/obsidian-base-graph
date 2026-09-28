import type { GraphNode } from '../graph/types';
import { MARGIN } from './clusterShapes';

/** Space kept between a cluster's outline and nodes outside it, in graph units. */
const CLUSTER_GAP = 10;
/** The most overlap a node is pushed for at once, in graph units. */
const MAX_PUSH = 50;

interface Centre {
	x: number;
	y: number;
	count: number;
}

interface Push {
	x: number;
	y: number;
}

/** The mean position of each cluster's nodes. */
function clusterCentres(nodes: GraphNode[]): Map<number, Centre> {
	const centres = new Map<number, Centre>();
	for (const n of nodes) {
		for (const cluster of n.clusters) {
			const c = centres.get(cluster);
			if (c) {
				c.x += n.x!;
				c.y += n.y!;
				c.count++;
			} else {
				centres.set(cluster, { x: n.x!, y: n.y!, count: 1 });
			}
		}
	}
	for (const c of centres.values()) {
		c.x /= c.count;
		c.y /= c.count;
	}
	return centres;
}

/**
 * Pulls each node towards the centre of its cluster, or evenly towards each of its
 * clusters' centres when it's in several. Centres are recomputed on every tick, so
 * clusters form wherever the layout puts them rather than at fixed points.
 */
export function forceCluster(strength: number) {
	let nodes: GraphNode[] = [];

	const force = (alpha: number) => {
		const centres = clusterCentres(nodes);
		for (const n of nodes) {
			const k = (strength * alpha) / n.clusters.length;
			for (const cluster of n.clusters) {
				const c = centres.get(cluster)!;
				if (c.count < 2) continue;
				n.vx! += (c.x - n.x!) * k;
				n.vy! += (c.y - n.y!) * k;
			}
		}
	};
	force.initialize = (n: GraphNode[]) => {
		nodes = n;
	};
	return force;
}

/**
 * Pushes nodes out of clusters they aren't in. Each cluster is treated as a circle
 * around its centre, big enough to hold its outline, and any other node inside it is
 * pushed out, with the cluster pushed back the other way. Clusters overlapping
 * therefore push each other apart, while links stretching a node into another cluster
 * are resisted where they pull. Nodes shared by two clusters are members of both, so
 * the clusters separate with the shared nodes between them.
 */
export function forceClusterRepel(strength: number, radiusOf: (node: GraphNode) => number) {
	let nodes: GraphNode[] = [];

	const force = (alpha: number) => {
		if (strength === 0) return;
		const centres = clusterCentres(nodes);
		if (centres.size < 2) return;

		const reach = new Map<number, number>();
		const largest = new Map<number, number>();
		for (const n of nodes) {
			for (const cluster of n.clusters) {
				const c = centres.get(cluster)!;
				reach.set(cluster, Math.max(reach.get(cluster) ?? 0, Math.hypot(n.x! - c.x, n.y! - c.y)));
				largest.set(cluster, Math.max(largest.get(cluster) ?? 0, radiusOf(n)));
			}
		}
		for (const [cluster, r] of reach) reach.set(cluster, r + largest.get(cluster)! + MARGIN);

		// How much each of a cluster's nodes is pushed back by the nodes it pushes out.
		const recoil = new Map<number, Push>();
		for (const n of nodes) {
			const r = radiusOf(n) + CLUSTER_GAP;
			for (const [cluster, c] of centres) {
				if (n.clusters.includes(cluster)) continue;
				let dx = n.x! - c.x;
				let dy = n.y! - c.y;
				let dist = Math.hypot(dx, dy);
				const overlap = reach.get(cluster)! + r - dist;
				if (overlap <= 0) continue;
				if (dist < 1e-6) {
					// On top of the centre: push out in an arbitrary but stable direction.
					dx = Math.cos(cluster);
					dy = Math.sin(cluster);
					dist = 1;
				}
				// Split between the node and the cluster by how many nodes each moves.
				// Capped, as flinging a node far out of one cluster also grows its own.
				const k = (Math.min(overlap, MAX_PUSH) * strength * alpha) / dist / (c.count + 1);
				n.vx! += dx * k * c.count;
				n.vy! += dy * k * c.count;
				const back = recoil.get(cluster);
				if (back) {
					back.x -= dx * k;
					back.y -= dy * k;
				} else {
					recoil.set(cluster, { x: -dx * k, y: -dy * k });
				}
			}
		}

		for (const n of nodes) {
			for (const cluster of n.clusters) {
				const back = recoil.get(cluster);
				if (!back) continue;
				n.vx! += back.x / n.clusters.length;
				n.vy! += back.y / n.clusters.length;
			}
		}
	};
	force.initialize = (n: GraphNode[]) => {
		nodes = n;
	};
	return force;
}

import type { GraphLink, GraphNode } from '../graph/types';
import { crossAxis, type Axis } from './layerForces';
import { layerOrder, nodeLayers } from './layers';

/** Space around each cluster when clusters are laid out separately, in layer gaps. */
const CLUSTER_MARGIN = 1.5;

export interface LayeredOptions {
	/** The axis layers are stacked along. */
	axis: Axis;
	/** 1 when the first layer is at the top or left, -1 when it's at the bottom or right. */
	step: number;
	/** Distance between layers, and between neighbours in a layer. */
	gap: number;
	/** Give each cluster its own layers, and pack the clusters into rows. */
	separateClusters: boolean;
	/** Width over height of the space to fill, used to pack separate clusters. */
	aspect: number;
	/** Passed to `layerOrder`. */
	sweeps?: number;
}

export interface LayeredPlacement {
	/** Position of each node along the layer axis, by id. */
	along: Map<string, number>;
	/** Sorts each layer: nodes in a layer are kept in this order, and apart. */
	order: Map<string, number>;
	/** Where to pull each node across the layers, or null to let it settle freely. */
	across: Map<string, number> | null;
	/** Links that line nodes up across the layers. */
	links: GraphLink[];
}

const endId = (end: GraphNode | string) => (typeof end === 'string' ? end : end.id);
const clusterOf = (n: GraphNode) => n.clusters[0] ?? -1;

/** Where each node goes in the layered layout. */
export function layeredPlacement(
	nodes: GraphNode[],
	links: GraphLink[],
	options: LayeredOptions,
): LayeredPlacement {
	const { axis, step, gap, sweeps } = options;
	const cross = crossAxis(axis);
	const across = (n: GraphNode) => n[cross];
	const clustered = nodes.some((n) => n.clusters.length > 0);

	if (!options.separateClusters || !clustered) {
		const layers = nodeLayers(nodes, links);
		const along = new Map<string, number>();
		for (const [id, layer] of layers) along.set(id, layer * gap * step);
		return { along, order: layerOrder(nodes, links, layers, across, sweeps), across: null, links };
	}

	const groups = new Map<number, GraphNode[]>();
	for (const n of nodes) {
		const group = groups.get(clusterOf(n));
		if (group) group.push(n);
		else groups.set(clusterOf(n), [n]);
	}
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const inGroup = links.filter((l) => {
		const source = byId.get(endId(l.source));
		const target = byId.get(endId(l.target));
		return source && target && clusterOf(source) === clusterOf(target);
	});

	// Lay out each cluster on its own, from the links inside it.
	const boxes = [...groups].map(([cluster, members]) => {
		const ids = new Set(members.map((n) => n.id));
		const own = inGroup.filter((l) => ids.has(endId(l.source)));
		const layers = nodeLayers(members, own);
		const order = layerOrder(members, own, layers, across, sweeps);
		const sizes: number[] = [];
		for (const layer of layers.values()) sizes[layer] = (sizes[layer] ?? 0) + 1;
		return {
			cluster,
			members,
			layers,
			order,
			sizes,
			// Size across and along the layers, with room for the outline and label.
			width: (Math.max(...sizes) - 1 + CLUSTER_MARGIN) * gap,
			height: (sizes.length - 1 + CLUSTER_MARGIN) * gap,
		};
	});

	// Shelf packing: tallest first, filling rows to suit the shape of the space.
	boxes.sort((a, b) => b.height - a.height || a.cluster - b.cluster);
	const area = boxes.reduce((sum, b) => sum + b.width * b.height, 0);
	const rowLength = Math.max(Math.sqrt(area * options.aspect), ...boxes.map((b) => b.width));
	const shelves: { boxes: typeof boxes; width: number; start: number }[] = [];
	let shelf: (typeof shelves)[number] | null = null;
	let shelfStart = 0;
	for (const box of boxes) {
		if (!shelf || shelf.width + box.width > rowLength) {
			if (shelf) shelfStart += Math.max(...shelf.boxes.map((b) => b.height));
			shelf = { boxes: [], width: 0, start: shelfStart };
			shelves.push(shelf);
		}
		shelf.boxes.push(box);
		shelf.width += box.width;
	}

	const along = new Map<string, number>();
	const order = new Map<string, number>();
	const target = new Map<string, number>();
	for (const { boxes, width, start } of shelves) {
		// Each row centred across the layers.
		let left = -width / 2;
		for (const box of boxes) {
			const middle = left + box.width / 2;
			for (const n of box.members) {
				const layer = box.layers.get(n.id) ?? 0;
				const size = box.sizes[layer] ?? 1;
				const place = middle + ((box.order.get(n.id) ?? 0) - (size - 1) / 2) * gap;
				along.set(n.id, (start + layer * gap) * step);
				order.set(n.id, place);
				target.set(n.id, place);
			}
			left += box.width;
		}
	}
	return { along, order, across: target, links: inGroup };
}

import type { TFile, Value } from 'obsidian';
import type { GraphNode } from '../graph/types';

/**
 * Sets each node's cluster from a property, so notes with the same value can be pulled
 * together. Nodes without a value aren't clustered. Returns the clusters' labels.
 */
export function clusterByProperty(
	nodes: GraphNode[],
	valueOf: (file: TFile) => Value | null,
): string[] {
	// Keyed by text rather than Value.looseEquals, which would be quadratic in the number of values.
	const clusters = new Map<string, number>();
	for (const node of nodes) {
		const key = node.file ? valueOf(node.file)?.toString().trim() : '';
		if (!key) {
			node.cluster = -1;
			continue;
		}
		let cluster = clusters.get(key);
		if (cluster === undefined) clusters.set(key, (cluster = clusters.size));
		node.cluster = cluster;
	}
	return [...clusters.keys()];
}

/** Clusters nodes by the base's groups. Returns the clusters' labels. */
export function clusterByGroup(nodes: GraphNode[], groups: string[]): string[] {
	for (const node of nodes) node.cluster = node.group;
	return groups;
}

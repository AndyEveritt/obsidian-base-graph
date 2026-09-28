import type { TFile, Value } from 'obsidian';
import type { ClusterLabel, GraphNode } from '../graph/types';
import { linkParts } from './linkText';

/**
 * Sets each node's cluster from a property, so notes with the same value can be pulled
 * together. Nodes without a value aren't clustered. Returns the clusters' labels.
 */
export function clusterByProperty(
	nodes: GraphNode[],
	valueOf: (file: TFile) => Value | null,
): ClusterLabel[] {
	// Keyed by text rather than Value.looseEquals, which would be quadratic in the number of values.
	const clusters = new Map<string, number>();
	const labels: ClusterLabel[] = [];
	for (const node of nodes) {
		const key = node.file ? valueOf(node.file)?.toString().trim() : '';
		if (!key) {
			node.cluster = -1;
			continue;
		}
		let cluster = clusters.get(key);
		if (cluster === undefined) {
			clusters.set(key, (cluster = clusters.size));
			labels.push({ parts: linkParts(key, node.id) });
		}
		node.cluster = cluster;
	}
	return labels;
}

/** Clusters nodes by the base's groups. Returns the clusters' labels. */
export function clusterByGroup(nodes: GraphNode[], groups: string[]): ClusterLabel[] {
	const sourcePaths: string[] = [];
	for (const node of nodes) {
		node.cluster = node.group;
		if (node.group >= 0) sourcePaths[node.group] ??= node.id;
	}
	return groups.map((group, i) => ({ parts: linkParts(group, sourcePaths[i] ?? '') }));
}

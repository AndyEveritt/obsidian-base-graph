import type { TFile, Value } from 'obsidian';
import type { ClusterLabel, GraphNode } from '../graph/types';
import { linkParts, resolvedText } from './linkText';

/**
 * Sets each node's cluster from a property, so notes with the same value can be pulled
 * together. Links to the same note match however they're written. Nodes without a value
 * aren't clustered. Returns the clusters' labels.
 */
export function clusterByProperty(
	nodes: GraphNode[],
	valueOf: (file: TFile) => Value | null,
	resolveLink: (linkpath: string, sourcePath: string) => string | null,
): ClusterLabel[] {
	// Keyed by text rather than Value.looseEquals, which would be quadratic in the number of values.
	const clusters = new Map<string, number>();
	const labels: ClusterLabel[] = [];
	for (const node of nodes) {
		const text = node.file ? valueOf(node.file)?.toString().trim() : '';
		if (!text) {
			node.clusters = [];
			continue;
		}
		const key = resolvedText(text, (linkpath) => resolveLink(linkpath, node.id));
		let cluster = clusters.get(key);
		if (cluster === undefined) {
			clusters.set(key, (cluster = clusters.size));
			labels.push({ parts: linkParts(text, node.id) });
		}
		node.clusters = [cluster];
	}
	return labels;
}

/**
 * Clusters nodes by the base's groups, one cluster per group. Notes in several groups,
 * from a list, are in each of their groups' clusters. Returns the clusters' labels.
 */
export function clusterByGroup(nodes: GraphNode[], groups: string[]): ClusterLabel[] {
	const sourcePaths: string[] = [];
	for (const node of nodes) {
		node.clusters = node.groups;
		for (const group of node.groups) sourcePaths[group] ??= node.id;
	}
	return groups.map((group, i) => ({ parts: linkParts(group, sourcePaths[i] ?? '') }));
}

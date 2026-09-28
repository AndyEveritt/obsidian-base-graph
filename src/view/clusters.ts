import { parseLinktext, type TFile, type Value } from 'obsidian';
import type { ClusterLabel, GraphNode, LabelPart } from '../graph/types';

const WIKILINK = /\[\[([^\]]+)\]\]/g;

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
			labels.push(clusterLabel(key, node.id));
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
	return groups.map((group, i) => clusterLabel(group, sourcePaths[i] ?? ''));
}

/**
 * A label showing links by their display text, like `NASA, ESA` for `[[NASA]], [[ESA]]`.
 * Each link can be selected to open it, resolved from `sourcePath`.
 */
function clusterLabel(value: string, sourcePath: string): ClusterLabel {
	const parts: LabelPart[] = [];
	let end = 0;
	for (const match of value.matchAll(WIKILINK)) {
		if (match.index > end) parts.push({ text: value.slice(end, match.index), link: null });
		const inner = match[1]!;
		const linktext = inner.split('|')[0]!.trim();
		parts.push({ text: linkDisplay(inner), link: linktext ? { linktext, sourcePath } : null });
		end = match.index + match[0].length;
	}
	if (end < value.length) parts.push({ text: value.slice(end), link: null });
	return { parts };
}

/** The alias if there is one, otherwise the linked note's name without its folder. */
function linkDisplay(inner: string): string {
	const [target = '', alias] = inner.split('|');
	if (alias?.trim()) return alias.trim();
	const { path, subpath } = parseLinktext(target.trim());
	return (path.split('/').pop() ?? path) + subpath;
}

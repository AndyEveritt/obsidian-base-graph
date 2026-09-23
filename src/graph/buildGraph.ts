import type { TFile } from 'obsidian';
import type { GraphViewSettings } from '../view/options';
import type { LinkIndex } from './linkIndex';
import type { GraphData, GraphLink, GraphNode, NodeKind } from './types';

export interface SeedEntry {
	file: TFile;
	group: number;
	/** Label from the label property, if one is configured and set. */
	label: string | null;
	/** Numeric value of the size property, if one is configured and set. */
	size: number | null;
}

export interface BuildInput {
	seeds: SeedEntry[];
	groups: string[];
	index: LinkIndex;
	settings: GraphViewSettings;
	getFile: (path: string) => TFile | null;
}

const UNRESOLVED_PREFIX = 'unresolved:';

export function buildGraph(input: BuildInput): GraphData {
	const { seeds, index, settings, getFile } = input;
	const nodes = new Map<string, GraphNode>();
	let truncated = false;

	const addNode = (
		id: string,
		kind: NodeKind,
		file: TFile | null,
		level: number,
		sourcePath: string,
	): GraphNode => {
		const linktext = file ? file.path : id.slice(UNRESOLVED_PREFIX.length);
		const node: GraphNode = {
			id,
			kind,
			file,
			level,
			sourcePath,
			label: !file ? linktext : kind === 'attachment' ? file.name : file.basename,
			linktext,
			group: -1,
			degree: 0,
			weight: 1,
		};
		nodes.set(id, node);
		return node;
	};

	for (const seed of seeds) {
		if (nodes.has(seed.file.path)) continue;
		const node = addNode(seed.file.path, 'match', seed.file, 0, '');
		node.group = seed.group;
		if (seed.label) node.label = seed.label;
	}
	const matchCount = nodes.size;

	// Breadth-first expansion from the base's results, like the local graph.
	let frontier = [...nodes.keys()];
	expand: for (let level = 1; level <= settings.depth; level++) {
		const next: string[] = [];
		for (const path of frontier) {
			for (const neighbour of neighboursOf(path, index, settings)) {
				if (nodes.has(neighbour)) continue;
				const file = getFile(neighbour);
				if (!file) continue;
				const isAttachment = file.extension !== 'md';
				if (isAttachment && !settings.includeAttachments) continue;
				if (nodes.size >= settings.maxNodes) {
					truncated = true;
					break expand;
				}
				addNode(
					neighbour,
					isAttachment ? 'attachment' : 'neighbour',
					file,
					level,
					path,
				);
				// Attachments are leaves: don't pull in everything that embeds them.
				if (!isAttachment) next.push(neighbour);
			}
		}
		frontier = next;
	}

	const links = new Map<string, GraphLink>();
	const addLink = (source: string, target: string) => {
		if (source === target) return;
		const reverse = links.get(`${target}\n${source}`);
		if (reverse) {
			reverse.mutual = true;
			return;
		}
		const id = `${source}\n${target}`;
		if (!links.has(id)) links.set(id, { id, source, target, mutual: false });
	};

	for (const node of [...nodes.values()]) {
		if (!node.file) continue;
		for (const target of index.outgoing(node.id)) {
			if (nodes.has(target)) addLink(node.id, target);
		}
		if (!settings.showUnresolved) continue;
		for (const linktext of index.unresolved(node.id)) {
			const id = UNRESOLVED_PREFIX + linktext;
			if (!nodes.has(id)) {
				if (nodes.size >= settings.maxNodes) {
					truncated = true;
					continue;
				}
				addNode(id, 'unresolved', null, node.level + 1, node.id);
			}
			addLink(node.id, id);
		}
	}

	for (const link of links.values()) {
		nodes.get(link.source as string)!.degree++;
		nodes.get(link.target as string)!.degree++;
	}

	let nodeList = [...nodes.values()];
	if (!settings.showOrphans) nodeList = nodeList.filter((n) => n.degree > 0);

	assignWeights(nodeList, seeds, settings);

	return {
		nodes: nodeList,
		links: [...links.values()],
		groups: input.groups,
		matchCount,
		truncated,
	};
}

function neighboursOf(
	path: string,
	index: LinkIndex,
	settings: GraphViewSettings,
): string[] {
	const out = settings.direction !== 'incoming' ? index.outgoing(path) : [];
	const inc = settings.direction !== 'outgoing' ? index.incoming(path) : [];
	return out.concat(inc);
}

/** Scale node weights to 1–4 from the size property, or from link count when none is set. */
function assignWeights(
	nodes: GraphNode[],
	seeds: SeedEntry[],
	settings: GraphViewSettings,
): void {
	if (!settings.sizeProperty) {
		for (const node of nodes) node.weight = 1 + Math.sqrt(node.degree) * 0.35;
		return;
	}
	const sizes = new Map<string, number>();
	for (const seed of seeds) {
		if (seed.size !== null) sizes.set(seed.file.path, seed.size);
	}
	const values = [...sizes.values()];
	const min = Math.min(...values);
	const max = Math.max(...values);
	for (const node of nodes) {
		const size = sizes.get(node.id);
		node.weight =
			size === undefined || max <= min ? 1 : 1 + (3 * (size - min)) / (max - min);
	}
}

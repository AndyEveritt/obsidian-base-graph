import type { TFile } from 'obsidian';
import type { GroupResolver } from '../view/groups';
import type { GraphViewSettings } from '../view/options';
import type { Links } from './linkIndex';
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
	groups: GroupResolver;
	index: Links;
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
			cluster: -1,
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
	// `key` is the target as the index knows it: its path, or its link text when unresolved.
	const addLink = (source: string, target: string, key: string) => {
		if (source === target) return;
		const kind = index.kindOf(source, key);
		const count = Math.max(1, index.count(source, key));
		// Links from different properties, such as parent and child, stay separate.
		const reverse = links.get(`${target}\n${source}`);
		if (reverse?.kind === kind) {
			reverse.count += count;
			reverse.mutual = true;
			return;
		}
		const id = `${source}\n${target}`;
		if (!links.has(id)) {
			links.set(id, { id, source, target, kind, mutual: false, count, lane: 0, laneCount: count });
		}
	};

	for (const node of [...nodes.values()]) {
		if (!node.file) continue;
		for (const target of index.outgoing(node.id)) {
			if (nodes.has(target)) addLink(node.id, target, target);
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
			addLink(node.id, id, linktext);
		}
	}

	for (const link of links.values()) {
		nodes.get(link.source as string)!.degree++;
		nodes.get(link.target as string)!.degree++;
	}
	assignLanes([...links.values()]);

	let nodeList = [...nodes.values()];
	if (!settings.showOrphans) nodeList = nodeList.filter((n) => n.degree > 0);

	// Resolved after filtering so hidden notes don't add groups to the legend.
	for (const node of nodeList) {
		if (node.kind === 'neighbour') node.group = input.groups.groupOf(node.file!);
	}

	assignWeights(nodeList, seeds, settings);

	return {
		nodes: nodeList,
		links: [...links.values()],
		groups: input.groups.labels,
		clusters: [],
		linkLabels: settings.linkProperties,
		matchCount,
		truncated,
	};
}

/** Spread links between the same two notes into lanes centred on the line between them. */
function assignLanes(links: GraphLink[]): void {
	const pairs = new Map<string, GraphLink[]>();
	for (const link of links) {
		const [a, b] = [link.source as string, link.target as string].sort();
		const key = `${a}\n${b}`;
		const list = pairs.get(key);
		if (list) list.push(link);
		else pairs.set(key, [link]);
	}
	for (const list of pairs.values()) {
		if (list.length < 2) continue;
		list.sort((x, y) => x.kind - y.kind);
		const laneCount = Math.max(...list.map((l) => l.count));
		list.forEach((link, i) => {
			link.lane = i - (list.length - 1) / 2;
			link.laneCount = laneCount;
		});
	}
}

function neighboursOf(
	path: string,
	index: Links,
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

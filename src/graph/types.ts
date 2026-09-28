import type { TFile } from 'obsidian';
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

export type NodeKind = 'match' | 'neighbour' | 'attachment' | 'unresolved';

export interface GraphNode extends SimulationNodeDatum {
	/** File path, or `unresolved:<linktext>` for links to missing notes. */
	id: string;
	label: string;
	kind: NodeKind;
	/** Existing file, or null for unresolved links. */
	file: TFile | null;
	/** Link text used to create the note when an unresolved node is opened. */
	linktext: string;
	/** Path of a file linking here, used as the source when resolving `linktext`. */
	sourcePath: string;
	/** 0 for notes matched by the base, n for notes n links away. */
	level: number;
	/** Index into `GraphData.groups`, or -1 when the base isn't grouped. */
	group: number;
	/** Nodes sharing a cluster are pulled together, or -1 when not clustered. */
	cluster: number;
	degree: number;
	/** Relative node size: from the size property if set, otherwise from the number of links. */
	weight: number;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
	id: string;
	source: GraphNode | string;
	target: GraphNode | string;
	/** Index into `GraphData.linkLabels` of the property the link came from, or -1 for any other link. */
	kind: number;
	/** Both notes link to each other. */
	mutual: boolean;
	/**
	 * Sideways offset, in gaps between parallel links, when the two notes have several
	 * links between them, such as from different link properties. 0 for a single link.
	 */
	lane: number;
}

export interface ClusterLabel {
	/** The label's text in order: plain text, and links shown by their display text. */
	parts: LabelPart[];
}

export interface LabelPart {
	text: string;
	/** Note to open when this part is selected, if it's a link. */
	link: { linktext: string; sourcePath: string } | null;
}

/** Something selected in the legend: a group's notes, or the links from one link property. */
export interface LegendHighlight {
	type: 'group' | 'link';
	/** Index into `GraphData.groups` or `GraphData.linkLabels`. */
	index: number;
}

export interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
	groups: string[];
	/** Labels of the clusters, indexed by `GraphNode.cluster`. */
	clusters: ClusterLabel[];
	/** Names of the link properties edges are drawn from, or empty when all links are used. */
	linkLabels: string[];
	matchCount: number;
	/** True when neighbour expansion stopped at the node limit. */
	truncated: boolean;
}

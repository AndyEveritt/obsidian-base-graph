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
	degree: number;
	/** Relative node size: from the size property if set, otherwise from the number of links. */
	weight: number;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
	id: string;
	source: GraphNode | string;
	target: GraphNode | string;
	/** Both notes link to each other. */
	mutual: boolean;
}

export interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
	groups: string[];
	matchCount: number;
	/** True when neighbour expansion stopped at the node limit. */
	truncated: boolean;
}

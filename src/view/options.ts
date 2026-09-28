import type {
	BasesAllOptions,
	BasesPropertyId,
	BasesViewConfig,
} from 'obsidian';

export type LinkDirection = 'both' | 'outgoing' | 'incoming';

export interface ForceSettings {
	centerForce: number;
	repelForce: number;
	linkForce: number;
	linkDistance: number;
	clusterForce: number;
}

export interface DisplaySettings {
	nodeSize: number;
	linkThickness: number;
	textFade: number;
	showArrows: boolean;
	clusterOutlines: boolean;
}

export interface GraphViewSettings {
	depth: number;
	direction: LinkDirection;
	includeAttachments: boolean;
	/** Property names to draw links from, or empty to use all links. */
	linkProperties: string[];
	/** Also keep links that aren't from a link property. */
	otherLinks: boolean;
	showUnresolved: boolean;
	showOrphans: boolean;
	maxNodes: number;
	labelProperty: BasesPropertyId | null;
	sizeProperty: BasesPropertyId | null;
	clusterByGroup: boolean;
	/** Null when clustering by group. */
	clusterBy: BasesPropertyId | null;
	height: number;
	display: DisplaySettings;
	forces: ForceSettings;
}

interface SliderSpec {
	min: number;
	max: number;
	step: number;
	default: number;
}

const SLIDERS = {
	depth: { min: 0, max: 5, step: 1, default: 0 },
	maxNodes: { min: 100, max: 5000, step: 100, default: 2000 },
	height: { min: 200, max: 1200, step: 50, default: 400 },
	nodeSize: { min: 0.25, max: 3, step: 0.05, default: 1 },
	linkThickness: { min: 0.25, max: 5, step: 0.25, default: 1 },
	textFade: { min: -3, max: 3, step: 0.1, default: 0 },
	centerForce: { min: 0, max: 1, step: 0.01, default: 0.1 },
	repelForce: { min: 0, max: 20, step: 0.5, default: 10 },
	linkForce: { min: 0, max: 1, step: 0.01, default: 1 },
	linkDistance: { min: 30, max: 500, step: 10, default: 100 },
	clusterForce: { min: 0, max: 1, step: 0.01, default: 0.5 },
} satisfies Record<string, SliderSpec>;

export type SliderKey = keyof typeof SLIDERS;

export const DEPTH_RANGE = SLIDERS.depth;

const DIRECTIONS: Record<LinkDirection, string> = {
	both: 'Links and backlinks',
	outgoing: 'Outgoing links only',
	incoming: 'Backlinks only',
};

function slider(key: SliderKey, displayName: string) {
	return { type: 'slider' as const, key, displayName, ...SLIDERS[key] };
}

export function getViewOptions(config: BasesViewConfig): BasesAllOptions[] {
	const depthIsZero = () => readNumber(config, 'depth') === 0;
	const byGroup = () => readBool(config, 'clusterByGroup', false);
	const allLinks = () => readLinkProperties(config).length === 0;
	const notClustered = () => !byGroup() && !config.getAsPropertyId('clusterBy');
	return [
		slider('depth', 'Depth'),
		{
			type: 'dropdown',
			key: 'direction',
			displayName: 'Follow',
			default: 'both',
			options: DIRECTIONS,
			shouldHide: depthIsZero,
		},
		{
			type: 'toggle',
			key: 'includeAttachments',
			displayName: 'Include attachments',
			default: false,
			shouldHide: depthIsZero,
		},
		{
			type: 'multitext',
			key: 'linkProperties',
			displayName: 'Link properties',
		},
		{
			type: 'toggle',
			key: 'otherLinks',
			displayName: 'Include other links',
			default: false,
			shouldHide: allLinks,
		},
		{
			type: 'toggle',
			key: 'showUnresolved',
			displayName: 'Show unresolved links',
			default: false,
		},
		{
			type: 'toggle',
			key: 'showOrphans',
			displayName: 'Show orphans',
			default: true,
		},
		{
			type: 'property',
			key: 'labelProperty',
			displayName: 'Label property',
			placeholder: 'File name',
		},
		{
			type: 'property',
			key: 'sizeProperty',
			displayName: 'Size property',
			placeholder: 'Number of links',
		},
		{
			type: 'toggle',
			key: 'clusterByGroup',
			displayName: 'Cluster by group',
			default: false,
		},
		{
			type: 'property',
			key: 'clusterBy',
			displayName: 'Cluster by',
			placeholder: 'None',
			shouldHide: byGroup,
		},
		{
			type: 'group',
			displayName: 'Display',
			items: [
				slider('nodeSize', 'Node size'),
				slider('linkThickness', 'Link thickness'),
				slider('textFade', 'Text fade threshold'),
				{
					type: 'toggle',
					key: 'showArrows',
					displayName: 'Arrows',
					default: false,
				},
				{
					type: 'toggle',
					key: 'clusterOutlines',
					displayName: 'Cluster outlines',
					default: true,
					shouldHide: notClustered,
				},
				slider('height', 'Height when embedded'),
				slider('maxNodes', 'Node limit'),
			],
		},
		{
			type: 'group',
			displayName: 'Forces',
			items: [
				slider('centerForce', 'Center force'),
				slider('repelForce', 'Repel force'),
				slider('linkForce', 'Link force'),
				slider('linkDistance', 'Link distance'),
				{ ...slider('clusterForce', 'Cluster force'), shouldHide: notClustered },
			],
		},
	];
}

function readNumber(config: BasesViewConfig, key: SliderKey): number {
	const spec: SliderSpec = SLIDERS[key];
	const raw = config.get(key);
	const value = typeof raw === 'number' ? raw : Number(raw);
	if (raw === undefined || raw === null || raw === '' || !isFinite(value)) {
		return spec.default;
	}
	return Math.min(spec.max, Math.max(spec.min, value));
}

/** Property names, accepting `note.` ids too, without blanks or duplicates. */
function readLinkProperties(config: BasesViewConfig): string[] {
	const raw = config.get('linkProperties');
	const list: unknown[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
	const names = new Map<string, string>();
	for (const item of list) {
		if (typeof item !== 'string') continue;
		const name = item.trim().replace(/^note\./, '');
		if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
	}
	return [...names.values()];
}

function readBool(
	config: BasesViewConfig,
	key: string,
	fallback: boolean,
): boolean {
	const raw = config.get(key);
	return typeof raw === 'boolean' ? raw : fallback;
}

export function readSettings(config: BasesViewConfig): GraphViewSettings {
	const direction = config.get('direction');
	const clusterByGroup = readBool(config, 'clusterByGroup', false);
	return {
		depth: Math.round(readNumber(config, 'depth')),
		direction:
			typeof direction === 'string' && direction in DIRECTIONS
				? (direction as LinkDirection)
				: 'both',
		includeAttachments: readBool(config, 'includeAttachments', false),
		linkProperties: readLinkProperties(config),
		otherLinks: readBool(config, 'otherLinks', false),
		showUnresolved: readBool(config, 'showUnresolved', false),
		showOrphans: readBool(config, 'showOrphans', true),
		maxNodes: readNumber(config, 'maxNodes'),
		labelProperty: config.getAsPropertyId('labelProperty'),
		sizeProperty: config.getAsPropertyId('sizeProperty'),
		clusterByGroup,
		clusterBy: clusterByGroup ? null : config.getAsPropertyId('clusterBy'),
		height: readNumber(config, 'height'),
		display: {
			nodeSize: readNumber(config, 'nodeSize'),
			linkThickness: readNumber(config, 'linkThickness'),
			textFade: readNumber(config, 'textFade'),
			showArrows: readBool(config, 'showArrows', false),
			clusterOutlines: readBool(config, 'clusterOutlines', true),
		},
		forces: {
			centerForce: readNumber(config, 'centerForce'),
			repelForce: readNumber(config, 'repelForce'),
			linkForce: readNumber(config, 'linkForce'),
			linkDistance: readNumber(config, 'linkDistance'),
			clusterForce: readNumber(config, 'clusterForce'),
		},
	};
}

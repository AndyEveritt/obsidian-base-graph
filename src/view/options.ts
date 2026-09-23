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
}

export interface DisplaySettings {
	nodeSize: number;
	linkThickness: number;
	textFade: number;
	showArrows: boolean;
}

export interface GraphViewSettings {
	depth: number;
	direction: LinkDirection;
	includeAttachments: boolean;
	showUnresolved: boolean;
	showOrphans: boolean;
	maxNodes: number;
	labelProperty: BasesPropertyId | null;
	sizeProperty: BasesPropertyId | null;
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
	return {
		depth: Math.round(readNumber(config, 'depth')),
		direction:
			typeof direction === 'string' && direction in DIRECTIONS
				? (direction as LinkDirection)
				: 'both',
		includeAttachments: readBool(config, 'includeAttachments', false),
		showUnresolved: readBool(config, 'showUnresolved', false),
		showOrphans: readBool(config, 'showOrphans', true),
		maxNodes: readNumber(config, 'maxNodes'),
		labelProperty: config.getAsPropertyId('labelProperty'),
		sizeProperty: config.getAsPropertyId('sizeProperty'),
		height: readNumber(config, 'height'),
		display: {
			nodeSize: readNumber(config, 'nodeSize'),
			linkThickness: readNumber(config, 'linkThickness'),
			textFade: readNumber(config, 'textFade'),
			showArrows: readBool(config, 'showArrows', false),
		},
		forces: {
			centerForce: readNumber(config, 'centerForce'),
			repelForce: readNumber(config, 'repelForce'),
			linkForce: readNumber(config, 'linkForce'),
			linkDistance: readNumber(config, 'linkDistance'),
		},
	};
}

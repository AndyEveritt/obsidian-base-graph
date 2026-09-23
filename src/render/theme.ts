export interface ThemeColors {
	fill: string;
	fillFocused: string;
	fillAttachment: string;
	fillUnresolved: string;
	line: string;
	lineHighlight: string;
	text: string;
	arrow: string;
	groups: string[];
	font: string;
}

type ColorKey = Exclude<keyof ThemeColors, 'groups' | 'font'>;

/**
 * The core graph view takes its colours from hidden `.graph-view.color-*`
 * elements, which is what themes style. Reading the same classes makes this
 * graph follow the theme too.
 */
const PROBES: Record<ColorKey, [cls: string, cssVar: string, fallback: string]> = {
	fill: ['color-fill', '--graph-node', '#999'],
	fillFocused: ['color-fill-focused', '--graph-node-focused', '#7f6df2'],
	fillAttachment: ['color-fill-attachment', '--graph-node-attachment', '#b8a300'],
	fillUnresolved: ['color-fill-unresolved', '--graph-node-unresolved', '#666'],
	line: ['color-line', '--graph-line', '#666'],
	lineHighlight: ['color-line-highlight', '--interactive-accent', '#7f6df2'],
	text: ['color-text', '--graph-text', '#ddd'],
	arrow: ['color-arrow', '--graph-line', '#666'],
};

const GROUP_VARS = [
	'--color-blue',
	'--color-orange',
	'--color-green',
	'--color-purple',
	'--color-red',
	'--color-cyan',
	'--color-yellow',
	'--color-pink',
];
const GROUP_FALLBACKS = ['#086ddd', '#ec7500', '#08b94e', '#7852ee', '#e93147', '#00bfbc', '#e0ac00', '#d53984'];

/** Sentinel colour: a probe still showing it wasn't matched by any theme rule. */
const UNSET = 'rgba(1, 2, 3, 0)';

export function readTheme(el: HTMLElement): ThemeColors {
	const style = el.win.getComputedStyle(el);
	const cssVar = (name: string, fallback: string) =>
		style.getPropertyValue(name).trim() || fallback;

	const probe = el.createDiv({ cls: 'base-graph-probe' });
	probe.setCssProps({ color: UNSET });
	const colors = {} as Record<ColorKey, string>;
	for (const key of Object.keys(PROBES) as ColorKey[]) {
		const [cls, name, fallback] = PROBES[key];
		const color = el.win.getComputedStyle(
			probe.createDiv({ cls: `graph-view ${cls}` }),
		).color;
		colors[key] = color && color !== UNSET ? color : cssVar(name, fallback);
	}
	probe.remove();

	return {
		...colors,
		groups: GROUP_VARS.map((name, i) => cssVar(name, GROUP_FALLBACKS[i]!)),
		font: cssVar('--font-interface', style.fontFamily || 'sans-serif'),
	};
}

export function groupColor(theme: ThemeColors, group: number): string {
	return theme.groups[group % theme.groups.length]!;
}

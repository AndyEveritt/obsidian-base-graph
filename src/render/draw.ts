import type { ZoomTransform } from 'd3-zoom';
import type { ClusterLabel, GraphLink, GraphNode } from '../graph/types';
import type { DisplaySettings } from '../view/options';
import { drawClusterLabels, drawClusterShapes, type LabelHit } from './clusterShapes';
import type { Point } from './hull';
import { groupColor, linkColor, type ThemeColors } from './theme';

export interface DrawState {
	nodes: GraphNode[];
	links: GraphLink[];
	transform: ZoomTransform;
	width: number;
	height: number;
	dpr: number;
	theme: ThemeColors;
	display: DisplaySettings;
	/** Hovered or dragged node; it and its neighbours stay bright. */
	focus: GraphNode | null;
	/** Nodes that stay bright while everything else is dimmed, or null when nothing is dimmed. */
	focusSet: Set<GraphNode> | null;
	/** Link property whose links are highlighted, with the notes at their ends in `focusSet`. */
	highlightKind: number | null;
	/** Labels of the clusters, indexed by `GraphNode.cluster`. */
	clusterLabels: ClusterLabel[];
	/** Link in a cluster label that's hovered; it's underlined to show it can be selected. */
	hoveredLabel: { cluster: number; part: number } | null;
}

const DIMMED = 0.15;
const LABEL_SIZE = 12;

export function nodeRadius(node: GraphNode, display: DisplaySettings): number {
	return 5 * display.nodeSize * node.weight;
}

/** Draws the graph, returning where the cluster labels that can be selected were drawn. */
export function drawGraph(ctx: CanvasRenderingContext2D, s: DrawState): LabelHit[] {
	const { transform: t, dpr, theme, display, focus, focusSet, highlightKind } = s;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, s.width, s.height);
	ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);

	const radiusOf = (node: GraphNode) => nodeRadius(node, display);
	const clusters = display.clusterOutlines ? drawClusterShapes(ctx, s, radiusOf) : [];

	const lineWidth = Math.max(display.linkThickness, 0.4 / t.k);
	// With a focused node only its own links are highlighted, not those between its neighbours.
	const isHighlighted: ((l: GraphLink) => boolean) | null = focus
		? (l) => l.source === focus || l.target === focus
		: highlightKind !== null
			? (l) => l.kind === highlightKind
			: focusSet
				? (l) => focusSet.has(l.source as GraphNode) && focusSet.has(l.target as GraphNode)
				: null;

	ctx.lineWidth = lineWidth;
	ctx.globalAlpha = isHighlighted ? DIMMED : 1;
	const rest = isHighlighted ? s.links.filter((l) => !isHighlighted(l)) : s.links;
	drawLinksByKind(ctx, s, rest, theme.line, theme.arrow);
	if (isHighlighted) {
		ctx.globalAlpha = 1;
		const highlighted = s.links.filter(isHighlighted);
		drawLinksByKind(ctx, s, highlighted, theme.lineHighlight, theme.lineHighlight);
	}

	for (const node of s.nodes) {
		const { color, alpha } = nodeStyle(node, theme);
		ctx.globalAlpha = focusSet && !focusSet.has(node) ? alpha * DIMMED : alpha;
		ctx.fillStyle = node === focus ? theme.fillFocused : color;
		ctx.beginPath();
		ctx.arc(node.x!, node.y!, nodeRadius(node, display), 0, 2 * Math.PI);
		ctx.fill();
	}

	drawLabels(ctx, s);
	const hits = drawClusterLabels(ctx, s, clusters);
	ctx.globalAlpha = 1;
	return hits;
}

/**
 * Links from a link property in that property's colour, and other links in the given
 * colours, batched so each colour is a single path.
 */
function drawLinksByKind(
	ctx: CanvasRenderingContext2D,
	s: DrawState,
	links: GraphLink[],
	line: string,
	arrow: string,
): void {
	const byKind = new Map<number, GraphLink[]>();
	for (const link of links) {
		const list = byKind.get(link.kind);
		if (list) list.push(link);
		else byKind.set(link.kind, [link]);
	}
	for (const [kind, list] of byKind) {
		const color = kind >= 0 ? linkColor(s.theme, kind) : null;
		ctx.strokeStyle = color ?? line;
		ctx.fillStyle = color ?? arrow;
		drawLinks(ctx, s, list);
	}
}

function drawLinks(
	ctx: CanvasRenderingContext2D,
	s: DrawState,
	links: GraphLink[],
): void {
	const size = 3 + 2 * ctx.lineWidth;
	// Wide enough for arrowheads on parallel links not to overlap.
	const gap = size * 1.2;
	const lines = links.map((link) => linkLine(link, gap));

	ctx.beginPath();
	for (const [a, b] of lines) {
		ctx.moveTo(a[0], a[1]);
		ctx.lineTo(b[0], b[1]);
	}
	ctx.stroke();

	if (!s.display.showArrows) return;
	ctx.beginPath();
	links.forEach((link, i) => {
		const [a, b] = lines[i]!;
		const offset = link.lane * gap;
		const source = link.source as GraphNode;
		const target = link.target as GraphNode;
		arrowHead(ctx, a, b, insetFor(nodeRadius(target, s.display), offset), size);
		if (link.mutual) arrowHead(ctx, b, a, insetFor(nodeRadius(source, s.display), offset), size);
	});
	ctx.fill();
}

/** A link's end points, shifted sideways by its lane so parallel links don't overlap. */
function linkLine(link: GraphLink, gap: number): [Point, Point] {
	const a = link.source as GraphNode;
	const b = link.target as GraphNode;
	if (!link.lane) return [[a.x!, a.y!], [b.x!, b.y!]];
	// Shift relative to a fixed order of the two notes, so every link between them shares one side.
	const [p, q] = a.id < b.id ? [a, b] : [b, a];
	const dx = q.x! - p.x!;
	const dy = q.y! - p.y!;
	const len = Math.hypot(dx, dy) || 1;
	const ox = (-dy / len) * link.lane * gap;
	const oy = (dx / len) * link.lane * gap;
	return [
		[a.x! + ox, a.y! + oy],
		[b.x! + ox, b.y! + oy],
	];
}

/** How far back from the end of a line shifted sideways by `offset` it meets a node's edge. */
function insetFor(radius: number, offset: number): number {
	return Math.sqrt(Math.max(0, radius * radius - offset * offset));
}

/** An arrowhead pointing along `from` → `to`, with its tip `inset` back from `to`. */
function arrowHead(
	ctx: CanvasRenderingContext2D,
	from: Point,
	to: Point,
	inset: number,
	size: number,
): void {
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	const len = Math.hypot(dx, dy);
	if (len <= inset + size) return;
	const ux = dx / len;
	const uy = dy / len;
	const tipX = to[0] - ux * inset;
	const tipY = to[1] - uy * inset;
	const baseX = tipX - ux * size;
	const baseY = tipY - uy * size;
	const half = size * 0.5;
	ctx.moveTo(tipX, tipY);
	ctx.lineTo(baseX - uy * half, baseY + ux * half);
	ctx.lineTo(baseX + uy * half, baseY - ux * half);
	ctx.closePath();
}

function nodeStyle(
	node: GraphNode,
	theme: ThemeColors,
): { color: string; alpha: number } {
	switch (node.kind) {
		case 'match':
			return {
				color: node.group >= 0 ? groupColor(theme, node.group) : theme.fill,
				alpha: 1,
			};
		case 'neighbour':
			return {
				color: node.group >= 0 ? groupColor(theme, node.group) : theme.fill,
				alpha: 0.45,
			};
		case 'attachment':
			return { color: theme.fillAttachment, alpha: 0.6 };
		case 'unresolved':
			return { color: theme.fillUnresolved, alpha: 0.6 };
	}
}

/** Labels are drawn at a fixed screen size and fade out as you zoom out. */
function drawLabels(ctx: CanvasRenderingContext2D, s: DrawState): void {
	const { transform: t, dpr, focus, focusSet } = s;
	const fullAt = Math.pow(2, s.display.textFade);
	const fade = Math.min(1, Math.max(0, (t.k / fullAt - 0.6) / 0.4));
	if (fade === 0 && !focusSet) return;

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.font = `${LABEL_SIZE}px ${s.theme.font}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	ctx.fillStyle = s.theme.text;

	for (const node of s.nodes) {
		let alpha = fade;
		if (focusSet) alpha = focusSet.has(node) ? 1 : fade * DIMMED;
		if (node === focus) alpha = 1;
		if (alpha < 0.01) continue;

		const x = node.x! * t.k + t.x;
		const y = (node.y! + nodeRadius(node, s.display)) * t.k + t.y + 4;
		if (x < -200 || x > s.width + 200 || y < -20 || y > s.height + 20) continue;
		ctx.globalAlpha = alpha;
		ctx.fillText(node.label, x, y);
	}
}

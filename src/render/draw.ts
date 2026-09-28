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
	/** Labels of the clusters, indexed by `GraphNode.clusters`. */
	clusterLabels: ClusterLabel[];
	/** Radii of the depth rings to draw as guides, or empty when not using the ring layout. */
	rings: number[];
	/** Link in a cluster label that's hovered; it's underlined to show it can be selected. */
	hoveredLabel: { cluster: number; part: number } | null;
}

const DIMMED = 0.15;
const RING_ALPHA = 0.35;
const LABEL_SIZE = 12;
/** Repeated links grow with the square root of their count, up to this many times as thick. */
const MAX_LINK_SCALE = 4;

export function nodeRadius(node: GraphNode, display: DisplaySettings): number {
	return 5 * display.nodeSize * node.weight;
}

/** How much thicker, stronger and shorter a link is for the number of times its notes link. */
export function linkScale(count: number, display: DisplaySettings): number {
	return display.scaleLinksByCount ? Math.min(Math.sqrt(count), MAX_LINK_SCALE) : 1;
}

/** Draws the graph, returning where the cluster labels that can be selected were drawn. */
export function drawGraph(ctx: CanvasRenderingContext2D, s: DrawState): LabelHit[] {
	const { transform: t, dpr, theme, display, focus, focusSet, highlightKind } = s;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, s.width, s.height);
	ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);

	drawRings(ctx, s);
	const radiusOf = (node: GraphNode) => nodeRadius(node, display);
	const clusters = display.clusterOutlines ? drawClusterShapes(ctx, s, radiusOf) : [];

	// With a focused node only its own links are highlighted, not those between its neighbours.
	const isHighlighted: ((l: GraphLink) => boolean) | null = focus
		? (l) => l.source === focus || l.target === focus
		: highlightKind !== null
			? (l) => l.kind === highlightKind
			: focusSet
				? (l) => focusSet.has(l.source as GraphNode) && focusSet.has(l.target as GraphNode)
				: null;

	// Only what's in view is drawn.
	const view = viewBounds(s);
	const links = s.links.filter((l) => linkInView(s, view, l));

	ctx.globalAlpha = (isHighlighted ? DIMMED : 1) * display.linkOpacity;
	const rest = isHighlighted ? links.filter((l) => !isHighlighted(l)) : links;
	drawLinksByKind(ctx, s, rest, theme.line, theme.arrow);
	if (isHighlighted) {
		ctx.globalAlpha = 1;
		const highlighted = links.filter(isHighlighted);
		drawLinksByKind(ctx, s, highlighted, theme.lineHighlight, theme.lineHighlight);
	}

	for (const node of s.nodes) {
		const radius = nodeRadius(node, display);
		if (!inView(view, node.x!, node.y!, node.x!, node.y!, radius)) continue;
		const { colors, alpha } = nodeStyle(node, theme);
		ctx.globalAlpha = focusSet && !focusSet.has(node) ? alpha * DIMMED : alpha;
		drawNode(ctx, node, radius, node === focus ? [theme.fillFocused] : colors);
	}

	drawLabels(ctx, s);
	const hits = drawClusterLabels(ctx, s, clusters);
	ctx.globalAlpha = 1;
	return hits;
}

interface Bounds {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** The part of the graph on screen, in graph coordinates. */
function viewBounds(s: DrawState): Bounds {
	const { x, y, k } = s.transform;
	return { left: -x / k, top: -y / k, right: (s.width - x) / k, bottom: (s.height - y) / k };
}

/** Whether the line from a to b, grown by `pad` all round, may be in view. */
function inView(v: Bounds, ax: number, ay: number, bx: number, by: number, pad: number): boolean {
	return !(
		Math.max(ax, bx) < v.left - pad ||
		Math.min(ax, bx) > v.right + pad ||
		Math.max(ay, by) < v.top - pad ||
		Math.min(ay, by) > v.bottom + pad
	);
}

/** Links run between node centres, shifted sideways by their lane, with arrowheads inside that line's ends. */
function linkInView(s: DrawState, v: Bounds, link: GraphLink): boolean {
	const a = link.source as GraphNode;
	const b = link.target as GraphNode;
	const pad = Math.abs(link.lane) * laneGap(s, link) + arrowSize(linkWidth(s, link.count)) / 2;
	return inView(v, a.x!, a.y!, b.x!, b.y!, pad);
}

/** Faint dashed circles marking the depth rings, at a fixed screen width. */
function drawRings(ctx: CanvasRenderingContext2D, s: DrawState): void {
	const k = s.transform.k;
	ctx.globalAlpha = RING_ALPHA;
	ctx.strokeStyle = s.theme.line;
	ctx.lineWidth = 1 / k;
	ctx.setLineDash([4 / k, 4 / k]);
	ctx.beginPath();
	for (const radius of s.rings) {
		if (radius <= 0) continue;
		ctx.moveTo(radius, 0);
		ctx.arc(0, 0, radius, 0, 2 * Math.PI);
	}
	ctx.stroke();
	ctx.setLineDash([]);
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
	const widths = links.map((link) => linkWidth(s, link.count));
	const gaps = links.map((link) => laneGap(s, link));
	const lines = links.map((link, i) => linkLine(link, gaps[i]!));

	// One path per width, so links of the same width are still stroked together.
	const byWidth = new Map<number, number[]>();
	widths.forEach((width, i) => {
		const list = byWidth.get(width);
		if (list) list.push(i);
		else byWidth.set(width, [i]);
	});
	for (const [width, indices] of byWidth) {
		ctx.lineWidth = width;
		// Chrome strokes a path of many lines wider than a pixel far slower than the same
		// lines one at a time, so only hairlines are stroked together.
		const together = width * s.transform.k * s.dpr <= 1;
		ctx.beginPath();
		for (const i of indices) {
			const [a, b] = lines[i]!;
			ctx.moveTo(a[0], a[1]);
			ctx.lineTo(b[0], b[1]);
			if (!together) {
				ctx.stroke();
				ctx.beginPath();
			}
		}
		if (together) ctx.stroke();
	}

	if (!s.display.showArrows) return;
	ctx.beginPath();
	links.forEach((link, i) => {
		const [a, b] = lines[i]!;
		const offset = link.lane * gaps[i]!;
		const size = arrowSize(widths[i]!);
		const source = link.source as GraphNode;
		const target = link.target as GraphNode;
		arrowHead(ctx, a, b, insetFor(nodeRadius(target, s.display), offset), size);
		if (link.mutual) arrowHead(ctx, b, a, insetFor(nodeRadius(source, s.display), offset), size);
	});
	ctx.fill();
}

/** A link's width from the thickness setting, and from its count when repeated links are thicker. */
function linkWidth(s: DrawState, count: number): number {
	// At least 0.4 screen pixels, however far out the graph is zoomed.
	const base = Math.max(s.display.linkThickness, 0.4 / s.transform.k);
	return base * linkScale(count, s.display);
}

function arrowSize(width: number): number {
	return 3 + 2 * width;
}

/** Gap between parallel links, wide enough for the arrowheads of the thickest of them not to overlap. */
function laneGap(s: DrawState, link: GraphLink): number {
	return arrowSize(linkWidth(s, link.laneCount)) * 1.2;
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

/** A node's circle, split into equal slices when it has several colours, starting from the top. */
function drawNode(
	ctx: CanvasRenderingContext2D,
	node: GraphNode,
	radius: number,
	colors: string[],
): void {
	const x = node.x!;
	const y = node.y!;
	if (colors.length === 1) {
		ctx.fillStyle = colors[0]!;
		ctx.beginPath();
		ctx.arc(x, y, radius, 0, 2 * Math.PI);
		ctx.fill();
		return;
	}
	const slice = (2 * Math.PI) / colors.length;
	colors.forEach((color, i) => {
		const start = -Math.PI / 2 + i * slice;
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.arc(x, y, radius, start, start + slice);
		ctx.closePath();
		ctx.fill();
	});
}

function nodeStyle(
	node: GraphNode,
	theme: ThemeColors,
): { colors: string[]; alpha: number } {
	switch (node.kind) {
		case 'match':
			return { colors: groupColors(node, theme), alpha: 1 };
		case 'neighbour':
			return { colors: groupColors(node, theme), alpha: 0.45 };
		case 'attachment':
			return { colors: [theme.fillAttachment], alpha: 0.6 };
		case 'unresolved':
			return { colors: [theme.fillUnresolved], alpha: 0.6 };
	}
}

function groupColors(node: GraphNode, theme: ThemeColors): string[] {
	return node.groups.length > 0 ? node.groups.map((g) => groupColor(theme, g)) : [theme.fill];
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

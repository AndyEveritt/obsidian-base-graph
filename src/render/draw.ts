import type { ZoomTransform } from 'd3-zoom';
import type { GraphLink, GraphNode } from '../graph/types';
import type { DisplaySettings } from '../view/options';
import { groupColor, type ThemeColors } from './theme';

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
	focusSet: Set<GraphNode> | null;
}

const DIMMED = 0.15;
const LABEL_SIZE = 12;

export function nodeRadius(node: GraphNode, display: DisplaySettings): number {
	return 5 * display.nodeSize * node.weight;
}

export function drawGraph(ctx: CanvasRenderingContext2D, s: DrawState): void {
	const { transform: t, dpr, theme, display, focus, focusSet } = s;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, s.width, s.height);
	ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);

	const lineWidth = Math.max(display.linkThickness, 0.4 / t.k);
	const touchesFocus = (l: GraphLink) => l.source === focus || l.target === focus;

	ctx.lineWidth = lineWidth;
	ctx.strokeStyle = theme.line;
	ctx.fillStyle = theme.arrow;
	ctx.globalAlpha = focus ? DIMMED : 1;
	drawLinks(ctx, s, focus ? s.links.filter((l) => !touchesFocus(l)) : s.links);
	if (focus) {
		ctx.globalAlpha = 1;
		ctx.strokeStyle = theme.lineHighlight;
		ctx.fillStyle = theme.lineHighlight;
		drawLinks(ctx, s, s.links.filter(touchesFocus));
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
	ctx.globalAlpha = 1;
}

function drawLinks(
	ctx: CanvasRenderingContext2D,
	s: DrawState,
	links: GraphLink[],
): void {
	ctx.beginPath();
	for (const link of links) {
		const a = link.source as GraphNode;
		const b = link.target as GraphNode;
		ctx.moveTo(a.x!, a.y!);
		ctx.lineTo(b.x!, b.y!);
	}
	ctx.stroke();

	if (!s.display.showArrows) return;
	const size = 3 + 2 * ctx.lineWidth;
	ctx.beginPath();
	for (const link of links) {
		const a = link.source as GraphNode;
		const b = link.target as GraphNode;
		arrowHead(ctx, a, b, nodeRadius(b, s.display), size);
		if (link.mutual) arrowHead(ctx, b, a, nodeRadius(a, s.display), size);
	}
	ctx.fill();
}

function arrowHead(
	ctx: CanvasRenderingContext2D,
	from: GraphNode,
	to: GraphNode,
	radius: number,
	size: number,
): void {
	const dx = to.x! - from.x!;
	const dy = to.y! - from.y!;
	const len = Math.hypot(dx, dy);
	if (len <= radius + size) return;
	const ux = dx / len;
	const uy = dy / len;
	const tipX = to.x! - ux * radius;
	const tipY = to.y! - uy * radius;
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
			return { color: theme.fill, alpha: 0.45 };
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

import type { ClusterLabel, GraphNode, LabelPart } from '../graph/types';
import type { DrawState } from './draw';
import { convexHull, roundedHullTop, traceRoundedHull, type Point } from './hull';
import { groupColor, type ThemeColors } from './theme';

const OUTLINE_ALPHA = 0.4;
const FILL_ALPHA = 0.06;
const LABEL_ALPHA = 0.8;
const LABEL_SIZE = 11;
/** Screen pixels between the top of a cluster's outline and its label. */
const LABEL_GAP = 3;
/** Space between a cluster's outermost nodes and its outline, in graph units. */
const MARGIN = 14;
/** How much closer than the margin the outline may come to a node, to round off corners. */
const SLACK = 10;

export interface ClusterShape {
	cluster: number;
	label: ClusterLabel;
	/** The cluster's group colour, or null when it has none. */
	color: string | null;
	/** Top of the outline, in graph coordinates. */
	top: Point;
}

/**
 * Draws a faint rounded outline and background around each cluster, and returns
 * where each one's label goes. Clusters of a single node are left out.
 */
export function drawClusterShapes(
	ctx: CanvasRenderingContext2D,
	s: DrawState,
	radiusOf: (node: GraphNode) => number,
): ClusterShape[] {
	const clusters = new Map<number, GraphNode[]>();
	for (const node of s.nodes) {
		if (node.cluster < 0) continue;
		const members = clusters.get(node.cluster);
		if (members) members.push(node);
		else clusters.set(node.cluster, [node]);
	}

	const shapes: ClusterShape[] = [];
	ctx.lineWidth = 1.5 / s.transform.k;
	for (const [cluster, members] of clusters) {
		if (members.length < 2) continue;
		let radius = 0;
		for (const node of members) radius = Math.max(radius, radiusOf(node));
		const hull = convexHull(members.map((n): Point => [n.x!, n.y!]));
		const pad = radius + MARGIN;
		const color = clusterColor(members, s.theme);

		traceRoundedHull(ctx, hull, pad, SLACK);
		ctx.globalAlpha = FILL_ALPHA;
		ctx.fillStyle = color ?? s.theme.line;
		ctx.fill();
		ctx.globalAlpha = OUTLINE_ALPHA;
		ctx.strokeStyle = color ?? s.theme.line;
		ctx.stroke();

		const label = s.clusterLabels[cluster];
		if (label?.parts.length) shapes.push({ cluster, label, color, top: roundedHullTop(hull, pad, SLACK) });
	}
	return shapes;
}

/** A link in a cluster label, and where it was drawn, in screen pixels. */
export interface LabelHit {
	cluster: number;
	/** Index into the label's parts. */
	part: number;
	link: NonNullable<LabelPart['link']>;
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/**
 * Each cluster's label, centred just above its outline at a fixed screen size. Links in
 * labels are underlined while hovered. Returns where those links are.
 */
export function drawClusterLabels(
	ctx: CanvasRenderingContext2D,
	s: DrawState,
	shapes: ClusterShape[],
): LabelHit[] {
	const hits: LabelHit[] = [];
	if (shapes.length === 0) return hits;
	const { transform: t, dpr } = s;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.font = `${LABEL_SIZE}px ${s.theme.font}`;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'bottom';
	ctx.globalAlpha = LABEL_ALPHA;
	ctx.lineWidth = 1;
	const hovered = s.hoveredLabel;
	for (const { cluster, label, color, top } of shapes) {
		const widths = label.parts.map((p) => ctx.measureText(p.text).width);
		let x = top[0] * t.k + t.x - widths.reduce((a, b) => a + b, 0) / 2;
		const y = top[1] * t.k + t.y - LABEL_GAP;
		ctx.fillStyle = color ?? s.theme.text;
		ctx.strokeStyle = ctx.fillStyle;
		label.parts.forEach(({ text, link }, part) => {
			const width = widths[part]!;
			ctx.fillText(text, x, y);
			if (link) {
				hits.push({ cluster, part, link, left: x, top: y - LABEL_SIZE, right: x + width, bottom: y });
				if (hovered?.cluster === cluster && hovered.part === part) {
					ctx.beginPath();
					ctx.moveTo(x, y + 0.5);
					ctx.lineTo(x + width, y + 0.5);
					ctx.stroke();
				}
			}
			x += width;
		});
	}
	return hits;
}

/** The group's colour when the cluster's grouped notes are all in one group. */
function clusterColor(members: GraphNode[], theme: ThemeColors): string | null {
	let group = -1;
	for (const node of members) {
		if (node.group < 0 || node.group === group) continue;
		if (group >= 0) return null;
		group = node.group;
	}
	return group >= 0 ? groupColor(theme, group) : null;
}

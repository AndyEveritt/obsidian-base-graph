export type Point = [x: number, y: number];

/** Convex hull, counter-clockwise, using Andrew's monotone chain. */
export function convexHull(points: Point[]): Point[] {
	const sorted = points
		.slice()
		.sort((a, b) => a[0] - b[0] || a[1] - b[1])
		.filter((p, i, all) => i === 0 || p[0] !== all[i - 1]![0] || p[1] !== all[i - 1]![1]);
	if (sorted.length < 3) return sorted;

	const cross = (o: Point, a: Point, b: Point) =>
		(a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const chain = (pts: Point[]) => {
		const out: Point[] = [];
		for (const p of pts) {
			while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) {
				out.pop();
			}
			out.push(p);
		}
		out.pop();
		return out;
	};
	return chain(sorted).concat(chain(sorted.reverse()));
}

/**
 * Traces a smooth outline around a hull: its edges pushed out by `pad`, joined at each
 * corner by an arc. Each arc is made as wide as it can be without coming more than
 * `slack` closer than `pad` to the corner's point, or overlapping the next corner's arc,
 * so wide corners become gentle curves rather than a tight turn around the point.
 */
export function traceRoundedHull(
	ctx: CanvasRenderingContext2D,
	hull: Point[],
	pad: number,
	slack: number,
): void {
	ctx.beginPath();
	if (hull.length === 1) {
		ctx.arc(hull[0]![0], hull[0]![1], pad, 0, 2 * Math.PI);
		return;
	}
	// Outward normal of an edge in a counter-clockwise hull.
	const normalAngle = (a: Point, b: Point) => Math.atan2(a[0] - b[0], b[1] - a[1]);
	const n = hull.length;
	for (let i = 0; i < n; i++) {
		const prev = hull[(i + n - 1) % n]!;
		const vertex = hull[i]!;
		const next = hull[(i + 1) % n]!;
		const [cx, cy, extra] =
			n < 3 ? [vertex[0], vertex[1], 0] : cornerCircle(prev, vertex, next, slack);
		ctx.arc(cx, cy, pad + extra, normalAngle(prev, vertex), normalAngle(vertex, next));
	}
	ctx.closePath();
}

/** Topmost point of the outline `traceRoundedHull` draws. */
export function roundedHullTop(hull: Point[], pad: number, slack: number): Point {
	let top = 0;
	for (let i = 1; i < hull.length; i++) if (hull[i]![1] < hull[top]![1]) top = i;
	const vertex = hull[top]!;
	const n = hull.length;
	if (n < 3) return [vertex[0], vertex[1] - pad];
	// Both edges fall away from the top corner, so the top of its arc is the top of the outline.
	const [cx, cy, extra] = cornerCircle(hull[(top + n - 1) % n]!, vertex, hull[(top + 1) % n]!, slack);
	return [cx, cy - pad - extra];
}

/**
 * Centre and extra radius of the arc rounding the hull's corner at `v`. Rounding the
 * corner with radius r puts the outline r * (1 / sin(half angle) - 1) closer to `v`,
 * and uses r / tan(half angle) of each edge, which may take up to half of it.
 */
function cornerCircle(
	a: Point,
	v: Point,
	b: Point,
	slack: number,
): [x: number, y: number, extra: number] {
	const toA: Point = [a[0] - v[0], a[1] - v[1]];
	const toB: Point = [b[0] - v[0], b[1] - v[1]];
	const lenA = Math.hypot(...toA);
	const lenB = Math.hypot(...toB);
	const cos = (toA[0] * toB[0] + toA[1] * toB[1]) / (lenA * lenB);
	const half = Math.acos(Math.min(1, Math.max(-1, cos))) / 2;
	const sin = Math.sin(half);
	const tan = Math.tan(half);
	const r = Math.min(slack / (1 / sin - 1), (Math.min(lenA, lenB) / 2) * tan);
	if (!(r > 0) || !isFinite(r)) return [v[0], v[1], 0];
	// The centre lies inwards along the bisector of the two edges.
	const bx = toA[0] / lenA + toB[0] / lenB;
	const by = toA[1] / lenA + toB[1] / lenB;
	const blen = Math.hypot(bx, by);
	const d = r / sin;
	return [v[0] + (bx / blen) * d, v[1] + (by / blen) * d, r];
}

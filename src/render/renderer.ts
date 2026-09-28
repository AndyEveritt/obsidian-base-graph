import {
	forceCollide,
	forceLink,
	forceManyBody,
	forceRadial,
	forceSimulation,
	forceX,
	forceY,
	type Simulation,
} from 'd3-force';
import { select } from 'd3-selection';
import {
	zoom,
	zoomIdentity,
	type D3ZoomEvent,
	type ZoomBehavior,
	type ZoomTransform,
} from 'd3-zoom';
import type {
	ClusterLabel,
	GraphData,
	GraphLink,
	GraphNode,
	LegendHighlight,
} from '../graph/types';
import type { DisplaySettings, ForceSettings } from '../view/options';
import { forceCluster } from './clusterForce';
import type { LabelHit } from './clusterShapes';
import { drawGraph, linkScale, nodeRadius } from './draw';
import { ringRadii } from './rings';
import { readTheme, type ThemeColors } from './theme';

export interface RendererCallbacks {
	open(node: GraphNode, evt: MouseEvent): void;
	/** Called when the hovered node changes, with null when the pointer leaves it. */
	hover(node: GraphNode | null, evt: MouseEvent | null): void;
	contextMenu(node: GraphNode, evt: MouseEvent): void;
	/** Open a note linked from a cluster label. */
	openLink(linktext: string, sourcePath: string, evt: MouseEvent): void;
}

interface DragState {
	node: GraphNode;
	pointerId: number;
	startX: number;
	startY: number;
	moved: boolean;
}

const SCALE_EXTENT: [number, number] = [0.05, 8];
const FIT_PADDING = 30;
const DRAG_THRESHOLD = 4;
/** Strong enough to keep nodes near their ring, while links still pull them round it. */
const RING_STRENGTH = 0.8;

/** Canvas force-directed graph with zoom, pan, drag, hover and click. */
export class GraphRenderer {
	readonly canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private simulation: Simulation<GraphNode, GraphLink>;
	private zoomBehavior: ZoomBehavior<HTMLCanvasElement, unknown>;
	private transform: ZoomTransform = zoomIdentity;
	/** Colours read from the current theme. */
	theme: ThemeColors;

	private nodes: GraphNode[] = [];
	private links: GraphLink[] = [];
	private clusterLabels: ClusterLabel[] = [];
	/** Ring radius for each depth level in the ring layout, or empty in the free layout. */
	private rings: number[] = [];
	/** Cluster labels that link to a note, where the last frame drew them. */
	private labelHits: LabelHit[] = [];
	private hoveredLabel: LabelHit | null = null;
	private adjacency = new Map<GraphNode, Set<GraphNode>>();

	private width = 0;
	private height = 0;
	private dpr = 1;
	private hovered: GraphNode | null = null;
	/** Node that stays highlighted when nothing else is hovered or highlighted. */
	private pinnedNode: GraphNode | null = null;
	/** Legend item hovered or locked; its group's nodes, or its property's links, stay bright. */
	private legendHighlight: LegendHighlight | null = null;
	private drag: DragState | null = null;
	/** Keep the camera fitted to the graph until the user pans or zooms. */
	private autoFit = true;
	private frame = 0;
	private resizeObserver: ResizeObserver;
	private cleanup: (() => void)[] = [];

	constructor(
		private parentEl: HTMLElement,
		private display: DisplaySettings,
		private forces: ForceSettings,
		private callbacks: RendererCallbacks,
	) {
		this.canvas = parentEl.createEl('canvas', { cls: 'base-graph-canvas' });
		this.ctx = this.canvas.getContext('2d')!;
		this.theme = readTheme(parentEl);

		this.simulation = forceSimulation<GraphNode, GraphLink>()
			.alphaDecay(0.03)
			.on('tick', () => this.onTick());
		this.applyForces();

		this.zoomBehavior = zoom<HTMLCanvasElement, unknown>()
			.scaleExtent(SCALE_EXTENT)
			.filter((evt: Event) => this.zoomFilter(evt))
			.on('zoom', (evt: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
				this.transform = evt.transform;
				if (evt.sourceEvent) this.autoFit = false;
				this.scheduleDraw();
			});
		select(this.canvas)
			.call(this.zoomBehavior)
			.on('dblclick.zoom', null);

		this.listen('pointerdown', (e) => this.onPointerDown(e));
		this.listen('pointermove', (e) => this.onPointerMove(e));
		this.listen('pointerup', (e) => this.onPointerUp(e, true));
		this.listen('pointercancel', (e) => this.onPointerUp(e, false));
		this.listen('pointerleave', () => {
			this.setHovered(null);
			this.setHoveredLabel(null);
		});
		this.listen('contextmenu', (e) => this.onContextMenu(e));
		// d3-zoom suppresses the click after a pan, so this only fires for a plain click.
		this.listen('click', (e) => {
			// A node under the pointer was already opened on pointerup.
			if (this.nodeAt(e)) return;
			const label = this.labelAt(e);
			if (label) this.callbacks.openLink(label.link.linktext, label.link.sourcePath, e);
			else if (this.pinnedNode) this.pin(null);
		});

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(parentEl);
		this.resize();
	}

	setData(data: GraphData, reheat: boolean): void {
		const previous = new Map(this.nodes.map((n) => [n.id, n]));
		const next = new Map(data.nodes.map((n) => [n.id, n]));

		for (const node of data.nodes) {
			const old = previous.get(node.id);
			if (!old) continue;
			node.x = old.x;
			node.y = old.y;
			node.vx = old.vx;
			node.vy = old.vy;
			node.fx = old.fx;
			node.fy = old.fy;
		}
		// Start new nodes next to something they link to, so updates don't fly in from the centre.
		for (const link of data.links) {
			const a = next.get(link.source as string);
			const b = next.get(link.target as string);
			if (!a || !b) continue;
			const [placed, unplaced] = a.x === undefined ? [b, a] : [a, b];
			if (placed.x !== undefined && unplaced.x === undefined) {
				unplaced.x = placed.x + (Math.random() - 0.5) * 40;
				unplaced.y = placed.y! + (Math.random() - 0.5) * 40;
			}
		}

		const hovered = this.hovered && next.get(this.hovered.id);
		if (hovered) this.hovered = hovered;
		else this.setHovered(null);
		this.pinnedNode = this.pinnedNode ? (next.get(this.pinnedNode.id) ?? null) : null;
		if (this.drag) {
			const node = next.get(this.drag.node.id);
			if (node) this.drag.node = node;
			else this.drag = null;
		}

		this.nodes = data.nodes;
		this.links = data.links;
		this.clusterLabels = data.clusters;
		// The ring force reads each node's radius when the nodes are set, so update rings first.
		this.updateRings();
		this.simulation.nodes(this.nodes);
		this.linkForce().links(this.links);

		this.adjacency = new Map(this.nodes.map((n) => [n, new Set<GraphNode>()]));
		for (const link of this.links) {
			const a = link.source as GraphNode;
			const b = link.target as GraphNode;
			this.adjacency.get(a)?.add(b);
			this.adjacency.get(b)?.add(a);
		}

		if (previous.size === 0) this.autoFit = true;
		if (reheat) this.simulation.alpha(previous.size === 0 ? 1 : 0.5).restart();
		this.scheduleDraw();
	}

	setSettings(display: DisplaySettings, forces: ForceSettings): void {
		const forcesChanged =
			JSON.stringify(forces) !== JSON.stringify(this.forces) ||
			display.nodeSize !== this.display.nodeSize ||
			display.scaleLinksByCount !== this.display.scaleLinksByCount;
		this.display = display;
		this.forces = forces;
		if (forcesChanged) {
			this.applyForces();
			this.simulation.alpha(0.3).restart();
		}
		this.scheduleDraw();
	}

	get pinnedId(): string | null {
		return this.pinnedNode?.id ?? null;
	}

	/** Keep a node and its neighbours highlighted, or clear the pin with null. */
	pin(id: string | null): void {
		this.pinnedNode = id === null ? null : (this.nodes.find((n) => n.id === id) ?? null);
		this.scheduleDraw();
	}

	highlight(highlight: LegendHighlight | null): void {
		const current = this.legendHighlight;
		if (highlight?.type === current?.type && highlight?.index === current?.index) return;
		this.legendHighlight = highlight;
		this.scheduleDraw();
	}

	refreshTheme(): void {
		this.theme = readTheme(this.parentEl);
		this.scheduleDraw();
	}

	/** Zoom to show the whole graph and keep following it while the layout settles. */
	fit(): void {
		this.autoFit = true;
		this.setTransform(this.fitTransform());
	}

	destroy(): void {
		this.simulation.stop();
		this.simulation.on('tick', null);
		if (this.frame) this.canvas.win.cancelAnimationFrame(this.frame);
		this.resizeObserver.disconnect();
		for (const fn of this.cleanup) fn();
		select(this.canvas).on('.zoom', null);
		this.canvas.remove();
	}

	private linkForce() {
		return this.simulation.force('link') as ReturnType<
			typeof forceLink<GraphNode, GraphLink>
		>;
	}

	private updateRings(): void {
		this.rings =
			this.forces.layout === 'rings'
				? ringRadii(this.nodes, (n) => nodeRadius(n, this.display), this.forces.linkDistance)
				: [];
	}

	private applyForces(): void {
		const f = this.forces;
		this.updateRings();
		// The rings do the centring, as the middle one has no radius.
		const center = f.layout === 'rings' ? 0 : f.centerForce * 0.3;
		const degree = (n: GraphNode | string) =>
			typeof n === 'string' ? 1 : Math.max(1, n.degree);
		this.simulation
			.force(
				'link',
				forceLink<GraphNode, GraphLink>(this.links)
					.id((n) => n.id)
					// Repeated links are shorter as well as stronger, since strength alone only
					// holds notes more firmly at the same distance.
					.distance((l) => f.linkDistance / linkScale(l.count, this.display))
					// Capped at 1, as stronger links overshoot and oscillate.
					.strength((l) =>
						Math.min(
							1,
							(f.linkForce * linkScale(l.count, this.display)) /
								Math.min(degree(l.source), degree(l.target)),
						),
					),
			)
			.force('charge', forceManyBody<GraphNode>().strength(-f.repelForce * 15))
			.force('x', forceX<GraphNode>(0).strength(center))
			.force('y', forceY<GraphNode>(0).strength(center))
			.force(
				'rings',
				f.layout === 'rings'
					? forceRadial<GraphNode>((n) => this.rings[n.level] ?? 0).strength(RING_STRENGTH)
					: null,
			)
			.force('cluster', forceCluster(f.clusterForce * 0.5))
			.force(
				'collide',
				forceCollide<GraphNode>((n) => nodeRadius(n, this.display) + 2),
			);
	}

	private onTick(): void {
		if (this.autoFit && this.nodes.length > 0 && !this.drag) {
			// Ease towards the fitted view rather than jumping on every tick.
			const target = this.fitTransform();
			const t = this.transform;
			const ease = 0.15;
			this.setTransform(
				zoomIdentity
					.translate(t.x + (target.x - t.x) * ease, t.y + (target.y - t.y) * ease)
					.scale(t.k + (target.k - t.k) * ease),
			);
		}
		this.scheduleDraw();
	}

	private setTransform(transform: ZoomTransform): void {
		this.zoomBehavior.transform(select(this.canvas), transform);
	}

	private fitTransform(): ZoomTransform {
		if (this.nodes.length === 0 || this.width === 0) {
			return zoomIdentity.translate(this.width / 2, this.height / 2);
		}
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const n of this.nodes) {
			const r = nodeRadius(n, this.display);
			minX = Math.min(minX, n.x! - r);
			minY = Math.min(minY, n.y! - r);
			maxX = Math.max(maxX, n.x! + r);
			maxY = Math.max(maxY, n.y! + r);
		}
		const k = Math.min(
			2,
			Math.max(
				SCALE_EXTENT[0],
				Math.min(
					(this.width - 2 * FIT_PADDING) / Math.max(1, maxX - minX),
					(this.height - 2 * FIT_PADDING) / Math.max(1, maxY - minY),
				),
			),
		);
		return zoomIdentity
			.translate(this.width / 2 - ((minX + maxX) / 2) * k, this.height / 2 - ((minY + maxY) / 2) * k)
			.scale(k);
	}

	private resize(): void {
		const rect = this.parentEl.getBoundingClientRect();
		const width = Math.max(1, Math.floor(rect.width));
		const height = Math.max(1, Math.floor(rect.height));
		if (width === this.width && height === this.height) return;

		const first = this.width === 0;
		const dx = (width - this.width) / 2;
		const dy = (height - this.height) / 2;
		this.width = width;
		this.height = height;
		this.dpr = this.canvas.win.devicePixelRatio || 1;
		this.canvas.width = Math.round(width * this.dpr);
		this.canvas.height = Math.round(height * this.dpr);

		if (first || this.autoFit) this.setTransform(this.fitTransform());
		else this.setTransform(this.transform.translate(dx / this.transform.k, dy / this.transform.k));
		this.scheduleDraw();
	}

	private scheduleDraw(): void {
		if (this.frame) return;
		this.frame = this.canvas.win.requestAnimationFrame(() => {
			this.frame = 0;
			this.draw();
		});
	}

	private draw(): void {
		// The legend takes over from the pin, so it still works while a node is pinned.
		const legend = this.legendHighlight;
		const focus = this.drag?.node ?? this.hovered ?? (legend ? null : this.pinnedNode);
		let focusSet: Set<GraphNode> | null = null;
		let highlightKind: number | null = null;
		if (focus) {
			focusSet = new Set(this.adjacency.get(focus));
			focusSet.add(focus);
		} else if (legend?.type === 'group') {
			focusSet = new Set(this.nodes.filter((n) => n.group === legend.index));
		} else if (legend?.type === 'link') {
			highlightKind = legend.index;
			focusSet = new Set();
			for (const link of this.links) {
				if (link.kind !== highlightKind) continue;
				focusSet.add(link.source as GraphNode);
				focusSet.add(link.target as GraphNode);
			}
		}
		this.labelHits = drawGraph(this.ctx, {
			nodes: this.nodes,
			links: this.links,
			transform: this.transform,
			width: this.width,
			height: this.height,
			dpr: this.dpr,
			theme: this.theme,
			display: this.display,
			focus,
			focusSet,
			highlightKind,
			clusterLabels: this.clusterLabels,
			rings: this.rings,
			hoveredLabel: this.hoveredLabel,
		});
	}

	private listen<K extends keyof HTMLElementEventMap>(
		type: K,
		handler: (evt: HTMLElementEventMap[K]) => void,
	): void {
		this.canvas.addEventListener(type, handler);
		this.cleanup.push(() => this.canvas.removeEventListener(type, handler));
	}

	private toWorld(evt: MouseEvent): [number, number] {
		const rect = this.canvas.getBoundingClientRect();
		return this.transform.invert([evt.clientX - rect.left, evt.clientY - rect.top]);
	}

	private nodeAt(evt: MouseEvent): GraphNode | null {
		const [x, y] = this.toWorld(evt);
		const slack = 3 / this.transform.k;
		// Last drawn is on top, so search backwards.
		for (let i = this.nodes.length - 1; i >= 0; i--) {
			const n = this.nodes[i]!;
			const r = nodeRadius(n, this.display) + slack;
			const dx = n.x! - x;
			const dy = n.y! - y;
			if (dx * dx + dy * dy <= r * r) return n;
		}
		return null;
	}

	/** Pan and zoom everywhere except when a node drag has started (pointerdown fires first). */
	private zoomFilter(evt: Event): boolean {
		if (evt.type === 'wheel') return true;
		const mouse = evt as MouseEvent;
		return !this.drag && !mouse.ctrlKey && !mouse.button;
	}

	private setHovered(node: GraphNode | null, evt?: MouseEvent): void {
		if (node === this.hovered) return;
		this.hovered = node;
		this.canvas.toggleClass('is-hovering-node', node !== null);
		this.callbacks.hover(node, evt ?? null);
		this.scheduleDraw();
	}

	private setHoveredLabel(hit: LabelHit | null): void {
		const current = this.hoveredLabel;
		if (hit?.cluster === current?.cluster && hit?.part === current?.part) return;
		this.hoveredLabel = hit;
		this.canvas.toggleClass('is-hovering-label', hit !== null);
		this.scheduleDraw();
	}

	/** The link in a cluster label under the pointer, with a little slack around its text. */
	private labelAt(evt: MouseEvent): LabelHit | null {
		const rect = this.canvas.getBoundingClientRect();
		const x = evt.clientX - rect.left;
		const y = evt.clientY - rect.top;
		const slack = 2;
		return (
			this.labelHits.find(
				(h) =>
					x >= h.left - slack &&
					x <= h.right + slack &&
					y >= h.top - slack &&
					y <= h.bottom + slack,
			) ?? null
		);
	}

	private onPointerDown(evt: PointerEvent): void {
		if (evt.button !== 0) return;
		const node = this.nodeAt(evt);
		if (!node) return;
		this.drag = {
			node,
			pointerId: evt.pointerId,
			startX: evt.clientX,
			startY: evt.clientY,
			moved: false,
		};
		this.canvas.setPointerCapture(evt.pointerId);
	}

	private onPointerMove(evt: PointerEvent): void {
		const drag = this.drag;
		if (drag && drag.pointerId === evt.pointerId) {
			if (!drag.moved) {
				const distance = Math.hypot(evt.clientX - drag.startX, evt.clientY - drag.startY);
				if (distance < DRAG_THRESHOLD) return;
				drag.moved = true;
				this.simulation.alphaTarget(0.3).restart();
			}
			[drag.node.fx, drag.node.fy] = this.toWorld(evt);
			this.scheduleDraw();
			return;
		}
		if (evt.pointerType === 'mouse' && !evt.buttons) {
			const node = this.nodeAt(evt);
			this.setHovered(node, evt);
			this.setHoveredLabel(node ? null : this.labelAt(evt));
		}
	}

	private onPointerUp(evt: PointerEvent, completed: boolean): void {
		const drag = this.drag;
		if (!drag || drag.pointerId !== evt.pointerId) return;
		this.drag = null;
		if (this.canvas.hasPointerCapture(evt.pointerId)) {
			this.canvas.releasePointerCapture(evt.pointerId);
		}
		if (drag.moved) {
			drag.node.fx = null;
			drag.node.fy = null;
			this.simulation.alphaTarget(0);
		} else if (completed) {
			this.callbacks.open(drag.node, evt);
		}
		this.scheduleDraw();
	}

	private onContextMenu(evt: MouseEvent): void {
		const node = this.nodeAt(evt);
		if (!node) return;
		evt.preventDefault();
		this.callbacks.contextMenu(node, evt);
	}
}

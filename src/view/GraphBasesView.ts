import {
	BasesView,
	debounce,
	Keymap,
	Menu,
	type BasesEntry,
	type BasesPropertyId,
	type HoverParent,
	type HoverPopover,
	type QueryController,
	type Value,
} from 'obsidian';
import { HOVER_SOURCE, VIEW_TYPE } from '../constants';
import { buildGraph, type SeedEntry } from '../graph/buildGraph';
import type { Links } from '../graph/linkIndex';
import { PropertyLinks } from '../graph/propertyLinks';
import type { GraphData, GraphLink, GraphNode } from '../graph/types';
import type BaseGraphPlugin from '../main';
import { GraphRenderer } from '../render/renderer';
import { GraphControls } from './controls';
import { clusterByGroup, clusterByProperty } from './clusters';
import { EntryLookup } from './entries';
import { GroupResolver } from './groups';
import { readSettings, type GraphViewSettings } from './options';
import { PropertyCard } from './propertyCard';

export class GraphBasesView extends BasesView implements HoverParent {
	type = VIEW_TYPE;
	hoverPopover: HoverPopover | null = null;

	private rootEl: HTMLElement;
	private canvasHostEl: HTMLElement;
	private controls: GraphControls;
	private card: PropertyCard;
	private renderer: GraphRenderer | null = null;
	private entries: EntryLookup | null = null;
	/** Node and link ids of the last render; the layout is only reheated when these change. */
	private structure = '';

	constructor(
		private controller: QueryController,
		hostEl: HTMLElement,
		private plugin: BaseGraphPlugin,
	) {
		super(controller);
		this.rootEl = hostEl.createDiv({ cls: 'base-graph' });
		this.canvasHostEl = this.rootEl.createDiv({ cls: 'base-graph-canvas-host' });
		this.controls = new GraphControls(this.rootEl, {
			setDepth: (depth) => {
				this.config.set('depth', depth);
				this.rebuild();
			},
			fit: () => this.renderer?.fit(),
			highlight: (highlight) => this.renderer?.highlight(highlight),
		});
		this.card = new PropertyCard(this.rootEl, this.app.renderContext);
	}

	onload(): void {
		// Bases only re-runs the query when matching notes change. Neighbours pulled in
		// by depth can change without that, so also rebuild when links are re-resolved.
		this.registerEvent(
			this.app.metadataCache.on('resolved', this.scheduleRebuild),
		);
		this.registerEvent(
			this.app.workspace.on('css-change', () => {
				this.renderer?.refreshTheme();
				// Group colours in the legend come from the theme too.
				this.rebuild();
			}),
		);
		// The card would be left behind when a node is dragged or the graph zooms.
		// Capture, because d3-zoom stops these events from propagating.
		const hideCard = () => this.card.hide();
		const capture = { capture: true, passive: true };
		this.registerDomEvent(this.canvasHostEl, 'pointerdown', hideCard, capture);
		this.registerDomEvent(this.canvasHostEl, 'wheel', hideCard, capture);
	}

	onunload(): void {
		this.scheduleRebuild.cancel();
		this.card.hide();
		this.renderer?.destroy();
		this.renderer = null;
		this.rootEl.remove();
	}

	onDataUpdated(): void {
		this.rebuild();
	}

	private scheduleRebuild = debounce(() => this.rebuild(), 300, true);

	private rebuild(): void {
		if (!this.data) return;
		const settings = readSettings(this.config);
		this.rootEl.setCssProps({ '--base-graph-height': `${settings.height}px` });

		const entries = new EntryLookup(this, this.controller);
		this.entries = entries;
		const groups = new GroupResolver(this, entries);
		const graph = buildGraph({
			seeds: this.collectSeeds(settings, groups),
			groups,
			index: this.links(settings),
			settings,
			getFile: (path) => this.app.vault.getFileByPath(path),
		});
		const { clusterBy } = settings;
		if (settings.clusterByGroup) {
			graph.clusters = clusterByGroup(graph.nodes, graph.groups);
		} else if (clusterBy) {
			graph.clusters = clusterByProperty(graph.nodes, (file) => entries.valueOf(file, clusterBy));
		}

		if (this.renderer) {
			this.renderer.setSettings(settings.display, settings.forces);
		} else {
			this.renderer = new GraphRenderer(
				this.canvasHostEl,
				settings.display,
				settings.forces,
				{
					open: (node, evt) => this.openNode(node, evt),
					openLink: (linktext, sourcePath, evt) =>
						void this.app.workspace.openLinkText(linktext, sourcePath, Keymap.isModEvent(evt)),
					hover: (node, evt) => this.hoverNode(node, evt),
					contextMenu: (node, evt) => this.showNodeMenu(node, evt),
				},
			);
		}

		const structure = structureKey(graph, settings.display.scaleLinksByCount);
		this.renderer.setData(graph, structure !== this.structure);
		this.structure = structure;
		this.controls.update(settings, graph, this.renderer.theme);
	}

	private links(settings: GraphViewSettings): Links {
		const { linkIndex } = this.plugin;
		if (settings.linkProperties.length === 0) return linkIndex;
		return new PropertyLinks(
			this.app.metadataCache,
			settings.linkProperties,
			() => this.app.vault.getMarkdownFiles(),
			settings.otherLinks ? linkIndex : null,
		);
	}

	private collectSeeds(settings: GraphViewSettings, groups: GroupResolver): SeedEntry[] {
		const seeds: SeedEntry[] = [];
		this.data.groupedData.forEach((group, i) => {
			for (const entry of group.entries) {
				const { labelProperty, sizeProperty } = settings;
				seeds.push({
					file: entry.file,
					groups: groups.ofBaseGroup(i),
					label: labelProperty ? valueText(safeValue(entry, labelProperty)) : null,
					size: sizeProperty ? valueNumber(safeValue(entry, sizeProperty)) : null,
				});
			}
		});
		return seeds;
	}

	private openNode(node: GraphNode, evt: MouseEvent): void {
		const paneType = Keymap.isModEvent(evt);
		const { workspace } = this.app;
		if (node.file) {
			void workspace.getLeaf(paneType).openFile(node.file);
		} else {
			void workspace.openLinkText(node.linktext, node.sourcePath, paneType);
		}
	}

	private hoverNode(node: GraphNode | null, evt: MouseEvent | null): void {
		if (!node?.file || !evt || !this.renderer) {
			this.card.hideSoon();
			return;
		}
		this.app.workspace.trigger('hover-link', {
			event: evt,
			source: HOVER_SOURCE,
			hoverParent: this,
			targetEl: this.renderer.canvas,
			linktext: node.file.path,
			sourcePath: '',
		});
		// With the modifier held, the page preview shows instead.
		if (Keymap.isModifier(evt, 'Mod')) {
			this.card.hide();
			return;
		}
		this.card.show(
			{
				title: node.label,
				entry: this.entries?.get(node.file) ?? null,
				config: this.config,
				pinned: this.renderer.pinnedId === node.id,
				togglePin: () => this.togglePin(node),
			},
			evt,
		);
	}

	/** Pin or unpin a node's highlight, returning whether it's now pinned. */
	private togglePin(node: GraphNode): boolean {
		if (!this.renderer) return false;
		const pin = this.renderer.pinnedId !== node.id;
		this.renderer.pin(pin ? node.id : null);
		// A locked legend item would hide the pin.
		if (pin) this.controls.unlock();
		return pin;
	}

	private showNodeMenu(node: GraphNode, evt: MouseEvent): void {
		const { workspace } = this.app;
		const menu = new Menu();
		const file = node.file;
		if (file) {
			menu.addItem((item) =>
				item
					.setTitle('Open in new tab')
					.setIcon('file-plus')
					.onClick(() => void workspace.getLeaf('tab').openFile(file)),
			);
			menu.addItem((item) =>
				item
					.setTitle('Open to the right')
					.setIcon('separator-vertical')
					.onClick(() => void workspace.getLeaf('split').openFile(file)),
			);
			this.addPinItem(menu, node);
			workspace.trigger('file-menu', menu, file, VIEW_TYPE);
		} else {
			menu.addItem((item) =>
				item
					.setTitle('Create note')
					.setIcon('file-plus')
					.onClick(() => void workspace.openLinkText(node.linktext, node.sourcePath)),
			);
			this.addPinItem(menu, node);
		}
		menu.showAtMouseEvent(evt);
	}

	private addPinItem(menu: Menu, node: GraphNode): void {
		const pinned = this.renderer?.pinnedId === node.id;
		menu.addItem((item) =>
			item
				.setTitle(pinned ? 'Unpin highlight' : 'Pin highlight')
				.setIcon(pinned ? 'pin-off' : 'pin')
				.onClick(() => this.togglePin(node)),
		);
	}
}

/** Changes to clusters are included, since they need the layout to settle again too. */
/** Changes whenever the layout should move, so the simulation is reheated. */
function structureKey(graph: GraphData, withCounts: boolean): string {
	// Link counts set link lengths when links are scaled by count.
	const linkKey = withCounts ? (l: GraphLink) => `${l.id}\t${l.count}` : (l: GraphLink) => l.id;
	return (
		graph.nodes.map((n) => `${n.id}\t${n.clusters.join(',')}`).join('\0') +
		'\n' +
		graph.links.map(linkKey).join('\0')
	);
}

/** A property's value, or null when evaluating it throws, as it can on malformed frontmatter. */
function safeValue(entry: BasesEntry, property: BasesPropertyId): Value | null {
	try {
		return entry.getValue(property);
	} catch {
		return null;
	}
}

function valueText(value: Value | null): string | null {
	if (!value || !value.isTruthy()) return null;
	const text = value.toString().trim();
	return text || null;
}

function valueNumber(value: Value | null): number | null {
	const text = value?.toString().trim();
	if (!text) return null;
	const number = Number(text);
	return isFinite(number) ? number : null;
}

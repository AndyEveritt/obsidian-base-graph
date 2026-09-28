import {
	BasesView,
	debounce,
	Keymap,
	Menu,
	type BasesEntry,
	type HoverParent,
	type HoverPopover,
	type QueryController,
	type TFile,
	type Value,
} from 'obsidian';
import { HOVER_SOURCE, VIEW_TYPE } from '../constants';
import { buildGraph, type SeedEntry } from '../graph/buildGraph';
import type { GraphData, GraphNode } from '../graph/types';
import type BaseGraphPlugin from '../main';
import { GraphRenderer } from '../render/renderer';
import { GraphControls } from './controls';
import { entryFactory } from './entries';
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
			highlightGroup: (group) => this.renderer?.highlightGroup(group),
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

		const groups = new GroupResolver(this, this.controller);
		const graph = buildGraph({
			seeds: this.collectSeeds(settings, groups.isGrouped),
			groups,
			index: this.plugin.linkIndex,
			settings,
			getFile: (path) => this.app.vault.getFileByPath(path),
		});

		if (this.renderer) {
			this.renderer.setSettings(settings.display, settings.forces);
		} else {
			this.renderer = new GraphRenderer(
				this.canvasHostEl,
				settings.display,
				settings.forces,
				{
					open: (node, evt) => this.openNode(node, evt),
					hover: (node, evt) => this.hoverNode(node, evt),
					contextMenu: (node, evt) => this.showNodeMenu(node, evt),
				},
			);
		}

		const structure = structureKey(graph);
		this.renderer.setData(graph, structure !== this.structure);
		this.structure = structure;
		this.controls.update(settings, graph, this.renderer.theme);
	}

	private collectSeeds(settings: GraphViewSettings, isGrouped: boolean): SeedEntry[] {
		const seeds: SeedEntry[] = [];
		this.data.groupedData.forEach((group, i) => {
			for (const entry of group.entries) {
				const { labelProperty, sizeProperty } = settings;
				seeds.push({
					file: entry.file,
					group: isGrouped ? i : -1,
					label: labelProperty ? valueText(entry.getValue(labelProperty)) : null,
					size: sizeProperty ? valueNumber(entry.getValue(sizeProperty)) : null,
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
		const entry = Keymap.isModifier(evt, 'Mod') ? null : this.entryFor(node.file);
		if (entry) this.card.show(node.label, entry, this.config, evt);
		else this.card.hide();
	}

	/** The base's entry for a file, or one created for it if depth pulled it in. */
	private entryFor(file: TFile): BasesEntry | null {
		const entry = this.data.data.find((e) => e.file === file);
		if (entry) return entry;
		try {
			return entryFactory(this, this.controller)?.(file) ?? null;
		} catch {
			return null;
		}
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
			workspace.trigger('file-menu', menu, file, VIEW_TYPE);
		} else {
			menu.addItem((item) =>
				item
					.setTitle('Create note')
					.setIcon('file-plus')
					.onClick(() => void workspace.openLinkText(node.linktext, node.sourcePath)),
			);
		}
		menu.showAtMouseEvent(evt);
	}
}

function structureKey(graph: GraphData): string {
	return (
		graph.nodes.map((n) => n.id).join('\0') +
		'\n' +
		graph.links.map((l) => l.id).join('\0')
	);
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

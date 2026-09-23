import {
	BasesView,
	debounce,
	Keymap,
	Menu,
	type HoverParent,
	type HoverPopover,
	type QueryController,
	type Value,
} from 'obsidian';
import { HOVER_SOURCE, VIEW_TYPE } from '../constants';
import { buildGraph, type SeedEntry } from '../graph/buildGraph';
import type { GraphData, GraphNode } from '../graph/types';
import type BaseGraphPlugin from '../main';
import { GraphRenderer } from '../render/renderer';
import { GraphControls } from './controls';
import { readSettings, type GraphViewSettings } from './options';

export class GraphBasesView extends BasesView implements HoverParent {
	type = VIEW_TYPE;
	hoverPopover: HoverPopover | null = null;

	private rootEl: HTMLElement;
	private canvasHostEl: HTMLElement;
	private controls: GraphControls;
	private renderer: GraphRenderer | null = null;
	/** Node and link ids of the last render; the layout is only reheated when these change. */
	private structure = '';

	constructor(
		controller: QueryController,
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
		});
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
	}

	onunload(): void {
		this.scheduleRebuild.cancel();
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

		const graph = buildGraph({
			...this.collectSeeds(settings),
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

	private collectSeeds(settings: GraphViewSettings): {
		seeds: SeedEntry[];
		groups: string[];
	} {
		const grouped = this.data.groupedData;
		const hasGroups = grouped.length > 1 || grouped.some((g) => g.hasKey());
		const groups = hasGroups
			? grouped.map((g) => (g.hasKey() ? String(g.key?.toString()) : 'None'))
			: [];

		const seeds: SeedEntry[] = [];
		grouped.forEach((group, i) => {
			for (const entry of group.entries) {
				const { labelProperty, sizeProperty } = settings;
				seeds.push({
					file: entry.file,
					group: hasGroups ? i : -1,
					label: labelProperty ? valueText(entry.getValue(labelProperty)) : null,
					size: sizeProperty ? valueNumber(entry.getValue(sizeProperty)) : null,
				});
			}
		});
		return { seeds, groups };
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

	private hoverNode(node: GraphNode, evt: MouseEvent): void {
		if (!node.file || !this.renderer) return;
		this.app.workspace.trigger('hover-link', {
			event: evt,
			source: HOVER_SOURCE,
			hoverParent: this,
			targetEl: this.renderer.canvas,
			linktext: node.file.path,
			sourcePath: '',
		});
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

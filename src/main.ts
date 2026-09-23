import { Notice, Plugin } from 'obsidian';
import { HOVER_SOURCE, VIEW_TYPE } from './constants';
import { LinkIndex } from './graph/linkIndex';
import { GraphBasesView } from './view/GraphBasesView';
import { getViewOptions } from './view/options';

export default class BaseGraphPlugin extends Plugin {
	linkIndex!: LinkIndex;

	onload() {
		this.linkIndex = new LinkIndex(this.app.metadataCache);
		const invalidate = () => this.linkIndex.invalidate();
		this.registerEvent(this.app.metadataCache.on('resolved', invalidate));
		this.registerEvent(this.app.metadataCache.on('resolve', invalidate));
		this.registerEvent(this.app.vault.on('delete', invalidate));
		this.registerEvent(this.app.vault.on('rename', invalidate));

		this.registerHoverLinkSource(HOVER_SOURCE, {
			display: 'Base graph',
			defaultMod: true,
		});

		const registered = this.registerBasesView(VIEW_TYPE, {
			name: 'Graph',
			icon: 'git-fork',
			factory: (controller, containerEl) =>
				new GraphBasesView(controller, containerEl, this),
			options: getViewOptions,
		});
		if (!registered) {
			new Notice('Base graph needs the core plugin for bases. Turn it on and reload.');
		}
	}
}

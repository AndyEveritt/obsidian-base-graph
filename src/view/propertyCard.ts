import {
	NullValue,
	setIcon,
	setTooltip,
	type BasesEntry,
	type BasesViewConfig,
	type RenderContext,
	type Value,
} from 'obsidian';

/** Gap between the cursor and the card, in pixels. */
const OFFSET = 12;
/** How long the card stays after the pointer leaves, so it can be moved onto to select a link. */
const HIDE_DELAY = 300;

export interface CardContent {
	title: string;
	/** Entry whose properties are listed, or null to show just the title. */
	entry: BasesEntry | null;
	config: BasesViewConfig;
	pinned: boolean;
	/** Pins or unpins the node, returning whether it's now pinned. */
	togglePin: () => boolean;
}

/**
 * Card shown next to the cursor while hovering a node, listing the view's selected
 * properties, with a button to pin the node's highlight.
 */
export class PropertyCard {
	private el: HTMLElement;
	private hideTimer = 0;

	constructor(
		private parentEl: HTMLElement,
		private renderContext: RenderContext,
	) {
		this.el = parentEl.createDiv({ cls: 'base-graph-card' });
		this.el.hide();
		this.el.addEventListener('pointerenter', () => this.cancelHide());
		this.el.addEventListener('pointerleave', () => this.hideSoon());
	}

	show(content: CardContent, evt: MouseEvent): void {
		const { title, entry, config } = content;
		this.cancelHide();
		this.el.empty();

		const headerEl = this.el.createDiv({ cls: 'base-graph-card-header' });
		headerEl.createDiv({ cls: 'base-graph-card-title', text: title });
		const pinEl = headerEl.createDiv({ cls: 'clickable-icon base-graph-card-pin' });
		const showPinned = (pinned: boolean) => {
			setIcon(pinEl, pinned ? 'pin-off' : 'pin');
			setTooltip(pinEl, pinned ? 'Unpin highlight' : 'Pin highlight');
			pinEl.toggleClass('is-active', pinned);
		};
		showPinned(content.pinned);
		pinEl.addEventListener('click', () => showPinned(content.togglePin()));

		if (entry) this.renderProperties(entry, config, title);
		this.el.show();
		this.place(evt);
	}

	hide(): void {
		this.cancelHide();
		this.el.hide();
	}

	/** Hide after a delay, unless the pointer moves onto the card or another node first. */
	hideSoon(): void {
		if (this.hideTimer || !this.el.isShown()) return;
		this.hideTimer = this.el.win.setTimeout(() => this.hide(), HIDE_DELAY);
	}

	private cancelHide(): void {
		if (!this.hideTimer) return;
		this.el.win.clearTimeout(this.hideTimer);
		this.hideTimer = 0;
	}

	private renderProperties(entry: BasesEntry, config: BasesViewConfig, title: string): void {
		const rowsEl = this.el.createDiv({ cls: 'base-graph-card-rows' });
		for (const property of config.getOrder()) {
			// Evaluating can throw on malformed frontmatter, such as a list with an empty item.
			let value: Value | null;
			try {
				value = entry.getValue(property);
			} catch {
				continue;
			}
			if (!value || value instanceof NullValue) continue;
			const text = value.toString().trim();
			// Skip empty values, and the property the title already shows.
			if (!text || text === title) continue;
			rowsEl.createDiv({ cls: 'base-graph-card-name', text: config.getDisplayName(property) });
			const valueEl = rowsEl.createDiv({ cls: 'base-graph-card-value' });
			try {
				value.renderTo(valueEl, this.renderContext);
			} catch {
				valueEl.setText(text);
			}
		}
		if (!rowsEl.hasChildNodes()) rowsEl.remove();
	}

	/** Below and to the right of the cursor, flipped where needed to stay inside the view. */
	private place(evt: MouseEvent): void {
		const bounds = this.parentEl.getBoundingClientRect();
		const x = evt.clientX - bounds.left;
		const y = evt.clientY - bounds.top;
		const { offsetWidth: width, offsetHeight: height } = this.el;
		const left = x + OFFSET + width > bounds.width ? x - OFFSET - width : x + OFFSET;
		const top = y + OFFSET + height > bounds.height ? y - OFFSET - height : y + OFFSET;
		this.el.setCssProps({
			'--base-graph-card-x': `${Math.max(0, left)}px`,
			'--base-graph-card-y': `${Math.max(0, top)}px`,
		});
	}
}

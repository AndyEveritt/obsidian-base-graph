import { debounce, setIcon, setTooltip } from 'obsidian';
import type { GraphData, LegendHighlight } from '../graph/types';
import { groupColor, linkColor, type ThemeColors } from '../render/theme';
import { DEPTH_RANGE, type GraphViewSettings } from './options';

export interface ControlHandlers {
	setDepth(depth: number): void;
	fit(): void;
	/** Highlight a group's notes or a link property's links, or clear the highlight with null. */
	highlight(highlight: LegendHighlight | null): void;
}

interface LegendEntry {
	highlight: LegendHighlight;
	label: string;
	el: HTMLElement;
}

/** Overlay with a depth slider like the local graph's, plus a status line and a legend of groups and link properties. */
export class GraphControls {
	private depthInput: HTMLInputElement;
	private depthValueEl: HTMLElement;
	private statusEl: HTMLElement;
	private legendEl: HTMLElement;
	private entries: LegendEntry[] = [];
	private hovered: LegendHighlight | null = null;
	/** Item locked by clicking it. Kept by label so it survives groups being reordered. */
	private locked: { type: LegendHighlight['type']; label: string } | null = null;

	constructor(
		parentEl: HTMLElement,
		private handlers: ControlHandlers,
	) {
		const panel = parentEl.createDiv({ cls: 'base-graph-controls' });

		const depthEl = panel.createDiv({ cls: 'base-graph-depth' });
		setTooltip(depthEl, 'Also show notes up to this many links away');
		depthEl.createSpan({ text: 'Depth' });
		this.depthInput = depthEl.createEl('input', {
			type: 'range',
			attr: {
				min: DEPTH_RANGE.min,
				max: DEPTH_RANGE.max,
				step: DEPTH_RANGE.step,
			},
		});
		this.depthValueEl = depthEl.createSpan({ cls: 'base-graph-depth-value' });

		const commitDepth = debounce(
			(value: number) => handlers.setDepth(value),
			250,
			true,
		);
		this.depthInput.addEventListener('input', () => {
			const value = Number(this.depthInput.value);
			this.depthValueEl.setText(String(value));
			commitDepth(value);
		});

		const fitButton = panel.createDiv({ cls: 'clickable-icon' });
		setIcon(fitButton, 'maximize');
		setTooltip(fitButton, 'Zoom to fit');
		fitButton.addEventListener('click', () => handlers.fit());

		const footer = parentEl.createDiv({ cls: 'base-graph-footer' });
		this.legendEl = footer.createDiv({ cls: 'base-graph-legend' });
		this.statusEl = footer.createDiv({ cls: 'base-graph-status' });
	}

	update(settings: GraphViewSettings, data: GraphData, theme: ThemeColors): void {
		// Don't fight the user while they're dragging the slider.
		if (this.depthInput.ownerDocument.activeElement !== this.depthInput) {
			this.depthInput.value = String(settings.depth);
			this.depthValueEl.setText(String(settings.depth));
		}

		const linked = data.nodes.filter((n) => n.kind !== 'match').length;
		let status = `${data.matchCount} ${data.matchCount === 1 ? 'note' : 'notes'}`;
		if (linked > 0) status += ` · ${linked} linked`;
		if (data.truncated) status += ` · stopped at the ${settings.maxNodes} node limit`;
		this.statusEl.setText(status);
		this.statusEl.toggleClass('mod-warning', data.truncated);

		this.legendEl.empty();
		this.entries = [];
		data.groups.forEach((label, i) => {
			this.addEntry({ type: 'group', index: i }, label, groupColor(theme, i));
		});
		data.linkLabels.forEach((label, i) => {
			this.addEntry({ type: 'link', index: i }, label, linkColor(theme, i));
		});

		// Items were just replaced, so drop a lock or hover whose item is gone.
		if (this.locked && !this.entries.some((e) => this.isLocked(e))) this.locked = null;
		const hovered = this.hovered;
		if (hovered && !this.entries.some((e) => sameHighlight(e.highlight, hovered))) {
			this.hovered = null;
		}
		this.applyHighlight();
	}

	/** Clear the item locked from the legend, if any. */
	unlock(): void {
		this.locked = null;
		this.applyHighlight();
	}

	private addEntry(highlight: LegendHighlight, label: string, color: string): void {
		const el = this.legendEl.createDiv({ cls: 'base-graph-legend-item' });
		const swatch = highlight.type === 'link' ? 'base-graph-legend-swatch mod-line' : 'base-graph-legend-swatch';
		el.createSpan({ cls: swatch }).setCssProps({
			'--swatch-color': color,
		});
		el.createSpan({ text: label });
		const entry: LegendEntry = { highlight, label, el };
		el.addEventListener('mouseenter', () => this.setHovered(highlight));
		el.addEventListener('mouseleave', () => this.setHovered(null));
		el.addEventListener('click', () => this.toggleLock(entry));
		this.entries.push(entry);
	}

	private setHovered(highlight: LegendHighlight | null): void {
		this.hovered = highlight;
		this.applyHighlight();
	}

	private isLocked(entry: LegendEntry): boolean {
		return this.locked?.type === entry.highlight.type && this.locked.label === entry.label;
	}

	private toggleLock(entry: LegendEntry): void {
		this.locked = this.isLocked(entry) ? null : { type: entry.highlight.type, label: entry.label };
		this.applyHighlight();
	}

	/** Hovering previews an item; otherwise the locked item, if any, stays highlighted. */
	private applyHighlight(): void {
		let locked: LegendHighlight | null = null;
		for (const entry of this.entries) {
			const isLocked = this.isLocked(entry);
			entry.el.toggleClass('is-active', isLocked);
			if (isLocked) locked = entry.highlight;
		}
		this.handlers.highlight(this.hovered ?? locked);
	}
}

function sameHighlight(a: LegendHighlight, b: LegendHighlight): boolean {
	return a.type === b.type && a.index === b.index;
}

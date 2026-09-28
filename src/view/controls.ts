import { debounce, setIcon, setTooltip } from 'obsidian';
import type { GraphData } from '../graph/types';
import { groupColor, type ThemeColors } from '../render/theme';
import { DEPTH_RANGE, type GraphViewSettings } from './options';

export interface ControlHandlers {
	setDepth(depth: number): void;
	fit(): void;
	/** Highlight the nodes in a group, or clear the highlight with null. */
	highlightGroup(group: number | null): void;
}

/** Overlay with a depth slider like the local graph's, plus a status line and group legend. */
export class GraphControls {
	private depthInput: HTMLInputElement;
	private depthValueEl: HTMLElement;
	private statusEl: HTMLElement;
	private legendEl: HTMLElement;
	private legendItems: HTMLElement[] = [];
	private hoveredGroup: number | null = null;
	/** Group locked by clicking its legend item. Kept by label so it survives groups being reordered. */
	private lockedLabel: string | null = null;
	private lockedGroup: number | null = null;

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
		this.legendItems = data.groups.map((label, i) => {
			const item = this.legendEl.createDiv({ cls: 'base-graph-legend-item' });
			item.createSpan({ cls: 'base-graph-legend-swatch' }).setCssProps({
				'--swatch-color': groupColor(theme, i),
			});
			item.createSpan({ text: label });
			item.addEventListener('mouseenter', () => this.setHoveredGroup(i));
			item.addEventListener('mouseleave', () => this.setHoveredGroup(null));
			item.addEventListener('click', () => this.toggleLock(i, label));
			return item;
		});

		const locked = this.lockedLabel === null ? -1 : data.groups.indexOf(this.lockedLabel);
		this.lockedGroup = locked >= 0 ? locked : null;
		if (this.lockedGroup === null) this.lockedLabel = null;
		// The hovered item was just replaced, so its mouseleave won't fire if the group is gone.
		if (this.hoveredGroup !== null && this.hoveredGroup >= data.groups.length) {
			this.hoveredGroup = null;
		}
		this.applyHighlight();
	}

	/** Clear the group locked from the legend, if any. */
	unlockGroup(): void {
		this.lockedGroup = null;
		this.lockedLabel = null;
		this.applyHighlight();
	}

	private setHoveredGroup(group: number | null): void {
		this.hoveredGroup = group;
		this.applyHighlight();
	}

	private toggleLock(group: number, label: string): void {
		const unlock = this.lockedGroup === group;
		this.lockedGroup = unlock ? null : group;
		this.lockedLabel = unlock ? null : label;
		this.applyHighlight();
	}

	/** Hovering previews a group; otherwise the locked group, if any, stays highlighted. */
	private applyHighlight(): void {
		this.legendItems.forEach((item, i) => item.toggleClass('is-active', i === this.lockedGroup));
		this.handlers.highlightGroup(this.hoveredGroup ?? this.lockedGroup);
	}
}

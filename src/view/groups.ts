import { Value, type BasesEntryGroup, type BasesPropertyId, type BasesView, type TFile } from 'obsidian';
import type { EntryLookup } from './entries';

/** Undocumented internal config holding the group-by property. */
interface InternalConfig {
	groupBy?: { property: BasesPropertyId } | null;
}

/**
 * Maps files to the base's groups. Notes in the base use the group Bases put them in;
 * other notes are grouped by evaluating the group-by property for them, adding a new
 * group when their value doesn't match any existing one.
 */
export class GroupResolver {
	/** False when the view isn't grouped: every note then has group -1. */
	readonly isGrouped: boolean;
	readonly labels: string[];
	private keys: (Value | null)[];
	private property: BasesPropertyId | null;

	constructor(
		view: BasesView,
		private entries: EntryLookup,
	) {
		const grouped = view.data.groupedData;
		const isGrouped = grouped.length > 1 || grouped.some((g) => g.hasKey());
		this.isGrouped = isGrouped;
		this.keys = isGrouped ? grouped.map((g) => (g.hasKey() ? (g.key ?? null) : null)) : [];
		this.labels = isGrouped ? grouped.map(groupLabel) : [];
		const property = (view.config as unknown as InternalConfig).groupBy?.property;
		this.property = isGrouped ? (property ?? null) : null;
	}

	/** Group index for a note outside the base, or -1 if it can't be determined. */
	groupOf(file: TFile): number {
		if (!this.property) return -1;
		const value = this.entries.valueOf(file, this.property);

		// Same matching Bases uses when grouping, with null standing for "no value".
		const index = this.keys.findIndex((key) =>
			key && value ? Value.looseEquals(key, value) : key === value,
		);
		if (index >= 0) return index;
		this.keys.push(value);
		this.labels.push(value ? value.toString() : 'None');
		return this.keys.length - 1;
	}
}

function groupLabel(group: BasesEntryGroup): string {
	return group.hasKey() ? String(group.key?.toString()) : 'None';
}

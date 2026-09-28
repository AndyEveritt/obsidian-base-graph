import {
	ListValue,
	NullValue,
	Value,
	type BasesPropertyId,
	type BasesView,
	type TFile,
} from 'obsidian';
import type { EntryLookup } from './entries';

/** Undocumented internal config holding the group-by property. */
interface InternalConfig {
	groupBy?: { property: BasesPropertyId } | null;
}

/**
 * Maps files to groups from the base's group-by property. A list value is split so
 * each of its items is a group of its own, and a note is in every group its list
 * holds. Notes in the base use the group Bases put them in; other notes are grouped
 * by evaluating the group-by property for them, adding new groups for new values.
 */
export class GroupResolver {
	/** False when the view isn't grouped: every note is then in no group. */
	readonly isGrouped: boolean;
	readonly labels: string[] = [];
	private keys: (Value | null)[] = [];
	/** Group indices for each of Bases' groups, in `groupedData` order. */
	private baseGroups: number[][];
	private property: BasesPropertyId | null;

	constructor(
		view: BasesView,
		private entries: EntryLookup,
	) {
		const grouped = view.data.groupedData;
		const isGrouped = grouped.length > 1 || grouped.some((g) => g.hasKey());
		this.isGrouped = isGrouped;
		this.baseGroups = isGrouped
			? grouped.map((g) => this.resolve(g.hasKey() ? (g.key ?? null) : null))
			: [];
		const property = (view.config as unknown as InternalConfig).groupBy?.property;
		this.property = isGrouped ? (property ?? null) : null;
	}

	/** Group indices for the notes in Bases' group at `index` in `groupedData`. */
	ofBaseGroup(index: number): number[] {
		return this.baseGroups[index] ?? [];
	}

	/** Group indices for a note outside the base, or empty if they can't be determined. */
	groupsOf(file: TFile): number[] {
		if (!this.property) return [];
		return this.resolve(this.entries.valueOf(file, this.property));
	}

	/** Indices of the groups a value's items are in, adding groups for new items. Sorted, so colours keep one order. */
	private resolve(value: Value | null): number[] {
		const items = listItems(value);
		const indices = new Set((items.length > 0 ? items : [null]).map((item) => this.intern(item)));
		return [...indices].sort((a, b) => a - b);
	}

	private intern(value: Value | null): number {
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

/** A list's items without empty ones, or a single value as a list of one. */
function listItems(value: Value | null): Value[] {
	if (!value || value instanceof NullValue) return [];
	if (!(value instanceof ListValue)) return [value];
	const items: Value[] = [];
	for (let i = 0; i < value.length(); i++) {
		const item = value.get(i);
		if (!(item instanceof NullValue) && item.toString().trim()) items.push(item);
	}
	return items;
}

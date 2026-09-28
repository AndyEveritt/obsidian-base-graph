import {
	NullValue,
	Value,
	type BasesEntryGroup,
	type BasesPropertyId,
	type BasesView,
	type QueryController,
	type TFile,
} from 'obsidian';
import { entryFactory } from './entries';

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
	private evaluate: ((file: TFile) => Value | null) | null;

	constructor(view: BasesView, controller: QueryController) {
		const grouped = view.data.groupedData;
		const isGrouped = grouped.length > 1 || grouped.some((g) => g.hasKey());
		this.isGrouped = isGrouped;
		this.keys = isGrouped ? grouped.map((g) => (g.hasKey() ? (g.key ?? null) : null)) : [];
		this.labels = isGrouped ? grouped.map(groupLabel) : [];
		this.evaluate = isGrouped ? propertyEvaluator(view, controller) : null;
	}

	/** Group index for a note outside the base, or -1 if it can't be determined. */
	groupOf(file: TFile): number {
		if (!this.evaluate) return -1;
		let value: Value | null;
		try {
			value = this.evaluate(file);
		} catch {
			return -1;
		}
		if (value instanceof NullValue) value = null;

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

function propertyEvaluator(
	view: BasesView,
	controller: QueryController,
): ((file: TFile) => Value | null) | null {
	const property = (view.config as unknown as InternalConfig).groupBy?.property;
	const createEntry = entryFactory(view, controller);
	if (!property || !createEntry) return null;
	return (file) => createEntry(file).getValue(property);
}

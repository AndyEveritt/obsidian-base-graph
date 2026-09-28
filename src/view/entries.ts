import {
	NullValue,
	type BasesEntry,
	type BasesPropertyId,
	type BasesView,
	type QueryController,
	type TFile,
	type Value,
} from 'obsidian';

/** Undocumented internals used to create entries for notes outside the base. */
interface InternalController {
	ctx?: unknown;
}
type EntryConstructor = new (ctx: unknown, file: TFile) => BasesEntry;

/**
 * Entries for any note: the base's own for its results, and created ones for notes
 * pulled in by depth, so their properties and formulas can be evaluated like the
 * base's own. Creating entries relies on internals, so it may be unavailable.
 */
export class EntryLookup {
	private entries: Map<string, BasesEntry>;
	private create: ((file: TFile) => BasesEntry) | null;

	constructor(view: BasesView, controller: QueryController) {
		this.entries = new Map(view.data.data.map((e) => [e.file.path, e]));
		this.create = entryFactory(view, controller);
	}

	get(file: TFile): BasesEntry | null {
		let entry = this.entries.get(file.path);
		if (entry || !this.create) return entry ?? null;
		try {
			entry = this.create(file);
		} catch {
			return null;
		}
		this.entries.set(file.path, entry);
		return entry;
	}

	/** A property's value for a note, or null if it has none or it can't be evaluated. */
	valueOf(file: TFile, property: BasesPropertyId): Value | null {
		let value: Value | null;
		try {
			value = this.get(file)?.getValue(property) ?? null;
		} catch {
			return null;
		}
		return value instanceof NullValue ? null : value;
	}
}

function entryFactory(
	view: BasesView,
	controller: QueryController,
): ((file: TFile) => BasesEntry) | null {
	const ctx = (controller as unknown as InternalController).ctx;
	const sample = view.data.data[0];
	if (!ctx || !sample) return null;
	const Entry = sample.constructor as EntryConstructor;
	return (file) => new Entry(ctx, file);
}

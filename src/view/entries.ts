import type { BasesEntry, BasesView, QueryController, TFile } from 'obsidian';

/** Undocumented internals used to create entries for notes outside the base. */
interface InternalController {
	ctx?: unknown;
}
type EntryConstructor = new (ctx: unknown, file: TFile) => BasesEntry;

/**
 * Creates entries for notes that aren't in the base's results, so their properties
 * and formulas can be evaluated like the base's own. Returns null if the internals
 * it relies on aren't available.
 */
export function entryFactory(
	view: BasesView,
	controller: QueryController,
): ((file: TFile) => BasesEntry) | null {
	const ctx = (controller as unknown as InternalController).ctx;
	const sample = view.data.data[0];
	if (!ctx || !sample) return null;
	const Entry = sample.constructor as EntryConstructor;
	return (file) => new Entry(ctx, file);
}

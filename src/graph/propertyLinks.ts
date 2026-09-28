import { getLinkpath, type MetadataCache, type TFile } from 'obsidian';
import type { Links } from './linkIndex';

interface NoteLinks {
	/** Target path → index of the property linking to it. */
	resolved: Map<string, number>;
	/** Link text → index of the property linking to it. */
	unresolved: Map<string, number>;
}

/**
 * Only the links in chosen note properties, such as `parent` or `related`, read from the
 * metadata cache's frontmatter links. Other links can be kept too, as links of kind -1.
 * Built fresh for each render and filled in lazily, so nothing needs invalidating.
 */
export class PropertyLinks implements Links {
	private notes = new Map<string, NoteLinks>();
	private incomingMap: Map<string, string[]> | null = null;
	private properties: string[];

	/**
	 * @param properties - Property names, matched case-insensitively.
	 * @param others - Where to take other links from, or null to leave them out.
	 */
	constructor(
		private metadataCache: MetadataCache,
		properties: string[],
		private getNotes: () => TFile[],
		private others: Links | null,
	) {
		this.properties = properties.map((p) => p.toLowerCase());
	}

	outgoing(path: string): string[] {
		return this.withOthers([...this.linksOf(path).resolved.keys()], (o) => o.outgoing(path));
	}

	unresolved(path: string): string[] {
		return this.withOthers([...this.linksOf(path).unresolved.keys()], (o) => o.unresolved(path));
	}

	incoming(path: string): string[] {
		if (!this.incomingMap) this.incomingMap = this.buildIncoming();
		return this.withOthers(this.incomingMap.get(path) ?? [], (o) => o.incoming(path));
	}

	kindOf(source: string, target: string): number {
		const links = this.linksOf(source);
		return links.resolved.get(target) ?? links.unresolved.get(target) ?? -1;
	}

	private withOthers(own: string[], others: (links: Links) => string[]): string[] {
		if (!this.others) return own;
		return [...new Set(own.concat(others(this.others)))];
	}

	private linksOf(path: string): NoteLinks {
		let links = this.notes.get(path);
		if (links) return links;
		links = { resolved: new Map(), unresolved: new Map() };
		this.notes.set(path, links);
		for (const ref of this.metadataCache.getCache(path)?.frontmatterLinks ?? []) {
			const kind = this.propertyOf(ref.key);
			if (kind < 0) continue;
			const linkpath = getLinkpath(ref.link);
			const file = this.metadataCache.getFirstLinkpathDest(linkpath, path);
			const [map, key] = file ? [links.resolved, file.path] : [links.unresolved, linkpath];
			if (!map.has(key)) map.set(key, kind);
		}
		return links;
	}

	/** Keys are the property name, or the name then `.` and an index or key for lists and objects. */
	private propertyOf(key: string): number {
		const lower = key.toLowerCase();
		return this.properties.findIndex((p) => lower === p || lower.startsWith(p + '.'));
	}

	private buildIncoming(): Map<string, string[]> {
		const map = new Map<string, string[]>();
		for (const note of this.getNotes()) {
			for (const target of this.linksOf(note.path).resolved.keys()) {
				let list = map.get(target);
				if (!list) map.set(target, (list = []));
				list.push(note.path);
			}
		}
		return map;
	}
}

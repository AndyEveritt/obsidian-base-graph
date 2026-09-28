import type { MetadataCache } from 'obsidian';

/** Where the graph's links come from. */
export interface Links {
	/** Paths of existing files a note links to. */
	outgoing(path: string): string[];
	/** Paths of notes linking to a file. */
	incoming(path: string): string[];
	/** Link text of links from a note to files that don't exist. */
	unresolved(path: string): string[];
	/**
	 * Index of the link property a link came from, or -1 for any other link.
	 * `target` is a path, or the link text of an unresolved link.
	 */
	kindOf(source: string, target: string): number;
	/**
	 * How many times a note links to `target`, counting only links of the kind
	 * `kindOf` gives. `target` is a path, or the link text of an unresolved link.
	 */
	count(source: string, target: string): number;
}

/**
 * All links, from the metadata cache. Outgoing links read `resolvedLinks`
 * directly; backlinks need a reverse index, which is built lazily and
 * discarded whenever the cache changes.
 */
export class LinkIndex implements Links {
	private incomingMap: Map<string, string[]> | null = null;

	constructor(private metadataCache: MetadataCache) {}

	invalidate(): void {
		this.incomingMap = null;
	}

	outgoing(path: string): string[] {
		return Object.keys(this.metadataCache.resolvedLinks[path] ?? {});
	}

	unresolved(path: string): string[] {
		return Object.keys(this.metadataCache.unresolvedLinks[path] ?? {});
	}

	incoming(path: string): string[] {
		if (!this.incomingMap) this.incomingMap = this.buildIncoming();
		return this.incomingMap.get(path) ?? [];
	}

	kindOf(): number {
		return -1;
	}

	count(source: string, target: string): number {
		const { resolvedLinks, unresolvedLinks } = this.metadataCache;
		return resolvedLinks[source]?.[target] ?? unresolvedLinks[source]?.[target] ?? 0;
	}

	private buildIncoming(): Map<string, string[]> {
		const map = new Map<string, string[]>();
		const resolved = this.metadataCache.resolvedLinks;
		for (const source in resolved) {
			for (const target in resolved[source]) {
				let list = map.get(target);
				if (!list) map.set(target, (list = []));
				list.push(source);
			}
		}
		return map;
	}
}

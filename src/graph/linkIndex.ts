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
	 * The kinds of link from a note to `target`, one for each link property linking
	 * to it. `target` is a path, or the link text of an unresolved link.
	 */
	kinds(source: string, target: string): LinkKind[];
}

export interface LinkKind {
	/** Index of the link property the link came from, or -1 for any other link. */
	kind: number;
	/** How many times the note links to the target this way. */
	count: number;
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

	kinds(source: string, target: string): LinkKind[] {
		const { resolvedLinks, unresolvedLinks } = this.metadataCache;
		const count = resolvedLinks[source]?.[target] ?? unresolvedLinks[source]?.[target] ?? 0;
		return [{ kind: -1, count }];
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

import type { MetadataCache } from 'obsidian';

/**
 * Link lookups over the metadata cache. Outgoing links read `resolvedLinks`
 * directly; backlinks need a reverse index, which is built lazily and
 * discarded whenever the cache changes.
 */
export class LinkIndex {
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

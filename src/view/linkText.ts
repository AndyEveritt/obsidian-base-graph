import { parseLinktext } from 'obsidian';
import type { LabelPart } from '../graph/types';

const WIKILINK = /\[\[([^\]]+)\]\]/g;

/**
 * Splits text into plain parts and links, with links shown by their display text,
 * like `NASA, ESA` for `[[NASA]], [[ESA]]`. Links resolve from `sourcePath`.
 */
export function linkParts(value: string, sourcePath: string): LabelPart[] {
	const parts: LabelPart[] = [];
	let end = 0;
	for (const match of value.matchAll(WIKILINK)) {
		if (match.index > end) parts.push({ text: value.slice(end, match.index), link: null });
		const inner = match[1]!;
		const linktext = inner.split('|')[0]!.trim();
		parts.push({ text: linkDisplay(inner), link: linktext ? { linktext, sourcePath } : null });
		end = match.index + match[0].length;
	}
	if (end < value.length) parts.push({ text: value.slice(end), link: null });
	return parts;
}

/** Text with each link replaced by its display text. */
export function displayText(value: string): string {
	return linkParts(value, '')
		.map((part) => part.text)
		.join('');
}

/**
 * Text with each link replaced by the path of the note it resolves to, so links to one
 * note match however they're written, like `[[ProjA]]` and `[[folder/ProjA|Project A]]`.
 * Unresolved links keep their link text. Headings and blocks are dropped.
 */
export function resolvedText(value: string, resolve: (linkpath: string) => string | null): string {
	return value.replace(WIKILINK, (_, inner: string) => {
		const { path } = parseLinktext(inner.split('|')[0]!.trim());
		return `[[${resolve(path) ?? path}]]`;
	});
}

/** The alias if there is one, otherwise the linked note's name without its folder. */
function linkDisplay(inner: string): string {
	const [target = '', alias] = inner.split('|');
	if (alias?.trim()) return alias.trim();
	const { path, subpath } = parseLinktext(target.trim());
	return (path.split('/').pop() ?? path) + subpath;
}

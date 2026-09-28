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

/** The alias if there is one, otherwise the linked note's name without its folder. */
function linkDisplay(inner: string): string {
	const [target = '', alias] = inner.split('|');
	if (alias?.trim()) return alias.trim();
	const { path, subpath } = parseLinktext(target.trim());
	return (path.split('/').pop() ?? path) + subpath;
}

import { resolve } from './paths.ts';
import { sanitizeSvg } from './svg.ts';

/** Shared source loading for SVG parts and skeletal artwork, including compiled data URIs. */
export async function readSvgSource(source: string): Promise<string> {
	if (source.trimStart().startsWith('<')) return sanitizeSvg(source);
	const url = resolve(source);
	if (url.startsWith('data:')) {
		const comma = url.indexOf(',');
		if (comma < 0) throw new Error(`invalid SVG data URI for ${source}`);
		const text = /;base64/i.test(url.slice(0, comma))
			? new TextDecoder().decode(Uint8Array.from(atob(url.slice(comma + 1)), (c) => c.charCodeAt(0)))
			: decodeURIComponent(url.slice(comma + 1));
		return sanitizeSvg(text);
	}
	const response = await fetch(url);
	if (!response.ok) throw new Error(`SVG failed to load ${source}: ${response.status}`);
	return sanitizeSvg(await response.text());
}

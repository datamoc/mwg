/**
 * Inline sound markers for translated text. A marker is written as `{sound:path/to/cue.wav}`.
 * It is removed from displayed text, while its position is kept for a typewriter reveal.
 */

export interface InlineSoundCue {
	/** Sound path as written inside the marker. */
	path: string;
	/** UTF-16 character offset in the marker-free display text. */
	index: number;
}

export interface ParsedSoundText {
	text: string;
	cues: InlineSoundCue[];
}

const SOUND_MARKER = /\{sound:([^{}\r\n]+)\}/g;

/**
 * Splits inline sound markers from display text and records their visible positions.
 *
 * @example
 * ```ts
 * import { parseSoundMarkers } from '@datamoc/mw_games/i18n';
 *
 * parseSoundMarkers('Strike! {sound:hit.wav}');
 * // { text: 'Strike! ', cues: [{ path: 'hit.wav', index: 8 }] }
 * ```
 */
export function parseSoundMarkers(source: string): ParsedSoundText {
	const cues: InlineSoundCue[] = [];
	let text = '';
	let cursor = 0;
	let match: RegExpExecArray | null;

	SOUND_MARKER.lastIndex = 0;
	while ((match = SOUND_MARKER.exec(source)) !== null) {
		text += source.slice(cursor, match.index);
		const path = match[1].trim();
		if (path === '') text += match[0];
		else cues.push({ path, index: text.length });
		cursor = match.index + match[0].length;
	}

	text += source.slice(cursor);
	return { text, cues };
}

/**
 * Returns only the player-facing text, removing inline sound markers.
 *
 * @example
 * ```ts
 * import { stripSoundMarkers } from '@datamoc/mw_games/i18n';
 *
 * stripSoundMarkers('Strike! {sound:hit.wav}'); // 'Strike! '
 * ```
 */
export function stripSoundMarkers(source: string): string {
	return parseSoundMarkers(source).text;
}

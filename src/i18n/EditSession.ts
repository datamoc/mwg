import type { Catalog, MessageValue } from './index.ts';
import { catalogCompleteness, messageText } from './Content.ts';

/**
 * The testable core behind `tools/i18n-edit.mjs`: a base (reference-language) catalog and
 * the target catalog being translated, plus the pure operations a split-screen translation
 * editor needs. Nothing here touches the filesystem or the terminal - the tool owns file
 * IO and rendering, this module owns the catalog arithmetic, so both are verifiable with
 * plain unit tests.
 *
 * Audio cues are ordinary catalog entries under this scheme (`<key>.audio` holding a
 * sound path, read by the semantic formatter's `audio` channel), not a parallel map - so
 * associating a sound with a string is just setting one more key, and the translatable
 * key list simply skips `*.audio` entries rather than asking a translator to translate a
 * file path.
 *
 * @example
 * ```ts
 * import {
 *   AUDIO_SUFFIX, copyFromBase, createEditSession, cueKeyFor, deleteTargetKey,
 *   isAudioKey, sessionCompleteness, sessionKeys, sessionRow, sessionRows,
 *   setTargetSound, setTargetText, swapSession,
 * } from '@datamoc/mw_games/i18n';
 *
 * let session = createEditSession(
 *   { locale: 'en', direction: 'ltr', messages: { greeting: 'Hello!', 'hit.audio': 'sounds/hit.wav' } },
 *   { locale: 'fr', direction: 'ltr', messages: {} },
 * );
 *
 * sessionKeys(session); // ['greeting'] - 'hit.audio' is a cue, not translated
 * isAudioKey(`hit${AUDIO_SUFFIX}`); // true
 * sessionRow(session, 'greeting').status; // 'missing'
 * sessionRows(session, { missingOnly: true }).length; // 1
 * sessionCompleteness(session); // 0
 *
 * session = setTargetText(session, 'greeting', 'Bonjour !');
 * session = copyFromBase(session, 'greeting');
 * session = setTargetSound(session, 'hit', 'sons/coup.wav');
 * cueKeyFor(session, 'greeting'); // 'greeting.audio'
 * session = deleteTargetKey(session, 'greeting');
 * session = swapSession(session);
 * ```
 */

/** one translatable key as the editor shows it: reference text left, target text right */
export interface EditRow {
	key: string;
	baseText: string;
	/** '' when the target has no entry for this key yet */
	targetText: string;
	status: 'ok' | 'missing' | 'extra';
	/** effective cue: the target's own `<key>.audio`, else the base's, else the family's (see below) */
	sound?: string;
	/** the full audio key `sound` above came from, when any */
	soundKey?: string;
	/** true when `sound` above was inherited from the base catalog */
	soundInherited: boolean;
}

export interface EditSession {
	base: Catalog;
	target: Catalog;
}

export interface RowFilter {
	/** only keys missing from the target */
	missingOnly?: boolean;
	/** case-insensitive substring matched against key and both texts */
	query?: string;
}

export function createEditSession(base: Catalog, target: Catalog): EditSession {
	return { base, target };
}

/** the suffix marking a sound-cue entry rather than translatable text */
export const AUDIO_SUFFIX = '.audio';

export function isAudioKey(key: string): boolean {
	return key.endsWith(AUDIO_SUFFIX);
}

/** every translatable key across both catalogs, sorted; `*.audio` cues are not translated */
export function sessionKeys(session: EditSession): string[] {
	const keys = new Set([...Object.keys(session.base.messages), ...Object.keys(session.target.messages)]);
	return [...keys].filter((key) => !isAudioKey(key)).sort();
}

function audioText(value: MessageValue | undefined): string | undefined {
	if (value === undefined) return undefined;
	const text = messageText(value);
	return text === '' ? undefined : text;
}

/** text channels sharing one semantic type share its cue: `combat.damage.log` shows
 * `combat.damage.audio` when it has no `<key>.audio` of its own */
const TEXT_CHANNELS = ['log', 'compact', 'accessibility', 'debug'];

function familyAudioKey(key: string): string | undefined {
	const dot = key.lastIndexOf('.');
	if (dot <= 0 || !TEXT_CHANNELS.includes(key.slice(dot + 1))) return undefined;
	return `${key.slice(0, dot)}${AUDIO_SUFFIX}`;
}

export function sessionRow(session: EditSession, key: string): EditRow {
	const baseValue = session.base.messages[key];
	const targetValue = session.target.messages[key];
	const status = baseValue !== undefined && targetValue !== undefined ? 'ok' : baseValue === undefined ? 'extra' : 'missing';
	const cueKeys = [`${key}${AUDIO_SUFFIX}`];
	const family = familyAudioKey(key);
	if (family) cueKeys.push(family);
	let sound: string | undefined;
	let soundKey: string | undefined;
	let soundInherited = false;
	for (const candidate of cueKeys) {
		const own = audioText(session.target.messages[candidate]);
		if (own !== undefined) {
			sound = own;
			soundKey = candidate;
			break;
		}
		const inherited = audioText(session.base.messages[candidate]);
		if (inherited !== undefined) {
			sound = inherited;
			soundKey = candidate;
			soundInherited = true;
			break;
		}
	}
	return {
		key,
		baseText: baseValue === undefined ? '' : messageText(baseValue),
		targetText: targetValue === undefined ? '' : messageText(targetValue),
		status,
		sound,
		soundKey,
		soundInherited,
	};
}

/**
 * Which audio key `setTargetSound` writes for `key`: the key's own `<key>.audio` when one
 * already exists on either side, else the family's (`<type>.audio` for a channel key),
 * else the key's own. One cue per family rather than one per channel.
 */
export function cueKeyFor(session: EditSession, key: string): string {
	const own = `${key}${AUDIO_SUFFIX}`;
	if (own in session.target.messages || own in session.base.messages) return own;
	return familyAudioKey(key) ?? own;
}

export function sessionRows(session: EditSession, filter: RowFilter = {}): EditRow[] {
	const query = filter.query?.toLowerCase() ?? '';
	return sessionKeys(session)
		.map((key) => sessionRow(session, key))
		.filter((row) => !filter.missingOnly || row.status === 'missing')
		.filter(
			(row) =>
				query === '' ||
				row.key.toLowerCase().includes(query) ||
				row.baseText.toLowerCase().includes(query) ||
				row.targetText.toLowerCase().includes(query),
		);
}

/**
 * Sets the target's text for `key`, preserving a plural structure when the new text parses
 * as a plain JSON object over an existing plural entry - otherwise the entry becomes the
 * string as typed. A select message (from an FTL source) edited here downgrades to a
 * plain string; the tool warns about that on save rather than this function refusing it.
 */
export function setTargetText(session: EditSession, key: string, text: string): EditSession {
	const current = session.target.messages[key] ?? session.base.messages[key];
	let value: MessageValue = text;
	if (current !== undefined && typeof current === 'object' && !('format' in current)) {
		try {
			const parsed: unknown = JSON.parse(text);
			if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
				value = parsed as Record<string, string>;
			}
		} catch {
			// not JSON - keep the string as typed
		}
	}
	return { ...session, target: { ...session.target, messages: { ...session.target.messages, [key]: value } } };
}

/** fills a missing target entry with the base language's own value, plural structure included */
export function copyFromBase(session: EditSession, key: string): EditSession {
	const baseValue = session.base.messages[key];
	if (baseValue === undefined) throw new Error(`copyFromBase: "${key}" is not a key in the base catalog`);
	return { ...session, target: { ...session.target, messages: { ...session.target.messages, [key]: baseValue } } };
}

export function deleteTargetKey(session: EditSession, key: string): EditSession {
	if (!(key in session.target.messages)) throw new Error(`deleteTargetKey: "${key}" is not a key in the target catalog`);
	const messages = { ...session.target.messages };
	delete messages[key];
	return { ...session, target: { ...session.target, messages } };
}

/**
 * Associates a sound cue with `key` by setting the target's audio entry (`cueKeyFor`
 * picks the family's `<type>.audio` for a channel key with no cue of its own). An empty
 * path clears the cue (removing the entry rather than storing an empty string, which
 * `validateMessageAudio` would flag).
 */
export function setTargetSound(session: EditSession, key: string, path: string): EditSession {
	const messages = { ...session.target.messages };
	const audioKey = cueKeyFor(session, key);
	if (path === '') delete messages[audioKey];
	else messages[audioKey] = path;
	return { ...session, target: { ...session.target, messages } };
}

/** fraction of the base catalog's translatable keys the target also has; cue keys excluded */
export function sessionCompleteness(session: EditSession): number {
	const stripAudio = (catalog: Catalog): Catalog => ({
		...catalog,
		messages: Object.fromEntries(Object.entries(catalog.messages).filter(([key]) => !isAudioKey(key))),
	});
	return catalogCompleteness(stripAudio(session.base), stripAudio(session.target));
}

/** swaps which catalog is the reference and which is edited, for main-language-to-main-language work */
export function swapSession(session: EditSession): EditSession {
	return { base: session.target, target: session.base };
}

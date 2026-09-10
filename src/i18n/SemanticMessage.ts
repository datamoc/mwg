import { t, tRaw, has, type MessageParams } from './index.ts';

/**
 * A structured communication intent, not a finished sentence: a type naming what happened,
 * plus the parameters a catalog needs to say it. The same message renders as a full log
 * line, a compact HUD number, an accessibility announcement, or a debug dump, all from one
 * event the simulation only has to produce once.
 *
 * `params` must already be interpolation-ready by the time a message reaches
 * `MessageFormatter.format` - a game resolves any entity/item id to display text itself
 * (typically through its own `EntityTextResolver`) while building the message, the same way
 * it decides everything else about its own vocabulary. MWG only defines the shape.
 */
export interface SemanticMessage<
	TType extends string = string,
	TParams extends Record<string, unknown> = Record<string, unknown>,
> {
	type: TType;
	params: TParams;
}

/**
 * Resolves a game-defined entity/item id to the display text a message substitutes for it.
 * A type contract only - MWG never calls this itself; a game calls it while building a
 * `SemanticMessage`'s params, the same way it already owns every other piece of vocabulary.
 */
export type EntityTextResolver<Id = string> = (id: Id) => string;

/**
 * Optional linguistic metadata about one entity - gender, number, or a proper-noun flag a
 * catalog's own grammar rules may need to pick an article or an agreement. MWG never
 * interprets this itself; it exists so a game's `EntityTextResolver` and catalog can agree
 * on a common shape instead of each game inventing its own.
 */
export interface GrammaticalEntity {
	gender?: 'masculine' | 'feminine' | 'neuter' | 'common';
	plural?: boolean;
	properNoun?: boolean;
	/** other lexical forms a catalog's grammar might need - a possessive, a vocative */
	forms?: Record<string, string>;
}

/** Where the same semantic message ends up: a game log line, a compact HUD number, an
 * accessibility announcement, a debug dump, or the sound effect played alongside it - one
 * simulation event, several presentations. The `audio` entry holds a sound path (an asset
 * path `mwg/audio`'s `Sound` plays), not display text, so it resolves through `tRaw`
 * rather than `t()`: no typographic spacing, no right-to-left wrapping. */
export type MessageChannel = 'log' | 'compact' | 'accessibility' | 'debug' | 'audio';

export interface MessageFormatter {
	format(message: SemanticMessage, channel: MessageChannel): string;
}

/**
 * The reference `MessageFormatter`: looks up `${type}.${channel}` in the active catalog
 * (`setBase`/`setActive`, `src/i18n/index.ts`), falling back to `${type}` alone for a message
 * that reads the same on every channel, then formats through `t()` - the same interpolation,
 * pluralisation and RTL handling every other message in the game already gets. A catalog
 * missing both keys fails the same observable way `t()` already does for any key: returning
 * the lookup key itself, rather than throwing or going silent.
 *
 * @example
 * ```ts
 * import { setBase, createCatalogFormatter, type SemanticMessage } from '@datamoc/mw_games/i18n';
 *
 * setBase({
 *   locale: 'en',
 *   direction: 'ltr',
 *   messages: {
 *     'combat.damage.log': 'The {target} takes {amount} damage.',
 *     'combat.damage.compact': '-{amount} HP',
 *   },
 * });
 *
 * const formatter = createCatalogFormatter();
 * const message: SemanticMessage = { type: 'combat.damage', params: { target: 'gnoll', amount: 7 } };
 *
 * console.log(formatter.format(message, 'log'));     // 'The gnoll takes 7 damage.'
 * console.log(formatter.format(message, 'compact'));  // '-7 HP'
 * console.log(formatter.format(message, 'debug'));    // falls back to the bare type: the key itself, if undeclared
 * console.log(formatter.format(message, 'audio'));    // 'sounds/sword-hit.wav', or '' when no '<type>.audio' entry exists
 * ```
 *
 * The `audio` channel is deliberately narrower than the text channels: it resolves only
 * `<type>.audio`, never falling back to the bare type the way text does. A bare type
 * holding a sentence (`'combat.damage': 'combat.damage generic'`) is not a playable path,
 * so falling back to it would hand the game garbage to load. Sounds that need no
 * per-channel variation are still shared - every text channel already falls back to the
 * same bare type, while `audio` stays a separate entry a translator never touches and the
 * base language usually owns alone (runtime lookup falls back to the base catalog, so a
 * translated catalog needs no copy of it).
 */
export function createCatalogFormatter(): MessageFormatter {
	return {
		format(message: SemanticMessage, channel: MessageChannel): string {
			const params = message.params as MessageParams;
			if (channel === 'audio') {
				const key = `${message.type}.audio`;
				return has(key) ? tRaw(key, params) : '';
			}
			const key = `${message.type}.${channel}`;
			return has(key) ? t(key, params) : t(message.type, params);
		},
	};
}

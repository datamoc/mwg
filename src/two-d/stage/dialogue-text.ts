import type { Catalog, Direction } from '../../i18n/index.ts';
import type { StageCommand, StoryScript } from './script.ts';

/**
 * A terse, line-based text format for straight (non-branching) dialogue - the
 * counterpart to `twee.ts`'s passage graphs, for the common case of a scene
 * that is just a sequence of lines. `rpg` has its own, independent copy of this
 * same format (`rpg.parseDialogueText`, targeting `EventCommand`) for a
 * text-only RPG's map events - declared separately here for the same reason
 * `EventChoice` is declared separately from this module's own `Choice`: a
 * text-only RPG built on `core` and `rpg` alone should not have to depend on
 * `two-d` (and its Pixi peer dependency) just to parse dialogue text, and a
 * Pixi-based visual novel that never touches map events should not have to
 * pull in `rpg` either. Three kinds of line:
 *
 * - `@id text` names who is speaking and says `text`; `@id` alone (no text)
 *   just registers the speaker, without saying anything yet.
 * - `- text` continues the two-speaker exchange the first two `@id` lines
 *   opened, alternating speaker on every line: the first `-` after the two
 *   openers goes to whichever of them did not speak last, and so on.
 * - any other non-blank line narrates, with no speaker.
 *
 * ```
 * @alice Hello.
 * @bob Hi!
 * - How are you?
 * - Fine, and you?
 * ```
 *
 * The `-` shorthand is deliberately capped at two speakers: it exists for the
 * two-character back-and-forth, not as a guess at which of three or more
 * people talks next. A third distinct `@id` anywhere in the source is a
 * parse error rather than a silent guess; a scene with more than two
 * speakers writes `@id` on every line instead, same as it does today.
 *
 * Like `twee.ts`, lines reach `StageCommand.say` as plain, untranslated
 * text - a game's own translation step decides how that text reaches a
 * player, the same seam MWL's own `_("...")`-marked strings use (the source
 * text doubles as the catalog key). `extractDialogueCatalog` builds that
 * catalog the same way MWL's `extractCatalog` does, for a game that wants a
 * translator-ready file to start from.
 *
 * @example
 * ```ts
 * import { parseDialogueText, StageScript } from '@datamoc/mw_games/two-d';
 *
 * declare const script: StageScript;
 *
 * const commands = parseDialogueText(`
 * @alice Hello.
 * @bob Hi!
 * - How are you?
 * - Fine, and you?
 * `);
 * await script.run(commands);
 * ```
 */
export function parseDialogueText(source: string): StageCommand[] {
	const commands: StageCommand[] = [];
	const established: string[] = [];
	let lastSpeaker: string | undefined;

	const register = (id: string): void => {
		if (established.includes(id)) return;
		if (established.length >= 2) {
			throw new Error(
				`dialogue text supports at most two speakers for the "-" shorthand; found a third speaker ` +
					`"${id}" after "${established[0]}" and "${established[1]}" were already established`,
			);
		}
		established.push(id);
	};

	for (const rawLine of source.split('\n')) {
		const line = rawLine.trim();
		if (line === '') continue;

		const at = /^@(\S+)(?:\s+(.*))?$/.exec(line);
		if (at) {
			const [, id, text] = at;
			register(id);
			if (text) {
				commands.push({ say: text.trim(), as: id });
				lastSpeaker = id;
			}
			continue;
		}

		if (line.startsWith('-')) {
			if (established.length < 2) {
				throw new Error(
					'a "-" line needs two established speakers first (write two "@id text" lines before it)',
				);
			}
			const text = line.slice(1).trim();
			const speaker = established.find((id) => id !== lastSpeaker) ?? established[0];
			commands.push({ say: text, as: speaker });
			lastSpeaker = speaker;
			continue;
		}

		commands.push({ say: line });
		lastSpeaker = undefined;
	}

	return commands;
}

/**
 * Collects every `say`/`ask` line's text into an identity catalog - each key
 * mapping to itself, the same shape MWL's own `extractCatalog` builds from
 * `_("...")`-marked strings - so a translator has real entries to work from
 * instead of a wall of untranslated dialogue. Accepts either a flat command
 * list (`parseDialogueText`'s own output) or a `StoryScript` graph
 * (`importTwee`'s), so the same extraction step covers both dialogue paths.
 *
 * @example
 * ```ts
 * import { parseDialogueText, extractDialogueCatalog } from '@datamoc/mw_games/two-d';
 *
 * const commands = parseDialogueText('@alice Hello.\n');
 * console.log(extractDialogueCatalog(commands).messages); // { 'Hello.': 'Hello.' }
 * ```
 */
export function extractDialogueCatalog(
	commands: readonly StageCommand[] | StoryScript,
	options: { locale?: string; direction?: Direction } = {},
): Catalog {
	const messages: Record<string, string> = {};
	const collect = (list: readonly StageCommand[]): void => {
		for (const command of list) {
			if ('say' in command) messages[command.say] = command.say;
			else if ('ask' in command) messages[command.ask] = command.ask;
		}
	};
	if (Array.isArray(commands)) collect(commands);
	else for (const list of Object.values(commands)) collect(list);

	return { locale: options.locale ?? 'en', direction: options.direction ?? 'ltr', messages };
}

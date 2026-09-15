/**
 * The terse `@id`/`-` dialogue-text parsing engine behind both `two-d/stage.parseDialogueText`
 * and `rpg.parseDialogueText` - the two-speaker alternation state machine lives here once,
 * in `core` (already the home of `parseCSV`, another generic text-format parser that other
 * modules build their own typed result around), so a rule change or a bug fix lands in one
 * place instead of two silently-drifting copies. Each module's own wrapper only maps
 * `DialogueLine` onto its own command shape - `StageCommand`'s `as` versus `EventCommand`'s
 * `speaker` is the one real difference between them.
 *
 * Three kinds of line:
 *
 * - `@id text` names who is speaking and says `text`; `@id` alone (no text) just registers
 *   the speaker, without saying anything yet.
 * - `- text` continues the two-speaker exchange the first two `@id` lines opened,
 *   alternating speaker on every line: the first `-` after the two openers goes to
 *   whichever of them did not speak last, and so on.
 * - any other non-blank line narrates, with no speaker.
 *
 * ```
 * @alice Hello.
 * @bob Hi!
 * - How are you?
 * - Fine, and you?
 * ```
 *
 * The `-` shorthand is deliberately capped at two speakers: it exists for the two-character
 * back-and-forth, not as a guess at which of three or more people talks next. A third
 * distinct `@id` anywhere in the source is a parse error rather than a silent guess.
 *
 * @example
 * ```ts
 * import { parseDialogueLines, type DialogueLine } from '@datamoc/mw_games/core';
 *
 * const lines: DialogueLine[] = parseDialogueLines(`
 * @alice Hello.
 * @bob Hi!
 * - How are you?
 * `);
 * console.log(lines); // [{ text: 'Hello.', speaker: 'alice' }, ...]
 * ```
 */
export interface DialogueLine {
	text: string;
	speaker?: string;
}

export function parseDialogueLines(source: string): DialogueLine[] {
	const lines: DialogueLine[] = [];
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
				lines.push({ text: text.trim(), speaker: id });
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
			lines.push({ text, speaker });
			lastSpeaker = speaker;
			continue;
		}

		lines.push({ text: line });
		lastSpeaker = undefined;
	}

	return lines;
}

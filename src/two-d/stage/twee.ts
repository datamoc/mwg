import { parseTwee } from '../../core/Twee.ts';
import type { StoryScript } from './script.ts';

/**
 * A story imported from Twine's Twee notation, ready for `StageScript.runStory`.
 */
export interface TwineStory {
	story: StoryScript;
	/** `StoryData`'s start passage when the file names one, else the first passage */
	start: string;
	/** the `StoryTitle` passage, when the file has one */
	title?: string;
}

/**
 * Reads a `.twee` file into a `StoryScript`.
 *
 * The actual parsing (passages, `[[links]]`, `StoryData`/`StoryTitle`) lives once in
 * `core.parseTwee` - `rpg.importTwee` is the same wrapper around the same engine, targeting
 * `EventStoryScript` instead, declared separately for the same reason `EventChoice` already
 * duplicates `two-d/ui`'s `Choice`: a text-only RPG should not have to depend on `two-d` just
 * to import a branching Twee story, and a Pixi-based visual novel that never touches map
 * events should not have to depend on `rpg` either. `core.parseTwee`'s own doc comment covers
 * the notation itself (passages, links, what a macro-carrying link does).
 *
 * @example
 * ```ts
 * import { importTwee, StageScript } from '@datamoc/mw_games/two-d';
 *
 * declare const tweeSource: string;
 * declare const script: StageScript;
 *
 * const story = importTwee(tweeSource);
 * await script.runStory(story.story, story.start);
 * ```
 */
export function importTwee(source: string): TwineStory {
	const { story, start, title } = parseTwee(source);
	return title === undefined ? { story, start } : { story, start, title };
}

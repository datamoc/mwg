import { parseTwee } from '../core/Twee.ts';
import type { EventStoryScript } from './EventRunner.ts';

/**
 * A story imported from Twine's Twee notation, ready for `EventRunner.runStory`.
 *
 * The `two-d/stage` counterpart, `importTwee`, targets `StageCommand`/`StoryScript` instead -
 * declared independently here for the same reason `EventChoice` already duplicates
 * `two-d/ui`'s `Choice`: a text-only RPG (`core` plus `rpg`, no renderer at all) should not
 * have to depend on `two-d` just to import a branching Twee story, and a Pixi-based visual
 * novel that never touches map events should not have to depend on `rpg` either.
 */
export interface EventTwineStory {
	story: EventStoryScript;
	/** `StoryData`'s start passage when the file names one, else the first passage */
	start: string;
	/** the `StoryTitle` passage, when the file has one */
	title?: string;
}

/**
 * Reads a `.twee` file into an `EventStoryScript`.
 *
 * The actual parsing (passages, `[[links]]`, `StoryData`/`StoryTitle`) lives once in
 * `core.parseTwee` - this is a thin wrapper naming the `rpg`-specific return type, the same
 * way `two-d/stage.importTwee` wraps the same engine for `StageCommand`.
 *
 * @example
 * ```ts
 * import { importTwee, EventRunner, GameState, type DialoguePresenter } from '@datamoc/mw_games/rpg';
 *
 * declare const present: DialoguePresenter;
 *
 * const story = importTwee(`:: Start
 * You stand at a crossroads.
 *
 * [[Take the left path->Left]]
 * [[Take the right path->Right]]
 *
 * :: Left
 * The path ends at a wall.
 *
 * :: Right
 * An open road.
 * `);
 * const runner = new EventRunner({ present, game: new GameState() });
 * await runner.runStory(story.story, story.start);
 * ```
 */
export function importTwee(source: string): EventTwineStory {
	const { story, start, title } = parseTwee(source);
	return title === undefined ? { story, start } : { story, start, title };
}

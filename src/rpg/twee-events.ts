import type { EventChoice, EventStoryScript } from './EventRunner.ts';

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
 * Only structure is imported, the same restraint `two-d/stage`'s `importTwee` applies: each
 * passage's text lines become `say` commands and its `[[links]]` become one closing `ask`
 * whose choices jump (`[[text]]`, `[[text->target]]` and `[[target<-text]]`) - the last text
 * line doubles as the question. No story-format macro language is interpreted - body text
 * reaches the game untouched, and a link carrying a setter throws instead of silently
 * dropping the behaviour the setter described.
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
	const passages = splitPassages(source);
	if (passages.length === 0) throw new Error('this twee source has no passages - passages start with ":: Name"');

	const story: EventStoryScript = {};
	let title: string | undefined;
	let start: string | undefined;
	for (const passage of passages) {
		if (passage.name === 'StoryTitle') {
			title = passage.body.trim() || undefined;
			continue;
		}
		if (passage.name === 'StoryData') {
			start = readStart(passage.body);
			continue;
		}
		if (Object.prototype.hasOwnProperty.call(story, passage.name)) {
			throw new Error(`this twee source defines "${passage.name}" twice`);
		}
		story[passage.name] = passageCommands(passage.name, passage.body);
	}

	const names = Object.keys(story);
	if (names.length === 0) throw new Error('this twee source has no story passages, only StoryTitle/StoryData');
	if (start !== undefined && !Object.prototype.hasOwnProperty.call(story, start)) {
		throw new Error(`StoryData starts at "${start}", which is not a passage in this file`);
	}
	for (const [name, commands] of Object.entries(story)) {
		for (const command of commands) {
			if ('ask' in command) {
				for (const choice of command.choices) {
					if (choice.goto !== undefined && !Object.prototype.hasOwnProperty.call(story, choice.goto)) {
						throw new Error(
							`passage "${name}" links to "${choice.goto}", which is not a passage in this file`,
						);
					}
				}
			}
		}
	}

	return { story, start: start ?? names[0], title };
}

interface RawPassage {
	name: string;
	body: string;
}

/** cuts the source at every line starting with `::`, parsing headers into names */
function splitPassages(source: string): RawPassage[] {
	const out: RawPassage[] = [];
	let name: string | null = null;
	let body: string[] = [];
	const flush = () => {
		if (name !== null) out.push({ name, body: body.join('\n') });
	};
	for (const line of source.split('\n')) {
		if (line.startsWith('::')) {
			flush();
			name = parseHeader(line);
			body = [];
		} else if (name !== null) {
			body.push(line);
		}
	}
	flush();
	return out;
}

/** `:: Name [tags] {"meta": true}` - only the name survives; tags and position are editor concerns */
function parseHeader(line: string): string {
	const rest = line.slice(2).trim();
	const tagAt = rest.search(/[[{]/);
	const name = (tagAt === -1 ? rest : rest.slice(0, tagAt)).trim();
	if (!name) throw new Error(`a twee passage header needs a name, got "${line}"`);
	return name;
}

/** StoryData is JSON; only `start` matters to the runner, the rest is player furniture */
function readStart(body: string): string | undefined {
	let data: unknown;
	try {
		data = JSON.parse(body.trim());
	} catch {
		throw new Error('StoryData must be JSON - check the braces');
	}
	if (typeof data !== 'object' || data === null || Array.isArray(data)) {
		throw new Error('StoryData must be a JSON object');
	}
	const start = (data as { start?: unknown }).start;
	if (start !== undefined && typeof start !== 'string') {
		throw new Error('StoryData "start" must be a passage name');
	}
	return start;
}

/** text lines speak in order; the last one doubles as the prompt when links follow it */
function passageCommands(passage: string, body: string): EventStoryScript[string] {
	const lines: string[] = [];
	const choices: EventChoice[] = [];
	for (const line of body.split('\n')) {
		const text = extractLinks(line, choices, passage).replace(/\s+/g, ' ').trim();
		if (text !== '') lines.push(text);
	}
	if (choices.length === 0) return lines.map((say) => ({ say }));
	const prompt = lines.pop() ?? '';
	return [...lines.map((say) => ({ say })), { ask: prompt, choices }];
}

/**
 * Pulls `[[links]]` out of a line, leaving the surrounding text behind.
 * Returns the line with the links removed.
 */
function extractLinks(line: string, choices: EventChoice[], passage: string): string {
	let out = '';
	let rest = line;
	for (;;) {
		const open = rest.indexOf('[[');
		if (open === -1) return out + rest;
		const close = rest.indexOf(']]', open);
		if (close === -1) {
			throw new Error(`passage "${passage}" has a "[[" with no closing "]]" in "${line.trim()}"`);
		}
		out += rest.slice(0, open);
		choices.push(parseLink(rest.slice(open + 2, close), passage));
		rest = rest.slice(close + 2);
	}
}

function parseLink(inner: string, passage: string): EventChoice {
	if (inner.includes('[') || inner.includes(']')) {
		throw new Error(
			`passage "${passage}" links with a setter ("${inner.trim()}") - ` +
				'story-format macros are not imported, so the link is refused rather than half-read',
		);
	}
	const forward = inner.indexOf('->');
	if (forward !== -1) {
		return { text: inner.slice(0, forward).trim(), goto: inner.slice(forward + 2).trim() };
	}
	const backward = inner.indexOf('<-');
	if (backward !== -1) {
		return { text: inner.slice(backward + 2).trim(), goto: inner.slice(0, backward).trim() };
	}
	const target = inner.trim();
	return { text: target, goto: target };
}

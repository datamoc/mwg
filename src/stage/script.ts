import type { Texture } from 'pixi.js';
import { MessageBox, type Choice } from '../ui/MessageBox.ts';
import type { WindowStack } from '../ui/WindowStack.ts';
import type { DialogueStage, SlotName } from './DialogueStage.ts';

/**
 * A scene, written as data.
 *
 * A scripted conversation is a list of instructions, not a function. That is deliberate:
 * the same list can be written by hand, generated, translated, or one day produced by an
 * editor, and none of those need the runtime to change. It is also what lets the RPG event
 * interpreter and this share a format later: a cutscene on a tile map is the same list
 * with a different backdrop.
 */
export type StageCommand =
	| { backdrop: string; fade?: number }
	| { show: string; at?: SlotName | number; expression?: string; fade?: number }
	| { hide: string; fade?: number }
	| { hideAll: true; fade?: number }
	| { expression: string; of: string }
	| { say: string; as?: string; speaker?: string }
	| { ask: string; as?: string; speaker?: string; choices: StageChoice[]; store?: string }
	| { goto: string }
	| { wait: number }
	| { call: (state: ScriptState) => void | Promise<void> };

/**
 * A choice that can also move the story: when the player picks it inside
 * `runStory`, the story jumps to the named passage afterwards. Plain `Choice`
 * objects stay valid - every one of them is already a `StageChoice` that goes
 * nowhere - and a `MessageBox` never sees the extra field.
 */
export type StageChoice = Choice & {
	/** the passage to jump to when this choice is picked, in a `runStory` story */
	goto?: string;
};

/**
 * A story as a graph of named passages, each a list of commands - Twine's shape
 * rather than a straight line. Passages can loop back or braid together; reaching
 * the end of a passage ends the story.
 */
export type StoryScript = Record<string, readonly StageCommand[]>;

export interface ScriptState {
	/** whatever `ask` commands have stored, keyed by their `store` name */
	answers: Record<string, unknown>;
}

/** one completed line, kept for `StageScript.history`/`showLast` */
export interface HistoryEntry {
	text: string;
	speaker?: string;
	/** the value picked, when this line ended on choices; undefined for a plain line */
	chosen?: unknown;
}

export interface ScriptOptions {
	stage: DialogueStage;
	windows: WindowStack;

	/** resolves a backdrop name from a command to a texture */
	backdrop: (name: string) => Texture;

	/** the name shown for a character id, when a `say` gives no explicit speaker */
	displayName?: (id: string) => string;

	/** width of the dialogue box; defaults to most of the stage */
	boxWidth?: number;
	boxHeight?: number;

	/** characters revealed per second */
	speed?: number;

	/** `'adv'` (default) or `'nvl'`, `MessageBox`'s two display modes; see `MessageBoxOptions.mode` */
	mode?: 'adv' | 'nvl';
}

/**
 * Runs a scene.
 *
 * `run` resolves when the list is exhausted, so a caller can simply await a conversation
 * and carry on afterwards, which is what makes a cutscene readable at the call site
 * instead of a chain of callbacks.
 */
export class StageScript {
	private options: ScriptOptions;
	readonly state: ScriptState = { answers: {} };

	private cancelled = false;

	private historyLog: HistoryEntry[] = [];
	private seenLines = new Set<string>();

	/**
	 * When true, a line whose exact text has already been shown once this script's lifetime
	 * reveals at once and advances on its own instead of waiting for `confirm` - common
	 * visual-novel "skip already-read text". A line with choices never skips: those always
	 * wait for a real answer.
	 */
	skipSeen = false;

	constructor(options: ScriptOptions) {
		this.options = options;
	}

	cancel(): void {
		this.cancelled = true;
	}

	/** every line completed so far, oldest first */
	get history(): readonly HistoryEntry[] {
		return this.historyLog;
	}

	/**
	 * Re-shows the most recently completed line for review: a player-facing "back" a game
	 * can wire to a button or a scroll gesture. This is read-only - it does not let a past
	 * choice be re-picked or replay any side effect (`show`/`hide`/`call`) around it, only
	 * the words themselves, the bounded and honestly-scoped half of "rollback" this offers.
	 * Resolves to `false` when there is nothing in `history` yet.
	 */
	async showLast(): Promise<boolean> {
		const last = this.historyLog.at(-1);
		if (!last) return false;

		const { windows } = this.options;
		await new Promise<void>((resolve) => {
			windows.push(
				new MessageBox({
					width: this.options.boxWidth ?? 480,
					height: this.options.boxHeight ?? 120,
					speed: 0,
					pages: [{ text: last.text, speaker: last.speaker }],
					dims: false,
					anchor: 'bottom',
					onDone: () => resolve(),
				})
			);
		});
		return true;
	}

	async run(commands: readonly StageCommand[]): Promise<ScriptState> {
		for (const command of commands) {
			if (this.cancelled) break;
			const jump = await this.step(command);
			if (jump !== undefined) {
				throw new Error(`a "goto ${jump}" only runs inside runStory, not a straight run`);
			}
		}
		return this.state;
	}

	/**
	 * Runs a graph of passages starting at `start`, following `goto` commands and
	 * choice jumps until a passage runs out or the script is cancelled.
	 */
	async runStory(story: StoryScript, start: string): Promise<ScriptState> {
		if (!Object.prototype.hasOwnProperty.call(story, start)) {
			throw new Error(`this story has no passage named "${start}"`);
		}
		let commands = story[start];
		let index = 0;
		while (index < commands.length) {
			if (this.cancelled) break;
			const jump = await this.step(commands[index]);
			index++;
			if (jump !== undefined) {
				if (!Object.prototype.hasOwnProperty.call(story, jump)) {
					throw new Error(`this story has no passage named "${jump}"`);
				}
				commands = story[jump];
				index = 0;
			}
		}
		return this.state;
	}

	/** runs one command; returns the passage to jump to, if the command jumps anywhere */
	private async step(command: StageCommand): Promise<string | undefined> {
		const { stage } = this.options;

		if ('backdrop' in command) {
			await stage.setBackdrop(this.options.backdrop(command.backdrop), command.fade);
			return undefined;
		}

		if ('show' in command) {
			await stage.show(command.show, {
				at: command.at,
				expression: command.expression,
				fade: command.fade,
			});
			return undefined;
		}

		if ('hide' in command) {
			await stage.hide(command.hide, command.fade);
			return undefined;
		}

		if ('hideAll' in command) {
			await stage.hideAll(command.fade);
			return undefined;
		}

		if ('expression' in command) {
			stage.setExpression(command.of, command.expression);
			return undefined;
		}

		if ('say' in command) {
			await this.speak(command.say, command.as, command.speaker);
			this.recordHistory(command.say, command.as, command.speaker);
			return undefined;
		}

		if ('ask' in command) {
			const chosen = await this.speak(command.ask, command.as, command.speaker, command.choices);
			this.recordHistory(command.ask, command.as, command.speaker, chosen);
			if (command.store) this.state.answers[command.store] = chosen;
			//a MessageBox resolves with the chosen value, which defaults to the text
			return command.choices.find((c) => (c.value ?? c.text) === chosen)?.goto;
		}

		if ('goto' in command) {
			return command.goto;
		}

		if ('wait' in command) {
			await new Promise<void>((resolve) => setTimeout(resolve, command.wait * 1000));
			return undefined;
		}

		if ('call' in command) {
			await command.call(this.state);
		}
		return undefined;
	}

	private recordHistory(text: string, as: string | undefined, speaker: string | undefined, chosen?: unknown): void {
		const name = speaker ?? (as ? (this.options.displayName?.(as) ?? as) : undefined);
		this.seenLines.add(seenKey(as, text));
		this.historyLog.push({ text, speaker: name, chosen });
	}

	/**
	 * Puts one line in front of the player and resolves with their answer.
	 *
	 * Protected rather than private on purpose: this is the seam for a game that presents
	 * dialogue its own way (a different box, a voice line, a test harness) without
	 * reimplementing the sequencing above.
	 */
	protected speak(
		text: string,
		as: string | undefined,
		speaker?: string,
		choices?: Choice[]
	): Promise<unknown> {
		const { stage, windows } = this.options;

		//dim everyone but the speaker; a line with no speaker lights the whole stage again
		stage.focus(as ?? null);

		const name = speaker ?? (as ? (this.options.displayName?.(as) ?? as) : undefined);

		//a line with choices always waits for a real answer, even in skip mode - skipping
		//is for text already read, never for a decision not yet made
		const skipNow = this.skipSeen && !choices && this.seenLines.has(seenKey(as, text));

		return new Promise((resolve) => {
			windows.push(
				new MessageBox({
					width: this.options.boxWidth ?? 480,
					height: this.options.boxHeight ?? 120,
					speed: skipNow ? 0 : (this.options.speed ?? 45),
					autoAdvance: skipNow ? 0 : undefined,
					mode: this.options.mode,
					pages: [{ text, speaker: name }],
					//choices, when the line has them, are answered in the same box
					choices,
					//the scene behind is what the player is meant to be looking at, so it
					//keeps its light; only the input is taken
					dims: false,
					anchor: 'bottom',
					onDone: (chosen) => resolve(chosen),
				})
			);
		});
	}
}

/** the seen-set key for a line - text alone is ambiguous once two characters can say the same thing */
function seenKey(as: string | undefined, text: string): string {
	return `${as ?? ''} ${text}`;
}

/**
 * One choice a `ask` command offers. Structurally identical to `two-d/ui`'s own `Choice`,
 * declared here so an event script is data this module can describe without a widget library.
 */
export interface EventChoice {
	text: string;
	value?: unknown;
	disabled?: boolean;

	/** the passage to jump to when this choice is picked, in an `EventRunner.runStory` story */
	goto?: string;
}

/** what the runner wants shown; how it looks is the presenter's business entirely */
export interface DialogueRequest {
	text: string;
	speaker?: string;

	/** an opaque, renderer-specific portrait image; `two-d/ui.messageBoxPresenter` expects a `Texture2D` */
	portrait?: unknown;

	/** present when the runner is asking rather than telling; resolve with the chosen `value` */
	choices?: EventChoice[];
}

/**
 * Shows one line (or one question) and resolves once the player is done with it.
 *
 * This is the seam that keeps `mwg/rpg` free of a renderer. `EventRunner` used to construct a
 * `ui.MessageBox` and push it onto a `ui.WindowStack` itself, which meant an event interpreter
 * - pure control flow over `GameState` - dragged the whole 2D widget layer in behind it, and
 * a game presenting dialogue any other way (a 3D scene, a DOM overlay, a test harness
 * asserting on script order) could not use it at all. `two-d/ui`'s `messageBoxPresenter` is
 * the ready-made implementation, so nothing about the common case got harder.
 */
export type DialoguePresenter = (request: DialogueRequest) => Promise<unknown>;
import { conditionHolds, type EventCondition } from './Event.ts';
import type { GameState } from './GameState.ts';

export interface MoveStep {
	dx: number;
	dy: number;
}

/**
 * A map event's script, written as data - the same shape `mwg/stage`'s `StageCommand` is,
 * but for map events rather than dialogue scenes: switches, variables and branches instead
 * of a backdrop and characters. Kept as its own interpreter because the two run on
 * genuinely different state, not because the "list of commands, awaited as one call" shape
 * needed reinventing.
 */
export type EventCommand =
	| { say: string; speaker?: string; portrait?: unknown }
	| { ask: string; speaker?: string; portrait?: unknown; choices: EventChoice[]; store?: string }
	| { wait: number }
	| { setSwitch: string; value: boolean }
	| { setVariable: string; value: number }
	| { addVariable: string; amount: number }
	| { if: EventCondition; then: EventCommand[]; else?: EventCommand[] }
	| { move: { target: string; steps: MoveStep[] } }
	| { goto: string }
	| { call: (state: EventRunnerState) => void | Promise<void> };

/**
 * A branching event script: named passages, the same graph shape `two-d/stage`'s
 * `StoryScript` is - a passage runs until it falls off the end, a `{ goto }` command or a
 * choice's own `goto` jumps to a different one. `EventRunner.runStory` follows it the same
 * way `StageScript.runStory` follows a `StoryScript`.
 */
export type EventStoryScript = Record<string, readonly EventCommand[]>;

export interface EventRunnerState {
	game: GameState;
	/** whatever `ask` commands have stored, keyed by their `store` name */
	answers: Record<string, unknown>;
}

export interface EventRunnerOptions {
	/** shows a line or a question; `two-d/ui.messageBoxPresenter` is the standard one */
	present: DialoguePresenter;

	game: GameState;

	/** carries out a move command; the runner itself does not know what "moving" means */
	move?: (target: string, steps: readonly MoveStep[]) => Promise<void>;
}

/**
 * @example
 * ```ts
 * import { EventRunner, GameState, type DialoguePresenter } from '@datamoc/mw_games/rpg';
 *
 * declare const present: DialoguePresenter; // two-d/ui.messageBoxPresenter(windows), typically
 *
 * const runner = new EventRunner({ present, game: new GameState() });
 * await runner.run([
 *   { say: 'A cold wind blows.' },
 *   { setSwitch: 'doorOpen', value: true },
 * ]);
 * ```
 */
export class EventRunner {
	private options: EventRunnerOptions;
	readonly state: EventRunnerState;
	private cancelled = false;

	constructor(options: EventRunnerOptions) {
		this.options = options;
		this.state = { game: options.game, answers: {} };
	}

	cancel(): void {
		this.cancelled = true;
	}

	async run(commands: readonly EventCommand[]): Promise<EventRunnerState> {
		const jump = await this.runList(commands);
		if (jump !== undefined) {
			throw new Error(`a "goto ${jump}" only runs inside runStory, not a straight run`);
		}
		return this.state;
	}

	/**
	 * Runs a graph of passages starting at `start`, following `goto` commands and choice
	 * jumps until a passage runs out or the script is cancelled - the `EventCommand`
	 * counterpart to `StageScript.runStory`.
	 */
	async runStory(story: EventStoryScript, start: string): Promise<EventRunnerState> {
		if (!Object.prototype.hasOwnProperty.call(story, start)) {
			throw new Error(`this event story has no passage named "${start}"`);
		}
		let commands = story[start];
		let index = 0;
		while (index < commands.length) {
			if (this.cancelled) break;
			const jump = await this.step(commands[index]);
			index++;
			if (jump !== undefined) {
				if (!Object.prototype.hasOwnProperty.call(story, jump)) {
					throw new Error(`this event story has no passage named "${jump}"`);
				}
				commands = story[jump];
				index = 0;
			}
		}
		return this.state;
	}

	/** runs a plain list of commands, returning the passage to jump to, if any */
	private async runList(commands: readonly EventCommand[]): Promise<string | undefined> {
		for (const command of commands) {
			if (this.cancelled) break;
			const jump = await this.step(command);
			if (jump !== undefined) return jump;
		}
		return undefined;
	}

	/** runs one command; returns the passage to jump to, if the command jumps anywhere */
	private async step(command: EventCommand): Promise<string | undefined> {
		if ('say' in command) {
			await this.speak(command.say, command.speaker, command.portrait);
			return undefined;
		}

		if ('ask' in command) {
			const chosen = await this.speak(command.ask, command.speaker, command.portrait, command.choices);
			if (command.store) this.state.answers[command.store] = chosen;
			//a MessageBox resolves with the chosen value, which defaults to the text
			return command.choices.find((c) => (c.value ?? c.text) === chosen)?.goto;
		}

		if ('wait' in command) {
			await new Promise<void>((resolve) => setTimeout(resolve, command.wait * 1000));
			return undefined;
		}

		if ('setSwitch' in command) {
			this.state.game.setSwitch(command.setSwitch, command.value);
			return undefined;
		}

		if ('setVariable' in command) {
			this.state.game.setVariable(command.setVariable, command.value);
			return undefined;
		}

		if ('addVariable' in command) {
			const current = this.state.game.variable(command.addVariable);
			this.state.game.setVariable(command.addVariable, current + command.amount);
			return undefined;
		}

		if ('if' in command) {
			const holds = conditionHolds(command.if, this.state.game);
			return this.runList(holds ? command.then : (command.else ?? []));
		}

		if ('move' in command) {
			await this.options.move?.(command.move.target, command.move.steps);
			return undefined;
		}

		if ('goto' in command) {
			return command.goto;
		}

		if ('call' in command) {
			await command.call(this.state);
		}
		return undefined;
	}

	private speak(
		text: string,
		speaker: string | undefined,
		portrait?: unknown,
		choices?: EventChoice[],
	): Promise<unknown> {
		return this.options.present({ text, speaker, portrait, choices });
	}
}

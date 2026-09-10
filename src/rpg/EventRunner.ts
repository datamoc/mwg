/**
 * One choice a `ask` command offers. Structurally identical to `two-d/ui`'s own `Choice`,
 * declared here so an event script is data this module can describe without a widget library.
 */
export interface EventChoice {
	text: string;
	value?: unknown;
	disabled?: boolean;
}

/** what the runner wants shown; how it looks is the presenter's business entirely */
export interface DialogueRequest {
	text: string;
	speaker?: string;

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
	| { say: string; speaker?: string }
	| { ask: string; speaker?: string; choices: EventChoice[]; store?: string }
	| { wait: number }
	| { setSwitch: string; value: boolean }
	| { setVariable: string; value: number }
	| { addVariable: string; amount: number }
	| { if: EventCondition; then: EventCommand[]; else?: EventCommand[] }
	| { move: { target: string; steps: MoveStep[] } }
	| { call: (state: EventRunnerState) => void | Promise<void> };

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
		for (const command of commands) {
			if (this.cancelled) break;
			await this.step(command);
		}
		return this.state;
	}

	private async step(command: EventCommand): Promise<void> {
		if ('say' in command) {
			await this.speak(command.say, command.speaker);
			return;
		}

		if ('ask' in command) {
			const chosen = await this.speak(command.ask, command.speaker, command.choices);
			if (command.store) this.state.answers[command.store] = chosen;
			return;
		}

		if ('wait' in command) {
			await new Promise<void>((resolve) => setTimeout(resolve, command.wait * 1000));
			return;
		}

		if ('setSwitch' in command) {
			this.state.game.setSwitch(command.setSwitch, command.value);
			return;
		}

		if ('setVariable' in command) {
			this.state.game.setVariable(command.setVariable, command.value);
			return;
		}

		if ('addVariable' in command) {
			const current = this.state.game.variable(command.addVariable);
			this.state.game.setVariable(command.addVariable, current + command.amount);
			return;
		}

		if ('if' in command) {
			const holds = conditionHolds(command.if, this.state.game);
			await this.run(holds ? command.then : (command.else ?? []));
			return;
		}

		if ('move' in command) {
			await this.options.move?.(command.move.target, command.move.steps);
			return;
		}

		if ('call' in command) {
			await command.call(this.state);
		}
	}

	private speak(text: string, speaker: string | undefined, choices?: EventChoice[]): Promise<unknown> {
		return this.options.present({ text, speaker, choices });
	}
}

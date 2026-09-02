import { MessageBox, type Choice } from '../ui/MessageBox.ts';
import type { WindowStack } from '../ui/WindowStack.ts';
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
	| { ask: string; speaker?: string; choices: Choice[]; store?: string }
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
	windows: WindowStack;
	game: GameState;

	/** carries out a move command; the runner itself does not know what "moving" means */
	move?: (target: string, steps: readonly MoveStep[]) => Promise<void>;

	/** width/height of the dialogue box; characters revealed per second */
	boxWidth?: number;
	boxHeight?: number;
	speed?: number;
}

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

	private speak(text: string, speaker: string | undefined, choices?: Choice[]): Promise<unknown> {
		const { windows } = this.options;
		return new Promise((resolve) => {
			windows.push(
				new MessageBox({
					width: this.options.boxWidth ?? 480,
					height: this.options.boxHeight ?? 120,
					speed: this.options.speed ?? 45,
					pages: [{ text, speaker }],
					choices,
					anchor: 'bottom',
					onDone: (chosen) => resolve(chosen),
				})
			);
		});
	}
}

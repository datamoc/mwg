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
 * interpreter and this share a format later — a cutscene on a tile map is the same list
 * with a different backdrop.
 */
export type StageCommand =
	| { backdrop: string; fade?: number }
	| { show: string; at?: SlotName | number; expression?: string; fade?: number }
	| { hide: string; fade?: number }
	| { hideAll: true; fade?: number }
	| { expression: string; of: string }
	| { say: string; as?: string; speaker?: string }
	| { ask: string; as?: string; speaker?: string; choices: Choice[]; store?: string }
	| { wait: number }
	| { call: (state: ScriptState) => void | Promise<void> };

export interface ScriptState {
	/** whatever `ask` commands have stored, keyed by their `store` name */
	answers: Record<string, unknown>;
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
}

/**
 * Runs a scene.
 *
 * `run` resolves when the list is exhausted, so a caller can simply await a conversation
 * and carry on afterwards — which is what makes a cutscene readable at the call site
 * instead of a chain of callbacks.
 */
export class StageScript {
	private options: ScriptOptions;
	readonly state: ScriptState = { answers: {} };

	private cancelled = false;

	constructor(options: ScriptOptions) {
		this.options = options;
	}

	cancel(): void {
		this.cancelled = true;
	}

	async run(commands: readonly StageCommand[]): Promise<ScriptState> {
		for (const command of commands) {
			if (this.cancelled) break;
			await this.step(command);
		}
		return this.state;
	}

	private async step(command: StageCommand): Promise<void> {
		const { stage } = this.options;

		if ('backdrop' in command) {
			await stage.setBackdrop(this.options.backdrop(command.backdrop), command.fade);
			return;
		}

		if ('show' in command) {
			await stage.show(command.show, {
				at: command.at,
				expression: command.expression,
				fade: command.fade,
			});
			return;
		}

		if ('hide' in command) {
			await stage.hide(command.hide, command.fade);
			return;
		}

		if ('hideAll' in command) {
			await stage.hideAll(command.fade);
			return;
		}

		if ('expression' in command) {
			stage.setExpression(command.of, command.expression);
			return;
		}

		if ('say' in command) {
			await this.speak(command.say, command.as, command.speaker);
			return;
		}

		if ('ask' in command) {
			const chosen = await this.speak(command.ask, command.as, command.speaker, command.choices);
			if (command.store) this.state.answers[command.store] = chosen;
			return;
		}

		if ('wait' in command) {
			await new Promise<void>((resolve) => setTimeout(resolve, command.wait * 1000));
			return;
		}

		if ('call' in command) {
			await command.call(this.state);
		}
	}

	/**
	 * Puts one line in front of the player and resolves with their answer.
	 *
	 * Protected rather than private on purpose: this is the seam for a game that presents
	 * dialogue its own way — a different box, a voice line, a test harness — without
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

		return new Promise((resolve) => {
			windows.push(
				new MessageBox({
					width: this.options.boxWidth ?? 480,
					height: this.options.boxHeight ?? 120,
					speed: this.options.speed ?? 45,
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

import * as Input from './Input.ts';
import type { Action } from './Input.ts';

export interface PlayerInputOptions {
	/** this player's own gamepad, when they have one; omit for a keyboard-only player */
	padIndex?: number;
}

/**
 * A player-scoped view over `mwg/core`'s `Input` module for same-screen local multiplayer.
 *
 * `Input` has no concept of a player: `Action` is a bare string, and its `bindings`/`held`/
 * `onAction` all live at module scope. Binding the same action name to two pads directly -
 * `Input.bindButton('confirm', 0, [0])` and `Input.bindButton('confirm', 1, [0])` - does not
 * give two independent "confirm"s; both bindings land in the very same action's key set, so
 * either pad pressing it fires the one shared `onAction`, with no way to tell which pad did.
 *
 * This does not change `Input` itself - it is a thin, purely additive naming convention:
 * every action a `PlayerInput` binds or queries is transparently prefixed with this
 * player's own `id`, so two players' "confirm" become two distinct actions
 * (`"p1:confirm"`, `"p2:confirm"`) that never collide. A single-player game using `Input`'s
 * bare action names directly is entirely unaffected.
 */
export class PlayerInput {
	readonly id: string;
	readonly padIndex?: number;

	constructor(id: string, options: PlayerInputOptions = {}) {
		if (!id) throw new Error('a player needs a non-empty id');
		this.id = id;
		this.padIndex = options.padIndex;
	}

	private scoped(action: Action): Action {
		return `${this.id}:${action}`;
	}

	/** binds this player's own action to keyboard keys, independent of any other player's binding for the same action name */
	bind(action: Action, keys: readonly string[]): void {
		Input.bind(this.scoped(action), keys);
	}

	/** binds this player's own action to a button on their own `padIndex` */
	bindButton(action: Action, buttons: readonly number[]): void {
		if (this.padIndex === undefined) throw new Error(`player "${this.id}" has no padIndex to bind a gamepad button to`);
		Input.bindButton(this.scoped(action), this.padIndex, buttons);
	}

	/** binds this player's own action to an axis direction on their own `padIndex` */
	bindAxis(action: Action, axis: number, direction: 1 | -1): void {
		if (this.padIndex === undefined) throw new Error(`player "${this.id}" has no padIndex to bind a gamepad axis to`);
		Input.bindAxis(this.scoped(action), this.padIndex, axis, direction);
	}

	/** binds this player's own action to an on-screen touch control, independent of any other player's binding for the same action name */
	bindTouch(action: Action, id: string = action): void {
		Input.bindTouch(this.scoped(action), `${this.id}:${id}`);
	}

	/** presses this player's own touch control, bound previously with `bindTouch` */
	pressTouch(id: string): void {
		Input.pressTouch(`${this.id}:${id}`);
	}

	releaseTouch(id: string): void {
		Input.releaseTouch(`${this.id}:${id}`);
	}

	isDown(action: Action): boolean {
		return Input.isDown(this.scoped(action));
	}

	justPressed(action: Action): boolean {
		return Input.justPressed(this.scoped(action));
	}

	justReleased(action: Action): boolean {
		return Input.justReleased(this.scoped(action));
	}

	/** every key/pad binding for this player's own action, in the same shape `Input.exportBindings` uses */
	keysFor(action: Action): string[] {
		return Input.keysFor(this.scoped(action));
	}
}

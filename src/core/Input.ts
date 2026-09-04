import { Signal } from './Signal.ts';

/**
 * Keyboard input, bound to named actions.
 *
 * Game code asks about `'confirm'`, never about `'Enter'`. That indirection is what makes
 * rebinding possible at all, and it is far easier to put in from the start than to retrofit
 * once a hundred call sites know about key codes.
 *
 * Keys are identified by `KeyboardEvent.code` (the physical key), so a binding to `KeyZ`
 * lands on the same place under AZERTY as under QWERTY, which is what a player actually
 * wants from a movement key.
 */

export type Action = string;

const bindings = new Map<Action, Set<string>>();
const held = new Set<string>();
const pressedThisFrame = new Set<Action>();
const releasedThisFrame = new Set<Action>();

/** fires when an action starts; a listener returning true stops it reaching anything else */
export const onAction = new Signal<Action>(true);

/** fires for every keydown, for the rare case that needs the raw key */
export const onKey = new Signal<KeyboardEvent>(true);

let attached = false;

/** the bindings a game starts with; every one can be replaced */
export const DEFAULT_BINDINGS: Readonly<Record<Action, readonly string[]>> = {
	up: ['ArrowUp', 'KeyW', 'Numpad8'],
	down: ['ArrowDown', 'KeyS', 'Numpad2'],
	left: ['ArrowLeft', 'KeyA', 'Numpad4'],
	right: ['ArrowRight', 'KeyD', 'Numpad6'],
	upLeft: ['Numpad7'],
	upRight: ['Numpad9'],
	downLeft: ['Numpad1'],
	downRight: ['Numpad3'],
	wait: ['Numpad5', 'Period'],
	confirm: ['Enter', 'Space', 'NumpadEnter'],
	cancel: ['Escape', 'Backspace'],
	menu: ['KeyI', 'Tab'],
};

export function bind(action: Action, keys: readonly string[]): void {
	bindings.set(action, new Set(keys));
}

/** adds keys to an action's existing bindings, rather than replacing them like `bind` does */
function addBindings(action: Action, keys: readonly string[]): void {
	const set = bindings.get(action) ?? new Set<string>();
	for (const key of keys) set.add(key);
	bindings.set(action, set);
}

/**
 * Every action currently bound to `key`, if any - the query a rebind flow needs before
 * committing a captured key, so it can warn (or auto-unbind the loser) instead of two
 * actions silently firing together the moment a key ends up shared between them. `bind`
 * itself does not call this or refuse a collision; nothing about existing behaviour changes
 * for a game that never rebinds.
 */
export function actionsForKey(key: string): Action[] {
	return actionsFor(key);
}

export function unbind(action: Action): void {
	bindings.delete(action);
}

export function keysFor(action: Action): string[] {
	return [...(bindings.get(action) ?? [])];
}

/** every binding, in a shape that can be written to a settings file and read back */
export function exportBindings(): Record<Action, string[]> {
	const out: Record<Action, string[]> = {};
	for (const [action, keys] of bindings) out[action] = [...keys];
	return out;
}

export function importBindings(saved: Readonly<Record<Action, readonly string[]>>): void {
	bindings.clear();
	for (const [action, keys] of Object.entries(saved)) bind(action, keys);
}

export function resetBindings(): void {
	importBindings(DEFAULT_BINDINGS);
}

//installed as soon as this module loads, so a game may add or replace a binding before it
//starts without that being mistaken for "this game defines all its own keys". Deferring
//this to attach() cost every default the moment a game bound one action of its own.
resetBindings();

function actionsFor(code: string): Action[] {
	const out: Action[] = [];
	for (const [action, keys] of bindings) {
		if (keys.has(code)) out.push(action);
	}
	return out;
}

/** true for as long as the key is held */
export function isDown(action: Action): boolean {
	const keys = bindings.get(action);
	if (!keys) return false;
	for (const key of keys) {
		if (held.has(key)) return true;
	}
	return false;
}

/** true only on the frame the action began, for menus and single steps */
export function justPressed(action: Action): boolean {
	return pressedThisFrame.has(action);
}

export function justReleased(action: Action): boolean {
	return releasedThisFrame.has(action);
}

/**
 * Clears the one-frame state.
 *
 * Called by `Game` at the end of every frame. It has to run after the scene's update, or
 * a `justPressed` would be missed by whatever polls it later in the same frame.
 */
export function endFrame(): void {
	pressedThisFrame.clear();
	releasedThisFrame.clear();
}

function handleKeyDown(event: KeyboardEvent): void {
	//a held key repeats; the action already started, so only the raw signal repeats
	if (event.repeat) {
		onKey.dispatch(event);
		return;
	}

	held.add(event.code);
	for (const action of actionsFor(event.code)) {
		pressedThisFrame.add(action);
		onAction.dispatch(action);
	}
	onKey.dispatch(event);
}

function handleKeyUp(event: KeyboardEvent): void {
	held.delete(event.code);
	for (const action of actionsFor(event.code)) {
		releasedThisFrame.add(action);
	}
}

function handleBlur(): void {
	//a key held while the window loses focus never sends its keyup, and would stay stuck
	held.clear();
	pressedThisFrame.clear();
	releasedThisFrame.clear();
}

//---- gamepad and controller input ----
//
//a button or axis binds to the same named action a key does, by folding it into the very
//same `held`/`bindings` state under a synthetic code (`gamepadButtonCode`/`gamepadAxisCode`)
//that will never collide with a real `KeyboardEvent.code` - `isDown`/`justPressed`/
//`justReleased`/`actionsForKey` all keep working unmodified, whether an action came from a
//key or a stick, since none of them know or care where a held code came from.

const AXIS_DEADZONE = 0.5;

/** scratch space for `pollGamepads`, reused every call rather than allocated fresh */
const gamepadDown = new Set<string>();

/** the pseudo key code for button `button` on pad `padIndex` - bind it the same way a `KeyboardEvent.code` is bound */
export function gamepadButtonCode(padIndex: number, button: number): string {
	return `Gamepad${padIndex}Button${button}`;
}

/** the pseudo key code for axis `axis` pushed past its deadzone in `direction` on pad `padIndex` */
export function gamepadAxisCode(padIndex: number, axis: number, direction: 1 | -1): string {
	return `Gamepad${padIndex}Axis${axis}${direction > 0 ? '+' : '-'}`;
}

export function bindButton(action: Action, padIndex: number, buttons: readonly number[]): void {
	addBindings(action, buttons.map((button) => gamepadButtonCode(padIndex, button)));
}

export function bindAxis(action: Action, padIndex: number, axis: number, direction: 1 | -1): void {
	addBindings(action, [gamepadAxisCode(padIndex, axis, direction)]);
}

/**
 * Folds every connected gamepad's buttons and axes into the same held-code state a keydown
 * would produce. There is no native "gamepad button pressed" event to attach a listener to
 * - the Gamepad API only ever hands back a live snapshot - so this has to be polled once a
 * frame instead, which is why `Game` calls it right before updating the scene, before
 * `endFrame` clears the one-frame flags.
 */
export function pollGamepads(
	//Node has exposed a global `navigator` since v21, with no `getGamepads` on it - guarding
	//on the method itself, not just the object, is what actually detects a browser
	pads: readonly (Gamepad | null)[] = typeof navigator?.getGamepads === 'function' ? navigator.getGamepads() : []
): void {
	//reused rather than allocated fresh every call - this runs once a frame, on every frame
	gamepadDown.clear();
	for (const pad of pads) {
		if (!pad) continue;
		for (let i = 0; i < pad.buttons.length; i++) {
			if (pad.buttons[i].pressed) gamepadDown.add(gamepadButtonCode(pad.index, i));
		}
		for (let i = 0; i < pad.axes.length; i++) {
			const value = pad.axes[i];
			if (value >= AXIS_DEADZONE) gamepadDown.add(gamepadAxisCode(pad.index, i, 1));
			else if (value <= -AXIS_DEADZONE) gamepadDown.add(gamepadAxisCode(pad.index, i, -1));
		}
	}

	for (const code of gamepadDown) {
		if (held.has(code)) continue;
		held.add(code);
		for (const action of actionsFor(code)) {
			pressedThisFrame.add(action);
			onAction.dispatch(action);
		}
	}
	//a real KeyboardEvent.code never starts with "Gamepad", so this only ever releases codes
	//pollGamepads itself could have added, never a key still held from handleKeyDown; safe to
	//delete the current entry mid-iteration, since Set iteration order is insertion order and
	//a deletion never revisits or skips an entry not yet reached
	for (const code of held) {
		if (gamepadDown.has(code) || !code.startsWith('Gamepad')) continue;
		held.delete(code);
		for (const action of actionsFor(code)) releasedThisFrame.add(action);
	}
}

/** the shape of `Gamepad.vibrationActuator`, which lib.dom does not type consistently across TS versions */
interface HapticActuator {
	playEffect(type: string, params: Record<string, number>): void;
}

export interface RumbleOptions {
	/** milliseconds */
	duration: number;
	weakMagnitude?: number;
	strongMagnitude?: number;
}

/**
 * Vibrates one connected gamepad, if it and the browser expose a dual-rumble actuator - a
 * no-op otherwise, rather than throwing, since support is inconsistent across browsers and a
 * game reaching for "juice" should not have to feature-test this itself.
 */
export function rumble(
	padIndex: number,
	options: RumbleOptions,
	pads: readonly (Gamepad | null)[] = typeof navigator?.getGamepads === 'function' ? navigator.getGamepads() : []
): void {
	const pad = pads[padIndex];
	const actuator = (pad as unknown as { vibrationActuator?: HapticActuator })?.vibrationActuator;
	actuator?.playEffect('dual-rumble', {
		duration: options.duration,
		weakMagnitude: options.weakMagnitude ?? 1,
		strongMagnitude: options.strongMagnitude ?? 1,
	});
}

export function attach(target: EventTarget = window): void {
	if (attached) return;
	attached = true;

	target.addEventListener('keydown', handleKeyDown as EventListener);
	target.addEventListener('keyup', handleKeyUp as EventListener);
	window.addEventListener('blur', handleBlur);
}

export function detach(target: EventTarget = window): void {
	if (!attached) return;
	attached = false;

	target.removeEventListener('keydown', handleKeyDown as EventListener);
	target.removeEventListener('keyup', handleKeyUp as EventListener);
	window.removeEventListener('blur', handleBlur);
	handleBlur();
}

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

import { Container } from 'pixi.js';
import * as Input from '../core/Input.ts';
import type { Action } from '../core/Input.ts';
import { ListView, type ListItem } from './ListView.ts';

export interface RebindScreenOptions {
	width: number;
	height: number;

	/** which actions to list, and in what order */
	actions: readonly Action[];

	/** a label for an action, `mwg` never invents a display name of its own */
	label?: (action: Action) => string;

	rowHeight?: number;

	/**
	 * Asked before a captured key already claimed by another action is taken from it -
	 * `Input.actionsForKey` (item 94) is exactly the query behind `previousOwners`. Return
	 * `false` to refuse the capture and leave every binding untouched, for a game that wants
	 * to warn and ask first rather than silently losing the old binding. Omit it to always
	 * take the key over, which is this screen's default.
	 */
	onConflict?: (key: string, action: Action, previousOwners: readonly Action[]) => boolean;
}

/**
 * A ready-made rebinding flow over `Input`'s existing `bind`/`keysFor`/`actionsForKey`, the
 * same way `IconGrid` is a ready-made inventory screen over `Inventory` rather than something
 * every game builds by hand. `confirm` on a row starts capturing the next physical key
 * pressed; that capture reads the raw `onKey` signal rather than a named action, since the
 * whole point is accepting a key nothing is bound to yet.
 *
 * Capturing a key replaces that action's *entire* existing binding, the same way a settings
 * screen's "press a key" always means "this is the key now", not "add one more" - a row shows
 * every key `Input.keysFor` currently returns, but confirming it always ends with exactly one.
 */
export class RebindScreen extends Container {
	private list: ListView;
	private actions: Action[];
	private labelFor: (action: Action) => string;
	private onConflict: (key: string, action: Action, previousOwners: readonly Action[]) => boolean;
	private capturing: Action | null = null;
	private onKeyCaptured = (event: KeyboardEvent): boolean => {
		if (!this.capturing) return false;
		event.preventDefault(); // Tab, Space and the arrow keys all have a default action to suppress
		this.finishCapture(this.capturing, event.code);
		return true; // swallow the key so it never also reaches gameplay bindings
	};

	constructor(options: RebindScreenOptions) {
		super();
		this.actions = [...options.actions];
		this.labelFor = options.label ?? ((action) => action);
		this.onConflict = options.onConflict ?? (() => true);

		this.list = new ListView({
			width: options.width,
			height: options.height,
			rowHeight: options.rowHeight,
			items: this.rows(),
		});
		this.addChild(this.list);
	}

	private rows(): ListItem[] {
		return this.actions.map((action) => ({
			text: this.rowText(action),
			value: action,
			disabled: this.capturing !== null && this.capturing !== action,
		}));
	}

	private rowText(action: Action): string {
		if (this.capturing === action) return `${this.labelFor(action)}: press a key...`;
		const keys = Input.keysFor(action);
		return `${this.labelFor(action)}: ${keys.length ? keys.join(', ') : '(unbound)'}`;
	}

	private refresh(): void {
		const selected = this.list.selectedIndex;
		this.list.setItems(this.rows());
		this.list.select(selected);
	}

	private startCapture(action: Action): void {
		this.capturing = action;
		Input.onKey.add(this.onKeyCaptured);
		this.refresh();
	}

	private finishCapture(action: Action, key: string): void {
		Input.onKey.remove(this.onKeyCaptured);
		this.capturing = null;

		const previousOwners = Input.actionsForKey(key).filter((other) => other !== action);
		if (previousOwners.length > 0 && !this.onConflict(key, action, previousOwners)) {
			this.refresh(); // capture refused; every binding is left exactly as it was
			return;
		}

		for (const other of previousOwners) Input.bind(other, Input.keysFor(other).filter((k) => k !== key));
		Input.bind(action, [key]);
		this.refresh();
	}

	/** true while waiting for the next physical key press to bind */
	get isCapturing(): boolean {
		return this.capturing !== null;
	}

	/** @returns true when the action was used */
	handleAction(action: Action): boolean {
		if (this.capturing) return true; // the raw key listener handles everything while capturing

		if (action === 'confirm') {
			const selected = this.list.selected?.value as Action | undefined;
			if (selected) this.startCapture(selected);
			return true;
		}
		return this.list.handleAction(action);
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		Input.onKey.remove(this.onKeyCaptured);
		super.destroy(options);
	}
}

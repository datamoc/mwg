import type { Texture2D } from '../render/Types2D.ts';

export type WidgetState = 'idle' | 'hover' | 'pressed' | 'disabled' | 'selected' | 'focused';

/**
 * The visual a widget draws itself with in one state. Every field is optional and each falls back
 * independently as `Skins.resolve` walks its chain, so a skin can override just one channel of a
 * widget's look - its pressed background, say - and keep the rest.
 */
export interface Skin {
	background?: number;
	border?: number;
	borderWidth?: number;
	text?: number;
	padding?: number;
	texture?: Texture2D;
	/** how many pixels of `texture` are its fixed border */
	borderInset?: number;
}

export type SkinStates = Partial<Record<WidgetState, Skin>>;
/** A widget's entry: a bare skin, meaning its idle look, or one look per state. */
export type SkinData = Skin | SkinStates;

const STATES: readonly WidgetState[] = ['idle', 'hover', 'pressed', 'disabled', 'selected', 'focused'];

/**
 * Per-widget and per-state skins, looked up by name - the data-driven half of what GUI2 puts in
 * `data/gui/*.cfg`, and the thing the one global `Theme` has no room for.
 *
 * A lookup walks a fixed chain so a caller never gets `undefined`: the widget's own state, its
 * idle look, the wildcard widget's state, the wildcard's idle look, then an empty skin. That is
 * what lets a game define a shared `*` skin once and override only the two widgets it cares about,
 * and what makes a state a widget never defined fall back rather than disappear.
 *
 * @example
 * ```ts
 * import { Skins } from '@datamoc/mw_games/two-d/ui';
 *
 * const skins = new Skins();
 * skins.define('*', 'idle', { background: 0x101018, text: 0xe8e8f0 });
 * skins.define('button', 'pressed', { background: 0xffe680, text: 0x101018 });
 *
 * console.log(skins.resolve('button', 'pressed').text); // 0x101018, the override
 * console.log(skins.resolve('label', 'idle').background); // 0x101018, the wildcard
 * ```
 */
export class Skins {
	private readonly map = new Map<string, SkinStates>();

	/** the wildcard widget every lookup falls back to */
	static readonly ANY = '*';

	define(widget: string, state: WidgetState, skin: Skin): void {
		const states = this.map.get(widget) ?? {};
		states[state] = { ...states[state], ...skin };
		this.map.set(widget, states);
	}

	has(widget: string): boolean {
		return this.map.has(widget);
	}

	widgets(): string[] {
		return [...this.map.keys()];
	}

	/** the skin a widget draws in a state, following the fallback chain to an empty skin */
	resolve(widget: string, state: WidgetState = 'idle'): Skin {
		return (
			this.map.get(widget)?.[state] ??
			this.map.get(widget)?.idle ??
			this.map.get(Skins.ANY)?.[state] ??
			this.map.get(Skins.ANY)?.idle ??
			{}
		);
	}

	/** every state a widget has an entry for, not counting the wildcard fallback */
	statesOf(widget: string): WidgetState[] {
		const states = this.map.get(widget);
		return states ? STATES.filter((state) => states[state] !== undefined) : [];
	}

	/**
	 * Builds a registry from plain data - the shape a config file would parse into. An entry with
	 * any state key is read as one look per state; anything else is that widget's idle look.
	 */
	static from(data: Readonly<Record<string, SkinData>>): Skins {
		const skins = new Skins();
		for (const [widget, value] of Object.entries(data)) {
			if (isStateMap(value)) {
				for (const state of STATES) {
					const skin = value[state];
					if (skin) skins.define(widget, state, skin);
				}
			} else {
				skins.define(widget, 'idle', value);
			}
		}
		return skins;
	}
}

function isStateMap(value: SkinData): value is SkinStates {
	return STATES.some((state) => (value as SkinStates)[state] !== undefined);
}

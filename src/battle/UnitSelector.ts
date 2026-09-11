import { Signal } from '../core/Signal.ts';

export interface SelectableUnit {
	id: string;
	side?: string;
	/** current hp, so an attack dialog can preview it; the selector itself never reads it */
	hp?: number;
	disabled?: boolean;
}

export interface UnitSelectorOptions {
	units: readonly SelectableUnit[];
	/** only units on this side may attack; every enabled unit when omitted */
	side?: string;
	/** further narrows who may be chosen at all (a unit that has already acted, say) */
	disabled?: (unit: SelectableUnit) => boolean;
	/** narrows the targets once an attacker is chosen (adjacency, range, fog) */
	canTarget?: (attacker: SelectableUnit, target: SelectableUnit) => boolean;
}

export type SelectorStage = 'attacker' | 'target';

/**
 * The two-step unit selector an attack starts with: pick who attacks, then pick what they attack.
 *
 * Renderer-free, so the choosing rules are tested without a board: `candidates` are the enabled
 * units on the selecting side, `targets` are the enabled units that pass `canTarget` once an
 * attacker is chosen, `move` walks the active list and `select` advances a stage. `back` undoes the
 * attacker choice rather than only the target, so a player who picked the wrong attacker lands
 * where they can pick again rather than being stuck one step in.
 *
 * @example
 * ```ts
 * import { UnitSelector } from '@datamoc/mw_games/battle';
 *
 * const selector = new UnitSelector({
 *   units: [{ id: 'hero', side: '1' }, { id: 'rat', side: '2' }],
 *   side: '1',
 * });
 * selector.select(); // hero attacks
 * console.log(selector.targets.map((unit) => unit.id)); // ['rat']
 * ```
 */
export class UnitSelector {
	readonly onChange = new Signal<void>();

	private readonly units: readonly SelectableUnit[];
	private readonly side?: string;
	private readonly disabledOf: (unit: SelectableUnit) => boolean;
	private readonly canTarget: (attacker: SelectableUnit, target: SelectableUnit) => boolean;

	private stage_: SelectorStage = 'attacker';
	private charge: SelectableUnit | null = null;
	private victim: SelectableUnit | null = null;
	private highlight_ = 0;

	constructor(options: UnitSelectorOptions) {
		this.units = options.units;
		this.side = options.side;
		this.disabledOf = options.disabled ?? ((unit) => unit.disabled ?? false);
		this.canTarget = options.canTarget ?? (() => true);
	}

	get stage(): SelectorStage {
		return this.stage_;
	}

	get attacker(): SelectableUnit | null {
		return this.charge;
	}

	get target(): SelectableUnit | null {
		return this.victim;
	}

	/** both steps are done, so the caller has an attack to make */
	get done(): boolean {
		return this.charge !== null && this.victim !== null;
	}

	/** the units that may be picked as the attacker */
	get candidates(): readonly SelectableUnit[] {
		return this.units.filter(
			(unit) => (this.side === undefined || unit.side === this.side) && !this.disabledOf(unit),
		);
	}

	/** the units the chosen attacker may hit; empty until an attacker is chosen */
	get targets(): readonly SelectableUnit[] {
		const attacker = this.charge;
		if (!attacker) return [];
		return this.units.filter(
			(unit) =>
				unit.id !== attacker.id &&
				!this.disabledOf(unit) &&
				!(attacker.side !== undefined && unit.side === attacker.side) &&
				this.canTarget(attacker, unit),
		);
	}

	/** the index of the highlight within the active list */
	get highlight(): number {
		return this.highlight_;
	}

	get highlighted(): SelectableUnit | null {
		const list = this.active();
		return list[this.highlight_] ?? null;
	}

	/** moves the highlight, wrapping at both ends, within whichever list is active */
	move(delta: number): void {
		const list = this.active();
		if (list.length === 0) return;
		this.highlight_ = (((this.highlight_ + delta) % list.length) + list.length) % list.length;
		this.onChange.dispatch();
	}

	/** takes the highlighted unit: on the attacker stage it advances to choosing a target */
	select(): boolean {
		const chosen = this.highlighted;
		if (!chosen) return false;
		if (this.stage_ === 'attacker') {
			this.charge = chosen;
			this.stage_ = 'target';
			this.highlight_ = 0;
		} else {
			this.victim = chosen;
		}
		this.onChange.dispatch();
		return true;
	}

	/** undoes the attacker choice, so a wrong attacker can be picked again */
	back(): void {
		if (this.stage_ === 'attacker') return;
		const previous = this.charge;
		this.charge = null;
		this.victim = null;
		this.stage_ = 'attacker';
		const index = previous ? this.candidates.findIndex((unit) => unit.id === previous.id) : -1;
		this.highlight_ = index >= 0 ? index : 0;
		this.onChange.dispatch();
	}

	reset(): void {
		this.charge = null;
		this.victim = null;
		this.stage_ = 'attacker';
		this.highlight_ = 0;
		this.onChange.dispatch();
	}

	private active(): readonly SelectableUnit[] {
		return this.stage_ === 'attacker' ? this.candidates : this.targets;
	}
}

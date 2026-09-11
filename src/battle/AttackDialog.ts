import { Signal } from '../core/Signal.ts';
import { AttackPreview, type AttackFrame } from './AttackPreview.ts';
import { UnitSelector, type SelectableUnit, type SelectorStage } from './UnitSelector.ts';

/** The per-strike numbers a game's own rules produce for one attacker/target pair. */
export interface StrikeNumbers {
	damage: number;
	strikes: number;
	chanceToHit?: number;
	hits?: readonly boolean[];
}

export interface AttackDialogOptions {
	units: readonly SelectableUnit[];
	side?: string;
	disabled?: (unit: SelectableUnit) => boolean;
	canTarget?: (attacker: SelectableUnit, target: SelectableUnit) => boolean;
	/** the game's damage rules, called once the attacker and target are both chosen */
	damageFor: (attacker: SelectableUnit, target: SelectableUnit) => StrikeNumbers;
	/** seconds between strikes in the preview animation */
	strikeDuration?: number;
}

/**
 * The attack dialog's whole state, with no renderer: the unit selector, the damage preview the
 * game's numbers build, and the animation clock the preview is sampled on.
 *
 * The order of business is the one a player sees - choose an attacker, choose a target, and the
 * dialog shows a blow that lands over time - so the clock is here rather than in a widget: `update`
 * takes the frame's `dt` and returns the preview frame to draw, and `finished` says when the
 * animation has run out and the caller may apply the result. `damageFor` is where the game's own
 * rules live; this model never invents damage.
 *
 * @example
 * ```ts
 * import { AttackDialog } from '@datamoc/mw_games/battle';
 *
 * const dialog = new AttackDialog({
 *   units: [{ id: 'hero', side: '1' }, { id: 'rat', side: '2' }],
 *   side: '1',
 *   damageFor: () => ({ damage: 4, strikes: 2 }),
 *   strikeDuration: 0.25,
 * });
 * dialog.select();
 * dialog.select();
 * console.log(dialog.update(0.3)?.defenderHp); // the defender after the second strike
 * ```
 */
export class AttackDialog {
	readonly onChange = new Signal<void>();
	readonly selector: UnitSelector;

	private readonly damageFor: (attacker: SelectableUnit, target: SelectableUnit) => StrikeNumbers;
	private readonly strikeDuration: number;
	private built: AttackPreview | null = null;
	private elapsed_ = 0;

	constructor(options: AttackDialogOptions) {
		this.damageFor = options.damageFor;
		this.strikeDuration = options.strikeDuration ?? 0;
		this.selector = new UnitSelector({
			units: options.units,
			...(options.side === undefined ? {} : { side: options.side }),
			...(options.disabled === undefined ? {} : { disabled: options.disabled }),
			...(options.canTarget === undefined ? {} : { canTarget: options.canTarget }),
		});
		this.selector.onChange.add(this.handleSelectorChange);
	}

	get stage(): SelectorStage {
		return this.selector.stage;
	}

	get attacker(): SelectableUnit | null {
		return this.selector.attacker;
	}

	get target(): SelectableUnit | null {
		return this.selector.target;
	}

	/** the damage preview, built once both choices are made */
	get preview(): AttackPreview | null {
		return this.built;
	}

	/** how long the animation has been playing, in seconds */
	get elapsed(): number {
		return this.elapsed_;
	}

	/** whether the animation has reached the end of the preview */
	get finished(): boolean {
		return this.built !== null && this.elapsed_ >= this.built.duration;
	}

	/** the frame to draw right now, or `null` before both choices are made */
	get frame(): AttackFrame | null {
		return this.built ? this.built.sampleAt(this.elapsed_) : null;
	}

	move(delta: number): void {
		this.selector.move(delta);
	}

	select(): boolean {
		return this.selector.select();
	}

	back(): void {
		this.selector.back();
	}

	/** advances the animation, returning the frame to draw */
	update(dt: number): AttackFrame | null {
		if (!this.built) return null;
		this.elapsed_ = Math.min(this.built.duration, this.elapsed_ + Math.max(0, dt));
		return this.frame;
	}

	/** skips the animation to its end, the click-through a player makes */
	finish(): void {
		if (this.built) this.elapsed_ = this.built.duration;
	}

	reset(): void {
		this.selector.reset();
		this.built = null;
		this.elapsed_ = 0;
	}

	private readonly handleSelectorChange = (): void => {
		if (this.selector.done && this.attacker && this.target) {
			const numbers = this.damageFor(this.attacker, this.target);
			this.built = new AttackPreview({
				attacker: { hp: this.attacker.hp ?? 0, name: this.attacker.id },
				defender: { hp: this.target.hp ?? 0, name: this.target.id },
				damage: numbers.damage,
				strikes: numbers.strikes,
				...(numbers.chanceToHit === undefined ? {} : { chanceToHit: numbers.chanceToHit }),
				...(numbers.hits === undefined ? {} : { hits: numbers.hits }),
				strikeDuration: this.strikeDuration,
			});
			this.elapsed_ = 0;
		} else {
			this.built = null;
		}
		this.onChange.dispatch();
	};
}

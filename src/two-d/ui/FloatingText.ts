import { Container } from 'pixi.js';
import { Label } from './Label.ts';
import { reducedMotion } from '../../core/Motion.ts';

export interface FloatingTextOptions {
	text: string;
	color?: number;
	size?: number;

	/** seconds it takes to fully rise and fade; defaults to 0.8 */
	duration?: number;

	/** total pixels it rises over its lifetime; defaults to 24 */
	rise?: number;

	/**
	 * The fraction of the lifetime the text stays fully opaque before it starts fading, 0 to 1.
	 * Defaults to 0 - a straight fade across the whole life, the pre-existing behaviour. `0.5` is
	 * the classic damage-number curve: readable for half its time, then gone.
	 */
	hold?: number;
}

/**
 * Opacity at normalised progress `t` (0 to 1), with `hold` of that life spent at full opacity.
 *
 * Pulled out of the container and exported so the curve is checked as arithmetic rather than
 * through a rendered label - `Label` needs a DOM to measure text, and the split between what a
 * thing *is* and how it is drawn is the same one `Level`/`TileMap` and `ParticleEmitter`'s
 * textureless mode already draw.
 *
 * @example
 * ```ts
 * import { floatingTextAlpha } from '@datamoc/mw_games/two-d/ui';
 * console.log(floatingTextAlpha(0.75, 0.5)); // 0.5
 * ```
 */
export function floatingTextAlpha(t: number, hold: number): number {
	if (hold <= 0) return 1 - t;
	if (hold >= 1 || t <= hold) return 1;
	return 1 - (t - hold) / (1 - hold);
}

/**
 * The rise at progress `t`, in pixels. Negative: pop-ups travel up the screen.
 *
 * @example
 * ```ts
 * import { floatingTextRise } from '@datamoc/mw_games/two-d/ui';
 * console.log(floatingTextRise(0.5, 24)); // -12
 * ```
 */
export function floatingTextRise(t: number, rise: number, reduce = false): number {
	//`t <= 0` rather than a plain multiply: `-rise * 0` is `-0`, a silly thing to hand a caller
	//or a test that asserts a position of zero
	if (reduce || t <= 0) return 0;
	return -rise * t;
}

/**
 * The age a pop-up should report, given the age it has, its lifetime, and the age it is forced to
 * be at least.
 *
 * Java's rule as arithmetic. Java caps what is *left*,
 * `above.timeLeft = Math.min(above.timeLeft, LIFESPAN - numBelow / 5f)`, and a cap on what is left
 * is a floor under the age. A floor and not a subtraction, on purpose: a line that has already
 * lived longer than the floor keeps the age it has, where subtracting would shorten it a second
 * time and cut a nearly-finished pop-up dead. A burst of numbers still cannot become a column that
 * outlives the fight, which is what the rule is there for. Clamped to the lifetime as well, so a
 * floor past the end finishes the pop-up on its next update instead of jumping through the rest of
 * its rise.
 *
 * Pulled out of the class for the same reason `floatingTextAlpha` is: `FloatingText` needs a DOM
 * to build, and a rule does not need one to be checked.
 *
 * @example
 * ```ts
 * import { floatingTextAgeAtLeast } from '@datamoc/mw_games/two-d/ui';
 *
 * console.log(floatingTextAgeAtLeast(0, 1, 0.2)); // 0.2, a fresh line is pushed forward
 * console.log(floatingTextAgeAtLeast(0.5, 1, 0.2)); // 0.5, an older line keeps the age it has
 * ```
 */
export function floatingTextAgeAtLeast(elapsed: number, duration: number, atLeast: number): number {
	if (atLeast <= 0) return elapsed;
	return Math.max(elapsed, Math.min(atLeast, duration));
}

/**
 * A damage number or a "+1 gold": text that rises and fades over its own lifetime, unlike
 * `Label`'s job of a static, positioned string. This is animation over a label, timed rather
 * than laid out - a game positions one instance per pop-up at the world point it should
 * appear over, then drives it with `update(dt)` the same way `core.Spawner` is `dt`-driven.
 *
 * Several pop-ups over one world point at once are `FloatingTextStack`'s job, not this class's.
 *
 * @example
 * ```ts
 * import { FloatingText } from '@datamoc/mw_games/two-d/ui';
 * import type { Container2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const worldLayer: Container2D;
 *
 * const popup = new FloatingText({ text: '-12', color: 0xff4444, hold: 0.5 });
 * popup.position.set(64, 96);
 * worldLayer.addChild(popup);
 *
 * popup.update(0.5); // advance the rise/fade by half a second
 * if (popup.finished) console.log('already removed and destroyed itself');
 * ```
 */
export class FloatingText extends Container {
	private readonly duration: number;
	private readonly rise: number;
	private readonly hold: number;

	/**
	 * The label's own layer, and the layer the rise moves. `position` therefore stays exactly where
	 * the caller put it, whoever moved it last: writing `this.y` in `update` instead would overwrite
	 * the world point the pop-up sits over, and would silently undo a lift `FloatingTextStack`
	 * applies to a line that has already been on screen for a frame. That is not hypothetical, it is
	 * exactly how the first version of the stack's lift was lost.
	 */
	private readonly rising = new Container();

	private elapsed = 0;
	private done = false;

	constructor(options: FloatingTextOptions) {
		super();

		this.duration = options.duration ?? 0.8;
		this.rise = options.rise ?? 24;
		this.hold = Math.min(1, Math.max(0, options.hold ?? 0));

		const label = new Label({ text: options.text, color: options.color, size: options.size });
		label.anchor.set(0.5);
		this.rising.addChild(label);
		this.addChild(this.rising);
	}

	/** true once the animation has finished and this container has removed and destroyed itself */
	get finished(): boolean {
		return this.done;
	}

	/**
	 * How far the animation has lifted the text above where it was placed, in pixels: 0 at the
	 * start, negative as it rises, and 0 again under reduced motion. The drawn position is
	 * `y + riseOffset`, while `y` itself never moves, which is what lets a caller (a stack, a game
	 * following a moving creature) place a pop-up that is already animating.
	 */
	get riseOffset(): number {
		return this.rising.y;
	}

	/**
	 * Ages the pop-up to at least `seconds` - what a stack does to the lines it lifts out of the
	 * way. `floatingTextAgeAtLeast` is that arithmetic, and says why it is a floor under the age
	 * rather than a subtraction from what is left.
	 */
	ageAtLeast(seconds: number): void {
		this.elapsed = floatingTextAgeAtLeast(this.elapsed, this.duration, seconds);
	}

	/** advances the rise/fade; once complete, removes itself from its parent and destroys itself */
	update(dt: number): void {
		if (this.done) return;

		this.elapsed = Math.min(this.duration, this.elapsed + dt);
		const t = this.duration > 0 ? this.elapsed / this.duration : 1;
		//the rise is peripheral movement beside whatever the player is reading; reduced
		//motion keeps the fade and drops the travel, so the number still appears and goes
		this.rising.y = floatingTextRise(t, this.rise, reducedMotion());
		this.alpha = floatingTextAlpha(t, this.hold);

		if (t >= 1) {
			this.done = true;
			this.parent?.removeChild(this);
			this.destroy({ children: true });
		}
	}
}

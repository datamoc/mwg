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
	 * The label's own layer: the rise moves this rather than the container itself, so
	 * `position` stays exactly where the caller put it. Writing `this.y` in `update` instead
	 * would overwrite the world point the pop-up is meant to sit over on its first frame.
	 */
	private readonly rising = new Container();

	private elapsed = 0;
	private done = false;
	private baseY: number | undefined;

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

	/** advances the rise/fade; once complete, removes itself from its parent and destroys itself */
	update(dt: number): void {
		if (this.done) return;

		this.elapsed = Math.min(this.duration, this.elapsed + dt);
		const t = this.duration > 0 ? this.elapsed / this.duration : 1;
		//the rise is peripheral movement beside whatever the player is reading; reduced
		//motion keeps the fade and drops the travel, so the number still appears and goes
		this.baseY ??= this.y;
		this.y = this.baseY + floatingTextRise(t, this.rise, reducedMotion());
		this.alpha = floatingTextAlpha(t, this.hold);

		if (t >= 1) {
			this.done = true;
			this.parent?.removeChild(this);
			this.destroy({ children: true });
		}
	}
}

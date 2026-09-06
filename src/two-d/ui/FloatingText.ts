import { Container } from 'pixi.js';
import { Label } from './Label.ts';

export interface FloatingTextOptions {
	text: string;
	color?: number;
	size?: number;

	/** seconds it takes to fully rise and fade; defaults to 0.8 */
	duration?: number;

	/** total pixels it rises over its lifetime; defaults to 24 */
	rise?: number;
}

/**
 * A damage number or a "+1 gold": text that rises and fades over its own lifetime, unlike
 * `Label`'s job of a static, positioned string. This is animation over a label, timed rather
 * than laid out - a game positions one instance per pop-up at the world point it should
 * appear over, then drives it with `update(dt)` the same way `core.Spawner` is `dt`-driven.
 */
export class FloatingText extends Container {
	private readonly duration: number;
	private readonly rise: number;
	private elapsed = 0;
	private done = false;

	constructor(options: FloatingTextOptions) {
		super();

		this.duration = options.duration ?? 0.8;
		this.rise = options.rise ?? 24;

		const label = new Label({ text: options.text, color: options.color, size: options.size });
		label.anchor.set(0.5);
		this.addChild(label);
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
		this.y = -this.rise * t;
		this.alpha = 1 - t;

		if (t >= 1) {
			this.done = true;
			this.parent?.removeChild(this);
			this.destroy({ children: true });
		}
	}
}

/**
 * The one interpolation primitive every dt-driven feature wants: given a duration and a
 * function of progress, run it from 0 to 1 and resolve. `DialogueStage`'s fades and
 * `render.Camera`'s shake decay each used to hand-roll this same shape under a different
 * name; this is that shape, pulled out once.
 */

export type Easing = (t: number) => number;

/** a small standard set, named the way CSS and most engines already do */
export const Easing: Record<
	'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic',
	Easing
> = {
	linear: (t) => t,
	easeInQuad: (t) => t * t,
	easeOutQuad: (t) => t * (2 - t),
	easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2),
	easeInCubic: (t) => t * t * t,
	easeOutCubic: (t) => 1 - (1 - t) ** 3,
	easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2),
};

interface ActiveTween {
	elapsed: number;
	duration: number;
	ease: Easing;
	apply: (t: number) => void;
	resolve: () => void;
}

/** Runs any number of concurrent tweens; a game or a widget drives it from its own `update(dt)`. */
export class Tweener {
	private tweens: ActiveTween[] = [];

	/**
	 * Runs `apply` with progress eased from 0 to 1 over `duration` seconds, resolving once it
	 * reaches 1. A non-positive duration applies the end state at once rather than waiting a
	 * frame for it.
	 */
	tween(duration: number, apply: (t: number) => void, ease: Easing = Easing.linear): Promise<void> {
		if (!(duration > 0)) {
			apply(1);
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			this.tweens.push({ elapsed: 0, duration, apply, ease, resolve });
		});
	}

	update(dt: number): void {
		if (this.tweens.length === 0) return;

		//iterate a copy: a tween's resolve may start another, which must not be advanced
		//again within this same update
		for (const tween of [...this.tweens]) {
			tween.elapsed += dt;
			const t = Math.min(1, tween.elapsed / tween.duration);
			tween.apply(tween.ease(t));

			if (t >= 1) {
				this.tweens.splice(this.tweens.indexOf(tween), 1);
				tween.resolve();
			}
		}
	}

	/** true while any tween is still running */
	get isBusy(): boolean {
		return this.tweens.length > 0;
	}

	/** drops every running tween without applying its end state or resolving it - a teardown, not a completion */
	clear(): void {
		this.tweens = [];
	}
}

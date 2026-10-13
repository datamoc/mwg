/**
 * Turns the variable frame time `Scene.update(dt)` receives into fixed simulation steps.
 *
 * `Game` clamps and scales each frame's `dt` but does not make it constant, so a simulation
 * that must be deterministic and independent of the display's refresh rate (a physics solver,
 * a lockstep game) feeds `dt` here and runs its tick once per returned step instead. The
 * leftover time carries to the next frame, and `maxSubsteps` bounds a slow frame so catching
 * up cannot make the next frame slower still.
 *
 * @example
 * ```ts
 * import { FixedStepper } from '@datamoc/mw_games/core';
 *
 * const stepper = new FixedStepper(1 / 60);
 * const world = { step: (h: number) => console.log('step', h) };
 * // inside Scene.update(dt), here one 40 ms frame:
 * const dt = 0.04;
 * stepper.advance(dt, (h) => world.step(h));
 * const blend = stepper.alpha; // 0..1 into the next step, for interpolated drawing
 * ```
 */
export class FixedStepper {
	readonly step: number;
	readonly maxSubsteps: number;
	private accumulator = 0;

	constructor(step = 1 / 60, maxSubsteps = 5) {
		if (!(step > 0)) throw new Error('a fixed step must be positive');
		this.step = step;
		this.maxSubsteps = Math.max(1, Math.floor(maxSubsteps));
	}

	/**
	 * Adds `dt` seconds and runs `tick(step)` for every whole step now due.
	 *
	 * @returns how many steps ran; time beyond `maxSubsteps` steps is dropped, not banked
	 */
	advance(dt: number, tick: (step: number) => void): number {
		this.accumulator += Math.max(0, dt);
		let ran = 0;
		while (this.accumulator >= this.step && ran < this.maxSubsteps) {
			tick(this.step);
			this.accumulator -= this.step;
			ran++;
		}
		if (this.accumulator >= this.step) this.accumulator = 0;
		return ran;
	}

	/** how far into the next step the leftover time reaches, 0 up to (not including) 1 */
	get alpha(): number {
		return this.accumulator / this.step;
	}

	/** forgets the leftover time, after a scene change or a load */
	reset(): void {
		this.accumulator = 0;
	}
}

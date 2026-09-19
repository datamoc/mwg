export interface QualityScalerOptions {
	/** the ratio a fresh scaler starts at: the device-fitted ratio from `fitResolution` */
	ceiling: number;
	/** the floor stepping down never crosses; defaults to 1 */
	minRatio?: number;
	/** frames per second the game budgets for; defaults to 60 */
	targetFps?: number;
	/** consecutive over-budget frames before one step down; defaults to 60 */
	overBudgetFrames?: number;
	/** consecutive under-budget frames before one step up; defaults to 600 (cautious) */
	underBudgetFrames?: number;
	/** ratio lost per step down (and regained per step up); defaults to 0.25 */
	step?: number;
}

/**
 * Frame-time-driven quality scaling over item 360's static fit: `fitResolution` answers
 * what a device can afford once, and this watches what actually happens, stepping the
 * backing-store ratio down when frames keep missing their budget and stepping back up
 * only after a much longer streak inside it. Pure numbers in and out - the game (see
 * `Game`'s `qualityScaling` option) applies the returned ratio to its renderer, so this
 * stays renderer-free and headless-testable.
 *
 * Stepping up is deliberately an order of magnitude slower than stepping down: a frame
 * inside budget at a reduced ratio proves nothing about the next ratio up, so recovery
 * needs a sustained streak, not a good moment.
 *
 * @example
 * ```ts
 * import { QualityScaler } from '@datamoc/mw_games/two-d';
 *
 * const scaler = new QualityScaler({ ceiling: 2 });
 * for (let i = 0; i < 60; i++) scaler.observe(1 / 30);
 * console.log(scaler.ratio); // 1.75
 * ```
 */
export class QualityScaler {
	private ceiling: number;
	private readonly floor: number;
	private readonly budget: number;
	private readonly downAfter: number;
	private readonly upAfter: number;
	private readonly step: number;
	private ratio_: number;
	private over = 0;
	private under = 0;

	constructor(options: QualityScalerOptions) {
		this.ceiling = normalizeCeiling(options.ceiling);
		const min = options.minRatio ?? 1;
		this.floor = Number.isFinite(min) && min > 0 ? Math.min(min, this.ceiling) : Math.min(1, this.ceiling);
		const fps = options.targetFps ?? 60;
		this.budget = Number.isFinite(fps) && fps > 0 ? 1 / fps : 1 / 60;
		this.downAfter = streakLength(options.overBudgetFrames, 60);
		this.upAfter = streakLength(options.underBudgetFrames, 600);
		this.step = Number.isFinite(options.step) && (options.step as number) > 0 ? (options.step as number) : 0.25;
		this.ratio_ = this.ceiling;
	}

	/** the ratio the renderer should currently use */
	get ratio(): number {
		return this.ratio_;
	}

	/**
	 * A new device-fitted ceiling (rotation, display change): the current ratio is clamped
	 * down to it, never up - stepping back up stays the streak's job. Returns the ratio.
	 */
	setCeiling(ceiling: number): number {
		this.ceiling = normalizeCeiling(ceiling);
		if (this.ratio_ > this.ceiling) {
			this.ratio_ = this.ceiling;
			this.over = 0;
			this.under = 0;
		}
		return this.ratio_;
	}

	/**
	 * Feeds one frame's seconds; returns the ratio the renderer should use, unchanged most
	 * frames. Non-finite or non-positive frames are ignored rather than counted either way,
	 * so a parked clock (a `timeScale` 0 pause) can never drive the policy.
	 */
	observe(frameSeconds: number): number {
		if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) return this.ratio_;
		if (frameSeconds > this.budget) {
			this.over++;
			this.under = 0;
			if (this.over >= this.downAfter && this.ratio_ > this.floor) {
				this.ratio_ = Math.max(this.floor, this.ratio_ - this.step);
				this.over = 0;
			}
		} else {
			this.under++;
			this.over = 0;
			if (this.under >= this.upAfter && this.ratio_ < this.ceiling) {
				this.ratio_ = Math.min(this.ceiling, this.ratio_ + this.step);
				this.under = 0;
			}
		}
		return this.ratio_;
	}

	/** back to the ceiling with both streaks cleared */
	reset(): void {
		this.ratio_ = this.ceiling;
		this.over = 0;
		this.under = 0;
	}
}

function normalizeCeiling(ceiling: number): number {
	return Number.isFinite(ceiling) && ceiling > 0 ? ceiling : 1;
}

function streakLength(value: number | undefined, fallback: number): number {
	return Number.isFinite(value) ? Math.max(1, Math.floor(value as number)) : fallback;
}

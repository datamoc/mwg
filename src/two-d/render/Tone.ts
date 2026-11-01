import { ColorMatrixFilter, type ColorMatrix, type Filter as PixiFilter } from 'pixi.js';

/**
 * The RGSS/MV tone control: a per-channel offset plus a desaturation, applied in one live
 * transform. `red`/`green`/`blue` shift a channel by -255 to 255 (negative darkens, positive
 * brightens) and `gray` pulls every channel towards its luminance by 0 to 255. That is the
 * exact `Tone` an RPG Maker screen carries for a night scene, a memory flashback or a
 * poisoned map, as opposed to `tint` (a multiply) or `colorAdd` (an additive offset alone).
 *
 * The fields are optional and default to 0, so `{ gray: 255 }` is "fully grayscale" and
 * `{ red: 255, green: 255, blue: 255 }` is "white out".
 */
export interface Tone {
	/** added to the red channel, -255 (black) to 255 (white) */
	red?: number;
	green?: number;
	blue?: number;
	/** 0 leaves colours alone, 255 collapses everything to its luminance */
	gray?: number;
}

/** a tone with every channel present and clamped to its documented range */
export interface NormalizedTone {
	readonly red: number;
	readonly green: number;
	readonly blue: number;
	readonly gray: number;
}

/** the identity tone: no offset and no desaturation
 *
 * @example
 * ```ts
 * import { NEUTRAL_TONE } from '@datamoc/mwg/two-d/render';
 *
 * console.log(NEUTRAL_TONE.gray); // 0 - colours are untouched
 * ```
 */
export const NEUTRAL_TONE: NormalizedTone = Object.freeze({ red: 0, green: 0, blue: 0, gray: 0 });

//ITU-R BT.601 luminance, the weights RGSS's own gray conversion uses
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

/** fills in missing channels and clamps each to -255..255, refusing NaN
 *
 * @example
 * ```ts
 * import { normalizeTone } from '@datamoc/mwg/two-d/render';
 *
 * console.log(normalizeTone({ gray: 400 })); // { red: 0, green: 0, blue: 0, gray: 255 }
 * ```
 */
export function normalizeTone(tone: Tone | null | undefined): NormalizedTone {
	const channel = (value: number | undefined): number => {
		const n = Number(value ?? 0);
		if (!Number.isFinite(n)) return 0;
		return Math.min(255, Math.max(-255, n));
	};
	return {
		red: channel(tone?.red),
		green: channel(tone?.green),
		blue: channel(tone?.blue),
		gray: channel(tone?.gray),
	};
}

/**
 * The 5x4 colour matrix `ColorMatrixFilter` takes for a tone, laid out row by row for red,
 * green, blue and alpha, with the fifth column holding each channel's offset in 0..1 units.
 *
 * The gray term mixes every channel towards the same luminance, which is what a matrix can
 * do and a plain tint cannot: at `gray: 255` an image is fully grayscale, and the three
 * offsets are then added on top, so `{ gray: 255, red: 40 }` is a cool monochrome rather
 * than a red-tinted colour image.
 *
 * @example
 * ```ts
 * import { toneMatrix } from '@datamoc/mwg/two-d/render';
 *
 * const gray = toneMatrix({ gray: 255 });
 * // red input maps to the same luminance in every channel:
 * console.log(gray[0], gray[4], gray[8]); // 0.299, 0.299, 0.299
 * ```
 */
export function toneMatrix(tone: Tone | null | undefined): ColorMatrix {
	const t = normalizeTone(tone);
	const s = t.gray / 255;
	//each row: source channels' own contribution after desaturation, plus the offset
	const keep = 1 - s;
	return [
		keep + LUMA_R * s,
		LUMA_G * s,
		LUMA_B * s,
		0,
		t.red / 255,
		LUMA_R * s,
		keep + LUMA_G * s,
		LUMA_B * s,
		0,
		t.green / 255,
		LUMA_R * s,
		LUMA_G * s,
		keep + LUMA_B * s,
		0,
		t.blue / 255,
		0,
		0,
		0,
		1,
		0,
	] as unknown as ColorMatrix;
}

/** the tone `t` of the way from `from` to `to`, for an animated screen tone
 *
 * @example
 * ```ts
 * import { lerpTone } from '@datamoc/mwg/two-d/render';
 *
 * console.log(lerpTone({}, { gray: 200 }, 0.5).gray); // 100
 * ```
 */
export function lerpTone(from: Tone, to: Tone, t: number): NormalizedTone {
	const a = normalizeTone(from);
	const b = normalizeTone(to);
	const mix = (x: number, y: number): number => x + (y - x) * t;
	return {
		red: mix(a.red, b.red),
		green: mix(a.green, b.green),
		blue: mix(a.blue, b.blue),
		gray: mix(a.gray, b.gray),
	};
}

/**
 * A live tone as a Pixi colour-matrix filter: attach it to a sprite, a container or a whole
 * camera world and read or replace `tone` without rebuilding the filter. One filter costs
 * one extra pass over what it covers, so a per-pixel effect on a whole map is a deliberate
 * choice rather than something to put on every sprite; `TintedSprite.setTone` does that
 * wiring for one sprite, `ScreenEffects.tone` for a screen.
 *
 * The Pixi filter is built on first use, because its colour-matrix shader needs a canvas:
 * in a headless process `pixi()` returns null and the tone is still readable and testable,
 * which is what keeps the matrix unit-testable without a renderer.
 *
 * @example
 * ```ts
 * import { ToneFilter } from '@datamoc/mwg/two-d/render';
 * import type { Container2D } from '@datamoc/mwg/two-d/render';
 *
 * declare const world: Container2D;
 *
 * const tone = new ToneFilter({ blue: -40, gray: 60 });
 * const filter = tone.pixi();
 * if (filter) world.filters = [filter]; // a cold, washed-out night
 * tone.tone = { red: 40, green: 10, blue: -20 }; // dawn, the same filter instance
 * ```
 */
export class ToneFilter {
	private _tone: NormalizedTone;
	private _filter: ColorMatrixFilter | null = null;

	constructor(tone: Tone = {}) {
		this._tone = normalizeTone(tone);
	}

	/** the current tone, with every channel present */
	get tone(): NormalizedTone {
		return this._tone;
	}

	set tone(value: Tone) {
		this._tone = normalizeTone(value);
		if (this._filter) this._filter.matrix = toneMatrix(this._tone);
	}

	/** the 5x4 matrix the current tone produces, whether or not a filter exists yet */
	get matrix(): ColorMatrix {
		return toneMatrix(this._tone);
	}

	/**
	 * The Pixi `ColorMatrixFilter` this tone drives, built on demand; null where no canvas
	 * exists (Node, a worker), so the tone stays a plain value there instead of throwing.
	 */
	pixi(): ColorMatrixFilter | null {
		if (this._filter) return this._filter;
		if (typeof document === 'undefined') return null;
		this._filter = new ColorMatrixFilter();
		this._filter.matrix = toneMatrix(this._tone);
		return this._filter;
	}
}

/** anything that can carry Pixi filters, which is every display object */
export interface FilterOwner {
	filters: readonly PixiFilter[] | null;
}

/**
 * Attaches a tone to a display object, keeping whatever filters it already carries and
 * skipping a duplicate. Returns the Pixi filter that was attached, or null where no filter
 * can be built (a headless process), so the caller can remove exactly that one later.
 *
 * @example
 * ```ts
 * import { ToneFilter, attachToneFilter, detachToneFilter } from '@datamoc/mwg/two-d/render';
 * import type { Container2D } from '@datamoc/mwg/two-d/render';
 *
 * declare const sprite: Container2D;
 *
 * const tone = new ToneFilter({ gray: 180 });
 * const filter = attachToneFilter(sprite, tone);
 * detachToneFilter(sprite, filter); // sprite.filters is empty again
 * ```
 */
export function attachToneFilter(owner: FilterOwner, tone: ToneFilter): PixiFilter | null {
	const filter = tone.pixi();
	if (!filter) return null;
	const current = owner.filters ?? [];
	if (!current.includes(filter)) owner.filters = [...current, filter];
	return filter;
}

/** Removes one filter an `attachToneFilter` returned, leaving the owner's others alone. */
export function detachToneFilter(owner: FilterOwner, filter: PixiFilter | null): void {
	if (!filter) return;
	const remaining = (owner.filters ?? []).filter((entry) => entry !== filter);
	owner.filters = remaining.length > 0 ? remaining : null;
}

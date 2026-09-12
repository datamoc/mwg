import { packColorAdd } from './ColorTransformBatcher.ts';

export interface TintTarget {
	/** the packed additive colour, the same field `TintedSprite.colorAdd` is */
	colorAdd: number;
}

export interface StatusVisualStyle {
	/** colour this status contributes on top of every other active one */
	color: number;
	/** 0..1, how strongly this status's colour contributes at full intensity; defaults to 0.5 */
	strength?: number;
	/** cycles per second the strength oscillates between 0 and `strength`; omit for a steady contribution */
	pulseRate?: number;
}

export interface StatusVisualsOptions {
	/** each active status's own contribution; no ordering meaning, since every active one composes */
	styles: Record<string, StatusVisualStyle>;
}

/**
 * Turns a set of active status-effect names into one additive colour on a sprite, so a game's
 * own `actors.applyStatusEffect` handles - which know nothing about rendering - can drive what
 * a character looks like without either side importing the other.
 *
 * Every active status composes over the additive channel (`TintedSprite.colorAdd`) rather than
 * one winning by declaration order: poisoned-and-burning sums both colours (each channel
 * clamped to 1, so an oversaturated combination clips rather than wrapping), instead of only
 * the first-declared style showing. This class never touches the multiply `tint`, so a
 * sprite's own identity tint (a team colour, say) rides underneath untouched - the composition
 * this class's own earlier version could not do, because writing both halves of `lerpTint` per
 * update meant the last status checked always overwrote whatever tint a caller had set. A
 * one-shot `flash` (a damage hit, a heal glow) layers its own decaying contribution on top of
 * whatever statuses are active, rather than needing a caller to juggle a separate colour write.
 *
 * `target` is any object shaped like `TintedSprite`'s own `colorAdd` field - duck-typed the way
 * `Projectile` takes a plain `{x, y}` rather than a real Pixi `Sprite`, so this is fully
 * testable without Pixi and works on any sprite subclass that exposes the same field.
 *
 * @example
 * ```ts
 * import { StatusVisuals, TintedSprite, type Texture2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const ratTexture: Texture2D;
 * const rat = new TintedSprite(ratTexture);
 * rat.tint = 0x8080ff; // a team colour, untouched by anything below
 *
 * const visuals = new StatusVisuals(rat, {
 * 	styles: {
 * 		poisoned: { color: 0x00ff00, strength: 0.5 },
 * 		burning: { color: 0xff6600, strength: 0.6, pulseRate: 2 },
 * 	},
 * });
 *
 * visuals.set('poisoned', true);
 * visuals.set('burning', true);
 * visuals.update(1 / 60); // both colours composed into rat.colorAdd; rat.tint is untouched
 * console.log(visuals.has('poisoned')); // true
 *
 * visuals.flash(0xffffff, 0.8, 0.2); // a bright hit-flash, decaying over 0.2s
 * visuals.update(1 / 60);
 *
 * visuals.set('poisoned', false);
 * visuals.set('burning', false);
 * visuals.update(1 / 60); // no status or flash left active: colorAdd back to 0
 * ```
 */
export class StatusVisuals {
	private target: TintTarget;
	private styles: Record<string, StatusVisualStyle>;
	private active = new Set<string>();
	private elapsed = 0;

	private flashColor = 0;
	private flashStrength = 0;
	private flashDuration = 0;
	private flashRemaining = 0;

	constructor(target: TintTarget, options: StatusVisualsOptions) {
		this.target = target;
		this.styles = options.styles;
	}

	/** marks `kind` active or inactive; a `kind` with no matching style is tracked but never shown */
	set(kind: string, active: boolean): void {
		if (active) this.active.add(kind);
		else this.active.delete(kind);
	}

	has(kind: string): boolean {
		return this.active.has(kind);
	}

	/**
	 * Layers a transient additive pulse on top of whatever statuses are active, linearly
	 * decaying `strength` to zero over `duration` seconds - a damage hit or a heal glow that
	 * needs no status of its own and no caller-managed timer.
	 */
	flash(color: number, strength: number, duration: number): void {
		this.flashColor = color;
		this.flashStrength = strength;
		this.flashDuration = Math.max(duration, 1e-6);
		this.flashRemaining = this.flashDuration;
	}

	/** advances any pulsing style and the flash decay, and repaints the sprite's additive channel */
	update(dt: number): void {
		this.elapsed += dt;
		if (this.flashRemaining > 0) this.flashRemaining = Math.max(0, this.flashRemaining - dt);

		let r = 0;
		let g = 0;
		let b = 0;

		for (const kind of this.active) {
			const style = this.styles[kind];
			if (!style) continue;
			const peak = style.strength ?? 0.5;
			const strength = style.pulseRate
				? peak * (0.5 + 0.5 * Math.sin(this.elapsed * style.pulseRate * Math.PI * 2))
				: peak;
			r += (((style.color >> 16) & 0xff) / 255) * strength;
			g += (((style.color >> 8) & 0xff) / 255) * strength;
			b += ((style.color & 0xff) / 255) * strength;
		}

		if (this.flashRemaining > 0) {
			const flashT = this.flashRemaining / this.flashDuration;
			const flashStrength = this.flashStrength * flashT;
			r += (((this.flashColor >> 16) & 0xff) / 255) * flashStrength;
			g += (((this.flashColor >> 8) & 0xff) / 255) * flashStrength;
			b += ((this.flashColor & 0xff) / 255) * flashStrength;
		}

		this.target.colorAdd = packColorAdd(Math.min(1, r), Math.min(1, g), Math.min(1, b));
	}
}

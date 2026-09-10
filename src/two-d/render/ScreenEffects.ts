import { Container, Graphics } from 'pixi.js';
import { Easing } from '../../core/Tween.ts';
import { reducedMotion } from '../../core/Motion.ts';

/** what the overlay is currently doing; `'idle'` covers both fully clear and a held tint */
export type ScreenEffectPhase = 'idle' | 'fadeOut' | 'fadeIn' | 'flash';

export interface ScreenEffectsOptions {
	width?: number;
	height?: number;

	/** the colour used when a call does not name one; defaults to black */
	color?: number;
}

/**
 * A full-screen colour wash over everything else: fade out to black between floors, flash
 * white on a critical hit, hold a red tint while poisoned.
 *
 * Driven by `update(dt)` against a plain elapsed timer rather than a promise-returning tween,
 * matching `Toast` and `FloatingText`: a single frame boundary per phase keeps the whole
 * sequence reproducible one `update` call at a time, which a test (or a recorded replay) can
 * drive without waiting on a microtask to settle. `update` returns true on the exact frame an
 * effect finishes, the same way `Projectile.update` reports arrival, so a caller sequences
 * "fade out, swap the level, fade in" without needing `await`.
 *
 * Add the container last, or to a layer above the world: this draws over whatever is beneath
 * it in the display list and nothing else about draw order is its business.
 *
 * @example
 * ```ts
 * import { ScreenEffects } from '@datamoc/mw_games/two-d/render';
 *
 * const effects = new ScreenEffects({ width: 640, height: 360 });
 * // add effects last: game.stage.addChild(effects);
 *
 * effects.flash(0.2, 0xffffff); // a critical hit
 * const done = effects.update(1 / 60);
 * console.log(done); // false - still mid-flash
 * console.log(effects.isBusy); // true
 *
 * effects.setTint(0x336633, 0.3); // held green cast while poisoned
 * ```
 */
export class ScreenEffects extends Container {
	private readonly overlay = new Graphics();
	private readonly defaultColor: number;

	private viewWidth: number;
	private viewHeight: number;

	private phase: ScreenEffectPhase = 'idle';
	private elapsed = 0;
	private duration = 0;

	/** alpha the current phase starts from and drives towards */
	private fromAlpha = 0;
	private toAlpha = 0;

	constructor(options: ScreenEffectsOptions = {}) {
		super();
		this.defaultColor = options.color ?? 0x000000;
		this.viewWidth = options.width ?? 0;
		this.viewHeight = options.height ?? 0;

		this.overlay.alpha = 0;
		this.overlay.tint = this.defaultColor;
		this.addChild(this.overlay);
		this.redraw();
	}

	/** call from a scene's own `resize`, so the wash keeps covering the whole canvas */
	setViewport(width: number, height: number): void {
		this.viewWidth = width;
		this.viewHeight = height;
		this.redraw();
	}

	private redraw(): void {
		this.overlay.clear();
		if (this.viewWidth > 0 && this.viewHeight > 0) {
			this.overlay.rect(0, 0, this.viewWidth, this.viewHeight).fill({ color: 0xffffff });
		}
	}

	/** true while a fade or flash is still running; a held tint is not busy */
	get isBusy(): boolean {
		return this.phase !== 'idle';
	}

	/**
	 * The wash's own opacity, 0 (clear) to 1 (fully covering).
	 *
	 * Distinct from this container's inherited `alpha`, which scales the whole effect layer
	 * including the wash - a game that fades the effect layer itself still reads the wash here.
	 */
	get washAlpha(): number {
		return this.overlay.alpha;
	}

	/** darkens to fully cover the screen - the first half of a transition between scenes */
	fadeOut(duration: number, color?: number): void {
		this.begin('fadeOut', duration, this.overlay.alpha, 1, color);
	}

	/** clears back to fully transparent - the second half, once the new scene is built */
	fadeIn(duration: number, color?: number): void {
		this.begin('fadeIn', duration, this.overlay.alpha, 0, color);
	}

	/**
	 * A quick wash in and straight back out again, peaking at `peak` partway through.
	 *
	 * One phase rather than a fade-out chained into a fade-in, because a flash is a single
	 * gesture: interrupting it halfway should cancel the whole thing, not leave the screen
	 * stuck at full white waiting for a second phase that no longer runs.
	 */
	flash(duration: number, color?: number, peak = 1): void {
		this.begin('flash', duration, 0, peak, color);
	}

	/**
	 * Holds a colour at a fixed opacity until changed - a poisoned green cast, an underwater
	 * blue. Cancels any running fade or flash, since those drive the same one overlay.
	 */
	setTint(color: number, alpha: number): void {
		this.phase = 'idle';
		this.elapsed = 0;
		this.overlay.tint = color;
		this.overlay.alpha = Math.max(0, Math.min(1, alpha));
	}

	/** clears the overlay outright, running effect and held tint alike */
	clear(): void {
		this.phase = 'idle';
		this.elapsed = 0;
		this.overlay.alpha = 0;
		this.overlay.tint = this.defaultColor;
	}

	private begin(phase: ScreenEffectPhase, duration: number, from: number, to: number, color?: number): void {
		//reduced motion turns a fade or flash into the instant cut a non-positive duration is
		if (reducedMotion()) duration = 0;

		this.overlay.tint = color ?? this.defaultColor;
		this.fromAlpha = from;
		this.toAlpha = to;
		this.elapsed = 0;
		this.duration = duration;

		//a non-positive duration is an instant cut, applied now rather than a frame later
		if (!(duration > 0)) {
			this.overlay.alpha = phase === 'flash' ? 0 : to;
			this.phase = 'idle';
			return;
		}

		this.phase = phase;
		this.overlay.alpha = phase === 'flash' ? 0 : from;
	}

	/** @returns true on the single frame the running effect completes */
	update(dt: number): boolean {
		if (this.phase === 'idle') return false;

		this.elapsed += dt;
		const t = Math.min(1, this.elapsed / this.duration);

		if (this.phase === 'flash') {
			//up fast, down slow: a flash reads as an impact rather than a pulse
			const shape = t < 0.5 ? Easing.easeOutQuad(t * 2) : 1 - Easing.easeInQuad((t - 0.5) * 2);
			this.overlay.alpha = this.toAlpha * shape;
		} else {
			const eased = Easing.easeInOutQuad(t);
			this.overlay.alpha = this.fromAlpha + (this.toAlpha - this.fromAlpha) * eased;
		}

		if (t >= 1) {
			this.overlay.alpha = this.phase === 'flash' ? 0 : this.toAlpha;
			this.phase = 'idle';
			return true;
		}
		return false;
	}
}

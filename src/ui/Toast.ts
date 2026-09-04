import { Container } from 'pixi.js';
import { Easing } from '../core/Tween.ts';

export interface ToastOptions {
	/** seconds to pop in; defaults to 0.25 */
	fadeIn?: number;
	/** seconds to hold at full visibility once popped in; defaults to 1 */
	hold?: number;
	/** seconds to fade out; defaults to 1.75 */
	fadeOut?: number;
	/** the scale a toast pops in from, settling to 1; defaults to 2 */
	scaleFrom?: number;
}

type Phase = 'fadeIn' | 'hold' | 'fadeOut';

/**
 * A queued, timed pop-up notification - an achievement unlock, a level-up banner, a "quest
 * complete" toast. The same pop-in/hold/fade-out shape `FloatingText` already generalizes
 * for a damage number, but queued rather than fire-and-forget: only one toast is ever shown
 * at a time, and a second one landing mid-animation waits its turn instead of overlapping.
 *
 * `show` takes a `Container` the caller builds and owns (an icon, a label, a whole banner
 * layout) - this owns only the timing, never the content's own shape. Driven directly by
 * `update(dt)` with a plain phase/elapsed timer, the same shape `FloatingText` already uses,
 * rather than chained tweens: a single frame boundary between phases keeps the whole
 * sequence exactly reproducible one `update` call at a time, which a test can drive without
 * waiting on any promise microtask to settle.
 */
export class Toast extends Container {
	private readonly fadeIn: number;
	private readonly hold: number;
	private readonly fadeOut: number;
	private readonly scaleFrom: number;

	private queue: Container[] = [];
	private current: Container | null = null;
	private phase: Phase = 'fadeIn';
	private elapsed = 0;

	constructor(options: ToastOptions = {}) {
		super();
		this.fadeIn = options.fadeIn ?? 0.25;
		this.hold = options.hold ?? 1;
		this.fadeOut = options.fadeOut ?? 1.75;
		this.scaleFrom = options.scaleFrom ?? 2;
	}

	/** queues `content` to show next, or immediately if nothing is currently showing */
	show(content: Container): void {
		this.queue.push(content);
		if (!this.current) this.start(this.queue.shift()!);
	}

	/** true while a toast is showing or waiting in the queue */
	get isBusy(): boolean {
		return this.current !== null || this.queue.length > 0;
	}

	private start(content: Container): void {
		this.current = content;
		this.phase = 'fadeIn';
		this.elapsed = 0;
		this.addChild(content);
		content.alpha = this.fadeIn > 0 ? 0 : 1;
		content.scale.set(this.fadeIn > 0 ? this.scaleFrom : 1);
	}

	update(dt: number): void {
		const content = this.current;
		if (!content) return;

		this.elapsed += dt;

		if (this.phase === 'fadeIn') {
			const duration = this.fadeIn;
			const t = duration > 0 ? Math.min(1, this.elapsed / duration) : 1;
			const eased = Easing.easeOutCubic(t);
			content.alpha = eased;
			content.scale.set(this.scaleFrom + (1 - this.scaleFrom) * eased);
			if (t >= 1) this.advance();
			return;
		}

		if (this.phase === 'hold') {
			if (this.elapsed >= this.hold) this.advance();
			return;
		}

		//fadeOut
		const duration = this.fadeOut;
		const t = duration > 0 ? Math.min(1, this.elapsed / duration) : 1;
		content.alpha = 1 - t;
		if (t >= 1) this.finish();
	}

	private advance(): void {
		this.phase = this.phase === 'fadeIn' ? 'hold' : 'fadeOut';
		this.elapsed = 0;
	}

	private finish(): void {
		const content = this.current;
		if (!content) return;
		this.removeChild(content);
		content.destroy({ children: true });
		this.current = null;

		const next = this.queue.shift();
		if (next) this.start(next);
	}
}

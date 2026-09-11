import { Container, Graphics } from 'pixi.js';
import { Signal } from '../../core/Signal.ts';
import { theme, themeChanged } from './theme.ts';

/**
 * Steps a number by `delta`, snapped to `step` and kept in `[min, max]`. With `wrap`, passing
 * the top starts again at the bottom and dropping below the bottom lands on the top; without it,
 * the value clamps - a level cap or a bag size, where wrapping would be a surprise.
 *
 * @example
 * ```ts
 * import { spinValue } from '@datamoc/mw_games/two-d/ui';
 *
 * console.log(spinValue(10, 1, 0, 10, 1)); // 10, clamped
 * console.log(spinValue(10, 1, 0, 10, 1, true)); // 0, wrapped
 * ```
 */
export function spinValue(value: number, delta: number, min: number, max: number, step = 1, wrap = false): number {
	if (!(max > min)) return min;
	const grid = step > 0 ? step : 1;
	const decimals = (String(grid).split('.')[1] ?? '').length;
	const steps = Math.round((value - min) / grid) + Math.round(delta);
	const count = Math.round((max - min) / grid) + 1;
	let index = steps;
	if (wrap) index = ((index % count) + count) % count;
	else index = Math.max(0, Math.min(count - 1, index));
	return Number((min + index * grid).toFixed(decimals));
}

export interface SpinnerOptions {
	width?: number;
	height?: number;
	min?: number;
	max?: number;
	step?: number;
	value?: number;
	/** wrap past the ends instead of clamping */
	wrap?: boolean;
	disabled?: boolean;
}

/**
 * A small up/down stepper: tap the top half to add one step, the bottom half to take one away.
 * It draws only the arrows; the current value is a `Label` the game puts beside it, the same
 * split `Checkbox` and `Slider` keep from their captions.
 *
 * @example
 * ```ts
 * import { Spinner } from '@datamoc/mw_games/two-d/ui';
 *
 * const level = new Spinner({ min: 1, max: 99, value: 1 });
 * level.increment();
 * console.log(level.value); // 2
 * ```
 */
export class Spinner extends Container {
	readonly onChange = new Signal<number>();

	private face = new Graphics();

	private width_: number;
	private height_: number;
	private min: number;
	private max: number;
	private step: number;
	private value_: number;
	private wrap: boolean;
	private disabled_: boolean;

	private readonly themeListener = () => this.draw();

	constructor(options: SpinnerOptions = {}) {
		super();

		this.width_ = options.width ?? 24;
		this.height_ = options.height ?? 32;
		this.min = options.min ?? 0;
		this.max = options.max ?? 9;
		this.step = options.step ?? 1;
		this.wrap = options.wrap ?? false;
		this.disabled_ = options.disabled ?? false;
		this.value_ = spinValue(options.value ?? this.min, 0, this.min, this.max, this.step, false);

		this.addChild(this.face);
		this.draw();

		this.eventMode = 'static';
		this.cursor = 'pointer';
		this.on('pointertap', this.handleTap);

		themeChanged.add(this.themeListener);
	}

	get value(): number {
		return this.value_;
	}

	get disabled(): boolean {
		return this.disabled_;
	}

	setDisabled(disabled: boolean): void {
		this.disabled_ = disabled;
		this.cursor = disabled ? 'default' : 'pointer';
		this.draw();
	}

	setValue(value: number): void {
		this.commit(spinValue(value, 0, this.min, this.max, this.step, this.wrap));
	}

	increment(): void {
		this.commit(spinValue(this.value_, 1, this.min, this.max, this.step, this.wrap));
	}

	decrement(): void {
		this.commit(spinValue(this.value_, -1, this.min, this.max, this.step, this.wrap));
	}

	resize(width: number, height: number): void {
		this.width_ = width;
		this.height_ = height;
		this.draw();
	}

	private commit(next: number): void {
		if (next === this.value_) {
			this.draw();
			return;
		}
		this.value_ = next;
		this.draw();
		this.onChange.dispatch(next);
	}

	private readonly handleTap = (event: { global: { x: number; y: number } }): void => {
		if (this.disabled_) return;
		const local = this.toLocal(event.global);
		if (local.y < this.height_ / 2) this.increment();
		else this.decrement();
	};

	private draw(): void {
		const t = theme();
		const color = this.disabled_ ? t.color.textDim : t.color.textHighlight;

		this.face
			.clear()
			.roundRect(0, 0, this.width_, this.height_, 4)
			.fill({ color: t.color.panelFill })
			.stroke({ color: t.color.panelBorder, width: 1 });

		const cx = this.width_ / 2;
		const arrow = Math.min(this.width_ / 4, this.height_ / 5);
		this.face
			.moveTo(cx - arrow, arrow * 1.6)
			.lineTo(cx, arrow * 0.6)
			.lineTo(cx + arrow, arrow * 1.6)
			.closePath()
			.fill({ color });
		this.face
			.moveTo(cx - arrow, this.height_ - arrow * 1.6)
			.lineTo(cx, this.height_ - arrow * 0.6)
			.lineTo(cx + arrow, this.height_ - arrow * 1.6)
			.closePath()
			.fill({ color });
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}

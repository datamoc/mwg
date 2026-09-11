import { Container, Graphics } from 'pixi.js';
import { Signal } from '../../core/Signal.ts';
import { theme, themeChanged } from './theme.ts';

export interface SliderOptions {
	width: number;
	height?: number;

	min?: number;
	max?: number;
	/** the value grid; 0 or omitted is continuous */
	step?: number;
	value?: number;

	/** the draggable knob's diameter; defaults to the track height */
	knobSize?: number;

	disabled?: boolean;
}

/**
 * Where `value` sits in `[min, max]`, 0 to 1, clamped. A degenerate range reads 0 rather than
 * dividing by zero.
 *
 * @example
 * ```ts
 * import { sliderFraction } from '@datamoc/mw_games/two-d/ui';
 *
 * console.log(sliderFraction(30, 0, 60)); // 0.5
 * ```
 */
export function sliderFraction(value: number, min = 0, max = 1): number {
	if (!(max > min)) return 0;
	return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * The value at a 0-to-1 position on the track, snapped to `step` and clamped to `[min, max]`.
 * The snap is rounded to the step's own number of decimals, so a 0.1 step reads `0.3` rather
 * than `0.30000000000000004`.
 *
 * @example
 * ```ts
 * import { sliderValueAt } from '@datamoc/mw_games/two-d/ui';
 *
 * console.log(sliderValueAt(0.5, 0, 10, 1)); // 5
 * ```
 */
export function sliderValueAt(fraction: number, min = 0, max = 1, step = 0): number {
	const clamped = Math.max(0, Math.min(1, fraction));
	const raw = min + clamped * (max - min);
	if (!(step > 0)) return raw;
	const decimals = (String(step).split('.')[1] ?? '').length;
	const snapped = min + Math.round((raw - min) / step) * step;
	return Number(Math.max(min, Math.min(max, snapped)).toFixed(decimals));
}

/**
 * A draggable knob on a track, for a volume, difficulty or zoom setting.
 *
 * The track is drawn from the theme and a partial fill shows where the knob is; the value is
 * always a number in `[min, max]`, and `sliderValueAt` is the arithmetic that turns a click or
 * drag into one, exported so a game routing input itself gets the same snapping.
 *
 * @example
 * ```ts
 * import { Slider } from '@datamoc/mw_games/two-d/ui';
 *
 * const volume = new Slider({ width: 200, min: 0, max: 100, step: 5, value: 40 });
 * volume.onChange.add((value) => console.log('volume', value));
 * volume.setValue(75);
 * ```
 */
export class Slider extends Container {
	readonly onChange = new Signal<number>();

	private track = new Graphics();
	private fill = new Graphics();
	private knob = new Graphics();

	private width_: number;
	private height_: number;
	private knobSize: number;
	private min: number;
	private max: number;
	private step: number;
	private value_: number;
	private disabled_: boolean;

	private dragging = false;

	private readonly themeListener = () => this.draw();

	constructor(options: SliderOptions) {
		super();

		this.width_ = options.width;
		this.height_ = options.height ?? 6;
		this.knobSize = options.knobSize ?? Math.max(12, this.height_ * 2);
		this.min = options.min ?? 0;
		this.max = options.max ?? 1;
		this.step = options.step ?? 0;
		this.value_ = this.snap(options.value ?? this.min);
		this.disabled_ = options.disabled ?? false;

		this.addChild(this.track);
		this.addChild(this.fill);
		this.addChild(this.knob);
		this.draw();

		this.eventMode = 'static';
		this.cursor = 'pointer';
		this.on('pointerdown', this.handleDown);
		this.on('pointermove', this.handleMove);
		this.on('pointerup', this.handleUp);
		this.on('pointerupoutside', this.handleUp);

		themeChanged.add(this.themeListener);
	}

	/** the current value, in `[min, max]` */
	get value(): number {
		return this.value_;
	}

	/** where the knob sits, 0 to 1 */
	get fraction(): number {
		return sliderFraction(this.value_, this.min, this.max);
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
		const snapped = this.snap(value);
		if (snapped === this.value_) {
			this.draw();
			return;
		}
		this.value_ = snapped;
		this.draw();
		this.onChange.dispatch(snapped);
	}

	/** moves the knob to a 0-to-1 position, the arithmetic a track click uses */
	setFraction(fraction: number): void {
		this.setValue(sliderValueAt(fraction, this.min, this.max, this.step));
	}

	resize(width: number, height: number): void {
		this.width_ = width;
		this.height_ = height;
		this.draw();
	}

	private get trackLength(): number {
		return Math.max(0, this.width_ - this.knobSize);
	}

	private snap(value: number): number {
		return sliderValueAt(sliderFraction(value, this.min, this.max), this.min, this.max, this.step);
	}

	private fractionAt(localX: number): number {
		return this.trackLength > 0 ? Math.max(0, Math.min(1, (localX - this.knobSize / 2) / this.trackLength)) : 0;
	}

	private readonly handleDown = (event: { global: { x: number; y: number } }): void => {
		if (this.disabled_) return;
		this.dragging = true;
		this.setFraction(this.fractionAt(this.toLocal(event.global).x));
	};

	private readonly handleMove = (event: { global: { x: number; y: number } }): void => {
		if (!this.dragging || this.disabled_) return;
		this.setFraction(this.fractionAt(this.toLocal(event.global).x));
	};

	private readonly handleUp = (): void => {
		this.dragging = false;
	};

	private draw(): void {
		const t = theme();
		const color = this.disabled_ ? t.color.textDim : t.color.textHighlight;
		const trackColor = t.color.panelFill;

		const top = (this.knobSize - this.height_) / 2;
		this.track
			.clear()
			.roundRect(0, top, this.width_, this.height_, this.height_ / 2)
			.fill({ color: trackColor });

		const knobX = this.knobSize / 2 + this.fraction * this.trackLength;
		this.fill.clear();
		if (knobX > this.knobSize / 2) {
			this.fill
				.roundRect(this.knobSize / 2, top, knobX - this.knobSize / 2, this.height_, this.height_ / 2)
				.fill({ color });
		}

		this.knob
			.clear()
			.circle(knobX, this.knobSize / 2, this.knobSize / 2)
			.fill({ color });
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}

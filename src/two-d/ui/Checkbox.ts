import { Container, Graphics } from 'pixi.js';
import { Signal } from '../../core/Signal.ts';
import { theme, themeChanged } from './theme.ts';

export interface CheckboxOptions {
	/** the box's side length; the check is drawn inside it */
	size?: number;
	checked?: boolean;
	disabled?: boolean;
	/** the tick's colour; the theme's highlight when omitted */
	color?: number;
}

/**
 * A square box that is ticked or not, the toggle a settings row or an option list puts beside its
 * label. It draws only the box and its tick - a caption is a `Label` the game places next to it,
 * so the two can be laid out and translated independently.
 *
 * @example
 * ```ts
 * import { Checkbox } from '@datamoc/mw_games/two-d/ui';
 *
 * const fullscreen = new Checkbox({ checked: true });
 * fullscreen.onChange.add((on) => console.log('fullscreen', on));
 * fullscreen.toggle();
 * ```
 */
export class Checkbox extends Container {
	readonly onChange = new Signal<boolean>();

	private box = new Graphics();

	private size_: number;
	private checked_: boolean;
	private disabled_: boolean;

	private readonly themeListener = () => this.draw();

	constructor(options: CheckboxOptions = {}) {
		super();

		this.size_ = options.size ?? 20;
		this.checked_ = options.checked ?? false;
		this.disabled_ = options.disabled ?? false;

		this.addChild(this.box);
		this.draw();

		this.eventMode = 'static';
		this.cursor = 'pointer';
		this.on('pointertap', this.handleTap);

		themeChanged.add(this.themeListener);
	}

	get checked(): boolean {
		return this.checked_;
	}

	get disabled(): boolean {
		return this.disabled_;
	}

	setDisabled(disabled: boolean): void {
		this.disabled_ = disabled;
		this.cursor = disabled ? 'default' : 'pointer';
		this.draw();
	}

	/** sets the box, firing `onChange` only when the value actually moves */
	setChecked(checked: boolean): void {
		if (checked === this.checked_) {
			this.draw();
			return;
		}
		this.checked_ = checked;
		this.draw();
		this.onChange.dispatch(checked);
	}

	toggle(): void {
		this.setChecked(!this.checked_);
	}

	resize(size: number): void {
		this.size_ = size;
		this.draw();
	}

	private readonly handleTap = (): void => {
		if (this.disabled_) return;
		this.toggle();
	};

	private draw(): void {
		const t = theme();
		const color = this.disabled_ ? t.color.textDim : t.color.textHighlight;

		this.box
			.clear()
			.roundRect(0, 0, this.size_, this.size_, 4)
			.fill({ color: t.color.panelFill })
			.stroke({ color: this.disabled_ ? t.color.textDim : t.color.panelBorder, width: 2 });

		if (this.checked_) {
			const inset = this.size_ * 0.25;
			this.box
				.moveTo(inset, this.size_ * 0.55)
				.lineTo(this.size_ * 0.45, this.size_ - inset)
				.lineTo(this.size_ - inset, inset)
				.stroke({ color, width: Math.max(2, this.size_ * 0.12), cap: 'round', join: 'round' });
		}
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}

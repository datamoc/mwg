import { Container, Graphics, type Texture } from 'pixi.js';
import { theme, themeChanged } from './theme.ts';

export interface BarOptions {
	width: number;
	height: number;

	/** the filled colour; defaults to the theme's highlight colour. Tints `fillTexture` too, when both are given */
	color?: number;

	/** starting value, read the same way `setValue` is; defaults to full */
	value?: number;
	max?: number;

	/** the fill's own art, stretched to the filled width; a plain colour rect (the default) when omitted */
	fillTexture?: Texture;

	/** the track's own art; a plain colour rect (the theme's panel fill) when omitted */
	backgroundTexture?: Texture;

	/**
	 * Rounds the filled width up to the next whole pixel instead of a fractional one, so a
	 * sliver of value (1 hp of 300, say) never rounds down to nothing. Off by default, since
	 * it very slightly overstates the fraction at low values - a game where that sliver
	 * matters more than the precision opts in.
	 */
	roundUpToPixel?: boolean;
}

/**
 * A filled proportion of a track - a health, mana or experience bar.
 *
 * Closer to a small, focused primitive than a general-purpose progress-bar widget: it draws
 * a background track and a foreground fill sized to `value / max`, and nothing else. Colour
 * follows the theme the way `Label` does, unless a game gives one of its own.
 */
export class Bar extends Container {
	private track = new Graphics();
	private fill = new Graphics();

	private width_: number;
	private height_: number;
	private readonly explicitColor: boolean;
	private color: number;
	private fraction: number;
	private readonly fillTexture?: Texture;
	private readonly backgroundTexture?: Texture;
	private readonly roundUpToPixel: boolean;

	private readonly themeListener = () => this.draw();

	constructor(options: BarOptions) {
		super();

		this.width_ = options.width;
		this.height_ = options.height;
		this.explicitColor = options.color !== undefined;
		this.color = options.color ?? theme().color.textHighlight;
		this.fraction = clamp((options.value ?? 1) / (options.max ?? 1));
		this.fillTexture = options.fillTexture;
		this.backgroundTexture = options.backgroundTexture;
		this.roundUpToPixel = options.roundUpToPixel ?? false;

		this.addChild(this.track);
		this.addChild(this.fill);
		this.draw();

		themeChanged.add(this.themeListener);
	}

	/** the current fill, 0 to 1 */
	get value(): number {
		return this.fraction;
	}

	setValue(value: number, max = 1): void {
		this.fraction = clamp(max > 0 ? value / max : 0);
		this.draw();
	}

	resize(width: number, height: number): void {
		this.width_ = width;
		this.height_ = height;
		this.draw();
	}

	private draw(): void {
		const t = theme();
		if (!this.explicitColor) this.color = t.color.textHighlight;

		this.track.clear().rect(0, 0, this.width_, this.height_);
		this.track.fill(this.backgroundTexture ? { texture: this.backgroundTexture } : { color: t.color.panelFill });

		this.fill.clear();
		if (this.fraction > 0) {
			const rawWidth = this.width_ * this.fraction;
			const width = this.roundUpToPixel ? Math.ceil(rawWidth) : rawWidth;
			this.fill.rect(0, 0, width, this.height_);
			//an explicit colour tints art the same way it recolours a flat fill; an
			//untinted texture is left to its own colours when none was given
			this.fill.fill(
				this.fillTexture
					? this.explicitColor
						? { texture: this.fillTexture, color: this.color }
						: { texture: this.fillTexture }
					: { color: this.color }
			);
		}
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}

function clamp(fraction: number): number {
	return Math.max(0, Math.min(1, fraction));
}

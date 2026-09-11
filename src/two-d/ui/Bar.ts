import { Container, Graphics } from 'pixi.js';
import { theme, themeChanged } from './theme.ts';
import type { Texture2D } from '../render/Types2D.ts';

export interface BarOptions {
	width: number;
	height: number;

	/** the filled colour; defaults to the theme's highlight colour. Tints `fillTexture` too, when both are given */
	color?: number;

	/** starting value, read the same way `setValue` is; defaults to full */
	value?: number;
	max?: number;

	/** the fill's own art, stretched to the filled width; a plain colour rect (the default) when omitted */
	fillTexture?: Texture2D;

	/**
	 * The track's own colour; the theme's panel fill when omitted. Ignored when
	 * `backgroundTexture` is given, which owns the track's appearance instead.
	 */
	background?: number;

	/** the track's own art; a plain colour rect (the theme's panel fill) when omitted */
	backgroundTexture?: Texture2D;

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
 *
 * @example
 * ```ts
 * import { Bar } from '@datamoc/mw_games/two-d/ui';
 *
 * const hp = new Bar({ width: 120, height: 8, color: 0xcc3333, value: 30, max: 30 });
 *
 * hp.setValue(18, 30); // took damage
 * console.log(hp.value); // 0.6
 * hp.setColor(0xff0000); // and it is bleeding
 *
 * hp.resize(160, 8); // the window around it grew
 * ```
 */
export class Bar extends Container {
	private track = new Graphics();
	private fill = new Graphics();

	private width_: number;
	private height_: number;
	private explicitColor: boolean;
	private fillColor: number;
	private fraction: number;
	private readonly fillTexture?: Texture2D;
	private readonly backgroundTexture?: Texture2D;
	private readonly background_?: number;
	private readonly roundUpToPixel: boolean;

	private readonly themeListener = () => this.draw();

	constructor(options: BarOptions) {
		super();

		this.width_ = options.width;
		this.height_ = options.height;
		this.explicitColor = options.color !== undefined;
		this.fillColor = options.color ?? theme().color.textHighlight;
		this.fraction = clamp((options.value ?? 1) / (options.max ?? 1));
		this.fillTexture = options.fillTexture;
		this.backgroundTexture = options.backgroundTexture;
		this.background_ = options.background;
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

	/** the resolved fill colour: the explicit one, or the theme's highlight */
	get color(): number {
		return this.fillColor;
	}

	/**
	 * Recolours the fill at runtime - the other half of what a bar does on screen, beside
	 * `setValue`: a health bar going red as it empties, a boss bar while it bleeds.
	 *
	 * Counts as explicit, exactly as passing `color` to the constructor does, so a later theme
	 * change cannot throw the game's own colour away.
	 */
	setColor(color: number): void {
		this.explicitColor = true;
		this.fillColor = color;
		this.draw();
	}

	/** the resolved track colour: `background`, or the theme's panel fill */
	get background(): number {
		return this.background_ ?? theme().color.panelFill;
	}

	resize(width: number, height: number): void {
		this.width_ = width;
		this.height_ = height;
		this.draw();
	}

	private draw(): void {
		const t = theme();
		if (!this.explicitColor) this.fillColor = t.color.textHighlight;

		this.track.clear().rect(0, 0, this.width_, this.height_);
		this.track.fill(this.backgroundTexture ? { texture: this.backgroundTexture } : { color: this.background });

		this.fill.clear();
		if (this.fraction > 0) {
			const rawWidth = this.width_ * this.fraction;
			const width = this.roundUpToPixel ? Math.ceil(rawWidth) : rawWidth;
			//rtl fills from the reading-start edge, which is the right one, rather than always
			//growing from x=0 the way a ltr bar (health, mana, a loading bar) reads naturally
			const x = t.direction === 'rtl' ? this.width_ - width : 0;
			this.fill.rect(x, 0, width, this.height_);
			//an explicit colour tints art the same way it recolours a flat fill; an
			//untinted texture is left to its own colours when none was given
			this.fill.fill(
				this.fillTexture
					? this.explicitColor
						? { texture: this.fillTexture, color: this.fillColor }
						: { texture: this.fillTexture }
					: { color: this.fillColor },
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

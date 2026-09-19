import { Container, Graphics, Sprite } from 'pixi.js';
import { theme, themeChanged } from './theme.ts';
import type { Texture2D } from '../render/Types2D.ts';

export interface MeterOptions {
	/** total icons; fractional counts floor, below 1 becomes 1 */
	count: number;
	/** filled icons, fractions allowed (a half heart is 0.5); defaults to full */
	value?: number;
	/** icon diameter in pixels */
	size?: number;
	/** gap between icons in pixels */
	gap?: number;

	/** the filled icon's art; `emptyTexture` must come with it, or neither */
	filledTexture?: Texture2D;
	/** the empty icon's art; `filledTexture` must come with it, or neither */
	emptyTexture?: Texture2D;

	/** filled colour in flat mode; tints `filledTexture` too, when both are given */
	color?: number;
	/** empty colour in flat mode; the theme's panel fill when omitted */
	emptyColor?: number;
}

/**
 * A discrete meter: N icons with a value filled, the Zelda heart row or star rating to
 * `Bar`'s continuous fill. Fractions clip mid-icon through a mask, so halves (or any
 * fraction) work identically for flat shapes and game-supplied textures, with no extra
 * half-state art to author.
 *
 * Flat icons are theme-drawn pips; game art arrives as a `filledTexture`/`emptyTexture`
 * pair, which must come together - one without the other throws, since a half-drawn
 * meter would only guess. Colour follows the theme the way `Bar` does unless the game
 * passes its own, and a passed colour survives later theme changes.
 *
 * @example
 * ```ts
 * import { Meter } from '@datamoc/mw_games/two-d/ui';
 *
 * const hearts = new Meter({ count: 5, value: 3 });
 *
 * hearts.setValue(2.5); // down to two and a half hearts
 * console.log(hearts.value); // 2.5
 * ```
 */
export class Meter extends Container {
	private emptyLayer = new Container();
	private filledLayer = new Container();
	private maskShape = new Graphics();

	private count_: number;
	private size_: number;
	private gap_: number;
	private value_: number;
	private explicitColor: boolean;
	private fillColor: number;
	private emptyColor_?: number;
	private readonly filledTexture?: Texture2D;
	private readonly emptyTexture?: Texture2D;

	private readonly themeListener = () => this.draw();

	constructor(options: MeterOptions) {
		super();

		if ((options.filledTexture === undefined) !== (options.emptyTexture === undefined)) {
			throw new Error('a Meter takes filledTexture and emptyTexture together, or neither');
		}
		this.count_ = normalizeCount(options.count);
		this.size_ = options.size ?? 16;
		this.gap_ = options.gap ?? 4;
		this.value_ = clampValue(options.value ?? this.count_, this.count_);
		this.explicitColor = options.color !== undefined;
		this.fillColor = options.color ?? theme().color.textHighlight;
		this.emptyColor_ = options.emptyColor;
		this.filledTexture = options.filledTexture;
		this.emptyTexture = options.emptyTexture;

		this.addChild(this.emptyLayer);
		this.addChild(this.filledLayer);
		this.addChild(this.maskShape);
		this.filledLayer.mask = this.maskShape;
		this.draw();

		themeChanged.add(this.themeListener);
	}

	/** filled icons, fractions included */
	get value(): number {
		return this.value_;
	}

	/** total icons */
	get count(): number {
		return this.count_;
	}

	/** the resolved filled colour: the explicit one, or the theme's highlight */
	get color(): number {
		return this.fillColor;
	}

	setValue(value: number, count: number = this.count_): void {
		this.count_ = normalizeCount(count);
		this.value_ = clampValue(value, this.count_);
		this.draw();
	}

	/**
	 * Recolours the fill at runtime, counting as explicit exactly as passing `color` does,
	 * so a later theme change cannot throw the game's own colour away.
	 */
	setColor(color: number): void {
		this.explicitColor = true;
		this.fillColor = color;
		this.draw();
	}

	resize(size: number, gap: number = this.gap_): void {
		this.size_ = size;
		this.gap_ = gap;
		this.draw();
	}

	private get totalWidth(): number {
		return this.count_ * this.size_ + (this.count_ - 1) * this.gap_;
	}

	private iconX(index: number): number {
		const x = index * (this.size_ + this.gap_);
		return theme().direction === 'rtl' ? this.totalWidth - x - this.size_ : x;
	}

	private draw(): void {
		const t = theme();
		if (!this.explicitColor) this.fillColor = t.color.textHighlight;
		const empty = this.emptyColor_ ?? t.color.panelFill;

		this.emptyLayer.removeChildren();
		this.filledLayer.removeChildren();
		for (let i = 0; i < this.count_; i++) {
			const x = this.iconX(i);
			this.emptyLayer.addChild(this.icon(x, empty, this.emptyTexture, false));
			this.filledLayer.addChild(this.icon(x, this.fillColor, this.filledTexture, true));
		}

		const filledWidth = this.totalWidth * (this.count_ > 0 ? this.value_ / this.count_ : 0);
		const maskX = t.direction === 'rtl' ? this.totalWidth - filledWidth : 0;
		this.maskShape.clear().rect(maskX, 0, filledWidth, this.size_).fill({ color: 0xffffff });
	}

	private icon(x: number, color: number, texture: Texture2D | undefined, tint: boolean): Container {
		if (texture) {
			const sprite = new Sprite(texture);
			sprite.x = x;
			sprite.width = this.size_;
			sprite.height = this.size_;
			if (tint && this.explicitColor) sprite.tint = color;
			return sprite;
		}
		const shape = new Graphics();
		const radius = this.size_ / 2;
		shape.circle(x + radius, radius, radius).fill({ color });
		return shape;
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}

function clampValue(value: number, count: number): number {
	if (!Number.isFinite(value)) return count;
	return Math.max(0, Math.min(count, value));
}

function normalizeCount(count: number): number {
	if (!Number.isFinite(count)) return 1;
	return Math.max(1, Math.floor(count));
}

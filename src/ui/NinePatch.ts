import { Container, NineSliceSprite, Texture } from 'pixi.js';

export interface NinePatchOptions {
	/** how many pixels of the texture are the fixed border, per side */
	border: number | { left: number; top: number; right: number; bottom: number };
}

/**
 * A panel that can be resized without distorting its frame.
 *
 * The texture is cut into nine: four corners that never stretch, four edges that stretch
 * along one axis, and a middle that fills. It is what makes one small window texture serve
 * every window in the game, at any size.
 *
 * Pixi has this built in; the wrapper exists so that a `border` can be given as one number,
 * which is the case for almost every panel, and so that resizing reads the same as it does
 * on the framework's other widgets.
 */
export class NinePatch extends Container {
	private sprite: NineSliceSprite;

	constructor(texture: Texture, options: NinePatchOptions) {
		super();

		const b = typeof options.border === 'number'
			? { left: options.border, top: options.border, right: options.border, bottom: options.border }
			: options.border;

		this.sprite = new NineSliceSprite({
			texture,
			leftWidth: b.left,
			topHeight: b.top,
			rightWidth: b.right,
			bottomHeight: b.bottom,
		});

		this.addChild(this.sprite);
	}

	/** the border widths, which a window needs to know to inset its contents */
	get border(): { left: number; top: number; right: number; bottom: number } {
		return {
			left: this.sprite.leftWidth,
			top: this.sprite.topHeight,
			right: this.sprite.rightWidth,
			bottom: this.sprite.bottomHeight,
		};
	}

	resize(width: number, height: number): void {
		//below twice the border the corners would overlap and the frame would fold in on
		//itself, so the panel refuses to go smaller rather than rendering nonsense
		const b = this.border;
		this.sprite.width = Math.max(width, b.left + b.right);
		this.sprite.height = Math.max(height, b.top + b.bottom);
	}

	//width, height and tint are not redeclared: Container already derives its size from the
	//slice sprite, which is its only child, and its tint reaches the sprite the same way
}

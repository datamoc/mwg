import type { Container, Texture, Rectangle } from 'pixi.js';

/**
 * The scene-graph container type a 2D game names in its own code - `Scene2D.stage` and any
 * other public container field are typed this way rather than as `pixi.js`'s own `Container`,
 * so naming the type does not require importing the renderer directly. It is the same object
 * at runtime; only the public name a game writes down changes.
 */
export type Container2D = Container;

/** The texture type a 2D game names in its own code, for the same reason as `Container2D`. */
export type Texture2D = Texture;

/** A plain, renderer-free rectangle: the shape `TextureRegion.frame` and similar public
 * fields use in place of `pixi.js`'s `Rectangle`. */
export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A texture together with the frame it was cut from - what `SpriteSheet.region` returns. */
export interface TextureRegion {
	texture: Texture2D;
	frame: Rect;
}

/** Converts a `pixi.js` `Rectangle` to the plain `Rect` shape public APIs use. Internal to
 * `two-d`; a game never constructs a `pixi.js` `Rectangle` to call this. */
export function rectOf(rectangle: Rectangle): Rect {
	return { x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height };
}

import { Container, Graphics, Text, TilingSprite, FillGradient } from 'pixi.js';

/**
 * A plain grouping container under an MWG-owned name, for the common "just group some
 * children" need `Scene2D.stage` itself covers for the whole scene - a sub-layer inside it
 * (a HUD strip, a creature layer, a popup stack) still needs its own constructible class,
 * and `Container2D` (`Types2D.ts`) is a type alias, not something a game can `new`.
 *
 * A bare re-export under this name, deliberately: Pixi's own `Container` already does
 * everything this needs, so the point is not to add behaviour but to give a game a name it
 * can import without naming `pixi.js` itself.
 *
 * @example
 * ```ts
 * import { Node2D, Shape2D } from '@datamoc/mw_games/two-d/render';
 *
 * const hud = new Node2D();
 * hud.addChild(new Shape2D().rect(0, 0, 100, 20).fill(0x202020));
 * hud.x = 12;
 * hud.y = 12;
 * ```
 */
export class Node2D extends Container {}

/**
 * Vector drawing - rectangles, circles, polygons, lines - under an MWG-owned name.
 *
 * Pixi's own `Graphics` API (`.rect(...).fill(...)`, `.circle(...).stroke(...)`, `moveTo`/
 * `lineTo`) is already the right shape for this; wrapping it class-for-method would only
 * duplicate an API this project does not own and would drift from every Pixi upgrade. The
 * bare re-export is what lets a game draw shapes without importing `pixi.js` itself.
 *
 * @example
 * ```ts
 * import { Shape2D } from '@datamoc/mw_games/two-d/render';
 *
 * const marker = new Shape2D().circle(0, 0, 6).fill(0xff4040).stroke({ color: 0x000000, width: 1 });
 * marker.x = 100;
 * marker.y = 60;
 * ```
 */
export class Shape2D extends Graphics {}

/**
 * Text under an MWG-owned name, for the case `ui.Label`/`ui.BitmapLabel` do not cover - a
 * one-off caption inside a `Shape2D`-drawn diagram, say, rather than themed game-wide UI
 * text. Prefer `Label`/`BitmapLabel` for anything styled through `ui.theme()`.
 *
 * @example
 * ```ts
 * import { Text2D } from '@datamoc/mw_games/two-d/render';
 *
 * const caption = new Text2D({ text: 'N', style: { fill: 0xffffff, fontSize: 14 } });
 * caption.x = 40;
 * caption.y = 4;
 * ```
 */
export class Text2D extends Text {}

/**
 * A texture that repeats/scrolls to fill a shape, rather than stretching - a parallax
 * background, a scrolling water or lava tile. `TilingSprite`'s own `tilePosition`/`tileScale`
 * already covers the "scrolling tile layer" need in full; this is a name, not new behaviour.
 *
 * @example
 * ```ts
 * import { TiledSprite } from '@datamoc/mw_games/two-d/render';
 * import type { Texture2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const waterTexture: Texture2D;
 *
 * const water = new TiledSprite({ texture: waterTexture, width: 320, height: 96 });
 * water.tilePosition.x -= 12; // scroll it a little each frame, from update(dt)
 * ```
 */
export class TiledSprite extends TilingSprite {}

/** A gradient fill/stroke, passed to `Shape2D.fill`/`.stroke` the same way a plain colour is.
 *
 * @example
 * ```ts
 * import { Shape2D, Gradient } from '@datamoc/mw_games/two-d/render';
 *
 * const sky = new Gradient({
 * 	type: 'linear',
 * 	start: { x: 0, y: 0 },
 * 	end: { x: 0, y: 1 },
 * 	colorStops: [
 * 		{ offset: 0, color: 0x1a1a3a },
 * 		{ offset: 1, color: 0x3a2a4a },
 * 	],
 * });
 *
 * const backdrop = new Shape2D().rect(0, 0, 320, 180).fill(sky);
 * ```
 */
export const Gradient = FillGradient;

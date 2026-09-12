import { Container, Graphics, Text, TilingSprite, FillGradient, Sprite } from 'pixi.js';

/**
 * A plain grouping container under an MWG-owned name, for the common "just group some
 * children" need `Scene2D.stage` itself covers for the whole scene - a sub-layer inside it
 * (a HUD strip, a creature layer, a popup stack) still needs its own constructible class.
 * `Container2D` (`Types2D.ts`) is itself a value re-export of the same underlying class, so
 * `new Container2D()` also works; `Node2D` exists as the name this module and its own doc
 * comments actually use, so a game reads one name rather than two for the same thing.
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
 * Creates one labeled `Node2D` per name, attached to `parent` in the order given, and returns
 * them keyed by name. A game with a dozen conventionally-ordered layers (terrain, units, effects,
 * UI, ...) otherwise hand-wires each one and adds them in the right order everywhere; this is that
 * boilerplate once. The names and their order stay the caller's own convention - nothing here
 * decides what a layer is called or which should draw on top.
 *
 * @example
 * ```ts
 * import { Node2D, createLayers, Sprite2D } from '@datamoc/mw_games/two-d/render';
 *
 * const stage = new Node2D();
 * const layers = createLayers(stage, ['terrain', 'units', 'effects', 'ui']);
 * layers.units.addChild(new Sprite2D());
 * console.log(layers.effects.label); // 'effects'
 * ```
 */
export function createLayers(parent: Container, names: readonly string[]): Record<string, Node2D> {
	const layers: Record<string, Node2D> = {};
	for (const name of names) {
		const layer = new Node2D();
		layer.label = name;
		parent.addChild(layer);
		layers[name] = layer;
	}
	return layers;
}

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
 * A plain, untinted sprite under an MWG-owned name - the neutral case `TintedSprite` is not:
 * that class exists to add the per-sprite multiply-and-add colour transform, so it is the
 * wrong reach for a sprite that needs no colour effect at all. Until this existed, that one
 * ordinary case had no `two-d`-owned way to construct it, and a game reached for
 * `two-d/pixi-interop.ts`'s `Sprite` (or `pixi.js` directly) even for the single most common
 * sprite there is.
 *
 * @example
 * ```ts
 * import { Sprite2D } from '@datamoc/mw_games/two-d/render';
 * import type { Texture2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const heroTexture: Texture2D;
 *
 * const hero = new Sprite2D(heroTexture);
 * hero.x = 40;
 * hero.y = 60;
 * ```
 */
export class Sprite2D extends Sprite {}

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

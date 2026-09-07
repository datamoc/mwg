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
 */
export class Node2D extends Container {}

/**
 * Vector drawing - rectangles, circles, polygons, lines - under an MWG-owned name.
 *
 * Pixi's own `Graphics` API (`.rect(...).fill(...)`, `.circle(...).stroke(...)`, `moveTo`/
 * `lineTo`) is already the right shape for this; wrapping it class-for-method would only
 * duplicate an API this project does not own and would drift from every Pixi upgrade. The
 * bare re-export is what lets a game draw shapes without importing `pixi.js` itself.
 */
export class Shape2D extends Graphics {}

/**
 * Text under an MWG-owned name, for the case `ui.Label`/`ui.BitmapLabel` do not cover - a
 * one-off caption inside a `Shape2D`-drawn diagram, say, rather than themed game-wide UI
 * text. Prefer `Label`/`BitmapLabel` for anything styled through `ui.theme()`.
 */
export class Text2D extends Text {}

/**
 * A texture that repeats/scrolls to fill a shape, rather than stretching - a parallax
 * background, a scrolling water or lava tile. `TilingSprite`'s own `tilePosition`/`tileScale`
 * already covers the "scrolling tile layer" need in full; this is a name, not new behaviour.
 */
export class TiledSprite extends TilingSprite {}

/** A gradient fill/stroke, passed to `Shape2D.fill`/`.stroke` the same way a plain colour is. */
export const Gradient = FillGradient;

/**
 * Explicit, exceptional backend access.
 *
 * A normal 2D game should never need this: `two-d`'s own facade (`Container2D`, `Texture2D`,
 * `Sprite2D`/`Shape2D`/`Text2D`/`TiledSprite`/`Gradient`, `AnimatedSprite`/`TintedSprite`,
 * `NinePatch`, `SpriteSheet`) covers ordinary needs without naming a `pixi.js` type. This
 * module exists for the rare case where a game needs a Pixi-specific effect the facade does
 * not cover yet - importing from here rather than from `pixi.js` directly keeps that
 * dependency visible and confined to one file, instead of spreading `pixi.js` imports through
 * the game's own source. `FillGradient`/`TilingSprite` join the original four here for the
 * same reason `render.Gradient`/`TiledSprite` name them at the facade level (item 293).
 *
 * On the pipe-registration question item 293 also raised (and item 297 named the two symbols
 * that still had no facade name): `TilingSprite` and `NineSliceSprite` (`ui.NinePatch`'s own
 * backing class) both need their renderer pipe registered before use, the same way
 * `TintedSprite`'s colour-transform pipe does. This project's own build never has to call
 * `registerBuiltinPipes` itself, because it imports the full `pixi.js` package everywhere
 * (never a slimmed custom bundle) and that package registers every built-in pipe,
 * `TilingSpritePipe`/`NineSliceSpritePipe` included, as a side effect of the import itself -
 * but that guarantee is `pixi.js`'s own `package.json` `sideEffects` list surviving whatever
 * bundler and tree-shaking configuration the *consumer* uses, not a universal one, and the
 * port whose build tree-shook a pipe away is exactly the case this function is for.
 *
 * Facade-gap accounting (P31): every primitive below already has a facade family, so no new
 * facade coverage was needed - what stays interop-only is the Pixi-typed seam each note
 * names, and a consumer budget justifies a use by pointing at the note instead of merely
 * counting the import.
 *
 * @example
 * ```ts
 * import { registerBuiltinPipes, TilingSprite } from '@datamoc/mw_games/two-d/pixi-interop';
 *
 * // only needed if a game's own bundler configuration tree-shook TilingSpritePipe/
 * // NineSliceSpritePipe away; call before the renderer is created
 * registerBuiltinPipes();
 * const backdrop = new TilingSprite({ texture: undefined as never, width: 100, height: 100 });
 * ```
 */

/** Interop-only: the unadorned scene-graph node behind facade `Container2D`/`Node2D`. The facade subclasses it rather than wrapping it, so a value that never needed the subclass - or a Pixi API typed against the base - still names this. */
export { Container } from 'pixi.js';
/** Interop-only: the textured quad behind facade `Sprite2D`/`TintedSprite`/`AnimatedSprite`. Same subclass relationship: reach for this for Pixi sprite behaviour the facade subclasses do not model, not for an ordinary positioned image. */
export { Sprite } from 'pixi.js';
/** Interop-only: the GPU image behind facade `Texture2D`/`TextureRegion`. `TextureRegion` still carries one in its `texture` slot, and Pixi constructors (sprites, tilings, nine-slices, render textures) take one - that slot is the seam. */
export { Texture } from 'pixi.js';
/** Interop-only: the vector canvas behind facade `Shape2D`. `Shape2D` extends this with the game's fill/stroke vocabulary; a `Graphics` program outside that vocabulary stays here. */
export { Graphics } from 'pixi.js';
/** Interop-only: the Pixi rect behind facade `Rect`. Atlas frames, bounds and hit areas arrive as one; `render.rectOf` converts it to a plain `Rect` at the boundary, and code that hands a rect straight back to Pixi keeps this. */
export { Rectangle } from 'pixi.js';
/** Interop-only: the text node behind facade `Text2D`. Same subclass relationship as `Sprite`: ordinary labels are `Text2D`; Pixi text behaviour the facade does not model stays here. */
export { Text } from 'pixi.js';
/** Interop-only: the gradient behind facade `Gradient` (which is this, aliased). `Shape2D.fill`/`.stroke` accept it directly, so most gradient work never imports it; direct construction of a gradient object does. */
export { FillGradient } from 'pixi.js';
/** Interop-only: the repeating texture behind facade `TiledSprite`. `TiledSprite` extends this; tiling behaviour outside the facade's repeat/offset surface stays here (and needs `registerBuiltinPipes` in a tree-shaken build, below). */
export { TilingSprite } from 'pixi.js';
/** Interop-only: renderer pipes, not scene content. Only needed when a consumer bundler tree-shook them away; see `registerBuiltinPipes`. */
export { TilingSpritePipe, NineSliceSpritePipe } from 'pixi.js';
/** The Pixi sprite construction options, for the rare hand-built interop sprite above. */
export type { SpriteOptions } from 'pixi.js';

import { extensions, TilingSpritePipe, NineSliceSpritePipe } from 'pixi.js';

let registered = false;

/**
 * Registers `TilingSpritePipe`/`NineSliceSpritePipe` with Pixi, for a build whose bundler
 * tree-shook them away despite importing the full `pixi.js` package - see this module's own
 * doc comment for why that can happen even without a deliberately slimmed bundle. Idempotent;
 * a normal build never needs to call it.
 */
export function registerBuiltinPipes(): void {
	if (registered) return;
	registered = true;

	extensions.add(TilingSpritePipe);
	extensions.add(NineSliceSpritePipe);
}

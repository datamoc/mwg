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
export {
	Container,
	Sprite,
	Texture,
	Graphics,
	Rectangle,
	Text,
	FillGradient,
	TilingSprite,
	TilingSpritePipe,
	NineSliceSpritePipe,
} from 'pixi.js';
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

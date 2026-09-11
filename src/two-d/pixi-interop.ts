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
 * On the pipe-registration question item 293 also raised: `TilingSprite` and `NineSliceSprite`
 * (`ui.NinePatch`'s own backing class) both need their renderer pipe registered before use,
 * the same way `TintedSprite`'s colour-transform pipe does. Nothing here has to register one by
 * hand - this project imports the full `pixi.js` package everywhere (never a slimmed custom
 * bundle), and that package registers every built-in pipe, `TilingSpritePipe`/
 * `NineSliceSpritePipe` included, as a side effect of the import itself. The footgun item 293
 * named is real for a build using a trimmed Pixi bundle (the port's own `SPD_ARCHITECTURE`
 * notes flagged it in that context); it does not apply to `mwg`'s own source, which is why
 * there is no registration call to make here.
 */
export { Container, Sprite, Texture, Graphics, Rectangle, Text, FillGradient, TilingSprite } from 'pixi.js';
export type { SpriteOptions } from 'pixi.js';

# MWG: Best Practices

Practical guidance for someone starting a real project with `mwg` today: how to work with the
grain of the framework instead of against it. Pair this with
[MWG: Deep Code and Architecture Review](MWG%20-%20Deep%20Code%20and%20Architecture%20Review.md)
for the *why* behind each of these; this document is the *how*.

## Start from a working example, not a blank page

The shipped examples (colour-transform, interface, dialogue/stage, roguelike dungeon) are
real, buildable, `file://`-verified projects, not snippets. Copy the one closest to your game
and grow it, rather than assembling a project from the API reference alone. Decide early which
of the two install paths in the getting-started guide you actually need (a bundler-based
project with npm, or a plain `<script>` tag with no build step at all) and verify your own
project reaches a working `file://` page under that path before you build much on top of it.

## Reach for the typed facade first, the escape hatch second

Ordinary sprites, shapes, text, and containers go through `Sprite2D`/`Shape2D`/`Text2D`/
`TiledSprite`/`Gradient`. None of that requires your own code to name `pixi.js` anywhere. Only
reach for `two-d/pixi-interop` when you need a specific Pixi capability the facade doesn't
cover, and keep that usage confined to as few files as you can, the same way `mwg` itself
confines all Pixi-internal knowledge to one file. Two concrete benefits, not just tidiness:
your project stays portable if you ever need the Babylon path instead, and `pixi.js` is an
optional peer dependency, so code that never touches the escape hatch never has to install it.

## Keep game logic renderer-free where you can

Model state and rules in plain data and `core`/`simulation`-level terms (stable entity ids via
`EntityRegistry`, not live object references) rather than reaching into a sprite or a scene
from inside game logic. Code written this way can be tested with Node's own test runner with
no renderer, no browser, and no ticker in the loop at all, the same separation that lets `mwg`
run the identical scene-lifecycle and save-system code under either a Pixi or a Babylon game.

## Load once per scene, then stay synchronous

Call `load(paths)` up front for a scene and treat everything after that as synchronous code.
Scattering `await` through per-frame or per-action logic is a sign an asset load has drifted
into the wrong place; move it back to scene setup, using the `optional`/`onMissing` path if a
particular asset is allowed to be missing.

## Trust your own data, validate everything else

Use `SaveSystem.load()` for a save this same process previously wrote. For anything that
crossed a device or a network boundary, a pasted save code, a cloud sync, a value a server
handed back, use `importSlot`/`importExternal` instead, and validate the *shape* of what comes
back, not just that it parsed as JSON. Apply the same split in your own persistence code even
outside `SaveSystem`: "this process wrote it a moment ago" and "this arrived from somewhere
else" are different trust levels, and worth two different code paths, not one path with an
optimistic cast.

## Test the way `mwg` tests itself

Plain `.ts` sources under Node's built-in test runner, no framework, is a deliberate choice
here: it keeps the dependency list short and the tests portable. A green test suite and a
clean typecheck are necessary, not sufficient, verify anything visual (layout, a window's
position, whether choice text is legible against its background) by building an example and
actually looking at it. If you can't check a UI change visually yourself, say so plainly rather
than calling it done on the strength of the typechecker alone.

## Verify from `file://`, not only from a dev server

The entire point of this framework is a game that opens by double-clicking a local file, no
server. A feature that only works against a bundler's dev server has not been verified against
the target it's actually meant to ship to. Build, then open the built page directly, before
calling a feature finished.

## Only pull in the renderer you actually use

`three-d` is kept off the root barrel specifically so a 2D project never pays for Babylon; a
Babylon project likewise never needs to pull in Pixi. Import `two-d` or `3d`, not both, unless
your game genuinely mixes both kinds of scenes.

## Keep your own vocabulary out of your own shared code

`mwg` holds no rule, value, or vocabulary belonging to any single reference game, only the
generic mechanic shape; your own game's specific numbers, names, and content stay in your own
game layer, supplied to `mwg`'s generic primitives as data. If your project grows multiple
internal systems, campaigns, or a modding surface, apply the same discipline one level up: keep
the genuinely generic mechanics generic, and keep any one system's specific content as data
that mechanic consumes, rather than baking it into the mechanic itself.

## Don't build for the reuse you don't have yet

Favour plain data and composition over an early abstraction layer, a manager class, an event
bus, a plugin system, before you have a second real call site that actually needs it. `mwg`'s
own modules lean this way on purpose (`StatBlock`'s fixed modifier order over a rule engine,
`EntityTemplate`'s plain content rows over a generic component system) and it's a good default
for your own game code too: an abstraction with exactly one caller costs a future reader a hop
and buys nothing until a second caller actually shows up.

## Verify an API claim before building on it

`mwg` is pre-alpha and still adding surface between releases. Check REFERENCE.md (or the
generated API docs) for the actual current name and signature of something before assuming it
matches a similar-sounding API from a different framework you've used before, especially for
anything not yet covered by the API-stability guarantee that starts at 1.0.

# Repository Guidelines

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```
npm run check          # tsc --noEmit, typechecks src/examples/tools/tests
npm test                # node --test "tests/**/*.test.ts"; runs a single file: node --test tests/random.test.ts
npm run build           # library build: tsc emit + the standalone mw_games.global.js IIFE
npm run audit           # npm dependency audit, fails for high or critical advisories
npm run benchmark:browser # builds the dungeon example and measures headless Chrome rendering/FPS
npm run cap:sync        # builds the mobile web output and synchronizes Capacitor platforms
npm run cap:add:android # creates the Android platform after building the mobile web output
npm run cap:open:android # opens the generated Android project in Android Studio
npm run assets          # generates examples/assets (tileset + sounds), run once before any example

npm run example                # colour-transform example, vite dev server
npm run example:build          # colour-transform, built to examples/colour-transform/dist, open index.html directly
npm run example:ui             # interface example (windows, lists, message box)
npm run example:ui:build
npm run example:dialogue       # dialogue/stage example
npm run example:dialogue:build
npm run example:dungeon        # roguelike dungeon crawl example
npm run example:dungeon:build

npm run extract:rgssad -- <archive.rgssad> <outDir>   # decrypts an RPG Maker XP/VX
                                                        # archive to plain files. General
                                                        # archive-format tool (vendored
                                                        # rgssad-wasm decoder), not tied to
                                                        # any specific reference game.
```

There is no lint script. `npm run check`, `npm test`, then build and open an example is the
verification loop (see "Verifying" below): layout and rendering bugs don't show up in the
typechecker.

Each `example:*:build` script runs vite build then `tools/emit-page.mjs`, which rewrites the
`<script type="module">` entry tag to a classic deferred script and inlines compiled assets,
required because the output must open via `file://` with no server.

## Architecture

`src/` is organized into modules, each with its own `index.ts` barrel re-exported from the
root `src/index.ts` (which is also what the standalone `mw_games.global.js` build exposes as
`window.mw_games`):

- **`core`** - `Game` (owns the Pixi `Application`, the frame loop, current `Scene`),
  `Scene`, `Signal` (typed event emitter), `Random`, `Input`. `Game` is a singleton reachable
  via `Game.current`; scenes are swapped with `switchScene`, which takes effect at the start
  of the next frame. `Game.step(dt)` drives one frame synchronously, needed because Chrome
  throttles `requestAnimationFrame` in a background tab, which can otherwise make an example
  look frozen for reasons unrelated to the code.
- **`render`** - `Camera`, `TileMap`, `SpriteSheet`, `AnimatedSprite`, `TintedSprite`, and
  `ColorTransformBatcher`. The batcher implements a per-sprite `texel × M + A` colour
  transform (multiply *and* add) in the batch shader, which Pixi's built-in multiply-only
  `tint` cannot do. **All Pixi batcher/high-shader internals are confined to
  `ColorTransformBatcher.ts`** - no other file may import them.
- **`assets`** - `load`/`texture`/`get`/`resolve`. In dev, paths are served normally; in a
  compiled build, `resolve` looks paths up in the global `window.__MWG_ASSETS__` map that
  `tools/compile-resources.mjs`-generated scripts populate. Game code calls `load(paths)`
  once per scene and everything after that is synchronous, asset code never awaits mid-scene.
- **`ui`** - `Window`, `WindowStack` (keyboard focus goes to the top window only),
  `ListView`, `MessageBox`, `Label`, `NinePatch`, `theme`.
- **`stage`** - `DialogueStage` and a small `script` command interpreter for backdrop +
  character conversation scenes (speaker lit, others dimmed, branching choices as data).
- **`roguelike`** - `FieldOfView`, `Pathfinder` (incl. `autoExplore`), `Scheduler`
  (energy-cost turn order), `generate` (dungeon generation), `Level`. Built on `rot-js` for
  the classic algorithms.
- **`i18n`** - message tables, `Intl.PluralRules`-backed plurals, `{token}` interpolation,
  and `direction()` (ltr/rtl), which `ui`'s `Theme.direction` reads from a game's glue code.
  Pure logic, no Pixi dependency.
- **`actors`** - `StatBlock` (base + derived stats through a fixed add→multiply→set modifier
  order), `EquipmentSlots` (ties an item's modifiers to a `StatBlock` on equip/unequip),
  `Progression`/`powerCurve`, `Inventory` (stacking, weight, containers), `skillCheck`.
- **`world`** - `World` (many maps, each created once and kept alive), `Overworld`
  (location lookup), `TurnClock` (hunger/poison-style timed effects, distinct from
  `Scheduler`), `rollEncounter`.
- **`rpg`** - `loadTiledMap` (orthogonal, single-tileset, uncompressed CSV layers only,
  each unsupported case throws by name), `GameState` (switches/variables),
  `MapEvent`/`activePage` (last matching page wins), `EventRunner` (a `StageScript`-shaped
  interpreter for map events instead of dialogue), `GridMover` (tweened tile movement +
  walk cycle).
- **`battle`** - `Creature` (wraps `actors.StatBlock`/`Progression`, not a separate stat
  system), `TypeMatrix`, `Party`, `battleOrder` (one round's priority-then-speed sort,
  distinct from `Scheduler`'s continuous time), `checkEvolution`.
- **`audio`** - `Sound` (pooled, round-robin), `Music` (crossfade via `update(dt)`). Both
  take an injectable `create()` in place of `new Audio()`, since nothing outside a browser
  can construct one, tests always supply a fake.
- **`core`** also has `SaveSystem` - named, versioned save slots over `localStorage` (with
  an in-memory fallback), scoped to plain JSON-serialisable state rather than arbitrary
  object graphs; a game's own classes flatten themselves the way `rpg.GameState` does.
  `Session` reuses the same storage abstraction for one counter: how many times this game
  has launched, for a native wrapper to decide whether to ask for a rating; `mwg` counts,
  never prompts.
- **`core` never imports from any other module.** `Game` takes a `GameOptions.extensions`
  array of Pixi-extension registration functions instead of calling `render`'s
  `registerColorTransform` itself, so a game that only imports `mwg/core` never pulls in
  `mwg/render`. A game using `TintedSprite` (directly, or via `TileMap`/`DialogueStage`/
  `AnimatedSprite`, all built on it) passes `{ extensions: [registerColorTransform] }`.

### The `file://` constraint

Every architectural choice below exists because the shipped output must run by
double-clicking a local HTML file, with no server:

- `fetch()`/XHR and `<script type="module">` are both blocked from `file://`, and Chrome
  treats a same-folder `<img>` as cross-origin for WebGL. So `tools/compile-resources.mjs`
  turns every asset into a `data:` URI inside a plain `<script>` (grouped by top-level
  folder, written to a global `window.__MWG_ASSETS__`), and the library build
  (`vite.lib.config.ts`) emits a classic IIFE, not ES modules.
- `tools/emit-page.mjs` is the last step for every example build: it rewrites vite's
  `<script type="module" crossorigin>` entry tag to `<script defer>` and inlines the
  compiled asset scripts before it, in document order.
- Relative imports in `.ts` source carry an explicit `.ts` extension (rewritten to `.js` on
  emit via `rewriteRelativeImportExtensions` in `tsconfig.json`); Node's ESM resolver and
  `node --test` both need it, since there's no bundler in the test path.

### Testing

`tests/**/*.test.ts` run directly under `node --test`, no framework, importing `.ts` sources
via the extension-rewriting above. Keep new tests dependency-free in the same way.

## Verifying

`npm run check`, `npm test`, then build an example and actually look at it: a window placed
off-screen or choices drawn over text is invisible to a typechecker and obvious in a
screenshot.

---

# Working notes for this repository

Not committed, excluded through `.git/info/exclude`, which is itself local to the clone.

## Use whatever plugins and tools are actually relevant

If a skill, plugin, or MCP tool available in the session applies to the task at hand, use
it rather than reimplementing its job by hand: a code-review skill instead of an ad hoc
manual read-through, a browser-automation tool instead of describing what a screenshot
would probably show, a search or docs tool instead of guessing at an API from memory. This
is about not ignoring a capability that is already sitting there for the task in front of
you, not about reaching for one where none fits; plenty of this project's own work is
plain file edits and shell commands with no tool or plugin relevant to it at all, and nothing
here asks for one anyway.

## Simplify once per session, at least

**Before finishing a session, re-read what was written and try to make it smaller.** Not as
a courtesy pass at the end of a long day: as a scheduled step, with the expectation that it
finds something.

The failure mode this exists to prevent is a bowl of noodles: a codebase where every
feature works and nothing can be changed, because each piece reaches into three others and
no one can hold the whole shape in their head any more. That state is not reached by one
bad decision. It is reached by twenty reasonable ones that were never revisited.

What to look for, roughly in order of how much damage it does:

- **Two things that are one thing.** Near-duplicate functions, parallel branches doing the
  same work with different names, a helper used once that belongs inline.
- **Abstraction with one caller.** A layer added "for later" that later never arrived. It
  costs a reader a hop and buys nothing until the second caller exists.
- **State that could be derived.** A field kept in sync by hand is a bug waiting for the
  one path that forgets to update it.
- **Comments explaining code that could explain itself.** If a comment says *what*, the
  code should have said it. Keep comments for *why*.
- **Options nobody passes.** Every parameter is a promise to keep it working.

Deleting is a valid outcome, and usually the best one. So is saying "I looked and found
nothing worth changing", but say it, so the pass is visible rather than assumed.

## What this project is

`mwg`: a 2D tile-game framework, MPL-2.0, meant to be redistributed. A growing set of
reference games define the capability spec; see `README.md`, which is the source of truth
for scope.

## Roadmap process

Any idea is good to add to the roadmap, at low priority, at the end of the numbered list,
rather than argued into or out of existence on the spot. The cost of writing one more line
in `README.md`'s roadmap is tiny; the cost of either rejecting a genuinely good idea or
derailing the current work to chase it immediately is not.

Once per session, actually reevaluate the roadmap's priorities, not just append to it.
Re-read the numbered list end to end and ask whether the order still reflects what matters:
an idea added low-priority two sessions ago may deserve to move up now that its
prerequisites shipped; something that looked essential may turn out to be speculative.
Reorder when the reasoning changes, and say so in the commit, the same way "Simplify once
per session" below expects a visible pass rather than an assumed one.

Performance is one of the standing priorities this reevaluation should weigh, not a
feature to schedule and forget: keep rendering on a GPU-accelerated path (WebGL/WebGPU via
PixiJS is the existing choice, a fallback to canvas 2D anywhere in the render path is a
regression, not a convenience), and treat a roadmap item that turns out to cost real frame
time as worth resolving sooner rather than later, regardless of where it sits numerically.

The target that shapes everything: **a game you open by double-clicking a local file.** No
server. That is why resources are compiled at build time and why the bundle is a classic
IIFE. Never regress it for convenience.

## Rendering backend policy

Use the best rendering solution for each graphics workload, based on measured results rather
than one renderer claimed to fit everything. Weigh this against a small decision matrix
spanning 2D sprites and tile maps, UI/text, post-processing and custom shaders, particles,
instanced terrain, voxel scenes, imported animated models, and large 3D worlds: quality,
frame time, memory, bundle cost, input latency, accessibility, browser/backend availability,
and the `file://` deployment constraint above all else. Keep PixiJS for its proven 2D path
and Babylon.js for optional 3D unless benchmarks demonstrate a clear improvement; use native
browser APIs only when they materially outperform those layers. Any chosen solution must
remain optional where appropriate, expose framework-level abstractions rather than
application-specific renderer internals, and earn an automated visual/performance
regression test before it replaces an existing path.

This is a continuing policy to keep re-evaluating, not a license to add overlapping
rendering engines without a concrete workload and evidence behind the change. Originally
ROADMAP.md item 134; moved here because it is a standing decision rule to weigh on every
relevant session, not a feature with a finish line that belongs in a numbered build-order
list.

## Conventions that are already load-bearing

- **Node and npm are developer tools.** Nothing from them reaches the player. Do not
  describe them as something a player installs.
- **Tests use Node's built-in runner over `.ts` directly.** No test framework. Keep it that
  way; the dependency list is a feature.
- **Relative imports carry `.ts`,** rewritten to `.js` on emit. Node's resolver needs it.
- **Pixi internals are confined to `src/render/ColorTransformBatcher.ts`.** That file is the
  only one allowed to know about batchers and high-shader bits. If a second file needs
  them, something has gone wrong.
- **Assets are generated, never downloaded.** `tools/make-example-assets.mjs`. Borrowed art
  brings borrowed licence terms, and this project has to stay redistributable.
- **No code or media from the reference games; their file formats are fair game.** They are
  design studies. SPD in particular is GPL-3 and dual-copyright; see the project memory.
  Reading a reference game's own source to find a roadmap item is fine, and is how several
  items already got there (see ROADMAP.md's notes on items 46-56, 66-73 and others reading
  a reference's own coverage docs or source rather than assuming). What's never allowed,
  regardless of how an item was found, is copying or adapting that game's own code, or
  bringing in its media: assets, text, data tables, stat numbers, maps, anything that is the
  game's own content rather than a mechanic's shape ("units heal near a healer" is fine;
  that game's own heal-per-turn number or the code computing it is not). A loader or writer
  for a reference's own file *format* is a different question and is not covered by that
  rule: a format is a container, learned the ordinary way any undocumented format is (by
  reading real files in it), engineering work distinct from including the media the
  container holds - see ROADMAP.md item 100 and README's licence-and-provenance section for
  where this line actually sits.
- **No em dash (`—`) in prose:** README, ROADMAP, CHANGELOG, this file, doc comments,
  commit messages, anything written for a reader. Use a comma, a colon, parentheses, or
  a period and a new sentence instead; a plain hyphen `-` is fine for a spaced aside
  (`item 30 - the reference pick`), which is this project's existing house style anyway.
  A hyphenated compound (`data-shaped`, `well-known`) is unaffected; this is about the
  punctuation mark, not the character.

## Verifying

`npm run check`, `npm test`, then build an example and look at it. The bugs that matter
here (a window placed off-screen, choices drawn over the text) are invisible to a
typechecker and obvious in a screenshot.

Chrome throttles `requestAnimationFrame` in a background tab, so an example can appear
frozen for reasons that have nothing to do with the code. `Game.step(dt)` drives a frame by
hand when that happens.

## Testing the getting-started page as a new user would

`webpage/getting-started/index.html` is instructions read outside this repo, by someone
with none of its context: a stale path, a missing step, or a build artifact that pulls in
things it shouldn't (found once already: `tools/docs/node_modules` leaking into the
published npm tarball via too broad a `files` glob in `package.json`, only caught by
actually running `npm publish --dry-run`) will not show up in `npm run check` or `npm test`,
because nothing in this repo exercises that page's instructions from a clean start.

When the tutorial changes, actually follow it, from scratch, in an empty directory outside
this repo, once for each of the two paths it documents:

- **With npm**: `npm install @datamoc/mw_games vite` and the bundler-based steps. Also try
  the `.tgz` variant it mentions as a fallback (`npm pack` in this repo, then
  `npm install ./datamoc-mw_games-<version>.tgz` by path), closer to what a real install
  sees than linking straight to `dist/`, and should reach the exact same
  `node_modules/@datamoc/mw_games/` either way.
- **Without npm**: just `mw_games.global.js` (built here, or downloaded from a release) and
  a `<script>` tag, no install step at all.

Confirm both actually reach a working `file://` page at the end, not only that the dev-time
steps run. A page that only works from a dev server is not what step 10 of the tutorial
claims to deliver.

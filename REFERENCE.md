# mwg reference

A one-line-per-export index of `@datamoc/mw_games`'s public API - what exists and where,
not how to use it. The published Documentation page is this file rendered as HTML; the
full generated API (every parameter, every doc comment) lives beside it at
`webpage/documentation/api/` (both from `npm run webpage:docs`). For *why* the framework
is shaped this way and what it's for, see `README.md`'s capability spec. For architecture
and build commands, see `DEVELOPMENT.md`. For the order things shipped in and the reasoning
behind it, see `ROADMAP.md`.

Every module is its own barrel: `import { X } from '@datamoc/mw_games/core'` (or the
matching subpath for any module below), or `import { X } from '@datamoc/mw_games'` for the
root re-export.

**Two rendering worlds, and a core that belongs to neither.** `mwg/two-d` is everything drawn
through PixiJS (`Game`, `Scene2D`, and the `render`, `ui` and `stage` modules beneath it);
`mwg/3d` is everything drawn through Babylon. `mwg/core` holds what both need and neither
renders: the scene lifecycle, `SceneStack`, input, saves, RNG, signals, achievements.

**Which entry points reach a renderer**, checked by a test that walks the real import graph
(`tests/renderer-isolation.test.ts`) rather than by good intentions:

| renderer-free | Pixi | Babylon |
| --- | --- | --- |
| `core`, `i18n`, `actors`, `world`, `battle`, `simulation`, `roguelike`, `board`, `audio`, `rpg`, `assets/paths` | `two-d` (and `two-d/render`, `two-d/ui`, `two-d/stage`), `assets` | `3d` |

`roguelike` adds only `rot-js`, and `pixi.js`, `@babylonjs/core`/`@babylonjs/loaders` and
`@capacitor/core` are optional peer dependencies rather than installed ones, so a project names
only the renderer it actually draws with. A Babylon game importing `core` + `3d` pulls in no Pixi
at all, and a 2D game importing `core` + `two-d` pulls in no Babylon. `rpg` is renderer-free too:
its event interpreter takes an injected `DialoguePresenter` rather than building a widget, so
a 3D game can run map events, dialogue and quests without a 2D renderer anywhere in reach.

## Conventions

Three rules the whole API follows, so a name means one thing everywhere:

- **`advance(turns)` moves a clock forward in whole turns or rounds; `update(dt)` moves one
  forward in real seconds.** `TurnClock`, `Charges`, `Field`, `Barrier` and `AbilityCycle`
  take turns; everything in `render`, `ui`, `audio` and `world.EnvironmentClock` takes `dt`.
  Anything that is not time passing gets its own verb rather than borrowing one of these
  (`QuestLog.advanceStage`, `BossPhases.check`).
- **`toJSON()` / `static fromJSON(defs, data)` is how a class saves and reloads.** Definitions
  a game owns (item tables, quest definitions, growth curves, terrain kinds) are supplied
  fresh as `defs` rather than written into the save, so rebalancing reaches old saves.
  Namespace-level state uses `exportX`/`importX` free functions instead (`Input` bindings);
  `Random.Generator` keeps `getState`/`setState`, which resumes a live stream in place rather
  than producing a payload.
- **"Nothing to pick" is always `null`**, never `-1` or `undefined`: `Random.weighted`,
  `Random.element`, `Random.weightedKey`, `rollEncounter`, `rollLoot`, `rollAffix`,
  `pickBuilder`.

## Contents

[core](#core) · [two-d](#two-d) · [render](#render) · [ui](#ui) · [stage](#stage) ·
[assets](#assets) · [audio](#audio) · [battle](#battle) · [board](#board) ·
[actors](#actors) · [roguelike](#roguelike) · [rpg](#rpg) · [simulation](#simulation) ·
[three-d](#three-d-optional) · [world](#world) · [i18n](#i18n) · [mwl](#mwl) · [ai](#ai)

## `core`

The scene lifecycle, signals, RNG, input, and every save/telemetry/replay primitive - the one
module every game imports, whichever renderer it uses, and the only one that depends on no
other `mwg` module and no renderer at all.

- `Scene` - one screen of the game, as lifecycle only: `create`, `update(dt)`, `resize`, the
  `onSuspend`/`onResume` pair a pushed scene needs, and a `destroy` that fires once. It owns
  no display node; `two-d.Scene2D` adds the Pixi container, and a Babylon game supplies its own.
- `SceneStack` - `push`/`pop`/`replace`: suspends the current scene, layers another over or
  instead of it, and resumes with a result once it pops (minigames, pause menus). Generic over
  the scene type and typed against the lifecycle above, so it drives a 3D game just as well.
- `SceneComponentHost`/`SceneComponent` - composes a scene out of named sections (map logic,
  encounter logic, UI wiring), each its own module implementing whichever `Scene` lifecycle
  hooks it needs, instead of one scene class accreting every responsibility. A scene owns one
  host and forwards `update`/`resize`/`onSuspend`/`onResume`/`destroy` to it - composition, not
  a base class, so it works the same whether the scene extends `Scene` or `two-d.Scene2D`.
- `Registry` - a named lookup registered once and read back by name: `register`/`get`/`has`/
  `list`, throwing on a duplicate or missing name by that name. The dispatch primitive
  underneath a catalog of factories or handlers (`SceneComponentHost` uses one internally) -
  a game still imports and registers each entry itself, no auto-discovery.
- `Logger` - categories, four severity levels, a filter, and a sink tests can capture,
  instead of bare `console.log`/`console.error`.
Three shapes cover what "an event" means here, kept deliberately distinct rather than folded
into one bus: a **GameEvent** is a rule's ordered *output* - what happened, described after the
fact - realised as the generic `Event` type parameter `simulation`'s `SimulationRule`/
`SimulationRuntimeRule` already return, never something a handler reacts to mid-calculation. A
**Hook** (`HookRegistry`, below) is a point of *modification* a rule consults while it runs -
`modifyDamage`, "can this creature act this turn" - synchronous, and read back by the same rule
that asked. A **Signal** is a plain *notification* with no bearing on any rule - `sceneChanged`,
`saveCompleted`. Reaching for a global bus that several `AttackRequested`/`DamageCalculated`/
`HpChanged`-style events all dispatch onto, each triggering the next, is the shape to avoid: it
turns a rule's synchronous, readable logic into a chain no single function owns.

- `Signal` - a typed event emitter: one event, one payload, LIFO listeners, and a listener
  can consume it.
- `HookRegistry`/`Hook` - many events keyed by name, dispatched in registration order, with a
  `source` tag so everything one ability or worn item registered comes off in a single
  `offSource` call. `battle.BattleHooks` and `roguelike.CombatHooks` are both this with their
  argument types fixed; they were two copies of one class until they were merged.
- `PresentationQueue` - plays a batch of simulation events one at a time, at whatever pace
  `play(event)` (a tween, a sound, a floating number) says to wait before the next - the
  presentation-side counterpart to a `SimulationRuntime.dispatch()`/`runScenario()` result, kept
  out of the logical commit that already happened. The same queued/timed shape as `two-d.ui.
  Toast`, generalised to any event type and needing no renderer.
- `parseCSV`/`CsvOptions`/`CsvColumnType` - a header-row CSV into an array of typed row
  objects, so a content designer edits a spreadsheet instead of a `.ts` object literal for a
  table shaped like `actors.AffixTable`. `columns` names which fields coerce to
  `'number'`/`'boolean'`/`'list'` (semicolon-separated)/`'map'` (semicolon-separated
  `key=value` pairs); an empty cell omits that field entirely, the same as an optional
  property never set. Takes a raw string with no opinion on how it was loaded, the same
  boundary `i18n.parseFTL` already draws.
- `Random` (namespace) - seeded RNG: `int`, `float`, `weighted`, `element`, `shuffle` and the
  rest; every "pick one" returns `null` when there is nothing to pick.
- `Generator` - the seeded RNG class `Random` wraps directly, for a game that wants its own instance.
- `Input` (namespace) - named-action input: `bind`/`isDown`/`justPressed`/`justReleased`
  over keyboard, `bindButton`/`bindAxis`/`pollGamepads` over a gamepad,
  `bindTouch`/`pressTouch`/`releaseTouch`/`attachSwipe` over touch, `actionsForKey` for
  rebind-conflict detection, `rumble` for gamepad haptics.
- `PlayerInput` - a per-player scoped `Input`, for local multiplayer/split-screen.
- `SaveSystem` - named, versioned save slots over `localStorage` (in-memory fallback under
  `file://`); a `migrations` chain, and `importExternal` as a plug-in point for a foreign
  save format's own `normalize` function.
- `StateRegistry`/`StateExtension`/`StateRestoreDiagnostic` - named game-owned state extensions with deep-cloned
  snapshots and transaction rollback, with independent versions, ordered migrations and
  explicit handling of extensions absent from a restored save, so custom save data has one
  atomic boundary.
- `ActionJournal` - serializable ordered action and outcome batches with checkpoints,
  incremental reads, truncation and validated restore for replay, undo and synchronization.
- `scramble`/`unscramble` - light save-data obfuscation, not encryption.
- `SaveSyncClient` - pushes/pulls save data to a server the game supplies.
- `LockstepClient` - deterministic multiplayer over an injectable WebSocket, tick-driven.
- `RunHistory` - a local record of completed runs (score, cause of death, whatever a game's
  own `summary` holds), distinct from `SaveSystem`'s continuable slots.
- `PlayerStats` - a lifetime running total folded in one run's summary at a time, distinct
  from `RunHistory`'s per-run records.
- `TelemetryClient` - sends usage/error events to a server the game supplies.
- `NewsClient`/`NewsSeenTracker` - a game's own patch-notes/announcement feed, with a
  seen-tracker so a player is only notified of what's actually new.
- `checkSize`/`checkNoControlCharacters`/`sanitizeInboundText`/`validateSchema` - security
  sanitization of inbound data: an imported save, a network payload, player-typed text.
- `Collection` - named, queryable record collections over `localStorage`
  (`all`/`get`/`put`/`remove`/`where`/`clear`) - a quest log or bestiary, not a save blob.
- `Recorder`/`Player`/`serializeReplay`/`deserializeReplay` - records `Input.onAction`
  against `Game`'s own frame counter and replays it deterministically, for testing.
- `Achievements` - counters crossing a target unlock a named milestone; `drainNew()`
  queues unlocks for a UI to announce.
- `Session` - counts launches over the same storage `SaveSystem` uses, for a native
  wrapper's own rating-prompt timing; never prompts itself.
- `FeedbackClient`/`HttpTransportOptions` - an injectable HTTPS JSON transport for
  player-submitted feedback; the game owns the endpoint, consent flow, and server-side storage.
- `Spawner` - a `dt`-driven, timed, escalating wave spawner (a horde mode, a survival
  minigame), distinct from `roguelike.Scheduler`'s turn-order primitive.
- `hexNeighbors`/`hexDistance`/`hexLine`/`hexRange`/`hexToPixel`/`pixelToHex` - flat-top,
  odd-q hex grid geometry.
- `weightedFlood`/`WeightedCell`/`WeightedFloodOptions` - renderer- and rules-neutral Dijkstra
  flood over any cell topology, with injected costs, blockers, budget and stopping rules.
- `Blob` - a spreading volume field over a grid: a per-cell number that `spread` diffuses a
  share of into its open 4-neighbours and decays the rest (`decay: 1` conserves and only
  moves volume around). `seed` adds to a cell, `clear` zeroes one cell and leaves its
  neighbours alone, and `cellsAbove` lists what a game applies its effect on; what a volume
  means (fire, gas, ooze, water) stays the game's own reading.
- `reducedMotion`/`setReducedMotion`/`prefersReducedMotion`/`watchReducedMotion` - the one
  answer to "should this animate": the OS `prefers-reduced-motion` preference, overridable per
  game, with a change subscription for something long-lived that has to stop mid-flight.
  `motionDuration(duration, intent)` is the policy built on it, and `MotionIntent` is the
  caller's declaration: a `decorative` motion (the default) collapses, a `meaningful` one is
  shortened rather than deleted, because a change that motion conveys stays readable. `Tweener`,
  `Camera` (shake and follow), `ScreenEffects`, `ParticleEmitter` and `FloatingText` consult it.
  `AnimatedSprite` deliberately does not: a frame cycle is usually game state.
- `Tweener`/`Easing`/`TweenOptions` - a generic `tween(duration, apply, ease?)` plus a small
  linear/quad/cubic easing-curve set. The third argument also takes `{ ease, intent, alternate }`:
  `alternate` is the non-vestibular variant to run instead under reduced motion (a fade where a
  slide was), and it is ignored while the preference is off.
- `UndoHistory` - gameplay-level undo/redo over pushed, reference-held states.
- `LoadQueue` - a reusable loading-screen lifecycle: named tasks, aggregate progress,
  cancellation.
- `EntityRegistry`/`EntityId` - assigns and looks up stable string ids for live objects, so
  events, saves, AI targets and buffs can name a creature or item without holding it; not an
  ECS, and distinct from `Collection`'s persisted, queryable records. `idOf` is what a game
  passes as `roguelike.Scheduler.toJSON`'s or `simulation.SimulationRuntime`'s `actorId`.
- `ReactionTable`/`ReactionRule` - declarative `when`/`action` rules checked against any
  state shape (a `StatBlock`'s values, a plain object's own fields), firing edge-triggered
  so a still-true condition never re-fires; `once` retires a rule after its first firing. The
  generic alternative to a branch cascade of `if HP < n` checks in game code, and works the
  same for a character or an inanimate object such as an item's durability.

## `two-d`

Everything drawn through PixiJS, and the counterpart to `three-d`. The barrel re-exports
`render`, `ui` and `stage` below, so `mwg/two-d` is a one-stop 2D import; the granular
subpaths (`mwg/two-d/render`, `mwg/two-d/ui`, `mwg/two-d/stage`) are what a game watching its
bundle should reach for.

- `Game` - owns the Pixi `Application`, the frame loop, and the current scene; reachable as
  the singleton `Game.current`. `step(dt)` drives one frame by hand, which defeats Chrome's
  background-tab throttling of `requestAnimationFrame`.
- `Scene2D` - `core.Scene`'s lifecycle plus the `stage` container everything this screen draws
  hangs off, destroyed with the scene. This is what a 2D game extends.

### `two-d/render`

Pixi-backed 2D rendering: sprites, tile maps, camera, animation. All Pixi
batcher/high-shader internals are confined to `ColorTransformBatcher.ts`.

- `ColorTransformBatcher`/`packColorAdd`/`packTintAdd`/`NO_COLOR_ADD` - a per-sprite
  `texel × M + A` colour transform (multiply *and* add) in the batch shader.
- `TintedSprite`/`registerColorTransform` - a sprite drawn through the colour-transform
  batcher; register the extension once via `GameOptions.extensions`.
- `parseImagePath`/`imageModifier`/`colorShiftMatrix`/`applyImageModifiers`/`croppedTexture` - parses common
  image suffix modifiers such as `~FL`, `~GS`, `~SCALE` and `~CROP`, then applies the supported
  Pixi presentation changes without mutating shared source textures.
- `AnimatedSprite`/`Animation` - frame-sequence sprite animation. A frame may carry its own
  duration (Wesnoth's `image=a.png:120,b.png:80`), and an animation may start partway into itself
  or after a delay (`startTime`, which is what `start_time=-450` on an attack means: begin four and
  a half frames in, so the hit lines up with the damage frame). A frame may also carry an offset,
  reported through `AnimatedSprite.frameOffset` for the caller to add where it positions the sprite,
  because that position is the caller's (`GridMover`, a walk tween) and a sprite that overwrote it
  every frame would undo it every frame.
- `SpriteSheet` - a grid-sliced sprite sheet.
- `Camera`/`createCamera`/`snapZoom` - world-to-screen camera; `snapZoom` keeps tile edges
  pixel-aligned at a fractional zoom.
- `Viewport`/`splitScreenHalves` - a camera scoped to one screen region, for split-screen.
- `createColorBlindnessFilter`/`COLOR_BLINDNESS_MATRICES` - accessibility colour filters.
- `Minimap`/`newlyRevealed`/`minimapCellCenter`/`MinimapMarker` - bakes an explored-cell set
  into a persistent `RenderTexture`, never redrawing an already-baked cell, and supports
  several game-owned unit or quest markers.
- `TileMap`/`EMPTY`/`tileFrame`/`tileFrameSheet`/`tileFrameIndex` - tile map rendering:
  square/hex/isometric/staggered projections, multi-sheet tiles, elevation columns.
- `LayeredSprite` - layered character sprites (body/hair/equipment as separate layers).
- `Projectile` - tweens a sprite in a straight line for a thrown/shot visual flourish.
- `Halo`/`HALO_ANIMATION` - the glow around a unit, an aura, a shrine's light: an `AnimatedSprite`
  drawn additively (Wesnoth's `[halo] blend_mode=add`) whose `follow(x, y)` applies the halo's own
  offset once instead of in every game that draws one. Z-order stays the caller's, because a halo
  that belongs behind its unit is added before it and one that belongs in front is added after, and
  a framework that guessed would be wrong half the time.
- `ParticleEmitter`/`Particle` - a pooled, seeded particle emitter (sparks, dust, rain):
  `burst`/`start`/`stop` over a pool allocated once at `max`. Runs the whole simulation with
  no `texture` given, which is how it is tested without a renderer.
- `ScreenEffects` - a full-screen colour wash: `fadeOut`/`fadeIn`/`flash`/`setTint`, driven by
  `update(dt)` returning true on the frame an effect completes.
- `ActorAnimator` - an idle/move/action animation state machine with one interruption rule.
- `StatusVisuals` - tint/overlay presentation for status effects.
- `loadTiledMap`/`TiledMapData`/`TiledTilesetData`/`TilesetSheet`/`LoadedTiledMap` - loads
  Tiled JSON maps into a `TileMap`: orthogonal, isometric and staggered orientations, multiple
  tilesets (embedded or external `.tsx`). Lives here rather than in `rpg` because what it
  builds is a `TileMap` out of `SpriteSheet`s.
- `blobIndex`/`autotileFrames`/`BLOB_SHAPES` - auto-tiling: the 47-shape "blob tile"
  reduction of 8-neighbour terrain matches.
- `inspectGraphicsCapabilities`/`detectWebGpu`/`RENDERING_DECISIONS` - checks
  WebGL/WebGPU/WGSL support and records this project's own rendering-backend decisions.
- `Container2D`/`Texture2D`/`Rectangle2D`/`Rect`/`TextureRegion`/`rectOf` - the renderer
  boundary names for common 2D values. The first three work in both type and value positions,
  so a game can construct a container or use texture and rectangle constants without naming
  `pixi.js`. For the rare need the facade does not cover, `two-d/pixi-interop` re-exports the
  underlying Pixi classes explicitly.
- `Node2D`/`Shape2D`/`Text2D`/`Sprite2D`/`TiledSprite`/`Gradient` - bare, MWG-named
  re-exports of Pixi's `Container`/`Graphics`/`Text`/`Sprite`/`TilingSprite`/`FillGradient`:
  a plain grouping layer, vector drawing, one-off text, a plain untinted sprite, a
  repeating/scrolling texture, and a gradient fill/stroke, none of which needed new
  behaviour, only a name a game can import without naming `pixi.js` itself. Prefer
  `ui.Label`/`BitmapLabel` over `Text2D` for anything styled through `ui.theme()`, and
  `render.TintedSprite` over `Sprite2D` the moment a colour transform is needed.

### `two-d/ui`

Windows, lists, message boxes, HUD widgets - all themed from one live-swappable `Theme`.

- `theme`/`setTheme`/`defaultTheme`/`highContrastTheme`/`themeChanged` - the active theme;
  `setTheme` fires `themeChanged` so already-built widgets restyle in place.
- `Label` - a themed text wrapper over Pixi `Text`; `stroke`/`resolution`/`roundPixels`
  options, useful for text over artwork.
- `parseMarkup`/`stripMarkup`/`markupToHtml`/`escapeHtml` over `MarkupSpan`/`MarkupOptions` - inline
  markup (`<b>`, `<i>`, `<span color='…' size='…'>`, `<br/>`, `<img>path</img>`, `$name`, and the
  five entities) as a renderer-neutral contract: a `MarkupSpan` is a `MarkdownSpan` plus the colour,
  size and image a renderer may use, kept as written because resolving them is the renderer's
  business. Unknown tags, malformed tags and unset variables stay literal rather than disappearing,
  and `markupToHtml` is the escaped HTML fragment for a renderer that speaks HTML text.
- `RichLabel`/`parseMarkdown`/`stripMarkdown`/`sliceSpans` - basic inline markdown (`**bold**`,
  `*italic*`, combined `***both***`, backslash escapes) through Pixi `HTMLText`, which is
  what makes mixed styles inside one string possible at all. `parseMarkdown` is pure
  span-splitting (unmatched markers stay literal); `stripMarkdown` recovers plain text;
  `sliceSpans` takes the first N visible characters with styles kept, for progressive
  reveal without leaking half-shown markers. Costs more than a `Label`, so this is for
  descriptions and help bodies, not per-frame numbers.
- `startReveal`/`advanceReveal`/`completeReveal`/`revealComplete` - the shared
  progressive-display primitive: one character count behind `MessageBox` pages (which
  already revealed this way), `Label` lines, and `RichLabel` markdown. `Label` and
  `RichLabel` expose it as `showProgressive`/`updateReveal`/`completeReveal`, driven by
  the game's own frame loop; `MessageBox` keeps its confirm-completes-then-advances rule
  on top unchanged.
- `BitmapLabel`/`bitmapLabelStyle` - bitmap-font-backed text, for a HUD value redrawn
  every frame where `Label`'s per-string texture re-render would be wasteful.
- `NinePatch` - a resizable nine-slice panel.
- `Window` - a themed panel container.
- `WindowStack` - keyboard focus goes to the top window only; dims what's underneath.
- `ListView` - a scrollable, keyboard- and pointer-navigable row list (click, wheel-scroll).
- `IconGrid` - a multi-column icon-grid inventory view; tap-then-tap "drag and drop",
  frame-driven long-press for a quickslot.
- `MessageBox` - dialogue text box: paged reveal, choices, ADV/NVL display modes,
  `autoAdvance`, and timed `{sound:path}` markers delivered through `onSound`.
- `messageBoxPresenter` - wires `rpg.EventRunner`'s dialogue to a `MessageBox` on a
  `WindowStack`, in one argument: `present: messageBoxPresenter(this.windows)`.
- `VerticalLabel`/`layoutVertical` - vertical writing layout, with CJK glyph rotation.
- `RebindScreen` - a keybind-rebinding flow over `Input`, with an optional conflict hook.
- `Button`/`ButtonSkin`/`ButtonState` - idle/hover/pressed/disabled clickable region, icon
  and/or text, optional per-button nine-patch skin with per-state tints.
- `Bar` - a filled-proportion track (health/mana/XP); flat colour or texture, optional
  `roundUpToPixel` so a nonzero value never rounds down to invisible.
- `FloatingText`/`floatingTextAlpha`/`floatingTextRise`/`floatingTextAgeAtLeast` - a rising, fading
  damage/pickup number and its pure motion, opacity and age curves; `FloatingTextStack` with
  `floatingTextStackLift`/`floatingTextStackMoves`/`floatingTextStackLifePenalty` and
  `FLOATING_TEXT_STACK_GAP` stacks simultaneous pop-ups at one world point without overlap, lifting
  the lines already there the way Java's `FloatingText.push()` does.
- `Toast` - a queued, timed pop-up notification (fade in, hold, fade out).
- `Tooltip` - a hover explanation over a themed `Window`: a frame-driven hover delay, and
  edge-aware placement that flips rather than letting the panel run off screen.
- `HelpScreen` - a topic-list-plus-body help/controls screen.
- `StatsScreen` - a player-stats display screen.
- `LoadingScreen` - a progress-bar loading screen wired to `core.LoadQueue`.
- `ScreenReader`/`screenReader` - the screen-reader bridge: `Window` announces its title and
  `MessageBox` each page and its choices through a visually hidden `aria-live` region, and a
  game's own widgets use the same `screenReader.announce(text, { assertive })`. No-ops where
  there is no DOM, so ordinary scene code needs no guard around it.
- `contrastRatio`/`meetsContrast`/`relativeLuminance`/`ContrastLevel` - WCAG contrast for a
  `theme` palette: the standard luminance and ratio formulas with AA/AAA thresholds, so a
  game checks its own colours rather than guessing.

### `two-d/stage`

Dialogue scenes: backdrop, characters, a script runner - the visual-novel half.

- `DialogueStage`/`CharacterDefinition`/`ShowOptions` - backdrop plus character
  conversation scenes; the speaking character lit, others dimmed.
- `StageScript`/`StageCommand`/`StageChoice`/`StoryScript` - a command interpreter;
  `runStory` follows a named-passage graph (`{goto}`, choice jumps); `history`/`showLast`
  for read-only dialogue rollback; `skipSeen` for auto-advancing already-read lines;
  `ScriptOptions.mode: 'nvl'` for the accumulating-block presentation.
- `importTwee`/`TwineStory` - imports Twee-notation Twine stories into `StageScript`'s
  command format.

## `assets`

The `file://` story: a compiled build resolves paths through a `data:` URI map; dev mode
serves them normally. Load once per scene; everything after is synchronous.

Split by renderer specificity: `assets/paths.ts` resolves paths and needs no renderer,
`assets/binary.ts` caches raw bytes just as renderer-free, `assets/loader.ts` fetches and
decodes *textures* through Pixi. The `assets` barrel exposes all three; a game rendering
through something else imports `@datamoc/mw_games/assets/paths` or
`@datamoc/mw_games/assets/binary` and pays nothing for Pixi, which is how `3d` and `audio`
reach the compiled asset map without it.

- `setBase`/`isCompiled`/`paths`/`has`/`resolve` - dev-vs-compiled path resolution, renderer-free
  (also its own entry point, `@datamoc/mw_games/assets/paths`).
- `load`/`texture`/`get`/`isLoaded`/`release` - load assets by path, read them back
  synchronously, and free GPU memory once a zone is no longer needed. `load(paths,
  { resolution })` rasterizes a vector source (SVG) at a multiple of its intrinsic size, so a
  game that zooms into an icon asks for a `2` or `3` instead of shipping a soft bitmap;
  `onProgress` is the same `LoadQueue` seam whether passed alone or in the options.
- `loadBinary`/`getBinary`/`isBinaryLoaded`/`releaseBinary` - the renderer-free counterpart
  to `load`/`texture`/.../`release`, caching raw `ArrayBuffer`s instead of Pixi textures
  (also its own entry point, `@datamoc/mw_games/assets/binary`); `3d/models`' `Vox.parseVox`
  is the direct consumer, taking bytes this now fetches and caches instead of a game doing
  it by hand.
- `AssetStream`/`AssetBundle` - preloads likely-next bundles with LRU eviction under a
  byte budget, for progressive loading between scenes.
- `fetchWithByteProgress`/`ByteProgress`/`OnByteProgress` - real cumulative byte-progress
  reporting, for a server or desktop host (not `file://`, which blocks `fetch` entirely).

## `audio`

- `Sound` - a pooled, round-robin one-shot sound effect player.
- `onCaption`/`CaptionEvent` - accessibility captions fired alongside a sound cue.
- `Music` - crossfading background music.
- `createAudio`/`Playable` - an injectable audio backend (tests supply a fake in place of `new Audio()`).
- `Orchestrator`/`OrchestratorState` - maps a named game state ("combat", "boss") to a
  `Music` track and crossfade, and fires one-shot cues by event name; re-entering the same
  state never restarts its track.
- `synthesizeTone`/`playTone`/`Waveform` - a runtime square/triangle/sine/noise waveform
  synth for a procedural tone or SFX, no sample library.
- `parseMidi`/`scheduleMidi`/`noteToFrequency`/`MidiPlayer` - a small `.mid` file player
  built on `synthesizeTone` rather than a licensed instrument library.

## `battle`

The Pokémon-shaped half of the capability spec: species/stats/party/type-matrix/turn-order.
No move, formula, or number belongs here - only the shape.

- `Creature`/`Species` - wraps `actors.StatBlock`/`Progression`, not a separate stat system.
- `TypeMatrix` - attack-type effectiveness lookup.
- `Party` - a roster of creatures.
- `battleOrder`/`Move`/`BattleAction` - one round's priority-then-speed turn order.
- `checkEvolution`/`EvolutionRule` - level/condition-based species evolution.
- `StatStages` - a bounded, symmetric stage ladder over a stat (±`max`), replacing rather
  than stacking the modifier for a stat's current stage.
- `chooseMove`/`chooseSwitch` - battle AI built on `TypeMatrix`.
- `BattleHooks`/`BattleHook` - `core.HookRegistry` with battle's argument shape: a handler
  receives the creature plus a shared mutable `context`, for passive effects, abilities and
  turn-skipping statuses.
- `Field`/`FieldCondition` - field-wide conditions: weather, terrain, screens; named,
  optionally timed, ticked down by `advance(rounds)`.

## `board`

Board/card/dice games and generic tactics - traditional public-domain rules, no formula
borrowed from any licensed game.

- **chess** (`chess.ts`): `startingChess`/`parseFen`/`cloneChess`/`legalMoves`/`applyMove`/
  `inCheck`/`gameResult`/`sq`/`squareName` - full rules: legality, check/mate/stalemate,
  castling, en passant, promotion, FEN.
- **engine** (`Engine.ts`): `chessGame`/`chooseMove`/`search` - the chess rules adapter and
  convenience wrapper over the shared `ai.alphaBetaSearch`, with material evaluation and
  depth/node limits. The chess example calls the shared AI primitive directly.
- **classics** (`Classics.ts`): `BoardGrid`; checkers
  (`startingCheckers`/`checkersMoves`/`applyCheckersMove`, forced multi-jump captures); go
  (`startingGo`/`playGo`/`passGo`/`goResult`/`goScore`, ko and area scoring); backgammon
  (`startingBackgammon`/`rollBackgammonDice`/`backgammonMoves`/`applyBackgammonMove`, bar
  and bearing off); cards (`createDeck`/`shuffleDeck`/`deal`/`trickWinner`); solitaire
  (`dealSolitaire`/`drawSolitaire`/`moveSolitaireTableau`/`moveSolitaireToFoundation`/
  `solitaireWon`, seeded Klondike); dice (`rollDice`/`rollExpression`/`DiceCup`/`scoreDice`,
  Yahtzee-shaped keep-and-reroll scoring).
- **tactics** (`Tactics.ts`): `startingTactics`/`addTacticalUnit`/`canPlaceTacticalUnit`/
  `tacticalMoves`/`moveTacticalUnit`/`setTacticalOverwatch`/`triggerTacticalOverwatch`/
  `tacticalAttack`/`endTacticalTurn` - squad tactics: action points, cover, overwatch, and
  zone of control baked into `tacticalMoves`/move cost.
- `FactionFog`/`VisionCell` - fog of war as a per-faction union of every controlled unit's
  own vision, with explored memory retained. `share` puts factions on one map, sight and memory
  alike, which is Wesnoth's `share_vision`; nothing shares until asked. `sees` hands a side's sight
  out as a predicate for anything that asks what it can see.
- **army** (`Army.ts`): `startingArmy`/`recruit`/`recall`/`bankUnit`/`armyIncome`/
  `applyUpkeep` - recruiting/recalling units against a currency total, per-turn income and
  upkeep, no specific rate baked in.
- **hex skirmish** (`HexSkirmish.ts`): `startingSkirmish`/`setSkirmishTerrain`/
  `canPlaceSkirmishUnit`/`addSkirmishUnit`/`skirmishMoves`/`moveSkirmishUnit`/
  `skirmishAttack`/`skirmishIncome`/`endSkirmishTurn` - a Wesnoth-style hex army-game rules
  layer distinct from `tactics` above: per-terrain movement cost and defence, adjacency-only
  attacks where a surviving defender always strikes back, capturable villages that grant
  income and heal whoever owns them, no zone of control.
- `BoardPiece` (type, from `Classics.ts`) - a generic owned/countable/capturable/promotable
  token distinct from `roguelike`'s `Creature`-shaped actors; every game above builds on it.

## `actors`

Stat blocks, equipment, inventory, and the numbers layer nearly every other module builds
on. This is the *shape* - a game names its own attributes and formulas.

- `StatBlock`/`Modifier`/`DerivedStat` - base attributes plus derived stats, combined
  through ordered modifiers (add → multiply → set). `toJSON` saves base values only:
  modifiers are reapplied on load by whatever owns them (equipment, status effects, auras),
  so saving them too would double every bonus.
- `composeModifiers` - the same canonical modifier composition as `StatBlock`, available to
  adapters that resolve declarative effect lists without creating a stat block.
- `Progression`/`powerCurve` - levelling from experience against a growth curve; `toJSON`
  saves level and experience, the curve being a definition.
- `skillCheck` - value-plus-modifiers against a difficulty, one dice roll.
- `SkillPoints` - a spendable ledger that raises a stat's base rank, with per-stat caps and
  a rising cost per rank. `toJSON` saves only unspent points; the ranks bought are already
  in the `StatBlock`'s own base values.
- `EquipmentSlots`/`EquippableItem`/`SavedEquipment` - equip/unequip applies or removes an
  item's modifiers immediately; an optional `locked` predicate refuses unequip/swap for
  cursed/quest gear. `toJSON(identify)` records slot-to-id, and `fromJSON` re-equips so every
  modifier lands back on the `StatBlock`; a locked item is restored still worn.
- `Inventory`/`InventoryItem`/`ItemDefinition`/`SavedInventory` - stacking (by id, and by
  `instanceId` when either item sets one), weight, capacity, containers holding their own
  `Inventory`. `toJSON` saves per-item instance state (level, wear, affix, identified,
  `instanceId`) while `fromJSON(defs, data)` takes kind-level fields from the game's item
  table, so a rebalanced weight reaches an old save.
- `craft`/`Recipe` - resolves a recipe against an `Inventory`: all-or-nothing, with a
  capacity-rollback path if the result doesn't fit.
- `applyStatusEffect`/`EffectClock`/`StatusEffectHandle` - a `StatBlock` modifier tied to a
  `TurnClock`'s automatic expiry; `cancel()` for early removal.
- `identify`/`enchant`/`damageItem`/`repairItem` - identification; enchant/upgrade level
  (`enchant`'s `affixPolicy: 'keep' | 'remove'` decides whether an upgrade strips an
  affix); durability wear and repair, opt-in per item.
- `applyItemStatusEffect` - a status effect sourced from an item rather than a spell.
- `Charges`/`ChargesOptions` - a resource regenerating in banked-turn chunks via
  `advance(turns)`; `refund()` restores charges directly (a kill or crit), outside that path.
  `toJSON` saves the count *and* the progress banked towards the next, so reloading cannot
  shorten a recharge.
- `rollLoot`/`LootEntry`/`LootTable` - rolls whether anything drops, then weight-picks
  which, the same "roll whether, then which" shape `world.rollEncounter` shares.
- `Advancement` - level-gated tiers granting ledger points, with mutually-exclusive
  branch/capstone choices.
- `rollAffix`/`affixOf`/`applyAffix`/`removeAffix`/`copyAffix`/`matchesContext` - named
  item affixes: weight-picked, applied/removed on `InventoryItem.affix`, copied between
  item instances, and matched against a fired trigger's attack `kind` via `AffixDef.kinds`.
- `scaledModifiers`/`LevelScale` - level-scaled gear: `{stat, op, base, perLevel}` resolved
  to a plain `Modifier`.
- `assignAppearances`/`Appearances` - per-run appearance shuffling for unidentified items,
  seeded and fixed for the run.
- `buy`/`sell`/`Price`/`ShopOptions` - a currency-`StatBlock` transaction against an
  `Inventory`, all-or-nothing with rollback.
- `canAfford`/`spend`/`refund`/`convertToCharges`/`ResourceCost` - a spendable `StatBlock`
  pool (mana, stamina): check, all-or-nothing spend, mirror-image refund (optionally
  fractional), or convert a spent amount into `Charges` at a rate.
- `Barrier`/`BarrierLayer` - a layered shield/absorption pool; the most recently added
  layer drains first, with optional independent per-layer decay ticked by `advance(turns)`.
- `assignTraits`/`TraitDef`/`AssignedTrait` - per-instance random traits drawn from a
  shared pool at creation, applied as permanent modifiers.
- `AuraField`/`AuraDef`/`AuraParticipant` - continuously reapplies a carrier's modifiers to
  whoever is currently adjacent, diffing rather than reapplying every tick.
- `SupportLedger` - a pair-order-independent, thresholded bond/support relationship between
  two units, growing through proximity or shared battles; `toJSON`/`fromJSON` round-trip it.
- `buildEntity`/`buildEntities`/`EntityTemplateRow`/`EntityTemplateCatalog`/`BuiltEntity` - one
  row of a hero or monster file (typically a `core.parseCSV` result) into a fully wired
  entity: a `StatBlock` of base stats (every non-reserved column), an optional `Progression`
  against a named growth curve, a starting item carrying a named starting affix, and a
  `ReactionTable` already holding a low-HP rule if the row names a threshold. What each named
  growth curve/affix/item actually is stays the game's own `EntityTemplateCatalog`.
- `toEntitySaveState`/`fromEntitySaveState`/`EntitySaveState` - a `BuiltEntity`'s mutable state
  (base stat values, level/experience, the carried item) in the same "definitions supplied
  fresh on load" shape `StatBlock`/`Progression` already draw. `fromEntitySaveState` rebuilds
  via `buildEntity` from the same row and catalog, then overlays the saved state on top.

## `roguelike`

FOV, pathfinding, the energy scheduler, level generation, and combat-adjacent primitives -
the dungeon-crawl half of the capability spec.

- `Level`/`WALL`/`FLOOR`/`rectCenter`/`rectsOverlap` - the tile grid: terrain kinds,
  passability/transparency, square or hex `shape`.
- `generateDungeon`/`findFreeCell`/`furthestRoom`/`DUNGEON_KINDS` - procedural dungeon
  generation.
- `generateDungeonGraph` - the same pipeline as `generateDungeon`, also returning the room
  graph (corridor edges, backbone then extra loops) and a rejected-placement retry count;
  `DungeonOptions.hooks` fires `onRoomPlaced`/`onCorridorCarved` as the pipeline runs, the
  seam a regional generator hangs hand-placed rooms, branches, wells, plants, statues,
  chasms, doors and traps from.
- `RoomBuilder`/`hallBuilder`/`eligibleBuilders`/`pickBuilder` - composable room interiors:
  the generator places and joins rooms, a builder carves each one, picked by weight among
  those whose size constraints fit. `DungeonOptions.builders` wires them in; a room no
  builder fits falls back to a plain hall rather than staying solid rock.
- `FeatureLayer` - a floor feature/event layer: named kinds with `inspect`/`interact`/
  `consequence`/`persistent` rules attached to generated cells; definitions supplied fresh
  on load, only cell-to-kind pairs are save data.
- `rollRoster` - a variant-spawn/content-roll API: weighted regular entries, rare additions,
  per-entry alternative swaps, and a shuffle, in that order; every roll (including an
  explicitly disabled rare entry's non-roll) is traced for parity tests.
- `candidateCells`/`cellsNear`/`selectDistinctCells` - deterministic content placement over a
  `Level`: `candidateCells` filters by terrain kind, occupancy and an optional region;
  `cellsNear` walks outward by radius for a cluster anchor; `selectDistinctCells` shuffles and
  slices a de-duplicated pool, bounded to however many candidates exist rather than throwing.
  Composes for neighbouring-item clusters, scattered decorations, and single room/branch
  rewards; nothing is placed until the caller commits, and the returned trace is plain
  JSON-safe data for `DungeonArtifacts.content` or a save file.
- `compareDungeonArtifacts`/`checkDeterminism` - a dungeon parity/test harness: diffs a
  seeded run's room graph, retries, terrain, features and content rolls against a reference
  or golden fixture, tagging every mismatch `'graph'` or `'paint'`; `checkDeterminism` repeats
  a generation call and confirms every run matches the first.
- `FieldOfView`/`HeightSight` - shadowcast (square) or straight-line (hex) visibility, with
  `Elevation`-aware asymmetric cliff sight.
- `Elevation` - whole-level height per cell, read by `FieldOfView`/`Pathfinder`.
- `Pathfinder`/`neighbourOffsets` - A*(square)/Dijkstra(hex or elevation-aware) pathing,
  `distanceMap`/`descend`/`autoExplore`, an optional climb limit.
- `Scheduler`/`Actor`/`SchedulerSnapshot` - energy-cost turn order, the sole authority on
  logical time; fractional costs, `postpone` (delaying an actor other than the current one),
  and `toJSON`/`restore` for a deterministic snapshot keyed by a caller-supplied actor id.
- `decideMonsterAI`/`AIState`/`AIDecision`/`Disposition` - wander/hunt/flee built on
  `FieldOfView`/`Pathfinder`/`Scheduler`; peaceful/neutral/hostile disposition, provoked
  override.
- `Secrets` - disguised terrain (secret doors, hidden traps) that passes every
  passable/transparent check as its disguise until revealed.
- `Doors` - open/closed/locked door state; locking is independent of open/closed.
- `chebyshevDistance`/`traceLine`/`ballistica`/`hasLineOfSight`/`canTarget`/`resolveArea` -
  targeting and collision paths: range/line-of-sight checks, configurable stopping cells,
  and single/line/burst/cone area resolution.
- `coneCells`/`chainTargets`/`knockbackPath` - a widening cone spray, a greedy nearest-hop
  chain, and a shove's path until the first impassable cell.
- `resolveAreaOnLevel`/`hexConeCells` - topology-aware area resolution and widening hex cones,
  complementing the square-grid targeting helpers.
- `rangeMultiplier`/`areaFalloffMultiplier`/`RangeBand` - a range-band damage multiplier
  lookup, and a per-target falloff multiplier for an area effect hitting several targets.
- `BossPhases`/`AbilityCycle` - an HP-fraction phase ladder whose `check(hpFraction)` reports
  newly entered phases, and a named-cooldown ability rotation (`ready`/`use`/`advance`).
- `CombatHooks`/`CombatEvent`/`DamageContext` - `core.HookRegistry` with combat's argument
  shape (one mutable `DamageContext`), plus `modifyDamage`'s pre-damage seam.
- `Stealth`/`StealthOptions` - sticky, one-way detection: `checkDetection` returns true
  only on the call that first brings an observer within radius.
- `TriggerTracker` - a streak counter (combo, kill-streak) that extends within a turn
  window and restarts once the window lapses.
- `MultiStageAbility`/`AbilityStage` - an ability that unfolds through named, turn-timed
  stages (windup/active/recovery) once started.
- `Minimap`/`minimapCellCenter` - exploration minimap rendering and overlay coordinates for
  square and odd-q hex maps.
- `MultiTurnBeam` - a deterministic one-cell-per-turn beam with opaque or dynamic blockers,
  live target lookup, game-owned damage application, cancellation and save/restore.

## `rpg`

Tiled map/event data, the map-event interpreter, switches/variables, and grid movement -
the classic top-down RPG half.

- `automap`/`AutomapRule`/`AutomapTarget`/`AUTOMAP_EMPTY` - Tiled-style automapping:
  `input`/`output` pattern rules applied in order, each rule's matches collected before any
  write. Takes any grid exposing `getTile`/`setTile` (a `TileMap` satisfies it structurally),
  so automapping needs no renderer.
- `GameState` - switches and variables.
- `activePage`/`conditionHolds`/`EventPage`/`MapEvent` - last-matching-page resolution for
  a map event, re-checked rather than cached.
- `EventRunner`/`EventCommand`/`DialoguePresenter`/`DialogueRequest`/`EventChoice` - a
  `StageScript`-shaped command interpreter for map events. Dialogue goes through an injected
  `present` function rather than a widget, so the interpreter is renderer-free and a game can
  drive it from a 3D scene, a DOM overlay, or a test asserting on script order.
  `two-d/ui.messageBoxPresenter` is the ready-made 2D implementation.
- `GridMover`/`Direction4` - tweened tile-to-tile movement plus a walk-cycle hook.
- `FreeMover` - continuous (non-grid) position and facing, for action-game movement.
- `MovableSprite` - what both movers actually require: `x`/`y`, and optionally `update`/`has`/
  `play`. A static sprite, a 3D mesh wrapper or a plain test record all satisfy it.
- `aabbOverlap`/`circleOverlap`/`circleAabbOverlap`/`resolveAabbAgainstTiles` - 2D
  collision: shape overlap tests, and an axis-separated sweep against solid tiles.
- `QuestLog`/`QuestStage`/`QuestDefinition`/`QuestMarker` - quest stages advanced one at a
  time by `advanceStage`, prerequisites, `markerFor` deriving `'offer'`/`'turnIn'`/`'none'`,
  and a tracked-quest pointer/location.
- `questsFromRows`/`QuestStageRow` - groups a flat table of stage rows (typically a
  `core.parseCSV` result, one row per stage sharing a `questId`) into `QuestDefinition`s a
  `QuestLog` can `define`.
- `decodeMarshal`/`encodeMarshal`/`RubySymbol` - Ruby `Marshal` 4.8 binary serialization
  (the container format RPG Maker's own `.rxdata` saves use).
- `hashDefaultOf`/`withHashDefault` - reads and attaches a Ruby hash's default value, which
  `Marshal` carries alongside the entries rather than as one of them.

## `simulation`

Headless, deterministic turn/scenario running - for testing and benchmarking without a
live game loop.

- `advanceToInput`/`ScheduledTurns`/`TurnRules`/`TurnResult` - drives turns forward under a
  rule set until the next input is due.
- `runScenario`/`Scenario`/`ScenarioResult` - a bounded, scripted simulation run against a
  set of expectations.
- `Campaign`/`CampaignLevel`/`CampaignLevelResult`/`CampaignSnapshot` - generic level order,
  result, carry-over, reminder and transition state, with JSON-safe save/restore.
- `runHeadlessScenario`/`HeadlessScenario`/`HeadlessScenarioResult` - seeded, renderer-free
  scenario execution returning the final state, ordered events and resumable random state.
- `SimulationRuntime`/`SimulationContext`/`SimulationOutcome`/`SimulationRuntimeRule`/
  `SimulationSnapshot` - a facade over one state + one `roguelike.Scheduler` + one `core.
  Generator`, for the interactive half of a turn-based simulation: `dispatch` runs a single
  command through the game's rule, threading `random`/`scheduler` as context and charging any
  returned cost; `snapshot`/`restore` capture and rebuild the whole triple. Composes with
  `advanceToInput` against the same scheduler for the automatic-actor loop, rather than
  replacing it.
- `Scheduler`/`Actor`/`SchedulerSnapshot` - re-exported here from `roguelike` (its real home),
  since every `SimulationRuntime` needs one; a simulation-first game need not import a second
  module just to construct the class its own runtime is built around.

## `three-d` (optional)

Babylon.js-backed 3D, kept fully separate from the 2D default - nothing in `core` imports
this module.

- `Engine3D` - owns Babylon's engine, scene, orbit camera, light, resize, and render loop.
- `gridPoint3D`/`GridCell3D`/`GridShape3D` - square/hex 3D grid cell projection.
- `createTileGrid3D` - a thin-instanced 3D tile floor (square or hex) with elevation
  columns for nonzero cell heights.
- `Character3D` - moves an imported mesh or a camera-facing billboard sprite through
  continuous world coordinates; `playAnimation` plays a clip an imported model carries.
- `parseVox`/`createVoxModel3D` - MagicaVoxel `.vox` import, batched by colour.
- `loadModel3D`/`loadModelContainer3D`/`isModelContainerLoaded`/`releaseModelContainer`
  (`@datamoc/mw_games/3d/models`, kept out of the main `3d` barrel so a scene that never
  imports a model pays nothing for the loader) - glTF/GLB import. `loadModel3D` imports
  straight into the scene, for one copy; `loadModelContainer3D` fetches and parses a source
  once, caches the `AssetContainer`, and a game calls `instantiateModelsToScene()` on it for
  each independent, unaliased copy it wants placed - Babylon's own answer to "load once,
  place many" without a second network fetch.
- `createHeightmapTerrain3D` - a continuous displaced-mesh terrain from a greyscale
  heightmap image, alongside `createTileGrid3D`'s stepped floors.
- `buildHeightIndex`/`cellAt`/`heightAt`/`resolveCapsuleAgainstGrid` - horizontal collision
  for a moving capsule against `createTileGrid3D`'s stepped grid.

## `world`

Many maps, transitions, persistence, the turn clock, encounter tables - the connective
tissue between scenes.

- `World` - many maps, each created once and kept alive (or rebuilt fresh per entry when
  defined `persistent: false`); `unload` frees a map's own state.
- `Overworld`/`Location` - named-location lookup.
- `TurnClock`/`TimedEffect` - hunger/poison-style timed effects, ticked on `advance`.
- `rollEncounter`/`EncounterTable` - rolls whether an encounter fires, then weight-picks
  which.
- `EnvironmentClock`/`DayPhase`/`EnvironmentSnapshot` - a continuous day/night-phase and
  weather clock above any one encounter, driven by `update(dt)` in real seconds, with change
  notifications and `toJSON`/`fromJSON`.

## `i18n`

Message tables, plurals, interpolation, and direction - pure logic, no Pixi dependency.

- `Direction`/`Catalog`/`MessageValue` - the message-table shape: locale, direction,
  messages, an optional Fluent-parsed or plain-string/plural-form value.
- `setBase`/`setActive`/`locale`/`direction` - the active and fallback language, and the
  direction `ui`'s `Theme.direction` reads from; `reset` clears both back to unset.
- `t`/`tRaw`/`formatSpec`/`tokenizeMessage`/`diffPlaceholders`/`MessageParams` - resolves a key, selecting a plural form via `Intl.PluralRules` and
  interpolating `{token}`s; falls back to the base language, then to the raw key. Placeholders
  also take Python f-string-style specs (`{dmg:03d}`, `{hp:.1%}`, `{name:>12}`), `!s`/`!r`/`!a`
  conversions and `=` debugging, resolved through `formatSpec` (verified case by case against
  CPython; an ill-fitting spec stays untouched rather than throwing). `tokenizeMessage` is
  the single definition of that placeholder grammar, shared by interpolation and by
  `diffPlaceholders`, which compares a reference string against its translation (dropped,
  added, or reshaped tokens) for `tools/i18n-edit` to surface. `tRaw`
  skips the display-text decoration (typographic spacing, RTL wrapping) for catalog values
  that are not shown to the player, such as a sound path.
- `parseSoundMarkers`/`stripSoundMarkers`/`InlineSoundCue`/`ParsedSoundText` - extracts
  `{sound:path}` markers from translated text, returning marker-free display text and each
  cue's visible-character offset. `MessageBox` consumes these markers during its reveal;
  `t()` and `tRaw()` preserve them for the presentation layer.
- `typographic` - locale-aware curly-apostrophe substitution (French/Italian/Dutch elisions);
  for French, also a narrow no-break space before `; ! ? :` and around `« »`, and a plain
  no-break space between a numbering word and its number ("Chapitre 3"); for German, a
  no-break space between a number and its unit ("5 kg") and after a small set of
  abbreviations ("Nr. 3", "Dr. Müller").
- `nonBreakingUnit` - joins a value and a game-defined unit ("pièces d'or", "points de vie")
  with whichever no-break space French/German typography calls for; the unit's own text is
  always the game's vocabulary, never MWG's.
- `has` - whether a key resolves to something real, in either language.
- `parseFTL`/`FluentOptions` - parses Project Fluent `.ftl` message resources into the same
  `Catalog`/`t()` surface, with variables, exact and plural variants.
- `SemanticMessage`/`MessageChannel`/`MessageFormatter`/`createCatalogFormatter` - a typed
  `{ type, params }` communication intent rendered differently per channel (log/compact/
  accessibility/debug/audio) from the same underlying catalog: `createCatalogFormatter` looks up
  `${type}.${channel}`, falling back to `${type}` alone, then formats through `t()`. A
  simulation emits the message once; the channel is a presentation choice, not a rule. The
  `audio` channel holds a sound path (played game-side through `audio`'s `Sound`), resolves
  through `tRaw` rather than `t()`, returns `''` when no `<type>.audio` entry exists, and
  never falls back to a bare type holding a sentence.
- `EntityTextResolver`/`GrammaticalEntity` - type contracts a game uses while building a
  `SemanticMessage`'s params (resolving an id to display text, or carrying gender/number/
  proper-noun metadata for its own catalog's grammar); MWG never calls or interprets either.
- `formatNumber`/`formatDate`/`formatList` - locale-aware `Intl.NumberFormat`/
  `DateTimeFormat`/`ListFormat` wrappers reading the active locale from `locale()`, for a
  message that needs more than `{token}` substitution - a game calls these while building a
  `t()`/`SemanticMessage` param, the same way it resolves an entity id to display text.
- `diffCatalogKeys`/`validateCatalog`/`CatalogKeyDiff`/`CatalogIssue` - catalog consistency
  checks: `diffCatalogKeys` compares two catalogs' key sets (a base language against a
  translation); `validateCatalog` flags empty messages and plural forms missing their
  `other` branch within one catalog. Deliberately not a parameter schema validator - a
  `SemanticMessage<TType, TParams>`'s own generics already give a game compile-time
  parameter safety, which is the primary mechanism the source document calls for.
- `validateMessageAudio`/`AudioIssue` - structural checks over `<type>.audio` sound-cue
  entries: empty paths and non-string (plural/select) values, which would reduce silently
  at lookup time rather than selecting per play.
- `EditSession`/`EditRow`/`RowFilter`/`AUDIO_SUFFIX`/`createEditSession`/`sessionKeys`/
  `sessionRow`/`sessionRows`/`setTargetText`/`copyFromBase`/`deleteTargetKey`/
  `setTargetSound`/`cueKeyFor`/`sessionCompleteness`/`swapSession`/`isAudioKey` - the pure
  session core behind `tools/i18n-edit`: translatable rows with reference/target text and
  an effective cue (a channel key shares its semantic family's `<type>.audio`, one cue per
  family), completeness ignoring cue keys, and swapping which catalog is the reference.
  `tools/i18n-edit.mjs` is the terminal split-screen editor over it, with a `--check`
  mode for CI.
- `messageText`/`levenshteinDistance`/`findSimilarMessages` - content-management over a
  catalog's actual message text rather than only its key shape: `messageText` reduces any
  `MessageValue` to plain comparable text, `levenshteinDistance` is the classic edit-distance
  primitive, and `findSimilarMessages` surfaces near-duplicate messages worth merging by
  similarity threshold, most-similar first.
- `catalogUsage`/`catalogCompleteness`/`pluralFormCoverage` - catalog statistics:
  `catalogUsage` compares a catalog's keys against a caller-supplied referenced-keys list
  (mwg has no view into a game's own source) for used/unused counts; `catalogCompleteness`
  is a 0-1 translated fraction built on `diffCatalogKeys`; `pluralFormCoverage` tallies which
  CLDR plural categories a catalog's plural-form messages actually define.
- `mergeCatalogKeys` - drops a merged key from one catalog, keeping the surviving key's text
  untouched; rewriting call sites that used the merged key stays the caller's own job, the
  same boundary `catalogUsage`'s `referencedKeys` already draws.

## `mwl`

MWL is the build-time, game-neutral content layer. It uses a WML-inspired syntax for data
such as units, items, maps, events, AI hooks, translations, and asset references. The runtime
consumes generated data and does not parse `.mwl` source files in the browser.

- `mwl build` - reads one file or a directory of `.mwl` files in stable path order and emits
  `game-data.ts`, `i18n.json`, and `assets.json` in one step.
- `mwl build --asset-root public/assets` - optionally verifies every extracted asset before
  emitting the generated files. Missing paths include their MWL source location; without this
  flag the build stays portable for games that resolve assets elsewhere.
- `contentReport` / `loadContent` / `mwl report` - counts tags, lists opaque names, reports
  resources, dependencies and unresolved references, and returns structured load diagnostics
  for parity checks and CI.
- `[campaign]` - declares game-owned campaign metadata (`id`, optional `name`, `title`,
  `description`, and `start_scene`). Its children are intentionally open so a game can define
  scenario and progression tags without changing the core MWL schema; metadata is exposed by
  `contentCatalog(game).campaigns`.
- `campaignChain` - points a `[campaign]` at `simulation.Campaign`: `first_scenario` opens the chain,
  each `[scenario]`'s `next_scenario` is where it goes when it is won, and a scenario that ends the
  chain ends the campaign. The order is content, the playing stays the game's (`run` is a callback),
  and a scenario that decides for itself - a runtime `[endlevel]` - keeps its decision. The
  `[campaign]` schema reads `first_scenario`, and the catalog exposes each campaign's `scenarios`.
- `endLevelCarryover`/`carryoverIntoScenario`/`MWL_DEFAULT_CARRYOVER_PERCENTAGE` with `[endlevel]` -
  a scenario's end as the reference models it: a share of the side's gold (80% by default), a bonus
  on top, that side's surviving units as the recall list, and the next scenario. `result=victory`
  ends it won, `result=defeat` lost, and the arithmetic is the same for both. `MwlSideRef` names the
  two identities a side has today (`[side]`'s id for gold, its number for units), which is roadmap
  item 277 rather than a guess made here.
- `readAttributes` / `readChildren` - shared typed readers for compiled nodes. They coerce
  scalars and lists and return source-located diagnostics instead of silently guessing.
- MWL tables use `[table] columns=name:type|...` with typed `[row]` attributes. The compiler
  validates column shape and values, and `contentCatalog(game).tables` exposes typed rows.
  Supported column types match `core.parseCSV`: `string`, `number`, `boolean`, `list`, and
  `map`, with configurable list and map delimiters.
- `composeEffects` - resolves MWL effects through `actors.composeModifiers`, so declarative
  item effects and actor stats use one composition rule.
- `evaluateCondition` - evaluates bounded content conditions with comparisons, `and`/`or`/`not`,
  arithmetic, literals, `where` bindings, and explicitly supplied pure helpers. There are no loops, assignments,
  dynamic code loading, or implicit game rules.
- `mwl validate` - checks syntax and content structure without generating runtime files.
- `mwl compile`/`mwl extract-i18n`/`mwl hooks` - lower-level commands for a generated module,
  translation extraction, or hook manifest when a build pipeline needs separate outputs.
- `parse`/`compile`/`validate`/`extractI18n` - the programmatic compiler surface exported from
  `@datamoc/mw_games/mwl`; games provide their own hook implementations and interpret
  game-specific effects.
- Public MWL exports - `MwlRuntime`, `MwlSyntaxError`, `collectHookReferences`, `compileNodes`,
  `compileSources`, `compileAndEmitSources`, `emitArtifacts`, `coerceTableValue`,
  `parseTableColumns`, `contentCatalog`, `createWorld`, `decodeSave`, `effectToModifier`,
  `emitHooksDeclaration`, `emitModule`, `encodeSave`, `evaluateExpression`, `execute`,
  `extractCatalog`, `hookTypes`, `inventoryItem`, `isGettext`, `itemDefinition`,
  `parseExpression`, `parseHookReference`, `parseTerrain`, `parseValue`, `preprocess`,
  `schema01`, `validateCatalogNodes`, `validateHookReferences`, `loadContent`, and `validateWorld`.
- `MwlTraceEvent`/`MwlRuntimeOptions.onTrace` - opt-in lifecycle tracing for event claims,
  completions, variable writes and runtime errors. `MwlHookRegistry.predicate` lets an adapter
  register named, typed filter predicates without putting game-specific semantics in MWG.
- `ScriptHost` and `createExpressionScriptHost` - the game-owned boundary for executable content.
  The expression host is the statement-free default. The main `mwl` entry point
  exports its types without loading a scripting VM. Projects that opt in to the optional
  `fengari` dependency can import `createFengariScriptHost` from `@datamoc/mw_games/mwl/fengari`.
  It provides Lua 5.3 evaluation, chunks, named function calls, JSON-shaped context values, and
  `mwg_emit(name, payload)` events. The adapter removes filesystem, process, module-loading and
  debug globals, replaces `math.random` with seeded deterministic random, and enforces an
  instruction budget. Lua VM state is not save data: reload scripts from the game's entry point.

`MwlRuntime` exposes `fireEvent(id)` for named event execution. Event conditions compare
numeric variables numerically, `set_variable` accepts the bounded MWL expression syntax,
filters can match a unit id, `unit_at` can constrain a side, and moveto coordinates accept
lists and inclusive ranges. Top-level `say` commands execute normally. Dialogue choices are
delivered in `MwlMessage.choices` and answered with `answerDialogue`; pending choices are
included in save data. Commands after a dialogue in the same event run immediately, before
the answer, so deferred follow-up commands belong in the selected choice event.

Typical build-time usage:

```sh
npm run mwl -- build content/ -o generated/
```

The executable [`mwl-content` example](../examples/view.html?ex=mwl-content) shows the full
path: authored content, generated catalog and manifests, then a small game reading the result
at runtime. A Wesnoth adapter can convert native `.cfg` files to the same MWL input model
before invoking this build step.

## `ai`

Renderer-free decision runners. The game owns perception, navigation, combat rules and
goals; these modules provide the execution boundary, deterministic choice support, explicit
actions, serialisable state, diagnostics and budgets.

- `JavaScriptAI` - registers named behaviours, checks them in declaration order, and returns
  a JSON-shaped action or an idle decision. A behaviour receives perception, mutable plain
  state, seeded `random()`, `emit()` and a cooperative `checkpoint()` for cancellation and
  step or wall-clock budgets. JavaScript cannot interrupt a synchronous function that never
  checks its checkpoint, so long-running behaviours must cooperate.
- `alphaBetaSearch`/`AlphaBetaGame` - deterministic minimax with alpha-beta pruning over a
  game-owned immutable-state adapter. The adapter supplies legal moves, transitions, terminal
  detection, current player and evaluation from the root player's perspective. `depth`,
  `maxNodes`, cancellation and node diagnostics bound the search; the same primitive works
  for a local actor and for a top-level controller such as a chess master.
- `personalScoreView`/`sideScoreView`/`scoreWith` over `ScoreSubject`/`ScoreView`/
  `ScorePersonality` - the numbers a mind that weighs outcomes needs, for the case where a search
  is the wrong tool. The game owns what anything is worth (`scoreOf`), the framework owns how a
  view is assembled (own, allies and enemies kept apart, plus a `seen` count), and the mind owns
  what it cares about: a personality is weights, so a selfish scout and a loyal one are content
  rather than two AI implementations. Both scopes read through the same code and differ only in
  the visibility set they are handed, a unit's own sight or `FactionFog.sees(side)`.
- `AIDecision`/`AIDecisionInput`/`AIAction` - the shared contract for perception, explicit
  action objects, status (`action`, `idle`, `cancelled`, or `budget-exceeded`), emitted
  diagnostics and state snapshots.
- `AICancelledError`/`AIBudgetExceededError` - the cooperative control-flow errors used by
  a JavaScript behaviour when it observes cancellation or exceeds its configured budget.
- `exportState`/`importState` - versioned, JSON-shaped agent state. Function closures, VM
  state and arbitrary object graphs never become save data.
- `LuaAI` from `@datamoc/mw_games/ai/lua` - optional Lua 5.3 provider with the same action
  and state envelope. A Lua function receives `(perception, state)` and returns an action
  table or `{ action, state, events }`. It uses the existing optional Fengari host, which
  removes filesystem, process, module-loading, clock and debug access, supplies seeded random,
  and enforces an instruction budget.
- `AIAgentDefinition`/`AIBehavior` - JavaScript registrations; Lua registrations instead
  provide a source chunk and an entry function name. Both remain game-owned content and
  do not include any reference game's code or data.

MWL `[ai]` profiles describe the boundary without embedding executable game rules: `scope`
is `actor` or `controller`, `provider` is `javascript` or `lua`, `algorithm` can be
`rules` or `alpha_beta`, and `depth`, `max_nodes`, `player`, `moves`, `apply`, `terminal`
and `evaluate` identify search limits and game-owned operations. A game resolves those names
to JavaScript behaviours or Lua functions and supplies the actual state, legal moves and
evaluation.

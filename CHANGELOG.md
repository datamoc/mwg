# Changelog

All notable changes to `mwg` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows
[Semantic Versioning](https://semver.org/) as of this first release - a 0.y.z version means
the public API may still change between minor versions.

## [Unreleased]

## [0.5.0] - 2026-09-09

A declarative reactions primitive, closing the "branch cascade of `if HP < n`" gap named
directly, plus a new website page collecting the framework's original, non-obvious
mechanisms for a game-developer audience.

### Added
- `core.ReactionTable`/`ReactionRule` (roadmap item 172) - named `when`/`action` rules
  checked against any state shape (a `StatBlock`'s values, or a plain object's own fields
  such as an item's durability), firing `action` the moment `when` turns true and staying
  quiet while it remains true - edge-triggered the same way `roguelike.BossPhases` tracks
  entered phases. A `once` rule retires after firing; the default re-fires on the next
  rising edge. Lives in `core`, not `actors`, so the same table watches a character or an
  inanimate object without either module depending on the other.
- `webpage/features/index.html` - ten specific, original mwg mechanisms (declarative
  reactions, the per-sprite multiply-and-add colour transform, `Barrier`'s outermost-first
  layered absorption, `Advancement`'s unified points/branch/capstone track, `Affix`'s
  trigger-routed curse-derived enchantments, `TriggerTracker`'s turn-window streaks, i18n's
  bidi-isolate/typographic rules, `StatStages`'s bounded ladder as one modifier, `Scramble`'s
  honestly-scoped obfuscation, and the deliberate `Scheduler`/`TurnClock` split), linked from
  every hand-authored page's nav.

## [0.4.3] - 2026-09-08

A simplification pass across storage, selection, and text options, one pathfinding
allocation fix, a new opt-in build tool, and an interactive architecture diagram on the
website.

### Added
- `tools/compress-dist.mjs` (`@datamoc/mw_games/tools/compress-dist`) - writes precompressed
  `.gz`/`.br` siblings (optionally `.xz` via a system `xz` binary) next to a build's text
  files, for a server that can negotiate `Content-Encoding`; the originals are untouched, so
  a `file://` page keeps working unchanged. Wired into `tools/emit-page.mjs`'s example build
  step (`--no-compress`/`MWG_NO_COMPRESS=1` to skip, `--xz` to also archive).
- `webpage/design/architecture-explorer.html` - an interactive, pannable/searchable diagram
  of `mwg`'s real module dependency graph (which modules reach `core`, which reach a
  renderer), generated from `src/`'s own import graph rather than hand-drawn, linked from
  the design page's "Module boundaries" section.

### Changed
- `core.StoredValue` - the read-with-fallback/write/remove trio `PlayerStats`, `RunHistory`
  and `NewsSeenTracker` each hand-rolled slightly differently now share one implementation.
- `core.NewsClient` is rebuilt on the shared `HttpTransport` every other injectable HTTPS
  client here already used, rather than its own hand-rolled timeout/abort handling.
- `two-d/ui.SelectionModel` - the highlight/select/confirm/wrap-at-both-ends contract
  `ListView` and `IconGrid` had begun to implement slightly differently now lives in one
  place; each widget keeps only what actually differs (1-D rows vs. 2-D cells).
- `two-d/ui`'s `Label`/`BitmapLabel` share their text-option shape and RTL-aware default
  alignment through a new internal `themedText` helper instead of two copies.
- `rpg`'s `FreeMover`/`GridMover` share their "play this animation if the sprite has it"
  guard; `actors`'s `applyStatusEffect`/`applyItemStatusEffect` share their clock-lease/
  cancel logic. Both were identical code living in two places.
- `vite.lib.config.ts` and the examples' shared Vite config turn off `reportCompressedSize`:
  the estimate cost a full in-memory gzip of the bundle for a number `tools/compress-dist.mjs`
  reports for real now.
- `roguelike.Level` gained `forEachNeighbor` (visits a cell's neighbours via callback instead
  of allocating an array), used by `Pathfinder`'s flood fills and `Placement.cellsNear` - the
  hottest per-cell allocation in map generation, now gone.

## [0.4.2] - 2026-09-08

A roadmap-management pass alongside three real capability gaps closed: deterministic dungeon
content placement, i18n catalog content tooling, and 2D/3D asset loading unified where it
correctly can be.

### Added
- `tools/roadmap-progress.mjs`/`roadmapProgress.js` gained an item-management panel: search,
  "only open items", and local (never committed to `ROADMAP.md`) priority/status/assignee
  triage per item, with export/import.
- `roguelike.candidateCells`/`cellsNear`/`selectDistinctCells` - deterministic content
  placement over a `Level`: terrain/occupancy/region filters, radius-based clustering, and
  bounded distinct-cell selection with a JSON-safe roll trace, composing for neighbouring
  items, scattered decorations, and single room/branch rewards.
- `i18n.messageText`/`levenshteinDistance`/`findSimilarMessages` - near-duplicate catalog
  message detection by edit distance.
- `i18n.catalogUsage`/`catalogCompleteness`/`pluralFormCoverage` - catalog statistics: used
  vs. unused keys against a caller-supplied reference list, translated-fraction completion,
  and CLDR plural-category coverage.
- `i18n.mergeCatalogKeys` - drops a merged key from a catalog, keeping the surviving key's
  text; rewriting call sites stays the caller's own job.
- `assets.loadBinary`/`getBinary`/`isBinaryLoaded`/`releaseBinary` (also its own
  `@datamoc/mw_games/assets/binary` entry point) - a renderer-free raw-byte cache, the
  direct fix for `three-d`'s `Vox.parseVox` needing a game to fetch bytes itself.
- `3d/models`' `loadModelContainer3D`/`isModelContainerLoaded`/`releaseModelContainer` -
  loads a glTF/GLB source once, caching the Babylon `AssetContainer`; a game calls the
  container's own `instantiateModelsToScene()` for each independent, unaliased copy it
  wants placed, rather than importing (and re-fetching) the same model every time.

### Fixed
- `two-d/ui`'s right-to-left mirroring was incomplete: `Bar`'s fill always grew from the
  left, `IconGrid` always laid its columns left-to-right and never swapped what the
  `'left'`/`'right'` actions meant, and `HelpScreen` always put its topic list on the left.
  All three now mirror under `theme().direction === 'rtl'`, matching `Window`/`ListView`/
  `Button`/`Label`, which already did.
- `ROADMAP.md` had two items both numbered 161, a genuine duplicate; the misplaced one was
  renumbered and moved to the true end of the list before being implemented.
- `tools/build-webpage-docs.mjs`'s nested `npm install` could fail when the caller's own
  global `~/.npmrc` set an `allow-scripts` value npm rejects for a project-scoped install;
  that env var is now explicitly cleared for the nested call.

## [0.4.1] - 2026-09-07

A study of `mwg-pixel-dungeon` (a reference game, not in this repo) recommended closing the
PixiJS boundary the rest of the way, a formal simulation runtime, stable entity identity, and
semantic messaging as framework primitives. All of it landed this release, plus the eight
architecture decisions it proposed, recorded in the new `ADR.md`.

### Added
- `core.EntityRegistry`/`EntityId` - assigns and looks up stable string ids for live objects,
  so events, saves, AI targets and buffs can name a creature or item without holding it.
  `idOf` is what a game passes as `Scheduler.toJSON`'s or `SimulationRuntime.snapshot`'s
  `actorId`.
- `core.PresentationQueue` - plays a batch of simulation events one at a time, each waiting on
  its own `play()`-returned duration, freed of any renderer - the presentation-side
  counterpart to a `SimulationRuntime.dispatch()`/`runScenario()` result.
- `simulation.SimulationRuntime`/`SimulationContext`/`SimulationOutcome`/
  `SimulationRuntimeRule`/`SimulationSnapshot` - a facade over one state + one
  `roguelike.Scheduler` + one `core.Generator` for the interactive half of a turn-based
  simulation: `dispatch` runs a single command, threading `random`/`scheduler` as context and
  charging any returned cost; `snapshot`/`restore` capture and rebuild the whole triple.
  Composes with the existing `advanceToInput`/`runScenario` rather than replacing them.
  `simulation` also re-exports `Scheduler`/`Actor`/`SchedulerSnapshot` from `roguelike`.
- `roguelike.Scheduler` gained `postpone` (delaying an actor other than the current one) and
  `toJSON`/`restore` (a deterministic snapshot keyed by a caller-supplied actor id), making it
  the sole, serialisable authority on logical time.
- `i18n.SemanticMessage`/`MessageChannel`/`MessageFormatter`/`createCatalogFormatter` - a
  typed `{ type, params }` communication intent rendered differently per channel (log/
  compact/accessibility/debug) from the same catalog, built on the existing `t()`/plural/
  Fluent machinery rather than a parallel implementation.
- `i18n.formatNumber`/`formatDate`/`formatList` - locale-aware `Intl` formatting for a message
  that needs more than `{token}` substitution.
- `i18n.diffCatalogKeys`/`validateCatalog` - catalog consistency checks: two catalogs' key
  sets compared, and one catalog's own empty messages/incomplete plural forms flagged.
- `two-d.render.Container2D`/`Texture2D`/`Rect`/`TextureRegion`/`rectOf` - plain,
  renderer-free public types in place of `pixi.js`'s own `Container`/`Texture`/`Rectangle`;
  `Scene2D.stage` is now typed `Container2D`, `SpriteSheet.region` returns a `TextureRegion`.
- `two-d.render.Node2D`/`Shape2D`/`Text2D`/`TiledSprite`/`Gradient` - bare, MWG-named
  re-exports of Pixi's `Container`/`Graphics`/`Text`/`TilingSprite`/`FillGradient`, so a game
  never has to name `pixi.js` for a plain layer, vector drawing, one-off text, a scrolling
  tile, or a gradient fill.
- `two-d.pixi-interop` - the one sanctioned, explicit escape hatch for the rare Pixi-specific
  need the facade above does not cover.
- `TintedSprite` (and everything built on it - `AnimatedSprite`, `TileMap`, `DialogueStage`)
  now registers its own colour-transform Pixi pipe automatically on import; a game no longer
  passes `{ extensions: [registerColorTransform] }` to `Game`.
- `ADR.md` - the eight architecture decisions from the `mwg-pixel-dungeon` study, each
  recorded against the code and tests that enforce it.

### Fixed
- `ButtonSkin.texture`, `ButtonOptions.icon`, `IconGridItem.icon`, `ListItem.icon`, and
  `Theme.panel` were still typed as raw `pixi.js` `Texture`/`Container` in public interfaces;
  all retyped to `Texture2D`/`Container2D` (the same underlying type, not a breaking change).

## [0.4.0] - 2026-09-06

**The reshaping release, and intended to be the last one.**

`mwg` grew fast, and grew by accretion: the renderer ended up inside `mwg/core`, an event
interpreter ended up importing a widget library, the same idea got solved three or four
different ways in different modules, and several names meant a different thing depending on
which file you were reading. None of that was going to get cheaper to fix. A rename costs a
line in this file today; after 1.0 it costs somebody else's build.

So this release spends the breakage budget deliberately, all at once, while the version
number still says it is allowed:

- **The renderer is no longer part of the core.** `mwg/core` now holds the scene lifecycle,
  input, saves, RNG and signals, and pulls in no renderer at all. `Game` and the display half
  of `Scene` moved to the new `mwg/two-d`, which is where `render`, `ui` and `stage` now live
  as well. `mwg/3d` is its Babylon counterpart, and neither costs a game anything if it is
  not used.
- **Game logic is renderer-free too.** `mwg/rpg` was the last module reaching a renderer by
  accident; its event interpreter now takes an injected dialogue presenter. So dungeon
  generation, map events, quests, stats, turn order, inventory and battles all run under a 2D
  game, a 3D game, or a headless test, unchanged. `tests/renderer-isolation.test.ts` walks the
  real import graph and enforces exactly which modules may reach PixiJS or Babylon.
- **One idea, one spelling.** `advance(turns)` is turns and `update(dt)` is real seconds.
  `toJSON`/`fromJSON` is how a class saves. "Nothing to pick" is `null`, not `-1` or
  `undefined`. Two identical hook registries became one.
- **The character sheet can be saved.** `Inventory`, `StatBlock`, `EquipmentSlots`,
  `Progression`, `SkillPoints` and `Charges` gained serialization, so a game stops hand-rolling
  the most important half of its own save file.

The hope, stated plainly: **1.0 should be this shape.** What remains before it is coverage and
confidence, not another reshuffle. Additions rather than renames from here.

### Added
- `two-d.ParticleEmitter` - a pooled, seeded particle emitter (sparks, dust, rain). The pool
  is allocated once at `max` and never grows, and every draw goes through `core.Random`, so a
  replayed run reproduces the same spray. Given no `texture` it runs the simulation and draws
  nothing, which is how it is tested without a DOM.
- `two-d.ScreenEffects` - a full-screen colour wash: `fadeOut`/`fadeIn`/`flash`/`setTint`,
  driven by `update(dt)` returning true on the frame an effect completes.
- `two-d.Tooltip` - a hover explanation over a themed `Window`, with a frame-driven delay and
  edge-aware placement that flips rather than running off screen.
- `roguelike.RoomBuilder`/`hallBuilder`/`eligibleBuilders`/`pickBuilder`, and
  `DungeonOptions.builders` - composable room interiors: the generator places and joins rooms,
  a builder carves each one. A room no builder fits falls back to a plain hall.
- `roguelike.generateDungeonGraph` - the same pipeline as `generateDungeon`, also returning the
  room graph, a rejected-placement retry count, and which builder carved each room.
  `DungeonOptions.hooks` fires `onRoomPlaced`/`onCorridorCarved` as the pipeline runs.
- `roguelike.FeatureLayer` - a floor feature/event layer: named kinds with
  `inspect`/`interact`/`consequence`/`persistent` rules attached to generated cells.
- `roguelike.rollRoster` - a variant-spawn/content-roll API: rare additions, per-entry
  alternative swaps, then a shuffle, with every roll traced (including an explicitly deferred
  one) for parity tests.
- `roguelike.compareDungeonArtifacts`/`checkDeterminism` - a dungeon parity harness that tags
  every mismatch `'graph'` or `'paint'`.
- **Save/load for the character sheet.** `Inventory`, `StatBlock`, `EquipmentSlots`,
  `Progression`, `SkillPoints` and `Charges` all gain `toJSON`/`fromJSON`. `Inventory` saves
  per-item instance state (level, wear, affix, `instanceId`) while taking kind-level fields
  from the game's own item table on load, so rebalancing reaches old saves. `StatBlock` saves
  base values and deliberately no modifiers, since whatever applied them reapplies them.
  `Charges` saves banked regeneration progress, so reloading cannot shorten a recharge.
- `core.HookRegistry` - the named-event registry `battle.BattleHooks` and
  `roguelike.CombatHooks` are now both built on.
- `two-d/ui.messageBoxPresenter` - wires `rpg.EventRunner`'s dialogue to a `MessageBox` in one
  argument.
- `rpg.MovableSprite`, `rpg.AutomapTarget`, `rpg.DialoguePresenter` - the structural shapes
  that replaced concrete renderer types in `mwg/rpg`'s signatures.
- `core.Input` gains touch input: `touchCode`/`bindTouch`/`pressTouch`/`releaseTouch` follow
  the same synthetic-code pattern `bindButton`/`pollGamepads` already use for a gamepad, so
  `isDown`/`justPressed`/`justReleased` work unmodified for a touch-driven action. `attachSwipe`
  resolves a one-finger drag into one of 8 directional action pulses by angle, or a `tap`
  action for a short drag. `core.PlayerInput` gains matching `bindTouch`/`pressTouch`/
  `releaseTouch` wrappers.
- `ui.Button` gains `onPress`/`onRelease` signals (pointerdown, and pointerup/pointerupoutside),
  the hook a virtual on-screen d-pad button needs to feed `pressTouch`/`releaseTouch` for
  hold-to-repeat movement, independent of `onClick`.
- `mwg/3d` gains `Collision3D.ts` (`buildHeightIndex`, `cellAt`, `heightAt`,
  `resolveCapsuleAgainstGrid`): horizontal collision against `createTileGrid3D`'s stepped
  grid, stopping a moving capsule/AABB at a raised column's edge instead of clipping through
  it. `Character3D` takes an optional third constructor argument, `collideXZ`, to plug this
  in; omitted, movement behaves exactly as before.
- `assets.fetchWithByteProgress` reports real cumulative bytes transferred (and the known
  total, from `Content-Length`) for a real origin - a dev server, or a desktop host serving
  through a virtual origin rather than `file://`. `desktop/MwgDesktopHost` now serves the
  built game through `CoreWebView2.SetVirtualHostNameToFolderMapping` (a real `https://`
  origin) instead of a plain `file://` navigation, which is what makes this - and any other
  real network call - actually usable inside it.

### Changed

- **Breaking: `mwg/render`, `mwg/ui` and `mwg/stage` moved under `mwg/two-d`.** The Pixi half
  of the framework is now one module, symmetric with `mwg/3d`. Import from
  `@datamoc/mw_games/two-d` (or the granular `two-d/render`, `two-d/ui`, `two-d/stage`). No
  legacy aliases were kept.
- **Breaking: `Game` moved from `mwg/core` to `mwg/two-d`, and `Scene` split.** `core.Scene` is
  now the renderer-free lifecycle (`create`/`update`/`resize`/`onSuspend`/`onResume`/`destroy`);
  `two-d.Scene2D` adds the Pixi container and is what a 2D game extends. `SceneStack` is generic
  over the scene type, so a Babylon game gets scene management, suspend/resume and minigame
  stacking. **`mwg/core` now pulls in no renderer at all**, and neither does `mwg/rpg`.
- **Breaking: `rpg.EventRunner` takes `present: DialoguePresenter` instead of `windows`.** The
  event interpreter no longer builds a `MessageBox`; use
  `present: messageBoxPresenter(this.windows)` for the previous behaviour. `boxWidth`,
  `boxHeight` and `speed` moved onto the presenter.
- **Breaking: `loadTiledMap` moved from `mwg/rpg` to `mwg/two-d/render`**, where the `TileMap`
  and `SpriteSheet` it builds already lived.
- **Breaking: every "pick one" now returns `null`.** `Random.weighted` returned `-1` and
  `Random.element`/`Random.weightedKey` returned `undefined`; all three now match
  `rollEncounter`/`rollLoot`.
- **Breaking: one meaning per name.** `advance(turns)` is turns or rounds and `update(dt)` is
  real seconds, so `EnvironmentClock.advance(seconds)` became `update(dt)`,
  `Barrier.decay(ticks)` and `AbilityCycle.tick()` became `advance(turns)`,
  `BossPhases.update(hpFraction)` became `check(hpFraction)`, and `QuestLog.advance` became
  `advanceStage`. `EnvironmentClock.snapshot`/`restore` and `SupportLedger.save`/`restore`
  became `toJSON`/`fromJSON`.
- **Breaking: `GridMover`/`FreeMover` take a `MovableSprite`** rather than an `AnimatedSprite`,
  so a static sprite (or anything with `x`/`y`) works; the animation members are optional.
- `mwg/assets` split into renderer-free path resolution (`assets/paths`, its own export
  subpath) and the Pixi-backed loader, which is what took Pixi out of `mwg/3d` and `mwg/audio`.
- Per-module export subpaths now ship TypeScript types; previously only the package root did,
  so `@datamoc/mw_games/core` resolved to `any` under `moduleResolution: bundler`/`node16`.
- `sideEffects` narrowed from a blanket `false` to the two `mwg/3d` files with real
  side-effect imports, so a bundler can no longer drop Babylon's glTF and thin-instance
  registrations.

### Fixed
- `examples/three-d`'s hero now actually collides with the raised ridge its demo path crosses,
  rather than the path being hand-routed around it.

## [0.3.1] - 2026-09-05

### Added
- `audio.Music.playTracks(paths, fadeDuration)` plays a playlist rather than one looping
  track: each track plays once, `HTMLAudioElement.onended` (when the backend exposes it)
  advances to the next, and the sequence cycles once it reaches the end. `play()`/`stop()`
  cancel an active playlist so a stale `onended` from a track already replaced cannot advance
  a newer one.

## [0.3.0] - 2026-09-05

### Added
- `core.PlayerStats` (a lifetime total, folded per run - deliberately not derived from
  `RunHistory`, which can drop old entries), `ui.StatsScreen` (a `label: value` display
  recipe), and `core.TelemetryClient` (automatic structured events, off by default until a
  game calls `setConsent(true)`).
- `tools/benchmark-browser.mjs` now records each run's fps/p95/memory to a per-page history
  file (`benchmark-results/`, gitignored) and fails on a regression against the best-seen
  prior run, not only its fixed gate. `npm run benchmark:tower-defense`/`benchmark:ui` cover
  those examples the same way `benchmark:browser`/`benchmark:3d` already did.
  `tools/benchmark-simulation.mjs` (`npm run benchmark:simulation`) measures headless
  `runScenario`/`advanceToInput` throughput, with the same history tracking.
- `core.LockstepClient` and a reference server, `tools/multiplayer-server.mjs` (real-time
  multiplayer's one exception to "`mwg` ships no backend"): lockstep tick authority over a
  plain `WebSocket`, server-assigned identity, and a `?room=` matchmaking string. Run it with
  `npm run multiplayer:server`.
- `core.SaveSyncClient.list()` returns every save-profile slot name an endpoint holds, so a
  player's multiple named profiles (`SaveSystem` already supports as many as a game creates)
  can each sync independently against one endpoint.
- `desktop/MwgDesktopHost`, a minimal WebView2 (WinForms, net8.0-windows) reference host that
  loads a built example's own `index.html` via `file://` unmodified. `npm run desktop:build`/
  `desktop:run` mirror the existing `cap:*` scripts' naming and target the same `tower-defense`
  reference build. Verified with a real `dotnet build`/`dotnet run` and a screenshot of the
  running window showing the game actually rendered.
- `assets.load` and `assets.AssetStream`'s `preload`/`preloadLikely` take an optional
  `onProgress` (asset-count fraction, not literal bytes), threaded through `examples/loading`'s
  own tasks into `LoadQueue.report`. Eviction under a tight budget was verified in a real
  browser across 300 preload/evict cycles: resident texture count stayed pinned to the budget
  throughout.
- `render.StatusVisuals` maps active status-effect names to a tint on a sprite (priority by
  declaration order, an optional pulsing strength), bridging `actors.applyStatusEffect`'s
  game-side data to what a character looks like without either module importing the other.
- `mwg/simulation` (`Simulation` on the standalone build): `advanceToInput` runs a
  scheduler's automatic actions up to a budget until an actor needs input, and
  `runScenario` applies a finite command sequence against caller-supplied rules. Both
  are headless, with no rendering or browser imports, and take random state explicitly
  for reproducibility.
- Button accepts a per-instance nine-patch skin with state tints and caption styling, including captions created later with setText.
- Label accepts stroke, resolution and roundPixels options. Existing defaults are unchanged. Textures remain owned by the caller.

### Changed
- **Breaking:** `core.SaveSyncClient.upload`/`download` now take a `slot` name -
  `upload(payload)`/`download()` are `upload(slot, payload)`/`download(slot)` - so one
  endpoint can hold more than one player profile.


## [0.2.1] - 2026-09-05

### Fixed
- `Sound.play()`, `Music.play()` and `Synth.playTone()` discarded the `Promise` that
  `HTMLAudioElement.play()` returns with no rejection handler. Reusing a pooled `Sound`
  instance before its prior `play()` settled, or `Music`'s crossfade pausing the previous
  track while the incoming one was still loading, rejects that promise ("The fetching
  process for the media resource was aborted..."), which surfaced as an unhandled
  rejection instead of being silently absorbed, the correct handling for an interruption
  that is expected, not an error.
- `Camera.update()` computed its deadzone size through the `view` getter, which also
  clamps to bounds and allocates a rectangle object - two needless allocations every
  frame for values the deadzone calculation never used.

## [0.2.0] - 2026-09-05

### Added

**Core**
- `Tweener`/`Easing`, `UndoHistory`, `PlayerInput` (rebindable action-to-key mapping),
  `RunHistory` (per-run reports and rankings, no online component), `News` (`NewsClient`,
  `NewsSeenTracker`), `Sanitize` (`checkSize`, `checkNoControlCharacters`,
  `sanitizeInboundText`, `validateSchema` - a 10MB default size cap and no embedded control
  characters on any inbound save/news/sync data), `Scramble`, `SaveSync` (`SaveSyncClient`),
  `Save.exportSlot`/`importSlot`, `Loading` (`LoadQueue`), `Feedback` (`FeedbackClient`),
  `Input.onWheel` (wheel scroll as a first-class input signal alongside keys, not just a
  `ListView` feature - horizontal-scroll and zoom modifier keys resolve to a
  `WheelAction`/`WheelInput` the game interprets, distinct from the browser's own scroll/zoom).
- `version`: `mwg`'s own version string, exported from `mwg/core` and kept in sync with
  `package.json` by a dedicated test.

**Render**
- `Viewport`/`splitScreenHalves` (local split-screen multiplayer), `Camera.setViewport`
  screen offset, `ColorBlindness` (`createColorBlindnessFilter`, accessible colour modes),
  `Capabilities.inspectGraphicsCapabilities`/`detectWebGpu` (real WebGPU shader-compile
  probe, not just a `navigator.gpu` existence check), `Streaming.AssetStream`.

**UI**
- `BitmapLabel`, `Toast`, `theme.highContrastTheme`, `LoadingScreen`, pointer and wheel
  support on `ListView`/`IconGrid`, `Bar` fill/background textures with pixel rounding.

**Audio**
- `Synth` (`synthesizeTone`, `playTone`), `Midi` (`parseMidi`, `scheduleMidi`,
  `MidiPlayer`, `noteToFrequency`), `Captions` (`onCaption` - subtitles for accessibility).

**Actors / World / Board / RPG**
- `Support` (`SupportLedger`), `ItemStatusEffect.applyItemStatusEffect` (temporary item
  status), `Environment` (`EnvironmentClock`), `FogOfWar.FactionFog`, `Collision`
  (`aabbOverlap`, `circleOverlap`, `circleAabbOverlap`, `resolveAabbAgainstTiles`).

**i18n / Stage**
- `Fluent.parseFTL`, typographic apostrophes, `StageScript.history`/`showLast`/`skipSeen`,
  `MessageBox` `nvl` mode and `autoAdvance`.

**3D, mobile and desktop**
- `Character3D.playAnimation`/`stopAnimation`/`currentAnimation`,
  `Heightmap.createHeightmapTerrain3D`, an Ionic Capacitor integration for native
  iOS/Android packaging, and a WebView2 desktop host reference under `desktop/`.

**Examples**
- `examples/loading` (`LoadQueue`/`LoadingScreen`/`AssetStream` end to end, including a
  deliberately-failing-once task exercising retry), `examples/three-d`,
  `examples/tower-defense`.

### Changed
- `graphics-capabilities`'s `wgsl` capability now defaults to `false` unless a real
  WebGPU shader-compile probe supplies it, instead of asserting true from
  `navigator.gpu`'s mere existence.
- `tools/find-chrome.mjs` extracted from the byte-identical `findChrome()` duplicated in
  `benchmark-browser.mjs` and `graphics-capabilities.mjs`.

## [0.1.2] - 2026-09-03

### Added
- `Session`: counts how many times a game has launched, persisted across page loads (the
  same `SaveStorage` abstraction `SaveSystem` uses) - the signal a native wrapper needs to
  decide whether to ask for a store rating. `mwg` counts; it never prompts, and bundles no
  store/ads/IAP SDK of any kind.

### Changed
- **Breaking:** `Game` no longer registers `mwg/render`'s colour-transform batcher
  automatically. `mwg/core` imported from `mwg/render` to do this, meaning a game that
  only imported `mwg/core` still compiled in the whole render module. `GameOptions` gained
  `extensions`, a list of Pixi-extension registration functions the caller supplies
  instead: a game using `TintedSprite` (directly, or via `TileMap`/`DialogueStage`/
  `AnimatedSprite`) now passes `{ extensions: [registerColorTransform] }` explicitly.
  `mwg/core` now imports from no other module.

## [0.1.1] - 2026-09-03

First tagged release. Everything below shipped on `main` before this tag existed; nothing
in it is new as of the tag, only now given a version number to refer to.

### Added

**Core**
- `Game` (owns the Pixi `Application`, the frame loop, current `Scene`), `Scene`, `Signal`
  (typed event emitter, stack-mode listener order), seeded `Random` (save/restorable state,
  `withSeed` for scoped determinism), keyboard `Input` with rebinding.
- `Achievements`: named milestones unlocked by counters crossing a target - unlocking is
  derived, never stored; the increment that earns one reports it, `drainNew()` queues
  announcements, and loaded counts announce nothing.
- `Game.step(dt)`, to drive a frame by hand - needed because Chrome throttles
  `requestAnimationFrame` in a background tab.
- `SaveSystem`: named, versioned save slots over `localStorage`, with an in-memory fallback.
- `Recorder`/`Player`: action recording and replay for testing - every `Input.onAction`
  stamped against the `Game.onFrame` count, re-dispatched at the same counts while the loop
  is driven by hand with `Game.step(dt)`; `serializeReplay`/`deserializeReplay` round-trip
  the log with validation.
- `Collection`: named record collections over `localStorage` (quest logs, bestiaries,
  achievements) - `all`/`get`/`put`/`remove`/`where`/`clear` reading storage directly, so
  there is no cached copy to go stale; `SaveSystem`'s memory fallback is now shared.
- `SceneStack` with `Game.pushScene`/`popScene`: a scene suspends underneath another and
  resumes with a result via `Scene.onSuspend`/`onResume` - only the top scene updates, all
  render, so overlays and opaque scenes both work.
- `Logger`: categories and severity over bare `console.log` - four levels, a filter, and a
  sink tests capture instead of the console.
- `Hex`: cube-coordinate hex grid math (`hexNeighbors`, `hexDistance`, `hexLine`, `hexRange`,
  `hexToPixel`/`pixelToHex`), orientation-agnostic and shared by `roguelike` and `render`.

**Render**
- `Camera`, `TileMap` (chunked and culled against the camera; `square`, `hex`, `isometric`, and
  `staggered` projections, all culled through one shape-agnostic bounding-box method), `SpriteSheet`, `AnimatedSprite`,
  `TintedSprite`, and `ColorTransformBatcher` - a per-sprite multiply-and-add colour transform
  in the batch shader, which Pixi's built-in tint cannot do.
- `LayeredSprite`, for characters built from swappable parts (skin, hair, garment).
- `ActorAnimator`: the idle/move/action animation-state convention `AnimatedSprite` and
  `GridMover` never had on their own, with the one rule that makes them coherent - an action
  interrupts idle/move, but is not itself interruptible while it plays.
- `Projectile`: tweens a sprite's position in a straight line, the render-side half of aiming
  a thrown item or a wand bolt.
- `blobIndex`/`autotileFrames`/`BLOB_SHAPES`: the classic 256-combination-to-47-shape blob-tile
  reduction for auto-tiling a terrain edge or corner from many small pieces.
- Verified: SVG textures load correctly through the compiled `data:` URI path; the render path
  holds 60fps at 4000 tinted sprites and over a 160,000-cell synthetic map, with no silent
  fallback off WebGL.
- `TileMap` reads one sheet per tileset (`tileFrame` packs naming the sheet; plain indices
  still read as sheet 0), and cells carry an elevation: `setCellHeight` lifts the top tile
  by `heightStep` per level, growing two shaded side faces per level on the diamond
  projections, with `tileCenter` riding along so occupants stand on top.

**Assets**
- `load`/`texture`/`get`/`resolve`, synchronous after one `load()` call per scene.
- `tools/compile-resources.mjs`: turns every asset into a `data:` URI script, so a compiled
  build never needs `fetch`/XHR (both blocked from `file://`).

**UI**
- `Window`, `WindowStack` (keyboard focus to the top window only), `ListView`, `MessageBox`,
  `Label`, `NinePatch`, `VerticalLabel` (for vertical writing systems), `theme`.
- `IconGrid`: a multi-column icon grid alongside `ListView`, for SPD-sized item counts. Tap-
  then-tap reordering and a frame-driven long-press-to-quickslot timer, both plain methods a
  test can drive without simulating pointer events.

**i18n**
- Message tables, `Intl.PluralRules`-backed plurals, `{token}` interpolation, and
  `direction()` (ltr/rtl), which `ui`'s `Theme.direction` reads from a game's own glue code.

**Actors**
- `StatBlock` (base + derived stats through a fixed add→multiply→set modifier order),
  `EquipmentSlots` (ties an item's modifiers to a stat block on equip/unequip),
  `Progression`/`powerCurve` (levels and experience over a replaceable growth curve),
  `Inventory` (stacking, weight, containers), `skillCheck`.
- `SkillPoints`: a per-stat spendable ledger over a `StatBlock`, with a rising cost-per-rank
  callback and an optional cap - deliberately not a wrapper around `Progression`, just bridged
  to it by the points a level-up grants.
- `craft(inventory, recipe)`: consumes every ingredient and adds the result atomically - an
  ingredient shortfall or a result that doesn't fit rolls back everything already removed.
- `applyStatusEffect`: a temporary buff/debuff - applies `StatBlock` modifiers and registers
  their removal against any clock shaped like `TurnClock`'s `add`/`remove`, returning a handle
  whose `cancel()` removes them early (a cure, a remove-curse scroll).
- `identify`/`enchant`/`damageItem`/`repairItem`: item-depth functions over a plain
  `InventoryItem`, which gained `level`, `durability` and `maxDurability` fields - durability
  is opt-in per item, a no-op without `maxDurability` set.
- `Charges`: a resource that regenerates on its own as turns pass (a wand's limited charges),
  distinct from a `StatBlock` stat spent per use and restored only by an explicit event.
- `rollLoot`: a weighted drop table, the same shape as `world.rollEncounter` - roll whether
  anything drops, then weight-pick which.
- `buy`/`sell`: a shop transaction between two `Inventory`s paid from a `StatBlock` currency
  stat, all-or-nothing like `craft()` - a full stock/buyer-capacity rollback on failure.
- `Advancement`: tiered specialization (level-gated point tiers, one permanent branch choice,
  one capstone) with a point ledger - never the spend rule, which stays game-side.
- `rollAffix`/`applyAffix`/`removeAffix`/`affixOf`: named item affixes carrying only trigger,
  weight and curse flag; `InventoryItem` gained an optional `affix` field.
- `scaledModifiers`: `{stat, op, base, perLevel}` templates resolved to plain `Modifier`s at
  a given item level.
- `Appearances`: per-run seeded shuffling of which look each unidentified kind wears, with
  `toJSON`/`fromJSON`.
- `canAfford`/`spend`: a spendable per-use resource (mana, stamina) over a `StatBlock`
  pool - one cost or several, all-or-nothing `craft()`-shaped, with a negative cost
  refused as an authoring error rather than a refund.

**Roguelike**
- `FieldOfView` (visible/explored/remembered), `Pathfinder` (A*, a Dijkstra distance map,
  `autoExplore`), `Scheduler` (energy-cost turn order), `generateDungeon` (seeded, with an
  optional `kinds` list for a game's own terrain ids alongside wall/floor).
- `decideMonsterAI`: a wander/hunt/flee behaviour loop over a monster's own `FieldOfView`
  (not the player's), built entirely from already-shipped primitives.
- `Secrets`: discoverable/hidden tile state (secret doors, undiscovered traps). A concealed
  cell is disguised straight in `Level`'s own terrain, so `FieldOfView`/`Pathfinder` need no
  changes to support it.
- `chebyshevDistance`/`traceLine`/`hasLineOfSight`/`canTarget`/`resolveArea`: targeting via a
  Bresenham line trace (a different, cheaper question than `FieldOfView`'s shadowcast), with
  `single`/`line`/`burst` area resolution.
- `decideMonsterAI` gained a `disposition` option (`hostile`/`neutral`/`peaceful`, defaulting
  to `hostile`, unchanged) and a `provoked` flag - a peaceful/neutral monster always wanders
  until either overrides it back to hunting.
- `Doors`: open/closed/locked door state, `Secrets`' own shape reused - the state is just
  terrain, swapped between a door's own open/closed kinds; locking is a separate flag that
  keeps a door closed and unopenable until `unlock` is called.
- `BossPhases`/`AbilityCycle`: HP-fraction thresholds reporting newly entered phases in
  order, plus named ability cooldowns with `tick`/`ready`/`use` - both JSON round-trippable.
- `Blob`: per-cell volumes diffused into passable neighbours and decayed per step, with
  `cellsAbove` for the game to apply its own effects on.
- `Level`, `Secrets` and `Doors` gained `toJSON`/`fromJSON` - the game's own `kinds` table
  (or live level) is supplied fresh on load, `QuestLog`'s own convention.
- `Elevation`: a discrete height per cell, in the `Secrets`/`Doors` sidecar shape.
  `FieldOfView.update` takes it for asymmetric cliff sight (a cell blocks exactly when
  above viewer and target alike), and `Pathfinder` takes it with a climb limit (ascent
  capped, descent free).

**World**
- `World` (many maps, each created once and kept alive, with an explicit non-persistent mode
  for SPD-shaped floors that rebuild fresh every visit), `Overworld`, `TurnClock`,
  `rollEncounter`.

**RPG**
- `loadTiledMap` (orthogonal, single embedded tileset, uncompressed CSV layers; isometric and
  staggered orientations too, each mapped to the matching `TileMap` shape), `GameState`
  (switches/variables), `MapEvent`/`activePage` (last matching page wins), `EventRunner`,
  `GridMover` (tweened tile movement, a walk cycle, and `turnTo` for facing without moving).
- `QuestLog`: staged quest/mission definitions (`canStart`/`start`/`advance`/`status`), with
  `toJSON`/`fromJSON` for `SaveSystem`.
- `loadTiledMap` reads any number of tilesets - embedded or external (fetching an external
  `.tsx`/JSON stays the caller's asset loading) - resolving each gid by Tiled's own
  greatest-firstgid-at-or-below rule.
- `automap`: Tiled-style automapping rules - `input` patterns matched anywhere (`EMPTY`
  constrains nothing), one `output` variant written per match (`EMPTY` leaves the cell
  alone), rules applied in order with each rule's matches collected before any write.

**Stage**
- `DialogueStage` (backdrop, characters standing in front of it, expressions, speaker focus)
  and `StageScript`, a small command interpreter run as one awaited call.
- `StageScript.runStory`: a story as a graph of named passages - `{goto}` commands and
  `StageChoice` jumps between them, falling off a passage ending the story.
- `importTwee`: Twine's Twee notation (plain text, no DOM needed) into a `StoryScript`:
  text lines become `say`, `[[links]]` in all three forms become one closing `ask`, and
  dangling links, doubled passages and setter links are refused rather than half-read.

**Battle**
- `Creature` (wraps `actors.StatBlock`/`Progression`), `TypeMatrix`, `Party`, `battleOrder`,
  `checkEvolution` (last-match-wins, so a multi-stage chain reaches its final form).
- `StatStages`: a bounded, symmetric stage ladder over a `StatBlock` stat (Swords Dance's own
  shape) - replaces rather than stacks a stat's current modifier, and `resetAll()` clears
  every stage in one call for the switch-out rule.
- `chooseMove`/`chooseSwitch`: battle AI built on `TypeMatrix.multiplierFor` - a move scored
  by type effectiveness (or a custom `score`), and a switch suggested only when the bench has
  a genuinely better defensive matchup than staying in.
- `BattleHooks`: a battle-scoped event/hook system for passive abilities and held items,
  keyed by a plain event-name string a game's own battle loop defines; `offSource` removes
  every hook tied to one source (an ability leaving the field on faint).
- `Field`: named, optionally-timed battle-wide conditions (weather, terrain, a screen) a game
  reads directly (`field.has('rain')`) - distinct from any one creature's own `StatBlock`.

**Board**
- `mwg/board`: a generic `BoardGrid` (owned pieces on a cell grid, move/capture) plus four
  traditional games built on it - chess (`startingChess`/`legalMoves`/`applyMove`, FEN
  parsing, check/mate/stalemate/draw detection, and a material-evaluation alpha-beta
  `chooseMove`/`search` engine), checkers (forced captures, multi-jump chains, king
  promotion), go (placement, capture-by-surrounding, ko, area scoring after two passes),
  and backgammon (points, bar/off, dice, hitting a blot).
- `startingTactics`/`tacticalMoves`/`tacticalAttack`/`setTacticalOverwatch`: a small
  grid-tactics layer (move/shoot/overwatch, one action budget per unit per turn) for an
  XCOM-shaped turn.
- `createDeck`/`shuffleDeck`/`deal`: a standard 52-card deck (with optional jokers), shuffled
  and dealt into equal hands; `trickWinner` resolves one trick - highest trump, or highest of
  the lead suit with no trump played - leaving bidding and stakes to the game.
- `dealSolitaire`/`drawSolitaire`/`moveSolitaireTableau`/`moveSolitaireToFoundation`/
  `solitaireWon`: a seeded Klondike deal and its four moves - stock/waste draw with
  waste-recycling, alternating-colour descending tableau moves, ace-up same-suit foundation
  moves, and the all-four-full win check.
- `rollDice`/`rollExpression`: `NdM` and `NdM±K` dice notation over `Random`. `DiceCup`: a
  kept-die reroll cup (`keep`/`reRoll`/`clearKept`). `scoreDice`: all thirteen standard
  Yahtzee-shaped categories over a five-die hand.

**Roguelike**
- `CombatHooks`: named-event listeners for a grid actor's combat lifecycle
  (`beforeAttack`/`beforeDamage`/`afterDamage`/`onKill`, or any game-defined event string),
  optionally tagged by source for bulk removal; `modifyDamage` runs the `beforeDamage` seam
  and clamps/reports whether the hit was fully prevented. HP, formulas and when each event
  fires stay game-side.

**Audio**
- `Sound` (pooled, round-robin) and `Music` (crossfade via `update(dt)`), both taking an
  injectable `create()` in place of `new Audio()` for testing.

**Examples**
- `colour-transform`, `interface`, `dialogue`, `village` (an NPC with switch-selected
  conversation pages and an autorun cutscene), `battle`, `dungeon` - an SPD-shaped
  mockup wiring together most of the above: generated floors, three-state fog of war,
  bump-to-attack, wander/hunt/flee monsters, secret doors and hidden traps, a thrown flask
  of oil, a dense icon-grid inventory, autosave-on-descend with permadeath - and `chess`, a
  playable board against `mwg/board`'s search engine, moved by click-to-select-then-move or
  a held/repeating arrow-key cursor.

**Project**
- A project website with a live colour-transform demo, the capability-spec table, and the
  roadmap, deployed to GitHub Pages.
- TypeDoc-generated API documentation, built through an isolated toolchain (TypeDoc needs
  TypeScript's classic compiler API, which TS7 no longer exposes through its main package).

### Changed
- `generateDungeon` gained an optional `kinds` list, so a game can add its own terrain ids
  (a trap kind, say) alongside the generator's wall/floor without forking it.
- `Targeting`'s `AreaShape` gained `cone`, and `coneCells`/`chainTargets`/`knockbackPath`
  cover sprays, arcs and shoves alongside the existing `single`/`line`/`burst` resolution.
- `EquipmentSlots` gained an optional `locked` predicate - a locked slot reports `isLocked()`
  and refuses both `unequip` and swaps; without it every slot behaves exactly as before.
- `examples/dungeon`'s inventory screen is an `IconGrid` now, not a `ListView`.
- `TurnClock`'s `TimedEffect` gained an optional `onExpire` callback, fired once right before
  an effect whose duration has run out is removed - what `applyStatusEffect` needed to tie a
  status effect's expiry to removing the `StatBlock` modifiers it applied.
- `Game`'s scenes run as a stack: `switchScene` replaces everything, `pushScene`/`popScene`
  suspend and resume; only the top scene updates, all render, and resize reaches the whole
  stack.
- `Pathfinder`'s search loops check the step (both ends on the map, climb within limit)
  rather than the destination cell alone.

### Fixed
- `checkEvolution` was first-match-wins; a multi-stage evolution chain could get stuck on an
  earlier form instead of reaching its final one. Now last-match-wins, matching
  `Event.activePage`'s own convention.
- `GridMover` never updated `facing` on a *blocked* move, so approaching an NPC from certain
  angles left a player unable to turn to face it. Added `turnTo`.
- A vault's floor and treasure (behind a secret door) were rendering through the "solid" wall
  before the door was ever found, because the vault cell was carved eagerly instead of
  staying genuinely undiscovered rock until the door opened.
- Sprites looked blurry under `pixelArt: true` on a hidpi display, even though nearest-neighbour
  texture sampling was already on. The browser does a second, separate resize compositing the
  canvas element onto the page (its backing buffer is rarely the same size as its CSS display
  size), and that step defaults to smoothing regardless of anything Pixi does. Fixed by adding
  a `.mwg-pixel-art { image-rendering: pixelated }` class to the canvas - a class survives
  `autoDensity`/`resizeTo` rewriting the canvas's `style` attribute wholesale, where an inline
  style did not.
- Off-map neighbours could alias real cells through `Level.index` (which does not
  bounds-check), writing distances into the wrong cell once a search looked at the
  step's origin rather than only its destination. Steps now refuse either end off
  the map before any index is touched.



# mwg reference

A one-line-per-export index of `@datamoc/mw_games`'s public API - what exists and where,
not how to use it. For the full generated API docs (every parameter, every doc comment),
see `webpage/documentation/` (built by `npm run webpage:docs`) or the published site. For
*why* the framework is shaped this way and what it's for, see `README.md`'s capability
spec. For architecture and build commands, see `CLAUDE.md`. For the order things shipped
in and the reasoning behind it, see `ROADMAP.md`.

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

`roguelike` adds only `rot-js`. A Babylon game importing `core` + `3d` pulls in no Pixi at
all, and a 2D game importing `core` + `two-d` pulls in no Babylon. `rpg` is renderer-free too:
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
[three-d](#three-d-optional) · [world](#world) · [i18n](#i18n)

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
- `Logger` - categories, four severity levels, a filter, and a sink tests can capture,
  instead of bare `console.log`/`console.error`.
- `Signal` - a typed event emitter: one event, one payload, LIFO listeners, and a listener
  can consume it.
- `HookRegistry`/`Hook` - many events keyed by name, dispatched in registration order, with a
  `source` tag so everything one ability or worn item registered comes off in a single
  `offSource` call. `battle.BattleHooks` and `roguelike.CombatHooks` are both this with their
  argument types fixed; they were two copies of one class until they were merged.
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
- `Tweener`/`Easing` - a generic `tween(duration, apply, ease?)` plus a small
  linear/quad/cubic easing-curve set.
- `UndoHistory` - gameplay-level undo/redo over pushed, reference-held states.
- `LoadQueue` - a reusable loading-screen lifecycle: named tasks, aggregate progress,
  cancellation.

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
- `AnimatedSprite`/`Animation` - frame-sequence sprite animation.
- `SpriteSheet` - a grid-sliced sprite sheet.
- `Camera`/`createCamera`/`snapZoom` - world-to-screen camera; `snapZoom` keeps tile edges
  pixel-aligned at a fractional zoom.
- `Viewport`/`splitScreenHalves` - a camera scoped to one screen region, for split-screen.
- `createColorBlindnessFilter`/`COLOR_BLINDNESS_MATRICES` - accessibility colour filters.
- `Minimap`/`newlyRevealed` - bakes an explored-cell set into a persistent `RenderTexture`,
  never redrawing an already-baked cell.
- `TileMap`/`EMPTY`/`tileFrame`/`tileFrameSheet`/`tileFrameIndex` - tile map rendering:
  square/hex/isometric/staggered projections, multi-sheet tiles, elevation columns.
- `LayeredSprite` - layered character sprites (body/hair/equipment as separate layers).
- `Projectile` - tweens a sprite in a straight line for a thrown/shot visual flourish.
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

## `assets`

The `file://` story: a compiled build resolves paths through a `data:` URI map; dev mode
serves them normally. Load once per scene; everything after is synchronous.

Split in two: `assets/paths.ts` resolves paths and needs no renderer, `assets/loader.ts`
fetches and decodes through Pixi. The `assets` barrel exposes both; a game rendering through
something else imports `@datamoc/mw_games/assets/paths` and pays nothing for Pixi, which is
how `3d` and `audio` reach the compiled asset map without it.

- `setBase`/`isCompiled`/`paths`/`has`/`resolve` - dev-vs-compiled path resolution, renderer-free
  (also its own entry point, `@datamoc/mw_games/assets/paths`).
- `load`/`texture`/`get`/`isLoaded`/`release` - load assets by path, read them back
  synchronously, and free GPU memory once a zone is no longer needed.
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
- **engine** (`Engine.ts`): `chooseMove`/`search` - deterministic, material-evaluation
  alpha-beta chess search with depth/node limits.
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
  own vision, with explored memory retained.
- **army** (`Army.ts`): `startingArmy`/`recruit`/`recall`/`bankUnit`/`armyIncome`/
  `applyUpkeep` - recruiting/recalling units against a currency total, per-turn income and
  upkeep, no specific rate baked in.
- `BoardPiece` (type, from `Classics.ts`) - a generic owned/countable/capturable/promotable
  token distinct from `roguelike`'s `Creature`-shaped actors; every game above builds on it.

## `actors`

Stat blocks, equipment, inventory, and the numbers layer nearly every other module builds
on. This is the *shape* - a game names its own attributes and formulas.

- `StatBlock`/`Modifier`/`DerivedStat` - base attributes plus derived stats, combined
  through ordered modifiers (add → multiply → set). `toJSON` saves base values only:
  modifiers are reapplied on load by whatever owns them (equipment, status effects, auras),
  so saving them too would double every bonus.
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
- `compareDungeonArtifacts`/`checkDeterminism` - a dungeon parity/test harness: diffs a
  seeded run's room graph, retries, terrain, features and content rolls against a reference
  or golden fixture, tagging every mismatch `'graph'` or `'paint'`; `checkDeterminism` repeats
  a generation call and confirms every run matches the first.
- `FieldOfView`/`HeightSight` - shadowcast (square) or straight-line (hex) visibility, with
  `Elevation`-aware asymmetric cliff sight.
- `Elevation` - whole-level height per cell, read by `FieldOfView`/`Pathfinder`.
- `Pathfinder`/`neighbourOffsets` - A*(square)/Dijkstra(hex or elevation-aware) pathing,
  `distanceMap`/`descend`/`autoExplore`, an optional climb limit.
- `Scheduler`/`Actor` - energy-cost turn order.
- `decideMonsterAI`/`AIState`/`AIDecision`/`Disposition` - wander/hunt/flee built on
  `FieldOfView`/`Pathfinder`/`Scheduler`; peaceful/neutral/hostile disposition, provoked
  override.
- `Secrets` - disguised terrain (secret doors, hidden traps) that passes every
  passable/transparent check as its disguise until revealed.
- `Doors` - open/closed/locked door state; locking is independent of open/closed.
- `chebyshevDistance`/`traceLine`/`hasLineOfSight`/`canTarget`/`resolveArea` - targeting:
  range/line-of-sight checks and single/line/burst/cone area resolution.
- `coneCells`/`chainTargets`/`knockbackPath` - a widening cone spray, a greedy nearest-hop
  chain, and a shove's path until the first impassable cell.
- `rangeMultiplier`/`areaFalloffMultiplier`/`RangeBand` - a range-band damage multiplier
  lookup, and a per-target falloff multiplier for an area effect hitting several targets.
- `BossPhases`/`AbilityCycle` - an HP-fraction phase ladder whose `check(hpFraction)` reports
  newly entered phases, and a named-cooldown ability rotation (`ready`/`use`/`advance`).
- `Blob` - a spreading volume-per-cell area effect (fire, gas) that diffuses into passable
  neighbours and decays.
- `CombatHooks`/`CombatEvent`/`DamageContext` - `core.HookRegistry` with combat's argument
  shape (one mutable `DamageContext`), plus `modifyDamage`'s pre-damage seam.
- `Stealth`/`StealthOptions` - sticky, one-way detection: `checkDetection` returns true
  only on the call that first brings an observer within radius.
- `TriggerTracker` - a streak counter (combo, kill-streak) that extends within a turn
  window and restarts once the window lapses.
- `MultiStageAbility`/`AbilityStage` - an ability that unfolds through named, turn-timed
  stages (windup/active/recovery) once started.

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
- `createHeightmapTerrain3D` - a continuous displaced-mesh terrain from a greyscale
  heightmap image, alongside `createTileGrid3D`'s stepped floors.
- `buildHeightIndex`/`cellAt`/`heightAt`/`resolveCapsuleAgainstGrid` - horizontal collision
  for a moving capsule against `createTileGrid3D`'s stepped grid.

### `two-d/ui`

Windows, lists, message boxes, HUD widgets - all themed from one live-swappable `Theme`.

- `theme`/`setTheme`/`defaultTheme`/`highContrastTheme`/`themeChanged` - the active theme;
  `setTheme` fires `themeChanged` so already-built widgets restyle in place.
- `Label` - a themed text wrapper over Pixi `Text`; `stroke`/`resolution`/`roundPixels`
  options, useful for text over artwork.
- `BitmapLabel`/`bitmapLabelStyle` - bitmap-font-backed text, for a HUD value redrawn
  every frame where `Label`'s per-string texture re-render would be wasteful.
- `NinePatch` - a resizable nine-slice panel.
- `Window` - a themed panel container.
- `WindowStack` - keyboard focus goes to the top window only; dims what's underneath.
- `ListView` - a scrollable, keyboard- and pointer-navigable row list (click, wheel-scroll).
- `IconGrid` - a multi-column icon-grid inventory view; tap-then-tap "drag and drop",
  frame-driven long-press for a quickslot.
- `MessageBox` - dialogue text box: paged reveal, choices, ADV/NVL display modes,
  `autoAdvance`.
- `messageBoxPresenter` - wires `rpg.EventRunner`'s dialogue to a `MessageBox` on a
  `WindowStack`, in one argument: `present: messageBoxPresenter(this.windows)`.
- `VerticalLabel`/`layoutVertical` - vertical writing layout, with CJK glyph rotation.
- `RebindScreen` - a keybind-rebinding flow over `Input`, with an optional conflict hook.
- `Button`/`ButtonSkin`/`ButtonState` - idle/hover/pressed/disabled clickable region, icon
  and/or text, optional per-button nine-patch skin with per-state tints.
- `Bar` - a filled-proportion track (health/mana/XP); flat colour or texture, optional
  `roundUpToPixel` so a nonzero value never rounds down to invisible.
- `FloatingText` - a rising, fading damage/pickup number.
- `Toast` - a queued, timed pop-up notification (fade in, hold, fade out).
- `Tooltip` - a hover explanation over a themed `Window`: a frame-driven hover delay, and
  edge-aware placement that flips rather than letting the panel run off screen.
- `HelpScreen` - a topic-list-plus-body help/controls screen.
- `StatsScreen` - a player-stats display screen.
- `LoadingScreen` - a progress-bar loading screen wired to `core.LoadQueue`.

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
- `t`/`MessageParams` - resolves a key, selecting a plural form via `Intl.PluralRules` and
  interpolating `{token}`s; falls back to the base language, then to the raw key.
- `typographic` - locale-aware curly-apostrophe substitution (French/Italian/Dutch elisions).
- `has` - whether a key resolves to something real, in either language.
- `parseFTL`/`FluentOptions` - parses Project Fluent `.ftl` message resources into the same
  `Catalog`/`t()` surface, with variables, exact and plural variants.

# Changelog

All notable changes to `mwg` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versioning follows
[Semantic Versioning](https://semver.org/) as of this first release - a 0.y.z version means
the public API may still change between minor versions.

## [Unreleased]

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

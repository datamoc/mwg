# Changelog

All notable changes to `mwg` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning will follow
[Semantic Versioning](https://semver.org/) once a first release is tagged.

## [Unreleased]

Everything below has shipped on `main`; no version has been tagged yet.

### Added

**Core**
- `Game` (owns the Pixi `Application`, the frame loop, current `Scene`), `Scene`, `Signal`
  (typed event emitter, stack-mode listener order), seeded `Random` (save/restorable state,
  `withSeed` for scoped determinism), keyboard `Input` with rebinding.
- `Game.step(dt)`, to drive a frame by hand — needed because Chrome throttles
  `requestAnimationFrame` in a background tab.
- `SaveSystem`: named, versioned save slots over `localStorage`, with an in-memory fallback.
- `Hex`: cube-coordinate hex grid math (`hexNeighbors`, `hexDistance`, `hexLine`, `hexRange`,
  `hexToPixel`/`pixelToHex`), orientation-agnostic and shared by `roguelike` and `render`.

**Render**
- `Camera`, `TileMap` (chunked and culled against the camera; `square`, `hex`, `isometric`, and
  `staggered` projections, all culled through one shape-agnostic bounding-box method), `SpriteSheet`, `AnimatedSprite`,
  `TintedSprite`, and `ColorTransformBatcher` — a per-sprite multiply-and-add colour transform
  in the batch shader, which Pixi's built-in tint cannot do.
- `LayeredSprite`, for characters built from swappable parts (skin, hair, garment).
- `ActorAnimator`: the idle/move/action animation-state convention `AnimatedSprite` and
  `GridMover` never had on their own, with the one rule that makes them coherent — an action
  interrupts idle/move, but is not itself interruptible while it plays.
- `Projectile`: tweens a sprite's position in a straight line, the render-side half of aiming
  a thrown item or a wand bolt.
- `blobIndex`/`autotileFrames`/`BLOB_SHAPES`: the classic 256-combination-to-47-shape blob-tile
  reduction for auto-tiling a terrain edge or corner from many small pieces.
- Verified: SVG textures load correctly through the compiled `data:` URI path; the render path
  holds 60fps at 4000 tinted sprites and over a 160,000-cell synthetic map, with no silent
  fallback off WebGL.

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
  callback and an optional cap — deliberately not a wrapper around `Progression`, just bridged
  to it by the points a level-up grants.
- `craft(inventory, recipe)`: consumes every ingredient and adds the result atomically — an
  ingredient shortfall or a result that doesn't fit rolls back everything already removed.
- `applyStatusEffect`: a temporary buff/debuff — applies `StatBlock` modifiers and registers
  their removal against any clock shaped like `TurnClock`'s `add`/`remove`, returning a handle
  whose `cancel()` removes them early (a cure, a remove-curse scroll).
- `identify`/`enchant`/`damageItem`/`repairItem`: item-depth functions over a plain
  `InventoryItem`, which gained `level`, `durability` and `maxDurability` fields — durability
  is opt-in per item, a no-op without `maxDurability` set.
- `Charges`: a resource that regenerates on its own as turns pass (a wand's limited charges),
  distinct from a `StatBlock` stat spent per use and restored only by an explicit event.
- `rollLoot`: a weighted drop table, the same shape as `world.rollEncounter` — roll whether
  anything drops, then weight-pick which.
- `buy`/`sell`: a shop transaction between two `Inventory`s paid from a `StatBlock` currency
  stat, all-or-nothing like `craft()` — a full stock/buyer-capacity rollback on failure.

**Roguelike**
- `FieldOfView` (visible/explored/remembered), `Pathfinder` (A*, a Dijkstra distance map,
  `autoExplore`), `Scheduler` (energy-cost turn order), `generateDungeon` (seeded, with an
  optional `kinds` list for a game's own terrain ids alongside wall/floor).
- `decideMonsterAI`: a wander/hunt/flee behaviour loop over a monster's own `FieldOfView` —
  not the player's — built entirely from already-shipped primitives.
- `Secrets`: discoverable/hidden tile state (secret doors, undiscovered traps). A concealed
  cell is disguised straight in `Level`'s own terrain, so `FieldOfView`/`Pathfinder` need no
  changes to support it.
- `chebyshevDistance`/`traceLine`/`hasLineOfSight`/`canTarget`/`resolveArea`: targeting via a
  Bresenham line trace (a different, cheaper question than `FieldOfView`'s shadowcast), with
  `single`/`line`/`burst` area resolution.
- `decideMonsterAI` gained a `disposition` option (`hostile`/`neutral`/`peaceful`, defaulting
  to `hostile`, unchanged) and a `provoked` flag — a peaceful/neutral monster always wanders
  until either overrides it back to hunting.
- `Doors`: open/closed/locked door state, `Secrets`' own shape reused — the state is just
  terrain, swapped between a door's own open/closed kinds; locking is a separate flag that
  keeps a door closed and unopenable until `unlock` is called.

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

**Stage**
- `DialogueStage` (backdrop, characters standing in front of it, expressions, speaker focus)
  and `StageScript`, a small command interpreter run as one awaited call.

**Battle**
- `Creature` (wraps `actors.StatBlock`/`Progression`), `TypeMatrix`, `Party`, `battleOrder`,
  `checkEvolution` (last-match-wins, so a multi-stage chain reaches its final form).

**Audio**
- `Sound` (pooled, round-robin) and `Music` (crossfade via `update(dt)`), both taking an
  injectable `create()` in place of `new Audio()` for testing.

**Examples**
- `colour-transform`, `interface`, `dialogue`, `village` (an NPC with switch-selected
  conversation pages and an autorun cutscene), `battle`, and `dungeon` — an SPD-shaped
  mockup wiring together most of the above: generated floors, three-state fog of war,
  bump-to-attack, wander/hunt/flee monsters, secret doors and hidden traps, a thrown flask
  of oil, a dense icon-grid inventory, autosave-on-descend with permadeath.

**Project**
- A project website with a live colour-transform demo, the capability-spec table, and the
  roadmap, deployed to GitHub Pages.
- TypeDoc-generated API documentation, built through an isolated toolchain (TypeDoc needs
  TypeScript's classic compiler API, which TS7 no longer exposes through its main package).

### Changed
- `generateDungeon` gained an optional `kinds` list, so a game can add its own terrain ids
  (a trap kind, say) alongside the generator's wall/floor without forking it.
- `examples/dungeon`'s inventory screen is an `IconGrid` now, not a `ListView`.
- `TurnClock`'s `TimedEffect` gained an optional `onExpire` callback, fired once right before
  an effect whose duration has run out is removed — what `applyStatusEffect` needed to tie a
  status effect's expiry to removing the `StatBlock` modifiers it applied.

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
  a `.mwg-pixel-art { image-rendering: pixelated }` class to the canvas — a class survives
  `autoDensity`/`resizeTo` rewriting the canvas's `style` attribute wholesale, where an inline
  style did not.

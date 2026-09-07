# Architecture decision records

Recorded once, after the fact, for the eight decisions a study of `mwg-pixel-dungeon` (not in
this repo) proposed and this project then implemented across ROADMAP items 164-166. Not an
ongoing process this project otherwise follows - REFERENCE.md and ROADMAP.md's own item log
are the standing way decisions get written down here; these eight are recorded as a set
because a source document asked for them by name, not because a new ADR convention starts now.
Each is already load-bearing: the "Where" line names the code and tests that enforce it, not
merely describe it.

## ADR-001 - Renderer boundary

**Decision**: A game consumes `mwg`, not PixiJS or Babylon.js directly, in ordinary use.

**Status**: Accepted.

**Where**: `two-d/render/Types2D.ts` (`Container2D`/`Texture2D`/`Rect`/`TextureRegion`),
`two-d/render/Shape2D.ts` (`Node2D`/`Shape2D`/`Text2D`/`TiledSprite`/`Gradient`), and
`two-d/pixi-interop.ts` as the one sanctioned, visible escape hatch for what those don't cover.
Enforced by `tests/renderer-isolation.test.ts` (both directions: nothing under `two-d` reaches
Babylon, nothing under `three-d` reaches Pixi, no example names `pixi.js`/`@babylonjs/*`
directly) and `tests/consumer-app.test.ts` (a minimal game compiles against the real published
paths without naming a renderer).

## ADR-002 - Simulation authority

**Decision**: Simulation logic is renderer-free and transactional - a command produces its
complete logical result before any presentation plays.

**Status**: Accepted.

**Where**: `simulation/Runtime.ts`'s `SimulationRuntime.dispatch` commits state and charges the
scheduler synchronously, then returns the resulting events for presentation to consume at its
own pace via `core/Presentation.ts`'s `PresentationQueue`. Proven, not just structured that
way: `tests/simulation.test.ts`'s "presentation independence" case runs the same commands
against three different presentation-duration functions and asserts identical simulation state
and events every time.

## ADR-003 - Temporal authority

**Decision**: `roguelike.Scheduler` is the sole authority on logical, turn-based time.

**Status**: Accepted.

**Where**: `roguelike/Scheduler.ts` already supported fractional costs and a documented
tie-break; this pass added `postpone` (delaying an actor other than the current one) and
`toJSON`/`restore` (a deterministic snapshot). `tests/roguelike.test.ts` covers determinism,
edge cases (removal/insertion mid-resolution, zero cost), and snapshot round-tripping.

## ADR-004 - Stable identity

**Decision**: Logical entities are referenced by a stable identifier, not held by reference.

**Status**: Accepted.

**Where**: `core/Entity.ts`'s `EntityRegistry`/`EntityId`. `idOf` is what a game passes as
`Scheduler.toJSON`'s or `SimulationRuntime.snapshot`'s `actorId`, so this composes with
ADR-002/003 without changing either's signature. `tests/entity.test.ts`.

## ADR-005 - Events as output

**Decision**: `GameEvent`s are an ordered output of a transition, not a global bus that drives
rules.

**Status**: Accepted.

**Where**: realised as the generic `Event` type parameter `SimulationRule`/
`SimulationRuntimeRule` already return, documented explicitly in REFERENCE.md's `core` section
alongside `Hook` (a synchronous, mid-calculation modification point - `HookRegistry`) and
`Signal` (a notification with no bearing on any rule), so the three shapes stay distinct by
name, not only by convention. Reviewing `battle.BattleHooks`' mutable-context pattern against
this decision found it already fits the `Hook` role rather than violating it - no refactor was
needed there, only the documentation making the taxonomy explicit.

## ADR-006 - Snapshot boundary

**Decision**: A simulation's logical snapshot is distinct from `core.SaveSystem`'s storage
format.

**Status**: Accepted.

**Where**: `simulation/Runtime.ts`'s `SimulationSnapshot<State>` is plain JSON-safe data (game
state, `SchedulerSnapshot`, the RNG's 4-number state tuple) that `SaveSystem<T>` stores as an
opaque `T`, never the other way around. `tests/simulation.test.ts`'s SaveSystem round-trip case
proves this composition works end to end, not just that the types happen to align.

## ADR-007 - Framework scope

**Decision**: No rule, value, or vocabulary specific to a reference game enters `mwg`.

**Status**: Accepted, and already this project's standing convention (CLAUDE.md's "no code or
media from the reference games" section, predating this document).

**Where**: every primitive added across items 164-166 - `EntityRegistry`, `SimulationRuntime`,
`Scheduler.postpone`/snapshot, `SemanticMessage`, `PresentationQueue`, `Shape2D`/`Node2D`/
`Text2D` - is generic over a game-supplied type parameter and holds no `mwg-pixel-dungeon`
key, name, or numeric value. ROADMAP item 164's own table records what stays game-side
(hunger values, weapon formulas, faction rules) against what generalised into the framework.

## ADR-008 - Semantic messaging

**Decision**: `mwg` provides the semantic-message/localisation model and mechanics; a game
defines its own vocabulary and catalogues.

**Status**: Accepted.

**Where**: `i18n/SemanticMessage.ts` (`SemanticMessage`/`MessageChannel`/`MessageFormatter`/
`createCatalogFormatter`), built on the pre-existing `t()`/`Catalog`/plural/Fluent machinery
rather than a parallel implementation; `i18n/Format.ts` (locale-aware number/date/list
formatting) and `i18n/Validate.ts` (catalog key-diff and structural validation) extend the
same primitive. `mwg` holds no message type name, catalog key, or translated string of its
own anywhere in these files - `tests/i18n.test.ts` exercises all of it through fixture
catalogs the test itself defines.

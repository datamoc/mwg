# MWG: Deep Code and Architecture Review

This is an architecture deep-dive for developers building with `mwg`: not what exists
(that's [REFERENCE.md](https://github.com/datamoc/mwg/blob/main/REFERENCE.md)'s job) or what
it's for (that's `README.md`'s), but how the pieces fit together and why they're shaped the
way they are. Read it once before you structure a non-trivial project, then use it as a map
when you need to decide where new code of your own belongs.

`mwg` is pre-alpha (`0.y.z`): the public API documented in REFERENCE.md and API_REPORT.md is
meant to be stable from 1.0 on, and anything not yet there carries an `@experimental` tag.
Nothing below hides that status behind confident prose; where a design choice is a deliberate
trade-off rather than a finished guarantee, it's said so.

## The constraint that shapes everything: `file://`

A game built with `mwg` is meant to run by double-clicking a local HTML file. No server, no
install step, nothing to download at runtime. That single requirement cascades into most of
the framework's less obvious decisions:

- `fetch()`, XHR, and `<script type="module">` are all blocked from `file://`, and Chrome
  treats even a same-folder `<img>` as cross-origin for WebGL. So every asset a build touches
  is compiled into a `data:` URI ahead of time, not fetched at runtime.
- The standalone library build is a classic IIFE, not ES modules, so it can load from a plain
  `<script>` tag with no bundler at all.
- A build's last step rewrites the bundler's `<script type="module">` entry tag to a classic
  deferred script and inlines the compiled asset data before it, in document order.

If you only take one thing from this document: verify a change by opening the *built* page
from `file://`, not just by trusting a dev server. A feature that only works under Vite's dev
server is not finished.

## Module map and dependency direction

Every module is its own barrel (`import { X } from '@datamoc/mw_games/core'`, or the matching
subpath), plus a root re-export. Two rendering worlds sit side by side over one renderer-free
core, and nothing in that core knows either exists:

```
                     +------------------------------------------+
                     |  core  (renderer-free, imports nothing)   |
                     |  Scene lifecycle, SceneStack, Signal,     |
                     |  Random, Input, SaveSystem, Session        |
                     +------------------------------------------+
                        ^                              ^
                        |                              |
        +---------------+----------------+  +----------+---------------+
        |  two-d  (PixiJS)                |  |  three-d  (Babylon.js,   |
        |  Game, Scene2D, Camera,          |  |  optional, off the root |
        |  TileMap, Sprite2D/Shape2D/      |  |  barrel so a 2D game     |
        |  Text2D facade, ui, stage        |  |  never pays for it)     |
        +----------------------------------+  +--------------------------+

  renderer-free alongside core: i18n, actors, world, battle, simulation,
  roguelike, board, audio, rpg, ai, mwl, assets/paths
```

`core` importing no other module (and no renderer) is what lets the same scene-lifecycle and
save-system code run under a Babylon game as under a Pixi one. This isn't a documentation
claim taken on faith: `tests/renderer-isolation.test.ts` walks the real import graph in both
directions (nothing under `two-d` reaches Babylon, nothing under `three-d` reaches Pixi, no
example names `pixi.js`/`@babylonjs/*` directly) and fails the build if the boundary slips.
`roguelike` adds only `rot-js`; `pixi.js`, `@babylonjs/core`/`@babylonjs/loaders`, and
`@capacitor/core` are all optional peer dependencies rather than installed ones, so a project
brings in exactly the renderer it draws with, no more.

## Execution model

`Game` (`two-d`) owns one Pixi `Application`, a `SceneStack<Scene2D>`, and the frame loop,
which normally runs off Pixi's own ticker. `core.Scene` is lifecycle only
(`create`/`update`/`resize`/`onSuspend`/`onResume`/`destroy`) and owns no display node at all;
`two-d.Scene2D` adds exactly one field, a `stage` container, on top of it. `SceneStack` is
generic over that lifecycle type alone, which is what lets it be reused unchanged on the
Babylon side.

Scene changes go through `switchScene`, which queues a request and drains it at the start of
the *next* frame, so a frame never updates a scene that was just asked to leave. Only the top
of the stack receives `update`, but every scene in the stack still renders, which is what
makes a translucent pause menu over live gameplay work without special-casing it.

`Game.step(dt)` drives exactly one frame synchronously, bypassing the ticker. Reach for it in
headless contexts (tests) and when a backgrounded browser tab has throttled
`requestAnimationFrame` down to a rate that makes a game look frozen for reasons that have
nothing to do with your code.

## Rendering model

`Camera` never moves "the camera": it moves a `world` container under a fixed viewport,
including for rotation, which turns the whole layer once about the view centre rather than
transforming tiles individually. Grid maps render through a chunked `TileMap`, so off-screen
chunks can be culled as a block instead of tile by tile.

Per-sprite additive colour (a poison tint, a hit-flash) needs both a multiply *and* an add in
the same pass, which Pixi's built-in `tint` (multiply only) can't express. `mwg` implements
that as a custom batcher, `ColorTransformBatcher`, extending Pixi's own `Batcher` so the extra
math rides in the same draw call rather than costing a separate filter pass per sprite. This
is also the one place in the entire framework allowed to import Pixi's batcher or shader
internals; nothing else does. You don't opt into any of this by hand: importing `TintedSprite`
(directly, or via `TileMap`/`DialogueStage`/`AnimatedSprite`, all built on it) registers the
colour-transform pipe at module load time, before your own code runs.

## The PixiJS boundary

The design intent (recorded as ADR-001, "a game consumes `mwg`, not PixiJS or Babylon.js
directly, in ordinary use") is a genuine constraint, not a suggestion, and it's enforced the
same way the module boundary is: by a test that scans the real API surface, not by convention.
It has three tiers:

1. **The typed facade** - `Container2D`/`Texture2D`/`Rect`/`TextureRegion`
   (`two-d/render/Types2D.ts`) and `Node2D`/`Shape2D`/`Text2D`/`Sprite2D`/`TiledSprite`/
   `Gradient` (`two-d/render/Shape2D.ts`). Ordinary sprites, shapes, text, and containers all
   go through here, and none of it requires your code to name `pixi.js` anywhere, in a type
   position or a value position.
2. **One documented escape hatch** - `two-d/pixi-interop.ts`, published at
   `@datamoc/mw_games/two-d/pixi-interop`, a small, explicit re-export of the handful of Pixi
   symbols the facade doesn't (yet) cover. If you genuinely need a Pixi capability the facade
   doesn't expose, this is where that dependency belongs, confined to as few files in your own
   project as you can manage, the same discipline `mwg` holds `ColorTransformBatcher.ts` to
   internally.
3. **`pixi.js` itself is an optional peer dependency**, not a direct one. A project that never
   touches the escape hatch never installs Pixi's actual package; only code that imports
   `pixi-interop` does.

Why go to this trouble: it's what makes the Babylon path (`three-d`) possible as more than a
parallel rewrite, and it's what keeps a 2D-only project from paying for a 3D engine it never
loads, or vice versa. Prefer the facade by default. Reach for the escape hatch deliberately,
not reflexively, and keep that usage visible and narrow rather than scattered through your
rendering code.

## Simulation and time

Two renderer-free authorities sit underneath both rendering paths:

- **`roguelike.Scheduler`** is the sole authority on logical, turn-based time (ADR-003):
  energy-cost ordering, fractional costs, a documented tie-break, `postpone` for delaying an
  actor other than the current one, and a deterministic `toJSON`/`restore` snapshot.
- **`simulation.SimulationRuntime`** is renderer-free and transactional (ADR-002): a command
  produces its complete logical result, and charges the scheduler, synchronously, *before* any
  presentation plays. `core.Presentation`'s `PresentationQueue` then lets rendering consume the
  resulting events at its own pace, decoupled from when the logic actually happened. This is
  proven, not just structured that way: running the same commands against three different
  presentation-duration functions produces identical simulation state and events every time.

A simulation's logical snapshot is deliberately a different thing from `core.SaveSystem`'s
storage format (ADR-006): `SimulationSnapshot<State>` is plain JSON-safe data that `SaveSystem`
stores as an opaque payload, never the reverse. Compose the two rather than reinventing either.

## Entity identity and "something happened"

Logical entities are referenced by a stable id, not held by object reference (ADR-004,
`core.Entity`'s `EntityRegistry`). That id is what you pass into `Scheduler.toJSON`'s or
`SimulationRuntime.snapshot`'s `actorId`, so identity composes cleanly with both authorities
above without either needing to know about the other.

Three distinct shapes exist for "something happened," on purpose, so one word doesn't have to
mean three things depending on context (ADR-005):

- **`GameEvent`** - an ordered *output* of a transition. Something a rule produced, never
  something a global bus dispatches to drive other rules.
- **`Hook`** (`HookRegistry`) - a synchronous, mid-calculation modification point.
- **`Signal`** - a plain notification with no bearing on any rule at all.

## Persistence

`core.SaveSystem` gives named, versioned save slots over `localStorage`, with an in-memory
fallback where storage isn't available, scoped deliberately to plain JSON-serialisable state
rather than arbitrary object graphs. The API draws a real line between two kinds of input:
`load()` trusts data this same process already wrote, while `importSlot`/`importExternal` are
the path for anything that crossed a device or a network boundary, and validate size and
content before accepting it. Follow that same split in your own save-adjacent code: trust what
your own process just wrote, validate anything a player pastes in, syncs from elsewhere, or
receives from a server, and don't assume "it's valid JSON" already means "it's valid data."

`Session` reuses the same storage abstraction for exactly one counter, how many times a game
has launched, so a native wrapper can decide when to ask for a rating. `mwg` counts; it never
prompts on its own.

## Assets

`assets/paths.ts` resolves a path with no renderer in reach at all, which is what lets `two-d`
and `three-d` share one compiled-asset map. `assets/loader.ts` is the half that actually needs
Pixi. In development, paths are served normally; in a compiled build, resolution looks paths up
in a global asset map that the build's own compile step populates. Call `load(paths)` once per
scene; everything after that is meant to be synchronous, so don't scatter `await` through
per-frame or per-action code. `load` also accepts an `optional` path list with a per-path
`onMissing` callback, so one missing decal doesn't have to abort an otherwise-successful batch.

## Framework scope discipline

Two decisions worth understanding even though they don't change any API you call directly,
because they set correct expectations for whether `mwg` will fit *your* game:

- **No rule, value, or vocabulary specific to any one reference game lives in `mwg`** (ADR-007).
  Every primitive is generic over a game-supplied type parameter; hunger values, weapon
  formulas, faction rules, and the like stay in the game that needs them. If you come to `mwg`
  from studying one of its reference games (Shattered Pixel Dungeon, ADOM, RPG Maker-style
  projects, and others README.md names as capability targets), expect the mechanic's *shape*
  to be there and the specific numbers not to be.
- **`mwg` provides the mechanism for semantic messaging and localisation; your game supplies
  the vocabulary** (ADR-008). `i18n.SemanticMessage`/`MessageChannel`/`MessageFormatter` build
  on the existing catalog/plural/Fluent machinery; `mwg` holds no message type name, catalog
  key, or translated string of its own anywhere in that path.

In practice this means `mwg` will feel intentionally unopinionated about *what* your game says
and *how much* damage a sword does, while still being opinionated about *how* time, identity,
events, and persistence work underneath it.

## Extension points

`GameOptions.extensions` takes an array of registration functions, run once before Pixi's
`app.init()` builds the renderer, for registering *your own* Pixi extension the same way `mwg`
registers its colour-transform pipe internally. You won't need this for ordinary rendering
work; it exists specifically for the case where your game needs its own custom Pixi-level
behaviour alongside what `mwg` already provides.

## Testing and verification philosophy

`mwg`'s own test suite runs directly under Node's built-in test runner against `.ts` sources,
no test framework, which is a stated feature, not an accident: the dependency list staying
short is treated as part of the product. Worth adopting the same discipline in your own tests
where it fits.

Typechecking and unit tests verify correctness, not what a player actually sees. A window
placed off-screen or choices rendered over text will not show up in `npm run check` or a green
test suite; building an example and actually looking at it will. If you can't visually verify a
UI change yourself, say so explicitly rather than reporting it done.

## Status and where to go next

- **REFERENCE.md** - the API index: every export, one line each, plus the generated
  parameter-level documentation.
- **The example games** (colour-transform, interface, dialogue/stage, roguelike dungeon) -
  working, buildable, `file://`-verified starting points; closer to how to structure a real
  project than any written description can be.
- **`MWG: Best Practices.md`** - the companion to this document: concrete guidance for
  structuring a new project well from day one, rather than how the framework itself is built.
- **ROADMAP.md and ADR.md** (on the project's GitHub) - the full, numbered build history and
  the reasoning behind the architectural decisions summarised above, for anyone who wants the
  complete record rather than the digest.

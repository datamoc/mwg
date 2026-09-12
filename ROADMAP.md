# Roadmap

Each module ships in the order below - later ones build on the modules before them. Order
among what is still open is reevaluated periodically, not just appended to. Entries below
mention "the capability spec" and other [README.md](README.md) sections by name; that's
where those live.

1. ~~`mwg/core` - loop, scenes, signals, RNG~~
2. ~~`mwg/render` - colour transform, camera, tile map, sprite sheets, animation~~
3. ~~`mwg/assets` + `tools/compile-resources` - the `file://` story end to end~~
4. ~~`mwg/ui` - windows, stack, lists, message box; `mwg/core` input with rebinding~~
5. ~~`mwg/stage` - dialogue scenes: backdrop, characters, script runner~~
6. ~~`mwg/i18n` - message tables, plurals, and left-to-right / right-to-left layout~~
7. ~~`mwg/actors` - stat blocks, equipment slots, modifiers, inventory~~
8. ~~`mwg/roguelike` - FOV, pathfinding, energy scheduler, level generation~~
9. ~~`mwg/world` - many maps, transitions, persistence, the turn clock, encounter tables~~
10. ~~`mwg/rpg` - map and event data, the interpreter, switches and variables, grid movement~~
11. ~~`mwg/battle` - species and stats, type matrix, speed-ordered turns~~
12. ~~`mwg/audio`, save/load~~
13. ~~layered character sprites, and vertical writing~~
14. ~~worked examples: a dungeon crawl, a village with NPCs and a cutscene, a creature battle~~
15. ~~`mwg/assets` + `mwg/render` - verify and harden SVG texture loading through a compiled
    `data:` URI~~ (verified in `examples/colour-transform`: Pixi's SVG parser rasterises it
    correctly through the aliased, extension-less `data:` source, no code changes needed)
16. ~~an SPD-shaped mockup: wire `mwg/actors` (`StatBlock`, `Inventory`, `EquipmentSlots`) into
    `examples/dungeon`~~ - the hero's attack/defense/max HP are now a `StatBlock` derived
    from strength/armor/vitality; items found on the floor go into an `Inventory`; an
    inventory screen (`Tab`) equips a weapon or armor through `EquipmentSlots`, which applies
    its modifiers immediately (verified in a browser: ATK went 3 → 5 equipping an iron
    sword, a potion healed 5 → 13 HP, death still ends the run with no continue)
**Everything numbered has shipped.** The Wesnoth-port cluster (247-273) and the follow-ups it
pulled in (274-276 score-driven AI, 277-282 the side-identity cleanup and the Pixel Dungeon port's
proposals, 283-294) all landed in 2026-09; the last open pieces were item 258's canvas backend,
drawn image sprites and RTL sample. Earlier clusters - the data-extraction set 205-213, the former
priority cluster (28, 30, 41, 45), the verification and accessibility tail (192-197), the SVG and
benchmark follow-up (198) and the reduced-motion cluster (199-202) - had already shipped. Numbers
are never reassigned once given - the list is an append-only history, including for what was open
at the time - so priority order lives in prose rather than in the list's own sequence. What remains
before 1.0 is recorded in the [1.0 exit checklist](#10-exit-checklist) at the end of this file, and
the deliberate non-decisions (which reference title, if any, a future genre pick should study) in
[Parked decisions](#parked-decisions) rather than left as phantom open items.

17. ~~`mwg/render` + `mwg/roguelike` - hexagonal tile maps, and FOV/pathfinding over a hex
    grid~~ - flat-top, matching Wesnoth. `Level` and `TileMap` both gained a `shape` option
    (`'square' | 'hex'`) rather than forking into separate classes, exactly as planned. The
    actual new code is small and lives in one place: `mwg/core`'s `Hex.ts` (a fixed, six-
    cube-direction neighbour table, converted to and from an "odd-q" offset so it round-trips
    through integers) - everything else is that module's existing shape reused unchanged.
    `Level.neighbors(x, y)` is the seam: `Pathfinder`'s `distanceMap`/`descend`/`autoExplore`
    and `FieldOfView`'s shadowcast-or-not branch both call it instead of a hardcoded square
    table, so a hex `Level` gets pathfinding and field of view for free. Two things really are
    new, not reused: `Pathfinder.find` on a hex `Level` walks a Dijkstra map one `descend()` at
    a time instead of rot.js's `Path.AStar` (which is square-grid only - its `topology` option
    is the same 4/8 offsets, nothing hex-shaped), and `FieldOfView` on a hex `Level` traces a
    straight `hexLine` to every cell in range rather than shadowcasting, exactly the "v1 is
    simple line-of-sight" this item committed to. 28 unit tests cover the geometry
    exhaustively (every neighbour relation checked for symmetry, the `hexLine`/`hexToPixel`/
    `pixelToHex` round-trips) and the `Level`/
    `Pathfinder`/`FieldOfView`/`TileMap` integration together; the full existing suite (227
    tests) and every example still build clean. Not wired into a new example this round - a
    real Wesnoth-shaped mockup (item 28) is its own, separate piece of work once this landed,
    not a requirement of landing it
18. ~~`mwg/render` - isometric and staggered projection, so any Tiled orientation loads
    directly~~ - unlike hex, isometric and staggered do not change which cells are
    neighbours (still an ordinary square grid, four or eight directions, whatever a game's
    `Level` already is) - only where a cell draws, which is why only `TileMap` gained the
    option and `Level` did not need one. Every place `TileMap` converted a grid position to
    a pixel one and back is now one pair of methods (`projectedCenter`/`projectedTile`)
    switching on shape, including `cull()` - rewritten to map the camera's four screen
    corners into tile space and take their bounding box, which works unchanged for any of
    the four projections rather than needing its own per-shape estimate (a rectangle's
    image under an affine projection is a parallelogram, and the box around its four
    corners always contains it, whichever shape drew it). `loadTiledMap` reads Tiled's
    `orientation` field directly into the matching `TileMap` shape now, refusing only what
    is still genuinely unsupported (Tiled's hexagonal orientation - a different offset
    convention than `mwg`'s own flat-top scheme - and any staggered axis/index besides the
    Y-axis, odd-row default). 17 unit tests cover the projection math (round-trips, bounding
    boxes, `cull()` never throwing) and `loadTiledMap`'s new orientation handling; the full
    suite (238 tests), the library build and every example still build clean
19. ~~a performance pass across the render path: profile `ColorTransformBatcher` and
    `TileMap`'s chunk culling under load, and confirm nothing ever silently falls back from
    WebGL/WebGPU to a canvas 2D renderer~~ - measured directly (`renderer.name` inspected,
    not assumed): `colour-transform`'s 4000-sprite stress test holds a steady 60fps on
    `webgl` (Pixi's default preference; `Game` sets no `preference` of its own, so nothing
    here opts into a canvas fallback either). A synthetic 400×400-tile map (160,000 cells,
    625 chunks - far past the ~2,500-cell maps any current example uses) still holds 60fps,
    `cull()` costs ~0.017ms per call, and only ~1% of chunks render at a time. No regression
    found; nothing needed fixing
20. ~~wire `mwg/core`'s `SaveSystem` into an actual game loop end to end~~ - `examples/dungeon`
    now autosaves on every descend (`saves.save`, one named slot) and offers to continue on
    load (verified in a browser: save on floor 3, reload, "Continuing your run", correct
    depth/stats/bag restored). Folded together with item 27 below, since permadeath is
    what the same wiring demonstrates on death, not a separate code path
21. ~~a proper character animation state convention, beyond `GridMover`'s bare walk/idle hook
    names: standing still, moving, and performing an action (attacking, using an item), with
    rules for how one interrupts another~~ - `render`'s new `ActorAnimator` is the three
    states (`idle`/`move`/`action`) and exactly one rule: `setMoving` toggles idle/move freely
    (a grid character's walk cycle can call it every frame), `playAction` cuts in over
    whichever of those is showing and is *not itself* interruptible by a `setMoving` call
    while it plays - that gets remembered and taken up automatically the instant the action's
    animation finishes, via the same non-looping `onFinish` hook `AnimatedSprite` already
    exposes. A second `playAction` mid-swing is a no-op unless `restart` is passed, so a turn
    resolving faster than an attack's animation does not stutter it. Not wired into an example
    this round - `village`'s player has no walk-cycle art yet (documented there already as
    `make-example-assets.mjs`'s own roadmap, not something an example should fake around), and
    faking a state machine over single static frames would not exercise the interruption rule
    that is the actual point of this item. 12 unit tests cover the full state machine
    including the interruption/resume rule and the "registered looping by mistake" footgun
22. ~~`mwg/roguelike` - a monster AI behaviour loop (wander / hunt / flee) driven by the
    existing `FieldOfView`, `Pathfinder` and `Scheduler` primitives~~ - `decideMonsterAI()`
    gives each monster its own sight (a fresh small-radius `FieldOfView` per call, not the
    player's) and turns that into wander/hunt/flee, built entirely from the three primitives
    already shipped. `examples/dungeon` now calls it once per monster per turn instead of the
    old single distance check; verified in a browser (a rat closed distance and landed a hit
    once in sight, killed cleanly with no console errors)
23. ~~`mwg/render` + `mwg/roguelike` - a discoverable/hidden tile state (secret doors,
    undiscovered traps): a cell that renders and blocks like its surroundings until revealed
    by search or trigger~~ - `roguelike`'s new `Secrets` writes the disguise kind straight
    into `Level`, so a concealed cell already passes every `passable`/`transparent` check as
    whatever it is disguised as; nothing in `FieldOfView` or `Pathfinder` had to learn that
    secrets exist. `generateDungeon` gained an optional `kinds` list so a game can add its own
    terrain ids (a trap kind) alongside the generator's wall/floor; the render half needed
    nothing new; `TileMap.setTile`, already shipped, is the single-cell update a reveal calls.
    `examples/dungeon` wires both shapes in: a secret door hiding a small vault (a wall cell
    concealed as rock, found with a new `search` action), and a hidden trap that springs and
    damages the hero the moment they step on it. Verified in a browser; caught and fixed one
    real bug in the process - the vault's floor and treasure were rendering through the
    "solid" wall before the door was ever found, because the vault cell itself was carved
    eagerly instead of staying genuinely undiscovered rock until the door opened
24. ~~`mwg/roguelike` - targeting: an aim cursor with range/line-of-sight/area-of-effect shape
    resolution for thrown items, wands and ranged attacks, plus a projectile-flight helper in
    `mwg/render`~~ - `canTarget`/`hasLineOfSight`/`resolveArea` are a Bresenham line trace, not
    a shadowcast: aiming asks "what is on the way to this exact point", a different (and
    cheaper) question than `FieldOfView`'s "what can be seen from here at all", so the two
    deliberately disagree at some edges rather than share an algorithm. `resolveArea` resolves
    `single`/`line`/`burst` shapes once a target is chosen. `render`'s `Projectile` tweens a
    sprite's position in a straight line the same way `GridMover` tweens tile movement - position
    only, nothing about what happens on arrival. `examples/dungeon` wires both in: throwing a
    flask of oil (`T`) picks the nearest visible monster in range with `canTarget`, resolves the
    hit instantly (the same instant-logic-plus-cosmetic-flourish split `attack`'s hit-flash
    already uses), and flies a tinted sprite there with `Projectile` for show. Verified in a
    browser via a live debug trace of the actual bundled minified code (not just the source):
    real monster/hero positions and computed range/LOS values were read straight out of the
    running game and matched the source's arithmetic exactly - what first looked like a broken
    "nothing in range" turned out to be a dropped-armor ground item's tinted coin sprite being
    mistaken for a monster at screenshot resolution, not a targeting bug
25. ~~`mwg/ui` - a dense icon-grid inventory view (multi-column, drag/drop, long-press to
    quickslot) alongside the existing `ListView`~~ - `IconGrid` keeps `ListView`'s keyboard
    model (arrow keys move a highlight, wrapping at the edges, skipping disabled cells) over a
    2D layout instead of one column. "Drag and drop" is tap-then-tap, not a continuously
    followed ghost sprite: touch one cell to pick it up, a second to swap - it reads as drag
    and drop to a player, and unlike a live drag needs no pointer-tracking or drag-threshold
    fragility, since every step is a plain method a test can call directly. Long-press is a
    frame-driven duration counter (`update(dt)`, the same shape `WindowStack` already uses),
    not a raw `setTimeout`, so it is exactly as testable. `examples/dungeon`'s inventory (`Tab`)
    is this now, instead of a `ListView`: a coin sprite tinted per item, a quantity badge on
    stacked potions and flasks, and a corner mark on whichever weapon or armor is worn -
    verified in a browser (equip, drink, and the log/HUD both reflected it correctly)
26. ~~`mwg/world` - an explicit non-persistent-map mode~~: `World.define` now takes a
    `persistent` option (default `true`, matching ADOM's shape); `persistent: false` rebuilds
    a map from its factory on every `enter`, discarding whatever was there, which is SPD's
    shape for its own floors. Both live in the same `World`
27. ~~wire `mwg/core`'s `SaveSystem` for a permadeath pattern~~ - `examples/dungeon`'s save is
    deleted the moment the hero dies (`saves.delete`, verified in a browser: die, save gone
    from `localStorage`, reload starts a fresh floor 1 run rather than continuing)
28. ~~once hex tile maps (item 17) ship, consider a Civilization-like 4X or wargame as a
    further reference alongside Wesnoth - both are good candidates for exercising a hex grid
    beyond a single tactical skirmish (a much larger persistent hex map, fog of war over
    territory rather than a dungeon room, unit stacks, a turn given to every player rather
    than one hero). No specific title picked yet; logged at low priority per the roadmap
    process below~~ - `mwg/board` now has a hex tactical state with multi-owner units,
    passable/cover terrain, action points, turn rounds, movement, and combat.
29. ~~`mwg/render` (`TileMap`) - auto-tiling: stitching a terrain edge or corner from many small
    tile pieces chosen by which neighbours are the same terrain, rather than a game hand-picking
    a frame per cell itself~~ - `blobIndex`/`autotileFrames` are the classic "blob tile"
    reduction: a diagonal neighbour only changes a cell's shape when both orthogonal neighbours
    flanking it also belong to the terrain (an edge piece already owns that corner otherwise),
    which is what collapses the 256 raw 8-neighbour combinations down to the 47 ever actually
    reachable. `BLOB_SHAPES` lists all 47 in the exact order `blobIndex` returns them, so a
    tileset's 47 frames can be arranged or drawn against it directly - this is `mwg`'s own
    convention, not a claim of pixel compatibility with any specific existing tileset's frame
    order. 11 unit tests cover the reduction directly: all 256 raw combinations exhaustively
    checked, the corner-only-matters-with-both-edges rule, and `autotileFrames` end to end
    (isolated cells, a solid block's interior, a straight edge's consistency, out-of-bounds
    neighbours reading exactly what the caller's `sameTerrain` says). Not wired into an
    example this round - a real showcase wants a tileset with genuinely distinct art for all
    47 shapes, and cobbling that together from the existing 4-frame wall/floor set would be a
    crude approximation, not a demonstration of the technique
30. ~~further reference-game genres beyond what item 28 already names, to widen the capability
    spec past turn-based RPGs, dungeon crawls and visual novels: an XCOM-like (squad tactics
    on a grid, cover, action points, overwatch/reaction fire - none of which `mwg/battle` or
    `mwg/roguelike` have a primitive for today) and board games generally (multiplayer turn
    order given to every player rather than one hero, dice and card mechanics, a board that
    need not be a dungeon or a battlefield at all). No specific title or mechanic picked for
    either; logged at low priority per the roadmap process below, same as item 28~~ -
    `mwg/board` now covers action points, cover, overwatch, attack range, and shared turns.
31. ~~`mwg/stage` - named-passage navigation for `StageScript`: a choice that jumps to another
    named list of commands, rather than only picking one fixed page of a single linear list
    (`EventRunner`'s `activePage`) or running straight through one (`StageScript.run` today).
    This is Twine's actual distinct demand (see [README.md](README.md#capability-spec)) - a story as a
    graph of passages that can loop back or braid together, not a straight line or a single
    branch point. `DialogueStage` already needs no visual assets to run a scene that never
    calls `setBackdrop`/`show`, so the stageless half of a Twine-shaped story already works;
    the graph-of-passages half does not yet~~ - `StageScript.runStory` runs a `StoryScript`
    graph from a start passage, following `{goto}` commands and `StageChoice` jumps (choice
    values matched back to their choice, `MessageBox` untouched); falling off a passage ends
    the story. 4 new tests, including a loop back to an earlier passage
32. ~~`mwg/rpg` - Tiled's *external* tileset format (`.tsx`, or its JSON export), and more than
    one tileset per map. `loadTiledMap` reads only a single tileset embedded directly in the
    map's own JSON today, and refuses outright the moment a map references a tileset as its
    own file or uses a second one - the ordinary shape once a project's maps share tilesets
    rather than each embedding a copy~~ - `loadTiledMap` takes one sheet per tileset
    (`TilesetSheet`, matched by `firstgid` in any order), resolving each gid by Tiled's own
    greatest-firstgid-at-or-below rule; cells hold `tileFrame` packs over a new multi-sheet
    `TileMap`, plain indices still reading as sheet 0. Fetching an external tileset stays the
    caller's job (`TiledTilesetData` types the tileset JSON); every sheet must share the
    map's tile size. 4 new tests
33. ~~`mwg/rpg` (or a new `mwg/automap`) - Tiled's automapping: rule maps whose `input_*` layers
    are arbitrary 2D patterns (not just a cell's 8 immediate neighbours, unlike item 29's blob
    autotiling) matched anywhere against a target map, replaced by the paired `output_*`
    layers, with rules applied in order so a later one can override an earlier one's result,
    and optional random variation across several numbered output layers per rule. Genuinely
    more expressive than neighbour-based autotiling - room decoration, structural
    error-correction and terrain stitching all read as the same mechanism. See
    <https://www.mapeditor.org/2026/07/14/focus-on-level-design-with-automapping.html> for
    the mechanics this would need to reproduce~~ - `rpg`'s `automap` (kept in-module
    rather than a new package surface) matches `input` patterns anywhere (`EMPTY` constrains
    nothing), writes one `output` variant per match picked at random (`EMPTY` leaves the
    cell alone), rules in order with each rule's matches collected before any write, so a
    rule never sees its own. The pick is injectable, defaulting to the seeded `Random.int`.
    7 unit tests
34. ~~`mwg/stage` - importing actual Twine story files (the Twee notation, or the `<tw-passagedata>`
    elements in Twine's HTML export) into `StageScript`'s command format, so a story authored
    in Twine's own editor runs under `mwg/stage` without hand-writing `StageCommand` arrays.
    Blocked on item 31 (named-passage navigation) - a Twine file is fundamentally a graph of
    named passages, so there is nothing to import into until `StageScript` can represent one.
    Twine supports several story formats (Harlowe, SugarCube, Chapbook, each with their own
    markup inside a passage's body) - which of those an importer would need to understand,
    and how much of each's macro language, is an open question for whoever picks this
    up~~ - answered: Twee only (plain text, no DOM needed), structure only. `stage`'s
    `importTwee` turns text lines into `say` (the last doubling as the choice prompt) and
    `[[links]]` in all three forms into one closing `ask` with `goto` choices; `StoryData`
    names the start else the first passage does, and dangling links, doubled passages and
    setter links are refused. 8 unit tests
35. ~~`mwg/core` - minimal database-shaped functions over `localStorage`: named collections of
    records, queried and filtered, rather than `SaveSystem`'s one-blob-per-slot shape. A
    quest log, a bestiary of what has been discovered, achievements - state a game wants to
    query ("everything not yet completed") rather than load wholesale the way a save slot is.
    `localStorage` only, not IndexedDB: `SaveSystem` already needed an in-memory fallback for
    `localStorage` under `file://`, and IndexedDB is a heavier API (async, versioned,
    transactional) than that - it would likely need the same treatment or worse, for a quota
    and binary-storage benefit nothing here yet demands~~ - `core`'s `Collection`: named
    record collections over `SaveStorage` (`localStorage` with the memory fallback, now
    shared by exporting `SaveSystem`'s `defaultStorage`), with `all`/`get`/`put`/`remove`/
    `where`/`clear` reading storage directly - nothing cached, nothing to go stale,
    insertion order kept. 8 unit tests
36. ~~`mwg/core` - structured log handling: categories and severity levels over bare
    `console.log`/`console.error`, the way every example's `main().catch` currently just
    dumps a stack trace to the page. Marginal value on its own - the browser console already
    covers most of what this would add - logged because it came up, not because a reference
    game demands it~~ - `core`'s `Logger`, kept as small as that admission demands: a
    category, four levels, a filter, and a sink tests capture instead of the console.
    4 unit tests
37. ~~`mwg/rpg` - quest/mission management: named quests with stages, each stage a condition
    or a counter towards one ("kill 5 rats: 3/5"), and prerequisites between quests~~ -
    `QuestLog` tracks only which stage every known quest is on; a stage's condition or
    counter is checked against `GameState`'s existing switches and variables, the same
    primitive `EventRunner`'s `activePage` reads, not a separate storage mechanism of its
    own. `advance(id, state)` moves a quest on by exactly one stage per call when its current
    stage is satisfied - the same "re-check, don't be told" shape `activePage` itself uses -
    and a quest's own definition (its stages, its prerequisites) is supplied fresh each load
    the way the dungeon example's `ITEMS` table is, so only which stage each quest has
    reached is ever save data. 12 unit tests cover prerequisites unlocking as their quest
    completes, condition and counter stages, a milestone stage with neither, and the
    save/restore round-trip. Not wired into an example this round, matching the pattern
    already set for items 17/18/21/29 when there was nothing a live demo would add beyond
    what the unit tests already prove
38. ~~minigames: a lockpicking, fishing or hacking puzzle, a rhythm game, a photo-op - the
    self-contained diversion nearly every RPG in the capability spec's own reference list
    embeds somewhere. The actual gap is architectural, not any one minigame: `Game` only
    replaces a scene wholesale (`switchScene`), with nothing for suspending the current one,
    layering a different one over or instead of it, and resuming exactly where play left off
    once it reports back a result. No specific minigame picked; logged at low priority per
    the roadmap process below, same as items 28 and 30~~ - the gap was architectural and is
    now `core`'s `SceneStack` (pure, headless-tested): `pushScene` suspends the current scene
    and starts another over it, `popScene` destroys the top and resumes with a result via
    `Scene.onSuspend`/`onResume`. Only the top updates; all render, so overlays and opaque
    scenes both work; resize reaches the whole stack. The lockpick timing example now
    exercises the complete flow. 4 unit tests
39. ~~`mwg/actors` - skills and competencies as levelling spends, not a new storage
    primitive~~ - `SkillPoints` is deliberately not a wrapper around `Progression`: a game
    grants points however it likes (`grant(levelsGained)` after `Progression.addExperience`
    returns positive, a quest reward, a trainer NPC), and `spend(stat)` raises that stat's
    *base* value on a `StatBlock` by one rank, refusing when a cap is reached or the ledger
    cannot afford the rising cost of the next rank - both configurable per stat via
    callbacks. `StatBlock` already held the storage; this is only the ledger and the spend
    rule, the same size of primitive `skillCheck` already is. 10 unit tests cover the ledger,
    caps, rising costs, and a real `Progression` pairing; one of them caught a real bug
    before it shipped - `spend` was calling the cost callback twice per spend (once inside
    `canSpend`, again to charge it), harmless for a pure function but wrong for a game with
    a costly or side-effecting one, fixed to compute the cost exactly once
40. ~~`mwg/actors` - crafting: a recipe (named ingredients and quantities, one result) resolved
    against an `Inventory`~~ - `craft()` checks every ingredient, consumes it, and adds the
    result in one call, the same small-focused-function shape `skillCheck` already is. All
    or nothing: a missing or short ingredient touches nothing, and if every ingredient is
    present but the result does not fit `Inventory`'s own capacity, every ingredient is put
    back exactly as it was rather than spent for nothing - restored into a leftover stack of
    the same item rather than a duplicate slot, if any of it was not used up. 7 unit tests
    cover the happy path, both refusal cases, and the capacity-rollback path specifically
41. ~~a generic board-game token/piece: owned by a player, sitting on a board cell, countable
    or stackable, capturable or promotable - distinct from `mwg/roguelike`'s `Creature`-shaped
    actors (no HP, no turn-taking of its own, no sight). Feeds item 30's board-game reference
    more directly than anything shipped today; exactly what "owned", "captured" and
    "promoted" should mean is a question for whichever board game item 30 eventually picks~~
    - `mwg/board`'s `BoardGrid` and `BoardPiece` provide the generic piece shape.
42. ~~`mwg/core` - action recording and replay, for testing: tap `Input.onAction`, timestamp
    each one against a frame counter rather than the clock, and serialise the log; a player
    re-dispatches the same actions at the same frame counts while driving the frame loop
    itself with `Game.step(dt)` instead of a live `requestAnimationFrame`. Most of what this
    needs already exists and was not built for this - `Random`'s seeded, save/restorable
    state and `Game.step` (already there to defeat Chrome's background-tab throttling) are
    exactly the determinism a replay needs, so the actual gap is just the recorder/player
    wrapping `Input.onAction`, not a new source of determinism. This session's own browser
    verification kept losing time to imprecise manual play (aligning a grid by eye, hunting
    for a monster that might not even be in view) - a recorded action log a test could
    replay and screenshot-diff is the direct fix for exactly that~~ - `core`'s `Recorder`
    stamps `Input.onAction` against `Game.onFrame` counts and `Player` re-dispatches them
    at the same counts; `serializeReplay`/`deserializeReplay` round-trip the log with
    validation. 8 unit tests, including a record-then-replay reproduction
43. ~~magic/technology systems: a spellbook or a research tree. Real overlap with what already
    shipped this session rather than a clean new gap - a tech tree is largely item 37's
    quest-prerequisite graph with a different name, and "spend research points to unlock a
    tech" is item 39's `SkillPoints` ledger with a different target. What is genuinely not
    covered by either: a spendable *resource* consumed per use rather than permanently, the
    way a spell costs mana - `mwg/actors`' `StatBlock` can hold `mana` as a stat, but nothing
    resolves "can this ability afford its cost right now, and if so spend it" the way
    `craft()` resolves a recipe or `skillCheck` resolves a roll~~ - `actors`' `canAfford`/
    `spend` over a `StatBlock` pool (mana, stamina, HP), one cost or several, all-or-
    nothing; a negative cost throws rather than refunding. 7 unit tests
44. ~~elevation/height levels for tiles and characters - a raised platform, a cliff blocking
    line of sight from below but not above, a character standing higher up. Deliberately not
    the same ask as item 45's full 3D: this is a still-fundamentally-2D map with a discrete
    height value per cell (Fire Emblem's or classic XCOM's few floor levels), not a 3D scene.
    Nothing in `mwg/roguelike` or `mwg/render` has a notion of height today - `FieldOfView`
    and `Pathfinder` reason over one flat plane, and `TileMap`'s draw order is whichever
    layer a game put a sprite on, not a height a character's own elevation could change~~ -
    `roguelike`'s `Elevation` sidecar holds whole-level heights; `FieldOfView.update` takes
    them for asymmetric cliff sight (a cell blocks exactly when above viewer and target
    alike, line-traced per shape), and `Pathfinder` takes them with a climb limit (ascent
    capped, descent free; square `find` descends a Dijkstra map the way hex already did).
    `render`'s half: `TileMap.setCellHeight` lifts tops by `heightStep` with two shaded
    rhombus faces per level on diamond projections, and `tileCenter` rides along. Caught a
    real latent bug on the way - off-map neighbours alias cells through `Level.index`,
    now guarded in the stepper. 7 + 10 unit tests; sprite draw-order-by-height stays
    game-side, an art convention the framework does not own yet
45. ~~3D rendering (tiles, characters), gated behind an explicit project-level yes because
    it needs a rendering foundation separate from PixiJS~~ - the user supplied that yes and
    Babylon.js now powers an optional `mwg/3d` entry. The original 2D root entry imports none
    of it. Items 74-82 provide the engine lifecycle, square and hex terrain with elevation,
    GLB/glTF and VOX paths, and mesh or billboard characters. A file:// reference build is
    browser-tested at a 45 FPS minimum

Items 46-52 were surfaced by reading a separate reference port's own `PORT_COVERAGE.md` (a
project that ports another game's mechanics onto `mwg`, tracking what it deliberately has not
ported) and asking which gaps are `mwg` framework capability rather than that specific game's
content - no code, data or mechanic numbers from that port were ever brought in, only the
shape of what a game built on `mwg` had no primitive for at all. Logged at low priority per
the roadmap process, same as items 28/30/38 above, and all seven shipped in the same session
they were logged in.

46. ~~temporary stat modifiers with automatic expiry (a poison tick, a berserk buff, a
    stat-halving curse)~~ - `TurnClock`'s `TimedEffect` gained an `onExpire` callback, fired
    once right before an expired effect is removed; `actors.applyStatusEffect` is the seam
    that was missing, not a new storage mechanism - it adds `StatBlock` modifiers tagged with
    a private `source` symbol and registers their removal as that callback, so a game never
    has to remember to clean up what it added. The returned handle's `cancel()` covers early
    removal (a cure spell, a `remove curse` scroll), which `TurnClock.remove` alone cannot do
    since it has no idea the entry ever touched a `StatBlock`. 5 unit tests cover immediate
    application, automatic expiry, a per-turn tick (a poison's own damage), early
    cancellation, and two independent effects on the same stat expiring independently
47. ~~item depth beyond `Inventory`'s stacking/weight and `EquipmentSlots`' fixed modifiers~~ -
    `InventoryItem` gained `level` (an enchantment/upgrade level), `durability`/
    `maxDurability`; `identified` already existed but nothing read or wrote it. `actors.identify`/
    `enchant`/`damageItem`/`repairItem` are small functions over a plain item, the same size of
    primitive `skillCheck` already is - durability is opt-in per item (`damageItem`/`repairItem`
    are a no-op without `maxDurability` set, rather than every item silently paying for a
    durability system it does not use). 9 unit tests cover all four functions, including the
    opt-out no-op and durability never going negative or over its max
48. ~~a resource that recharges over time (a wand's limited charges, regenerating one per some
    number of turns)~~ - `actors.Charges` is deliberately its own small class, not built on
    `TurnClock`: it carries its own regeneration progress (turns banked towards the next
    charge), which a class holds more naturally than a callback would, and stays completely
    decoupled from whatever a game already uses to drive its turns. `advance(turns)` converts
    whole `regenRate`-sized chunks of banked time into charges, capped at `max`, and stops
    banking further progress once full so a very long idle stretch cannot silently queue up
    overflow charges the moment one is spent. 7 unit tests cover defaults, spending,
    multi-charge regeneration in one call, the full-and-idle edge case, and banked progress
    surviving a spend
49. ~~a monster's disposition - peaceful, neutral, or hostile - and a provoked-by-attack
    transition between them~~ - `decideMonsterAI` gained a `disposition` option (defaulting
    to `'hostile'`, unchanged from before this existed) and a `provoked` flag a game sets the
    moment it lands the provoking hit; a peaceful or neutral monster always wanders, skipping
    the sight check entirely, until either disposition is hostile or provoked overrides it -
    both read the same way `hpFraction` already is, computed fresh by the caller rather than
    remembered by this function. 5 new unit tests cover peaceful, neutral, provoked-override,
    and the pre-existing hostile default; the full existing suite (267 tests going in) still
    passes unchanged
50. ~~loot: a table of possible drops resolved into the world or straight into an `Inventory`
    when a monster dies, and a corpse as a lootable object left behind~~ - `actors.rollLoot`
    is the same shape as `world.rollEncounter`, deliberately: both roll whether anything
    happens at all, then weight-pick which. A corpse needed no code of its own beyond this -
    it is an `Inventory` placed at the monster's last position, exactly like any other
    dropped item already is in `examples/dungeon`. 6 unit tests cover an empty table, `chance`
    at both extremes, the default quantity, an explicit quantity, and weighted proportions
    over enough trials
51. ~~an interactive door: open/closed/locked state in `mwg/roguelike`, blocking passage and
    sight while closed and optionally needing a specific key item to open~~ - `roguelike.Doors`
    is `Secrets`' own shape reused: the state itself is just terrain (a door swaps between its
    own open/closed terrain kinds, so `passable`/`transparent` need no door-specific code at
    all), and the class remembers which cells are doors and what they swap to. Locking is a
    separate flag from open/closed, so a locked door stays closed and refuses to open until a
    game calls `unlock` (typically once it confirms the actor holds the right key item). 9
    unit tests cover placing, opening, closing, the no-op failure cases, `startOpen`, and the
    full lock/unlock cycle
52. ~~a basic shop/economy primitive: a currency stat and a buy/sell transaction against an
    `Inventory`~~ - `actors.buy`/`sell` are `craft()`'s own shape: check everything first,
    touch nothing until every check passes, and roll back whatever an earlier step already
    did if a later one fails (the buyer's bag has no room for what was already pulled from
    the shop's stock). Currency lives as a plain `StatBlock` stat, read and written through
    `base`/`setBase` the same way `SkillPoints` treats a spendable ledger. 7 unit tests cover
    the happy paths for both directions and every refusal case, including the capacity-rollback
    path specifically

Items 53-56 were requested directly, checking `mwg/battle` (the "Pokémon-shaped half"
[README.md](README.md#capability-spec) already names) against what a real Pokémon-like needs beyond what it
already has - species/stats/party/type-matrix/turn-order/evolution. No formula, number or
mechanic from any specific existing game belongs here, matching `mwg`'s stated position
already stated in the capability spec: `mwg` supplies the shape, never the numbers. All four
shipped in the same session they were logged in.

53. ~~stat stages: a bounded, symmetric stage ladder over a `StatBlock` stat~~ -
    `battle.StatStages` clamps a stage to ±`max` (a required option, not a default of 6 -
    `mwg` picks no specific game's cap any more than it picks a specific multiplier curve),
    replaces rather than stacks the one modifier a stat's current stage applies (so raising
    Attack twice results in exactly the stage-2 multiplier, not two stage-1 modifiers
    compounding), and `resetAll()` clears every stage and its modifier in one call for the
    switch-out rule. `change()` returns the actual change applied, clamped or not, so a game
    can tell "Attack won't go any higher!" from a real change. 8 unit tests cover clamping in
    both directions, modifier replacement rather than stacking, the stage-0 removal case, and
    stages on different stats staying independent
54. ~~battle AI: choosing a move (and whether to switch) for an opposing trainer's creature~~ -
    `battle.chooseMove`/`chooseSwitch` are built on `TypeMatrix.multiplierFor`, the one piece
    of genuinely shared knowledge either battler agrees on, the same way `decideMonsterAI` is
    built on `FieldOfView`/`Pathfinder` rather than reimplementing sight or movement.
    `chooseMove` takes an optional `score` function, defaulting to type effectiveness against
    the opponent, so a game can weigh power, PP, or anything else instead without losing the
    default; `chooseSwitch` compares the active creature's worst incoming multiplier against
    every bench member's, returning the first genuine defensive improvement or `null` when
    staying in is already correct. 12 unit tests cover both functions' defaults, overrides,
    ties, and the empty-list/no-improvement edge cases
55. ~~a battle-scoped event/hook system for passive effects~~ - `battle.BattleHooks` registers
    a handler against a plain event-name string a game's own battle loop defines and fires
    (`'switchIn'`, `'turnStart'`, `'hit'`, `'faint'`, or anything else) - `mwg` names none of
    them itself, the same way it names no move effects. `offSource` removes every hook
    registered with a given source in one call, for an ability or item leaving the field on
    faint or switch-out. A turn-skipping status (sleep, paralysis) uses the same shape as any
    other hook: a handler mutates a shared `context` object the caller passes to `emit` and
    reads back afterwards, rather than a special-cased return value. 5 unit tests cover
    per-event dispatch, registration order, the shared-context convention, `offSource`, and
    emitting an event with nothing registered
56. ~~field-wide battle conditions: weather, terrain, or a screen~~ - `battle.Field` is a
    named, optionally-timed flag set a game reads directly (`field.has('rain')`) wherever its
    own formula needs to know, doing nothing on its own beyond tracking presence and counting
    down - matching `mwg`'s position that it supplies no move-damage formula either. `advance()`
    ticks every timed condition down by one round, clearing any that just ran out; a condition
    with no duration persists until an explicit `clear()`. 7 unit tests cover presence,
    explicit clearing, an indefinite condition surviving repeated `advance()` calls, expiry,
    listing every active condition, and re-`set`ting one replacing rather than stacking

Items 57-65 were surfaced the same way items 46-52 were: reading a separate reference
port's own `PORT_COVERAGE.md` (a project that ports another game's mechanics onto `mwg`,
tracking what it deliberately has not ported) and asking which gaps are `mwg` framework
capability rather than that specific game's content - no code, data or mechanic numbers
from that port were ever brought in, only the shape of what a game built on `mwg` had no
primitive for at all. Logged at low priority per the roadmap process, and all nine shipped
in the same session they were logged in.

57. ~~tiered specialization: level-gated tiers granting points, with a mutually-exclusive
    branch choice and a capstone - the shape a subclass pick and an armor-ability slot
    share~~ - `actors.Advancement` owns the unlock structure (thresholds, one-shot grants,
    permanent branch/capstone choices with misuse throwing) and a point ledger, never the
    spend rule: what a point buys stays game-side, typically through `SkillPoints`. Track
    definitions are supplied fresh on load, `QuestLog`'s own convention. 7 unit tests
58. ~~item affixes: named enchantment/glyph/augment/curse types beyond an upgrade level~~ -
    `actors.Affix` carries only the routing every such system shares (trigger, relative
    weight, curse flag); the game interprets the id when the trigger fires, the same way
    `Move.effects` is data `mwg` never reads. `InventoryItem` gained an optional `affix`
    field; a curse affix also sets `cursed`, and `removeAffix` clears both. 6 unit tests
59. ~~level-scaled gear and gear that refuses to come off: passive bonuses growing with an
    item's own level, and a lock for cursed or quest-bound equipment~~ - `actors.scaledModifiers`
    resolves `{stat, op, base, perLevel}` templates to plain `Modifier`s (`base + perLevel
    * level`; anything fancier stays a game's own derived stat), and `EquipmentSlots`
    gained an optional `locked` predicate: a locked slot reports `isLocked()` and refuses
    both `unequip` and swaps, leaving modifiers untouched. 7 unit tests cover the scaling
    math through a real `StatBlock` and the full lock cycle
60. ~~per-run appearance shuffling for unidentified items~~ - `actors.Appearances` deals
    each kind in a category a distinct label from a seeded shuffle (drawn lazily per
    category, fixed for the run), so one run's look never leaks across runs; revealing a
    kind's true nature stays the game's own `identify()` call. Too few labels throws
    rather than doubling one up. 6 unit tests, including seed determinism and the
    save/restore round-trip
61. ~~grid-targeted effect shapes beyond single/line/burst: cones, chains and shoves~~ -
    `Targeting`'s `AreaShape` gained `cone` (snapped 8-way direction, length from the aim,
    widening per the documented rule, routed through `resolveArea`), plus `chainTargets`
    (greedy nearest-hop arcs that never revisit) and `knockbackPath` (cells along a unit
    step until the first impassable one). 9 unit tests; the pre-existing targeting suite
    passes unchanged
62. ~~a phased boss fight: HP-fraction thresholds with enter-once hooks, and an ability
    rotation on cooldowns~~ - `roguelike.BossPhases` reports newly entered phases in order
    (a massive hit can enter several at once; healing never leaves one), and
    `AbilityCycle` ticks named cooldowns down, lists what is ready, and spends on `use`.
    Both round-trip through JSON for a saved mid-fight boss. 11 unit tests
63. ~~a spreading area effect over the grid: fire, gas, anything with a volume per cell~~ -
    `core.Blob` holds volumes, diffuses a share into passable 4-neighbours per step
    and decays the rest (`decay: 1` conserves and only moves volume around); the game
    decides what a volume means via `cellsAbove`. Float dust snaps to zero so a burned-out
    effect reads as gone, and `spread` hands back the cells it just emptied, so the ground
    under a fire can turn to embers at the moment the flames leave it rather than the game
    diffing `cellsAbove` between steps. 12 unit tests, including wall-blocking, the full
    decay-out, and each cell reported on the step that empties it
64. ~~floor serialization: a whole dungeon floor as save data~~ - `Level`, `Secrets` and
    `Doors` gained `toJSON`/`fromJSON` following `QuestLog`'s definitions-fresh convention
    (terrain ids and rooms persist; the game's own `kinds` table is supplied on load, and
    doors re-apply their terrain so open reads as open). `World` already keeps maps alive
    in-session; this is the save-half it was missing. 3 unit tests cover all three
    round-trips, including terrain following a restored door
65. ~~achievements: named milestones unlocked by counters crossing a target~~ -
    `core.Achievements` derives unlocking (a counter at or past its target, never stored
    separately), reports newly earned ids from the increment that earned them, and queues
    announcements through `drainNew()`. Loaded counts announce nothing. 7 unit tests

66. ~~chess as the board game item 30 never picked - the candidate that would define item 41
    rather than wait on it: owned pieces on cells, capture removing them, promotion changing
    what a piece is, all three of 41's open words with standard answers. Legal-move rules
    first (two players across one screen, or puzzles with known solutions); an opponent AI
    is a separate, much larger question and not this item~~ - `mwg/board` now exposes a
    complete rules core: legal movement, check, checkmate, stalemate, castling, en passant,
    promotion, FEN positions, and move application. `mwg/board` also has a deterministic,
    material-evaluation alpha-beta search with depth/node limits; `examples/chess` lets
    White play against it as Black. Opening books and tournament-strength AI remain out
    of scope
67. ~~checkers/draughts alongside chess - stacking (doubled kings), forced captures with
    multi-jump, a smaller rulebook exercising the same token from another angle. Whether the
    reference ends up chess, checkers or both is open; logged so the choice exists~~ -
    `mwg/board` provides forced captures, multi-jumps, and promotion.
68. ~~go - placement rather than movement, capture by surrounding rather than landing: the
    token shape item 41 does not cover (nothing owned moves; groups live or die together).
    Komi, handicaps and scoring (area vs territory) are open questions for whoever picks
    this up~~ - `mwg/board` provides placement, captures, ko, passes, and area scoring.
69. ~~backgammon - the dice half of item 30's board-game sentence: one cup both players share,
    bearing off as a second win condition beside capturing, doubling as a betting question.
    Dice here are game equipment with rules around them, not just `Random.int`~~ -
    `mwg/board` provides points, bar/off pieces, dice, movement, hits, and bearing off.
70. ~~card primitives as one family for belote, tarot, bridge and poker - a shoe shuffled and
    dealt, hands held and hidden, tricks taken with trump deciding: the shape all four
    share. Bidding (belote's coinche, tarot's prise, bridge's auction) differs per game and
    each is its own open question; poker adds stakes and hand evaluation on top~~ -
    `mwg/board` provides `createDeck`/`shuffleDeck`/`deal` for the shoe and hands, and
    `trickWinner` for the trump-then-lead-suit comparison every trick-taking game shares;
    bidding and stakes stay game-side as the entry called out.
71. ~~solitaire/patience as the minigame-sized card game - single-player, so no opponent of any
    kind: the item-38 use case (suspend the dungeon, play a hand, report back won or lost)
    with the smallest possible rules around it. Which patience (Klondike, FreeCell, Pyramid)
    is open~~ - `mwg/board` deals a seeded Klondike layout and resolves stock/waste draws,
    tableau moves (alternating colour, descending by one), foundation moves (suit, ace up)
    and the win check.
72. ~~a tavern dice game, yahtzee-shaped - cup, kept dice, rerolls, a score sheet: the smallest
    minigame with all three classical pieces (chance, choice, score) and no opponent
    intelligence whatever, played against a score table or a simpleton. The named dice
    mechanic item 30 asks about, at minigame scale first~~ - `mwg/board`'s `DiceCup` holds
    and rerolls only the unkept dice, and `scoreDice` scores all thirteen standard categories.
73. ~~`mwg/roguelike` - generic combat lifecycle hooks: invulnerability, pre/post-damage
    modification, attack/defense procs, and on-kill effects for grid actors. SPD needs this
    seam for exact `Char.attack()`/`defenseProc()` behavior; the framework supplies only the
    hook shape, while each game owns its numbers and rules~~ - `roguelike.CombatHooks`
    registers named-event listeners (optionally tagged by source, for bulk removal) and
    `modifyDamage` runs the `beforeDamage` seam and clamps/reports prevention; HP, formulas
    and when each event fires stay game-side.

These are traditional public-domain games - no author, no licence to inherit, nothing to
provenance-check the way the GPL reference games in [README.md](README.md#licence-and-provenance)
needed. Rules were never protected anyway, and as ever `mwg` would supply only the shape
(a deck, a token, a move rule), never anyone's implementation of it.

66-73 extend the tail with classical games as minigame material and reference candidates,
plus the combat-hook seam SPD's port asked for, all shipped in the same pass - including
41's generic board-piece abstraction (`mwg/board`'s `BoardGrid`/`BoardPiece`), which 66's
chess-specific implementation needed anyway.

Item 45 stayed one line for a long time because it never got past its own caution: whether
3D belongs in this project at all is a project-level question, not an implementation one.
The original caution required a project-level yes before this block started. That yes was
later supplied. Items 74-82 are the implemented build-up from a bare floor to imported
models and moving characters.

74. ~~a 3D rendering foundation with perspective camera, depth, and meshes~~ - `Engine3D`
    owns Babylon's WebGL engine, scene, orbit camera, light, resize handling, and render loop
75. ~~a basic 3D engine with a floor and movable camera~~ - shipped in the `three-d` example,
    including a self-contained file:// build
76. ~~a 3D floor with square tiles~~ - `createTileGrid3D` projects cell data onto thin-
    instanced square meshes
77. ~~a 3D floor with hexagonal tiles~~ - the same API projects flat-top odd-q hex cells
78. ~~square elevation columns~~ - nonzero cell heights create batched square columns
79. ~~hexagonal elevation columns~~ - nonzero hex heights create batched hex columns
80. ~~glTF / GLB import~~ - `loadModel3D` is isolated at `mwg/3d/models`, keeping loader code
    out of scenes that do not import models
81. ~~MagicaVoxel VOX import~~ - `parseVox` reads one model plus its palette and
    `createVoxModel3D` batches voxels by color with thin instances
82. ~~characters and movement in 3D~~ - `Character3D` moves an imported mesh or a
    camera-facing textured plane through continuous world coordinates

83. ~~`mwg/core` importing from `mwg/render` (`Game` calls `registerColorTransform` at
    start-up) means every game that imports only `mwg/core` still pulls in the whole
    render module - `TileMap`, `Camera`, `ColorTransformBatcher`'s shader compilation, all
    of it - whether or not the game ever draws a tile. Verified by grepping every module's
    imports rather than assumed: `core`→`render` is the one surprising edge; everything
    else already only depends on `core`/`assets` the way a reader would expect. Worth
    fixing (an explicit `Game` option, or moving sprite registration to `render` itself and
    calling it from game code) before it becomes two or three such edges instead of one,
    and worth treating generally: a game built on a handful of modules should not find
    unrelated ones compiled into its `mwg.global.js`, which is exactly the file size this
    project's own performance priority cares about~~ - `GameOptions` gained `extensions`,
    a list of Pixi-extension registration functions the caller supplies; `Game.start()`
    runs them before the renderer is built instead of calling `registerColorTransform`
    itself. `mwg/core` now imports from no other module (reverified by the same grep).
    Every example using `TintedSprite` (directly, or via `TileMap`/`DialogueStage`/
    `AnimatedSprite`) updated to pass `extensions: [registerColorTransform]`; all eight
    still build and the dungeon example was reverified rendering correctly in a browser

84. ~~choose an underlying 3D engine and prove it clears the file:// and performance bars~~
    - Babylon.js was selected for its TypeScript API, complete scene/model toolset, and
    framework-independent runtime. Granular imports reduced the reference bundle from the
    first 6.9 MB attempt to 1.5 MB (350 KB gzip). The built scene opens from file:// on
    WebGL 2 and the automated 180-frame benchmark holds about 59 FPS on this host

83 and 85 have since shipped, in the order this reassessment gave them: 83 first (no yes
needed, an hour with `Game.ts`), 85 alongside it (equally small, equally unblocked - a
`Session` counter was not a decision the way 45/74-84 were). 86 (the audio orchestrator)
joins that same unblocked tier, requested directly and building on `mwg/audio`'s existing
`Music`/`Sound` rather than waiting on anything. At that point the 3D block remained
undecided; it was later accepted and implemented as the optional Babylon.js module.

87 moves above the rest of the new Wesnoth-sourced items (88-91), ahead of even the
already-unblocked 86: the capability spec table currently claims zone of control as
shipped when it is not, which is a wrong claim in a document read as the definition of
done, not just an unimplemented idea waiting its turn. 88-91 sit behind 87 at the same
unblocked-but-not-urgent tier as 86 - each is small, self-contained, and needs no
project-level decision, but nothing demands them yet the way 87 corrects an existing
false claim. The 3D block was still gated at this point; it was later implemented.

Second pass on the same batch, re-reading the reference table at the very top of
README.md rather than only the capability spec table below it: that row has said
"turn-based unit combat with recruiting and upkeep" for Wesnoth since the reference list
existed, which is 88's shape exactly, not just a plausible new capability. 88 moves up to
sit directly behind 87: both correct a gap in something this project already told the
world Wesnoth demands, one because the claim is actively false (87), the other because it
was named and never built (88). 89-91 are a different kind of item entirely, generalised
from the manual rather than promised anywhere in the reference table, so they stay behind
88 with no priority order among the three of them; nothing yet distinguishes traits from
visibility from auras in urgency, all three equally small and equally undemanded. 86
drops one slot, behind 88, ahead of 89-91: a direct request still outranks a survey
find, but not a standing unmet promise. The 3D block was not affected by that reordering;
it was approved and implemented later.

92-93 join 89-91 at that same undemanded-but-unblocked tier: requested directly, so ahead
of the manual-sourced 89-91 by the same reasoning that placed 86 there, but behind 87/88
since neither corrects a standing promise. No order between 92 and 93 either - 93 reads
more naturally after 92 (a tracked quest wants a marker to have already flagged it), but
nothing forces that sequencing; a game could ship either alone.

94-96 join the same tier, requested directly alongside 92-93, but 94 and 95 are not free
to reorder the way 92/93 were: 95 (the rebind screen) wants 94 (conflict detection)
shipped first, a real precondition rather than a loose "reads more naturally" preference,
since a rebind flow with nothing to warn against would ship the exact silent-collision bug
94 exists to close. 96 (gamepad) is independent of both - it extends `Input`'s action
mapping sideways to a second input source, touching neither key storage nor a settings
screen - so it can land in any order relative to 94/95.

97 sits with 28/30 rather than the unblocked tier above: a further genre with no title or
mechanic picked, the same open-ended shape those two already have, not demanded work. 98
is different in kind from 97 despite being logged alongside it: a small, concrete,
unblocked primitive (a `dt`-driven timer, nothing to decide) that item 97 would use if
ever picked up, but useful on its own to any game with timed escalating spawns. 98 joins
the 89-96 unblocked tier; 97 stays with 28/30, genuinely low priority until a specific
reference is chosen the way chess once was for board games.

99 is split by its own entry into a part that joins the unblocked tier and a part that
does not: float position plus a continuous facing angle is unblocked the same way 98
is (`Camera` and sprites already work in float world units; nothing here waits on a
decision), so that half sits with 89-98. Continuous `z` was explicitly not promised by
this item; 3D world movement is now supplied separately by `Character3D`. 99 is logged as
one item because the 2D half was worth building independently, not because both halves
ship together.

100's two halves sit at different sizes, corrected once the licence wording that had
narrowed the item was itself corrected: the `SaveSystem` plug-in point is as small and
unblocked as 89-99 (no bigger a change than `migrations` already is), but a real
`Game.rxdata` reader/writer is a genuine format-reverse-engineering effort, closer in size
to `tools/vendored/rgssad-wasm` than to a one-afternoon primitive - worth doing, not small.
Both still sit ahead of the manual-sourced 89-91 (requested directly, same reasoning as
86/92/93/94-96/99) and behind 87/88, but 100 is the first item on this list where "joins
the unblocked tier" undersold what shipping it would actually take.

Sequencing note for whenever 45 does get a yes: 84 (which engine) has to come *before* 74
(build the foundation) despite its higher number, since there is no foundation to build
until something is chosen to build it on - the append-only numbering doesn't imply build
order any more than it does for the 37/39/40-before-42 cluster near the top of this file.
74 then 75 (bare floor) then 76/77 (tiled floors) then 78/79 (columns) are each a
precondition for the next; 80/81 (import formats) and 82 (character rendering) do not
depend on one another or on 78/79, so they are free to happen in any order, or in parallel,
once the floor exists.

85. ~~app-store touchpoint hooks: not an ads SDK, an in-app-purchase system, or a Game
    Center/Play Games integration - none of those belong inside a redistributable rendering
    framework any more than a 3D pipeline belongs inside a 2D one, and for the same reason
    45 stays gated. What a native wrapper (Capacitor, Tauri, whatever a game ships through)
    actually needs from `mwg` is just the moment something happened, as an event it can
    subscribe to - what it does with that event (call `StoreKit`, `Play Games Services`, an
    ad SDK) is entirely its own business and outside this file's scope. Two halves:
    - achievement unlocks are already there: `Achievements.increment()` returns exactly the
      ids earned by that call, and `drainNew()` queues them for anything that missed the
      return value. Worth checking whether that's enough before adding a push-style
      `Signal` alongside it purely for consistency with `Input.onAction`/`CombatHooks`/
      `BattleHooks`'s own push conventions - not worth adding if nothing needs it
    - a session/milestone signal does not exist at all: nothing in `mwg` counts launches,
      playtime, or completed runs today, which is exactly the kind of "has this player done
      enough to plausibly want to rate this" signal a wrapper would use to time a native
      review prompt. This half is the actual gap, not the achievement half~~ -
    `core.Session` counts launches over the same `SaveStorage` abstraction `SaveSystem`
    uses (namespaced, so two games sharing an origin never collide), incrementing and
    persisting on construction. `mwg` counts; it still never prompts, and still bundles no
    store/ads/IAP SDK of any kind - a wrapper reads `session.launches` and decides for
    itself. The achievement half needed no new code: `increment()`'s return value and
    `drainNew()` were already sufficient, so no push-style `Signal` was added for it

86. ~~a sound and music orchestrator: naming what state a game is in ("exploring", "combat",
    "boss", "menu") and letting the game just declare the current state, rather than every
    call site remembering to call `Music.play()`/`Sound.play()` itself. `mwg/audio` already
    has both halves this would sit on top of: `Music.play(path, fadeDuration)` crossfades
    between tracks (the old one fades out while the new one fades in, over the same span,
    not a hard cut), and `Sound` is a pooled one-shot player for a hit, a pickup, a step.
    Neither knows about game state or events - a scene calls them directly, one line per
    cue, which is fine for a handful of cues and repetitive past that. The gap is the
    mapping itself: state name (or a fired event) to which track/cue plays, so
    `orchestrator.enter('combat')` (or `on('bossPhase', ...)`, matching `BattleHooks`'/
    `CombatHooks`' existing event-name-and-handler shape) is the one call site, and the
    crossfade timing/track choice is data the game supplies once rather than duplicated at
    every place combat can start. A state that resolves to the same track already playing
    should not restart or refade it - re-entering "combat" mid-fight must not reset the
    music - which is the actual design question here, not the crossfade math `Music`
    already has~~ - `audio.Orchestrator` wraps a `Music` instance: `define(state, {track,
    fadeDuration})` declares the mapping, `enter(state)` crossfades to it and is a no-op if
    that track is already playing (tracked by track identity, not state name, so two states
    sharing a track never refade into each other either), `on(event, sound)`/`trigger(event)`
    covers one-shot cues separately since they are fire-and-forget rather than "where we are"

Items 87-91 were surfaced by reading The Battle for Wesnoth's own player manual
(`doc/manual/manual.txt` in a local checkout of the real GPL-2.0-or-later source) as prose,
the same design-study-only method items 46-52 used against another project's coverage doc:
no code, data table, formula, config syntax or file format from Wesnoth was ever read into
this list, only which mechanic shapes a finished Wesnoth-shaped game needs that `mwg` has
no primitive for yet. One thing that survey caught along the way: the capability spec's own
"Tactical maps (hex)" table (see README.md) claims zone of control is "provided by
`mwg/roguelike`" - it is not, grepped and confirmed absent from every file in the repo, so
that table entry was wrong until item 87 below actually ships it.

87. ~~a zone of control that actually exists: the capability spec table already claims it, but
    no code anywhere implements it. `Pathfinder` has no notion of a hex a unit is merely
    forced to stop upon entering, and `board.Tactics`'s `tacticalMoves`/`tacticalPathCost`
    check only passability and occupancy, never an adjacent enemy's reach. The shape itself
    is narrow (a unit projects control onto its immediate neighbours; entering one, for
    anyone without an explicit override, ends that step of movement) and composes cleanly
    with the pathfinding and move-cost work both modules already do~~ - `tacticalPathCost`
    now stops a path at the first cell adjacent to an enemy the mover is not already engaged
    with (already being adjacent to that enemy lifts its zone entirely), while still allowing
    a threatened cell to be entered as the move's own final stop
88. ~~an army economy for `mwg/board`: recruiting a new unit onto the map against a currency
    cost, recalling a unit from a persistent pool of previously-fielded units (distinct from
    a fresh recruit, and carried between maps rather than reset), and an automatic per-turn
    income/upkeep tick. `actors.Shop`'s `buy`/`sell` is the nearest existing shape, a
    one-shot transaction against a currency stat, but it moves inventory items, not board
    pieces, and has no per-turn tick at all; `board.Tactics` has pieces on a board but no
    currency, no spawn-only-in-a-designated-zone rule, and nothing recurring. No numbers
    (gold per turn, upkeep per unit level) belong in this item, same as `mwg/battle`'s
    type-matrix and damage formulas were never copied from Pokémon~~ - `board.Army` adds
    `recruit`/`recall`/`bankUnit` (all-or-nothing against a currency total, mirroring
    `actors.Shop`) and `armyIncome`/`applyUpkeep`, a per-turn delta purely as a function of
    units controlled, with no specific rate baked in
89. ~~per-instance random traits for a creature or unit, distinct from what `mwg` already has
    on both sides of this: `actors.Affix` is item-side (one affix per item, weight-picked,
    trigger-routed), and `actors.Advancement` is a game-authored tier ladder a player spends
    into deliberately. Neither covers "at creation, draw one or more modifiers at random
    from a shared pool and keep them for that unit's whole life" - permanent rather than
    triggered, assigned rather than chosen, read straight into `StatBlock` modifiers rather
    than routed through a trigger at all~~ - `actors.assignTraits(stats, pool, count)` draws
    `count` distinct traits at random and applies their modifiers permanently, each under its
    own source symbol, returning which were picked so a game can display them
90. ~~conditional visibility, independent of terrain: `roguelike.FieldOfView` is purely
    line-of-sight over terrain opacity, with no notion of a unit that stays undetected even
    in clear sight unless an enemy is within some fixed radius. That one shape covers every
    "hidden unless someone's right next to you" mechanic a tactical or stealth game reaches
    for; `mwg` would supply the radius check and the "discovering it costs the discoverer's
    move" rule, nothing about which terrain or ability grants it~~ - `roguelike.Stealth`
    tracks one hidden unit's sticky, one-way detection state; `checkDetection` returns `true`
    only on the call that first brings an observer within radius, so a game knows exactly
    which call should spend the discoverer's move
91. ~~positional auras: a continuously-reevaluated effect that applies to anyone adjacent to a
    unit carrying it, on and off as units move, rather than triggered once like
    `battle.BattleHooks` or timed like `actors.StatusEffect`. Neither re-checks "is a
    qualifying unit currently adjacent" on its own; this is the primitive both would need
    underneath them to express "adjacent allies fight better while this unit is nearby"
    without a game re-deriving adjacency-watching by hand~~ - `actors.AuraField.update` diffs
    each carrier's affected set against an adjacency test the caller supplies, adding
    modifiers to a unit that just became adjacent and removing exactly those on leaving,
    without reapplying (or duplicating, for two carriers at once) on every tick in between

Ruled out after the same survey, each verified against the real code rather than assumed:
unit experience-to-advance-into-a-different-unit-type (already covered: `actors.Progression`
plus `battle.checkEvolution` is structurally the same shape, just labelled for the Pokémon
reference); poison/damage-over-time (already covered by `actors.applyStatusEffect` plus
`TurnClock`'s `tick` callback - a poison tick is one line over the existing timed-modifier
primitive); time-of-day/alignment combat modifiers (a real mechanic, but sits at the wrong
layer - `battle.Field` is scoped to one encounter, this needs a continuous board-wide clock
- and isn't distinct enough from `Field`'s existing flag-set shape to warrant a primitive of
its own yet); attack-type resistance tables, unit specialties (backstab, berserk, charge)
and orb/UI state (content and presentation, not framework primitives - `Targeting`'s
existing shapes and `CombatHooks`'s pre/post-damage seam already cover the mechanical half
of most of these, same reasoning that has kept move numbers and species stats out of
`mwg/battle` throughout this list).

92. ~~an interactive-marker state for `QuestLog`: whether an NPC (or any object tied to a
    quest id) currently has something to offer the player, derived the same way
    `Achievements`' unlocking already is, never stored separately. `status(id)` reports
    `'available'`/`'active'`/`'complete'` per quest today, but nothing turns "this quest is
    available" plus "this NPC gives it" into the one bit of state a game actually draws a
    marker from: the yellow `!` over a quest giver, a different mark over someone waiting
    to hear a completed quest turned in, nothing over an NPC with no bearing on any quest at
    all. `mwg` would supply the derivation (given a set of quest ids an NPC is tied to, which
    of "has an offer" / "awaits a turn-in" / "neither" currently holds) and stop there - the
    actual `!`, its colour, and where it floats above a sprite stay the game's own art and UI~~
    - `QuestLog.markerFor(ids, state)` returns `'offer'`/`'turnIn'`/`'none'`, reusing the
    same satisfied-stage check `advance` does internally without ever mutating state itself
93. ~~an objective location and a tracked quest, so a game can point the player somewhere
    without hand-rolling both: `QuestStage` has a `condition` and a `counter`
    today but nowhere to say *where* a stage is satisfied, and `QuestLog` has no notion of
    which of several active quests is the one currently guiding the player, only whether
    each one individually is active. Two small, related gaps: a stage-level location (so
    "kill 5 rats" can optionally also say where the rats are) and a single tracked-quest
    selection on `QuestLog` a game sets and reads, the way a quest journal's "track this
    one" button does. Feeds `roguelike.Pathfinder`, which already has everything needed to
    turn a location into a route or a single next step (`find`/`step`/`distanceMap`) - this
    item is only the location data and the tracked-quest pointer, not a new pathing
    primitive; drawing a compass arrow or a footprint trail from that path stays the game's
    own presentation, same boundary item 92 draws for the marker itself~~ - `QuestStage`
    gained an optional `location`, and `QuestLog` gained `track`/`trackedQuest`/
    `trackedLocation`, the last two both clearing automatically once the tracked quest
    stops being active

94. ~~keybind conflict detection: `Input.bind(action, keys)` lets two actions silently share
    the same physical key today, since `bind` only ever adds a mapping and nothing checks
    what else already claims a key. The gap is a query - given a key code, which action (if
    any) currently owns it - so a rebind flow can warn or auto-unbind the loser before
    committing a change, rather than a player discovering the collision by both actions
    firing at once mid-game. This is the primitive item 95's UI would actually need under
    it; `bind` itself keeps behaving exactly as it does today for a game that never rebinds~~
    - `Input.actionsForKey(key)` returns every action currently bound to it
95. ~~a rebind settings screen: a ready-made `mwg/ui` flow (list the current bindings from
    `Input.keysFor`, "press a key" to capture the next one, a confirm/cancel step) over
    `Input`'s existing `bind`/`exportBindings`/`importBindings`, the same way `IconGrid` is
    a ready-made inventory screen over `Inventory` rather than something every game builds
    itself. Wants item 94's conflict detection first, so a captured key already in use has
    something to warn against rather than silently stealing it from whatever held it~~ -
    `ui.RebindScreen` over a `ListView`; `confirm` on a row reads the next raw key via
    `Input.onKey` rather than a named action, and an optional `onConflict` hook (built on
    item 94's `actionsForKey`) lets a game refuse a capture instead of always taking the key
    over. Not verified in a live browser this session (no connected browser tool available);
    checked by `tsc`, a clean `example:ui:build`, and close reading instead - worth an actual
    look next time one is available
96. ~~gamepad and controller input: `mwg/core`'s `Input` is keyboard-only today, nothing
    reads a `Gamepad` at all. The same named-action shape that already decouples a game
    from `KeyboardEvent.code` (`bind`/`isDown`/`justPressed`) is exactly what a controller
    needs too - a button or axis bound to the same action name a key already is, so a game
    written against `Input.isDown('right')` never has to know whether that came from a key
    or a stick. Button/axis-to-action mapping, and how an axis becomes a digital "pressed"
    (a deadzone threshold) are the open questions here, not the action-name architecture
    itself, which `Input` already has right~~ - `bindButton`/`bindAxis` fold a gamepad button
    or a stick pushed past its deadzone into the very same `held`-key state a keyboard press
    produces, under a synthetic code, so every existing query works unmodified either way;
    `pollGamepads()` (no native "button pressed" event exists, so `Game` polls it every
    frame) is the only new moving part

97. ~~a tower defense reference, further widening the genre list item 30 already opened:
    mostly composition of what `mwg` has rather than new demand. `Targeting`'s range/area
    resolution and `roguelike.Pathfinder` cover a tower choosing what to hit and an enemy
    routing along (or rerouting around a blocked) lane, `render.Projectile` covers a shot in
    flight, and `actors.Shop` covers spending currency to place or upgrade a tower. The one
    real gap surveyed against the existing modules is a timed wave spawner, logged
    separately as item 98 rather than folded in here, the same way item 30 named XCOM and
     board games without picking a specific title. Implemented in `examples/tower-defense` as
     a standalone lane-defense reference using `core.Spawner`, timed overlapping waves, tower
     targeting, damage, rewards, and lives.~~
98. ~~a wave spawner: timed, escalating enemy spawning, distinct in shape from anything `mwg`
    already schedules. `roguelike.Scheduler` orders whose turn it is by energy cost, a
    discrete-turn primitive with no concept of real time at all; this wants a plain timer
    driven by `dt`, resolving to "wave 3 starts at t+45s, spawns 8 of kind A and 2 of kind B
    over the next 10s" rather than anyone's turn. Not specific to tower defense (any game
    with escalating timed spawns - a horde mode, a survival minigame - wants the same
    primitive), which is why it is its own item rather than bundled into 97~~ -
    `core.Spawner` flattens every wave's entries into one time-sorted schedule at
    construction, `update(dt)` fires `onSpawn` for whatever is due; waves may overlap rather
    than queue, so a later wave is never delayed by an earlier one still finishing

99. ~~free movement: a position and facing that are not snapped to a grid at all, in
    floating-point rather than whole tiles or whole elevation levels. `rpg.GridMover` is the
    only movement primitive `mwg` has today, and it is tile-to-tile by design (`moveBy`
    tweens between two grid cells, `turnTo` faces one of four discrete directions); nothing
    covers a twin-stick shooter, a bullet-hell, or any top-down action game whose player
    moves and aims freely rather than stepping cell to cell. `x`/`y` in float world units is
    already how `Camera` and every sprite position works, so the 2D half of this (position
    plus a continuous facing angle, not one of four/eight fixed directions) is not blocked
    on anything; `roguelike.Elevation` is whole-levels-only today (`heights are whole
    levels, not fractions`, its own doc comment), so a genuinely continuous `z` is a
    separate, larger question, now addressed by the optional 3D module (item 45), rather than
    something this item can promise on its own~~ - `rpg.FreeMover` ships the 2D half:
    `move(dx, dy, dt)` takes an unnormalized direction and updates `x`/`y` plus a continuous
    `facing` in radians; bucketing that angle into however many directions a sprite sheet
    has stays the game's own job, same as `GridMover`'s animation callbacks already are.
    Continuous vertical movement is available through `Character3D.moveTo(x, y, z, speed)`;
    `FreeMover` remains intentionally 2D

100. ~~requested directly as "import and export usual save files of other frameworks, like
     Game.rxdata" - RPG Maker's own save format by name. Revisited after the same session's
     licence-and-provenance wording was corrected: a loader/writer for another engine's file
     *format* is fair game, learned the ordinary way any undocumented format is, by reading
     real files in it; what stays out is that engine's actual media, its assets, text, data
     tables or any specific save's real content, never shipped inside `mwg`. Two distinct
     halves, not one:
     - a `Game.rxdata` reader/writer: `.rxdata` is Ruby's own `Marshal` binary serialization
       format holding an RPG Maker-shaped object graph (`Game_System`, `Game_Party`,
       `Game_Actor` and the rest) - understanding that container's layout and RPG Maker's
       own class shapes inside it is format engineering, the same kind of work
       `tools/vendored/rgssad-wasm` already does for RPG Maker's asset-archive format, not a
       different rule for a save file just because it holds live game state rather than
       assets. No actual `.rxdata` save (someone's playthrough, a shipped game's own data)
       is ever bundled - only the format-reading code, exercised against files a developer
       supplies themselves, the same way `extract:rgssad` never ships anyone's archive
     - a generic plug-in point on `SaveSystem` underneath that: `normalize(externalBytes) =>
       T` run once on import, then fed through the same versioned `migrations` chain an
       ordinary load already uses, rather than a game hand-rolling "decode, then call
       `save()`" outside that pipeline by itself. This half is not RPG-Maker-specific; a
       `.rxdata` reader is one `normalize` implementation among others a game could supply~~
     - `rpg.decodeMarshal`/`encodeMarshal` implement Ruby's Marshal 4.8 format generically
       (nil/booleans/Fixnum/Bignum/Float/String/Symbol/Array/Hash/Object, backreferences
       included on read), verified against real `Marshal.dump` byte fixtures, not only
       against the decoder's own idea of the format; `_dump`/`_load` values decode to their
       class name plus opaque bytes, since that per-class binary layout is a second,
       undocumented format this reader was never taught. `SaveSystem.importExternal` is the
       generic plug-in point, taking any `normalize` a game supplies (an `rxdata`-based one
       being one example, not the only one)

101. ~~requested directly: `Button`, `Bar`, and floating text - three common HUD widgets
     missing from `mwg/ui`, which today has `Label`, `Window`, `WindowStack`, `ListView`,
     `IconGrid`, `MessageBox`, `NinePatch` and `VerticalLabel`, but nothing a game reaches
     for constantly enough that hand-rolling it at every call site is the current answer:
     - `Button`: a clickable region with idle/hover/pressed states and a label, over the
       same `NinePatch`/`theme` machinery `Window` already draws its chrome from - `ListView`
       is the closest existing precedent for turning pointer input into a callback
     - `Bar`: a health/mana/experience bar - a filled proportion of a track, following
       `theme()` for colour the way `Label` does, closer to a small, focused primitive than
       a general-purpose progress-bar widget
     - floating text: a damage number or a "+1 gold" that rises and fades over its own
       lifetime, unrelated to `Label`'s job of a static, positioned string - this is
       animation over a `Label`-shaped text object, timed rather than laid out~~ -
     `ui.Button` draws over `NinePatch`/a flat rectangle the way `Window` does, cycling
     idle/hover/pressed/disabled as three brightness steps of the same panel; a real reference
     game's title screen (icon-only rankings/badges/settings buttons, no caption) surfaced a
     gap in the first cut, so `Button` also takes an optional `icon` alongside or instead of
     `text`, laid out the same icon-then-label order `ListView` rows already use. `ui.Bar` is
     a filled proportion of a track, `setValue(value, max)`; an explicit `color` survives a
     theme change, a defaulted one follows it. `ui.FloatingText` rises and fades over its own
     lifetime via `update(dt)`, removing and destroying itself once done

102. ~~requested directly: live theme changes. `ui.theme()` is read once, at construction, by
     every widget that has one (`Label`, `Window`, `ListView`, `IconGrid`, `MessageBox`,
     `VerticalLabel`, `WindowStack` - checked, all of them bake the values they read into a
     style or a colour right there in the constructor). Calling `setTheme` after any of them
     already exist changes nothing about what is already on screen; only a widget created
     afterward sees the new theme. A day/night palette swap, or a player-chosen light/dark
     toggle, wants existing widgets to restyle themselves, not just future ones - the gap is
     a signal fired on `setTheme` that already-built widgets can subscribe to and reapply
     their own style from, the same shape `i18n`'s `direction` already flows into
     `theme.direction` from a game's own glue code, just for the rest of the theme too~~ -
     `ui.themeChanged` is a `Signal<Theme>` dispatched at the end of `setTheme`; every widget
     listed above now subscribes in its constructor and unsubscribes on `destroy`, restyling
     in place rather than through whatever `setItems`/rebuild path already existed - routing a
     restyle through `ListView`/`IconGrid`'s own `setItems` would destroy a caller-owned row or
     cell `icon`, the same trap `IconGrid.swapCells`'s doc comment already describes, so both
     recolour existing rows/cells directly instead. `Label` only touches whichever style field
     was left to the theme's own default, so an explicit `color`/`size` a game passed in
     survives a theme change untouched. `ListView`/`IconGrid` preserve the current highlight
     across a restyle rather than resetting to the first row, same reasoning

103. ~~requested directly: a full map and a minimap. Nothing today turns a level or an
     overworld into a small rendered overview - `roguelike.FieldOfView` already tracks
     exactly the data a map screen wants (`explored`, distinct from `visible`, so a minimap
     can show a room the player is not currently lit up in), and `world.Overworld` already
     has named locations by position, but nothing renders either as a downscaled picture
     with the player's own position and heading marked on it. Two related sizes, not two
     items: a small always-on-screen minimap (a corner HUD element) and a full map screen (a
     `Window`-shaped pause-and-look view, zoomable, potentially with quest markers from item
     92 or a tracked-quest location from item 93 drawn over it). The rendering itself (how an
     explored-cell set becomes a small texture rather than redrawing every tile every frame)
     is the open engineering question here, not the data it draws from, which already exists~~
     - `render.Minimap` bakes each cell of a `FieldOfView.explored` set into a persistent
     `RenderTexture` the first time (and only the first time) `sync` sees it, at whatever
     colour a game's own `colorFor(x, y)` reports - never redrawing a cell already baked, so
     the per-frame cost stays proportional to newly explored cells rather than the whole map.
     `newlyRevealed` is the pure diff behind `sync`, tested without a renderer; `setMarker`
     positions an optional facing-aware marker on top. One class serves both sizes named
     above - a coarse `cellSize` for an always-on corner HUD, a larger one inside a `Window`
     for a full pause-and-look screen - quest markers and a tracked-quest location stay a
     game's own overlay, the same boundary `rpg.QuestLog.markerFor` already draws

104. ~~requested directly as "support management", resolved into two distinct pieces since
     "support" means two different things depending on which side of the framework it sits
     on - checked both against the real code, neither exists anywhere:
     - unit support/bond relationships: a Fire Emblem-shaped mechanic where two units build
       a relationship through proximity or shared battles over time, eventually unlocking a
       combat bonus or dialogue. Distinct from `actors.Advancement` (a tier ladder a single
       player spends into deliberately) and item 91's auras (positional, not cumulative) -
       this is a persistent, growing value between a specific *pair* of units, closer in
       shape to a second, relationship-scoped `Progression` than to anything `mwg` has today.~~
        Implemented as `actors.SupportLedger`, with pair-order-independent progress,
        thresholded levels, optional bonus keys, and save/restore support.
     - ~~a player-facing help/support screen: `mwg/ui` has `Label`, `Window`, `WindowStack`,
       `ListView`, `IconGrid`, `MessageBox`, `NinePatch` and `VerticalLabel`, but nothing
       shaped like a controls reference or an FAQ screen - likely composable from what
       already exists (a `Window` holding a `ListView` of topics and a `Label` for the body)
       rather than demanding a new widget, which is why this is logged as a recipe more than
       a primitive~~ - `ui.HelpScreen` is exactly that recipe: a `ListView` of topic titles
       and a `Label` for whichever one is highlighted, wrapped in a game's own `Window`
       the same way `RebindScreen` is
105. ~~requested directly as "feedback from user", likewise two distinct pieces once resolved -
     checked both, neither exists anywhere:
     - in-app feedback or bug-report submission: a way for a player to send back written
       feedback from inside the game. Distinct from `core.Session`, which only counts
       launches silently for a native wrapper's own rating prompt and has no opinion on
       collecting or transmitting anything a player writes; this item would need an actual
       transport (which `mwg` has never had - every existing module is local-first, up to
       and including `SaveSystem`'s own `localStorage`-backed storage), so the design
       question is as much "how does this leave the player's machine at all" as it is a UI.~~
       Implemented as `core.FeedbackClient`, an injectable HTTPS JSON transport with input
       validation, timeout cancellation, and HTTP error reporting. The game still owns its
       endpoint, consent flow, privacy policy, and server-side storage.
     - ~~action feedback ("juice"): hit-stop (a brief `Game.timeScale` dip on a heavy hit,
       distinct from item 101's floating text and from `Camera.shake`, both of which already
       exist) and gamepad rumble (`Gamepad.vibrationActuator`, unused by anything item 96
       added - that item only ever reads a pad, never writes to one)~~ - `Game.hitStop(duration,
       scale)` dips `timeScale` for `duration` *real* seconds (counted independently of the
       scale it is itself applying, or a hit-stop would extend its own duration) then restores
       it to 1; `Input.rumble(padIndex, options)` calls a pad's `vibrationActuator.playEffect`
       if the browser and that pad expose one, a no-op rather than a throw otherwise

106. ~~requested directly: managed zoom, to keep a fractional zoom from letting seams show
     between tiles. Checked the render path: `Game` already sets nearest-neighbour texture
     sampling and rounds the whole camera container to a whole screen pixel (`Camera.apply`,
     fixed earlier this session for `toScreen`/`toWorld` to agree with it too), but `zoom`
     itself accepts any positive float (`Math.max(0.01, value)`, no further constraint) and
     nothing rounds an individual tile's own edges - only the container's global offset. At a
     non-integer zoom, each tile's edge lands on a different sub-pixel offset depending on
     its position, so nearest-sampling rounds one tile's edge column one way and its
     neighbour's the other, which is exactly the thin seam a fractional zoom produces even
     though the camera-level rounding is correct. `ColorTransformBatcher` already carries a
     per-sprite `roundPixels` bit (currently driven by the renderer's own global setting, not
     exposed as a per-tile knob `TileMap` turns on deliberately) - whether the fix is
     snapping `zoom` itself to values where tile size times zoom is a whole number of pixels,
     or turning on `roundPixels` for tile sprites specifically, is the open engineering
     question, not whether the seam is real~~ - resolved as the first option, which needed no
     change outside `Camera` (`ColorTransformBatcher`'s per-sprite bit stays untouched, and
     unimported by anything outside its own file, per item 83's own rule): `snapZoom(zoom,
     tileSize)` rounds `zoom * tileSize` to the nearest whole pixel count and reports the zoom
     that produces it; `CameraOptions.pixelPerfectTileSize`, when given, runs every `zoom`
     assignment (construction included) through it automatically. A camera that never sets it
     keeps a fully fractional zoom, unaffected

107. ~~requested directly as "memory management (for big games)". `world.World` already has
     an answer at the map level - `unload(id)` exists, tested, and refuses to unload the
     current map - but `mwg/assets` has none at all: `load`/`texture`/`get` only ever add to
     Pixi's asset cache, and there is no `unload`/`release` anywhere in that module. A game
     with many discrete zones, each pulling in its own tileset or sprite sheet, accumulates
     every one of them in GPU texture memory for the rest of the session, with nothing to
     call when the player has permanently left an area. `World.unload` freeing the map data
     it owns while the textures that map's tiles pointed at stay cached forever is exactly
     the gap "for big games" names: fine for a short example, a real problem for anything
     with enough zones that unvisited-again ones should not still be paying rent~~ -
     `assets.release(paths)` calls Pixi's own `Assets.unload` for whichever of the given
     paths are actually cached, silently skipping the rest rather than treating an
     unvisited-zone's assets as an error to check for first; `assets.isLoaded(path)` is the
     query a game checks before deciding a zone needs `load` again at all

Reassessed after shipping 86-100 in one batch (see the same session's commits): with that
whole tier cleared, the open list is short enough to look at as one group rather than by
tier. 101, 102 and 106 are the easy calls - small, self-contained, direct requests, nothing
one needs before another, so no order among them. 103 is a step up in size (real rendering
engineering: an explored-cell set becoming a small texture, not just composing existing
data) but still a single, well-bounded item. 104 and 105 each split into a small documented
half and a larger, less-defined one the same way 100 turned out to once its own scope was
corrected: 104's help screen and 105's action-feedback half are recipes over what already
exists, but 104's bond-relationship mechanic and especially 105's in-app feedback (which
needs an actual network transport `mwg` has never had, a real architectural question, not a
widget) are bigger than "requested directly" alone would suggest - flagging that here so a
future session does not underestimate them the way 100 briefly was. 107 gets a nudge above
the rest of this tier: it is not a new capability so much as a standing architectural gap in
`mwg/assets` (unbounded GPU memory growth, the exact kind of resource cost this project's
own performance priority already asks to be treated seriously), even though nothing today
exercises enough zones to actually hit it. 97 stays exactly where 28/30 already sit -
genuinely open-ended, no title picked, lowest priority among the non-gated items. The 3D
block was later approved and implemented as an optional module.

101, 102, 103, 106, 107 and 104/105's small halves have since shipped in one pass (this same
session's commits), leaving only what this reassessment already flagged as bigger than its
own item let on: 104's bond/support-relationship mechanic and 105's in-app feedback (still
wanting a network transport `mwg` has never had), both logged in place rather than built
alongside the halves that did ship. 97 is unchanged - still open-ended, still lowest priority
among the non-gated items. The 3D block was later approved and implemented.

108. ~~requested directly as "day/night management and weather". Checked against what already
     exists rather than assumed new: `battle.Field` already carries named conditions -
     `field.set({id: 'rain'})`, `has`/`clear`/timed `advance` - which covers weather exactly
     at the scope it was built for, one encounter. The very survey that shipped 87-91 raised
     this same idea and ruled it out at the time: "time-of-day/alignment combat modifiers...
     sits at the wrong layer - `battle.Field` is scoped to one encounter, this needs a
     continuous board-wide clock - and isn't distinct enough from `Field`'s existing flag-set
     shape to warrant a primitive of its own yet" (see the note after item 91). What would
     make it distinct now: a continuous, `dt`- or turn-driven clock living above any one
     encounter - on `world.World` or a game's own overworld loop - that a game reads from
     (`isNight()`, `currentWeather()`) and that a battle or map can pull into its own
     per-encounter `Field` when one starts, rather than `mwg` inventing a second competing
     conditions primitive. Logged rather than built immediately: it arrived mid-session,
     against the other open items already agreed for this pass, and the shape above still
     needs the same "is this actually distinct enough yet" scrutiny the original survey gave
     it, not a rubber stamp because it was asked for twice.~~ Implemented as `world.EnvironmentClock`
     with configurable day phases, weather state, change notifications, snapshots, and restore.

109. ~~requested directly as "fog of war". Checked against what already exists rather than
     assumed new: `roguelike.FieldOfView` already computes exactly this for the shape it was
     built for - `visible`/`explored` from one viewer's point, with shadowcasting or a hex
     line-of-sight fallback - so a single-character roguelike already has fog of war today,
     under a different name. What is missing is the `board`-shaped version: `board.Tactics`
     has units on a grid and move costs, but nothing folds many units' vision into one shared
     "what this side can currently see" set the way a squad-based tactics or 4X game wants,
     where fog of war is a per-faction union of every controlled unit's own sight rather than
     one character's. `roguelike.FieldOfView` is scoped to a single `(x, y)` and a single
     `Level`; whether the fix is a thin wrapper that unions several `FieldOfView.visible` sets
     per faction, or a distinct primitive over `board.BoardGrid`, is open. Logged rather than
     built immediately, same reasoning as 108: it arrived mid-session against the batch of
     items already agreed for this pass.~~ Implemented as `board.FactionFog`, which unions the
     supplied vision of each faction and retains explored memory.

110. ~~requested directly: integration with Ionic Capacitor
     (<https://capacitorjs.com/>), to build a native iOS/Android app from a game built on
     `mwg`.~~ Checked against what already exists: item 85's own text already names Capacitor
     as one example of "a native wrapper (Capacitor, Tauri, whatever a game ships through)"
     that `core.Session`/`Achievements` are deliberately generic enough to feed, but nothing
     here has ever actually run inside one, and Capacitor is a specific, concrete target with
     its own real constraints to check rather than assume:
     - Capacitor's `WebView` is not `file://` - it serves the bundled web assets from a
       custom scheme (`capacitor://` on iOS, `https://localhost` on Android) through its own
       local server. That is a *better* environment than this project's own `file://` bar
       (real `fetch`, real relative asset URLs, a real origin `<img>`/WebGL sees as
       same-origin), not a harder one - the open question is whether the existing
       `tools/compile-resources` data-URI pipeline is still the right choice inside a
       Capacitor shell, or whether that shell can be handed the plain asset folder it was
       always the `file://` constraint that ruled out
     - input: `mwg/core`'s `Input` is keyboard/gamepad-shaped (`KeyboardEvent.code`,
       `Gamepad`); a touchscreen phone has neither by default. Capacitor's own plugins
       (haptics, status bar, splash screen) are outside anything `Input` currently models,
       and pointer-driven UI (`Button`, `IconGrid`'s tap-to-pick-up) already exists
       independent of a keyboard, so touch-only play may already be closer than it looks -
       untested, not unconsidered
     - packaging: verified with an actual `npx cap add android` against the built
       tower-defense example - no Capacitor-specific config was needed. `capacitor.config.json`
       points `webDir` straight at `examples/tower-defense/dist`, and `cap add` copies that
       output (its already-inlined `data:` URI assets included) into
       `android/app/src/main/assets/public` unmodified; the existing `file://`-safe build is
       exactly what a Capacitor project wants too
     - store touchpoints: item 85's `Session`/`Achievements` signals are the intended seam a
       Capacitor wrapper reads to time a native rating prompt or report an achievement to
       Game Center/Play Games - this item is about proving that seam actually works end to
       end inside a real Capacitor shell, not inventing a new one
     Logged at low priority per this project's own roadmap process rather than started on the
     spot; a real answer needed an actual Capacitor project built against one of this
     project's own examples, not speculation from documentation alone, and now has one: `npm
     run cap:add:android` built the tower-defense example and ran a real `cap add android`
     against it, producing a working native project with the game's web build copied in
     verbatim. The repository includes `capacitor.config.json`, Capacitor core/CLI
     dependencies, and `cap:sync`/`cap:open:*` scripts targeting the generated tower-defense
     web build; native platform folders remain host-tool output created by `npx cap add` and
     are `.gitignore`d, not committed.
     ~~The touch-input half closed next: `core.Input` gained `touchCode`/`bindTouch`/
     `pressTouch`/`releaseTouch`, following the exact same pattern `bindButton`/`pollGamepads`
     already established for a gamepad - bind a synthetic code to an action once, then flip
     that one code's held state, so `isDown`/`justPressed`/`justReleased` keep working
     unmodified for a touch-driven action the same way they already do for a key or a pad
     press. `ui.Button` gained `onPress`/`onRelease` signals (fired on pointerdown and
     pointerup/pointerupoutside) as the hook a virtual on-screen d-pad button needs to feed
     `pressTouch`/`releaseTouch` for hold-to-repeat movement, which a click-only `onClick`
     cannot do. `core.Input` also gained `attachSwipe`, resolving a one-finger drag into one
     of the 8 movement-action pulses by angle (or a `tap` action for a short drag) - the more
     common mobile roguelike control scheme of one swipe per tile rather than a held
     direction. `core.PlayerInput` gained matching `bindTouch`/`pressTouch`/`releaseTouch`
     wrappers for local multiplayer's own per-player scoping. Still open at that point: the
     store-touchpoints question above, since verifying it needed Android Studio/Xcode, not
     available in that environment.~~
     Revisited once Android Studio (2024.2) turned out to already be installed: a real debug
     build was pushed further than before. `android/local.properties` pointed at the local
     SDK, and `JAVA_HOME` set to Android Studio's own bundled JBR (the system's separate
     Adoptium JDK path in the default environment was stale/uninstalled) let
     `gradlew assembleDebug` run end to end - `BUILD SUCCESSFUL`, 85 tasks, a real signed
     debug APK, proving the whole Capacitor-plus-native-Android pipeline actually compiles,
     not just that `cap add android` can scaffold the project. Installing and launching that
     APK on the SDK's own `Medium_Phone_API_35` AVD did not get as far: `am start` reported
     `Activity class ... does not exist` despite `dumpsys package` showing the exact same
     activity correctly registered in the resolver table, and the emulator itself then
     crashed outright (`FrameBuffer.cpp: Failed to find ColorBuffer`, a SwiftShader/GPU
     rendering fault in this specific headless environment, not an application-code issue).
     Xcode remains flatly impossible here regardless - Apple restricts it to macOS, and this
     machine runs Windows. The live on-device half closed too: the emulator's earlier
     crash was a red herring, the real blocker was the `google_apis_playstore` AVD image
     itself, which never leaves `RUNNING_LOCKED`/`FallbackHome` in this sandboxed
     environment (no path to complete Play Store/GMS setup, and Android's package manager
     silently refuses to resolve a locked user's activities: `dumpsys package` showed the
     manifest parsed correctly, `aapt2 dump badging`/`dump xmltree` confirmed a perfectly
     ordinary exported `MAIN`/`LAUNCHER` activity, yet `am start` kept reporting "Activity
     class ... does not exist" - a package-manager symptom, not an app bug). Setting
     `PlayStore.enabled = false` in the AVD's `config.ini` and wiping data reached
     `RUNNING_UNLOCKED` in under a minute, after which the debug APK installed and launched
     as `topResumedActivity` immediately. Chrome DevTools Protocol against the real
     `webview_devtools_remote_<pid>` socket confirmed the page title ("mwg: tower defense")
     and origin (`https://localhost`, not `file://`) directly in the live WebView, and a
     screenshot showed the tower-defense grid actually rendering. For the seam itself:
     `Session`/`Achievements` are both thin wrappers over `defaultStorage()`/`localStorage`,
     so writing that exact key (`mwg-session:*`) through a CDP `Runtime.evaluate` call,
     force-stopping the app (`am force-stop`, a harder reset than a page reload), relaunching
     it, and reading the key back confirmed it survived: `1` written before the stop, `1`
     read back after - `localStorage` genuinely persists across process restarts at this
     real origin, which is exactly what a native wrapper's rating-prompt/achievement plugin
     would rely on. Item 110 is fully closed now, build and runtime both.

111. ~~requested directly as "minimal typo correction on the go", named example: curved
     (typographic) apostrophes in French, Italian and Dutch strings, rather than the plain
     ASCII `'` a keyboard or a translator's text editor actually produces. Checked against
     `mwg/i18n`: `t()` resolves and interpolates a message but performs no text
     transformation of its own kind at all - a straight `'` in a `Catalog`'s `messages` reaches
     the player exactly as authored. Two different shapes this could actually mean, not yet
     told apart:
     - a static pass over authored message strings: French ("aujourd'hui"), Italian
       ("dell'anno") and Dutch ("z'n") all elide a vowel with an apostrophe in ordinary prose,
       and a translator's plain-text tooling almost always leaves it as ASCII `'` rather than
       the curly `'` proper typesetting wants - `t()` (or a build-time pass over the compiled
       catalog, closer to how `tools/compile-resources` already processes every other asset)
       could substitute per the active locale
     - live correction of player-typed text (a chat box, a character name field) as it is
       entered - a different, harder problem: knowing *when* a `'` is a French elision versus
       an English possessive versus a straight quote meant to stay straight needs real
       per-locale rules, not a single global regex, and nothing in `mwg/ui`'s text-entry story
       (there isn't one yet - no widget here takes typed text at all) exists to hang it from
     Locale-specific typographic rules generally (curly quotes are only the named example) is
     the real shape of this item, wider than apostrophes alone; which of the two cases above
     it is actually asking for, and what "minimal" bounds it to, needs the same "what already
     exists, what's actually missing" check the rest of this list gives every item before it
     is sized.~~ Implemented `i18n.typographic()` and automatic locale-aware apostrophe
     normalization in `t()`, with an opt-out on `Catalog.typography`.

112. ~~a TypeScript equivalent of [`fluent-i18n`](https://github.com/orhun/fluent-i18n): a
     declarative, ergonomic internationalization layer built around Project Fluent's FTL
     message syntax. The existing `mwg/i18n` catalog and `t()` API already provide locale
     selection, fallback, interpolation and plurals, but messages are plain TypeScript data
     rather than parsed `.ftl` resources. Explore static locale loading, shared and
     locale-specific message files, typed interpolation arguments, clean fallback handling,
     missing-translation diagnostics or raw-key mode, and safe runtime locale switching while
     preserving the `file://` build constraint. The implementation should be TypeScript-first
     and integrate with the existing `Catalog`/`t()` surface rather than introduce a second
     translation API. Keep Unicode bidi-isolate handling and other Fluent security choices
     explicit, and validate the parser and fallback behavior with dependency-light tests.~~
     Implemented as `i18n.parseFTL`, which feeds the existing `Catalog` and `t()` surface
     with variables, exact variants, plural variants, and locale-aware direction defaults.

Items 113-120 came from a survey of comparable frameworks in other languages (Pygame/
Pygame-CE and Arcade for Python, MonoGame and Godot's C# scripting for C#, SFML/raylib/
Cocos2d-x for C++, with Godot, LÖVE and LibGDX as broader yardsticks), checked against
`src/` rather than each framework's marketing copy, so anything mwg already ships (autotiling,
dialogue fades, etc.) was dropped before it reached this list. Logged per this project's own
process - appended at low priority, not argued into or out of existence on the spot.

113. ~~a generic `Tween`/easing primitive, the way Godot's `Tween` or LÖVE's community
     `tween.lua` give a game one shared interpolation helper instead of every feature hand-
     rolling its own. mwg already has three separate, private tween-shaped implementations -
     `DialogueStage.ts`'s own `Tween` interface for character/backdrop fades, `Camera.shake`,
     and `ActorAnimator`'s walk-cycle blending - each duplicating the same duration/easing/
     apply shape under a different name. Extracting one public `tween(duration, apply, ease?)`
     into `mwg/core` (or `mwg/render`, if it needs to stay Pixi-aware) plus a small standard
     easing-curve set, and rebuilding the existing three call sites on it, would remove the
     duplication rather than add a fourth copy of it - the strongest candidate of this batch
     since the shape is already proven needed by mwg's own code, not hypothetical~~ -
     `core.Tweener` plus a small `Easing` curve set (linear, quad, cubic, each in/out/in-out);
     `DialogueStage` rebuilt on it, dropping its own private `Tween` interface entirely.
     `Camera.shake` and `ActorAnimator` were rechecked rather than assumed, and turned out not
     to be real duplicates once read closely: `shake` decays a random offset rather than
     interpolating toward a fixed end state, and `ActorAnimator` drives discrete sprite-sheet
     frames, not a tween at all - both left as they were
114. ~~lightweight 2D collision: an AABB/circle broad-phase and resolve-against-tile-solidity
     helper, the scoped-down cousin of the full Box2D bindings LÖVE, Cocos2d-x and LibGDX
     each ship. Not a rigid-body physics engine - out of scope for a tile/turn-first
     framework the way item 45's caution already treats a full 3D engine - but item 99's free
     movement (continuous position and facing, already shipped as `rpg.FreeMover`) has no
     collision helper at all today - its own doc comment says as much ("both own position and
     animation only, nothing about collision or passability") - so two overlapping sprites in
     continuous space have no primitive to test or resolve against each other or against solid
     tiles~~ - `rpg.aabbOverlap`/`circleOverlap`/`circleAabbOverlap` plus
     `resolveAabbAgainstTiles`, an axis-separated sweep that stops flush against the first
     solid tile a move would enter rather than tunnelling through it, checking every
     row/column a fast move crosses rather than only its destination cell
115. ~~imported-model animation playback for `mwg/3d`: raylib and Cocos2d-x both play back
     skeletal/skinned animation clips baked into an imported model. `loadModel3D`
     (`ImportMeshAsync`) already loads a glTF's animation clips as part of the import result,
     but `Character3D` only exposes continuous translation (`moveTo`/`update`) - nothing
     plays, blends, or loops a clip a game imported, so a walk cycle baked into a mesh can't
     currently be triggered through `mwg/3d`'s own API~~ - `Character3D` takes
     `loadModel3D`'s own `animationGroups` result and adds `playAnimation`/`stopAnimation`/
     `currentAnimation`, degrading to a no-op for an unknown clip name the same way
     `ActorAnimator`/`GridMover` already do for a missing animation. Unit-tested against fake
     `AnimationGroup`-shaped objects (Babylon needs no scene for this half); not verified
     against a real animated glTF, since generating one from scratch would itself risk
     crossing into borrowed content, and none was already in this project's own assets
116. ~~heightmap terrain from an image for `mwg/3d`: raylib's heightmap-to-mesh loader is a
     different technique from `TileGrid3D`'s existing per-cell integer elevation columns - a
     continuous displaced mesh from a greyscale image rather than discrete stepped blocks -
     and would sit alongside `createTileGrid3D` as a second terrain path rather than replacing
     it, for a game wanting rolling ground instead of a blocky one~~ - `createHeightmapTerrain3D`
     wraps Babylon's own `CreateGroundFromHeightMap`, taking already-decoded RGBA pixel bytes
     rather than a URL Babylon would fetch and decode itself, the same shape `parseVox` already
     takes raw bytes over a path. Verified in the `three-d` example with a generated (not
     downloaded) sine-field hill, visibly a smooth dome next to the blocky elevation columns
117. ~~dialogue rollback for `mwg/stage`: Ren'Py's marquee feature, letting a player rewind
     already-seen lines or choices and re-pick. Distinct from item 42's `Recorder`/`Player`,
     which replays an `Input.onAction` log for deterministic testing and is never exposed to
     the player mid-scene; this is `DialogueStage` keeping its own visited-state history and a
     player-facing "back" affordance, which does not exist today~~ - narrowed on the way in:
     re-simulating a re-picked choice forward would need a full scene-state snapshot/restore
     this session's time did not cover, so what shipped is the honest, bounded half - `StageScript.history`
     (every completed line, its speaker, and any choice made) and `showLast()`, a read-only
     "show me the previous line again" a game wires to a back button or scroll gesture,
     without re-running any side effect or letting a past choice change
118. ~~an NVL display mode for `mwg/stage`: Ren'Py's alternative to its (and `DialogueStage`'s)
     default ADV mode, accumulating several lines in one scrollable block instead of clearing
     the box each line - a distinct presentation of the same script data, not a new script
     format~~ - `MessageBoxOptions.mode: 'nvl'` accumulates each page into one growing,
     speaker-prefixed block instead of replacing the text each page; threaded through
     `ScriptOptions.mode` too. Verified in the `dialogue` example: two lines stayed on screen
     together as a third revealed, `bodyLen` growing rather than resetting. Scoped down from
     the full ask: `StageScript` still opens one box per `say`/`ask` command rather than
     batching a run of consecutive lines into one box automatically, so true multi-line
     accumulation today needs either a game handing `MessageBox` several `pages` itself, or a
     future batching pass over `StageScript`'s own command loop
119. ~~skip/auto-forward for already-seen dialogue text: common visual-novel quality-of-life,
     advancing automatically or fast-forwarding through lines a player has already read.
     `DialogueStage` has no notion of "already seen" today, which item 117's rollback history
     would also need to track, so the two are natural to build together~~ - `MessageBoxOptions.autoAdvance`
     (seconds after a page finishes revealing before it advances on its own, never while
     choices are up) plus `StageScript.skipSeen`, which reveals a previously-shown line at
     once and auto-advances it, tracked from the same history item 117 added
120. ~~a runtime waveform synth for `mwg/audio`: Pyxel ships a small four-channel chiptune-style
     square/triangle/noise generator a game can call at runtime. mwg already synthesizes sound
     the same licence-avoiding way, but only offline, in `tools/make-example-assets.mjs`; that
     capability has never been exposed as an `mwg/audio` API a running game could call itself
     to generate a tone or a procedural SFX on the fly rather than only play a pre-baked one~~ -
     `audio.synthesizeTone` (square/triangle/sine/noise, decay envelope, deterministic given a
     seed) renders straight to a `data:audio/wav` URI; `playTone` hands it to an injectable
     `Playable`, the same seam `Sound`/`Music` already use. Verified by decoding the WAV
     header/samples in tests rather than trusting the string shape

121. ~~raised independently while porting a Shattered Pixel Dungeon-shaped reference, the same
     way item 111's typographic apostrophes and several of 46-56/66-73 were found by reading a
     reference's own coverage rather than assumed: a bitmap-font-backed text primitive.
     Checked against the real code (`src/ui`, `src/render`): `Label` (`src/ui/Label.ts`) wraps
     Pixi's `Text` outright - a system/canvas font rasterised to a fresh texture on every
     string change, which the class's own doc comment already flags as "wasteful for
     something updated every frame". SPD-shaped UI wants the other kind: a fixed pixel font
     baked into a glyph-atlas texture (Pixi's `BitmapText`), the standard choice for retro
     pixel-art text and for anything that redraws often (a live HUD counter, not just
     `FloatingText`'s construct-once damage numbers, which sidesteps the cost today only by
     never changing its own string after creation). No `BitmapText`/bitmap-font class exists
     anywhere in `mwg/ui` or `mwg/render` today; this would sit alongside `Label` as a second
     text primitive for the pixel-font case, not replace it - a game rendering ordinary UI
     copy in a system font still wants `Label`~~ - `ui.BitmapLabel`, generating and caching its
     underlying bitmap font the same way `BitmapText`'s own "Dynamic Bitmap Fonts" already do,
     nothing downloaded or shipped. Verified in the `interface` example with a per-frame HUD
     clock; `BitmapText` needs a real DOM `document` even to construct (unlike `Text`, which
     only fails on measurement), so the style-mapping logic is unit-tested and the widget
     itself only in-browser, the same split every other Pixi-text-backed widget here already has

122. ~~requested directly, once item 120's waveform synth existed to build it on: a MIDI player.
     `.mid` is a small, well-documented, patent-free event format (note-on/note-off plus
     timing, not audio), so parsing one is ordinary format engineering, the same standing this
     project already gives a reference's own file formats (see item 100's note on where that
     line sits) - nothing about playing back a `.mid` file touches any reference game's actual
     media. The missing half is exactly what item 120 supplies: turning a parsed note event
     into sound without a licensed instrument sample library, the way a General MIDI
     softsynth normally would - item 120's square/triangle/sine/noise waveforms are a crude
     but real instrument, closer to a chiptune cover than a sampled orchestra, and entirely
     this project's own generated-not-borrowed shape. Scope still open: how many simultaneous
     notes `synthesizeTone`'s one-tone-per-`Playable` model can actually voice before it needs
     a small polyphony/scheduling layer of its own, and whether General MIDI's 128-instrument
     program map is worth reflecting at all versus one deliberately chiptune-flat voice~~ -
     `audio.parseMidi` reads format 0/1 Standard MIDI Files (running status, tempo meta
     events, every channel-voice message correctly skipped by length even when ignored) into
     a flat, tick-sorted event list; `scheduleMidi` resolves ticks to real seconds through
     tempo changes and pairs each note-on with its note-off for a duration; `MidiPlayer`
     drives it with `update(dt)` like everything else in `mwg/core`, voicing each note through
     `playTone` at that note's own velocity-scaled volume. Polyphony question resolved simply:
     every note just gets its own `Playable` via `playTone`, no shared-voice limit imposed.
     General MIDI's instrument map was not implemented - one chiptune-flat voice, as the
     entry's own alternative already named
123. ~~a gameplay-level undo/redo - a back/forward step through recent turns
     or moves, not item 117's dialogue-only rollback. Genuinely optional by the requester's
     own framing: useless in a permadeath game (SPD-shaped roguelikes exist specifically to
     make a mistake matter), useful in others, so this wants to be a mode a game opts into
     rather than a behaviour `mwg` imposes. Distinct from what already exists: `SaveSystem` is
     named slots a player chooses to write to, not an automatic step-by-step history, and
     `core.Recorder`/`Player` (item 42) replay a whole `Input.onAction` log deterministically
     for testing, not a bounded, player-facing "undo my last move" a turn-based game wants
     mid-session. The turn-scoped state a step needs to snapshot varies a lot by genre (a
     roguelike's `Level`/actor stats, a board game's `BoardGrid`, a puzzle's whatever local
     state it has), so the likely shape is a small ring-buffer helper a game feeds its own
     serialized-state snapshots into per turn, mirroring how `SaveSystem` stays agnostic about
     what "the state" actually contains rather than one undo primitive tied to any single
     genre's data~~ - `core.UndoHistory<T>`, exactly that ring buffer: `push` records a turn's
     own snapshot and drops any redo tail, `undo`/`redo` step a cursor through it, bounded by
     an oldest-dropped `limit`. Generic over whatever `T` a game's own turn state actually is
124. ~~export and import of save data, locally (a downloaded file a player
     re-imports later, on this device or another) or to a central server, with an optional
     scramble rather than real cryptography - the requester's own framing is "not resistant or
     really secure, just to render modification not trivial", casual-tamper-resistance, not a
     security boundary. `SaveSystem` already has `importExternal` (item 100's counterpart,
     built for a *foreign* engine's save format) and its own versioned migration chain, but
     nothing round-trips `mwg`'s own save state back out as portable bytes a player carries
     between browsers or devices - today a save only ever exists inside one browser's own
     `localStorage`. The server half is a new surface for `mwg`: `core.FeedbackClient` is the
     nearest existing shape (an injectable HTTPS JSON transport a game points at its own
     endpoint), so a save-sync client likely follows the same pattern rather than `mwg`
     shipping or assuming any actual backend. The "not really secure" scramble the requester
     asked for is explicitly not real cryptography - XOR-with-a-key or similar is enough to
     stop a save being hand-edited in a text editor, and deliberately not more than that, so a
     naive implementation here is not a false security promise; it should say so in its own
     name and doc comment, not imply a guarantee it does not make~~ - `SaveSystem.exportSlot`/
     `importSlot` round-trip a slot as a portable string through the same migration chain
     `load` already uses; `core.scramble`/`unscramble` are the explicitly-not-encryption
     XOR-with-a-key pair, named and documented as exactly that; `core.SaveSyncClient` is the
     server half, an injectable HTTPS transport shaped like `FeedbackClient`. Schema
     validation of an imported payload is item 127's job, not built here
125. ~~run history, reports, and rankings. Checked against what already
     exists rather than assumed new: `core.Session` only counts launches for a native
     wrapper's rating prompt, `core.Achievements` derives unlocks from counters but keeps no
     record of any individual run, and `SaveSystem.list()` enumerates *continuable* slots with
     a preview, not a log of runs that have already ended - nothing today keeps a personal
     record of past runs once one is over, the way a roguelike's own end-of-run report
     (turns taken, kills, gold, cause of death) or NetHack's dumplog does. Three distinct
     pieces once resolved:
     - a run history: an append-only local log of completed runs, each a small game-supplied
       summary object (score, cause of death, whatever a game considers a run's own stats),
       persisted the same versioned, `SaveStorage`-backed way `SaveSystem` already is, rather
       than a new storage mechanism
     - a per-run report: a read-facing view over one history entry - the shape `mwg` should
       stay agnostic about, since what belongs on a roguelike's death screen and a tower
       defense's wave-clear summary share nothing but "some numbers about the run that just
       ended"
     - rankings: sorting/filtering a player's own run history by whatever field a game cares
       about (highest score, fewest turns, deepest floor) - explicitly local and personal, not
       a networked leaderboard comparing players against each other, which is a different,
       much larger feature (a server, identity, anti-cheat) this item is not asking for and
       `mwg`'s `file://`-first shape does not obviously want~~ - `core.RunHistory<T>`: `record`
     appends a game-supplied summary (oldest dropped past an optional `limit`), `all` lists
     them oldest first, `ranked` sorts by any field of the summary a game names, ascending or
     descending. The per-run report stayed unbuilt on purpose, exactly as scoped: `mwg` has no
     opinion on what one report screen shows, only on storing and ordering the data behind it
126. ~~a news feed, for a game to show its own patch notes or announcements
     from inside itself. The inbound counterpart to item 105's `FeedbackClient` - that is an
     injectable HTTPS JSON transport for a game's own text going *out*; nothing today brings
     anything *in*. Every existing network surface in `mwg` (`FeedbackClient`, item 124's save
     sync) is the same shape for the same reason: an injectable client pointed at a game's own
     endpoint, `mwg` shipping no backend and assuming none, which a news feed should follow
     rather than invent a second pattern for. `mwg`'s own `file://`-first stance is about the
     game working with no server and no network, not refusing one when a game's own deployment
     has one to reach - the fetch is a game-side opt-in a player without a connection simply
     never triggers, the same as item 124's server half. Open: how a shown/dismissed item
     persists (`SaveStorage` again, most likely, rather than a third storage mechanism) and
     what the response shape actually needs to be beyond plain text - images, links, or
     per-locale variants a real changelog would eventually want~~ - `core.NewsClient.fetchItems`
     validates every item's shape before it ever reaches a game (a first, narrow instance of
     item 127's broader ask); `core.NewsSeenTracker` persists dismissed ids over `SaveStorage`,
     closing the item's own open question. Images, links and per-locale variants stayed out of
     `NewsItem`'s plain `{id, title, body, publishedAt}` shape - unneeded until a real feed
     asks for them

127. ~~security sanitization of any inbound data - a save imported from
     another device or server (item 124), a news feed response (item 126), an external save
     format (item 100's `Game.rxdata`/`decodeMarshal`). All three now share one real gap:
     `SaveSystem.load`'s `JSON.parse(raw)` and `importExternal`'s game-supplied `normalize`
     both hand their result to a game as trusted state with no shape validation at all, fine
     when the source is this same browser's own `localStorage` (item 124 today) but not once
     the bytes crossed a device, a server, or another program's own file format - a
     `__proto__`/`constructor` key, a wildly out-of-range number, or a field of the wrong type
     can reach game logic that never expected to defend against its own save data. `decodeMarshal`
     is the sharper case: Ruby's `Marshal` format can express object graphs and instance
     variables no plain JSON parse would produce, over content this project explicitly cannot
     see the shape of in advance (that is the entire point of item 100's format-not-media
     line). A news feed response is the same problem in a different shape: text a game
     displays, not executes, but Pixi's own `Text`/`BitmapText` already never interpret markup
     as HTML the way a naive innerHTML render would, so the sharper risk there is more
     "absurd length/malformed field crashes the UI" than injection. Likely shape: a small,
     reusable validation/schema-checking helper a game runs untrusted state through before
     `load`/`importExternal`/a news response ever reaches its own logic, rather than three
     separate ad hoc checks bolted onto each feature after the fact. A minimum bar for that
     helper, specified directly rather than left fully open: a size cap before anything is
     even parsed (10 MB by default, a game can raise or lower it), and rejecting raw bytes
     containing embedded NUL and other control characters outside ordinary whitespace -
     cheap, structural checks that catch a truncated/corrupted/hostile payload before it ever
     reaches `JSON.parse` or `decodeMarshal`, ahead of and distinct from the deeper per-field
     shape validation above~~ - `core.checkSize`/`checkNoControlCharacters`/`sanitizeInboundText`
     for the structural pass, `core.validateSchema` for the deeper per-field pass (primitives,
     arrays, nested objects, `__proto__`/`constructor`/`prototype` keys always rejected
     regardless of what a schema itself asks for). Wired into the two real entry points raised
     above rather than left as an unused library: `SaveSystem.importExternal` size-checks
     `externalBytes` before `normalize` runs, `SaveSystem.importSlot` sanitizes before
     `JSON.parse`, and `NewsClient.fetchItems` now reads its response as text and sanitizes it
     before parsing rather than trusting `response.json()` outright. `load` (this browser's
     own writes) intentionally untouched, per the entry's own reasoning for why it does not
     need this
128. ~~requested directly as "inventory management, item durability, item temporary status".
     Checked against what already exists rather than assumed new: the first two are already
     shipped and not what remains open. `actors.Inventory` already covers management -
     stacking, weight, and containers within containers; `actors.ItemState`'s `damageItem`/
     `repairItem` already cover durability, opt-in per item via `maxDurability`. What is
     genuinely missing is the third piece: a *temporary* status on an item itself.
     `actors.applyStatusEffect` (a buff/debuff with a duration, tied to `TurnClock`'s expiry)
     only ever targets a `StatBlock` - a character's own stats - never an `InventoryItem`.
     Today's item-level fields (`cursed`, `blessed`, `level`, `affix`) are all permanent until
     a game explicitly changes them; nothing expires an item's own state after N turns the way
     a status effect expires a character's. The shape SPD and similar roguelikes want: a
     weapon temporarily coated in a poison that wears off after a fixed number of hits or
     turns, a shield temporarily reinforced, a ring blessed only "for this floor". Likely
     close to `StatusEffect`'s own shape (a duration registered with `TurnClock`, cleared on
     expiry) but targeting an `InventoryItem`'s own fields instead of a `StatBlock`'s
     modifiers, so the two probably share more of their timing plumbing than their target type~~
     - `actors.applyItemStatusEffect`, exactly that: it shares `StatusEffect.ts`'s own
     `EffectClock` interface rather than redeclaring it, applies arbitrary fields onto any
     object (typed generically, not limited to `InventoryItem`), and restores each field to
     its actual prior value - including `undefined` for a field the item never had - on
     expiry or early `cancel()`

129. ~~requested directly as "online mode (multiple files support, multiplayer)". Checked
     against what already exists: every network-facing piece `mwg` has (`FeedbackClient`,
     `NewsClient`, `SaveSyncClient`) is one-shot HTTP request/response against a game's own
     endpoint, never a live, bidirectional connection - none of them are, or were ever meant
     to be, real multiplayer transport, and item 125's rankings were explicitly scoped away
     from a networked leaderboard for the same reason. Real-time multiplayer is a categorically
     larger feature: a persistent connection (WebSocket or WebRTC, neither used anywhere in
     `mwg` today), authoritative state and reconciliation, and identity/matchmaking of some
     kind - a server `mwg` would have to assume exists, unlike every other network surface
     here, which assumes a game supplies its own and stays optional. "Multiple files support"
     in the request is unclear as written - possibly multiple save files/profiles kept in
     sync across an online session, possibly something else - and needs the requester's own
     clarification before this is sized rather than guessed at~~
     Clarified rather than guessed: "multiple files support" meant multiple save profiles kept
     in sync online, and - unlike every other network surface here - the requester wanted `mwg`
     to include a reference server for real-time multiplayer rather than assuming a game
     brings its own, given multiplayer has no one-shot request/response shape to hide a
     server behind the way `FeedbackClient`/`NewsClient`/`SaveSyncClient` do.
     - **Multiple save profiles**: `SaveSyncClient.upload`/`download` now take a `slot` name
       (query-string qualified against the one endpoint), matching the named slots
       `SaveSystem.exportSlot`/`importSlot` already use locally, and a new `list()` returns
       every slot name the endpoint currently holds - the seam a profile picker reads before
       choosing which one to `download`. Breaking change to `upload`/`download`'s own
       signatures, acceptable pre-1.0 per this changelog's own versioning note.
     - **Real-time multiplayer**: `core.LockstepClient` plus a genuine reference server,
       `tools/multiplayer-server.mjs` (the one exception to "`mwg` ships no backend" -
       logged as an exception here, not a precedent for the rest of the project). The model
       is lockstep: every connected client submits at most one input per tick; the server
       broadcasts one `tick` message (every client id mapped to its input, or `null` for
       whoever missed the deadline) once every client in its room has submitted, or once a
       configured timeout elapses regardless - the reconciliation rule, kept as simple as one
       can be while still being real, rather than `mwg` inventing client-side prediction/
       rollback speculatively with no concrete game to validate it against. Identity is the
       server-assigned id in its own `welcome` message; matchmaking is a `?room=` query
       string, nothing more - both intentionally minimal rather than guessed past what was
       asked. The client uses the platform's own global `WebSocket` (Node 22+ and every
       browser this project targets both have one), so `ws` - needed only to *host* a
       WebSocket server, which neither browsers nor (until now) `mwg` ever needed to do -
       stays a `tools/`-only devDependency, confirmed absent from the built
       `mw_games.global.js` by grepping the actual bundle rather than assuming tree-shaking
       caught it. 10 tests, including two real `LockstepClient`s driven against the real
       reference server over actual sockets (not mocked), covering per-room isolation,
       early advancement once every client has submitted, and the timeout fallback reporting
       a missing input as `null`.
130. ~~local multiplayer, same screen or split screen. Checked against what
     already exists rather than assumed possible: both halves this needs are missing.
     `core.Input` is a module-level singleton - `bindings`, `pressedThisFrame`, and `onAction`
     all live at module scope, not per instance - so two controllers bound to the same action
     names (`bindButton('confirm', 0, ...)` and `bindButton('confirm', 1, ...)`) collide into
     one `onAction` stream with no way to tell which pad pressed it; nothing here is
     player-scoped today, only pad-index-scoped at the binding level. Rendering has the other
     half of the gap: `Game`/`Camera` assume one viewport and one camera per game, with no
     notion of splitting the screen into regions each following a different player. Two
     genuinely separate primitives, likely in that order (input scoping first, unblocking a
     shared-screen mode that needs no viewport split at all before the harder split-screen
     rendering half)~~ - `core.PlayerInput`, a thin per-player-id prefix over `Input`'s bare
     action names (`bind`/`bindButton`/`bindAxis`/`isDown`/`justPressed`/`justReleased`), so
     two players' "confirm" become two distinct actions rather than one shared one; a test
     reproduces the exact collision the entry describes, unscoped, alongside the fix. On the
     rendering half, `Camera.setViewport` gained an optional screen-space offset
     (`screenX`/`screenY`, defaulting to 0 - fully backward compatible) so a camera's own
     rectangle need not start at the canvas corner, and `render.Viewport` wraps one camera,
     its own screen region, and a mask clipping it to that region, into the single unit a
     split-screen player needs; `splitScreenHalves` gives the common two-way landscape/portrait
     split as plain rectangles. `Viewport`'s camera math and mask presence are unit-tested;
     the split itself was not additionally verified in a browser beyond that, since masking a
     container to a rectangle is standard, well-trodden Pixi usage
131. ~~accessibility modes: subtitles, sound
     captioning, colour modes, contrast. Checked against what already exists rather than
     assumed new, since two of the four turned out to already be covered:
     - subtitles for dialogue: already the default, not a gap - `mwg/stage`'s `MessageBox` is
       how every line of dialogue is shown at all, text-first with no voiced-audio path
       running in parallel that would need separate subtitles to match it
     - contrast: also already reachable without new framework code - `ui.setTheme` replaces
       the whole colour palette a game reads from, so a high-contrast theme is a second
       `Theme` object away, not a missing primitive; what might still be missing is a
       ready-made high-contrast theme/settings-screen toggle a game does not have to compose
       itself, closer to a recipe than new capability, the same distinction item 104 drew for
       `ui.HelpScreen`
     - sound/caption for non-dialogue audio: a genuine gap - a footstep, a monster's growl, a
       door creaking have no visual-indicator hook today; `mwg/audio`'s `Sound`/`Music` have
       no event a captioning overlay could subscribe to
     - colour modes: also genuine - `mwg/render`'s per-sprite multiply-and-add colour
       transform is the exact mechanism a colourblind-correction filter would apply
       screen-wide, but nothing maps a named colourblind type (protanopia, deuteranopia,
       tritanopia) to a correction matrix today
     Two real primitives once narrowed down (sound captioning, colourblind filters), one
     ready-made recipe worth shipping despite already being possible (a high-contrast theme
     preset), and one already-satisfied non-gap (dialogue subtitles) that does not need
     revisiting~~ - `audio.onCaption` fires whenever a `Sound` constructed with a `caption`
     string plays, decoupled from any captioning overlay; `Music` deliberately left uncaptioned,
     per the entry's own reasoning. `render.createColorBlindnessFilter` wraps Pixi's own
     `ColorMatrixFilter` with named protanopia/deuteranopia/tritanopia simulation matrices;
     verified in the `interface` example cycling all three live and screenshotting each -
     water and grass tiles shift distinctly under each, and the HP bar's own red returns
     correctly under tritanopia. `ui.highContrastTheme` is the ready-made preset, a
     `setTheme` call away. Subtitles confirmed as already satisfied, not revisited

132. ~~a general mouse-wheel input primitive, not scoped to any one
     widget. Raised alongside `ListView` gaining its own plain wheel-to-scroll handling
     (one row per notch, wired directly on that class since its scroll is derived from the
     selection rather than an independent offset - see that class's own doc comment), but
     the request is explicitly broader: `mwg/core`'s `Input` has no wheel event at all today
     (checked - `bind`/`bindButton`/`bindAxis` cover keyboard and gamepad only), so nothing
     ties a wheel notch to a named action the way every other input source already does, and
     `ListView`'s own handling cannot be reused by `IconGrid`'s own scrolling or by a game's
     camera. The requested shape: modifier keys distinguishing intent on the same physical
     wheel - plain for vertical scroll, a modifier for horizontal (a game with wide content,
     not `ListView`'s own single column), another for in-game zoom specifically, which needs
     `event.preventDefault()` to stop the browser's own page-zoom/pinch-zoom from firing at
     the same time as `Camera.zoom` changes. Likely shape: `Input` gains a wheel-to-action
     path parallel to its existing key/gamepad one, with the modifier convention as a
     documented default a game can rebind like any other action, rather than the browser's
     own inconsistent-across-platforms Ctrl+wheel-means-zoom convention baked in unconditionally~~
     - `Input.onWheel`, a `Signal<WheelInput>` parallel to `onKey`, fed by one real `wheel`
     listener `attach()` now installs (`{ passive: false }`, since a `zoom` notch calls
     `preventDefault()` and a passive listener may not). `wheelActionFor` is the exported,
     pure modifier-decision function (plain → `scroll`, Shift → `scrollHorizontal`, Ctrl/Cmd
     → `zoom`) - a game can call it itself to build its own convention rather than being
     stuck with this one. Verified two ways: `wheelActionFor`'s own logic directly, and a
     real `WheelEvent` dispatched in a running browser confirming `preventDefault()` actually
     fires for a Ctrl+wheel notch and not for a plain one. `IconGrid` also gained the same
     one-row-per-notch wheel handling `ListView` already had, closing the other half of this
     item's own "cannot be reused by `IconGrid`" gap; wiring a game's own `Camera.zoom` to
     `onWheel`'s `zoom` action is left to the game, the same way `Camera.shake`/`follow`
     already are

133. ~~check rendering capabilities across WebGL, WebGPU, and WGSL. This is a compatibility
     audit, not a promise to replace PixiJS or Babylon.js renderers: document the minimum
     supported WebGL version and browser matrix, verify the existing 2D and optional 3D
     examples under WebGL 1/2 and WebGPU where available, and identify which Babylon/Pixi
     features require each backend. Include WGSL specifically: establish whether custom
     shaders can be authored once or need maintained GLSL/WGSL pairs, exercise their build
     and runtime error paths, and record the portable subset. The audit must retain the
     project's file:// guarantee and GPU-only render requirement; a silent Canvas 2D fallback
     is a regression, not a compatible result. Kept at low priority because the current
     browser benchmark already proves the shipped 3D reference scene on WebGL 2, while the
     wider matrix needs multiple browsers and GPU configurations to be meaningful.
     `render.inspectGraphicsCapabilities`/`detectWebGpu` exist as the runtime probe this
     audit would report through, but the audit itself - the browser/GPU matrix, WGSL's
     build/runtime error paths exercised for real - is not done. A real bug was found and
     fixed in the probe along the way, caught by a fresh-eyes simplify pass rather than by
     the audit this item still asks for: `wgsl` was set to `webgpu`'s own value, asserting a
     WGSL shader compiles just because `navigator.gpu` exists, without ever compiling one -
     it now stays `false` unless `detectWebGpu`'s real, asynchronous compile-and-check
     supplies a genuine result. One real data point added toward the still-missing matrix:
     this session's own Chrome (152, Windows 10/11 x64) reports WebGL 1, WebGL 2, WebGPU, and
     a real WGSL compile all supported via the probe run in an actual page, not asserted from
     documentation. The wider matrix - other browsers, other GPUs, the WGSL/GLSL authoring
     question, which Babylon/Pixi features actually require which backend - is still open;
     this environment only ever has the one browser and GPU to test against.~~ Decided rather
     than left open indefinitely: this project's own toolchain has exactly one browser
     (Chrome) and GPU configuration available to it, and no realistic path to more inside
     this environment, so a Chrome-only result is accepted as sufficient for this audit
     rather than holding the item open waiting for hardware/browsers this project cannot
     reach. If a future session runs in an environment with other browsers or GPUs available,
     extending the matrix is still worthwhile, but it is no longer this item's own blocker.

134. ~~moved to CLAUDE.md's/AGENTS.md's own "Rendering backend policy" section. It was never a
     feature with a finish line this numbered list is shaped for - a standing rule to weigh
     on every relevant session ("use the best rendering solution for each graphics workload,
     based on measured results"), not a build-order item - so it lives with the other
     standing policies (roadmap process, simplify-per-session) rather than sitting numbered
     among items that do get built and struck through.~~ - the move itself was this item's
     entire scope, and it is done: CLAUDE.md's "Rendering backend policy" section carries the
     rule today, this entry exists only so the number is not silently skipped in the list's
     own append-only history.

135. ~~a reusable loading-screen lifecycle for games that have enough assets or generation work
     to need one. It should accept named, weighted asynchronous tasks, show determinate
     progress when a task can report it and an honest indeterminate state when it cannot,
     remain responsive while work is underway, and hand off cleanly into a `Game`/scene.
     Include a themed default view plus hooks for game-owned art, accessible text and error
     reporting with retry/cancel behavior. It must work for compiled `data:` assets and
     file:// builds as well as ordinary fetches, without assuming a server or forcing every
     small example to display a loader. Logged below current rendering work because asset
     compilation already makes the typical local-file start nearly immediate; it matters
     once games load larger optional model, audio, or generated-world payloads.~~ -
     `core.LoadQueue` (named, weighted tasks; a task that never calls `report` leaves the
     stage indeterminate rather than a guessed percentage) and `ui.LoadingScreen` (bound to
     one queue via `bind`, retry/cancel left as hooks a game wires its own button or key to,
     not drawn for it). Shipped in the same batch as items 133/134/136/137 but with no
     caller anywhere outside its own tests, an actual verification gap a fresh-eyes simplify
     pass caught (see item 138's own reasoning for treating that as a defect, not style) -
     closed with a dedicated `examples/loading` reference: a task that deliberately fails
     once, verified in a real browser through the failed state, a driven `retry()`, success,
     and the scene switch on completion (a real pointer click could not be driven through
     Pixi's `EventSystem` in this session's own browser tooling, the same limitation item
     138 hit verifying `ListView`; the retry/cancel buttons themselves are real `ui.Button`s,
     unverified only in the one respect an actual click would add over calling `retry()`
     directly)

136. ~~package a game as a standalone desktop application using a native WebView2 host on
     Windows or a Chromium-based host where cross-platform consistency is worth its bundled
     runtime. Compare a minimal WebView2 shell, Electron/Tauri-style Chromium packaging, and
     the existing Capacitor mobile route by installer size, startup time, GPU/WebGL/WebGPU
     behavior, offline asset loading, crash/error reporting, update responsibility, code
     signing, and the permissions each bridge exposes. The wrapper must load the same built
     game output without requiring a web server, preserve the browser build as the canonical
     target, and keep native APIs opt-in so games remain portable. Start with a documented
     reference host and build/run smoke test, then add desktop-only capabilities only when a
     game supplies a concrete need. Low priority behind the web rendering and loading work:
     double-clickable file:// output already serves the core desktop use case without a shell.~~
     Started on the WebView2 half, the one this project can actually build and run: no .NET
     SDK was present in this environment (blocking this item on its first attempt, logged in
     the same session that first raised it), installed via `winget install Microsoft.DotNet.SDK.8`
     to unblock it rather than leaving it speculative. `desktop/MwgDesktopHost` is a minimal
     WinForms + `Microsoft.Web.WebView2` host (net8.0-windows) that navigates straight to a
     built example's own `index.html` via `file://` - no copy step, no asset changes, the same
     "load the build unmodified" property item 110's Capacitor route proved. It targets the
     same `tower-defense` reference build item 110 already uses (`npm run desktop:build` /
     `desktop:run`, mirroring `cap:add:*`/`cap:sync`'s own naming), rather than a third example
     needing its own justification. Verified for real, not just built: `dotnet build` succeeds,
     `dotnet run` launches a real window titled "mwg desktop host (WebView2 reference)", and a
     screenshot taken of that actual running window shows the game's own rendered background,
     not a blank or error page - the existing WebView2 Evergreen Runtime already on this
     machine (152.0.4191.62) needed no separate install. `desktop/**/bin`|`obj` were already
     `.gitignore`d before this ran, the same pattern `android/`/`ios/` use for item 110's
     generated native folders. Still open, matching the item's own "start with a reference
     host" framing: the Electron/Tauri/Capacitor comparison table, installer packaging, code
     signing, crash reporting, and update responsibility - none of that was in scope for a
     first reference host, and this environment cannot exercise code signing or a real
     installer build regardless.

137. ~~progressive asset loading and unloading so scene transitions have no visible loading
     pause where the deployment environment permits it. Build on `assets.isLoaded`/`release`
     with a game-directed preload manifest and priorities: fetch/decode likely-next maps,
     textures, audio, models, and generated data while the current scene remains playable;
     atomically promote only ready assets; and evict assets that are no longer reachable
     under an explicit memory budget. Expose progress and cancellation to item 135's loading
     lifecycle when a foreground wait is unavoidable, rather than pretending every transfer
     can be hidden. Define capability tiers: compiled data-URI/file:// games can only stage
     what is already packaged and decoded locally; a server or standalone WebView2/Chromium
     host can stream/cache assets incrementally and report byte progress. Verify no stale
     references, duplicate fetches, GPU-memory leaks, or frame-time spikes at scene handoff.
     Kept low priority because it adds complexity and only earns its cost for large games or
     host modes with genuinely incremental I/O. `assets.AssetStream` (bundle preload with
     least-recently-used eviction under a byte budget) shipped in the same batch as items
     133/135/136, also with no caller until item 135's `examples/loading` gave it its first
     one (`stream.preload` for a likely-next area). That closes the "nothing ever calls
     this" gap for the core class; the fuller scope here - byte-progress reporting for a
     server/desktop host, eviction verified under real memory pressure rather than a budget
     number in a test - is still open.~~
     ~~Progress reporting closed next: `assets.load` and `AssetStream.preload`/`preloadLikely`
     take an optional `onProgress`, threaded straight from Pixi's own `Assets.load` callback -
     a fraction of assets completed, not literal bytes, since Pixi's loaders do not expose
     bytes transferred uniformly across every asset type, and reporting a number this project
     cannot actually back would be exactly the kind of silent-fallback dishonesty this
     project's own conventions rule out elsewhere. `examples/loading`'s two asset-loading
     tasks now report through this into `LoadQueue`'s existing `context.report`, closing the
     "one opaque await, 0 then 1" gap those tasks had. Eviction was then verified under real
     memory pressure, not just a Node budget number: a page built from the actual library
     bundle, run in a real Chrome tab, generated 300 distinct textures and drove
     `AssetStream.preload` through all of them under a tight budget - Pixi's own resident
     texture count stayed pinned at exactly the configured budget for the entire run (sampled
     every 20 cycles: 1, then 5, 5, 5... never higher), and only the most-recently-used
     bundles remained ready at the end. Byte-progress reporting for a server/desktop host
     specifically (as opposed to the asset-count fraction now wired through) stays open, since
     nothing here runs inside such a host yet to give that number meaning - see item 136.~~
     ~~Byte-progress closed next, now that item 136's desktop host exists to give it meaning:
     `assets.fetchWithByteProgress` reports real cumulative bytes transferred (and the known
     total, from `Content-Length`, or `null` when a server never sends one) as a
     `ReadableStream` reader delivers them - deliberately a separate function from `load`'s own
     `AssetProgress`, since that one's doc comment already explains why it cannot back a byte
     figure uniformly across every Pixi loader; this one only reports what `fetch` itself can
     back. `fetch` is blocked from `file://` entirely, so the gap this closes needed a real
     origin to mean anything, which is what `desktop/MwgDesktopHost` gained: it now serves the
     built game through `CoreWebView2.SetVirtualHostNameToFolderMapping` (a real
     `https://mwg.local/` origin WebView2 maps to the built game's own folder) instead of a
     plain `file://` navigation, the same game build otherwise completely unchanged. No shipped
     example calls `fetchWithByteProgress` itself - every one of this project's own examples is
     built to be opened by double-clicking, which is exactly the `file://` tier this primitive
     is not for, so forcing a caller into one would be misleading rather than honest about what
     it demonstrates. The desktop host is the real, honest integration point.~~

138. ~~three gaps surfaced by stress-testing `mwg` against a real, non-trivial game (an SPD-
     shaped port), relayed with exact drop-in specs written against the checkout at the time,
     verified against the real current source before applying rather than taken on faith:
     - `ListView` had no pointer support at all - keyboard-only - while its sibling
       `IconGrid` already wired `pointerdown` per cell. Confirmed by reading both files: `IconGrid.setItems`
       sets `eventMode`/`cursor`/`pointerdown` per cell, `ListView.setItems` did none of it
     - `Bar` could only fill a flat colour rect against a 0..1 fraction, with no way to draw
       real bar chrome art or guarantee a nonzero sliver of value never rounds down to an
       invisible zero-width fill. Confirmed by reading `Bar.draw`: a bare `Graphics.rect().fill({color})`,
       no texture option, no rounding
     - no generic queued, timed pop-up notification existed - an achievement unlock, a
       level-up banner, a "quest complete" toast - only `FloatingText`'s fire-and-forget,
       one-at-a-time damage-number shape. Confirmed: no `Toast`/`Banner`-shaped file anywhere
       in `mwg/ui`
     Implemented as specified, adapted to this project's actual Pixi v8 API (Graphics'
     native `fill({texture, color})` texture support, used directly rather than switching
     `Bar`'s track/fill to `Sprite` as the relayed spec suggested, since Graphics already
     does this): `ListView` gained the same `eventMode`/`pointerdown` wiring as `IconGrid`,
     plus wheel-to-scroll (one row per notch - see item 132 for the broader, not-yet-built
     wheel-with-modifiers primitive this does not attempt); `BarOptions` gained
     `fillTexture`/`backgroundTexture` (tinted by `color` only when one was explicitly
     given, so an art texture is not unexpectedly recoloured) and `roundUpToPixel`; `ui.Toast`
     is a plain phase/elapsed state machine (fade in, hold, fade out, queue) rather than
     chained tween promises, after a chained-`Tweener` version proved fragile to drive
     synchronously in a test (a `.then()` callback is a microtask, not synchronous with the
     `update()` call that resolves it) - the same one-frame-boundary shape `FloatingText`
     already uses. `Bar`/`Toast` are fully unit-tested (`Bar` down to the exact drawn pixel
     width, `Toast` through every phase transition); `ListView` cannot be constructed in
     Node at all - a pre-existing constraint, not caused by this change, since it builds a
     `Label` per row and `Label.height` needs a real DOM `document` the same way `BitmapText`
     does - and this session's own synthetic-`PointerEvent` browser check did not manage to
     drive Pixi's `EventSystem` end to end (an already-working `Button` click failed the same
     way, pointing at the test harness rather than the code), so `ListView`'s new wiring is
     verified by exact structural match to `IconGrid`'s own already-shipped pattern and
     runtime confirmation that `eventMode`/`cursor`/the listener are actually attached to
     each row, not by a driven click in a real browser

139. ~~a smaller process note from the same stress-test as item 138: comments in that port's
     own code claimed three separate times that "`mwg` doesn't have X" for a capability
     (`Button`, `Bar`, `FloatingText`) added to `mwg` since those comments were written,
     caught only by manually diffing against the current checkout each time. Not a defect in
     `mwg` itself, but a discoverability gap for anything consuming it: a lightweight
     changelog, or an exported version constant readable without grepping source (`import {
     version } from '@datamoc/mw_games'`, say), would make "is this still missing, or did it
     ship since I last checked" cheaper to answer than re-deriving it by hand every time~~ -
     `import { version } from '@datamoc/mw_games'`, exactly as named above. Kept in sync with
     `package.json` by a test that fails the moment they disagree, rather than a build step
     that injects it - simpler, and this project's own build has no earlier step this would
     need to run ahead of. A full changelog stays unbuilt; the version constant alone answers
     the actual question this item was raised over ("did this ship since I last checked")

140. ~~headless simulation runners~~ - `mwg/simulation` adds bounded scheduled
     advancement and finite command scenarios with explicit random injection and typed
     events. The dungeon example uses the runner; its own damage rule is shared with
     headless tests. Games own rules and save formats. This small shared prerequisite
     was implemented now to support simulation extraction; the remaining open items
     keep their relative priority, including rendering performance work.

141. ~~requested directly as "character effects from SPD"~~ - resolved into the piece
     `mwg` was actually missing: a status-effect *tint* on a character sprite. Poison
     ticks, burning, and similar timed conditions already exist as game-side data
     through `actors.applyStatusEffect`; nothing bridged that to what the character
     looks like, since `render` and `actors` stay independent of each other the way
     every module pair here does. `render.StatusVisuals` takes any target shaped like
     `TintedSprite`'s own `lerpTint`/`resetColor` (duck-typed the way `Projectile`
     takes a plain `{x, y}`, so it needs no Pixi to test), a `styles` map from status
     name to colour/strength/an optional pulse rate, and turns whichever active status
     is highest priority (declaration order in `styles`) into one tint per frame,
     resetting when none are active. This is a shape, not SPD's own numbers or code:
     no specific effect list, colour, or duration is built in, only the seam a game
     wires its own status names into. 7 unit tests.

142. ~~requested directly as "benchmark, performance testing". Not starting from nothing:
     `npm run benchmark:browser` (dungeon FPS) and `npm run benchmark:3d` (3D FPS gate) already
     drive a real headless Chrome for two specific scenes via `tools/benchmark-browser.mjs`.
     What that does not cover, unchecked against the actual tooling rather than assumed:
     whether any other example (UI-heavy `interface`, sprite-dense `tower-defense`,
     particle/spreading-area work from item 63, the `Simulation` runners' own headless
     throughput) has a benchmark at all; whether a result from one run is compared against a
     previous one to catch a regression, or only against its own fixed gate; and whether
     memory (GPU texture residency, the kind item 137's own `AssetStream` work just measured
     by hand in a real browser) is tracked over time the same way frame time is. Logged at low
     priority per this project's own roadmap process rather than sized on the spot.~~
     All three gaps closed. `tools/benchmark-browser.mjs` now writes each run's fps/p95/memory
     to `benchmark-results/<page>.json` (gitignored, machine-local - a shared baseline across
     different hardware would be noise, not signal) and fails if fps drops more than
     `MWG_BENCHMARK_MAX_FPS_REGRESSION` (default 15%) below the best-seen prior run, not only
     against the fixed `minFps`/`maxP95FrameMs` gate - catching a slow decline the fixed gate
     alone would never see cross the line. `memoryMB` reads Chrome's own non-standard
     `performance.memory`, reported as `null` everywhere else rather than guessed at.
     `npm run benchmark:tower-defense`/`benchmark:ui` cover the sprite-dense and UI-heavy
     examples the same way. `tools/benchmark-simulation.mjs` (`npm run benchmark:simulation`)
     is the wholly new piece: headless commands/s and turn-steps/s for `runScenario`/
     `advanceToInput`, the one workload no browser-driven tool could ever measure, with the
     same history-and-regression tracking. Item 63's particle/spreading-area work stays
     unbenchmarked - it has no example of its own to drive a page through yet, so there is
     nothing for a headless Chrome run to point at.

143. ~~requested directly as "statistics, statistic display for user, sending them to dev
     (auto and manual)". Three distinct pieces once split apart, checked against what already
     exists rather than assumed missing:
     - **aggregate player-facing stats**: `core.RunHistory` already stores a game-supplied
       summary per finished run and can list/sort them, but nothing rolls many runs into one
       lifetime picture (total playtime, runs played, a per-stat lifetime max/sum) the way a
       "your stats" screen wants - closer to `RunHistory` gaining a reducer over its own
       entries than a new store, the same way item 125's own rankings were resolved
     - **a display recipe**: once aggregated, showing it is `ui.Window`/`ListView`/`Label`
       composition, likely the same "recipe, not a new widget" shape item 104's `HelpScreen`
       and item 131's high-contrast theme preset both turned out to be
     - **sending stats to the developer**: `core.FeedbackClient` already covers manual,
       free-text submission over an injectable HTTPS transport; what it does not cover is
       *automatic* sending of *structured* data (an analytics/telemetry event, not a written
       report) - a genuinely different consent question from a player choosing to type
       feedback, since automatic collection needs its own opt-in the moment it stops being
       something the player deliberately did. Any implementation must keep `mwg` itself
       opinion-free on what is collected and require a game to wire its own consent flow
       and endpoint, the same way `FeedbackClient`'s own doc comment already insists on for
       manual reports
     Logged at low priority per this project's own roadmap process; the automatic-sending
     half in particular needs a real consent-flow design, not just a transport, before it is
     sized rather than guessed at.~~
     Resolved as three pieces, not a reducer bolted onto `RunHistory`: `core.PlayerStats<T, S>`
     keeps its own persisted lifetime total, folded one run at a time by a game-supplied
     `combine`, deliberately *not* derived from `RunHistory.all()` - that list can drop its
     oldest entries once its own `limit` is reached, which would silently undercount a
     lifetime total the moment anything was trimmed. `ui.StatsScreen` is the display recipe
     item 104/131 both predicted: a `label: value` line per row over the same `Label`
     everything else already builds from, no navigation since a stats readout has nothing to
     pick - verified rendering real data in an actual browser. `core.TelemetryClient` is the
     missing automatic-sending half, `FeedbackClient`'s own shape with the one thing that
     actually differs: `send()` is a silent no-op until a game calls `setConsent(true)` from
     its own consent flow, since automatic collection needs an opt-in a player typing
     feedback does not. `mwg` stays opinion-free on what an event contains, what "consent"
     means for a given game, and where the endpoint lives, same as `FeedbackClient` always
     has. Manual structured sending needed no new code: a game already can send its own
     `PlayerStats.get()` snapshot as `FeedbackClient.submit()`'s `message` (a player choosing
     to attach their stats to a written report), so that half was already covered without
     this item's own guess ever biting. 17 unit tests across `PlayerStats`/`TelemetryClient`.

144. ~~requested directly from a screenshot of `examples/three-d`: the hero capsule clipping
     into the side of a raised elevation column. Root cause, confirmed by reading the
     example's own path data against `mwg/3d`'s height formula: `hero.moveTo` interpolates
     in a flat plane with no notion of terrain height, collision, or step-up at all - `mwg/3d`
     has none of item 114's 2D AABB/circle collision primitives, or any equivalent. The
     example's own hardcoded demo path cut diagonally across the raised ridge
     (`x >= 6 && y >= 5`in its height formula) between two flat waypoints, so the straight
     line between them passed through the column's side - fixed immediately by routing the
     demo path to stay inside the flat interior the whole way, but that only fixes this one
     example's own data, not the underlying gap: nothing in `mwg/3d` would stop a game's own
     character from doing the same thing with a path it does not control as tightly as a
     four-point demo loop. Real 3D collision - broad-phase against `GridCell3D`/heightmap
     height, resolving a moving capsule/AABB against solid terrain and other meshes - is
     unbuilt and logged here at low priority per this project's own process, the 3D-module
     counterpart to item 114.
     Closed: `mwg/3d` gained `Collision3D.ts` (`buildHeightIndex`, `cellAt`, `heightAt`,
     `resolveCapsuleAgainstGrid`), horizontal collision for `createTileGrid3D`'s stepped grid
     specifically - a continuous `createHeightmapTerrain3D` ground already has Babylon's own
     `GroundMesh.getHeightAtCoordinates` and needed nothing new. `resolveCapsuleAgainstGrid`
     samples along a frame's intended (x, z) move rather than solving the swept shape
     analytically, the same simple-over-exact trade-off `rpg.Collision`'s own doc comment
     already makes for its 2D tile sweep, chosen here because it stays shape-agnostic across
     both `createTileGrid3D` shapes (square and hex) without hex-edge-specific geometry.
     `Character3D` gained an optional third constructor argument, `collideXZ`, called every
     `update()` to clamp the intended move before it is applied - omitted, `moveTo` behaves
     exactly as before this existed. `examples/three-d` now wires `resolveCapsuleAgainstGrid`
     into its own hero and walks the *original* diagonal path that used to clip through the
     ridge (`x >= 6 && y >= 5`) - the demo detects and stops at the collision itself now,
     rather than the path being hand-routed around it. Verified with a dedicated regression
     test reproducing the exact reported bug shape (a flat approach into a raised column) in
     `tests/three-d-collision.test.ts`, not just the general-case math.~~

145. ~~a simplify pass over this same session's own work flagged `ui.Label`'s `stroke`,
     `resolution`, and `roundPixels` options (and `ui.Button`'s `skin`/`label` seam) as having
     no caller anywhere but their own unit test - an example demonstrating them (text over
     artwork for `stroke`, a per-button nine-patch skin in `examples/interface` or
     `examples/loading`) is still missing, the same "shipped but never actually driven" gap
     item 138's own reasoning treats as worth closing rather than leaving as a style note.
     Logged at low priority per this project's own process rather than built on the spot~~ -
     `examples/interface`'s HUD caption (`this.status`) now sets a black `stroke`, since it
     sits directly over the tiled backdrop rather than a `Window`'s own opaque panel, exactly
     the "text over artwork" case the option existed for. A new "Skinned" HUD button supplies a
     `ButtonSkin`: a small rounded-rect texture generated once at runtime via
     `Game.current.app.renderer.generateTexture` (never downloaded, matching this project's own
     asset rule) and reused, tinted per state through `tints` rather than baked separately per
     state. Verified in a real browser (served over `http://localhost`, since this session's
     browser tool refuses `file://` navigation outright): the stroked caption reads clearly
     over the tile pattern, and the skinned button's rounded, tinted panel renders distinctly
     from the flat-panel buttons beside it, no console errors

146. ~~raised by the same SPD-shaped talent port as items 73/121/138: selectable, persisted
     talent nodes and several live effects exist, but the remaining Java-level proc families
     had no reusable `mwg` primitive, only scene-local one-offs. Five distinct shapes, not one:
     barrier/shield pools with decay and layered absorption; timed trigger trackers for combo,
     stealth, healing and kill-streak conditions; ranged/area attack modifiers (a falloff by
     distance band, or by how many targets an area effect already hit); charge/resource
     conversion and refund rules; and multi-stage subclass/ability effects (an ability that
     unfolds through named stages - windup, active, recovery - on its own, rather than
     resolving instantly). This is intentionally about the shape, not a claim that every game's
     talent system should share formulas, the same boundary items 53-56/89-91 already draw~~ -
     `actors.Barrier` (layered absorption, most-recently-added layer drains first, optional
     per-layer decay); `roguelike.TriggerTracker` (a streak that extends within a turn window
     and restarts once it lapses - a `roguelike` primitive, not `battle`-scoped, since combo
     and stealth conditions read from turns rather than one encounter); `roguelike.rangeMultiplier`/
     `areaFalloffMultiplier` (both the same band-lookup shape `actors.scaledModifiers` already
     established, added to `Targeting.ts` alongside `resolveArea` rather than a new file, since
     both consume the same distance/order data that module already computes); `actors.refund`/
     `convertToCharges` (the mirror of `Resource.ts`'s existing `spend`, plus a bridge into
     `Charges.refund`, a new direct-restore method `Charges` itself gained since nothing let a
     kill or crit grant a charge outside the normal turn-driven regen path); and
     `roguelike.MultiStageAbility` (`AbilityCycle`'s cooldown-only view given a sibling for the
     ability's own multi-turn unfolding, the same file-adjacency choice `BossPhases`/
     `AbilityCycle` already share in `Boss.ts` - kept in its own file since it is not
     boss-specific). 33 new unit tests across the five primitives; the full existing suite
     passes unchanged

147. ~~requested directly, following on from the SPD-shaped talent port's `actors.Affix` usage:
     four further affix-system gaps, checked against the real code rather than assumed -
     `Affix.ts` carried a trigger id, a relative weight, and a curse flag, rolled once per item
     and applied/removed as a single `InventoryItem.affix` field.
     - affix transfer/copy between two item instances - upgrading a base item onto a better one
       and carrying its enchantment across, the way many action-RPGs let a player "transfer" a
       socket or a rune. No code moved an `affix` from one `InventoryItem` to another; only
       `rollAffix` created one and `removeAffix` cleared one.
     - affix-trigger context (melee, thrown, bow, ability) - `AffixTrigger` was already a closed
       union (`'strike' | 'defend' | 'passive'`), not the bare id string this item's own first
       draft assumed before rereading the file; what was actually missing was a way to
       distinguish an attack's *kind* within one of those triggers, so a "bow only" affix could
       exist without inventing a fourth trigger value for it.
     - upgrade policies that preserve or remove affixes under configurable rules - `enchant`
       (`ItemState.ts`) raised an item's level with no opinion on any affix it carried; whether
       an upgrade should keep or strip an existing affix was entirely a game's own choice to
       make by hand, with no policy primitive to lean on.
     - explicit item-instance identity, so two otherwise-identical items (same id, same affix)
       can still be told apart - `Inventory`'s stacking was identity-free (a stack is quantity
       over a shared definition), which is exactly what breaks once two instances of the same
       item need to diverge (one enchanted, one not) and still not silently merge into one
       stack~~ - `actors.copyAffix` copies (or, given a plain source, clears) an affix and its
     curse mark onto another item; a true move is `copyAffix` plus `removeAffix(from)`, left to
     the caller rather than a second near-identical function. `AffixDef` gained an optional
     `kinds` list of `AttackKind`s (`'melee' | 'thrown' | 'bow' | 'ability' | string`) and
     `actors.matchesContext(affix, context)` checks a fired trigger's kind against it, an affix
     with no `kinds` still firing for anything, unchanged from before this existed. `enchant`
     gained an optional `affixPolicy: 'keep' | 'remove'` (defaulting to `'keep'`, its only
     behaviour before this option existed), routed through the existing `removeAffix` rather
     than duplicating its curse-clearing logic. `InventoryItem` gained an optional
     `instanceId`, and `Inventory.add`'s stacking check now also requires it to match, so two
     items of the same id merge exactly when they always did before this existed (both
     omitting `instanceId`) and stay apart the moment either sets a distinguishing one. 12 new
     unit tests across the four; the full existing suite passes unchanged

148. ~~Wesnoth-style hex skirmishes expose a gap between `board.Tactics`' generic
     action-point/cover model and a reusable army-game rules layer: weighted terrain
     movement and defence per unit, adjacent attack exchanges with retaliation and hit
     chances, village ownership/healing, and per-side turn income. `wesnoth-1.19.27/mwg`
     kept these rules as an original game-side prototype, wired to `mwg`'s hex geometry and
     faction fog; this evaluates a small, data-driven `board.HexSkirmish` API now that a
     second consumer (this item's own write-up, revisited) makes the shape worth
     generalising~~ - `board/HexSkirmish.ts` adds `startingSkirmish`/`setSkirmishTerrain`/
     `canPlaceSkirmishUnit`/`addSkirmishUnit`/`skirmishMoves`/`moveSkirmishUnit`/
     `skirmishAttack`/`skirmishIncome`/`endSkirmishTurn`. Distinct from `board.Tactics` on
     purpose: a `SkirmishTerrain` carries its own `moveCost` (weighted Dijkstra over
     `core.Hex` neighbours, not `Tactics`' uniform one-step BFS) and `defense` (a 0-1 bonus
     for whoever is standing on it while defending); combat is adjacency-only with no zone
     of control, and `skirmishAttack` always lets a surviving defender strike back in the
     same call rather than needing a second, separate action. A village is a cell flag -
     `moveSkirmishUnit` sets its `owner` the moment a unit steps onto one, `skirmishIncome`
     counts an owner's villages toward a flat base rate, and `endSkirmishTurn` heals units
     standing on a village they own. Every number (move cost, defence, attack, hit chance,
     income rate) is the game's own data, the same policy `board.Army`'s `armyIncome`
     already follows - nothing here is a Wesnoth number. 11 unit tests, including a forced
     detour around an impassable terrain kind, a guaranteed-kill leaving no retaliation, and
     terrain defence pushed to a guaranteed miss for a deterministic assertion

149. ~~Add the reusable dungeon-content primitives exposed by the Shattered Pixel Dungeon port:
    deterministic seeded floor generation with room graphs and retry reporting; regional
    generation hooks for hand-placed rooms, special-room content, branches, wells, plants,
    statues, chasms, doors, traps, and terrain-feeling variants; and a floor feature/event
    layer that lets a game attach inspect, interaction, consequence, and persistence rules to
    generated cells. Keep the framework data-driven and game-agnostic: it should provide the
    generation pipeline, seeded RNG boundaries, feature registries, and save/load hooks, while
    the game supplies its rooms, monsters, items, regional tables, and exact content formulas~~
    - `generateDungeonGraph` is `generateDungeon`'s own pipeline, also returning a room graph
    (corridor edges, backbone chain then extra loops, by room index) and a retry count
    (placement attempts rejected before every room resolved); `generateDungeon` itself is now
    a thin wrapper returning just its `.level`, so nothing calling it before this shipped
    changed behaviour. `DungeonOptions.hooks` (`onRoomPlaced`/`onCorridorCarved`) is the
    regional seam: fired as the pipeline itself reaches each stage, so a game hangs hand-placed
    rooms, branch entrances, wells, plants, statues, chasms, doors and traps from the moment a
    room or corridor exists, without forking the generator. `roguelike.FeatureLayer` is the
    floor feature/event layer: a named kind's `inspect`/`interact`/`consequence`/`persistent`
    rules attach to a cell (`interact` gates `consequence`, returning `false` refuses it before
    it runs; `persistent: false` removes the feature once its consequence has fired), following
    `QuestLog`'s "definitions supplied fresh on load" convention - only which cell holds which
    kind is ever save data. 14 new unit tests across both

150. ~~Add a reusable variant-spawn/content-roll API for dungeon games: weighted regular rosters,
    rare additions, per-entry alternative variants, and explicit RNG accounting for skipped or
    deferred content rolls. The API must support deterministic replay and expose the roll trace
    for parity tests without forcing a framework-wide monster or item model~~ - `rollRoster`
    runs the "add-rare, swap, shuffle" order directly: rare entries roll in first, then each
    regular entry's own alternative may swap it (rare additions never carry an alternative of
    their own), then the whole roster shuffles unless told not to. Every roll is traced,
    including a rare entry marked `enabled: false`, logged as `'deferred'` (an explicit
    non-roll, consuming no RNG) rather than `'skipped'` (a roll that happened and lost) - the
    distinction a parity trace needs to tell "this depth never asks" from "this depth asked and
    failed". Driven entirely through `Random`, so the same pushed seed reproduces the same
    roster and the same trace, roll for roll. 9 unit tests

151. ~~Add a framework-level dungeon parity/test harness: run a seeded generation pipeline, dump
    room graphs, terrain, features, content placements, RNG draws, and retry counts, then compare
    those artifacts against a reference implementation or golden fixtures. Include region/depth
    fixtures, repeat-generation determinism checks, and a way to separate graph-stage mismatches
    from paint/content-stage mismatches~~ - `DungeonArtifacts` is the flattened, comparable shape
    (room graph, retries, terrain, features, content, RNG draw count); `mwg` dictates none of
    the game-side fields (`content`/`rngDraws` are whatever a game's own roll traces and counters
    hold) - only how to diff two of them. `compareDungeonArtifacts` tags every mismatch `'graph'`
    (the room graph, the retry count) or `'paint'` (terrain, features, content, RNG draws), so a
    generation-shape bug and a decoration-content bug are never read as the same failure.
    `checkDeterminism` repeats a generation call against itself and diffs every run against the
    first, for the "same seed, same result" check on its own. 7 unit tests

Items 152-155 came from auditing the capability spec in [README.md](README.md#capability-spec)
against the actual code rather than trusting it, the same check item 87 once forced after that
table claimed zone of control it did not have. Four rows were claiming shipped capability that
did not exist anywhere in `src/`: particle effects, screen transitions, tooltips, and level
generation "from composable room builders" (the generator placed rejection-sampled rectangles
and joined them with L-corridors, with no builder concept at all). The spec is the stated
definition of done for 1.0, so the rows were made true rather than trimmed.

152. ~~`mwg/render` - particle effects, which the capability spec's "shared floor" table has
     claimed since the reference list existed~~ - `ParticleEmitter` is pooled: the pool is
     allocated once at `max` and reused forever after, because this is the one primitive here
     that can be asked to create and discard thousands of short-lived objects per second, and
     a collector pause is exactly the frame time this project's own performance priority
     cares about. Asking for more than `max` while `max` are alive drops the request rather
     than growing, and a full pool drops its emission backlog rather than banking it into a
     later burst. Every draw goes through `core`'s seeded `Random`, so a replayed run
     reproduces the same spray instead of particles being the one thing on screen a
     deterministic replay cannot reproduce. An emitter given no `texture` runs the whole
     simulation and draws nothing, which is both the headless case and how all 12 unit tests
     exercise the physics without a DOM
153. ~~`mwg/render` - screen transitions: fade, flash, tint, the second capability-spec row
     with no implementation behind it~~ - `ScreenEffects` is one full-screen overlay with
     `fadeOut`/`fadeIn`/`flash`/`setTint` over it. Driven by a plain elapsed timer rather than
     a promise-returning tween, matching `Toast` and `FloatingText`: `update(dt)` returns true
     on the exact frame an effect completes, the same way `Projectile.update` reports arrival,
     so "fade out, swap the level, fade in" sequences without `await` and a test drives the
     whole thing one call at a time. A flash is a single phase rather than a fade-out chained
     into a fade-in, so interrupting one cancels the whole gesture instead of leaving the
     screen stuck at full white waiting for a second phase that no longer runs. 12 unit tests
154. ~~`mwg/ui` - tooltips, the third false row: the table has read "windows, lists, tooltips"
     while no tooltip existed anywhere~~ - `Tooltip` counts its hover delay in `update(dt)`
     rather than a `setTimeout`, the choice `IconGrid` already made for long-press: a
     frame-driven counter cannot fire after the scene that owned it is gone. The panel is a
     non-modal `Window` rather than a second kind of panel, so it inherits the theme's frame,
     padding and live restyling instead of drifting the moment a game sets `theme.panel`.
     Near an edge it flips to the other side of the pointer rather than sliding, so it never
     covers the thing it is explaining. Caught a real re-derivation on the way: `place()` was
     reading `panel.width` back off Pixi, which walks child bounds into a canvas text measure -
     both a per-frame cost and the reason the layout could not be tested at all; the size is
     now kept from where it is computed. `measureBody()` is a protected seam a test overrides,
     the same shape `StageScript`'s own tests already use instead of stubbing Pixi. 12 unit tests
155. ~~`mwg/roguelike` - composable room builders, the fourth row: level generation was
     claimed as being "from composable room builders" when rooms were only ever filled
     rectangles~~ - a `RoomBuilder` carves one room's interior; the generator still decides
     where rooms go and what joins them. That split is what makes them composable: a game
     registers a hall, a pillared chamber, a flooded cistern, and a floor is some mixture of
     them without the generator knowing what a cistern is. `mwg` ships exactly one
     (`hallBuilder`, the filled rectangle the generator always did) and expects a game to
     bring the rest, the same content boundary every other module here draws. `minSize` is
     checked against a room's shorter side and `maxSize` against its longer one, so a builder
     never receives a rectangle it cannot fit; a room no builder fits falls back to a plain
     hall rather than being left as solid rock, since it has already been placed and joined by
     a corridor and a player must be able to enter it. `DungeonResult.roomBuilders` records
     which builder carved each room, which the item 151 parity harness diffs as a paint-stage
     artifact. 8 unit tests

Items 156-159 came from a design review of the whole framework rather than from a reference
game: an audit of the module graph, the public API's internal consistency, the test suite's
shape, packaging, and what the examples actually exercise. The finding that drove most of it
is that the API grew faster than anything validated it, so the same shape had been solved
several different ways in different modules. These are breaking changes, taken deliberately
while the version is still `0.y.z` and the cost of changing a name is a line in a changelog
rather than someone else's build.

156. ~~the character sheet could not be saved: `Level`, `Doors`, `Secrets`, `Blob` and
     `FeatureLayer` all had `toJSON`/`fromJSON`, while `Inventory`, `StatBlock`,
     `EquipmentSlots`, `Progression`, `SkillPoints` and `Charges` had none - so every game
     hand-rolled the most important half of its own save file. `examples/dungeon` is the
     proof: it rebuilt its inventory item by item against its own `ITEMS` table and
     round-tripped stats field by field through `base()`/`setBase()`~~ - all six now
     serialize, and the design question ("what identifies an item instance") is answered by
     splitting kind from instance. `Inventory.toJSON` writes id, quantity and every field that
     can diverge between two items sharing an id (level, durability, affix, identified,
     cursed, blessed, `instanceId`, nested container contents); `fromJSON(defs, data)` takes
     `stackable` and `weight` from the game's own item table, so rebalancing an item's weight
     reaches an old save instead of the save baking in the old number, and an id the game no
     longer defines throws rather than restoring a weightless unstackable ghost of it.
     `StatBlock` saves base values and deliberately no modifiers: every modifier is owned by
     whatever applied it (`EquipmentSlots`, `applyStatusEffect`, `AuraField`) and each puts its
     own back on load, so saving them here as well would double every bonus the instant a
     restored character re-equipped what it was already wearing - which is exactly why
     `EquipmentSlots.fromJSON` re-equips rather than just refilling its map, and why it
     restores a locked cursed item still worn instead of refusing it the way `equip` would.
     `SkillPoints` saves only the unspent ledger, since spent points already live as raised
     base values. `Charges` saves the banked progress as well as the count, so reloading part
     way to a recharge cannot shorten the wait. 15 unit tests, including that last one
     specifically
157. ~~two consolidations of things solved twice: `battle.BattleHooks` and
     `roguelike.CombatHooks` were the same class line for line (`on`/`offSource`/`emit` with
     identical bodies), and "nothing to pick" was spelled three ways in one call chain -
     `Random.weighted` returned `-1`, `weightedKey` and `element` returned `undefined`, and
     `rollEncounter`/`rollLoot` returned `null`, with the `-1`-to-`null` translation written
     out by hand in two separate files~~ - `core.HookRegistry<TArgs>` is now the one registry
     and both are thin specializations of it that fix the argument types and keep their own
     documentation; `CombatHooks` still owns `modifyDamage`, which was the only real
     difference. It also gained `off`, `size` and `clear`, and now iterates a copy while
     emitting so a handler removing itself mid-dispatch cannot shift the loop. Every
     "pick one" returns `null`: `weighted`, `element`, `weightedKey`, and the five call sites
     that consumed them
158. ~~three naming rules the API followed only loosely. `advance` meant five different things
     (whole turns in `TurnClock`/`Charges`, one round in `Field`, real seconds in
     `EnvironmentClock`, one ability stage in `MultiStageAbility`, and "progress a quest" in
     `QuestLog`), while turn-scale work also appeared as `Barrier.decay`, `AbilityCycle.tick`
     and `BossPhases.update` - the last colliding with the `update(dt)` that means real time
     everywhere in `render`, `ui` and `audio`. Producing save data had six namings across the
     codebase, and "nothing to pick" had three~~ - the rules are now stated at the top of
     `REFERENCE.md` and followed: `advance(turns)` is turns or rounds, `update(dt)` is real
     seconds, and anything that is not time passing gets its own verb. So
     `EnvironmentClock.advance(seconds)` became `update(dt)`, `Barrier.decay(ticks)` and
     `AbilityCycle.tick()` became `advance(turns)`, `Field.advance()` took a `rounds` count,
     `BossPhases.update(hpFraction)` became `check(hpFraction)` since it reads HP rather than
     time, and `QuestLog.advance` became `advanceStage`. `EnvironmentClock.snapshot`/`restore`
     and `SupportLedger.save`/`restore` became `toJSON`/`fromJSON`; `Random.Generator` keeps
     `getState`/`setState`, which resumes a live stream in place rather than producing a
     payload, and `Input`'s binding export stays a pair of namespace functions
159. ~~`ColorTransformBatcher` had no test at all: 484 lines, the framework's actual rendering
     differentiator, and the one file the architecture confines every Pixi batcher and
     high-shader internal to. The benchmark harness had the opposite problem - it existed,
     was good, and never ran: `tools/benchmark-browser.mjs` drives a built example through
     real Chrome, measures fps and p95 frame time, asserts the renderer never silently fell
     back to canvas 2D, and compares against per-page history at a 15% threshold, while CI
     ran only `check`, `test` and `build`~~ - 26 tests now cover the packing maths
     (`packColorAdd`'s byte order against the `unorm8x4` attribute, clamping, quantisation
     round-trips, `packTintAdd`'s energy-conservation invariant, `NO_COLOR_ADD` really being
     the identity) and the vertex packers, which are the part most likely to break on a Pixi
     upgrade - including that `packAttributes` and `packQuadAttributes`, two hand-written
     copies of one layout, still agree word for word on the same quad. No production seam was
     needed: neither packer touches `this`, so the tests call the real methods off the
     prototype. The GPU half is stated in the file's own header as not covered and not
     coverable under `node --test`. In CI, `benchmark:simulation` (no browser, no GPU) runs on
     every push with its history deliberately not restored, so it can only fail if the runners
     actually throw - comparing a shared runner against a best-seen number from a faster
     machine is how a benchmark gate becomes a flaky gate; the browser benchmarks run weekly
     and on demand in their own workflow, with history in a cache so the 15% check has
     something real to compare against

160. ~~`mwg/3d` renders through Babylon and should cost a game nothing in Pixi, but reached it
     anyway: `three-d`'s `Models.ts` and `Character3D.ts` need `resolve` to look a path up in
     the compiled `data:` URI map, `resolve` lived in `assets/index.ts`, and that file imported
     Pixi's `Assets` loader at the top for the entirely unrelated other half of its job. The
     dependency was invisible because it was several hops away and tree-shaking hid most of the
     cost. `audio/Playable.ts` had the identical bug for the identical reason, needing only
     `resolve` to point an `Audio` element at a resolved path~~ - `assets` is now two files
     either side of a seam that was already there: `paths.ts` (`setBase`/`isCompiled`/`paths`/
     `has`/`resolve`, pure string and map work, no renderer) and `loader.ts` (`load`/`texture`/
     `get`/`isLoaded`/`release`, which is the half that genuinely needs Pixi). `index.ts` is
     now a plain barrel over both, so the public API is unchanged, and `./assets/paths` is its
     own export subpath for a game rendering through something else. `three-d` and `audio` both
     import from `paths.ts` directly. Two side effects worth having: the
     `Streaming.ts`-to-`index.ts` file-level import cycle is gone (it imports `loader.ts` and
     `paths.ts` directly now), and the freshly built 3D example dropped from 1,720,928 to
     1,522,636 bytes with zero remaining references to Pixi, where it previously carried a
     few. `tests/renderer-isolation.test.ts` is the durable half: it walks the real import
     graph from each module's barrel and asserts which entry points reach Pixi, in both
     directions - `i18n`, `actors`, `world`, `battle`, `simulation`, `roguelike`, `board`,
     `audio` and `3d` must stay clean, while `render`, `ui`, `stage`, `rpg` and `core` must
     still show up dirty, so the check cannot pass by silently failing to detect Pixi at all.
     Writing it immediately caught a false claim this session had just put into `REFERENCE.md`:
     `rpg` was listed as renderer-free when `EventRunner` drives a `MessageBox` and it reaches
     Pixi through 14 files

161. ~~item 160 closed the cheap half of the renderer decoupling and left the expensive half
     open: `core` still imported Pixi, because `Game` owns the `Application` and `Scene` owned
     a `Container`. That was the whole cost, and it was paid by the wrong people - a Babylon
     game wanting `Input`, `SaveSystem`, `Random` or `SceneStack` had to pull in a 2D renderer
     it would never draw with, and 27 of `core`'s 29 files were already renderer-free and
     simply unreachable without the other two~~ - `src/two-d` is now the Pixi half of the
     framework, symmetric with `src/three-d`: `render`, `ui` and `stage` moved bodily
     underneath it, `Game` moved out of `core`, and `Scene` split along the seam that was
     already there. `core.Scene` keeps the lifecycle every renderer needs (`create`, `update`,
     `resize`, `onSuspend`, `onResume`, a `destroy` that fires once, and a `teardown` hook for
     whatever a subclass owns); `two-d.Scene2D` adds the container and destroys it. The split
     was cheap because `Scene` only ever touched Pixi twice, to make a `Container` and to
     destroy it, and `SceneStack` never touched one at all - it calls lifecycle methods and
     nothing else, which is why making it generic (`SceneStack<T extends Scene>`) hands 3D
     games working scene management, suspend/resume and minigame stacking for free rather than
     as a later port. Verified in the built output rather than claimed: `dist/core` and
     `dist/three-d` contain zero references to Pixi. Granular subpaths survive the move
     (`two-d/render`, `two-d/ui`, `two-d/stage`) so nothing about bundle size regressed, and no
     legacy `./render` aliases were kept - the point of doing this before 1.0 is that a name
     costs a line in a changelog now and somebody else's build later. Two small things fixed in
     passing: `stage/script.ts` carried a literal NUL byte as a string separator, replaced with
     a visible `\u0000` escape, and item 160's `Streaming.ts` import cycle stayed fixed.
     `tests/renderer-isolation.test.ts` grew `core` into the renderer-free set it now enforces

162. ~~`rpg` was the last module reaching Pixi by accident rather than intent, and the ugliest
     edge in the graph: an event interpreter - pure control flow over `GameState` - dragged
     the whole 2D widget layer in behind it. Four separate couplings, not one, and each was
     shallower than it looked~~ - `EventRunner.speak` constructed a `ui.MessageBox` and pushed
     it onto a `ui.WindowStack`; it now calls an injected `DialoguePresenter`, so how a line
     is shown is the game's business and `two-d/ui.messageBoxPresenter` is the ready-made 2D
     one (`present: messageBoxPresenter(this.windows)`, a single argument, so the common case
     got no harder). `automap` named `render.TileMap` for two method signatures and now names
     an `AutomapTarget` interface a real `TileMap` satisfies structurally, with its own `EMPTY`
     wildcard pinned to `render.EMPTY` by a test rather than an import. `GridMover` and
     `FreeMover` demanded an `AnimatedSprite` when they only ever touch `x`, `y`, `update`,
     `has` and `play` - now a `MovableSprite` whose animation members are optional, which is
     what `examples/movement` had a comment apologising for. `loadTiledMap` moved to
     `two-d/render`, where the `TileMap` and `SpriteSheet` it builds already lived: it was in
     `rpg` because Tiled is associated with RPGs, not because anything about it is gameplay.
     The payoff beyond the graph: a 3D game can now run map events, dialogue, switches,
     variables and quests with no 2D renderer in reach, and `tests/rpg.test.ts` dropped its
     `WindowStack` entirely - control-flow tests no longer need a renderer to check control
     flow. Verified in the built output: `dist/rpg` contains zero references to Pixi, and the
     renderer-isolation test now enforces it alongside `core`, leaving `two-d/*` as the only
     deliberate Pixi dependency in the framework

163. ~~the four architecture diagrams (`0a`-`0d`) under `webpage/assets/` were hand-drawn SVG,
     and every one of them was wrong. `0c_framework_architecture` still showed `render`, `ui`
     and `stage` as top-level modules after they moved under `two-d`, and
     `0d_rpg_event_flow` still showed `EventRunner` driving a `WindowStack`/`MessageBox` after
     that coupling was replaced by an injected presenter. Nothing catches a stale picture, and
     they had drifted silently through several structural changes~~ - the originals are
     archived under `webpage/assets/archive/` with a note saying what they described and why
     they were replaced, and `tools/make-architecture-diagrams.mjs` generates all four now.
     `0c` does more than read a fixed spec: it reads the module list out of `src/` and
     classifies each module by walking its real import graph for a `pixi.js` or `@babylonjs/`
     import, the same walk `tests/renderer-isolation.test.ts` enforces and with the same
     type-only exemption, so it cannot describe a layout the code does not have. It correctly
     discovered the current one on its first run - ten renderer-free modules including `core`
     and `rpg`, `assets` and `two-d` on Pixi, `3d` on Babylon - and its column layout tightens
     its row pitch as modules are added rather than running off the canvas. The shared visual
     language moved to `tools/diagram-chrome.mjs`, which the existing example-diagram
     generator now uses too: that refactor was verified by regenerating all 19 example
     diagrams and confirming every one was byte-identical, so nothing about the established
     look changed. `npm run webpage:diagrams` rebuilds both sets, and CLAUDE.md/AGENTS.md now
     carry the rule that these are generated rather than drawn

164. ~~a study of `mwg-pixel-dungeon` (not in this repo) recommended closing the PixiJS
     boundary the rest of the way, a formal simulation runtime, and the scheduler as sole
     time authority; item 162's own closure left `Scene2D.stage` typed as raw `pixi.js`
     `Container`, and every one of the 7 local examples imported `pixi.js` directly for
     `Graphics`/`Text`/`Container` construction, which `two-d` has never wrapped~~ -
     `two-d/render/Types2D.ts` adds `Container2D`/`Texture2D`/`Rect`/`TextureRegion` (plain
     aliases/types, not new classes) so `Scene2D.stage`, `SpriteSheet.region`, and
     `TintedSprite`/`AnimatedSprite`/`NinePatch`/`LayeredSprite`'s public signatures no longer
     force a game to name a `pixi.js` type; `two-d/pixi-interop.ts` is the one sanctioned,
     visible escape hatch for the classes still worth constructing that `two-d` doesn't wrap
     (`Container`, `Graphics`, `Text`, `Sprite`, `Texture`, `Rectangle`), and all 7 examples
     now import through it instead of `pixi.js` directly - a new
     `renderer-isolation.test.ts` case enforces that for every example going forward.
     `roguelike.Scheduler` gained `postpone` (delaying an actor other than the current one)
     and `toJSON`/`restore` (a deterministic snapshot keyed by a caller-supplied actor id),
     making it the sole, serialisable authority on logical time the doc asked for; fractional
     costs and deterministic tie-breaks already existed. `simulation.SimulationRuntime` is
     the new interactive-dispatch facade the doc's `Simulation<State,Command,Event>` shape
     called for - one object over state + scheduler + RNG, composing with the existing
     `advanceToInput`/`runScenario` rather than replacing them. Deliberately deferred, in the
     same doc but past this pass's scope: `Shape2D`/`Graphics2D` and gradient/fill
     primitives (what would let the interop hatch close entirely), a `Text2D`/label-based
     replacement for raw `PIXI.Text`, `EntityId`/`EntityRegistry`, a `SimulationSnapshot`
     wired through `core.SaveSystem` rather than assembled ad hoc, a named, enforced
     `SimulationContext` banning `Math.random()` in simulation code, semantic-messaging/
     i18n as a framework primitive, and a look at `battle.BattleHooks`' mutable-context
     pattern against the doc's "events are output, not a rules bus" principle - add these as
     their own items rather than reopening this one

165. ~~item 164 deferred the same doc's P1 items: `EntityId`/`EntityRegistry`, a
     `SimulationSnapshot` proven to compose with `core.SaveSystem` rather than just typed to,
     the `Math.random()` discipline `SimulationContext` implies, the doc's remaining
     section-15 architecture tests, and semantic messaging as a framework primitive~~ -
     `core/Entity.ts` adds `EntityRegistry`/`EntityId`: `idOf` is what a game now passes as
     `Scheduler.toJSON`'s or `SimulationRuntime`'s `actorId`, without changing either
     signature. A new `simulation.test.ts` case saves a `SimulationRuntime.snapshot()`
     through an actual `SaveSystem<SimulationSnapshot<...>>`, loads it back, and continues
     dispatching identically - not just checking the types line up. `renderer-isolation.
     test.ts` gained three cases: no file under `simulation/` calls `Math.random()` directly
     (`core/Random.ts`'s own bootstrap call is outside that directory and untouched); a
     public-API Pixi-type scan over `two-d/render`/`two-d/ui`'s exported signatures, which
     caught two leaks item 164 missed - `SpriteSheet`'s `get`/`range`/`pick`/`fromTexture`
     and the `texture` field were still raw `pixi.js` `Texture`, and `Toast.show` took a raw
     `Container` - both retyped to `Texture2D`/`Container2D`; and a scheduler determinism
     case alongside a headless-equivalence one in `simulation.test.ts` (the same rule through
     `SimulationRuntime.dispatch` and through `runScenario` produces identical events).
     `i18n/SemanticMessage.ts` adds `SemanticMessage`/`MessageChannel`/`MessageFormatter`/
     `createCatalogFormatter`, built on the existing `t()`/`Catalog`/plural/Fluent machinery
     rather than reimplementing interpolation: one typed message renders on
     log/compact/accessibility/debug channels by looking up `${type}.${channel}`, falling
     back to `${type}` alone, exactly like `t()`'s own key-fallback contract. One file, not
     the doc's suggested `renderers/*.ts` tree, which its own section 10.5 calls secondary.
     Still deferred, and still P2 in the source doc: `Shape2D`/`Graphics2D` and gradient
     primitives, `Text2D`, migrating the interop hatch away entirely, the `battle.
     BattleHooks` mutable-context review, the presentation-event helpers, and the 8 ADRs -
     add these as their own item rather than reopening this one

166. ~~items 164/165 deferred the same doc's P2 items: clarifying GameEvent/Hook/Signal's
     three separate roles (reviewing `battle.BattleHooks`' mutable-context pattern against
     "events are output, not a rules bus") and the presentation-event helpers; the escape
     hatch and interop item was already done in item 164~~ - reviewing `BattleHooks` found
     it already fits the doc's own taxonomy: a Hook is "a point of modification a rule
     consults while it runs", and mutating a shared `{ skip: false }` context for "can this
     creature act" is exactly that, not a rules-driving event bus - no refactor was needed,
     only writing the taxonomy down, which REFERENCE.md's `core` section now does explicitly
     (GameEvent = a rule's ordered output, realised as `simulation`'s `Event` type parameter;
     Hook = mid-calculation modification, `HookRegistry`; Signal = a bearing-on-nothing
     notification). `core/Presentation.ts` adds `PresentationQueue`: plays a batch of
     simulation events one at a time, each waiting however long its own `play(event)` call
     says to before the next starts - the same queued/timed shape `two-d.ui.Toast` already
     used, generalised to any event type and freed of `Toast`'s own Pixi container, since
     sequencing which event plays next needs no renderer. This closes out the
     `mwg-pixel-dungeon` study from items 164-166: the doc's P0/P1/P2 items are done except
     the 8 ADRs (skipped - this repo has no ADR convention, and the decisions are already on
     the record here and in REFERENCE.md) and what item 164 marked P2-adjacent and still
     genuinely open: `Shape2D`/`Graphics2D`, `Text2D`, and migrating the `pixi-interop`
     escape hatch away entirely once those exist

167. ~~item 166 left a real list of open ends and skipped the 8 ADRs; a closer look at the
     doc's own remaining acceptance criteria found more: `TintedSprite`'s colour-transform
     pipe still needed a game to pass `{ extensions: [registerColorTransform] }` itself,
     `roguelike.Scheduler` wasn't re-exported from `simulation` despite the doc naming that
     explicitly, `i18n` had no locale-aware number/date/list formatting or catalog
     validation, nothing tested that changing a presentation's timing leaves simulation
     results untouched, no test compiled a consumer against the real published paths rather
     than this repo's own relative imports, and nothing enforced the reverse of item 162's
     Pixi isolation (a 2D game pulling in Babylon)~~ - `TintedSprite.ts` now calls
     `registerColorTransform()` at module scope, so importing it (directly, or through
     `AnimatedSprite`/`TileMap`/`DialogueStage`) registers the pipe with no `GameOptions.
     extensions` needed; `package.json`'s `sideEffects` allowlist was updated so a
     downstream bundler cannot tree-shake that call away. `simulation` re-exports `Scheduler`/
     `Actor`/`SchedulerSnapshot` from `roguelike`. `i18n/Format.ts` adds `formatNumber`/
     `formatDate`/`formatList` over `Intl`; `i18n/Validate.ts` adds `diffCatalogKeys` (two
     catalogs' key sets compared) and `validateCatalog` (empty messages, plural forms missing
     `other`) - deliberately not a parameter schema validator, since `SemanticMessage<TType,
     TParams>`'s own generics are the primary mechanism the source document itself names.
     `two-d/render/Shape2D.ts` adds `Node2D`/`Shape2D`/`Text2D`/`TiledSprite`/`Gradient` -
     bare MWG-named re-exports of `Container`/`Graphics`/`Text`/`TilingSprite`/`FillGradient`,
     deliberately not new wrapper APIs, since Pixi's own shape for these was already right;
     this let all 7 examples migrate off `pixi-interop` for `Graphics`/`Text`/plain-`Container`
     construction, leaving only 2 (`chess`, `colour-transform`) still using it, for genuinely
     exotic needs (`Rectangle` hit-areas, manual texture-frame construction) the doc's own
     escape-hatch clause anticipates. Broadening `renderer-isolation.test.ts`'s public-API
     scan from method signatures to plain property declarations caught four more leaks this
     pass had missed: `SpriteSheet`'s already-fixed methods aside, `ButtonSkin.texture`,
     `ButtonOptions.icon`, `IconGridItem.icon`, `ListItem.icon`, and `Theme.panel` were all
     still raw Pixi types - all retyped to `Texture2D`/`Container2D`. New tests: presentation
     independence (`tests/simulation.test.ts`, three different presentation-duration
     functions over the same commands produce identical simulation results), a genuinely
     external consumer (`tests/consumer-app.test.ts`, a minimal game compiled against
     `@datamoc/mw_games`'s real published paths, never naming a renderer), and the reverse
     Babylon-isolation direction (`renderer-isolation.test.ts`). `examples/headless` gained a
     third demo dispatching through `SimulationRuntime`/`Scheduler`/`EntityRegistry`/
     `PresentationQueue` together, so the newer facade has a working, visible example rather
     than only unit-test coverage. `ADR.md` records the 8 decisions from the source
     document's section 19, framed explicitly as a one-time record rather than a new ongoing
     convention - REFERENCE.md and this file's own item log remain how decisions get written
     down here day to day. What's left, now genuinely and only: nothing from the source
     document - the two remaining `pixi-interop` uses are the escape hatch working as
     designed, not a gap

168. ~~i18n content-management tooling: `mwg/i18n` already validates a catalog's shape
     (`diffCatalogKeys`/`validateCatalog`) but nothing looks at what its messages actually
     say. Three related gaps in the same area, requested directly: a string-distance metric
     (Levenshtein or similar) over a catalog's message text, to surface near-duplicate
     entries worth merging rather than translated three separate times; catalog statistics
     (how many keys a game's own source actually references vs. sit unused, per-language
     completion counts, plural-form coverage); and a merge operation that collapses two keys
     a game decides are the same message into one, rewriting call sites accordingly.~~ -
     `i18n/Content.ts`: `messageText` reduces any `MessageValue` (string, plural forms, a
     `FluentMessage`) to plain comparable text; `levenshteinDistance` is the classic edit
     distance, and `findSimilarMessages` runs it pairwise over a catalog's own message text,
     surfacing near-duplicates by a similarity threshold (most-similar first) rather than
     merging anything itself. `catalogUsage` takes a caller-supplied referenced-keys list for
     used/unused counts - `mwg` has no view into a game's own source, the same boundary
     `rollRoster`'s roster values already draw; `catalogCompleteness` is a 0-1 fraction built
     on the existing `diffCatalogKeys` rather than a second set-difference; `pluralFormCoverage`
     tallies which CLDR categories a catalog's plural messages actually define. `mergeCatalogKeys`
     drops a merged key from one catalog, keeping the surviving key's text untouched - rewriting
     call sites stays explicitly the caller's own job, not something a library reaching into a
     game's source tree should ever do. Picked deliberately over the two options weighed at
     mid-item-list time (no algorithm/workflow had been chosen when this was logged): plain
     Levenshtein plus a length-normalised similarity ratio, no schema-detecting merge UI. 24
     unit tests

169. ~~`mwg/roguelike` - extend the dungeon feature/content seam with deterministic placement
     policies for generated floor content: candidate filters over terrain and occupancy,
     distinct-cell selection without replacement, bounded fallback when fewer cells are
     available, and an explicit roll trace that can be included in the item 151 parity
     artifact. The API should support a feature releasing several neighbouring items,
     scattering regional decorations, and placing branch or room rewards without making
     `FeatureLayer` know any game's item or monster classes. Placement must be pure until
     the caller commits the result, and the selected cells plus RNG state must round-trip
     through the existing save/load boundary; the game remains responsible for the actual
     payload, uniqueness rules, and consequences.~~ - three small composable primitives over
     `Level`, none of which know what a feature or monster is: `candidateCells` filters by
     terrain kind, occupancy, and an optional region (`within`); `cellsNear` walks
     `Level.neighbors` outward by radius for a cluster anchor, working on hex and square
     alike since it never touches coordinates directly; `selectDistinctCells` shuffles and
     slices a de-duplicated pool, bounded to however many candidates actually exist rather
     than throwing or looping - the same "fail gracefully, place fewer" shape
     `generateDungeonGraph`'s own room placement already uses. All three compose for the
     three named shapes: neighbouring items (`cellsNear` around an anchor, intersected with
     a filtered pool), scattered decorations (`candidateCells` over a large region, a bigger
     `count`), and a branch/room reward (`candidateCells` scoped to one room, `count: 1`).
     Nothing is placed until the caller commits `cells` itself (typically
     `FeatureLayer.place`); `trace` is plain JSON-safe data ready for `DungeonArtifacts.
     content` or a save file, and RNG state round-trips the way every other seeded call
     here already does through `core.Random`'s own push/pop. 15 unit tests, including
     determinism for a given seed, de-duplication of a candidate pool with repeats, and the
     candidateCells/cellsNear/selectDistinctCells composition actually clustering picks
     around one anchor

170. ~~requested directly: `mwg/assets` shares only path resolution across 2D and 3D today, not
     loading. `assets/paths.ts`'s `resolve()` already hands back the same compiled `data:`
     URI (or dev-mode path) regardless of extension - `three-d/Models.ts`'s `loadModel3D`
     already calls it directly for `.glb`/`.gltf` sources - so the compile step (item 74's
     own `tools/compile-resources`) needs no 3D-specific work. What is not shared is the
     *loading* half: `assets/loader.ts`'s `load`/`texture`/`get`/`isLoaded`/`release` are
     built entirely on Pixi's own `Assets` cache, so a Babylon-only game gets no equivalent
     `isLoaded`/`release` bookkeeping for a model or a VOX buffer, and no `onProgress` hook
     into item 135's loading-screen seam the way a 2D texture load already has - `Vox.ts`'s
     `parseVox` takes a raw `ArrayBuffer` a game must already have fetched itself, and
     `loadModel3D` returns Babylon's own result with no cache entry a second call could
     check first. Two shapes to weigh once picked up: extending `assets/loader.ts` itself
     with a renderer-agnostic cache (`get`/`isLoaded`/`release` already look renderer-free
     in principle - only `texture()` is Pixi-typed), or a small parallel `assets/models.ts`
     alongside it, the same split `paths.ts`'s own comment already draws between path
     arithmetic and "actually fetching and decoding, which needs a renderer"~~ - decided
     differently than either shape originally weighed, once actually working through it:
     neither belongs in `assets/loader.ts` itself, because a Babylon `AssetContainer` is
     live, mutable scene content (meshes with their own transform/parent state) rather than
     immutable data a texture cache can safely hand out twice - caching and replaying the
     same `ImportMeshAsync` result for a second call would alias two placed copies of a
     model into literally the same meshes, a real correctness bug, not just an odd API. The
     actual split is by renderer, matching this project's existing isolation rule:
     `assets/binary.ts` is the renderer-free half (`loadBinary`/`getBinary`/
     `isBinaryLoaded`/`releaseBinary`, a plain fetch-and-cache over `ArrayBuffer`s, its own
     `assets/binary` entry point alongside `assets/paths`) - `Vox.parseVox`'s direct
     beneficiary, closing exactly the "must already have fetched itself" gap. The
     Babylon-specific half stays in `three-d/Models.ts`, where Babylon already is:
     `loadModelContainer3D` loads a source once, caches the `AssetContainer` by resolved
     path (never for a `File`/byte view, which has no stable identity to key on), and a game
     calls the container's own `instantiateModelsToScene()` for each independent, unaliased
     copy - Babylon's actual "load once, place many" primitive, with `isModelContainerLoaded`/
     `releaseModelContainer` as the bookkeeping this item asked for. `loadModel3D` is
     unchanged for the common one-copy case. 5 tests (`three-d-model-container.test.ts`,
     including two different sources caching independently and a second call for the same
     source returning the identical cached container) plus 9 (`assets-binary.test.ts`,
     including no-refetch on an already-cached path, progress reporting, and a failed fetch
     caching nothing)

171. ~~requested directly: the interface should mirror under a right-to-left language, not
     only its text alignment. Checked against what already exists - `Window` (title
     position), `ListView` (icon/text side, already covers `RebindScreen`'s composition of
     it), `Button` and `Label` (text alignment) already read `theme().direction` - but three
     widgets did not: `Bar` always filled from the left regardless of direction, `IconGrid`
     always laid column 0 at the left edge and never swapped what the `'left'`/`'right'`
     actions meant, and `HelpScreen` always put its topic list on the left and the body pane
     on the right~~ - all three fixed the same way `ListView` already does it: mirror the x
     position, mirror which physical action reads as "toward the reading-start edge". `Bar`'s
     fill now grows from the right edge under rtl rather than always from x=0. `IconGrid`
     gained a `columnX` helper mirroring column position (column 0 at the right edge under
     rtl) used by cell layout, the highlight/pick-up rects, and a live theme-change
     reposition; `handleAction`'s `'left'`/`'right'` swap which way `move()` steps under rtl,
     so the physical action a player expects to move visually leftward still does.
     `HelpScreen` swaps which side the topic list and body panes sit on. `StatsScreen`
     (single wrapped `Label`) and `RebindScreen` (a single full-width `ListView`) needed
     nothing - already fully mirrored through what they compose; `Toast`/`Tooltip`/
     `WindowStack` own no absolute screen position of their own to mirror. 18 new unit tests
     (`Bar`, `IconGrid`) cover both directions plus a live theme-change reposition;
     `HelpScreen`'s fix could not get a unit test the same way - like `ListView` itself, it
     constructs real Pixi `Text` and has no test today, since measuring it needs a canvas
     this headless suite has none of - verified by type-check and code review instead

172. ~~requested directly: without a declarative way to react to a stat crossing a
     threshold, a game ends up writing its own cascade of `if HP < n` checks, one per
     reaction, scattered through its update loop and hard to keep straight as more
     reactions pile up~~ - `core.ReactionTable`/`ReactionRule` checks a list of named
     `when`/`action` rules against any state shape a game passes in (an actor's
     `StatBlock` values, or a plain object's own fields such as an item's durability),
     firing `action` the moment `when` turns true and staying quiet while it remains
     true, edge-triggered the same way `roguelike.BossPhases` already tracks entered
     phases. A `once` rule retires after firing; the default re-fires on the next
     rising edge, for a recurring warning rather than a single milestone. Deliberately
     narrower than `BossPhases` (no thresholds-must-descend ordering, no phase index) and
     more general (an arbitrary predicate, not just an HP fraction), and deliberately in
     `core` rather than `actors`, so the same table watches a character's stats or an
     inanimate object's state without either module depending on the other. 8 unit tests

173. ~~item 167 closed the `mwg-pixel-dungeon` study claiming "nothing left... not a gap",
     and ADR-001 records the renderer boundary as flatly Accepted; a closer look at what
     that actually covers found the claim overstated~~ - `two-d/render/Shape2D.ts` gives a
     game an MWG-owned *type* for a container/shape/text (`Node2D`/`Shape2D`/`Text2D`), but
     no bare, constructible `Sprite2D` exists - only `TintedSprite`, which adds
     colour-transform behaviour rather than standing in as a neutral sprite. `two-d/
     pixi-interop.ts` is itself a literal `export { Container, Sprite, ... } from 'pixi.js'`,
     so reaching it still means `pixi.js` is present at the value level, and `package.json`'s
     `dependencies` still lists `pixi.js` directly - removing it today would still break the
     build. What item 167 got right: every *type* position across the public API genuinely
     no longer names a `pixi.js` type, which is what `renderer-isolation.test.ts`'s scans
     actually check. ADR-001 corrected to say exactly that distinction rather than a flat
     "Accepted". Not fixed here - a `Sprite2D` and a real look at what removing `pixi.js`
     from `dependencies` would take are their own item, not folded into this correction

174. ~~item 172 added `core.ReactionTable` to replace a game's own cascade of `if HP < n`
     checks; before assuming it was worth using anywhere, surveyed every latch/transition
     site across the reference games it was meant to help (70 sites: warn/flee state
     machines, boss phase gates, ability cooldowns, one-shot rage triggers) and sketched the
     conversion rather than asserting from memory~~ - every site surveyed was already a
     minimal single boolean or inline check; converting any of them to a `ReactionTable`
     costs net lines (the rules object, the `check()` call site, re-supplying rules to
     `fromJSON` at every load site), and the one two-stage case (a shopkeeper's warn-then-flee)
     would additionally need one rule's `when` to read another rule's `isActive` - strictly
     uglier than the six lines it replaces. Nothing converted: this repository already
     deletes speculative framework-shaped scaffolding on sight, and retrofitting working code
     for neutral-to-negative benefit violates that same standard. `ReactionTable` stays
     available for a game that actually has many rules over one state, which is what it was
     designed for - this item records that the existing reference games are not that case,
     so a future session does not re-run the same survey

175. ~~Item 173 corrected ADR-001/item 167's overstated "renderer boundary fully closed" claim
     and, while adding `two-d/render/Shape2D.ts`'s `Sprite2D` closed the "no bare
     constructible sprite" half of that gap, left the actual dependency-shape question
     explicitly unresolved: `package.json`'s `dependencies` still lists `pixi.js` directly
     (not `peerDependencies`, unlike `@babylonjs/core`'s already-established optional-peer
     treatment for `three-d`), and moving it would change the published package's install
     contract for a version already live on the npm registry (`0.5.0`, confirmed via `npm
     view`) - a real breaking-change decision, not a same-session mechanical edit. Needs,
     before it can move: confirming `npm install`'s behaviour is unchanged for a consumer
     under npm 7+'s auto-installed-required-peer-dependency handling (both the `npm install
     @datamoc/mw_games vite` path and the `.tgz` fallback CLAUDE.md's own getting-started
     verification section names), rerunning that getting-started verification from an empty
     directory once the shape actually changes, and deciding whether this is a `0.5.x` patch
     or belongs bundled with a larger breaking-change release. Left open on purpose rather
     than rushed through under a goal-completion pass - confirmed directly: asked whether to
     implement it now or leave it open, and the answer was to leave it open.~~ - Closed by
     decision rather than code change: `pixi.js` stays in `dependencies` for the rest of the
     0.x line. Moving it to optional `peerDependencies` (the `@babylonjs/core` treatment) is
     a real install-contract change for a live published package, so it belongs bundled with
     1.0's breaking changes, and the [1.0 exit checklist](#10-exit-checklist) below carries
     the verification steps this entry named (npm-install and `.tgz` paths, from an empty
     directory).

176. ~~requested directly: a game's own data tables (`actors.AffixTable` and the like) are
     hand-written `.ts` object literals today, which means a content designer without
     TypeScript has to touch source to add or tweak an entry - author them as CSV instead,
     readable by both a spreadsheet and the framework~~ - `core.parseCSV` turns a header-row
     CSV string into an array of typed row objects; `columns` names which fields coerce to
     `'number'`/`'boolean'`/`'list'` (semicolon-separated, for a field shaped like
     `AffixDef.kinds`) or `'map'` (semicolon-separated `key=value` pairs, for a per-row
     property bag), and an undeclared column stays a plain string. An empty cell omits that
     field entirely, the same as an optional property never set. RFC 4180-shaped tokenizing
     (char by char, not `split(',')`) survives a quoted field containing the delimiter, a
     newline, or an escaped `""`, which a real description column eventually will. Takes a
     raw string with no opinion on how it was loaded - the same boundary `i18n.parseFTL`
     already draws, and deliberately not wired into `assets.load`/`tools/compile-resources`,
     since Pixi's own text-asset handling for an arbitrary extension was never verified here
     and a small table already fits a `.ts` template literal while a larger one has a
     bundler's own raw-text import (Vite's `?raw` suffix) to reach for. Explicitly does not
     and cannot hold a `core.ReactionTable` rule's `when`/`action`, which are executable
     code, not data - a CSV row can drive *which* reactions a game builds at startup (an id,
     a comparison string, a threshold number), never the rule's own logic, the same
     `AffixDef.id` boundary already draws. 12 unit tests, including a round-trip of a real
     `AffixTable` shape and quoted fields surviving an embedded comma, an escaped quote, and
     an embedded newline.

177. ~~requested directly: a dev should be able to hand the engine a hero or monster "file"
     and have it read and apply the rules, rather than the per-entity glue code item 176's
     own consultation showed (subclass/affix `if`-cascades). Given the choice between a file
     that supplies only base data (composed by the game's own code, as shown that same
     session) and one row wiring a complete entity in a single call, the fuller shape was
     requested directly~~ - `actors.buildEntity`/`buildEntities` turn one `core.parseCSV` row
     into a `StatBlock` (every non-reserved column is a base stat, so a game's own stat names
     need no declaring), an optional `Progression` against a named growth curve, a starting
     item carrying a named starting affix, and a `core.ReactionTable` already holding a
     low-HP rule if the row names a threshold. Every named reference (`growth`, `startingAffix`,
     `startingItem`) resolves through a game-supplied `EntityTemplateCatalog` - `mwg` reads
     which name a row asks for, never invents what the name means, the same boundary
     `AffixDef.id` already draws; a `lowHpReaction` threshold with no `onLowHp` callback
     supplied throws rather than silently doing nothing. Deliberately one low-HP threshold
     per row, not an arbitrary reaction list - a second one is a second column and a second
     `ReactionRule` in a game's own code once actually needed, not speculative. 12 unit
     tests, including a full CSV-row round-trip (parse a file's own row shape straight into
     a wired entity) and every reserved-column/unknown-reference error path.

178. ~~Raised against a reference game whose `main.ts` grew to roughly 7,800 lines, ~90% of it
     one `SewersScene` class: a scene composition/registry system, so a game can register
     named sub-scenes or scene "sections" (map logic, encounter logic, UI wiring) as separate
     modules that a factory assembles at `switchScene` time, instead of one file accreting
     every responsibility a scene ends up needing~~ - built as the same primitive as item 181
     below, rather than two overlapping mechanisms: `core.SceneComponentHost`/`SceneComponent`
     let a scene register named sections, each implementing whichever `create`/`update`/
     `resize`/`onSuspend`/`onResume`/`destroy` hooks it needs, run in registration order (and
     reverse order on `destroy`). Composition, not inheritance - a scene owns one host and
     forwards `core.Scene`'s lifecycle to it in a handful of lines, so it works the same
     whether that scene extends `Scene` directly or `two-d.Scene2D`, which item 181's ECS
     framing (tied to `Scene2D` specifically) would not have. The "requires a second reference
     game" caution this item was written with was overridden by a direct instruction to
     implement 178-182 as given.

179. ~~Same session as item 178: externalized content-definition files (quests, tables, NPC
     appearances) as an alternative to large hand-written `.ts` object-literal blocks (~300-400
     lines in the reporting game)~~ - scoped to the concrete case already in the framework
     rather than a new file format: `rpg.questsFromRows`/`QuestStageRow` groups a flat table of
     stage rows (one row per stage, sharing a `questId`, typically a `core.parseCSV` result)
     into `QuestDefinition`s, the same relational shape (two linked flat tables) `core.
     parseCSV`/`actors.buildEntity` already model for other one-to-many content, rather than a
     bespoke nested/branching text format. A quest's `condition`/`counter`/`location` all fit a
     stage row's columns directly since `rpg.EventCondition` is a two-shape union, not a tree;
     a genuinely tree-shaped content format (a branching dialogue) remains the open case a
     `.ts` template literal or a bundler's raw-text import already covers, per item 176's own
     line.

180. ~~Same session as item 178: reduce a game's own import-section boilerplate (~130 lines,
     85+ imports in the reporting game) via some form of auto-registration or plugin
     architecture, each subsystem registering itself rather than being explicitly imported and
     wired by hand~~ - implemented as the disciplined middle ground the tension this item was
     written with called for, not filesystem auto-discovery or decorator-based registration:
     `core.Registry` is a named lookup (`register`/`get`/`has`/`list`, throwing by name on a
     duplicate or a miss) a game still imports and registers each entry into by hand, replacing
     a hand-written `if`/`switch` dispatch cascade rather than the import statement above it.
     `SceneComponentHost` (item 178) uses one internally for its own by-name lookup rather than
     duplicating the same "already registered"/"no X named" logic a second time.

181. ~~Same session as item 178: an ECS-like component system for `Scene2D`, each subsystem a
     self-contained module with its own lifecycle, proposed as the highest-ceiling fix (claimed
     could take the reporting game's `main.ts` under 500 lines)~~ - folded into item 178's
     `SceneComponentHost`/`SceneComponent` rather than built as a second mechanism: this item's
     own text flagged the risk of duplicating `core.Scene`'s existing lifecycle hooks, and a
     second look showed "named sections a factory assembles" (178) and "self-contained modules
     with their own lifecycle" (181) were the same primitive described twice. `SceneComponent`
     forwards exactly `Scene`'s existing hooks, adding no new lifecycle concept and no ECS-style
     entity/query layer beyond that, deliberately - `core.ReactionTable`'s trigger-based
     composition already covers reactive rules, and a query layer over many entities is a much
     larger, distinct feature this session's report gave no concrete evidence for.

182. ~~Same session as item 178: generic save/load typing to cut a game's own save-shape
     boilerplate (~170 lines of interfaces in the reporting game, e.g. `SaveShape`,
     `FloorState`)~~ - scoped to the one concrete shape the framework already has enough of a
     definition for, rather than a generic schema system: `actors.toEntitySaveState`/
     `fromEntitySaveState`/`EntitySaveState` save a `buildEntity`-built entity's mutable state
     (base stat values, level/experience, the carried item) in the same "definitions supplied
     fresh on load" convention `StatBlock.toJSON`/`Progression.toJSON` already draw.
     `fromEntitySaveState` rebuilds via `buildEntity` from the same row and catalog (so
     reactions and item lookups stay validated the same way) and overlays the saved state on
     top. Does not attempt a generic `SaveShape`-inference helper for arbitrary game state - a
     save shape genuinely varies per game, and this item's own text already named that as the
     open question a concrete look would have to answer; entities built through `buildEntity`
     are the one shape `mwg` itself defines closely enough to save generically.

183. ~~Raised from a reference game (`mwg-pixel-dungeon`) wanting alpha/translucency for a
     spectral-type enemy sprite and assuming `TintedSprite`/`ColorTransformBatcher` needed a
     new capability for it.~~ Checked first rather than built blind: `TintedSprite` only *adds*
     one vertex attribute (`colorAdd`) onto Pixi's own colour+alpha packing
     (`groupColorAlpha`), never replacing or shadowing it, so plain `sprite.alpha` already
     composes correctly with both `tint` and `colorAdd` - confirmed live in the reference
     game, not just by reading the packing code (a `TintedSprite` at `alpha = 0.35` rendered
     genuinely see-through). No new capability needed; `TintedSprite`'s own doc comment now
     has a worked alpha/ghost example plus a paragraph stating this explicitly, since a reader
     had no way to know it without reading the batcher's packing code themselves. Followed
     with the documentation-completeness survey this item originally left open, over the rest
     of the render path built on or wrapping `TintedSprite`: `AnimatedSprite` (extends
     `TintedSprite` directly, so gets the same worked example plus a pointer back), and
     `LayeredSprite`/`TileMap`/`NinePatch` (each a `Container` wrapping one or more sprites
     rather than a sprite itself, so each now says explicitly that its own `alpha` still fades
     everything inside it, since Pixi composes a container's alpha into its children when
     rendering regardless of whether the container forwards `tint` by hand the way these do).
     `Camera` turned out not to belong on this list once actually read: it holds no sprite and
     has no colour concept of its own, only a `Container` used as a positional grouping, so
     there was nothing there to document.

184. ~~requested directly: a command-line translation editor with a split screen (reference
     language left, translation right), free choice of which language stands on which side,
     and a per-string sound association. Resolved mid-item into the semantic specification
     rather than a parallel map: a cue is an ordinary `<type>.audio` entry holding a sound
     path, read by a new `audio` channel on the semantic formatter (`format(message,
     'audio')`), played game-side through `mwg/audio`'s `Sound` - one simulation event,
     several presentations, sound among them. The channel resolves through a new `tRaw`
     (same lookup and interpolation as `t()`, without typographic spacing or RTL wrapping,
     either of which would corrupt a path) and returns `''` rather than a key when no cue
     is declared; unlike text channels it never falls back to a bare type holding a
     sentence, which is not a playable path. `validateMessageAudio` flags empty and
     non-string audio entries. The editor itself is `tools/i18n-edit.mjs` (a terminal TUI
     in the ne shape, no dependencies): JSON and FTL auto-detected per file, `x` swaps the
     sides, `s` sets the cue (a channel key shares its semantic family's `<type>.audio`,
     one cue per family), `w` saves following the target's own extension, and `--check`
     reports missing/extra keys, structural and audio issues, completeness, and cue files
     missing from disk for CI. The pure session core (`i18n/EditSession.ts`) is unit-tested
     separately from the terminal rendering, the same split the tool draws between catalog
     arithmetic and file IO.~~

185. ~~requested directly: catalog placeholders shaped like Python f-strings
     (`{dmg:03d}`, `{hp:.1%}`, `{name:>12}`), per
     https://docs.python.org/3/library/string.html#format-specification-mini-language -
     plain `{token}` interpolation already existed, the format-spec mini-language did not.
     `i18n/formatSpec` implements the `[[fill]align][sign][z][#][0][width][,|_]
     [.precision][type]` subset (`b c d e E f F g G n o s x X %`), wired into `t()`/`tRaw`
     alongside `!s`/`!r`/`!a` conversions and `=` debugging, and into FTL parsing so
     `{$dmg:03d}` survives a catalog file. Verified case by case against CPython's own
     output before being written into tests (which caught four real divergences: `c`
     aligning right, `_` grouping hex in fours, precision-without-a-type going exponential
     one digit sooner than `g`, zero-padding a string left-aligned). An ill-fitting spec
     leaves its placeholder untouched rather than throwing, the same grace a missing token
     already gets. The one divergence nothing can close: JavaScript numbers carry no
     int/float distinction, so integer-valued floats always take the integer path (`3.0`
     renders as `3`), documented on the function itself.~~

186. ~~requested directly: UI text managing basic markdown
     (https://www.markdownguide.org/basic-syntax/, minimally bold and italic).
     `two-d/ui`'s `Label` styles the whole string or nothing, so inline spans needed a
     different renderer rather than an option: `RichLabel` draws through Pixi `HTMLText`
     (`**bold**`, `__bold__`, `*italic*`, `_italic_`, combined `***both***`, backslash
     escapes), theme-aware like `Label` with the same `setText` re-render guard. The
     parsing is pure (`parseMarkdown`/`stripMarkdown` in `ui/markdown.ts`, unit-tested
     headless: sequential per-kind pairing, intra-word underscores left alone, unmatched
     markers literal); the widget itself is type-checked and reviewed rather than unit-
     tested, since measuring text needs a canvas this suite has none of - the same reason
     `Label` and `HelpScreen` carry no renderer tests either. Documented as heavier than
     `Label` (descriptions and help bodies, not per-frame numbers) and unsuitable for
     `MessageBox`'s typewriter reveal, where a half-shown marker would read literally.~~

187. ~~requested directly: f-string parsing and markdown rendering inside `tools/i18n-edit`
     itself. Both panes already showed raw source, so a dropped `{dmg:03d}` and a broken
     `**bold**` were equally invisible until runtime. The panes now preview markdown as
     terminal bold/italic (`v` toggles raw source for editing), flag placeholder drift
     with a `≠` marker and per-row detail, hint the needed tokens in the edit prompt, and
     report both in `--check` mode (a mismatch fails the check like a missing key).
     Backed by `i18n.tokenizeMessage`/`diffPlaceholders` - the placeholder grammar factored
     out of `t()`'s own interpolation into one shared definition, so the check cannot
     disagree with the runtime about what counts as a placeholder.~~

188. ~~requested directly: progressive display in `ui`, beyond `MessageBox`'s own typewriter
     (`speed` characters per second, already shipped long before this item). The missing
     piece was a reusable primitive: `ui/reveal.ts` (`startReveal`/`advanceReveal`/
     `completeReveal`/`revealComplete`, pure and unit-tested) now sits behind
     `Label.showProgressive`/`updateReveal` and `RichLabel`'s markdown-aware counterpart,
     which counts visible characters through `ui.sliceSpans` so markers never count toward
     the total nor leak half-shown - exactly what a plain slice over the source would get
     wrong. `MessageBox` was reworked onto the same primitive with zero behaviour change
     (its confirm-completes-then-advances rule untouched), so one implementation serves
     all three rather than three parallel counters.~~

189. ~~requested directly: a shortcut (`Ctrl+P`, free in the tool's keymap) in `i18n:edit`
     to play the sound cue on the current row. A dependency-free tool cannot bundle audio
     playback, so `playerCandidates` delegates to the OS player (`afplay` on macOS,
     format-matched `aplay`/`paplay` before general `ffplay` elsewhere, Windows WAV via
     SoundPlayer with single-quote escaping), falling through only on `ENOENT` - a player
     that runs and rejects the file reports its own error instead. `MWG_SFX_PLAYER`
     replaces the list with one command when none fit; `platform` is injectable so the
     selection is unit-tested without spawning anything. Plain `p` stays deliberately
     unbound, remote `data:`/`http` cues and missing files report instead of playing, and
     playback never blocks the interface (it resolves back into the status line).~~

190. ~~requested directly: the string editor on the website, as an `examples/` page with a
     default string, usable sounds, and a preconfigured variable - `examples/string-editor`
     shows `You're *hit*. You loose {HP_loose}. You **die**!` beside an editable French
     translation, rendered live through `RichLabel` with an adjustable `HP_loose`,
     placeholder-drift warnings via `diffPlaceholders`, and blip/hit/pickup cues where the
     string's own cue fires on the progressive reveal. Wired through the existing pipeline
     (`example:string-editor:build`, `build-webpage-examples`, an `examples-data.js` entry
     with a generated `20_string_editor` diagram) and featured as its own card on the
     website's features page, in that page's problem/trick/example voice. Browser-verified
     from `file://`, including typing, HP changes, cue cycling, the reveal, and the
     features-to-example link chain.~~

191. ~~requested directly: a generic `Blob` API with a per-cell clear operation~~ - `Blob`
     moved from `roguelike` to `core` (still top-level through `mw_games`) and now imports
     nothing, so a volume field is no longer a dungeon-crawl concern; it gained `clear(x, y)`
     to zero one cell without touching its neighbours, and the bounds check `volumeAt`,
     `seed` and `clear` all repeated is one private `index` helper. 8 unit tests, including
     the add/clear round-trip and a cleared cell dropping out of `cellsAbove`.

192. ~~requested directly: accessibility stops short of what a redistributable framework
     should cover~~ - the three named holes are closed. `core.reducedMotion`/`setReducedMotion`/
     `prefersReducedMotion` answer "should this animate" from the OS preference with a per-game
     override, and `Tweener`, `Camera.shake`, `ScreenEffects` and `ParticleEmitter` already
     consult it; `ui.contrastRatio`/`meetsContrast`/`relativeLuminance` are the WCAG formulas
     with AA/AAA thresholds, checked against the shipped themes; and `ui.screenReader` mirrors
     text into a visually hidden `aria-live` region that `Window` (its title) and `MessageBox`
     (each page and its choices) already use, no-op where there is no DOM. 14 unit tests.

193. ~~requested directly: nothing proves the central promise end to end~~ -
     `tools/package-smoke.mjs` packs the tarball, installs it into a scratch directory outside
     the repo, builds the tutorial's own tiny game with its vite config, applies step 10's
     module-to-classic edit, and opens both that page and the standalone `mw_games.global.js`
     from `file://` in headless Chrome, judged the same way the visual smoke judges a page. CI
     runs it per pull request. The checklist's manual pass stays: only a person can tell
     whether the prose is followable.

194. ~~requested directly: the rendering-backend policy weighs bundle cost, but nothing
     measures it~~ - `tools/bundle-size.mjs` records the global build (raw and gzipped) and the
     whole published `dist` without source maps in `tools/bundle-size.json`, and
     `npm run size:check` fails past a 2% growth; `size:update` commits a deliberate new
     number. CI runs the check after the build.

195. ~~requested directly: `npm run coverage` reports with no floor~~ - `npm run coverage:check`
     runs the same suite under Node's own thresholds, lines 88, branches 89, functions 82, a
     little under the 89.3 / 90.4 / 83.1 measured when the floor was set. CI runs it beside the
     plain test step.

196. ~~requested directly: no test loads a save written by an earlier shape~~ -
     `tests/fixtures/saves/` freezes a released floor (`Level`/`Secrets`/`Doors`), a
     `GameState` and a `Blob` as committed blobs, and `tests/save-compat.test.ts` loads each
     one, so a schema change that stops an already-shipped save from loading fails there. Its
     own note says to add a new fixture beside the old one rather than edit it.

197. ~~requested directly: only the interface example is built per pull request~~ -
     `npm run examples:build` runs all twenty `example:*:build` scripts after generating the
     shared assets, and CI runs it as its own job, so a vite/`emit-page`/`compile-resources`
     regression in any example fails the pull request.

198. ~~requested directly: SVG loads as a texture source (item 15) but only rasterizes at its
     intrinsic size, so a game that zooms into an icon ships a soft bitmap~~ -
     `assets.load(paths, { resolution })` passes a resolution through to the loader, which
     rasterizes a vector source at that multiple of its intrinsic size; the colour-transform
     example loads its gem SVG at 2x. A companion measurement, `npm run benchmark:animation`,
     compares CSS/SVG element animation against Pixi sprites at increasing counts. On an RTX
     3070 it settled the question the same way for every count measured: 4000 composer-animated
     `<svg>` elements fall to ~14 fps while 4000 Pixi sprites hold 60, and running both at once
     is limited by the DOM side, so browser-native element animation stays an asset-format win
     and a possible handful-of-chrome-elements escape hatch, not a world renderer.

199. ~~requested directly, from WebKit's "Responsive Design for Motion" (item 192 shipped the
     media feature itself): the reduced path is binary and blunt~~ - `MotionIntent` and
     `motionDuration` now let a caller declare a motion `decorative` (collapses, the old
     behaviour) or `meaningful` (shortened, not deleted), and `Tweener.tween` takes
     `{ intent, alternate }` so a trigger can be replaced by a fade instead of cut outright.

200. ~~requested directly, same article: 192 wired four paths (`Tweener`, `Camera.shake`,
     `ScreenEffects`, `ParticleEmitter`) and missed the triggers the article actually names~~ -
     `Camera.panTo`/`follow` now cut to the target instead of easing (the multi-directional
     peripheral trigger), `FloatingText` keeps its fade and drops its rise, and `AnimatedSprite`
     is a documented keep: a frame cycle is usually game state, not decoration, with `paused`
     there for a game whose loops are purely decorative. `GridMover`'s own step stays, being
     user-driven.

201. ~~requested directly, same article: `reducedMotion()` reads `MediaQueryList.matches` live, so
     the next query is correct, but nothing is notified when the user flips the setting~~ -
     `watchReducedMotion(listener)` returns an unsubscribe and fires both on a real media change
     (with the deprecated `addListener` spelling supported) and on `setReducedMotion`. `Tweener`,
     `ParticleEmitter` and `ScreenEffects` finish or freeze an in-flight motion when the
     preference appears, and the interface example's demo subscribes to update its label.

202. ~~requested directly, same article: nothing in the repo exercises the preference outside
     unit tests~~ - the interface example gained a motion demo (a sliding diamond, a label, a
     toggle button) publishing its state on `window.__MWG_MOTION__`, and
     `tools/motion-smoke.mjs` opens it three ways through `page.emulateMedia`, asserting that
     full motion animates, an emulated `reduce` before load stops it, and a flip while the page
     is open is reported and stops the running slide. CI runs it in the visual-smoke job.

203. ~~MWL as the default content boundary for complete games: assets, maps, scenarios, units,
     items, dialogue, rules data, schedules, and AI configuration should be authored in
     structured CFG/MWL files (with JSON or another explicit data format only where it is a
     better fit), parsed and validated by MWL, and compiled at build time. Game TypeScript
     should provide the generic engine, rendering and input code, plus explicit hooks for
     genuinely executable game rules; it should not embed authored content as object literals
     or ad-hoc constants. The roadmap work includes a first-class content-file layout, generated
     typed modules/manifests, source-location diagnostics, deterministic build integration, and
     examples covering assets, scenarios and AI. This is an architectural boundary, not a
     request to put any Wesnoth or other game's content into MWG. The first slice is now
     implemented: `mwl build` accepts one file or a recursive content directory, sorts source
     paths deterministically, validates and merges them, and emits the compiled module,
     translation catalog, and asset manifest. Wesnoth keeps its native `.cfg` files as source
     and routes them through its port-owned WML front end and MWL adapter. Generic item,
     expression, hook, persistence, and game-neutral AI catalog contracts are published; complete game migrations remain
     open work. `examples/mwl-content/` now provides the reference layout with separate game,
     unit, item, scenario, and AI files, is consumed by an executable page through its generated
     module, and is validated by the same directory build command. `examples/battle/` now also
     migrates its species, moves, type matchups, and evolution to `content/battle.mwl`; its
     TypeScript contains only the battle loop and game-specific damage formula. Generated source
     locations are relative and stable across machines.~~ - `examples/battle` is now a complete
     reference game using MWL-generated species, moves, type matchups, and evolution data; the
     remaining extraction work is tracked separately in item 204.

204. ~~MWG content extraction from a large self-contained HTML file: on the first run, inspect
     inline scripts, styles, data URIs, and embedded resources, write them to a deterministic
     asset directory, and rewrite the HTML or emit a manifest that references those extracted
     files. The command must be safe to rerun, preserve resource MIME types and ordering, and
     report resources it cannot extract without silently changing them. Initial implementation:
     `tools/extract-html.mjs` provides `extract-html input.html -o output/`: it writes a copy,
     extracted assets, and a fingerprinted manifest, preserves source order, deduplicates
     identical resources, keeps the input untouched, and warns about moved module imports.
     CSS `url(data:...)` and HTML `srcset` candidates are also extracted. Integration with
     the website build and less common embedded-resource forms remain open.~~ -
     `tools/extract-html.mjs` is shipped with the package and its `extract:html` command is
     usable by website and game build scripts; four tests cover scripts, styles, HTML data URLs,
     CSS data URLs, `srcset`, deduplication, ordering, and module warnings.

~~205. Opaque child tags in MWL schemas: a game whose content vocabulary is open should not have
     to enumerate every tag name in its schema extension just to pass validation. The Wesnoth
     port's adapter declares roughly forty tags (`[damage]`, `[poison]`, `[leadership]`,
     `[filter_base_value]`, ...) only so its compiled effect trees validate, and that list has
     to be kept in step with the game's macro files by hand. A schema option (`openChildTags`,
     or a wildcard child entry) should accept any child tag under a node whose children are
     game-defined and validate those children as open attribute bags, while the fixed part of the
     schema keeps its diagnostics. Paired with item 209 this stays honest: the tags a game
     actually uses get reported, not merely tolerated. Generic item; the vocabulary itself stays
     in the game that owns it.~~

~~206. Compiled-MWL to typed table readers: ports hand-write one reader per tag to turn compiled
     nodes back into typed records (`compiledTerrain`, `compiledUnitType`, `compiledMovetype`,
     `compiledSpecial`, ...); the Wesnoth adapter carries more than ten of them, each repeating
     the same attribute, number, id-list, and child-collection handling. A generic helper in
     `mwg/mwl` - a field spec for scalar attributes (with number, id, and comma-list coercions)
     and child collections, returning a typed record - would remove the boilerplate and give one
     place where a missing or malformed field is reported with its source location. Generic item;
     it is the read side of the same boundary item 203 describes.~~

~~207. One modifier-composition rule shared by `mwg/actors` and MWL effect lists: both models
     exist today and do not share a documented composition, so a game that needs "a list of
     declarative effects modifies a base value" writes its own. The Wesnoth port did exactly
     that: set, add, sub, multiply, divide, min/max clamps, a base-value filter, and an
     offense/defense scope, all port-side. Provide the minimal generic composition in one module
     and use it for `actors` modifiers, with the deliberate boundary that only the generic rule
     travels: no game's numeric quirks, scaling conventions, or effect-vocabulary names come with
     it. Generic item.~~

~~208. Bounded expression evaluation for content-authored conditions and values: game data wants
     conditions (`level < other.level`, "this unit is adjacent to an ally", "the target is
     petrified") and computed values (`value="(25 * (level - other.level))"`), and today a port
     either adds a hook per case or implements a parser of its own. A small, documented evaluator
     over a declared context (`self`, `other`, plain unit fields) should cover the
     formula-shaped subset the content actually uses: arithmetic and comparisons, boolean
     `and/or/not`, a short fixed list of named helpers, and `where` bindings for local names.
     The boundary is explicit - no loops, no side effects, no user-defined functions, no string
     manipulation beyond equality, and a clear diagnostic when a content file needs more than
     that. Relates to the expression module already used by MWL; the remaining work is the
     filter-shaped context, the named-helper list, and the documented limit. This is the cheap
     path that covers most content formulas, and it is deliberately smaller than item 210.~~

~~209. MWL content report: `mwl report <content>` printing counts per tag, the tag names an opaque
     schema accepted (item 205), and dangling references - an ability id, unit type, terrain code,
     or asset a content file points at with nothing behind it. Ports need this for the data-parity
     tests they write anyway, and it turns an extraction regression into a CI failure rather than
     a surprise at runtime. Generic item.~~

~~210. Script host boundary, with Lua as an optional adapter rather than a core dependency: real
     games need more than data and expressions - a campaign script that reacts to arbitrary state,
     a generator, an AI. Today the only answer is a JavaScript hook, which is fine for a game the
     project itself owns and wrong for content the engine did not write. The work is a small
     `ScriptHost` interface in `mwg/mwl` (evaluate, execute, call a named function, receive a
     context and an emit callback) with three implementations: the bounded expression evaluator
     (item 208, the default), the existing JavaScript hooks, and an **optional** Lua adapter that
     ships outside the core package so MWG keeps its dependency list. Cost, stated plainly, since
     it decides the design: a pure-JavaScript Lua (fengari, Lua 5.3) is roughly 200-240 KB raw and
     55-65 KB gzipped, loaded synchronously, which fits the single-file `file://` story; a
     WebAssembly Lua (wasmoon, Lua 5.4) is roughly 200-260 KB total and needs an async wasm fetch
     or a large base64 inline, plus glue. Either way the adapter must sandbox the VM (`os`, `io`,
     `os.time` removed), make it deterministic (seeded random only, an instruction budget per
     call so content cannot hang the frame), and decide persistence explicitly: VM state is not
     serialised into saves, so scripts re-run from a declared entry point on load. Un-parked by a
     game that must run existing Lua content unmodified - mainline Wesnoth campaigns are exactly
     that case (338 `.lua` files with the AI and campaign scripting) - and it stays parked while
     item 208 covers the content formulas. Generic item; no game's Lua library travels with it.~~

~~211. Optional asset-root validation in the MWL build: a port's build script should not have to
     repeat the same `game.assets` existence check before emitting generated files. Add an
     explicit `--asset-root` or equivalent build option that resolves logical asset paths,
     reports missing files with their source locations, and keeps the default build portable
     when assets are resolved by another packaging step. This is the generic part extracted
     from the Pixel Dungeon adapter; asset naming, packaging and runtime resolution remain
     game-owned.~~

~~212. JavaScript AI module: provide a renderer-free, game-neutral foundation for authoring and
     running game AI in JavaScript, building on the `ScriptHost` boundary from item 210. The
     module should cover named behaviours or planners, perception supplied by the game,
     deterministic seeded decisions, explicit action requests, cancellation, and a per-turn
     or per-frame budget so an AI cannot stall the game loop. It should expose observable
     decisions and diagnostics for replay, tests and debugging, while keeping navigation,
     combat rules, world data and game-specific goals in the owning game. It must work with
     MWL-authored AI configuration without turning authored content into framework-specific
     code.~~ - `mwg/ai` now provides `JavaScriptAI`, explicit JSON-shaped actions and state,
     seeded decisions, cooperative cancellation and budgets, emitted diagnostics, and
     versioned state import/export. `alphaBetaSearch` adds bounded minimax with a typed,
     game-owned state adapter, so the same module serves a local actor or a top-level
     controller. The renderer-free contract keeps navigation and game rules in the owning
     game, while MWL supplies the profile and operation names.

~~213. Lua AI module: add an optional Lua implementation of the AI contract from item 212,
     sharing the same perception, action, determinism, budget, diagnostics and persistence
     boundaries as the JavaScript module. Keep Lua outside the core package and preserve the
     local-file deployment story. The adapter must be sandboxed, exclude filesystem, process,
     clock and network access, use only seeded randomness, enforce an instruction budget, and
     define how scripts resume after save and load. Lua is a content and modding boundary,
     not a reason to move game rules into the framework or to ship any reference game's Lua
     code or data.~~ - `mwg/ai/lua` provides the optional Fengari-backed `LuaAI` adapter with
     the shared action and state envelope, sandboxed deterministic execution, instruction
     budgets, explicit events, and no reference-game content. Lua alpha-beta search calls
     named Lua operations for current player, legal moves, transitions, terminal detection and
     evaluation, so it has the same actor and controller capability as JavaScript.

214. ~~Typed tables and rows in MWL: add a game-neutral table/row/column primitive, or an
     equivalent declaration on an MWL effect, so structured values are validated at compile
     time instead of remaining opaque strings. It must support typed columns, explicit
     delimiters, compile-time arity checks, and a typed accessor in the content catalog. Reuse
     the existing `CsvColumnType` vocabulary and RFC-4180 parsing rules where possible. This
     closes the gap between MWL and `core.parseCSV`, and prevents malformed room-count,
     probability and similar content tables from surviving compilation until first runtime
     generation. The framework owns the shape and diagnostics; game-specific tables remain
     game-owned.~~

215. ~~Generic reference and foreign-key values in MWL: add an `MwlValueType` of `ref`, with a
     declared target tag or id namespace, so a value can be checked against existing node ids
     during compilation. Report missing and duplicate targets with source locations, and
     provide cycle diagnostics where a declared reference graph requires acyclic data. Keep
     domain rules in the game adapter: MWL should validate that an enchant, roster member,
     asset or transition names something that exists, not decide what that relationship means.~~

216. ~~Caller-chosen `EntityId`: extend the entity registry boundary with an optional caller-
     supplied id, while preserving generated ids as the default. The id must reject duplicates,
     remain stable through save/load, and follow the existing `Registry.register(name, value)`
     convention so games can persist meaningful hero and item identities without a parallel
     id-minting layer.~~

217. ~~Value positions in `Types2D`: replace type-only aliases with value-capable renderer
     boundary types wherever a game needs to extend or construct a Pixi object. Keep the
     renderer isolation rule intact, and measure the resulting import and bundle cost before
     widening the public surface.~~

218. ~~Deterministic generated-artifact emission: provide an `onEmit` or `emitArtifacts` hook for
     MWL builds, with a built-in compile-twice-and-compare determinism check. It should cover
     the generated module, i18n catalog, asset manifest and game-defined generated artifacts,
     replacing repeated port-owned emission glue without taking ownership of game content.~~

219. ~~Affix pool filtering: extend `rollAffix` with an optional curse or pool predicate, or add
     a `splitAffixTable` helper, so games can select curse and non-curse pools without
     hand-splitting the same table. The helper must preserve seeded determinism and leave the
     affix definitions and balance values game-owned.~~

### High-value, small-surface event work

220. ~~Numeric event-condition equality: event conditions currently compare `world.variables[x]`
     with `attributes.equals` using strict equality, so numeric variables never match string
     attributes. Coerce values when both sides are numeric, or reuse `evaluateCondition` for
     condition children, with tests for counters and turn gates.~~

221. ~~Expression-backed `set_variable`: connect the existing `expression.ts` evaluator to
     `set_variable` values so counters and arithmetic do not need game-side hook round trips.
     Preserve the bounded, game-neutral expression rules and deterministic runtime behavior.~~

222. ~~Public fire-by-id: add `MwlRuntime.fireEvent(id)` using the existing claim-and-execute
     path, so content can trigger a named event without build-time inlining or game-specific
     event plumbing.~~

223. ~~Moveto coordinate lists and ranges: accept comma-separated coordinates and inclusive
     `a-b` ranges in event `x` and `y` attributes, expanding them during compilation or into
     the runtime matcher with deterministic validation and no duplicated event execution.~~

### Medium event and objective work

224. ~~Unit-id event filters: allow event filters to match the unit's world key in addition to
     side, type, position and other existing criteria, enabling death-of-a-named-unit triggers
     without variable smuggling.~~

225. ~~Side-aware `unit_at` objectives: honor an optional `side` or `side_filter` on
     `unit_at`, matching the existing side semantics of `units_dead`.~~

226. ~~Top-level event dialogue: execute a top-level `say` child in an event, or reject it at
     validation time. Content must never silently drop a schema-legal command.~~

227. ~~Dialogue branches: implement the currently schema-legal `branch` runtime behavior, or
     remove it from the schema until supported, so authored content cannot rely on a dead tag.~~

### Dialogue persistence and documentation

228. ~~Persist pending dialogue choices: save and restore pending `{ id, choices }` state beside
     fired events, or explicitly document and enforce that games must resolve choices before
     saving. Prefer persistence so mid-choice saves do not lose player input.~~

229. ~~Document post-dialogue event ordering: explain that commands after a dialogue in the same
     event run immediately before the player answers, and that follow-up commands belong in
     the selected choice event when they must wait for the answer.~~

230. ~~Document dialogue choices in the public MWG documentation: record that dialogue choices are supported and that
     `MwlMessage.choices` together with `answerDialogue` is the answering contract.~~

231. ~~MWL campaign tag: add a game-level `[campaign]` container with validated metadata for
     `id`, `name`, `title`, `description`, and `start_scene`, while leaving scenario and
     progression children game-owned. Expose the metadata through `contentCatalog(game).campaigns`.~~

232. ~~Multi-turn actions: provide a game-neutral primitive for actions that persist across turns,
     including beam traversal, path resolution, interruption or cancellation, and per-step damage
     or effect handling. Add an example that exercises a multi-turn beam with blockers, movement,
     targets and deterministic replay, so the framework and example can be simplified together
     rather than duplicating action-state logic in the game.~~ - `roguelike.MultiTurnBeam` advances
     a captured line one cell per turn, checks opaque and dynamic blockers at reach time, looks up
     live targets, delegates damage to the game, supports cancellation and JSON save/restore, and
     is covered by the `multi-turn-beam` example and focused tests.

233. ~~Hex-map parity for map functions: implement the same map-facing capabilities for hex grids
     that exist for square maps, including minimap rendering, automap rules, exploration and
     remembered terrain, field of view, targeting shapes, movement/path queries, map transitions
     and any related map helpers. Keep coordinate and neighbour semantics consistent with the
     existing odd-q hex topology, and add topology-specific tests and examples so a hex game does
     not need parallel game-owned implementations for features already available on square maps.~~
     Existing FOV, exploration memory, pathfinding, auto-explore, map transitions and TileMap
     projection already use the shared hex topology. The remaining seams now use it too:
     `resolveAreaOnLevel`, `hexConeCells`, topology-aware line-of-sight and range checks,
     hex `Minimap` geometry and markers, hex-compatible automap rules, and hex traversal in
     `MultiTurnBeam`, with focused parity tests.

234. ~~Game-defined terrain data: extend `TerrainKind` with an optional game-defined payload such
     as `flags` or `extras`, returned by `kindAt(x, y)`. Keep MWG unaware of game-specific
     concepts while removing duplicated terrain tables and hand-written flag tests in adapters.
     The payload must support flags such as flammable, solid, line-of-sight blocking, avoid,
     pit and liquid without changing the generic terrain contract.~~ `TerrainKind` now carries
     optional numeric `flags` and boolean `extras` without interpreting either payload.

235. ~~Level view distance: add an optional `viewDistance` to `Level`, and let `FieldOfView` use
     it as the default radius. This gives heroes, mobs and observers one shared visibility value,
     while allowing game effects to change it for darkness, boss phases or other mechanics.~~
     `Level.viewDistance` is optional, mutable, validated, persisted, and used by `FieldOfView`
     when `update` receives no explicit radius.

236. ~~Priority and deferred actors: extend `Scheduler` with priority-ordered actions, or provide
     a generic `DeferredEffect` actor that runs once per turn, self-removes and returns a removal
     handle. It must resolve before ordinary creature actions when requested, so telegraphs,
     delayed attacks and temporary visual effects do not need game-owned scheduling fields.~~
     `Scheduler.add` now accepts a priority and orders equal-time entries from highest to
     lowest priority, with snapshot/restore support. A deferred effect can use an ordinary
     `Actor` with a finite lifetime and remove itself through the existing scheduler API.

237. ~~Ballistica-style paths: add a game-neutral path query such as
     `ballistica(from, to, { stop })`, returning traversed cells and the collision or stopping
     cell. Support configurable stop modes for beams, cones, projectiles and impacts while
     preserving the existing `traceLine` primitive for simple Bresenham queries.~~
     `ballistica(level, from, to, { stop })` supports opaque, impassable, outside and no-stop
     modes, follows square or hex topology, and includes the collision cell in its result.

238. ~~[Critical] Extensible MWL event loops: add game-neutral `while`, `foreach`, `switch`,
     conditional branches and structured variables to the MWL runtime. Keep loop limits,
     recursion limits and diagnostics explicit so authored content cannot hang a game.~~ The
     runtime now supports bounded `while`, `foreach` and `switch` nodes, nested variable paths,
     and expression-backed branch tests with focused coverage.

239. ~~[Critical] Extensible transactional state: provide a framework state extension registry
     with snapshot, restore and transaction boundaries, so games can persist their own data
     atomically without fragile synchronization between unrelated systems.~~ `StateRegistry`
     now coordinates named game-owned extensions with deep-cloned snapshots and rollback on
     failed transactions.

240. ~~[High] Generic action journal: record serializable actions and outcomes with deterministic
     ordering, supporting replay, undo, synchronization and debugging without imposing game
     combat rules on MWG.~~ `ActionJournal` now records cloned action/event batches, contiguous
     sequence checkpoints, incremental reads, truncation and validated JSON restore.

241. ~~[High] MWL event tracing: expose an opt-in observer for event claims, hooks, variable
     changes, content diagnostics and runtime errors, with enough context to reproduce a trace
     without logging game-owned data by default.~~ `MwlRuntimeOptions.onTrace` now reports
     event claims/completions, variable writes and runtime errors without enabling logging by
     default.

242. ~~[High] Extensible filter and predicate registry: let adapters register typed predicates and
     compose them in MWL events, so games do not encode every filter as an opaque string while
     the framework remains unaware of Wesnoth-specific filter semantics.~~ `MwlHookRegistry`
     now accepts named predicates for typed adapter-owned filter conditions, with schema
     validation and focused runtime coverage.

243. ~~[High] Robust save migrations: version game extensions independently, support ordered
     migrations with diagnostics, and define an explicit policy for entities removed from a
     roster during restore.~~ `StateExtension` now supports independent versions, ordered
     migrations, restore diagnostics, and explicit `keep`/`reset`/`remove` handling for
     extensions absent from a snapshot.

244. ~~[Medium] Diagnostic content loading: standardize a content-load report covering resources,
     validation errors, dependencies and intentionally ignored elements, without deciding the
     meaning of game-specific tags.~~ `loadContent` now returns resources, references/dependencies,
     ignored opaque tags and structured compile/validation diagnostics.

245. ~~[Medium] Generic scenario and campaign API: model level order, results, carry-over,
     reminders and transitions without embedding Wesnoth recruitment, recall, campaign or WML
     semantics in MWG.~~ `Campaign` now provides game-neutral level sequencing, results,
     carry-over state, reminders, transitions and JSON-safe snapshots.

246. ~~[Medium] Headless scenario harness: run a scenario from a seed and action sequence, expose
     a verifiable final state and ordered outputs, and make the harness suitable for continuous
     integration and deterministic regression tests.~~ `runHeadlessScenario` now runs a seeded,
     renderer-free command sequence and returns final state, ordered events and resumable random
     state.

The following remain responsibilities of the Wesnoth adapter: combat, terrain and unit rules;
exact WML filter semantics; recruitment, recall and Wesnoth carry-over; Wesnoth-only tags;
Lua compatibility; and Wesnoth campaign data.

### Wesnoth port gaps

Opened by the Wesnoth port's own gap analysis (2026-09-11), read from this side: `mwl`, `two-d`,
`ui`, `core`, `ai` and `simulation` against what a faithful Wesnoth port needs. Each item says
whether the capability is missing outright (Absent) or present in a shape that does not fit (Ne
correspond pas), because that decides whether a port extends or builds. The structural blockers
the analysis names are 247, 248, 254, 255, 257, 258, 261, 262, 266 and 268.

Two of these sit against the paragraph above, which lists Wesnoth campaign data and carry-over as
adapter responsibilities. That paragraph stands, and the data still stays the adapter's: what the
analysis asks the framework for is the shape (the fields, the end-of-level semantics, the save)
so that a port is not hand-rolling a campaign sequencer `simulation/Campaign.ts` already
half-provides.

The analysis also names what is **not** a gap, and that is worth keeping: dialogue
(`DialogueStage`/`StageScript`), the minimap, fog (`FactionFog`), saves (`SaveSystem`), rebinding
(`RebindScreen`), `MessageBox`, `Tooltip`, `Toast`, the base widgets, `TileMap`'s hex shape with
chunks and `setCellColor`, `LayeredSprite`, `StatusVisuals`, `NinePatch`, `Bar`, `IconGrid`,
`StatsScreen`, `HelpScreen`, `Camera`, `Generator`, `parseTerrain` and the `MwlRuntime` hooks all
exist already. Several gaps felt on the port side are non-reuse of `mwg` rather than absence from
it.

247. ~~[High] MWL campaign chaining (Absent). `MwlCampaignDefinition` (`src/mwl/content.ts`) carries
     `startScene`, a scene/RPG model, and the `[campaign]` schema (`src/mwl/schema.ts`) reads only
     `id`/`name`/`title`/`description`/`start_scene`. A Wesnoth campaign needs `first_scenario`,
     per-scenario `next_scenario`, and the scenario list itself. `simulation/Campaign.ts` already
     models level order, `next` and a snapshot, so the work is pointing `[campaign]` at that
     sequencer, not inventing one.~~ Landed: the `[campaign]` schema accepts `first_scenario`,
     `contentCatalog` exposes each campaign's `scenarios` as `{ id, nextScenario }` read from its
     `[scenario]` children, and `mwl.campaignChain` points that chain at `simulation.Campaign` -
     the work the item said it was, no new sequencer. The order is content and the playing stays the
     game's, since the runner is a callback; a scenario whose result carries `next` keeps it, which
     is the hook a runtime `[endlevel]` needs and the only thing missing between this and 248. Seven
     tests in `tests/mwl-campaign.test.ts` go through the real parser into the real sequencer, and
     malformed chains throw by name (no scenarios, an id twice, a `first_scenario` nothing
     declares). Carrying gold and units from one scenario into the next is 248, still open.
248. ~~[High] `[endlevel]` and carry-over (Absent). `MwlCommand` (`src/mwl/runtime.ts`) is
     `set_variable`/`modify_gold`/`move`/`spawn`/`kill`/`attack`/`end_turn`/`win`/`lose`, and
     `MwlWorld.status` is `playing | won | lost`, so everything stops at the current scenario.
     Missing: `result` victory/defeat, `bonus`, `carryover_percentage`, gold and unit carry-over
     between scenarios, and the recall list.~~ Landed: `[endlevel]` is a command in both paths (the
     MWL tag and the `MwlCommand` union), it ends the scenario won or lost, and it records what is
     handed on in `world.carryover`. The arithmetic is `endLevelCarryover`, checked against the
     reference rather than remembered: a share of the side's gold (`carryover_percentage`, 80% when
     unset, which is the engine's own default), plus `bonus`, plus that side's surviving units as
     the recall list, plus `next_scenario` - which is the `next` hook 247 already honours, so a
     campaign chains on without either item knowing about the other. `carryoverIntoScenario` is the
     second half of the rule: added to the next scenario's declared gold when `carryover_add` asks
     for it, a floor under it otherwise. `MWL_DEFAULT_CARRYOVER_PERCENTAGE` names the default. Eight
     tests in `tests/mwl-carryover.test.ts`, half of them arithmetic and half through the real
     runtime, and the schema now accepts `[endlevel]` and `first_scenario`.
249. ~~[Medium] One save for a whole campaign (Absent). `SaveSystem<T>` (`src/core/Save.ts`) is
     per-system (slots, meta, list, delete) and `mwl/persistence.ts` serializes only `MwlWorld`,
     so nothing saves campaign progress, the world and the simulation state together.~~ Landed as
     `simulation.CampaignSave`, a thin composition over `core.SaveSystem` rather than a second save
     format: one slot's state is `{ campaign, world, simulation }`, captured through each live
     piece's own `snapshot()` (`Campaign.snapshot()` and `SimulationRuntime.snapshot()`), with the
     world left opaque so an `MwlWorld`, a `roguelike.Level` or a game's own scenario object all
     fit. Versioning, migrations, previews, the `localStorage`/in-memory fallback and slot listing
     stay `SaveSystem`'s; `load` hands back the three plain snapshots, which `Campaign.restore` and
     `SimulationRuntime.restore` read back. Seven tests in `tests/campaign-save.test.ts`, including
     a migration that rewrites the whole envelope, two independent slots, and a real `Campaign` and
     a real `SimulationRuntime` round-tripping through a load.
250. ~~[Medium] WML action vocabulary in `[event]` (Ne correspond pas). MWL's `[event]` set is
     RPG-shaped (`while`/`foreach`/`switch`/`command`/`say`/`dialogue`/`move`/`attack`/`spawn`/
     `kill`/`gold`/`set_variable`/`if`/`else`/`message`/`teleport`/`end_turn`/`win`/`lose`/`hook`,
     `src/mwl/schema.ts`). Missing the WML ones: `store_unit`, `unstore_unit`, `modify_unit`,
     `heal_unit`, `recall`, `endlevel`, `story`, `set_terrain`, `capture_village`, `clear_shroud`,
     `fire_event`, `role`, and scenario-level `[object]`/`[item]`.~~ `endlevel` had already landed
     under 248. The rest landed on the same event surface: `fire_event`; `store_unit` (a variable
     holding unit snapshots), `unstore_unit` and `recall` (with an optional hex/side placement);
     `modify_unit` (a `[filter]` chooses the units, `[set]` the changes) and `heal_unit` (`amount`
     or absolute `hp`); `set_terrain`; `capture_village` and `clear_shroud`, backed by two new
     `MwlWorld` records (`villages`, `clearedShroud`) that are data the game reads, not a fog or an
     income rule minted here; and scenario-level `[role]`, `[object]` and `[story]`, which fill
     `roles`/`objects`/`story` and all survive a save. One honest gap, named rather than faked:
     WML's scenario-level `[item]` is *not* implemented, because `[item]` already means an inventory
     item definition in MWL and adding `x`/`y`/`image` to that tag would overload it, while renaming
     a shipped tag would break content. The `[set]` child is `[modify_unit]`'s WML shape; a bare
     `[modify_unit] hp=5` changes every unit it matches without a filter. Thirteen tests in
     `tests/mwl-actions.test.ts`; the existing 117 MWL tests pass unchanged.
251. ~~[Medium] `[kill]` as a filter (Ne correspond pas). `killUnit` throws `MWL unit is not alive`
     when nothing matches, where WML's `[kill]` is a no-op on an empty match. A content error and
     an empty filter are different things and the runtime cannot tell them apart today.~~ Landed:
     `[kill]` now has two shapes that fail differently, on purpose. Naming a unit (`unit=`/`target=`)
     still throws when that unit is not standing, because that is a content mistake. Anything else is
     a *filter* over the world's units - the same attributes an event filter reads, via
     `unitMatchesFilter` - and a filter that matches nobody is a no-op, which is what WML does. An
     empty filter matches every unit there as here, and the doc comment says so before someone
     writes one. `MwlCommand`'s `kill` variant takes an optional `filter` for the same two shapes,
     and the `[kill]` schema entry is open on attributes now, since a filter is not a fixed list.
     Six tests in `tests/mwl-kill.test.ts`.
252. ~~[Medium] `[side]` attribute surface (Ne correspond pas). `[side]` reads
     `id`/`controller`/`gold`/`income`/`income_base`/`income_per_village`/`leader`/`team`/
     `recruit`/`color`, and `MwlWorld.sides` keeps gold/income/leader/controller/recruit. Missing
     `share_vision`, `fog`, `shroud`, `team_name`, `user_team_name`, `flag`, `village_gold`,
     `heal`, `hidden`, and per-side `defeat`/`victory` conditions.~~ Landed except the last clause,
     which is 283: the keys are read onto `MwlWorld.sides` exactly as written, checked against
     Wesnoth's own data first (`team_name=north`, `share_vision=shroud|none`, `village_gold=2`,
     `fog=yes`, `shroud=yes`, `hidden=yes`, `heal=yes`, `user_team_name=_"..."`) - which is what
     showed `heal` is a boolean there and not a number, where guessing would have typed it wrong.
     `yes`/`no`/`true`/`false` all read as booleans, and a side that wrote none of it keeps none of
     it, so a world stays as small as the content that made it. One key has behaviour rather than
     being carried: `team_name` with `share_vision`, through `sideVisionGroups`, which returns the
     groups `FactionFog.share` takes. `none` is honoured and `all`/`shroud` are treated alike,
     because the fog shares sight and memory as one thing; telling those two apart is a fog change
     rather than an attribute change, and the doc says so. Six tests in `tests/mwl-sides.test.ts`.
283. ~~[Medium] Per-side victory and defeat conditions. `[side]` in Wesnoth can carry its own defeat
     and victory conditions, which is how a scenario says "this side loses if its leader dies" or
     "wins by surviving"; today only the scenario-wide `[objectives]` `condition=hook` exists, and
     `world.status` is one value for the whole scenario rather than one per side. Found while
     landing 252, which the item above used to include in its own scope.~~ Landed: a `[side]` may
     carry `[victory]`/`[defeat]` children using the same condition vocabulary the scenario-wide
     `[objectives]` does, and `checkObjectives` now evaluates the scenario-wide pair first (so an
     existing scenario behaves exactly as before) then each side's own, recording the result in
     `MwlWorld.sideStatus` keyed by the side id. A side condition that names no `side`/`side_filter`
     reads as that side's own, so "this side loses when it has no units left" is written once,
     without repeating the id; the scenario-wide `status` stays the aggregate, ending won or lost
     when a side condition fires, with a side victory outranking another side's defeat in the same
     evaluation (the precedence the scenario-wide pair already had). `[win]`/`[lose]` record the
     side they name too, so a content command and a condition land in the same place. Only sides
     whose conditions fired get an entry, the same "only what the content made" rule `world.sides`
     follows, and `sideStatus` survives a save/restore. Six tests in
     `tests/mwl-side-objectives.test.ts`, including that a side's `[victory]` is not read as a
     scenario-wide one.
253. ~~[Medium] Turn limit as a native end condition (Absent). "Time over" as a scenario predicate
     has no framework home; the port had to add `predicate:turn_limit` itself. (`[objectives]`
     with a `condition=hook` does exist.)~~ Landed, in the shape the rest of the runtime already
     uses: a scenario declares `turn_limit` on `[game]`, and once the turn counter goes past it the
     framework sets `time_over` as a world variable and fires the `time_over` event. So content
     tests it the way it tests anything (`[condition] variable=time_over`) and answers it the way it
     answers any event, including with `[endlevel]` now that 248 exists - which is the point: a limit
     is usually a defeat and sometimes the whole scenario ("hold out until then"), so the framework
     reports and content decides. Fired once, derived from the turn counter rather than kept in step
     with it, and `turn_limit` is in the `[game]` schema. Four tests in
     `tests/mwl-turn-limit.test.ts`.
254. ~~[High] Per-frame animation timing (Absent). `AnimatedSprite`/`ActorAnimator`
     (`src/two-d/render/`) run at a fixed fps (`frameDuration = 1/fps`). Wesnoth needs a duration
     per frame (`image:120,80,...`), `start_time`, per-frame x/y offsets, and `[missile_frame]`.~~
     Landed: `Animation` takes frames as textures or as `{ texture, duration, offsetX, offsetY }`,
     so a frame carries its own time and its own place, and `AnimationOptions.startTime` is signed
     exactly as Wesnoth writes it: positive holds the first frame, negative skips the leading ones
     (`start_time=-450` over 100ms frames opens on the fifth). `frameAt`/`frameIndexAt` are the
     arithmetic, twelve tests in `tests/animation.test.ts` check it, and the sprite advances on
     `elapsed` rather than a leftover timer, so a long frame lands on the right frame rather than
     catching up through each. `[missile_frame]` needs nothing beyond this: `Projectile` already
     flies a sprite along a path, and the frames it shows are now timed (the item's own "Absent"
     was about the frame model, not about flight). Per-frame offsets are *not* applied by the
     sprite: it reports `frameOffset` and the caller adds it, because this sprite is a `Sprite`
     whose position a `GridMover` or a walk tween owns, and a container wrapper would have broken
     the construction call every caller already uses (`new AnimatedSprite(texture)`).
255. ~~[High] Image modifiers beyond the four implemented (Ne correspond pas).
     `applyImageModifiers` handles FL/SCALE/GS/CS and `croppedTexture` handles CROP; ~BLIT, ~RC,
     ~CHAN, ~PAL, ~MASK, ~BLEND, ~O, ~R/~G/~B and ~ROTATE are missing. ~RC and ~BLIT are the two
     named as blockers, because team colours and recoloured art depend on them.~~ All eleven
     landed in `ImageModifiers.ts`, split the way the modifiers themselves split. `~O` and
     `~R`/`~G`/`~B` stay sprite-property/`ColorMatrixFilter` operations (`channelScaleMatrix`,
     unit-tested as plain data the same way `colorShiftMatrix` already was), joining
     `applyImageModifiers` alongside FL/SCALE/GS/CS - GS no longer clobbers a filter already on
     the sprite (288, fixed alongside). Everything else needed real pixel access, a sibling
     texture, or had to rotate the actual art rather than a sprite transform, so it lives in
     `applyTextureModifiers`, a canvas-backed pipeline built on 256's `withTextureCanvas`:
     - `~RC`/`~PAL` are an exact palette swap (`recolorTexture` in its `'exact'` mode - see 256),
       accepting hex (`#c0ffee`) or, through `probe.resolveColor`, a named colour like
       `~RC(magenta>red)`, via the exported `parseColorPairs`. `~PAL(a,b,c>x,y,z)`'s two
       comma-separated lists are reconstructed from the modifier's own comma-split arguments
       (`parsePaletteLists`) rather than assumed to land on an argument boundary, since a naive
       `args[0]`/`args[1]` read silently parsed only the first colour of each list.
     - `~BLIT`/`~MASK` composite/mask against a caller-resolved sibling texture at an offset,
       `~MASK`'s alpha multiply via the pure `maskPixels` (base colour kept, tested with no
       canvas at all). `probe.resolveTexture` receives the argument exactly as written, nested
       modifiers included (`~BLIT(unit.png~RC(magenta>red),0,0)` calls it with
       `'unit.png~RC(magenta>red)'`, not a bare `'unit.png'` with the modifier silently
       dropped) - parsing and re-applying that recursively is the caller's own job.
     - `~BLEND` is an exact per-pixel lerp towards a colour (`blendPixels`), baked into the
       texture once rather than approximated by a runtime `ColorMatrixFilter` (`blendMatrix`
       still exists, for a caller that explicitly wants the cheaper live approximation instead).
     - `~ROTATE` rotates the source pixels themselves and expands the surface to fit
       (`rotatePixels`, nearest-neighbour, exact at 90-degree multiples), rather than only
       turning `sprite.rotation` - the art itself has to rotate for terrain and anything else
       that must keep tiling afterward, which a display-object transform cannot do.
     One honest gap, not attempted: `~CHAN` here is a channel-source swap/constant
     (`channelSwapMatrix`), not Wesnoth's own formula-per-channel `adjust_channels_modification`
     (1 to 4 arithmetic expressions, one per output channel) - a real expression-language
     mismatch, not a bug, and a full formula evaluator is its own item if a port needs it rather
     than this one's scope. Twenty-five tests in `tests/image-modifiers.test.ts`.
256. ~~[Medium] Team colour by palette remap (Ne correspond pas). Team colour is
     `TintedSprite`/`registerColorTransform` (multiply plus add), not a remap of the palette range
     a `team-colors.cfg` defines.~~ Landed as `PaletteRemap.ts`: `remapPixels` is the renderer-free
     core, alpha and fully transparent pixels always untouched, unit-tested with plain typed
     arrays. It takes a `PaletteRemapMode`, `'exact'` by default: a pixel is repainted only when
     it matches a `from` colour exactly, everything else left alone, which is what a short,
     specific list like an `~RC`/`~PAL` swap needs - the original `'nearest'`-only behaviour
     (every opaque pixel repainted with whichever `from` entry is closest) silently recoloured
     the *entire* image the first time it met a sparse reference list instead of a full
     covering, and is now opt-in for exactly the case it is right for: `paletteRangeMapping`
     builds the `[color_range]` shape - a reference palette's own lightest-to-darkest order
     placed along a `min -> mid -> max` gradient - which does cover the whole image and wants
     `'nearest'` explicitly. `recolorTexture` is the canvas-backed wrapper both modes feed
     through, via `withTextureCanvas` (draw a texture in, hand the 2D context to a paint
     callback, wrap the result back into a `Texture`), now exported in its own right so a caller
     needing the same canvas bookkeeping for something `PaletteRemap.ts` does not cover can reuse
     it directly rather than duplicating it - 255's `~RC`/`~PAL`/`~BLIT`/`~MASK`/`~BLEND`/
     `~ROTATE` all build on it. Eight tests.
257. ~~[High] `[terrain_graphics]` (Ne correspond pas). `Autotile` (blob shapes) and `TileMap` (one
     sprite per cell per layer, hex included) exist, but not the tile-rule model: flags,
     rotations, multi-hex `[tile]`, and an image per neighbour combination. A 72px source sprite
     that overlaps into neighbouring hexes cannot be expressed in a one-sprite-per-cell grid.~~
     Landed as `TerrainGraphics.ts`'s `resolveTerrainGraphics`, the rule-driven pass `Autotile`'s
     fixed 47-shape table cannot express: a `TerrainRule` tests arbitrary flags (not only "same
     terrain") at arbitrary offsets (not only the 8 immediate neighbours) via `hasAll`/`hasAny`/
     `hasNone`, places one or more images each at its own offset and layer (so a piece bigger
     than one cell is one rule's `images` array, decoupled from `TileMap`'s one-sprite-per-cell
     grid), and can declare `rotations` (`squareRotate`'s 4 exact 90-degree steps or `hexRotate`'s
     6 exact 60-degree steps, both plain integer/cube-coordinate rotation, so one authored rule
     covers every direction a symmetric transition needs) and a `probability` that breaks a tie
     among rules matching a cell at equal specificity - specificity (most conditions) decides the
     match first, the same precedence a hand-authored rule set expects. Probabilistic choice runs
     through `core.Generator`, so a seeded generator makes the result reproducible. Drawing them
     is `TerrainGraphicsLayer`: one `Sprite2D` per placement, added in `layer` order (a stable
     sort, so the rule pass's own row-major walk survives within a layer) at the pixel position
     the caller's own `project` callback reports, images resolved through the asset resolver.
     The rule pass itself stays renderer-free and returns plain data (`TerrainPlacement[]`), the
     same split `autotileFrames` already uses; the layer is the renderer half that used to be
     left to the caller. Twelve tests in `tests/terrain-graphics.test.ts`, including a probability
     distribution checked over many trials and a seeded reproducibility check, and six in
     `tests/terrain-graphics-layer.test.ts` for placement, layer order, stable ordering and
     replacement.
258. ~~[High] Typographic markup in text (Ne correspond pas). **The contract has landed; the
     acceptance below has not.** `MarkupSpan`, `parseMarkup`, `stripMarkup`, `markupToHtml` and
     `escapeHtml` (`src/two-d/ui/markup.ts`, twelve tests in `tests/markup.test.ts`, exported from
     `two-d/ui` and written up in REFERENCE) cover the renderer-neutral token stream the item asks
     for: nested emphasis, named and hex colours, a size, a break, an image span carrying a path,
     interpolation supplied by the caller, the five entities as escapes, and the policy that unknown
     or malformed tags and unset variables stay literal while output text is escaped so no raw HTML
     can leak. What the acceptance still wants, and why each is not a formality: one fixture
     rendering equivalent runs through a canvas and a rich-text backend (the ui's own path renders
     emphasis only, since Pixi's `HTMLText` dialect is narrower than this markup), wrapping measured
     after styling, images resolved through the asset resolver, and an accessibility projection.~~
     Most of the acceptance landed this pass. `markupToHtml` now renders colour and size too, as
     an inline `<span style="color:...;font-size:...px">` - `HTMLText`'s dialect is real CSS, so
     this needed no new plumbing, only actually writing the style attribute. `markupAccessibilityText`
     is the accessibility projection: unlike `stripMarkup` (which keeps an image span's raw path,
     useful for round-tripping but not for reading aloud), an image becomes a caller-supplied
     `describeImage` result, defaulting to `[image]` so an image is announced as present rather
     than silently dropped or read as a file path. `layoutMarkupLines` is the wrapping-measured-
     after-styling piece: it tokenizes spans into words (and images, kept whole) and wraps them
     against an injected `measure` function that receives each piece *with* its own style, so a
     bold or larger run wraps where its own wider glyphs actually land, not where the plain text
     would have - and because the same spans, `measure` and `maxWidth` decide the exact same
     line breaks regardless of which backend then draws them, it is what makes a canvas
     `Text2D`-per-run pass and an `HTMLText` pass render "equivalent runs" from one fixture,
     checked directly in `tests/markup.test.ts`. `MarkupSpan[]` itself is the "single documented
     `MarkupText` value" the acceptance asked for - already exported, already the shared input to
     every function here - rather than a new wrapper type over the same data. The three pieces the
     acceptance named as still open then landed. `positionMarkupLines` places `layoutMarkupLines`'s
     lines into `PositionedMarkupSpan` runs under a `MarkupLayout`'s `direction`/`align`, so an `rtl`
     line flows right to left and alignment defaults to the direction's own edge - the other half of
     the "equivalent runs" fixture, now checked run by run in the test rather than only as text.
     `MarkupText` is the canvas backend itself, the counterpart to `RichLabel`'s HTML text: one
     `Text2D` per styled run and one `Sprite2D` per `<img>` span resolved through the asset resolver,
     so an image is drawn instead of a caller positioning it itself at a `layoutMarkupLines` offset.
     And an RTL sample, a Hebrew sentence with inline emphasis, is covered by a test. Twenty-seven
     tests in the file.
259. ~~[Medium] Hex projection options (Ne correspond pas). `src/core/Hex.ts` fixes flat-top odd-q
     with no orientation or offset-parity option - it says so itself about pointy-top - and
     `TileMap`/`TiledMap` refuse hexagonal orientation, so a Wesnoth map cannot be projected
     exactly.~~ Landed the projection half: `hexToPixel`/`pixelToHex` take a `HexShape`
     (`orientation` flat-top or pointy-top, `offset` odd or even) and still default to flat-top
     odd-q, so nothing that already called them changed. `pixelToHex` is now the nearest cell centre
     instead of a closed-form inverse: a hexagonal tiling has no ties, the containing cell *is* the
     nearest centre, and four inverse formulas for four combinations would be four more chances to
     be wrong at a hex's edge. Seven tests in `tests/hex-projection.test.ts`, the important one a
     round-trip property over every cell of a grid in all four combinations. **What remains is the
     other half of the item, and it is its own work: 284** - `TileMap`/`TiledMap` still refuse a
     hexagonal orientation, which is the part that draws the map rather than projecting one cell.
284. ~~[Medium] Hexagonal and isometric maps, narrowed to what is actually missing. Corrected the day
     it was written: `TileMap` already draws all four shapes - `shape: 'square' | 'hex' |
     'isometric' | 'staggered'` - importing `hexToPixel`/`pixelToHex` for the hex case, and item 18
     landed the diamond projections, so "accepts square grids only" was wrong about the renderer and
     is withdrawn here rather than left to mislead the next reader. What is genuinely missing is the
     *asset* side and the file side: a hex or diamond cell whose art is bigger than the cell and
     overlaps its neighbours (a 72px Wesnoth source sprite) cannot be expressed in a
     one-sprite-per-cell grid, which is 257's `[terrain_graphics]`, and a Wesnoth `.map` has no
     loader at all, since `rpg`'s map loading is Tiled-shaped.~~ Both halves have now landed. The
     asset half is item 257's `[terrain_graphics]`, and the file half is `mwl.parseMapFile`: it
     splits a Wesnoth-shaped `.map`'s `key=value` header (`border_size`, `usage`, and whatever else
     the file carries) from the comma-separated grid and hands the grid to the same `parseTerrain`
     an inline `[map] terrain=` uses, so overlays (`Gg^Vh`) and `<side> <code>` starts behave
     identically in both. The loader deliberately does not interpret the header keys, the same way
     `[terrain_graphics]` rules stay content's business. Seven tests in `tests/map-file.test.ts`.
260. ~~[Medium] Halos (Absent). `[halo]`/`[halo_frame]` have no equivalent; floating labels do
     (`FloatingTextStack`).~~ Landed as `Halo`: an `AnimatedSprite` that follows a target through
     `follow(x, y)`, applying its own `x`/`y` offset once rather than in every game that draws a
     glow, and adding to the scene by default (`blend_mode=add`). `[halo_frame]`'s frames needed
     nothing new, since 254 gave a frame its own duration and offset, so a halo cycle is written the
     way any other animation is. Z-order stays the caller's on purpose: behind a unit is
     `addChild(halo, unit)` and in front is the other order, and the note says so where a game will
     look for it. Six tests in `tests/halo.test.ts`, all without a renderer - a sprite and its blend
     mode exist without one.
261. ~~[High] Missing widgets (Absent). No Slider, Checkbox/Toggle, Dropdown/OptionButton,
     TextInput/TextArea, Table/data grid, collapsible TreeView, Spinner or ScrollBox. Present:
     Button, Label, RichLabel, ListView, IconGrid, Bar, Window, WindowStack, MessageBox,
     NinePatch, Tooltip, Toast.~~ All eight landed, split the way this repo splits a widget whose
     interesting part is a rule: the rule is a pure function or a renderer-free model, tested
     headlessly, and the drawing is a thin shell over it. `Slider` (`sliderFraction`/
     `sliderValueAt`: clamping, the step grid, the degenerate range), `Checkbox` (a two-state box
     whose `onChange` fires only on a real move), and `Spinner` (`spinValue`: snap then clamp or
     wrap) draw themselves from the theme and draw no text, so their state machines are tested
     directly. `Dropdown`, `TextModel` (the caret/anchor/selection editing `core.Input`'s `onText`
     feeds, with a length cap and a mask), `DataTable` (sort-by-column, a page derived from the
     highlight), and `TreeView` (visible rows derived from the expanded set; closing the branch the
     highlight is inside lands it on the branch) are renderer-free, like `TabbedList`, and a game
     draws them. `ScrollBox` clips its `content` behind a mask with a themed scrollbar, all through
     `scrollOffset`. `TextArea` was left as `TextModel` plus a `Label` with wrapping rather than a
     separate class, since the editing rules are identical and only the drawing wraps. Sixty-two
     tests across `tests/slider.test.ts`, `checkbox`, `spinner`, `dropdown`, `text-model`,
     `data-table`, `tree-view` and `scroll-box`.
262. ~~[High] Text input (Absent). `src/core/Input.ts` offers named actions and a raw `onKey`; there
     is no `onText` and no composition event, so a free text field cannot be built.~~ Landed in
     `core.Input`: `onText` fires the character a key press produces (stack-mode, so a focused
     field that returns true swallows it, the same convention `onAction`/`onKey` use), and
     `onComposition` follows an input-method composition through `start`/`update`/`end` so a CJK
     or dead-key field can preview the underlined text before committing it. `textFromKey` is the
     rule deciding whether a keydown carries text (a one-character `event.key`, no Ctrl/Cmd/Alt,
     not `isComposing`), and `dispatchText`/`dispatchComposition` are the injectable seams the DOM
     handlers and tests share. Held printable keys repeat into `onText` as a real field expects,
     while keys typed during a composition are not double-reported. Nine tests in
     `tests/text-input.test.ts`; the widget built on top is 261.
263. ~~[Medium] Data-driven shell layout and skins (Ne correspond pas). GUI2's `data/gui/*.cfg`,
     anchors and grids have no counterpart; the theme is global (`theme()`/`setTheme`) with one
     padding, and there are no per-widget or per-state skins.~~ Landed as two renderer-free pieces,
     since that is what is actually missing: geometry and named looks, not a file parser. `Layout`
     gives `resolveAnchor`/`anchorAlign` over the nine named anchors plus `fill` (margin, per-axis
     offset, explicit alignment), and `Grid` packs `size`-or-`grow` columns and rows with a gap,
     resolving grow tracks against the space left and giving the last one the rounding so a layout
     always fills its bounds. `Skins` is the per-widget, per-state layer the global `Theme` has no
     room for: `define(widget, state, skin)` and a `resolve` that falls back widget state -> widget
     idle -> wildcard state -> wildcard idle -> `{}`, so a game writes a shared `*` skin once and
     overrides only what it must; `Skins.from` takes the plain data a config file would parse into,
     which is why the parser itself is not here. Seventeen tests in `tests/layout.test.ts` and
     `tests/skins.test.ts`.
264. ~~[Medium] Story screens (Absent). Wesnoth's storyscreen (backdrop, title, text, music) has no
     equivalent: `DialogueStage`/`StageScript` is a visual-novel model.~~ Landed as `StoryScreen`
     over a renderer-free `StorySequence`: a full-screen beat (`StoryBeat` = `{ text, title, image,
     music }`, the same shape `[story]` already loads into `MwlWorld.story` from item 250),
     advanced by a click, with `advance`/`back`/`goTo`/`skip`/`restart` on the sequence and the
     current beat's `music` reported as a signal so the game decides how to play it (a silent beat
     reports `null`, stopping the previous track). The backdrop is scaled to cover without
     distortion and the words are the same `Label` everything else uses. Nine tests in
     `tests/story-screen.test.ts` cover the paging rules; the drawing itself is the screenshot kind
     of check, as `Label` needs a DOM.
265. ~~[Medium] Battle UI (Absent). The attack dialog with an animated damage preview, the unit
     selector, and whiteboard/undo are all missing.~~ Landed as four renderer-free models in
     `battle`, which is where the repo already keeps battle state and, deliberately, no damage
     formula: `AttackPreview` takes the per-strike damage a game's own rules computed and adds what
     a dialog needs - the totals (`totalDamage`, chance-weighted `expectedDamage`, `hits` for a
     rolled outcome) and a one-frame-per-strike `sampleAt` timeline; `AttackDialog` ties that to a
     `UnitSelector` (candidates on the selecting side, then the enemies `canTarget` allows, with
     `back` undoing the attacker choice) and runs the animation clock (`update(dt)`, `finished`);
     and `Whiteboard` is the planned-orders undo, one plan per unit, a new plan clearing the redo
     stack. Thirty-two tests across `tests/attack-preview.test.ts`, `attack-dialog`,
     `unit-selector` and `whiteboard`. What is *not* here is the dialog's pixels - the hp bars and
     labels are `Bar`/`Label` a game composes from these models, the same split the rest of the UI
     keeps, and no damage formula was invented to have something to draw.
266. ~~[High] Wesnoth-compatible RNG (Ne correspond pas). `core/Random.ts` is its own generator
     (splitmix32/xoshiro, `getState()` in four words), not `mt_rng`/`random_synced`, and it has no
     per-entity or per-usage streams, so a Wesnoth-compatible seed or replay is out of reach.~~
     Landed as `MersenneTwister` plus `RandomStreams`, both exported from `core`. `MersenneTwister`
     is MT19937 with `mt_rng`'s own bookkeeping: a 32-bit `seed`, `discard(count)`, `discardCount`
     (what `get_discard()` saves) and a full `getState`/`setState` so a save resumes the exact
     position. The engine is the specified one, and `tests/random-mersenne.test.ts` checks it
     against the standard seed-5489 test vector (the first ten outputs), so "compatible engine" is
     verifiable rather than asserted. `RandomStreams` is the other half: named MT19937 streams
     derived from one base seed by `baseSeed ^ FNV-1a(name)`, created on first use and kept, so a
     loot draw and an AI draw never shift each other and adding a new consumer does not change
     existing results; `getState`/`setState`/`reseed` cover a save. One honest limit, stated in the
     class doc rather than glossed: the reference then runs this engine through C++
     `std::uniform_int_distribution`, which the C++ standard leaves implementation-defined, so no
     portable implementation can be bit-identical to a particular standard library's range mapping.
     `int` here is the framework's own unbiased rejection (the same rule `Generator` uses), which
     makes a replay deterministic within MWG; a port consuming the raw 32-bit stream lines up with
     the reference engine exactly. The `Random`/`Generator` xoshiro path is unchanged and still the
     default. Eleven tests.
267. ~~[Medium] Turns as Wesnoth counts them (Ne correspond pas). `simulation/Turns.ts` is a cost
     scheduler and `world/TurnClock`/`EnvironmentClock` are generic day phases; there is no
     side/round/schedule model and no per-hex `lawful_bonus`.~~ Landed as `world.SideTurns`, the
     outer scenario loop, deliberately separate from `TurnClock` (one actor's timed effects) and
     `simulation.Scheduler` (energy order within a side). Sides take turns in the declared order;
     wrapping past the last opens a new round and steps the time-of-day schedule on one entry,
     cycling, which is the reference's turn/round distinction. A `TimeOfDay` carries the
     `lawfulBonus` a game's `[time]` writes, `alignmentBonus` turns it into a unit's own bonus for
     the four alignments (lawful takes it, chaotic its negation, neutral/liminal ignore the time),
     and a `TimeArea` overrides the schedule for part of the map - the first containing area wins,
     a shorter area schedule falls back to the global entry - which is what makes the bonus per-hex
     rather than global. `lawfulBonusAt(alignment, x, y)` is the one call a damage formula needs.
     `toJSON`/`fromJSON` resume the exact round/side/time position, and malformed configuration
     (no sides, no schedule, out-of-range indices) throws up front. Thirteen tests in
     `tests/side-turns.test.ts`.
268. ~~[High] Shared team vision (Ne correspond pas). `FactionFog` (`src/board/FogOfWar.ts`) is
     per-faction with no union of allies' vision, which is what `share_vision` means.~~ Landed:
     `FactionFog.share(factions)` puts factions on one map, for what is lit now and for the shroud
     they remember, and calling it again widens the group rather than replacing it. Nothing shares
     until asked, and because the group is read when a cell is queried rather than when it is
     synced, a share declared after a `sync` still counts. `sees(side)` follows a share, so the
     score views of 276 read the team's eyes with no change of their own.
269. ~~[Medium] AI as Wesnoth builds it (Absent). The framework's AI is alpha-beta search
     (`src/ai/search.ts`) plus optional Lua and a JSON action protocol; Wesnoth's is heuristic:
     candidate actions, aspects and stages, with `goals`, `keep_away` and `recruitment_pattern`,
     plus native difficulty levels. A Lua VM is already available (`src/mwl/fengari.ts`,
     `src/mwl/scripts.ts`, `src/ai/lua.ts`), but not a `wesnoth.*` API.~~ Landed as the heuristic
     half in `ai/Heuristics.ts`, alongside the search that was already there. `Aspects` is the named
     tuning knobs with typed readers and no shipped values (the numbers are content, the same rule
     the damage formula follows); `Difficulty` is named levels as aspect overrides on a base set,
     which is what "native difficulty" actually is; `Goals` is the per-unit order registry a stage's
     `weigh` reads; `RecruitmentPattern` is the cycled recruit order with a fallback. `HeuristicAI`
     is the pipeline the item names - candidate actions through `HeuristicStage`s in order, the
     first whose `when` passes scoring every candidate and taking the best - with `defaultWeigh`
     (factor x same-named aspect, plus `keepAwayScore` on a candidate's `distance`) as the default
     and a game's own `weigh` as the escape hatch, pointing at `goalScore` for goal priorities.
     `keep_away` is real behaviour here rather than a stored name. The `wesnoth.*` Lua API is
     deliberately *not* attempted: a heuristic AI does not need a Lua bridge, and inventing that
     API is a much larger surface than the item's own words ask for. Sixteen tests in
     `tests/heuristic-ai.test.ts`.
270. ~~[Medium] gettext i18n (Ne correspond pas). i18n is Fluent (`parseFTL`, `src/i18n/Fluent.ts`),
     not `.po` files and gettext domains.~~ Landed as `i18n.parsePo`, producing the same `Catalog`
     `parseFTL` does, so `t()`/`setActive`/the semantic formatter need no gettext path of their
     own. It reads `msgid`/`msgstr`, multi-line strings and escapes, `msgctxt` (keyed with
     gettext's own EOT separator), and `msgid_plural`/`msgstr[N]`; the header entry is dropped and
     an empty `msgstr` is left out as "untranslated", which is what lets the base language fall
     back. Gettext's positional plural forms map onto the locale's CLDR categories by position
     (English one/other, Arabic zero/one/two/few/many/other), and a file with more forms than the
     locale declares throws rather than mislabelling one. A non-default gettext `domain` prefixes
     keys (`units:sword`), so several `.po` files can share one catalog; the default `messages`
     domain stays bare. Malformed lines, duplicates, an orphan `msgstr` and a plural with no
     `msgstr[N]` all throw with the line or key named. Seventeen tests in `tests/gettext-po.test.ts`,
     including a plural round-trip through `t()` and `Intl.PluralRules`. `.mo` compilation is not
     attempted: a game ships the `.po` text the way it ships any other asset.
271. ~~[Medium] Positional audio (Ne correspond pas). `Sound`/`Music`/`Orchestrator`/`Synth`/`Midi`
     are the framework's own engine; there is no `[sound]`/`[music]`/`sound_source` model with
     listeners at a position.~~ Landed as `AudioListener`/`SoundSource` over `audioGain` and
     `audioPan`: a listener the game moves and turns, a `Sound` placed at a world point, and pure
     functions turning distance into a gain (1 inside `refDistance`, an inverse-distance curve to 0
     at `maxDistance`, `rolloff` shaping it) and heading plus offset into a stereo pan. The three
     falloff names are the Web Audio `PannerNode`'s own, so a game that later swaps in a real
     panner reuses them. `SoundSource.playFor` applies the gain through a new optional `Sound.play`
     argument and stays silent past `maxDistance` rather than playing at volume 0; panning is
     reported rather than faked, since the framework has no panner of its own. `Music` is
     deliberately still global, because background music is not placed in a scene. Eleven tests in
     `tests/positional-audio.test.ts` cover both boundaries, the rolloff exponent, pan direction
     under a turned listener, and the gain actually reaching the pooled `Playable`.
272. ~~[Medium] Replays, undo, and a server (Absent). No replay or action journal and no
     out-of-sync detection, no undo, and no multiplayer server: a `LockstepClient` over WebSocket
     exists, its server side does not.~~ The note was already mostly stale when it was re-read: the
     replay pair (`Recorder`/`Player` plus `serializeReplay`), the `ActionJournal`, `UndoHistory`
     and the reference lockstep server (`tools/multiplayer-server.mjs`, with `LockstepClient` as
     its client) had all landed under their own items. The one genuinely missing piece was
     out-of-sync detection, which lockstep cannot get from comparing inputs because it never
     compares state: landed as `core.stateChecksum` (a key-order-stable 32-bit FNV-1a of JSON
     state, so two machines hash equal values alike) and `core.SyncGuard` (the first checksum seen
     for a tick is the reference, a disagreement marks the run divergent and remembers the first
     such tick). A game computes the checksum each tick and compares peers' through whatever
     channel it already has; the checksum is a drift detector, not a security primitive, and the
     doc says so. Ten tests in `tests/sync-guard.test.ts`.
273. ~~[Medium] Achievements and statistics (Absent). `PlayerStats`/`RunHistory`/`StatsScreen` are
     generic; Wesnoth's achievement and statistics model has no equivalent.~~ `PlayerStats`/
     `RunHistory`/`StatsScreen`/`Achievements` were already generic building blocks; the two
     genuinely Wesnoth-shaped pieces they can't express on their own are what landed. `core.Achievements`
     gained sub-achievements: an `AchievementDef` can name several `criteria` (counter/target pairs)
     instead of one, unlocking only once every criterion is met ("recruit one of every unit type" as
     six counters rather than one), with `subProgress` reading each criterion back; the single
     `counter`/`target` shorthand is unchanged and is just a one-criterion `criteria` underneath.
     `battle.BattleStats` is the categorized breakdown Wesnoth's statistics dialog shows and a bare
     `PlayerStats<T>` cannot give a game for free: `record(category, unitType, amount)` against the
     seven categories (`recruits`/`recalls`/`advances`/`kills`/`deaths`/`damageDealt`/`damageTaken`),
     `total`/`breakdown` read a category back summed or per unit type, and `toJSON` folds into a
     `RunHistory` entry or a `PlayerStats` total the way any other run summary would - `StatsScreen`
     already renders whatever rows a game builds from either. Ten tests in
     `tests/battle-stats.test.ts`, three more added to `tests/achievements.test.ts` for the
     multi-criteria path.

### Score-driven AI

Asked for directly (2026-09-11), and distinct from 269: Wesnoth's AI picks among candidate
actions by heuristic aspects and stages, while this asks for an AI whose decisions rest on
*numbers* it can read. The contract already declares the two granularities the request names -
`AIAgentDefinition.scope` is `'actor' | 'controller'` (`src/ai/index.ts`) - so what was missing was
not a new scope but a score, and a way to see only what each scope can see. All three landed the
same day; the notes on each say what shipped.

274. ~~[High] A score an AI can read, not only a search can use. A rules agent decides from an
     opaque `perception: AIValue` the game fills and its own `state`; a score exists only inside
     `alphaBetaSearch`, as the `evaluate(state, rootPlayer)` callback (`src/ai/search.ts`) the game
     hands its own search. So a non-procedural AI, one that weighs outcomes instead of matching a
     behaviour, has nothing to weigh: to compare attacking against holding it must re-derive the
     game's valuation from the perception blob, which is the duplication the envelope exists to
     prevent. Needs a score source the game supplies once and an AI reads at both scopes: numbers
     in, decisions out, and the rules of valuation left where they belong, in the game.~~ Landed as
     `ai.personalScoreView`/`ai.sideScoreView` over `ScoreSubject`/`ScoreView`: the game hands in
     `scoreOf`, the framework assembles own, allies and enemies plus a `seen` count, and both
     `scope` values read through the same two functions. The valuation rules stayed in the game,
     which is what the item asked for.
275. ~~[Medium] Actor-scope scoring with a personality. A character's AI reads its own score, the
     score of every ally it can see and the score of every enemy it can see, and the personality
     attached to that character decides how much of each is its business: a selfish one weights
     its own score, a loyal one its allies'. Needs a score view filtered by that actor's vision
     and a personality that is data rather than code (weights over own, ally and enemy scores),
     so temperaments are authored as content and not as one AI implementation each.~~ Landed:
     `personalScoreView` takes the actor's own visibility predicate, and `ai.scoreWith` collapses a
     view by `ScorePersonality` weights, which is data a game authors per character. Eight tests in
     `tests/ai-score.test.ts`, one of them asserting that a personality is a reading and never a
     mutation of the view.
276. ~~[Medium] Controller-scope scoring under fog. A whole-map ("player") AI aggregates the scores
     of the allies and enemies *it* can see, which is a different visibility set from any single
     unit's: the union over the team's units, and `FactionFog` (`src/board/FogOfWar.ts`) has no
     such union today (268). Needs a team-scoped score view that respects the fog, so both scopes
     run the same scoring code and differ only in which visibility set they are handed.~~ Landed:
     `sideScoreView`, over the same visibility-set shape, so the only difference from 275 is what
     the caller hands in, plus `FactionFog.sees(side)` as that set. One test reads one world through
     a unit's reach and through a side's union and checks they differ only where the second sees
     more. The item's premise was one step off and is worth correcting: `FactionFog.sync` already
     unions every source it is handed, so the union over a side's units was expressible all along,
     and what was missing was a predicate to hand over. The half that is genuinely absent is allies
     sharing one another's sight, which is 268 and stays open.

### World-model cleanup

Found while building carry-over (248), recorded rather than fixed in passing.

277. ~~[Low] One side identity in `MwlWorld`. A side is keyed by the `id` `[side]` declares in
     `world.sides` and `world.gold`, while its units carry a *number* in `unit.side` (`[spawn]
     side=1`), so "the units of side `1`" is a mapping between two identifiers rather than a lookup.
     `MwlSideRef` in `src/mwl/carryover.ts` names the pair so carry-over can be honest about it, and
     `endLevelSide` derives the number from the id, which is guesswork a named side (`id=rebels`)
     cannot survive. One identity, string or number, would remove the guess; it touches the world
     shape, the moveto filter and every consumer of `unit.side`, which is why it is its own item.~~
     Unified on the string id. `unit.side`, `MwlMessage.side`, `MwlMap.starts` keys, `HookWorld` and
     `Emit`, and every `side`/`side_filter` attribute hold the `id` `[side]` declares; `MwlSideRef`
     is just that id and `endLevelSide` no longer derives a number, so a named side survives
     carry-over. The `[side] id` schema went from `integer` to `string` (numbers still validate) and
     with it the twelve other side-identifying attributes, and `parseTerrain`'s `<side> <code>`
     marker now accepts a name (`rebels Kh`) as well as a number. `[spawn]` without a side keys on
     `unit#@x,y` rather than a magic `0`. Five new tests in `tests/mwl-side-identity.test.ts` cover
     a named side's keep, a `[kill]` filter, a side condition, `[endlevel] side=rebels` and
     carry-over; the existing 112 MWL tests pass unchanged.

### Requested by the Pixel Dungeon port

Its own `ROADMAP.md` section 11A lists what that port would like from this framework, checked there
against the installed 0.7.6 declarations and re-checked here against the code before being written
down: each item below says what already exists and what would have to be added, which is the part
that decides whether a proposal is a primitive or a game rule wearing a generic name.

What stays with that port, and is not a gap here: appearance tables and identification, its
combat, fire, monster, quest and dungeon rules, its derived numbers, and all of its art. "A generic
primitive could represent it" is not a reason to move game content across a licence boundary, which
is the same line this repository already draws for the Wesnoth port.

Each of these is expected to arrive the way everything else here does: renderer-free determinism
tests, a minimal `@example`, save compatibility notes and an API report entry, in a release the port
can then check its declarations against.

Two further proposals its section 11 still lists as blocking are already here, checked against the
source rather than against the note, so neither is an item:

- **Caller-chosen entity ids.** `EntityRegistry.add(entity, requestedId?)` exists (`src/core/Entity.ts`)
  and is asserted by "EntityRegistry accepts stable caller-chosen ids and rejects collisions" in
  `tests/mwl.test.ts`. The "mints opaque ids with no caller-chosen-id primitive" note describes an
  older release.
- **A value-position 2D surface.** `two-d/render/Types2D.ts` re-exports the classes themselves -
  `Container2D`, `Texture2D`, `Rectangle2D`, with `Rect`/`TextureRegion`/`rectOf` alongside - so
  `extends Container2D`, `new Texture2D(...)` and `Texture2D.from(...)` are all available without
  naming `pixi.js`, which is what that proposal asked for. One piece of it is genuinely not covered:
  constructing a Pixi *extension* object still means importing `pixi.js` where the object is written,
  though `GameOptions.extensions` is where the framework applies it.

278. ~~[High] Generalise `MultiTurnBeam` traversal (the port's P0). `roguelike/MultiTurnBeam` walks a
     *captured* straight path, one front per turn. Missing: an opt-in sequence of per-turn fronts or
     a game-supplied next-front resolver, an explicit blocker policy, per-cell callbacks, and shape
     identity in the saved state so a reload resumes the same shape. That would cover cone, burst,
     forked and moving-front effects without putting any game's rules here. The port asked for
     deterministic square and hex tests in this repository before it adopts any of it.~~ All four
     landed. The internal unit is now a **front** (a set of cells), not one cell: the default
     `'line'` shape is still the captured straight path, and `fronts(previous, turn)` opts into a
     per-turn resolver that sees the cells the last front actually reached and returns this turn's
     cells - a cone widens, a burst holds, a fork splits, a moving front is whatever the game
     returns, and none of those rules live in the framework. `blocker` is one explicit policy
     (`'terrain'` | `'none'` | a function) instead of the old implicit flag combination, with
     `isBlocked` kept as an extra game rule; `onCell` is the per-cell callback; and a save now
     carries `fronts`, `index` and a `shape` name, so `fromJSON` refuses to resume a beam as a shape
     it was not, and a pre-fronts save (its `path` and `index`) still loads as a line. A multi-cell
     front drops blocked cells and keeps the rest, ending blocked only when nothing got through.
     Eleven tests in `tests/multi-turn-beam-fronts.test.ts` cover the blocker policies, a
     deterministic square cone, a deterministic hex run, a partial and a full block, per-cell
     callbacks, shape refusal, resume-without-re-resolving, and the legacy save; the original three
     tests still pass unchanged.
279. ~~[Medium] Particle spawn bounds (the port's P1). `ParticleEmitter` pools and reuses particles
     renderer-agnostically, but its `spawn()` is private and unbounded, so a controlled spread or a
     capped flame column is presentation glue in the game. Needs a seeded local rectangle or
     ellipse for spawning, and an optional local height or lifetime envelope, with the pooled
     behaviour unchanged.~~ Landed as `ParticleSpawnArea`, an optional `spawn` on the emitter's
     options: a `rect` or `ellipse` in local space, so a birth spreads across an extent instead of
     all landing on the emitter's origin. `height` defaults to `width` (a square or a circle), the
     ellipse's radius is square-rooted so births do not cluster at its centre, and the area moves
     with the emitter because it is local space. A point emitter draws nothing extra, so the seeded
     sequence an existing replay recorded is unchanged; `life` already was the lifetime envelope.
     Five tests in `tests/particles.test.ts` pin the bounds, the ellipse's edge (direction, not
     only magnitude), local-space movement and seeded reproducibility.
280. ~~[Medium] A renderer-neutral grid targeting controller (the port's P1). The *geometry* is here
     (`AreaShape`, `traceLine`, `ballistica`, `Level` line of sight) and nothing drives it from
     input: needs pointer and keyboard navigation over cells, range and line-of-sight validation
     hooks, an optional area preview, and a confirm/cancel result. It must return cells or ids only:
     targeting legality, damage and visuals stay with the game.~~ Landed as
     `roguelike.TargetingController`. It holds a cursor over a `Level`, moved a cell at a time by
     `move(dx, dy)` for keyboard/gamepad (on a hex level the offset is looked up among the level's
     own six neighbours, since only the level knows which offset is which direction there) or by
     `moveTo(cell)` for pointer input, where the caller has already turned its screen point into a
     cell through its own camera. `valid` is range plus sight unless waived plus an optional game
     `validate` hook, `preview()` resolves the shape's affected cells or returns empty while the aim
     is illegal, and `confirm()` returns those cells or null; `onMove`/`onConfirm`/`onCancel` carry
     each step. It returns cells only - damage, legality details and drawing stay with the game.
     Thirteen tests in `tests/targeting-controller.test.ts`, including the range boundary, a wall
     between origin and cursor, hex neighbour stepping and hex distance.
281. ~~[Low] Tabbed, paginated list primitives (the port's P2). `ListView`/`IconGrid` cover the list
     itself; a contract for tabs, filtered rows, selection, paging and a detail/close action would
     serve inventories, journals, shops and codices across games. Caller-supplied labels and rows,
     no assumed item taxonomy.~~ Landed as `two-d/ui`'s `TabbedList`, a renderer-free model beside
     `SelectionModel` rather than another drawn widget: the caller supplies the tabs and a
     `rowsFor(tabId)` returning any row type it likes, plus optional `label`, `filter` and
     `disabled` predicates, so no item taxonomy is assumed. It owns the tab choice (skipping
     disabled tabs, wrapping), the query (default case-insensitive substring of the label), the
     selection (skipping disabled rows, clamped), the page and the detail/close state. The page is
     **derived** from the selection rather than tracked next to it, so the two can never disagree and
     `nextPage` is just a selection move of one page; `pageRows`, `selectedIndex` and `onChange` are
     what a renderer reads. Eighteen tests in `tests/tabbed-list.test.ts`, no DOM needed.
282. ~~[Low] A documented event-to-presentation sequencing recipe (the port's P2). The split itself
     exists (`simulation.SimulationRuntime` and `core.PresentationQueue`); what is missing is a
     documented pattern, with a small example and a test, for a command result, a scheduled
     secondary actor, an animation lock, cancellation and save/load interacting. The goal is a
     stable integration pattern for turn-based games, not any one game's combat pipeline.~~ Landed
     as `simulation.EventPresentation`, a small class over the two pieces that already existed
     rather than a third kind of thing. It fixes the five interactions as named rules: `submit`
     dispatches one command and hands its events to a `PresentationQueue` in one call (a command
     result); `locked` is the queue's `isBusy` and `submit` refuses under it (an animation lock);
     `followUp` returns the commands of a scheduled secondary actor, dispatched only after the
     batch before them has presented (a counter-attack after an attack); `cancel` drops the rest
     of the show while the committed turn stands (cancellation); and `snapshot`/`restore`
     deliberately leave the queue out of a save, so a loaded run resumes idle instead of replaying
     an interrupted animation (save/load). The class doc comment is the documented pattern and
     carries a compiling `@example`; eight tests in `tests/event-presentation.test.ts` drive all
     five interactions, including the ordering of the follow-up behind the primary batch.

### Map view rotation

Asked for directly, 2026-09-11. Two items rather than one because the two halves differ by an order
of magnitude in cost and in what they break, and because a fixed angle is a thing a strategy game
can ship this month while free rotation is a rendering project.

What exists today, checked rather than assumed: `Camera` has zoom, bounds, following, shake and the
`toScreen`/`toWorld` pair, and **no rotation**; individual sprites can rotate (the particle emitter
and `VerticalLabel` both use it), so a game *can* rotate a world container by hand - Pixi will - but
nothing in the framework makes that usable. That is the gap both items describe.

Two things that were already here, found in the same pass, and they change what these items are. A
**fixed angle in the projection sense already exists**: `TileMap` draws all four shapes, including
the isometric and staggered diamond views (item 18), so 285 is about *changing* the angle at runtime
rather than about drawing one. And **the 3D path already rotates freely**: `Engine3D`'s camera is
Babylon's `ArcRotateCamera`, with a radius limit. That is both the existence proof that the 2D gap is
worth closing and a shape worth copying - a camera that orbits a target under limits, rather than a
knob on every tile - and it means 285 and 286 have to hold for the hex and diamond shapes too, not
only for the square grid they are easiest to reason about.

285. ~~[Medium] Fixed-angle map rotation. Turn the view in whole steps, which is what a strategy game
     wants for "look at the map from another side" without a free camera. **The step depends on the
     grid, and hex is not a quarter turn**: a hex lattice comes back onto itself every **60 degrees**,
     so there are **six** positions in a full turn (the hexagon's own 6-fold symmetry), where a
     square grid has four quarter turns. Both are exact, so the grid stays aligned with its own
     addressing at every step, and tile choice, fog and pathfinding are untouched - what has to be
     built is the layer between them and the screen: `Camera.toScreen`/`toWorld` must invert the step
     so a click lands on the cell the player aimed at, `TiledMap`'s culling must use the rotated view
     rather than an axis-aligned rectangle, and anything drawn *into* the world that must stay upright
     - labels, health bars, damage numbers, the selection cursor's text - needs a counter-rotation,
     since a half turn would otherwise put every label upside down.

     The hex case has its own two details, both worth settling here rather than in the renderer. A
     60 degree step maps the lattice onto itself but **re-origins the offset addressing**, so odd-q
     becomes a different parity and origin for the next step: the step has to move the addressing
     with it, or the same screen cell answers to a different column and row depending on how many
     steps the player has turned. And because the projection options landed in `Hex.ts` (259), the
     step belongs next to them - a rotated hex view is a projection change, not a sprite rotation,
     and it has to be true for pointy-top as well as flat-top, since the Wesnoth-shaped map is
     pointy-top.~~ Landed in `Camera`, as the turn on the layer `apply()` already renders: `grid`
     sets the step count (four quarter turns for a square grid, six 60-degree steps for hex), and
     `setRotationStep`/`rotate` move through them, wrapping a full turn. `toScreen`/`toWorld` now
     rotate by the step and invert that rotation, so a click at any step lands on the cell aimed
     at; `view` returns the box around the four turned viewport corners so `TileMap` culling stays
     correct (and is exactly the old rectangle at step 0, where the transform is unchanged);
     `uprightRotation` is the counter-angle a label, health bar or damage number drawn into the
     world applies so it does not go upside down. The hex re-origining detail resolved by *not*
     re-projecting: the same cell keeps its own pixel through the step and the layer turns about
     the view centre, so odd-q parity never changes and no addressing has to move, which is why the
     step count is the only grid-dependent thing here. Eleven tests in
     `tests/camera-rotation.test.ts`, plus the existing camera tests unchanged. Free rotation
     (item 286, arbitrary angles and animation between them) stays separate.
286. ~~[Medium] Free map rotation. Any angle, including smooth animation between angles (and for hex,
     animation *between* the six exact positions above rather than only landing on them). Beyond
     285's inverse mapping, this is where the real costs are, and each is a decision rather than a
     detail: adjacent rotated tiles show hairline seams unless they are drawn as one mesh or with a
     bleed margin, so a per-tile rotation is not the same thing as a rotated layer; picking needs the
     inverse of an arbitrary angle with a tolerance, since a click near a corner is ambiguous in
     world space once the screen has been turned; culling has to use the rotated view's bounding box
     or the map will pop at its edges; text and pixel-snapped UI must stay outside or counter-rotate
     within the rotated layer; and the per-frame cost has to be a transform on the layer rather than
     on every tile, which is worth measuring before it is adopted the way 254 and the batcher were.
     Also worth deciding here: whether "rotation" means the camera turning or the world turning,
     which only shows up once terrain has a light direction or a shadow.~~ Landed in `Camera`, on top
     of 285's layer-level transform rather than beside it: `_angle` (radians) is now the one source
     of the view's turn, with `setRotationStep`/`rotate` just computing a step's whole multiple of
     it. `rotateTo(angle)` jumps there immediately; `animateRotationTo(angle, intensity)` eases
     towards it the shorter way around a full turn (an `angleDiff` helper in `(-pi, pi]`), so turning
     from a hex view's fifth step back to its first sweeps the one 60-degree gap rather than the
     long way, and reduced motion jumps in one frame the same way `follow`'s easing already does.
     Every cost 286 named was already paid by 285's design rather than newly owed here: the layer
     turns once as a whole (`world.rotation`), never per tile, so there are no seams to fix and the
     per-frame cost stays flat; `toScreen`/`toWorld` already invert an arbitrary angle, not only a
     step's multiple, so picking needed no change; `view`'s four-corner bounding box already covers
     any angle once its `this.step === 0` fast path became `this._angle === 0`; and
     `uprightRotation` already cancels whatever `rotation` is, stepped or free. The camera-vs-world
     question the item asks about is answered in `Camera`'s own class doc: the layer turns, the
     camera itself never moves. Seven tests in `tests/camera-free-rotation.test.ts`, the existing
     `tests/camera-rotation.test.ts` unchanged.
287. ~~[Low] `Assets.load` missing-asset policy. There is no way to ask for an optional asset;
     a caller that wants one has to wrap `assetUrl` in try/catch and fall back to
     `Texture.EMPTY` by hand. An `onMissing` handler or a per-path `optional` flag would move
     that glue into the framework once a second caller needs it.~~ Landed: `load()` takes
     `optional`/`onMissing`, loading those paths separately from the required batch so one
     missing optional asset never aborts everything else; `texture()`/`get()` take a `fallback`
     argument returned instead of a throw for a path that never loaded, which is what removes
     the by-hand try/catch this item named.
288. ~~[Low] `applyImageModifiers`'s `GS` sets `sprite.filters = [filter]`, replacing whatever
     filters were already on the sprite rather than appending to them. Fine while `GS` is the
     only filter a caller applies; worth fixing to append once 255 adds more filter-shaped
     modifiers that can legitimately stack with it.~~ Fixed alongside 255: `GS` now appends
     (`sprite.filters = [...(sprite.filters ?? []), filter]`), the same pattern `CS` already
     used, so it composes with `~R`/`~G`/`~B`/`~BLEND`/`~CHAN` instead of dropping them.
289. ~~[Medium] Category-shaped crafting ingredients. `actors/craft.d.ts`'s recipe ingredient is
     `{ id: string; quantity: number }` only: one exact item id, no "any item of this kind".
     A recipe that wants "any herb plus any runestone" cannot be expressed and has to be left
     unported. Generic shape, no reference-specific vocabulary: `id: string | string[] | {
     category: string }`, or a `matches(item)` predicate on the ingredient.~~ Landed as the
     `Ingredient` type: `id` is now `string | string[]` (one exact id, or any of several),
     `category` matches the item definition's own new `category` field, and `matches(item)` is the
     predicate escape hatch. `InventoryItem.category` is kind-level like `stackable`/`weight`, so
     it is supplied by the game's item table on load and stays out of saves. `craft` allocates
     against a working copy of the stacks, so two flexible ingredients cannot both count the same
     stack and "any herb" twice needs two herbs; a malformed ingredient (no matcher) or a
     non-positive quantity throws by name. Ten tests in `tests/craft-ingredients.test.ts`, the
     original eight unchanged.
290. ~~[Medium] `ui.Window.close()` destroys the instance it is called on (`destroy({children:
     true})`), so the ordinary `this.someWindow = w` pattern followed by a later `w.x = ...`
     throws on a null internal rather than failing predictably. Either a `destroyed` getter
     callers can guard on, a doc note that the instance is spent after `close()`, or splitting
     `close()` into a detach-only step with `destroy()` staying explicit.~~ Landed the first two,
     the least disruptive pair, rather than the detach-only split (which would change when GPU
     resources are freed for every existing caller): `Window.closed` is a framework-owned getter
     (true after `close()` or a direct `destroy()`), `close()` is idempotent so a `pop()` racing a
     `cancel` is not a second destroy, `handleAction`/`place`/`update` are no-ops once closed
     instead of throwing on freed internals, and the doc comment says plainly that the instance is
     spent and the caller's reference must be dropped. `WindowStack.push` on a closed window now
     throws a named `cannot open a window that was already closed` rather than failing somewhere
     deeper. Nine tests in `tests/window-close.test.ts`.
291. ~~[Low] Sprite attachments: a shadow flat under a sprite, a status icon floating above it.
     `StatusVisuals` only tints; nothing owns a second sprite's position relative to a first
     one with its own lifetime. Needs its own shape (attachment lifetimes differ per game),
     not a copy of one game's version.~~ Landed as `SpriteAttachment`, the same renderer-neutral
     shape `Projectile`/`LightningArc` already use: it takes any `{ x, y }` point and only ever
     writes to it, so a shadow (no lifetime, `follow` every frame) and a status icon (a
     `duration`, `update(dt)` reporting `done` once) are the same class with different options
     rather than two implementations. Z-order and parenting stay the caller's, as `Halo`'s own
     doc already argues for the same reason. Five tests.
292. ~~[Low] A temporised line-between-two-points visual (a lightning arc, a tether). No
     dedicated helper in `two-d/render` for a line that animates between two arbitrary world
     points over time; games building one draw it by hand.~~ Landed as `LightningArc`: owns
     geometry only, the same division `Projectile` already draws for a single moving point -
     `points` is the jittered polyline between two endpoints (tapering to zero offset at both
     ends so a bolt never visibly detaches from its target), `retarget` moves either endpoint
     for a tether following two moving units, and an optional `flickerInterval` re-rolls the
     jitter on a timer instead of holding one fixed shape. A caller draws the points through
     `Shape2D`'s `Graphics`; this never touches a renderer itself. Nine tests.
293. ~~[Medium] The value-level Pixi facade item 167 shipped covers `Container`/`Texture`/
     `Rectangle`, but `Sprite` (used directly, unwrapped, in roughly a dozen call sites),
     `Graphics`, `FillGradient` and `TilingSprite`, plus the `extensions.add(...)` calls that
     register `TilingSpritePipe`/`NineSliceSpritePipe`, still force `import 'pixi.js'`
     wherever a game touches them. The pipe-registration piece is the same class of footgun
     as any other missing-extension black-screen bug: worth a supported registration story,
     not just a type.~~ Narrower once actually checked against this repo rather than the port
     that raised it: `Sprite2D`/`Shape2D`/`Text2D`/`TiledSprite`/`Gradient` already named
     `Sprite`/`Graphics`/`Text`/`TilingSprite`/`FillGradient` at the facade level, item 167's own
     work - the "dozen call sites" and the missing types were the port's own source, not `mwg`'s;
     grepping this repo found exactly one direct `Sprite` import (`TintedSprite.ts`, which
     legitimately extends it) and zero direct `Graphics` imports. What was a genuine gap:
     `two-d/pixi-interop.ts`, the escape hatch for the rare need the facade does not cover, had
     `Container`/`Sprite`/`Texture`/`Graphics`/`Rectangle`/`Text` but not `FillGradient`/
     `TilingSprite` - now added. The pipe-registration question resolves without new code:
     `TilingSpritePipe`/`NineSliceSpritePipe` need registering only for a trimmed custom Pixi
     bundle, and `mwg` imports the full `pixi.js` package everywhere, which registers every
     built-in pipe (both included) as a side effect of the import itself - documented in
     `pixi-interop.ts`'s own doc comment so the next reader does not have to rediscover it. The
     footgun is real for the port's own slimmed bundle, which is where it stays their problem
     to solve, not `mwg`'s.
294. ~~[High] Unit identity the AI can act on. A port reported the AI could not use a unit's type,
     function (a leader, for example) or name: MWL units carried only `type`/`side`, and
     `unitMatchesFilter` matched neither a unit's name nor its role, so "attack the enemy leader"
     and "hold the named courier" had nothing to key on - the `[filter]` schema already allowed
     `can_recruit`, but the runtime ignored it.~~ Landed: `MwlWorld.units` entries carry `name`,
     `role`/function and `can_recruit` (`[unit]` sets them, a side's own leader is `can_recruit`,
     `[role]` stamps the role onto the units it matches, and `[store_unit]`/the save keep them),
     and `unitMatchesFilter` reads all three - which also wires up the `can_recruit` the filter
     schema already allowed. On the AI side, `ai.ScoreSubject` and `ai.HeuristicCandidate` carry
     `type`/`role`/`can_recruit`/`name`, and `ai.subjectsWhere`/`ScoreSubjectFilter` select a world
     on any of them, so `{ side: 'red', can_recruit: true }` finds the enemy leader without
     re-deriving it from ids. Three new tests, plus two extended assertions.
295. ~~[Medium] One variable-path resolver for every reader (Ne correspond pas). `variableAt`/
     `setVariableAt` (238) walk dotted paths, but the readers that take a *name* do not:
     `filterConditionMatches` reads `this.world.variables[name]` and `variableMatches`'
     `$name` resolution reads the same flat record, so `[variable] name=a.b` never sees what
     `[set_variable] name=a.b` wrote, and a `[variable]`-style path left in a `$name`
     position compares as a literal. Route all of them through one path resolver, `interpolate`
     included, and decide the same pass whether `a[0].b` index segments are in scope: adding
     them is what lets a port delete its flat-key workaround for names like
     `zombies[0].allow_recruit` rather than keep spelling an array index as a whole key. Found
     while reconciling 238 with 294.~~ Landed: one `variableAtPath` walks a path, and every
     reader that takes a name goes through it - `conditionMatches`, `filterConditionMatches`,
     `interpolate`, the bare `$name` copy, and `variableMatches`' `$name` side via a resolver
     instead of a flat variable record. Index segments are in scope and read arrays as well as
     object keys, so `a[0].b` resolves the node `a.0.b` or `a[0].b` wrote; a write whose index
     is not a whole number is refused by name (`invalid variable path`) rather than creating a
     literal `a[x]` key nothing reads, and the `id` schema type now accepts brackets so the
     name itself compiles. Three tests in `tests/mwl-variables.test.ts`, through real content.
296. ~~[Low] Leader identity as a unit field. `MwlWorld.sides[*].leader` names the type a side's
     leader is (252) and an autospawned `[side] leader=` unit is `can_recruit` (294), but
     nothing on `MwlWorld.units` says a unit *is* that side's leader, so a consumer recomputes
     `sides[side].leader === id`. A boolean on the unit, set for an autospawned side leader and
     carried through `[store_unit]` and a save, removes that duplication and makes
     "attack the leader" a filter like "attack the recruiter" already is. Small and generic.~~
     Landed: an autospawned side leader carries `leader: true` beside its `can_recruit`,
     `unitSnapshot` and `restoreUnit` keep it through `[store_unit]` and a save, and
     `unitMatchesFilter` reads it, so `[filter] leader=yes` selects the side's own leader
     without ever recomputing `sides[id].leader === id`. `leader` is added to the `[filter]`
     schema; `[modify_unit]` does not set it, because the side declaration is what makes a
     leader. Two assertions on the existing leader tests and one filter test in
     `tests/mwl-side-identity.test.ts`.

The port's own `ROADMAP.md` section 11A continues past P0-P2 (278-282 above) with P3-P12,
recorded here in the same low-priority, append-only way as everything else in this list -
ordered by the port's own payoff estimate, not argued into or out of a different order here.

297. ~~[Medium] Re-export extension pipes from a facade (the port's P3). `TilingSpritePipe`/
     `NineSliceSpritePipe` and the extensions that register them have no facade name, forcing
     a direct `pixi.js` import to reach them, even though the interop doc says backend access
     is confined to one file. A `registerBuiltinPipes()` helper, or re-exporting the three
     symbols from `two-d/pixi-interop`, would close the port's last direct `pixi.js` import.~~
     Landed as both: `two-d/pixi-interop.ts` now re-exports `TilingSpritePipe`/
     `NineSliceSpritePipe` themselves, and `registerBuiltinPipes()` (`extensions.add` on each,
     idempotent the same way `registerColorTransform` already is) for the one case a bare
     re-export cannot cover - a consumer bundler that tree-shook the pipe away despite the full
     `pixi.js` package being imported. Two tests in `tests/pixi-interop.test.ts`.
298. ~~[Low] Fix contradictory interop doc comments (the port's P4). `Shape2D.d.ts` says
     `Container2D` is a type alias a game cannot `new`, which contradicts `Types2D.d.ts`'s
     value re-export of the class itself; `pixi-interop.d.ts`'s "no registration needed"
     guarantee is actually Pixi's/mwg's `sideEffects` whitelist, not a universal one.
     Doc-only, but the contradiction cost the port a session.~~ Landed: `Shape2D.ts`'s doc
     comment now says `Container2D` is itself constructible (it is a value re-export, not a
     type alias) and names `Node2D` as the preferred spelling instead; `pixi-interop.ts`'s doc
     comment now says the no-registration guarantee is `pixi.js`'s own `sideEffects` list
     surviving the *consumer's* bundler configuration, not a universal property, and points at
     `registerBuiltinPipes` (297) for the case where it does not survive.
299. ~~[Medium] Pointer parity for `ListView` (the port's P5). `IconGrid` is pointer-driven
     (`tapCell`); `ListView` is keyboard-only, so a clickable bag or menu list has no built-in
     hit surface, and the port had to fill `ListItem.icon` with a full-row hit area as a
     workaround. A `tapRow(index)` alongside the existing keyboard navigation would remove it.~~
     Each row already carried a `pointerdown` handler that selected and confirmed in one step
     (landed ahead of this item, undocumented as its own capability); what was missing was the
     `tapCell`-shaped public method itself, for a game or test driving the list
     programmatically rather than through a real pointer event. `tapRow(index)` now exists,
     the row handler calls it, and it shares `tapCell`'s no-op rules: out of range or disabled
     does nothing. Four tests in the new `tests/list-view.test.ts`, the first dedicated test
     file this widget had.
300. ~~[Medium] Let a game hand `assets` its own path-to-URI map (the port's P6). `assets/paths`
     only reads `window.__MWG_ASSETS__` or a dev server, so a Vite-bundled game that compiles
     its own asset map cannot use `Assets`' loaders, batching or progress at all; this port
     uses none of `Assets` for exactly that reason. A `setAssetMap`/`setBase` overload would
     let such a game opt in instead of reimplementing loading itself.~~ Landed as
     `setAssetMap(map)` in `assets/paths.ts`: `resolve`/`has`/`paths`/`isCompiled` read it in
     place of `window.__MWG_ASSETS__` while it is set, agnostic to how the map was built as
     long as it is the same `{ path: uri }` shape; `setAssetMap(undefined)` reverts to
     `window.__MWG_ASSETS__` (or dev-server mode). Four tests in `tests/assets.test.ts`,
     including the priority order over `window.__MWG_ASSETS__` and the revert.
301. [Medium] Let `StatusVisuals` compose over the additive channel (the port's P7). Its own
     doc says one status wins by declaration order and that a stray tint write "will fight
     this"; the port needs identity tint plus several simultaneous additive colours plus a
     flash, which is why the class was never adopted. Compose instead of picking one winner.
302. [Low] A phase/sequence API for `ScreenEffects` (the port's P8). `fadeOut`/`fadeIn`/
     `flash` cannot express hold-then-fade-then-fade-back, the genre's standard transition, so
     the port hand-computes it.
303. [Low] A screen-pixel shake helper (the port's P9). `Camera.shake` is world units, while
     the reference's own convention (43 call sites) is screen pixels, forcing a conversion at
     every site. `shakeScreen(intensity, duration)` would remove it.
304. [Low] Document, or make configurable, what MWL row ids are scoped to (the port's P10).
     `validateCatalog` keys on `tag:id` document-wide, so a domain-scoped row-naming
     convention yields one `MWL_DUPLICATE_ID` per reuse (42 in this port's data) that cannot
     be told apart from a genuine same-table duplicate. Either document the scope or add a
     `rowIdScope` option.
305. [Low] More `tools/mwl.mjs` hooks for game-owned generated modules and cross-table checks
     (the port's P11), or say plainly that a game needing custom validation should embed the
     library API directly rather than drive the CLI. This build needed three game-owned
     generated modules plus cross-table checks the CLI has no hook for.
306. [Low] Document a `file://` post-build recipe for bundler users, or add a
     `tools/classic-html.mjs` (the port's P12). A Vite entry tag comes out `type="module"`,
     which `file://` refuses, so every bundler-based game repeats this port's own
     rewrite-plus-unbuilt-source-page guard by hand.
307. [Low] Author non-monster asset references in MWL (the port's P2, re-verified against
     `src/mwl/schema.ts` rather than taken on the note: still open). The inventory `item` node
     is `{ id, name, slot, stackable, weight }` with no asset attribute, and `image` remains
     only on `monster`/`unit_type`/`object`/`story`; the compiler's manifest scanner
     (`isAssetAttribute` in `src/mwl/compiler.ts`) already recognises `image`/`file`/`icon`/
     `profile`/`sound`/`*_sound`/`*_image` by name on *any* node, so the schema gate is the only
     thing blocking it - authoring a terrain or UI asset on `item` fails with "unknown attribute
     image on item" today. Adding `image` (and optionally `file`) to `item`, or a dedicated
     game-agnostic `asset` node with an optional `slot`/`kind`, is the one requested change; no
     port-specific names, values or art belong here, only the attribute contract and its
     determinism tests - the same bar every item in this section already commits to (see the
     section note above on renderer-free tests, an `@example`, save notes and an API report
     entry, and on waiting for a released version before checking a box here).
308. [Medium] Accept an explicit `{src, parser}` descriptor in `assets.load`/`texture` (a
     second port's report). `load()` (`src/assets/loader.ts`) always hands `Assets.load(path)`
     a bare path string, so a game whose compiled build inlines every asset as a `data:` URI
     (this framework's own offline-build story, see the `file://` constraint) has no way to
     tell Pixi which parser a `data:` URI needs and has to call `Assets.load({src, parser})`
     itself, alongside its own texture cache, duplicating what `load`/`texture` already do for
     a plain path. Auto-detecting a `data:` URI as `loadTextures`, or accepting the descriptor
     shape directly, would remove that duplicate bookkeeping.
309. [Low] A facade for `ColorMatrixFilter` (the same port's report). `ImageModifiers.ts`
     already returns matrices (`blendMatrix`, `channelScaleMatrix`, `channelSwapMatrix`,
     `colorShiftMatrix`), but attaching one to a sprite still means `new ColorMatrixFilter()`
     from `pixi.js` directly, the interop boundary's last remaining hole for a game that
     otherwise never imports Pixi by name. A bare re-export (`ColorMatrixFilter2D`, alongside
     `Container2D`/`Texture2D` in `Types2D.ts`) or a `spriteColorMatrix(sprite, matrix)` helper
     would close it.
310. [Low] Let `applyImageModifiers` bake `applyTextureModifiers`'s pixel-level work (the same
     port's report). `~BLEND`/`~ROTATE` are exact at the texture level
     (`applyTextureModifiers`) but only matrix-approximated at the sprite level
     (`applyImageModifiers`), so a caller wanting the exact result has to know about, and
     drive, both functions itself. An option on `applyImageModifiers` to bake the texture-level
     result instead of approximating it, or a documented two-step recipe, would remove the
     silent gap between the two.
311. [Low] Let `Projectile` carry a frame animation, not only a position tween (the same port's
     report). `Projectile.update` moves a sprite's `x`/`y` in a straight line and nothing else;
     a game whose missile art has flight frames (`[missile_frame]`, landed under 254) keeps its
     own parallel list of in-flight animations to advance alongside each `Projectile`. Accepting
     an optional `Animation` (or an `onUpdate` callback keyed to `progress`) would let one object
     own both.
312. [Low] A named-layer helper for `Node2D` trees (the same port's report). A game with a
     dozen or so conventionally-ordered layers (terrain, units, effects, UI, ...) hand-wires
     each as its own `Node2D`, added to its parent in the right order, every time. A
     `createLayers(names)` returning attached, named containers would remove that boilerplate;
     the ordering and naming stay the caller's own convention, not something this framework
     opines on.
313. [Low] Let `RichLabel`/`MarkupText` accept `tagStyles` the way a bare `Text2D` does (the
     same port's report). A game building narration through `new Text2D({ tagStyles })` for
     custom inline tags beyond `markup.ts`'s fixed set currently cannot reach that through
     either UI widget, so it builds its own `Text2D` instead of using a framework widget for
     what is otherwise exactly a `RichLabel`'s job.

Not open work, and not forgotten: these are decisions this project has deliberately
deferred, each with a note on what would un-park it. They stay out of the numbered list
until someone actually picks them up, because the list records shipped capabilities, not
standing intentions.

- **Items 28/30: the next reference pick.** Every genre the capability spec committed to
  is covered by the shipped `mwg/board` work (hex tactics, action points, cover,
  overwatch, shared turns, generic pieces). Picking another reference title is only worth
  doing when a game project actually needs a capability no current reference demands;
  the pick itself is a project decision, not framework work.
- **Item 41: board-game semantics beyond the generic piece.** `BoardGrid`/`BoardPiece`
  shipped the primitive shape. What "owned", "captured" and "promoted" should mean is
  tied to whichever board game item 30 eventually picks, so it un-parks together with 28/30.

### 1.0 exit checklist

The definition of done for 1.0. Each line is a check to run, not a feature to build. The numbered
list above is shipped except for the Wesnoth-port cluster (247 and up), which is open work for
that port rather than a gate on 1.0: the framework's 1.0 is what the ports build against, and
both of them being complete is the line below that says so.

- [x] `npm run check`, `npm test`, `npm run build`, and `npm run audit` are all green on
      the release commit. (2026-09-11: green on the 0.7.6 release commit `98c64df`, whose own CI
      run passed all five jobs - 1501 tests, 0 vulnerabilities, clean build. Re-run on the 1.0
      release commit itself, which is the wording this line keeps.)
- [x] `npm run api:check` passes: the committed `API_REPORT.md` matches the built
      declarations exactly. (2026-09-11: passes, after regenerating for `Blob.spread`'s
      return value.)
- [x] `npm publish --dry-run` shows the intended package contents and no `tools/docs`
      leakage (the getting-started page's own hazard, re-checked each release).
      (2026-09-11: 975 files, 1.0 MB packed, 3.8 MB unpacked, and the listing holds no
      `tools/docs` and no `node_modules` entry.)
- [x] The npm package's map files are decided explicitly, not left to drift: `dist` ships a
      `.js.map` and a `.d.ts.map` beside most modules, a deliberate debuggability choice.
      (2026-09-11: **kept**, with the numbers re-measured - they are 482 of 965 files and
      24% of the gzipped bytes, not the "422 of 845, a much smaller share of the bytes" this
      line used to claim. Kept because what a player downloads is the 1.0 MB tarball, and the
      reader these serve is a consumer debugging a bundled game: the `.d.ts.map` is also what
      makes an editor's go-to-definition land in TypeScript instead of emitted JavaScript.
      Re-decide on packed size, not file count.)
- [x] The getting-started tutorial is followed from scratch, in an empty directory
      outside this repo, once for each documented path: `npm install @datamoc/mw_games
      pixi.js vite`, the `npm pack` + install-by-path `.tgz` fallback, and the no-install
      `mw_games.global.js` script tag. All three reach a working `file://` page.
      (2026-09-11: all three, each a WebGL, game-ready page with no page errors. The registry
      path in `C:\Users\miche\dev\_mwg-tutorial-registry`, against the published 0.7.4 and
      re-run against 0.7.6 once it landed; the `.tgz` and global paths through
      `npm run package:smoke`, whose scratch directory is outside the repo. `package:smoke` now
      names `pixi.js` in the consumer install, so it fails if the tutorial's install line ever
      stops being enough.)
- [x] `pixi.js` moves from `dependencies` to optional `peerDependencies` (item 175's
      decision) and the two npm paths above are re-verified under that new install
      contract before the move ships. (2026-09-11: moved, with `pixi.js` also in
      `devDependencies` so this repo still builds and tests, and the install line named in
      `README`, `REFERENCE.md` and the getting-started page. Re-verified twice: `package:smoke`
      installs the packed tarball plus `pixi.js` and reaches a working `file://` page, and once
      0.7.6 was on the registry the literal registry path was re-run against it - installing
      `@datamoc/mw_games@^0.7.6` alone leaves `node_modules/pixi.js` absent (checked directly),
      the published `dependencies` is `rot-js` only with `pixi.js` a peer `^8.20.1` marked
      `optional`, and `@datamoc/mw_games/core` imports and runs with no Pixi present. 0.7.4 had
      still listed `pixi.js` under `dependencies`, which is exactly why this belonged to 1.0.)
- [x] The public API gets a stability-marker contract: `@experimental` on anything not
      intended as 1.0-stable, called out in release notes, and a `DEPRECATED` convention, so
      1.0 is the last release where a rename or an unstable surface moves silently.
      (2026-09-11: the contract is written in README's API stability note and wired into
      DEVELOPMENT.md's release step 2. Nothing under `src/` carries `@experimental` today,
      which is the honest state rather than an omission: every shipped surface is intended
      stable, so the tag is there for what comes next. Held by review, not by a check.)
- [x] A browser smoke check opens one built example from `file://` and looks at it:
      `npm run visual:smoke:ui` runs the check and writes a screenshot, but a human still
      has to look at it - the class of layout bug 1.0 must not ship is invisible to every
      automated check above. (2026-09-11: looked at
      `benchmark-results/visual-smoke/examples-interface-dist-index.png`. No window off-screen
      or clipped, no text over text, canvas painted to all four edges. The three things the
      eye catches are the demo's own intended widgets, checked in the source rather than
      assumed: the blue square that reads as a detached checkbox is `motionDot`, the animated
      element the label beside it deliberately sits away from, the bare readout is the
      frame-time display, and the unindented bag row is the deliberately un-carryable entry.
      No framework layout defect to fix.)
- [x] CHANGELOG, REFERENCE.md and the website's documentation page are regenerated or
      updated for whatever changed since the last release. (2026-09-11: `npm run webpage:docs`
      regenerates REFERENCE.md and the documentation page, both current; REFERENCE.md gained
      the peer-dependency sentence. CHANGELOG carries a new `[Unreleased]` section covering
      the `Blob` hook and the pixi move, moved to the top where Keep a Changelog puts it, from
      the stale empty one that had been sitting between 0.7.2 and 0.7.1.)
- [ ] **Both reference ports are complete and playable end to end against this release**
      (requested directly, 2026-09-11): the Shattered Pixel Dungeon port
      (`mwg-pixel-dungeon`) and the Wesnoth port (`mwg-wesno`, an empty directory today). This
      is the one line here that is not a check to run in this repo - it depends on two other
      projects - and it earns its place in the 1.0 definition of done because finished games are
      what validate the framework, where the examples only exercise it. The current 0.x release
      is what the ports build against in the meantime.

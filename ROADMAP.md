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
**Priority order among what's still open:** 28 → 30 → 41 → 45 (everything placed above
has shipped and is no longer part of this ordering). Items 37 (quests) and 39 (skills)
move up from their append position - both are small, unblocked `mwg/actors`/`mwg/rpg`
capabilities that already-committed reference games (ADOM's own row names quests explicitly;
levelling is implicit in nearly all of them) demand directly, unlike several later entries
that are either blocked on hex (28, 41) or still deciding which genre or mechanic to commit
to at all (30, 38). 40 (crafting) is pulled up alongside them for the same reason, sharing
37/39's shape: small, unblocked, already-demanded. 42 (action recording and replay) follows
right after - not demanded by any reference game, but the fastest way to make every item
above and below it faster to verify, and cheap: most of its determinism already exists
(`Random`, `Game.step`). Numbers themselves are never reassigned once given - the list is
an append-only history, including for what is not done yet - so priority order lives here, in
prose, rather than in the list's own sequence.

Reassessment with 43/44/45 placed: 43 (a spendable per-use resource) joins the top
cluster - its entry already scopes it to the one genuinely missing bit, which is small
(`craft()`-shaped), unblocked, and demanded across the references (MP/mana pools; item
48's `Charges` covers per-move uses, not pools). 44 (discrete elevation) sits mid-list:
concrete and scoped, but no committed reference demands height yet and it cuts across
`FieldOfView`, `Pathfinder` and draw order, so it costs more than its current demand
justifies placing higher. At that point, 45 (true 3D) went last because it was very low
priority and against the project's stated 2D purpose. 36 (structured logging) sinks below
all demanded work on its own entry's admission of marginal value. 28 stays low even
though hex (item 17) shipping removed its blocker - it is still an undecided reference
rather than demanded work.

Everything placed has since shipped (42, 32, 43, 31, 34, 33, 35, 44 with its TileMap
rendering half, 38, 36 - plus 37, 39, 40, 46-56 before them). What remains is decisions,
not demanded work: 28 and 30 are reference picks no capability waits on, and 41 waits on
30's pick by its own entry's admission. The formerly gated 45 has since shipped as optional
Babylon.js support, without changing the 2D default.
and needs a project-level yes before any code.

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
    `roguelike.Blob` holds volumes, diffuses a share into passable 4-neighbours per step
    and decays the rest (`decay: 1` conserves and only moves volume around); the game
    decides what a volume means via `cellsAbove`. Float dust snaps to zero so a burned-out
    effect reads as gone. 6 unit tests, including wall-blocking and the full decay-out
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

104. requested directly as "support management", resolved into two distinct pieces since
     "support" means two different things depending on which side of the framework it sits
     on - checked both against the real code, neither exists anywhere:
     - unit support/bond relationships: a Fire Emblem-shaped mechanic where two units build
       a relationship through proximity or shared battles over time, eventually unlocking a
       combat bonus or dialogue. Distinct from `actors.Advancement` (a tier ladder a single
       player spends into deliberately) and item 91's auras (positional, not cumulative) -
       this is a persistent, growing value between a specific *pair* of units, closer in
       shape to a second, relationship-scoped `Progression` than to anything `mwg` has today.
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
105. requested directly as "feedback from user", likewise two distinct pieces once resolved -
     checked both, neither exists anywhere:
     - in-app feedback or bug-report submission: a way for a player to send back written
       feedback from inside the game. Distinct from `core.Session`, which only counts
       launches silently for a native wrapper's own rating prompt and has no opinion on
       collecting or transmitting anything a player writes; this item would need an actual
       transport (which `mwg` has never had - every existing module is local-first, up to
       and including `SaveSystem`'s own `localStorage`-backed storage), so the design
       question is as much "how does this leave the player's machine at all" as it is a UI.
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

108. requested directly as "day/night management and weather". Checked against what already
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
     it, not a rubber stamp because it was asked for twice. Implemented as `world.EnvironmentClock`
     with configurable day phases, weather state, change notifications, snapshots, and restore.

109. requested directly as "fog of war". Checked against what already exists rather than
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
     items already agreed for this pass. Implemented as `board.FactionFog`, which unions the
     supplied vision of each faction and retains explored memory.

110. requested directly: integration with Ionic Capacitor
     (<https://capacitorjs.com/>), to build a native iOS/Android app from a game built on
     `mwg`. Checked against what already exists: item 85's own text already names Capacitor
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
     are `.gitignore`d, not committed. Still open: the store-touchpoints and touch-input
     questions above, since running the app inside an emulator or on a device needs Android
     Studio/Xcode, not available in this environment.

111. requested directly as "minimal typo correction on the go", named example: curved
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
     is sized. Implemented `i18n.typographic()` and automatic locale-aware apostrophe
     normalization in `t()`, with an opt-out on `Catalog.typography`.

112. a TypeScript equivalent of [`fluent-i18n`](https://github.com/orhun/fluent-i18n): a
     declarative, ergonomic internationalization layer built around Project Fluent's FTL
     message syntax. The existing `mwg/i18n` catalog and `t()` API already provide locale
     selection, fallback, interpolation and plurals, but messages are plain TypeScript data
     rather than parsed `.ftl` resources. Explore static locale loading, shared and
     locale-specific message files, typed interpolation arguments, clean fallback handling,
     missing-translation diagnostics or raw-key mode, and safe runtime locale switching while
     preserving the `file://` build constraint. The implementation should be TypeScript-first
     and integrate with the existing `Catalog`/`t()` surface rather than introduce a second
     translation API. Keep Unicode bidi-isolate handling and other Fluent security choices
     explicit, and validate the parser and fallback behavior with dependency-light tests.
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

129. requested directly as "online mode (multiple files support, multiplayer)". Checked
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
     clarification before this is sized rather than guessed at
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

132. requested directly: a general mouse-wheel input primitive, not scoped to any one
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
     own inconsistent-across-platforms Ctrl+wheel-means-zoom convention baked in unconditionally

133. check rendering capabilities across WebGL, WebGPU, and WGSL. This is a compatibility
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

134. use the best rendering solution for each graphics workload, based on measured results
     rather than one renderer claimed to fit everything. Establish and maintain a small
     decision matrix for 2D sprites and tile maps, UI/text, post-processing and custom
     shaders, particles, instanced terrain, voxel scenes, imported animated models, and
     large 3D worlds. Compare quality, frame time, memory, bundle cost, input latency,
     accessibility, browser/backend availability, and file:// deployment. Keep PixiJS for
     its proven 2D path and Babylon.js for optional 3D unless benchmarks demonstrate a clear
     improvement; use native browser APIs only when they materially outperform those layers.
     Any chosen solution must remain optional where appropriate, expose framework-level
     abstractions rather than application-specific renderer internals, and have an automated
     visual/performance regression test before it replaces an existing path. This is a
     continuing architecture policy, not a license to add overlapping rendering engines
     without a concrete workload and evidence.

135. a reusable loading-screen lifecycle for games that have enough assets or generation work
     to need one. It should accept named, weighted asynchronous tasks, show determinate
     progress when a task can report it and an honest indeterminate state when it cannot,
     remain responsive while work is underway, and hand off cleanly into a `Game`/scene.
     Include a themed default view plus hooks for game-owned art, accessible text and error
     reporting with retry/cancel behavior. It must work for compiled `data:` assets and
     file:// builds as well as ordinary fetches, without assuming a server or forcing every
     small example to display a loader. Logged below current rendering work because asset
     compilation already makes the typical local-file start nearly immediate; it matters
     once games load larger optional model, audio, or generated-world payloads.

136. package a game as a standalone desktop application using a native WebView2 host on
     Windows or a Chromium-based host where cross-platform consistency is worth its bundled
     runtime. Compare a minimal WebView2 shell, Electron/Tauri-style Chromium packaging, and
     the existing Capacitor mobile route by installer size, startup time, GPU/WebGL/WebGPU
     behavior, offline asset loading, crash/error reporting, update responsibility, code
     signing, and the permissions each bridge exposes. The wrapper must load the same built
     game output without requiring a web server, preserve the browser build as the canonical
     target, and keep native APIs opt-in so games remain portable. Start with a documented
     reference host and build/run smoke test, then add desktop-only capabilities only when a
     game supplies a concrete need. Low priority behind the web rendering and loading work:
     double-clickable file:// output already serves the core desktop use case without a shell.

137. progressive asset loading and unloading so scene transitions have no visible loading
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
     host modes with genuinely incremental I/O.

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

139. a smaller process note from the same stress-test as item 138: comments in that port's
     own code claimed three separate times that "`mwg` doesn't have X" for a capability
     (`Button`, `Bar`, `FloatingText`) added to `mwg` since those comments were written,
     caught only by manually diffing against the current checkout each time. Not a defect in
     `mwg` itself, but a discoverability gap for anything consuming it: a lightweight
     changelog, or an exported version constant readable without grepping source (`import {
     version } from '@datamoc/mw_games'`, say), would make "is this still missing, or did it
     ship since I last checked" cheaper to answer than re-deriving it by hand every time

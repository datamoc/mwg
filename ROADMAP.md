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
justifies placing higher. 45 (true 3D) goes last, as its own entry already says: very low
priority and against the project's stated 2D purpose. 36 (structured logging) sinks below
all demanded work on its own entry's admission of marginal value. 28 stays low even
though hex (item 17) shipping removed its blocker - it is still an undecided reference
rather than demanded work.

Everything placed has since shipped (42, 32, 43, 31, 34, 33, 35, 44 with its TileMap
rendering half, 38, 36 - plus 37, 39, 40, 46-56 before them). What remains is decisions,
not demanded work: 28 and 30 are reference picks no capability waits on, 41 waits on 30's
pick by its own entry's admission, and 45 stays last - true 3D cuts against the 2D purpose
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
45. 3D rendering (tiles, characters) - the newest XCOM games, or something in Satellite
    Reign's shape. Logged at the user's explicit request and *very* low priority, alongside
    an explicit caution the request itself raised: this cuts directly against what `mwg` is
    for, stated in this file's own first line - "a framework for building **2D** top-down
    games". PixiJS is a 2D renderer; a true 3D pipeline (a real camera, meshes, depth) is not
    an extension of the existing render path the way isometric or hex projection were, it is
    a different rendering foundation entirely. Not something to pick up without first asking
    whether it belongs in this project at all, rather than a new one built beside it

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
That caution still stands - none of 74-82 below are picked up without a yes first - but a
single line was also the wrong size for it, once asked to say what "3D rendering" would
actually break down into. 74-82 are that breakdown: a build-up from a bare floor to
imported models, in the order each piece would actually need the one before it, still all
logged rather than started.

74. a 3D rendering foundation: a real perspective camera, depth, and meshes - the
    prerequisite every item below needs and item 45's own caution already named. PixiJS is
    a 2D batcher; nothing in `mwg/render` today is an extension of it toward 3D the way
    isometric or hex projection were extensions of the square-tile path, because a depth
    buffer and a projection matrix are not tile-map concerns. Whether that foundation is a
    second PixiJS application in WebGPU mode, a separate library entirely, or something
    else is exactly the kind of choice 45 says needs a yes first
75. a basic 3D engine with a floor: one flat plane and a camera that can move around it,
    nothing else - proves item 74's foundation actually renders and navigates before any
    game content sits on top of it
76. a 3D floor with square tiles: individual tile meshes (or one textured plane with a
    tiled UV) placed from `mwg/roguelike`'s existing square grid data, so a level generated
    today could in principle be viewed in 3D without a second data model
77. a 3D floor with hexagonal tiles: the same for `mwg/core`'s `Hex` grid - axial
    coordinates already exist, only the placement math changes from square to hex
78. square columns: raised geometry per cell reusing item 44's `Elevation` sidecar - a wall
    or platform with actual height, the 3D analogue of `TileMap.setCellHeight`'s shaded
    faces
79. hexagonal columns: the same raised-geometry step over a hex floor (77 + 78 combined)
80. glTF / GLB import: loading a pre-built model (a character, a prop) rather than hand-
    built primitives - the standard interchange format, and what most free/purchased 3D
    asset packs already ship as
81. MagicaVoxel VOX import: a second, distinct asset pipeline for voxel-art models - a
    different aesthetic from glTF's smooth meshes, and a common source for exactly the
    chunky, tile-scaled look a game built on `mwg`'s other 2D tools might reach for
82. characters and movement in 3D: billboarded sprites (existing 2D art, always facing the
    camera - cheap, and keeps every other `mwg` module's assets reusable) versus true
    animated meshes (item 80/81's import formats, full freedom, an animation system this
    roadmap does not have yet even in 2D) is an open question of its own, not a detail
    inside 76-79

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

84. choosing an underlying 3D engine - the concrete form of item 74's "which foundation"
    question, once it comes time to actually answer it. Candidates raised so far, none
    picked:
    - **Babylon.js** - open-source, written in and typed for TypeScript throughout; a full
      scene graph plus built-in physics and particle editors, more engine than item 75's
      bare floor needs at first but the deepest toolset if 76-82 grow into it
    - **PlayCanvas** - a full 3D HTML5 engine with a cloud-based editor; the editor is a
      web service this project's `file://`/no-server stance has no use for, so only its
      runtime library would matter here
    - **TresJS / React Three Fiber** - declarative, component-based layers over Three.js
      for Vue or React respectively; both couple the 3D layer to a UI framework `mwg`
      itself is not built on, which cuts against every other module's plain-TypeScript,
      framework-agnostic shape
    - **Enable3d** - a Three.js + Ammo.js physics wrapper aimed at TypeScript/JavaScript
      directly, no UI framework attached; closer in shape to how `mwg` already wraps
      PixiJS than the other three

    Whichever is picked still has to clear the same bar every existing dependency does:
    bundles into a classic script with relative paths (`vite.lib.config.ts`'s IIFE, the
    same story `PixiJS` and `rot.js` already go through), so a 3D `mwg` game keeps opening
    from `file://` with no server - not yet checked for any candidate above. Picking one is
    exactly the kind of choice 45's own entry says needs a project-level yes first, same as
    45 itself

83 and 85 have since shipped, in the order this reassessment gave them: 83 first (no yes
needed, an hour with `Game.ts`), 85 alongside it (equally small, equally unblocked - a
`Session` counter is not a decision the way 45/74-84 are). 86 (the audio orchestrator)
joins that same unblocked tier, requested directly and building on `mwg/audio`'s existing
`Music`/`Sound` rather than waiting on anything. The 3D block stays exactly where 45
always put it - last, undecided, gated - because nothing about shipping 83/85/86 changed
that.

87 moves above the rest of the new Wesnoth-sourced items (88-91), ahead of even the
already-unblocked 86: the capability spec table currently claims zone of control as
shipped when it is not, which is a wrong claim in a document read as the definition of
done, not just an unimplemented idea waiting its turn. 88-91 sit behind 87 at the same
unblocked-but-not-urgent tier as 86 - each is small, self-contained, and needs no
project-level decision, but nothing demands them yet the way 87 corrects an existing
false claim. The 3D block is still last, still gated, unchanged by any of this.

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
find, but not a standing unmet promise. The 3D block remains last and gated, untouched by
any of this reordering.

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
decision), so that half sits with 89-98. Continuous `z` is explicitly not promised by this
item and stays behind the 3D block's own gate, same as items 74-84 and 96's whole shape;
99 is logged as one item because the 2D half is worth building regardless of whether 3D
ever gets a yes, not because both halves ship together.

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

97. a tower defense reference, further widening the genre list item 30 already opened:
    mostly composition of what `mwg` has rather than new demand. `Targeting`'s range/area
    resolution and `roguelike.Pathfinder` cover a tower choosing what to hit and an enemy
    routing along (or rerouting around a blocked) lane, `render.Projectile` covers a shot in
    flight, and `actors.Shop` covers spending currency to place or upgrade a tower. The one
    real gap surveyed against the existing modules is a timed wave spawner, logged
    separately as item 98 rather than folded in here, the same way item 30 named XCOM and
    board games without picking a specific title. No specific implementation committed to
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
    separate, larger question that ties into the still-gated 3D block (item 45) rather than
    something this item can promise on its own~~ - `rpg.FreeMover` ships the 2D half:
    `move(dx, dy, dt)` takes an unnormalized direction and updates `x`/`y` plus a continuous
    `facing` in radians; bucketing that angle into however many directions a sprite sheet
    has stays the game's own job, same as `GridMover`'s animation callbacks already are.
    Continuous `z` remains behind the 3D block, untouched by this

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
       Still open - a real new mechanic, not a recipe over what already exists, so it stays
       logged rather than built alongside this item's other, much smaller half
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
       Still open - a real architectural question this session did not resolve, so it stays
       logged rather than built alongside this item's other, much smaller half
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
block remains last and gated, untouched by any of this.

101, 102, 103, 106, 107 and 104/105's small halves have since shipped in one pass (this same
session's commits), leaving only what this reassessment already flagged as bigger than its
own item let on: 104's bond/support-relationship mechanic and 105's in-app feedback (still
wanting a network transport `mwg` has never had), both logged in place rather than built
alongside the halves that did ship. 97 is unchanged - still open-ended, still lowest priority
among the non-gated items. The 3D block remains last and gated.

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
     it, not a rubber stamp because it was asked for twice

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
     items already agreed for this pass

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
     - packaging: whether the existing `vite.lib.config.ts` IIFE output and
       `tools/compile-resources` step need a Capacitor-specific config, or whether a
       Capacitor project just points at the same build output any other deployment target
       would, is unverified until an actual `npx cap init` is tried against a real `mwg`
       example
     - store touchpoints: item 85's `Session`/`Achievements` signals are the intended seam a
       Capacitor wrapper reads to time a native rating prompt or report an achievement to
       Game Center/Play Games - this item is about proving that seam actually works end to
       end inside a real Capacitor shell, not inventing a new one
     Logged at low priority per this project's own roadmap process rather than started on the
     spot; a real answer needs an actual Capacitor project built against one of this
     project's own examples, not speculation from documentation alone

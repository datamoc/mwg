# Roadmap

Each module ships in the order below — later ones build on the modules before them. Order
among what is still open is reevaluated periodically, not just appended to. Entries below
mention "the capability spec" and other [README.md](README.md) sections by name; that's
where those live.

1. ~~`mwg/core` — loop, scenes, signals, RNG~~
2. ~~`mwg/render` — colour transform, camera, tile map, sprite sheets, animation~~
3. ~~`mwg/assets` + `tools/compile-resources` — the `file://` story end to end~~
4. ~~`mwg/ui` — windows, stack, lists, message box; `mwg/core` input with rebinding~~
5. ~~`mwg/stage` — dialogue scenes: backdrop, characters, script runner~~
6. ~~`mwg/i18n` — message tables, plurals, and left-to-right / right-to-left layout~~
7. ~~`mwg/actors` — stat blocks, equipment slots, modifiers, inventory~~
8. ~~`mwg/roguelike` — FOV, pathfinding, energy scheduler, level generation~~
9. ~~`mwg/world` — many maps, transitions, persistence, the turn clock, encounter tables~~
10. ~~`mwg/rpg` — map and event data, the interpreter, switches and variables, grid movement~~
11. ~~`mwg/battle` — species and stats, type matrix, speed-ordered turns~~
12. ~~`mwg/audio`, save/load~~
13. ~~layered character sprites, and vertical writing~~
14. ~~worked examples: a dungeon crawl, a village with NPCs and a cutscene, a creature battle~~
15. ~~`mwg/assets` + `mwg/render` — verify and harden SVG texture loading through a compiled
    `data:` URI~~ (verified in `examples/colour-transform`: Pixi's SVG parser rasterises it
    correctly through the aliased, extension-less `data:` source, no code changes needed)
16. ~~an SPD-shaped mockup: wire `mwg/actors` (`StatBlock`, `Inventory`, `EquipmentSlots`) into
    `examples/dungeon`~~ — the hero's attack/defense/max HP are now a `StatBlock` derived
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

17. ~~`mwg/render` + `mwg/roguelike` — hexagonal tile maps, and FOV/pathfinding over a hex
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
18. ~~`mwg/render` — isometric and staggered projection, so any Tiled orientation loads
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
    WebGL/WebGPU to a canvas 2D renderer~~ — measured directly (`renderer.name` inspected,
    not assumed): `colour-transform`'s 4000-sprite stress test holds a steady 60fps on
    `webgl` (Pixi's default preference; `Game` sets no `preference` of its own, so nothing
    here opts into a canvas fallback either). A synthetic 400×400-tile map (160,000 cells,
    625 chunks — far past the ~2,500-cell maps any current example uses) still holds 60fps,
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
22. ~~`mwg/roguelike` — a monster AI behaviour loop (wander / hunt / flee) driven by the
    existing `FieldOfView`, `Pathfinder` and `Scheduler` primitives~~ - `decideMonsterAI()`
    gives each monster its own sight (a fresh small-radius `FieldOfView` per call, not the
    player's) and turns that into wander/hunt/flee, built entirely from the three primitives
    already shipped. `examples/dungeon` now calls it once per monster per turn instead of the
    old single distance check; verified in a browser (a rat closed distance and landed a hit
    once in sight, killed cleanly with no console errors)
23. ~~`mwg/render` + `mwg/roguelike` — a discoverable/hidden tile state (secret doors,
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
24. ~~`mwg/roguelike` — targeting: an aim cursor with range/line-of-sight/area-of-effect shape
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
25. ~~`mwg/ui` — a dense icon-grid inventory view (multi-column, drag/drop, long-press to
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
26. ~~`mwg/world` — an explicit non-persistent-map mode~~: `World.define` now takes a
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
29. ~~`mwg/render` (`TileMap`) — auto-tiling: stitching a terrain edge or corner from many small
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
31. ~~`mwg/stage` — named-passage navigation for `StageScript`: a choice that jumps to another
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
32. ~~`mwg/rpg` — Tiled's *external* tileset format (`.tsx`, or its JSON export), and more than
    one tileset per map. `loadTiledMap` reads only a single tileset embedded directly in the
    map's own JSON today, and refuses outright the moment a map references a tileset as its
    own file or uses a second one - the ordinary shape once a project's maps share tilesets
    rather than each embedding a copy~~ - `loadTiledMap` takes one sheet per tileset
    (`TilesetSheet`, matched by `firstgid` in any order), resolving each gid by Tiled's own
    greatest-firstgid-at-or-below rule; cells hold `tileFrame` packs over a new multi-sheet
    `TileMap`, plain indices still reading as sheet 0. Fetching an external tileset stays the
    caller's job (`TiledTilesetData` types the tileset JSON); every sheet must share the
    map's tile size. 4 new tests
33. ~~`mwg/rpg` (or a new `mwg/automap`) — Tiled's automapping: rule maps whose `input_*` layers
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
34. ~~`mwg/stage` — importing actual Twine story files (the Twee notation, or the `<tw-passagedata>`
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
35. ~~`mwg/core` — minimal database-shaped functions over `localStorage`: named collections of
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
36. ~~`mwg/core` — structured log handling: categories and severity levels over bare
    `console.log`/`console.error`, the way every example's `main().catch` currently just
    dumps a stack trace to the page. Marginal value on its own - the browser console already
    covers most of what this would add - logged because it came up, not because a reference
    game demands it~~ - `core`'s `Logger`, kept as small as that admission demands: a
    category, four levels, a filter, and a sink tests capture instead of the console.
    4 unit tests
37. ~~`mwg/rpg` — quest/mission management: named quests with stages, each stage a condition
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
39. ~~`mwg/actors` — skills and competencies as levelling spends, not a new storage
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
40. ~~`mwg/actors` — crafting: a recipe (named ingredients and quantities, one result) resolved
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
42. ~~`mwg/core` — action recording and replay, for testing: tap `Input.onAction`, timestamp
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
73. ~~`mwg/roguelike` — generic combat lifecycle hooks: invulnerability, pre/post-damage
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
chess-specific implementation needed anyway. With 66-73 placed, item 45 is the roadmap's
only open item, unchanged in kind from every past reassessment: 3D rendering cuts against
`mwg`'s own 2D purpose and needs a project-level yes before any code, not just an
implementation.

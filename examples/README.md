# Examples

Each example runs straight from the framework source, so editing `src/` reloads the page.

Each has two ways to run. The dev server recompiles as you edit the framework; the build
produces a folder you open from disk with no server at all.

```
npm run assets              # generates examples/assets, once

npm run example             # colour-transform, dev server
npm run example:build       # colour-transform, then open its dist/index.html

npm run example:ui          # interface, dev server
npm run example:ui:build    # interface, then open its dist/index.html

npm run example:dialogue        # dialogue scene, dev server
npm run example:dialogue:build  # dialogue scene, then open its dist/index.html

npm run example:dungeon         # dungeon crawl, dev server
npm run example:dungeon:build   # dungeon crawl, then open its dist/index.html

npm run example:village         # a village with an NPC and a cutscene, dev server
npm run example:village:build   # village, then open its dist/index.html

npm run example:battle          # a creature battle, dev server
npm run example:battle:build    # battle, then open its dist/index.html

npm run example:minigame          # lockpicking timing game, dev server
npm run example:minigame:build    # lockpicking, then open its dist/index.html

npm run example:chess          # chess against the built-in engine, dev server
npm run example:chess:build    # chess, then open its dist/index.html
```

Opening an example's own `index.html` from disk shows a note telling you this, rather than
a black window: that file is the source page, and it needs the dev server.

| example | what it shows |
| --- | --- |
| `colour-transform` | per-sprite multiply **and** add, the thing Pixi's tint cannot do, with 4000 individually tinted sprites |
| `interface` | windows that stack, keyboard focus going to the top one only, a list with icons and disabled rows, and a message box that reveals text and ends on a choice |
| `dungeon` | an SPD-shaped mockup: generated floors, three-state fog of war, bump-to-attack, monsters with their own wander/hunt/flee AI (each judges the hero by its own sight, not the hero's), a secret door hiding a small vault and a hidden trap that springs underfoot (`mwg/roguelike`'s `Secrets`), a flask of oil thrown at the nearest visible monster in range (`mwg/roguelike`'s targeting helpers picking the target, `mwg/render`'s `Projectile` flying the sprite there), stairs down, plus `mwg/actors` wired in — a `StatBlock` (attack/defense/max HP derived from strength/armor/vitality), items on the floor, and a dense icon-grid inventory screen (`Tab`, `mwg/ui`'s `IconGrid`) where equipping a weapon or armor applies its modifiers. Autosaves on every descend and offers to continue on reload, via `mwg/core`'s `SaveSystem` — permadeath: the save is deleted the moment the hero dies, so there is nothing to continue. Arrow keys or the numpad to move, `.` to descend, `F` to search for secrets, `T` to throw |
| `dialogue` | a conversation scene: backdrop, Alice and Bob with expressions, the speaker lit and the other dimmed, and a branching choice. The whole scene is a list of data commands at the top of `main.ts` |
| `village` | `mwg/rpg`: an NPC with two conversation pages selected by a switch, a choice that sets a variable, and a short autorun cutscene the first time the map loads. Arrow keys to move, Enter to talk to the shopkeeper |
| `battle` | `mwg/battle`: a creature battle - species, a type-effectiveness matrix, speed-ordered turns, and a level-up with an evolution check on winning. The damage formula is this example's own invention, not something `mwg` prescribes |
| `minigame` | `mwg/core` scene stacking: a lockpicking timing challenge pauses the room underneath and returns a score through `onResume` |
| `chess` | `mwg/board`: chess against a small deterministic alpha-beta computer player, with legal moves, check, checkmate, stalemate, castling, en passant, and promotion. Click a square or move a held/repeating arrow-key cursor and press Enter |

## About the assets

`examples/assets` is **generated** by `tools/make-example-assets.mjs`: a 16px tileset drawn
in code, and four synthesised sounds. They are plain on purpose.

They are generated rather than downloaded so that everything in this repository is
redistributable under the project's own licence. Borrowing a tileset means inheriting its
terms, and game art is exactly where licence terms bite. For real art in your own game,
Kenney (kenney.nl) publishes large tilesets under CC0, which imposes nothing at all.

**Alice and Bob are one drawing.** The character generator builds a figure from parts —
skin, eyes, hair, upper garment, lower garment — each with its own colour, so a second
character costs a palette rather than a second sprite sheet. That decomposition is also
what makes worn equipment drawable later: another layer rather than another sheet.

# microgm-opt SoundFont provenance

`microgm-opt.sf2` is a small General MIDI SoundFont (2,629,640 bytes, 137 presets)
supplied for this repository as the smallest usable GM bank found so far. Its INFO
chunk names the bank `microgm-opt`, the engineer `michael`, the sound engine
`EMU8000`, the comment `gm soundfont for tiny devices`, and the tool `Polyphone`.

Licence: WTFPL (Do What The F*** You Want To Public License,
https://www.wtfpl.net/), confirmed by the project owner in October 2026. The
file's own INFO chunk states no licence, so this note is the record of that
confirmation. The bank keeps its WTFPL terms; it is not relicensed under this
project's MPL-2.0.

The bank ships in the published npm package (`package.json`'s `files` list), so
a game copies `data/microgm-opt.sf2` from the installed package into its own
asset folder and lets the build do the rest: `tools/compile-resources` embeds
only the programs the game's shipped MIDI files use, so a game that plays a
handful of instruments carries tens of kilobytes of the bank instead of the
whole file (see `tests/compile-resources.test.ts`, which subsets this bank
against a three-program MIDI file).

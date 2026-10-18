# SoundFont test fixtures provenance

`fluidr3-mini.sf2` holds four instruments cut out of FluidR3 GM (bank 0, programs 20, 38, 80
and 115: reed organ, synth bass 2, square lead and woodblock), written by `subsetSoundFont`.
The three `fluidr3-mini.*.sf3` files are the same font compressed in Vorbis, Opus and FLAC by
`mwg-soundfonts convert`. Regenerate all four with `npm run soundfonts:fixtures` (it reads the
large source font from `tests/soundfonts/FluidR3 GM.sf2`, which is not committed).

Source: FluidR3 GM, packaged as `fluid-soundfont` (https://launchpad.net/ubuntu/+source/fluid-soundfont).
Licence: MIT, as `data/soundfont-catalog.json` records for FluidR3_v3.1. The upstream copyright
notice travels with the font in the source package; these excerpts are test data and are not
shipped in the published npm package.

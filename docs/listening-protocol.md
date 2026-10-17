# A/B listening protocol

The package has no comparison against hardware or by ear yet: every automated check
(`mwg-audio compare`, `spectralDistance`, the decoder and budget tests) proves a render is
well-formed, in tune and the right length, and none of them proves it sounds like the
instrument it names. This protocol is the human half, and its verdicts are recorded here
so a later engine change can be judged against them instead of against memory.

## Protocol

1. Pick a short, dense excerpt: ten seconds with at least three simultaneous voices, one
   pitch bend or vibrato, and one quiet passage. Render it through each engine under test
   with `mwg-audio render <file> -o <out>.wav --synth <name>` at the same rate.
2. Level-match the renders (same peak, within 0.5 dB) before listening; loudness wins
   every informal comparison otherwise.
3. Listen blind where possible: a second person renames the files, the listener ranks
   them against the reference (hardware recording or the established engine) on four
   named axes only: pitch and tuning, envelope (attack and decay), brightness, and
   artefacts (clicks, aliasing, dropouts).
4. Record the verdict in the table below the same day, with the file, engine, rate and
   one sentence per axis that failed. "Sounds wrong" is not a verdict; "the lead decays
   in half the reference's time" is.
5. A spectral distance from `mwg-audio compare` may be attached as supporting data. It
   never overrides a listening verdict: distance measures difference, not wrongness.

## Verdicts

| Date | File | Engines compared | Rate | Verdict | Notes |
| --- | --- | --- | --- | --- | --- |
| (none yet) | | | | | No A/B session has been run yet. |

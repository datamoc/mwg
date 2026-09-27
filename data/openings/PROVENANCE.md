# Opening data provenance

`a.tsv` through `e.tsv` are the raw opening tables from
[lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), filenames
following the ECO volumes, vendored at commit
`c67912be581f0793dbaa776be5ccf111e01f88d9`. Each row is an ECO code, an English
opening name, and the line as PGN (SAN, no results, no variations).

As a collection of facts the dataset is public domain; insofar as its curation
qualifies for copyright it is released under the CC0 Public Domain Dedication (see
[COPYING.txt](https://github.com/lichess-org/chess-openings/blob/master/COPYING.txt)
upstream). No attribution is required; this note exists so a later session knows
where the bytes came from and which upstream commit they match.

`tools/compile-openings.mjs` compiles these tables into a position-keyed book a game
checks in beside its own code. Re-vendoring is downloading the five files at a new
commit and updating the hash above, nothing else reads the network.

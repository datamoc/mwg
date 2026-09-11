---
name: mwg-tests
description: Write, extend and review tests in the mwg framework, whose suite runs tests/**/*.test.ts directly under `node --test` with `node:assert/strict`, no test framework and no mocks. Use when adding or changing a test, deciding what a test can and cannot check here, fixing a gate such as api-examples, api-surface, barrel-collisions or reference-doc, or when a bug slipped past the suite.
---

# Testing mwg

`npm test` is `node --test "tests/**/*.test.ts"`. The sources run directly: no framework, no
bundler in the test path, no mocks. AGENTS.md, under "Conventions that are already
load-bearing", is the source of truth; if this file ever disagrees with it, AGENTS.md wins and
this file is the thing to fix.

## The rules

1. **Flat `test()`, never `describe`/`it`.** Every file under `tests/` is named `*.test.ts` and
   imports `node:test` plus `node:assert/strict` (167 of 167 files, and none of them uses
   `describe(` or `it(`). Names are sentences stating the behaviour, including the boundary the
   test pins.
2. **No test framework, ever.** No Jest, Vitest, Mocha, or a mocking library. `npm test` has to
   keep working from a plain `npm install`: the dependency list is a feature, not an accident.
3. **Inject, do not mock.** Nothing in `tests/` mocks a module. A dependency that cannot exist
   outside a browser is taken as an injectable factory instead: `audio.Sound` and `audio.Music`
   accept `create()` in place of `new Audio()`, and the tests hand in a fake. When a collaborator
   is hard to reach, add a seam to the source; do not add a mocking library to the suite.
4. **Deterministic.** Seeded `Random` from `src/core/Random.ts`, never the wall clock, the
   network, or a real timer. A test that needs any of those is a design smell here.
5. **Assert the direction and the boundary, not just a magnitude.** A test checking that a lift
   is non-zero passes for both signs; one checking `lift < y` cannot. This is not theoretical:
   `FloatingTextStack` shipped moving newcomers *down* the screen instead of lifting the lines
   already there, because the tests asserted the offset's size and never its direction.

## What a test here cannot see, and what to do instead

Anything measured through `Label` needs a DOM, so a class that draws text cannot be built under
`node --test` at all. That is why so much behaviour in this repo is exported as a pure function
and tested as arithmetic (`floatingTextAlpha`, `floatingTextRise`).

- **A rule with a formula in it: extract it and test it hard**, including the exact boundary
  (`bottom + gap > top`, not `bottom > top`) and its direction. If a rule cannot be pulled out of
  a class that needs a browser, that is a reason to pull it out, not to skip the case.
- **Something that draws: a test here will not cover it.** Build an example and look at it. A
  window placed off-screen or choices drawn over text is invisible to `npm test` and to
  `npm run check`, and obvious in a screenshot.
- **Rendering and headless checks**: `tools/browser-smoke.mjs` opens a built page from `file://`
  in headless Chrome, asserts it rendered on the WebGL path with no page error, and writes a
  screenshot for a human to look at. `npm run visual:smoke:ui` is the wired-up form.
- **Chrome throttles `requestAnimationFrame` in a background tab**, so a page can look frozen for
  reasons unrelated to the code. `Game.step(dt)` drives a frame by hand when that matters.

## Landing a change, gates included

```bash
node --test tests/foo.test.ts   # one file
npm test                        # the suite
npm run check                   # tsc --noEmit over src, examples, tools and tests
npm run coverage:check
npm run format:check            # Prettier
```

A new export needs three more things, and the suite fails on purpose until it has them:
`npm run api:report` (the api-surface test compares the committed `API_REPORT.md`), a line naming
it in `REFERENCE.md` (the reference-doc test), and a compiling `@example` fence in its own doc
comment (the api-examples test compiles every fence against the real public import path).
Renaming or removing an export means updating all three in the same change.

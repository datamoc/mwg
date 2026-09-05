/**
 * `mwg`'s own version, readable without grepping source or diffing a checkout - the
 * discoverability gap named directly: a consuming project (a port, a reference game built
 * against an older `mwg`) had claimed "mwg doesn't have X" three times for a capability
 * that had since shipped, caught only by manually diffing the current checkout each time.
 *
 * Kept in sync with `package.json`'s own `version` field by `tests/version.test.ts`, which
 * fails the moment the two disagree - the cheap alternative to a build step that injects
 * this from `package.json` automatically, chosen because this project's own build already
 * has no step before `tsc`/`vite` that this would need to run ahead of.
 */
export const version = '0.2.0';

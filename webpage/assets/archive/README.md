# Archived diagrams

The hand-drawn originals of the four architecture diagrams, kept as they stood on
2026-09-06, immediately before `tools/make-architecture-diagrams.mjs` replaced them with
generated ones.

They are here for reference only. Nothing links to them, and they describe a module layout
that no longer exists: `render`, `ui` and `stage` were top-level modules before they moved
under `two-d`, and `rpg.EventRunner` drove a `WindowStack`/`MessageBox` directly before it
took an injected `DialoguePresenter` instead.

That staleness is exactly why the replacements are generated: `0c_framework_architecture`
now reads the real module list out of `src/`, so it cannot describe a layout the code does
not have.

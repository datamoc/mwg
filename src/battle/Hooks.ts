import { HookRegistry } from '../core/Hooks.ts';

/**
 * A battle-scoped place for passive effects to run code, not just push a number - the seam
 * `mwg/actors`' `StatBlock` modifiers and `applyStatusEffect` do not cover, since both are
 * numeric-only. An ability reacting to "this creature switched in," a held item reacting to
 * "this creature was hit," or a sleep/paralysis status answering "can this creature act this
 * turn" are all the same shape: register a handler for a named event, and a game's battle
 * loop calls it at the right moment.
 *
 * `mwg` names no events of its own beyond the strings a game passes - `'switchIn'`, `'hit'`,
 * `'turnStart'`, whatever a game's battle loop actually fires. A "can this creature act"
 * check is a plain convention on top of this, not special-cased: a handler mutates a shared
 * `context` object (`{ skip: false }`, say) the same way any other side effect would, and
 * the battle loop reads it back after `emit` returns.
 *
 * The registry itself is `core.HookRegistry`, shared with `roguelike.CombatHooks`. What is
 * battle-specific is only the shape of what a handler receives: the creature the event is
 * about, plus that optional shared context.
 */
export class BattleHooks<C> extends HookRegistry<[creature: C, context?: unknown]> {}

export type { Hook as BattleHook } from '../core/Hooks.ts';

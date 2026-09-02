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
 */
export interface BattleHook<C> {
	event: string;
	handler: (creature: C, context?: unknown) => void;
	/** whatever registered this hook - an ability, a held item - for bulk removal via `offSource` */
	source?: unknown;
}

export class BattleHooks<C> {
	private hooks: BattleHook<C>[] = [];

	on(event: string, handler: (creature: C, context?: unknown) => void, source?: unknown): void {
		this.hooks.push({ event, handler, source });
	}

	/** removes every hook registered with this `source` - a fainted creature's ability leaving */
	offSource(source: unknown): void {
		this.hooks = this.hooks.filter((hook) => hook.source !== source);
	}

	/** runs every handler registered for `event`, in registration order */
	emit(event: string, creature: C, context?: unknown): void {
		for (const hook of this.hooks) {
			if (hook.event === event) hook.handler(creature, context);
		}
	}
}

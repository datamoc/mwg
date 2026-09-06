/**
 * A named-event registry whose handlers can be removed in bulk by whatever registered them.
 *
 * Distinct from `Signal`, which is one event with one payload and a consuming, LIFO listener
 * order: this is many events keyed by name, dispatched in registration order, with a `source`
 * tag so everything an ability or a worn item put here comes off in one call when that thing
 * leaves. `mwg` names no events of its own - the strings are whatever a game's own loop
 * actually fires.
 *
 * `battle.BattleHooks` and `roguelike.CombatHooks` are both this, with their argument types
 * fixed and their own documentation attached. They used to be two line-for-line copies of the
 * same class; the difference between them was never the registry, only what a handler is
 * handed when it runs.
 *
 * @example
 * ```ts
 * import { HookRegistry } from '@datamoc/mw_games/core';
 *
 * const hooks = new HookRegistry<[amount: number]>();
 * const poisonRing = {};
 *
 * hooks.on('turnStart', (amount) => console.log('poison ticks for', amount), poisonRing);
 * hooks.emit('turnStart', 3);
 *
 * // the ring is removed - every hook it registered comes off in one call
 * hooks.offSource(poisonRing);
 * ```
 */
export interface Hook<TArgs extends unknown[]> {
	event: string;
	handler: (...args: TArgs) => void;

	/** whatever registered this hook - an ability, a held item - for bulk removal via `offSource` */
	source?: unknown;
}

export class HookRegistry<TArgs extends unknown[]> {
	private hooks: Hook<TArgs>[] = [];

	on(event: string, handler: (...args: TArgs) => void, source?: unknown): void {
		this.hooks.push({ event, handler, source });
	}

	/** removes one specific handler; `offSource` is the usual way, this is for a one-off */
	off(handler: (...args: TArgs) => void): void {
		this.hooks = this.hooks.filter((hook) => hook.handler !== handler);
	}

	/** removes every hook registered with this `source` - a fainted creature's ability leaving */
	offSource(source: unknown): void {
		this.hooks = this.hooks.filter((hook) => hook.source !== source);
	}

	/** runs every handler registered for `event`, in registration order */
	emit(event: string, ...args: TArgs): void {
		//iterate a copy: a handler may remove itself or another, which must not shift the
		//iteration out from under this loop mid-dispatch
		for (const hook of [...this.hooks]) {
			if (hook.event === event) hook.handler(...args);
		}
	}

	/** how many handlers are registered, across every event */
	get size(): number {
		return this.hooks.length;
	}

	clear(): void {
		this.hooks = [];
	}
}

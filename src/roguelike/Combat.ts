import { HookRegistry } from '../core/Hooks.ts';

export type CombatEvent = 'beforeAttack' | 'beforeDamage' | 'afterDamage' | 'onKill' | string;

export interface DamageContext<C> {
	attacker: C;
	defender: C;
	amount: number;
	prevented: boolean;
	[kind: string]: unknown;
}

/**
 * Generic combat lifecycle hooks; the game owns HP, formulas, and when each event fires.
 *
 * The registry is `core.HookRegistry`, the same one `battle.BattleHooks` uses - these were two
 * copies of one class for a while. What is combat-specific is that a handler receives a single
 * mutable `DamageContext`, and the `modifyDamage` seam below built on it.
 *
 * @example
 * ```ts
 * import { CombatHooks } from '@datamoc/mw_games/roguelike';
 *
 * const hooks = new CombatHooks<{ name: string }>();
 * const invulnerability = {};
 *
 * hooks.on('beforeDamage', (ctx) => { ctx.amount = 0; }, invulnerability);
 *
 * const result = hooks.modifyDamage({ name: 'hero' }, { name: 'rat' }, 5);
 * console.log(result.amount, result.prevented); // 0 true
 * ```
 */
export class CombatHooks<C> extends HookRegistry<[context: DamageContext<C>]> {
	/** Runs the pre-damage seam and clamps the resulting amount at zero. */
	modifyDamage(attacker: C, defender: C, amount: number): DamageContext<C> {
		const context: DamageContext<C> = { attacker, defender, amount, prevented: false };
		this.emit('beforeDamage', context);
		context.amount = Math.max(0, context.amount);
		if (context.amount === 0) context.prevented = true;
		return context;
	}
}

export type { Hook as CombatHook } from '../core/Hooks.ts';

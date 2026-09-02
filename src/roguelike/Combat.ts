export type CombatEvent = 'beforeAttack' | 'beforeDamage' | 'afterDamage' | 'onKill' | string;

export interface DamageContext<C> {
	attacker: C;
	defender: C;
	amount: number;
	prevented: boolean;
	[kind: string]: unknown;
}

export interface CombatHook<C> {
	event: CombatEvent;
	handler: (context: DamageContext<C>) => void;
	source?: unknown;
}

/** Generic combat lifecycle hooks; the game owns HP, formulas, and when each event fires. */
export class CombatHooks<C> {
	private hooks: CombatHook<C>[] = [];

	on(event: CombatEvent, handler: (context: DamageContext<C>) => void, source?: unknown): void {
		this.hooks.push({ event, handler, source });
	}

	offSource(source: unknown): void {
		this.hooks = this.hooks.filter((hook) => hook.source !== source);
	}

	emit(event: CombatEvent, context: DamageContext<C>): void {
		for (const hook of this.hooks) if (hook.event === event) hook.handler(context);
	}

	/** Runs the pre-damage seam and clamps the resulting amount at zero. */
	modifyDamage(attacker: C, defender: C, amount: number): DamageContext<C> {
		const context: DamageContext<C> = { attacker, defender, amount, prevented: false };
		this.emit('beforeDamage', context);
		context.amount = Math.max(0, context.amount);
		if (context.amount === 0) context.prevented = true;
		return context;
	}
}

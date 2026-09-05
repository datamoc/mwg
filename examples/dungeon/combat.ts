export interface Attacker {
	damage: readonly [number, number];
}

export interface Defender {
	hp: number;
	defense?: number;
}

export interface DamageRandom {
	range(min: number, max: number): number;
}

/** The dungeon example's own damage rule, shared by its scene and headless scenarios. */
export function resolveAttack(attacker: Attacker, defender: Defender, random: DamageRandom): { hp: number; damage: number } {
	const raw = random.range(attacker.damage[0], attacker.damage[1]);
	const damage = Math.max(1, raw - (defender.defense ?? 0));
	return { hp: defender.hp - damage, damage };
}

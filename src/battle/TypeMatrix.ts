/**
 * An effectiveness matrix between arbitrary types - `mwg` supplies the matrix, not a type
 * chart. Type names are whatever strings a game defines; an unset pairing multiplies by 1,
 * so a matrix only has to name the pairings that are not neutral.
 *
 * @example
 * ```ts
 * import { TypeMatrix } from '@datamoc/mw_games/battle';
 *
 * const matrix = new TypeMatrix();
 * matrix.set('fire', 'grass', 2); // super effective
 * matrix.set('fire', 'water', 0.5); // not very effective
 *
 * const total = matrix.multiplierFor('fire', ['grass', 'ice']); // 2 * 1 = 2
 * ```
 */
export class TypeMatrix {
	private multipliers = new Map<string, number>();

	private key(attacking: string, defending: string): string {
		return `${attacking}:${defending}`;
	}

	set(attacking: string, defending: string, multiplier: number): void {
		this.multipliers.set(this.key(attacking, defending), multiplier);
	}

	get(attacking: string, defending: string): number {
		return this.multipliers.get(this.key(attacking, defending)) ?? 1;
	}

	/** the combined multiplier of one attacking type against every one of a target's types */
	multiplierFor(attacking: string, defendingTypes: readonly string[]): number {
		return defendingTypes.reduce((total, defending) => total * this.get(attacking, defending), 1);
	}
}

import type { Level } from './Level.ts';

/**
 * A cell that renders and blocks like its surroundings until revealed.
 *
 * The concealment itself is just terrain: `conceal` writes the disguise kind straight into
 * the `Level`, so a secret door already passes every `passable`/`transparent` check as
 * whatever it is disguised as - a wall that cannot be walked through or seen past, a floor
 * that can. Nothing in `FieldOfView` or `Pathfinder` needs to know secrets exist. What this
 * class remembers is the other half: which cells have a secret at all, and what they turn
 * into once discovered - a secret door swapping to a passable, transparent kind; a trap
 * staying passable but becoming *visibly* a trap.
 *
 * Discovery itself is a game's call, not this class's: a search action rolling against a
 * distance, a trap firing the moment a creature steps onto it, a wand of revealing. This
 * only does the bookkeeping once that decision has been made.
 */
export class Secrets {
	private level: Level;
	private revealedKind = new Map<number, number>();
	private discovered = new Set<number>();

	constructor(level: Level) {
		this.level = level;
	}

	/** hides a cell as `disguise`, remembering that it becomes `revealed` once discovered */
	conceal(x: number, y: number, disguise: number, revealed: number): void {
		const cell = this.level.index(x, y);
		this.revealedKind.set(cell, revealed);
		this.discovered.delete(cell);
		this.level.set(x, y, disguise);
	}

	/** a cell with a secret, still hidden - what a search action should be rolling against */
	isSecret(x: number, y: number): boolean {
		const cell = this.level.index(x, y);
		return this.revealedKind.has(cell) && !this.discovered.has(cell);
	}

	isDiscovered(x: number, y: number): boolean {
		return this.discovered.has(this.level.index(x, y));
	}

	/**
	 * Swaps a concealed cell to its revealed kind.
	 *
	 * @returns whether there was anything to discover - false for a cell with no secret, or
	 * one already found, so a caller can tell a real discovery from a wasted search
	 */
	discover(x: number, y: number): boolean {
		if (!this.isSecret(x, y)) return false;

		const cell = this.level.index(x, y);
		this.discovered.add(cell);
		this.level.set(x, y, this.revealedKind.get(cell)!);
		return true;
	}

	toJSON(): { revealed: [number, number][]; discovered: number[] } {
		return { revealed: [...this.revealedKind], discovered: [...this.discovered] };
	}

	/** rebuilds secrets from save data onto a (separately restored) level */
	static fromJSON(level: Level, data: { revealed: [number, number][]; discovered: number[] }): Secrets {
		const secrets = new Secrets(level);
		for (const [cell, revealed] of data.revealed) secrets.revealedKind.set(cell, revealed);
		for (const cell of data.discovered) secrets.discovered.add(cell);
		return secrets;
	}
}

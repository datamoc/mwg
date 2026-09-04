import { StatBlock, type Modifier } from './StatBlock.ts';

/** "adjacent allies fight better while this unit is nearby" - the modifiers, not the radius */
export interface AuraDef {
	name: string;
	modifiers: readonly Omit<Modifier, 'source'>[];
}

/** anyone who might carry or receive an aura; `aura` absent or `null` means "carries none" */
export interface AuraParticipant {
	stats: StatBlock;
	aura?: AuraDef | null;
}

/**
 * Continuously reapplies auras as who is adjacent to whom changes, unlike `battle.BattleHooks`
 * (triggered once) or `actors.StatusEffect` (expires on a timer) - neither re-checks "is a
 * qualifying unit still adjacent" on its own, which is exactly what a positional aura needs
 * every time anyone moves.
 *
 * Call `update` once per relevant tick with the full roster and an adjacency test; "adjacent"
 * is deliberately left to the caller (square grid, hex grid, board-tactics neighbours all mean
 * something different) rather than assumed here. Each call diffs against who was affected by
 * each carrier last time: a unit that just became adjacent gets the carrier's modifiers added,
 * one that just left loses exactly those modifiers, and one that stays adjacent is left alone
 * rather than having its modifiers reapplied on every tick.
 */
export class AuraField {
	//per carrier, which participants currently carry that carrier's modifiers and under
	//what source symbol - a unit inside two carriers' auras at once tracks both independently
	private affected = new Map<AuraParticipant, Map<AuraParticipant, symbol>>();

	update(participants: readonly AuraParticipant[], isAdjacent: (a: AuraParticipant, b: AuraParticipant) => boolean): void {
		const roster = new Set(participants);
		const carriers = participants.filter((p): p is AuraParticipant & { aura: AuraDef } => !!p.aura);
		const carrierSet = new Set<AuraParticipant>(carriers);

		for (const carrier of carriers) {
			let currentlyAffected = this.affected.get(carrier);
			if (!currentlyAffected) {
				currentlyAffected = new Map();
				this.affected.set(carrier, currentlyAffected);
			}

			for (const other of participants) {
				if (other === carrier) continue;
				const adjacent = isAdjacent(carrier, other);
				const source = currentlyAffected.get(other);

				if (adjacent && !source) {
					const newSource = Symbol(`aura:${carrier.aura.name}`);
					for (const modifier of carrier.aura.modifiers) other.stats.addModifier({ ...modifier, source: newSource });
					currentlyAffected.set(other, newSource);
				} else if (!adjacent && source) {
					other.stats.removeModifiersFrom(source);
					currentlyAffected.delete(other);
				}
			}

			//a target affected last call but absent from this call's roster entirely (died,
			//was removed) is never visited by the loop above, since that only walks
			//`participants` - left alone, its modifiers and its own strong reference here
			//would both persist forever
			for (const [other, source] of [...currentlyAffected]) {
				if (roster.has(other)) continue;
				other.stats.removeModifiersFrom(source);
				currentlyAffected.delete(other);
			}
		}

		//a carrier that died, lost its aura, or simply is not in this call's roster any more
		//stops affecting anyone it was still affecting, rather than leaving stale modifiers
		for (const [carrier, currentlyAffected] of [...this.affected]) {
			if (carrierSet.has(carrier)) continue;
			for (const [other, source] of currentlyAffected) other.stats.removeModifiersFrom(source);
			this.affected.delete(carrier);
		}
	}
}

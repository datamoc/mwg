import type { TypeMatrix } from './TypeMatrix.ts';

/**
 * An opposing trainer's move and switch decisions, built on `TypeMatrix` - the one piece of
 * genuinely shared knowledge any two battlers agree on - the same way `decideMonsterAI` is
 * built on `FieldOfView`/`Pathfinder` rather than reimplementing sight or movement. Neither
 * function judges anything beyond type matchups; a game's own damage formula, status
 * conditions, and move priority are free to override the choice this suggests, the same way
 * a game is free to ignore `decideMonsterAI`'s step and hand-roll a boss's own behaviour.
 */

/** picks the move whose type is most effective against `opponentTypes`, ties keeping the
 * first candidate; `null` for an empty list */
export function chooseMove<M extends { type: string }>(
	moves: readonly M[],
	matrix: TypeMatrix,
	opponentTypes: readonly string[],
	score: (move: M, opponentTypes: readonly string[]) => number = (move, types) =>
		matrix.multiplierFor(move.type, types)
): M | null {
	if (moves.length === 0) return null;

	let best = moves[0];
	let bestScore = score(best, opponentTypes);

	for (const move of moves.slice(1)) {
		const candidateScore = score(move, opponentTypes);
		if (candidateScore > bestScore) {
			bestScore = candidateScore;
			best = move;
		}
	}

	return best;
}

/**
 * Whether a bench member defends better against `opponentTypes` than whatever is active now.
 *
 * @returns the index into `bench` of the best defensive improvement, or `null` when nothing
 * on the bench is a clear upgrade over staying in
 */
export function chooseSwitch(
	activeTypes: readonly string[],
	bench: readonly { types: readonly string[] }[],
	matrix: TypeMatrix,
	opponentTypes: readonly string[]
): number | null {
	let bestIndex: number | null = null;
	let bestThreat = worstIncoming(activeTypes, matrix, opponentTypes);

	bench.forEach((candidate, index) => {
		const threat = worstIncoming(candidate.types, matrix, opponentTypes);
		if (threat < bestThreat) {
			bestThreat = threat;
			bestIndex = index;
		}
	});

	return bestIndex;
}

/** the most damaging multiplier any of `attackingTypes` lands against `defendingTypes` */
function worstIncoming(defendingTypes: readonly string[], matrix: TypeMatrix, attackingTypes: readonly string[]): number {
	return Math.max(...attackingTypes.map((type) => matrix.multiplierFor(type, defendingTypes)));
}

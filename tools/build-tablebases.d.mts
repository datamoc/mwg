export interface TablebaseSpec {
	white: Array<'queen' | 'rook' | 'bishop' | 'knight'>;
}

export interface TablebaseSolution {
	wdl: number[];
	dtm: number[];
	positions: number;
}

/**
 * Solves one white-extras-against-lone-king ending by retrograde analysis.
 * Self-contained for `threads.spawn`: everything it touches is nested inside.
 * `lower` carries the smaller tables captures convert into, null for 3-piece.
 */
export function tablebaseTask(
	spec: TablebaseSpec,
	lower: Record<string, { wdl: number[]; dtm: number[] }> | null,
): TablebaseSolution;

/** `KQBK` from an ending id's letters, throwing on anything unshaped. */
export function specOf(id: string): TablebaseSpec;

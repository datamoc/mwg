export interface ScenarioPlanEntry {
	id: string;
	enter: string;
	/** Steps that play all sides and advance dialogue for one game-owned turn. */
	turn: string[];
	/** A step that throws when game-owned map, units, outcome or campaign checks fail. */
	verify: string;
	leave?: string;
}
export function validateScenarioPlan(plan: unknown): ScenarioPlanEntry[];
export function verifyScenarios(options: { file: string; turns?: number; timeoutMs?: number; only?: string }): Promise<{
	ok: boolean;
	scenarios: { id: string; turns: number; ok: boolean }[];
	failures: string[];
}>;

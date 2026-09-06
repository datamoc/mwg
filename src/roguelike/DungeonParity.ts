import type { RoomEdge } from './generate.ts';

/**
 * Everything a seeded generation run produced, flattened into plain data a parity check can
 * diff: the room graph and retry count from `generateDungeonGraph`, the terrain it painted,
 * whatever feature layer and content rolls a game attached, and however many RNG draws the
 * game itself chose to count. `mwg` dictates none of the game-side shapes here (`content` is
 * whatever a game's own roll traces are) - only how to compare two of them.
 */
export interface DungeonArtifacts {
	graph: readonly RoomEdge[];
	retries: number;

	/** which builder carved each room, by room index - a paint-stage artifact, not a graph one */
	roomBuilders: readonly string[];

	width: number;
	height: number;
	terrain: ArrayLike<number>;
	features: readonly [number, string][];
	content: readonly unknown[];
	rngDraws: number;
}

/** which half of the pipeline a mismatch belongs to, so a graph bug and a paint bug never get conflated */
export type DungeonParityStage = 'graph' | 'paint';

export interface DungeonMismatch {
	stage: DungeonParityStage;
	field: string;
	expected: unknown;
	actual: unknown;
}

function edgesEqual(a: readonly RoomEdge[], b: readonly RoomEdge[]): boolean {
	return a.length === b.length && a.every((edge, i) => edge.a === b[i].a && edge.b === b[i].b && edge.extra === b[i].extra);
}

function arraysEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

function featuresEqual(a: readonly [number, string][], b: readonly [number, string][]): boolean {
	if (a.length !== b.length) return false;
	const sortedA = [...a].sort((x, y) => x[0] - y[0]);
	const sortedB = [...b].sort((x, y) => x[0] - y[0]);
	return sortedA.every(([cell, kind], i) => cell === sortedB[i][0] && kind === sortedB[i][1]);
}

/**
 * Diffs two artifact snapshots (this port's own run against a reference implementation's, or
 * a golden fixture), reporting every mismatch tagged with which stage it belongs to: `'graph'`
 * for the room graph and retry count, `'paint'` for terrain, features, content placements and
 * RNG draw count. An empty result means the two runs are equivalent by every artifact checked.
 */
export function compareDungeonArtifacts(expected: DungeonArtifacts, actual: DungeonArtifacts): DungeonMismatch[] {
	const mismatches: DungeonMismatch[] = [];

	if (expected.retries !== actual.retries) {
		mismatches.push({ stage: 'graph', field: 'retries', expected: expected.retries, actual: actual.retries });
	}
	if (!edgesEqual(expected.graph, actual.graph)) {
		mismatches.push({ stage: 'graph', field: 'graph', expected: expected.graph, actual: actual.graph });
	}

	if (expected.width !== actual.width || expected.height !== actual.height || !arraysEqual(expected.terrain, actual.terrain)) {
		mismatches.push({ stage: 'paint', field: 'terrain', expected: expected.terrain, actual: actual.terrain });
	}
	if (expected.roomBuilders.length !== actual.roomBuilders.length || expected.roomBuilders.some((id, i) => id !== actual.roomBuilders[i])) {
		mismatches.push({ stage: 'paint', field: 'roomBuilders', expected: expected.roomBuilders, actual: actual.roomBuilders });
	}
	if (!featuresEqual(expected.features, actual.features)) {
		mismatches.push({ stage: 'paint', field: 'features', expected: expected.features, actual: actual.features });
	}
	if (JSON.stringify(expected.content) !== JSON.stringify(actual.content)) {
		mismatches.push({ stage: 'paint', field: 'content', expected: expected.content, actual: actual.content });
	}
	if (expected.rngDraws !== actual.rngDraws) {
		mismatches.push({ stage: 'paint', field: 'rngDraws', expected: expected.rngDraws, actual: actual.rngDraws });
	}

	return mismatches;
}

/**
 * Runs `generate` repeatedly and diffs every later run against the first - the same seed
 * (pushed by the caller around `generate`) must produce byte-identical artifacts every time,
 * or the generator itself is non-deterministic regardless of what it is being compared against.
 */
export function checkDeterminism(generate: () => DungeonArtifacts, runs = 2): DungeonMismatch[] {
	const first = generate();
	const mismatches: DungeonMismatch[] = [];
	for (let i = 1; i < runs; i++) {
		mismatches.push(...compareDungeonArtifacts(first, generate()));
	}
	return mismatches;
}

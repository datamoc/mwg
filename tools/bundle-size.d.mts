export type SizeMetrics = Record<string, Partial<Record<'raw' | 'gzip', number>>>;

/** raw and gzipped bytes of every file a player receives from `dist`, plus `total` */
export function measureBuild(dist: string): SizeMetrics;

/** each metric against its baseline; `failed` when one grew more than `tolerance` (0.02 by default) */
export function compareBudget(
	current: SizeMetrics,
	baseline: SizeMetrics,
	tolerance?: number,
): { lines: string[]; failed: boolean };

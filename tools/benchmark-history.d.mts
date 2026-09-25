/** a benchmark's recorded runs, or `[]` when none has been recorded yet */
export function readHistory<T = Record<string, unknown>>(historyPath: string): Promise<T[]>;

/** appends `entry` to `history` and writes the last 50 runs back */
export function appendHistory<T>(historyPath: string, history: T[], entry: T): Promise<void>;

/** the best value of `metric` across `history`, or null when it is empty */
export function bestSeen<T>(history: readonly T[], metric: (entry: T) => number): number | null;

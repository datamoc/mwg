import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const maxHistoryEntries = 50;

/**
 * Per-benchmark history: read what a prior run of the same benchmark recorded, append what
 * this run measured, and detect a regression against the best one seen so far. Shared by
 * `benchmark-browser.mjs` (fps/p95/memory) and `benchmark-simulation.mjs` (commands/steps per
 * second) - the two started as separate copies of the same read/append/compare logic before
 * this module existed to hold it once.
 */
export async function readHistory(historyPath) {
	try {
		return JSON.parse(await readFile(historyPath, 'utf8'));
	} catch {
		return []; //no prior run recorded yet - not an error, just nothing to compare against
	}
}

/** appends `entry` to `history` (already loaded by the caller) and persists the result */
export async function appendHistory(historyPath, history, entry) {
	history.push(entry);
	await mkdir(dirname(historyPath), { recursive: true });
	await writeFile(historyPath, JSON.stringify(history.slice(-maxHistoryEntries), null, 2));
}

/** the best value of `metric` seen across `history`, or null if it is empty */
export function bestSeen(history, metric) {
	return history.length > 0 ? Math.max(...history.map((entry) => metric(entry))) : null;
}

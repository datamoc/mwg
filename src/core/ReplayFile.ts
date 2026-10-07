import { Recorder, Player, parseReplayEvents } from './Replay.ts';
import type { ReplayEvent } from './Replay.ts';
import { defaultStorage, type SaveStorage } from './Save.ts';
import { StoredValue } from './StoredValue.ts';
import { checkSize, parseInbound } from './Sanitize.ts';
import type { Signal } from './Signal.ts';

/**
 * A run made durable: the recording `core` already takes, in a shape that survives a page
 * reload, crosses machines, and refuses to play against a build it was not recorded on.
 *
 * `Recorder`/`Player` record and replay in memory; this file is everything around that:
 * a self-describing file format (export and import), the newest recording kept in storage
 * (last-run capture), and a mid-run checkpoint pairing the partial recording with the
 * game state beside it. The `file://` rule shapes the plumbing: an export is a download and
 * an import is a file picker, `fetch()` is never used, and Node-side tools read and write
 * the same file directly.
 */

/** The self-describing envelope a recorded run is exported as. */
export interface ReplayFile {
	format: 'mwg-replay';
	version: 1;
	/** the framework build the run was recorded against - `version` from the package root */
	framework: string;
	/** the game's own identity, so a replay of one game is refused by another by name */
	game: string;
	/** the run's seed, so a seeded environment walks the same trajectory on import */
	seed?: number;
	/** wall-clock moment of export, for a file listing; playback never reads it */
	recordedAt?: number;
	events: readonly ReplayEvent[];
}

/** What `exportReplayFile` stamps into the envelope beside the recording itself. */
export interface ReplayFileMeta {
	framework: string;
	game: string;
	seed?: number;
	recordedAt?: number;
}

function checkIdentity(kind: 'game' | 'framework', value: unknown): string {
	if (typeof value !== 'string' || !value.length) throw new TypeError(`a replay file needs a non-empty ${kind}`);
	return value;
}

function checkSeed(seed: unknown): number {
	const value = seed as number;
	if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
		throw new RangeError('a replay seed must be uint32');
	return value;
}

/**
 * Wraps a recording in the versioned, self-describing envelope, as a JSON string ready to
 * save as a file. The events are validated and copied, so the exported file cannot drift
 * with a recording that keeps running.
 *
 * @example
 * ```ts
 * import { exportReplayFile, Recorder, Signal, version } from '@datamoc/mw_games';
 *
 * declare const recorder: Recorder;
 * const file = exportReplayFile(recorder.toJSON(), {
 * 	framework: version,
 * 	game: 'my-game',
 * 	recordedAt: Date.now(),
 * });
 * ```
 */
export function exportReplayFile(events: readonly ReplayEvent[], meta: ReplayFileMeta): string {
	const framework = checkIdentity('framework', meta.framework);
	const game = checkIdentity('game', meta.game);
	const file: ReplayFile = {
		format: 'mwg-replay',
		version: 1,
		framework,
		game,
		events: parseReplayEvents(events),
	};
	if (meta.seed !== undefined) file.seed = checkSeed(meta.seed);
	if (meta.recordedAt !== undefined) {
		if (typeof meta.recordedAt !== 'number' || !Number.isFinite(meta.recordedAt))
			throw new TypeError('recordedAt must be a finite number');
		file.recordedAt = meta.recordedAt;
	}
	return JSON.stringify(file);
}

/**
 * Parses and checks a replay file, refusing by name anything that is not this game on this
 * framework: a replay from another build does not fail somewhere mid-playback, it is
 * rejected at the door with what it actually carries.
 *
 * @example
 * ```ts
 * import { importReplayFile, version } from '@datamoc/mw_games';
 *
 * declare const json: string; // read from a file, see readReplayFile
 * const file = importReplayFile(json, { framework: version, game: 'my-game' });
 * console.log(file.events.length, file.seed);
 * ```
 */
export function importReplayFile(json: string, expect: { framework: string; game: string }): ReplayFile {
	const parsed = parseInbound(json, { label: 'replay file' }) as Partial<ReplayFile>;
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
		throw new Error('a replay file must be a JSON object');
	if (parsed.format !== 'mwg-replay')
		throw new Error(`not a replay file: expected format "mwg-replay", found ${JSON.stringify(parsed.format)}`);
	if (parsed.version !== 1)
		throw new Error(`replay file version ${JSON.stringify(parsed.version)} is not supported (this build reads 1)`);
	if (parsed.game !== expect.game)
		throw new Error(
			`a replay of ${JSON.stringify(parsed.game)} cannot be imported into ${JSON.stringify(expect.game)}`,
		);
	if (parsed.framework !== expect.framework)
		throw new Error(
			`a replay recorded against mwg ${JSON.stringify(parsed.framework)} cannot be imported into ${JSON.stringify(expect.framework)}`,
		);
	const events = parseReplayEvents(parsed.events);
	return {
		format: 'mwg-replay',
		version: 1,
		framework: parsed.framework,
		game: parsed.game,
		...(parsed.seed === undefined ? {} : { seed: checkSeed(parsed.seed) }),
		...(parsed.recordedAt === undefined ? {} : { recordedAt: parsed.recordedAt }),
		events,
	};
}

/** The kept newest recording, as `LastRun.load` hands it back. */
export interface LastRunData {
	version: 1;
	seed?: number;
	events: readonly ReplayEvent[];
}

export interface LastRunOptions {
	/** namespaces the kept recording, so two games sharing an origin never collide */
	namespace: string;
	storage?: SaveStorage;
	/** once a recording holds more events than this, the newest are kept; default 10000 */
	maxEvents?: number;
}

/**
 * The newest recording, always kept, bounded: what "watch the previous run" reads. One
 * recording deep by design (the newest replaces the older one), stored through the same
 * `SaveStorage` a `SaveSystem` slot uses, so it survives a reload and lands in the
 * in-memory fallback under `file://`.
 *
 * @example
 * ```ts
 * import { LastRun, Recorder } from '@datamoc/mw_games/core';
 *
 * declare const recorder: Recorder;
 * const last = new LastRun({ namespace: 'my-game' });
 * last.keep(recorder.toJSON());
 * const kept = last.load();
 * console.log(kept ? kept.events.length : 'no run yet');
 * ```
 */
export class LastRun {
	private readonly store: StoredValue<LastRunData | null>;
	private readonly maxEvents: number;

	constructor(options: LastRunOptions) {
		if (typeof options.namespace !== 'string' || !options.namespace.length)
			throw new TypeError('a last-run store needs a non-empty namespace');
		const maxEvents = options.maxEvents ?? 10000;
		if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 1_000_000)
			throw new RangeError('last-run maxEvents must be in 1..1000000');
		this.maxEvents = maxEvents;
		this.store = new StoredValue<LastRunData | null>(
			options.storage ?? defaultStorage(),
			`mwg-last-run:${options.namespace}`,
		);
	}

	/** Keeps the newest recording, replacing any previous one. An oversized tail keeps its newest events. */
	keep(events: readonly ReplayEvent[], seed?: number): void {
		let all = parseReplayEvents(events);
		if (all.length > this.maxEvents) all = all.slice(all.length - this.maxEvents);
		const data: LastRunData =
			seed === undefined ? { version: 1, events: all } : { version: 1, seed: checkSeed(seed), events: all };
		checkSize(JSON.stringify(data));
		this.store.write(data);
	}

	/** The kept recording, or null when no run has been kept yet. Corrupt storage throws by name. */
	load(): LastRunData | null {
		const data = this.store.read(null);
		if (data === null) return null;
		if (data?.version !== 1)
			throw new Error('the kept last-run recording is not version 1; clear() it and record again');
		return {
			version: 1,
			...(data.seed === undefined ? {} : { seed: checkSeed(data.seed) }),
			events: parseReplayEvents(data.events),
		};
	}

	/** Drops the kept recording. */
	clear(): void {
		this.store.remove();
	}
}

/** A run in progress, checkpointed: the partial recording beside the game state it captured. */
export interface RunCheckpoint<T> {
	version: 1;
	/** the frame count the recording reached, so playback resumes mid-run */
	frame: number;
	events: readonly ReplayEvent[];
	state: T;
}

/**
 * Pairs a live recording with the state a save already captured, as plain data a
 * `SaveSystem` slot stores: restoring the slot restores the run, not just the numbers.
 *
 * @example
 * ```ts
 * import { runCheckpoint, Recorder } from '@datamoc/mw_games/core';
 *
 * declare const recorder: Recorder;
 * const checkpoint = runCheckpoint(recorder, { depth: 4, hp: 9 });
 * console.log(checkpoint.frame, checkpoint.state.hp);
 * ```
 */
export function runCheckpoint<T>(recorder: Recorder, state: T): RunCheckpoint<T> {
	return { version: 1, frame: recorder.frame, events: recorder.toJSON(), state };
}

/**
 * The playback half of a restored checkpoint: a `Player` that continues the recording from
 * the checkpoint's frame, skipping the events before it, so the run resumes rather than
 * restarting. The restored state and the resumed playback travel together: the game loads
 * the slot, then starts this player against the same frame signal it records on.
 *
 * @example
 * ```ts
 * import { resumeRunPlayer, runCheckpoint, Recorder, Signal } from '@datamoc/mw_games/core';
 *
 * declare const recorder: Recorder;
 * const checkpoint = runCheckpoint(recorder, { hp: 9 });
 * const onFrame = new Signal<number>();
 * const player = resumeRunPlayer(checkpoint, (action) => console.log(action), onFrame);
 * player.stop();
 * ```
 */
export function resumeRunPlayer<T>(
	checkpoint: RunCheckpoint<T>,
	dispatch: (action: string) => void,
	frames: Signal<number>,
): Player {
	if (typeof checkpoint !== 'object' || checkpoint === null || checkpoint.version !== 1)
		throw new Error('a run checkpoint must be { version: 1, frame, events, state }');
	return new Player(parseReplayEvents(checkpoint.events), dispatch, frames, { fromFrame: checkpoint.frame });
}

/**
 * Saves a replay file locally: a Blob download, which works from a `file://` page with no
 * server and no `fetch()`. Nothing is read back; the file is the export.
 *
 * @example
 * ```ts
 * import { downloadReplayFile, exportReplayFile } from '@datamoc/mw_games/core';
 *
 * const json = exportReplayFile([], { framework: '0.26.1', game: 'my-game' });
 * downloadReplayFile(json, 'run-1.mwgreplay.json');
 * ```
 */
export function downloadReplayFile(json: string, filename: string): void {
	if (typeof document === 'undefined') throw new Error('downloadReplayFile needs a browser document');
	const anchor = document.createElement('a');
	anchor.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
}

/**
 * Reads a chosen file (or any Blob) as text, headless and in the browser alike: the
 * browser half of an import is the picker, this is the rest. `Blob.text()` needs no DOM,
 * so the same function reads a `node:fs` buffer's Blob in a tool.
 *
 * @example
 * ```ts
 * import { importReplayFile, readReplayFile, version } from '@datamoc/mw_games';
 *
 * declare const file: Blob; // from pickReplayFile, or a Node-side Blob
 * const json = await readReplayFile(file);
 * const replay = importReplayFile(json, { framework: version, game: 'my-game' });
 * ```
 */
export async function readReplayFile(file: Blob): Promise<string> {
	return await file.text();
}

/**
 * Opens a file picker for one replay file, resolving null when the player cancels. The
 * `file://` import path: no `fetch()`, no drag-drop wiring to get wrong.
 *
 * @example
 * ```ts
 * import { importReplayFile, pickReplayFile, readReplayFile, version } from '@datamoc/mw_games';
 *
 * const picked = await pickReplayFile();
 * if (picked) {
 * 	const replay = importReplayFile(await readReplayFile(picked), { framework: version, game: 'my-game' });
 * }
 * ```
 */
export async function pickReplayFile(accept = '.json'): Promise<Blob | null> {
	if (typeof document === 'undefined') throw new Error('pickReplayFile needs a browser document');
	return await new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = accept;
		input.style.display = 'none';
		let settled = false;
		const done = (value: Blob | null) => {
			if (settled) return;
			settled = true;
			input.remove();
			resolve(value);
		};
		input.addEventListener('change', () => done(input.files?.[0] ?? null));
		input.addEventListener('cancel', () => done(null));
		document.body.appendChild(input);
		input.click();
	});
}

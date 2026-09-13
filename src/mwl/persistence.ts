import { assertNoForbiddenKeys } from '../core/Sanitize.ts';
import type { ActionJournalEntry } from '../core/ActionJournal.ts';
import type { MwlWorld } from './runtime.ts';

export interface MwlSaveEnvelope {
	readonly format: 'mwl-save';
	readonly version: number;
	readonly world: MwlWorld;
	/** Explicitly declared game-owned hook state, keyed by hook id. */
	readonly hookState?: Readonly<Record<string, unknown>>;
	/** Public runtime operations and trace batches, when saved by `MwlRuntime`. */
	readonly journal?: readonly ActionJournalEntry<unknown, unknown>[];
}
export type MwlMigration = (world: MwlWorld) => MwlWorld;
export interface MwlPersistenceOptions {
	readonly version: number;
	readonly migrations?: Readonly<Record<number, MwlMigration>>;
}

/**
 * Serialises a world to a versioned JSON snapshot.
 *
 * @example
 * ```ts
 * import { createWorld, encodeSave } from '@datamoc/mw_games/mwl';
 *
 * const snapshot = encodeSave(createWorld(), { version: 1 });
 * console.log(typeof snapshot); // 'string'
 * ```
 */
export function encodeSave(
	world: MwlWorld,
	options: MwlPersistenceOptions,
	hookState?: Readonly<Record<string, unknown>>,
	journal?: readonly ActionJournalEntry<unknown, unknown>[],
): string {
	if (!Number.isInteger(options.version) || options.version < 1)
		throw new Error('MWL save version must be a positive integer');
	const envelope: MwlSaveEnvelope = {
		format: 'mwl-save',
		version: options.version,
		world,
		...(hookState === undefined ? {} : { hookState: cloneJsonObject(hookState) }),
		...(journal === undefined ? {} : { journal: cloneJsonArray(journal) }),
	};
	return JSON.stringify(envelope);
}

/**
 * Restores a world from a snapshot, applying migrations up to `options.version`.
 *
 * @example
 * ```ts
 * import { createWorld, decodeSave, encodeSave } from '@datamoc/mw_games/mwl';
 *
 * const snapshot = encodeSave(createWorld(), { version: 1 });
 * console.log(decodeSave(snapshot, { version: 1 }).turn); // 1
 * ```
 */
export function decodeSave(snapshot: string, options: MwlPersistenceOptions): MwlWorld {
	return decodeSaveEnvelope(snapshot, options).world;
}

/**
 * Restores the complete save envelope, including declared game-owned hook state.
 *
 * @example
 * ```ts
 * import { createWorld, decodeSaveEnvelope, encodeSave } from '@datamoc/mw_games/mwl';
 *
 * const save = encodeSave(createWorld(), { version: 1 }, { 'item-effect:demo': { charges: 1 } });
 * console.log(decodeSaveEnvelope(save, { version: 1 }).hookState?.['item-effect:demo']);
 * ```
 */
export function decodeSaveEnvelope(snapshot: string, options: MwlPersistenceOptions): MwlSaveEnvelope {
	const value: unknown = JSON.parse(snapshot);
	const envelope = isEnvelope(value) ? value : { format: 'mwl-save' as const, version: 1, world: value as MwlWorld };
	if (envelope.version > options.version)
		throw new Error(`MWL save version ${envelope.version} is newer than supported version ${options.version}`);
	let world = validateWorld(envelope.world);
	for (let version = envelope.version; version < options.version; version++) {
		const migration = options.migrations?.[version + 1];
		if (!migration) throw new Error(`missing MWL save migration to version ${version + 1}`);
		world = validateWorld(migration(world));
	}
	return {
		format: 'mwl-save',
		version: options.version,
		world,
		...(envelope.hookState === undefined ? {} : { hookState: cloneJsonObject(envelope.hookState) }),
		...(envelope.journal === undefined ? {} : { journal: cloneJsonArray(envelope.journal) }),
	};
}

/**
 * Checks a decoded value really is a world, and throws by name when it is not. Also rejects a
 * `__proto__`/`constructor`/`prototype` key anywhere in the value (`assertNoForbiddenKeys`):
 * `MwlRuntime.restore` merges this result into its own world with `Object.assign`, which would
 * otherwise let such a key substitute the target's prototype instead of merely setting a value.
 *
 * @example
 * ```ts
 * import { createWorld, validateWorld } from '@datamoc/mw_games/mwl';
 *
 * console.log(validateWorld(createWorld()).turn); // 1
 * ```
 */
export function validateWorld(value: unknown): MwlWorld {
	if (!value || typeof value !== 'object') throw new Error('invalid MWL saved world');
	assertNoForbiddenKeys(value);
	const world = value as Partial<MwlWorld>;
	if (
		!Number.isInteger(world.turn) ||
		!world.variables ||
		typeof world.variables !== 'object' ||
		!world.units ||
		typeof world.units !== 'object'
	)
		throw new Error('invalid MWL saved world: turn, variables, and units are required');
	if (world.status !== undefined && !['playing', 'won', 'lost'].includes(world.status))
		throw new Error('invalid MWL saved world status');
	return structuredClone(world as MwlWorld);
}

function isEnvelope(value: unknown): value is MwlSaveEnvelope {
	return (
		!!value &&
		typeof value === 'object' &&
		(value as { format?: unknown }).format === 'mwl-save' &&
		typeof (value as { version?: unknown }).version === 'number' &&
		'world' in value
	);
}

function cloneJsonObject(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid MWL hook state');
	assertNoForbiddenKeys(value);
	let encoded: string;
	try {
		encoded = JSON.stringify(value);
	} catch {
		throw new Error('MWL hook state must be JSON-serialisable');
	}
	const decoded: unknown = JSON.parse(encoded);
	if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('invalid MWL hook state');
	return decoded as Readonly<Record<string, unknown>>;
}

function cloneJsonArray(value: readonly unknown[]): readonly ActionJournalEntry<unknown, unknown>[] {
	try {
		const encoded = JSON.stringify(value);
		const decoded: unknown = JSON.parse(encoded);
		if (!Array.isArray(decoded)) throw new Error();
		assertNoForbiddenKeys(decoded);
		return decoded as readonly ActionJournalEntry<unknown, unknown>[];
	} catch {
		throw new Error('MWL journal must be JSON-serialisable');
	}
}

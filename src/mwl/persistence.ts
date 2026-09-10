import type { MwlWorld } from './runtime.ts';

export interface MwlSaveEnvelope {
	readonly format: 'mwl-save';
	readonly version: number;
	readonly world: MwlWorld;
}
export type MwlMigration = (world: MwlWorld) => MwlWorld;
export interface MwlPersistenceOptions {
	readonly version: number;
	readonly migrations?: Readonly<Record<number, MwlMigration>>;
}

export function encodeSave(world: MwlWorld, options: MwlPersistenceOptions): string {
	if (!Number.isInteger(options.version) || options.version < 1) throw new Error('MWL save version must be a positive integer');
	return JSON.stringify({ format: 'mwl-save', version: options.version, world } satisfies MwlSaveEnvelope);
}

export function decodeSave(snapshot: string, options: MwlPersistenceOptions): MwlWorld {
	const value: unknown = JSON.parse(snapshot);
	const envelope = isEnvelope(value) ? value : { format: 'mwl-save' as const, version: 1, world: value as MwlWorld };
	if (envelope.version > options.version) throw new Error(`MWL save version ${envelope.version} is newer than supported version ${options.version}`);
	let world = validateWorld(envelope.world);
	for (let version = envelope.version; version < options.version; version++) {
		const migration = options.migrations?.[version + 1];
		if (!migration) throw new Error(`missing MWL save migration to version ${version + 1}`);
		world = validateWorld(migration(world));
	}
	return world;
}

export function validateWorld(value: unknown): MwlWorld {
	if (!value || typeof value !== 'object') throw new Error('invalid MWL saved world');
	const world = value as Partial<MwlWorld>;
	if (!Number.isInteger(world.turn) || !world.variables || typeof world.variables !== 'object' || !world.units || typeof world.units !== 'object')
		throw new Error('invalid MWL saved world: turn, variables, and units are required');
	if (world.status !== undefined && !['playing', 'won', 'lost'].includes(world.status)) throw new Error('invalid MWL saved world status');
	return structuredClone(world as MwlWorld);
}

function isEnvelope(value: unknown): value is MwlSaveEnvelope {
	return !!value && typeof value === 'object' && (value as { format?: unknown }).format === 'mwl-save' && typeof (value as { version?: unknown }).version === 'number' && 'world' in value;
}

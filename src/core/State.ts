import { cloneData } from './Clone.ts';

/** A JSON-compatible value owned by a game or one of its framework extensions. */
export type StateValue = null | boolean | number | string | StateValue[] | { readonly [key: string]: StateValue };

export interface StateExtension<T extends StateValue = StateValue> {
	/** stable key written into a snapshot */
	readonly id: string;
	/** capture the extension's complete serializable state */
	readonly capture: () => T;
	/** restore a previously captured state atomically */
	readonly restore: (state: T) => void;
	/** Current schema version for this extension, independent of other save data. */
	readonly version?: number;
	/** Migrations are keyed by destination version and run in order. */
	readonly migrations?: Readonly<Record<number, (state: StateValue) => T>>;
	/** Optional reset used when a save predates this extension. */
	readonly reset?: () => void;
	/** Optional cleanup when the extension is deliberately absent from a restored save. */
	readonly remove?: () => void;
}

export interface StateSnapshot {
	readonly extensions: Readonly<Record<string, StateValue>>;
	readonly versions?: Readonly<Record<string, number>>;
}

export interface StateRestoreDiagnostic {
	readonly extension: string;
	readonly from: number;
	readonly to: number;
	readonly status: 'migrated' | 'unchanged' | 'reset' | 'removed';
}

export interface CanonicalStateSnapshot<State extends StateValue = StateValue> {
	readonly version: number;
	readonly state: State;
	readonly extensions: Readonly<Record<string, StateValue>>;
	readonly extensionVersions?: Readonly<Record<string, number>>;
}

/**
 * A single JSON-safe source of truth for a game's logical state. The root value belongs to the
 * game, while framework or game subsystems register independent versioned extensions beside it.
 * Reads and writes clone values, so a renderer cannot mutate authoritative state accidentally.
 *
 * @example
 * ```ts
 * import { CanonicalState } from '@datamoc/mw_games/core';
 *
 * const state = new CanonicalState({ turn: 1, gold: 10 });
 * state.update((current) => ({ ...current, gold: current.gold - 3 }));
 * const save = state.snapshot();
 * state.restore(save);
 * ```
 */
export class CanonicalState<State extends StateValue> {
	private _state: State;
	private readonly version: number;
	private readonly migrations: Readonly<Record<number, (state: StateValue) => State>>;
	readonly extensions: StateRegistry;

	constructor(
		initial: State,
		options: {
			readonly version?: number;
			readonly migrations?: Readonly<Record<number, (state: StateValue) => State>>;
			readonly extensions?: StateRegistry;
		} = {},
	) {
		this._state = cloneData(initial, 'initial state');
		this.version = options.version ?? 1;
		this.migrations = options.migrations ?? {};
		this.extensions = options.extensions ?? new StateRegistry();
	}

	get state(): State {
		return structuredClone(this._state);
	}

	set(next: State): void {
		this._state = cloneData(next, 'state');
	}

	update(transform: (current: State) => State): State {
		const next = transform(this.state);
		this.set(next);
		return this.state;
	}

	snapshot(): CanonicalStateSnapshot<State> {
		const extensions = this.extensions.snapshot();
		return {
			version: this.version,
			state: this.state,
			extensions: extensions.extensions,
			extensionVersions: extensions.versions,
		};
	}

	restore(
		snapshot: CanonicalStateSnapshot<State>,
		options: Parameters<StateRegistry['restore']>[1] = {},
	): readonly StateRestoreDiagnostic[] {
		if (!Number.isSafeInteger(snapshot.version) || snapshot.version < 1)
			throw new Error('canonical state snapshot version must be a positive integer');
		if (snapshot.version > this.version)
			throw new Error(`canonical state snapshot version ${snapshot.version} is newer than ${this.version}`);
		const before = this.snapshot();
		try {
			let state: StateValue = cloneData(snapshot.state, 'snapshot.state');
			for (let version = snapshot.version; version < this.version; version++) {
				const migration = this.migrations[version + 1];
				if (!migration) throw new Error(`missing canonical state migration to version ${version + 1}`);
				state = migration(state);
			}
			this._state = cloneData(state as State, 'migrated state');
			return this.extensions.restore(
				{ extensions: snapshot.extensions, versions: snapshot.extensionVersions },
				options,
			);
		} catch (error) {
			this._state = structuredClone(before.state);
			this.extensions.restore(
				{ extensions: before.extensions, versions: before.extensionVersions },
				{ missing: 'keep' },
			);
			throw error;
		}
	}

	transaction<T>(work: (state: CanonicalState<State>) => T): T {
		const before = this.snapshot();
		try {
			return work(this);
		} catch (error) {
			this.restore(before);
			throw error;
		}
	}
}

/**
 * Coordinates game-owned save state without knowing its schema.
 *
 * Each extension owns its data and restore logic. `transaction` captures all registered
 * extensions before running work and restores that snapshot if work throws, which prevents
 * half-applied saves when one subsystem rejects an update.
 *
 * @example
 * ```ts
 * import { StateRegistry } from '@datamoc/mw_games/core';
 *
 * let inventory = { gold: 10 };
 * const state = new StateRegistry();
 * state.register({ id: 'inventory', capture: () => inventory, restore: (saved) => { inventory = saved; } });
 * state.transaction(() => { inventory.gold -= 5; });
 * const save = state.snapshot();
 * ```
 */
export class StateRegistry {
	private extensions = new Map<string, StateExtension>();

	register<T extends StateValue>(extension: StateExtension<T>): () => void {
		if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(extension.id))
			throw new Error(`invalid state extension id: ${extension.id}`);
		if (this.extensions.has(extension.id)) throw new Error(`state extension already registered: ${extension.id}`);
		this.extensions.set(extension.id, {
			id: extension.id,
			capture: () => extension.capture(),
			restore: (state) => extension.restore(state as T),
			version: extension.version ?? 1,
			migrations: extension.migrations,
			reset: extension.reset,
			remove: extension.remove,
		});
		return () => this.extensions.delete(extension.id);
	}

	snapshot(): StateSnapshot {
		const extensions: Record<string, StateValue> = {};
		for (const [id, extension] of this.extensions)
			extensions[id] = cloneData(extension.capture(), `extension ${id}`);
		const versions: Record<string, number> = {};
		for (const [id, extension] of this.extensions) versions[id] = extension.version ?? 1;
		return { extensions, versions };
	}

	restore(
		snapshot: StateSnapshot,
		options: {
			readonly missing?: 'keep' | 'reset' | 'remove';
			readonly onDiagnostic?: (diagnostic: StateRestoreDiagnostic) => void;
		} = {},
	): readonly StateRestoreDiagnostic[] {
		const before = this.snapshot();
		const diagnostics: StateRestoreDiagnostic[] = [];
		try {
			for (const [id, extension] of this.extensions) {
				if (!(id in snapshot.extensions)) {
					if (options.missing === 'reset') {
						if (extension.reset) extension.reset();
						diagnostics.push({ extension: id, from: 0, to: extension.version ?? 1, status: 'reset' });
					} else if (options.missing === 'remove') {
						if (extension.remove) extension.remove();
						diagnostics.push({ extension: id, from: 0, to: extension.version ?? 1, status: 'removed' });
					}
					continue;
				}
				const from = snapshot.versions?.[id] ?? 1;
				const to = extension.version ?? 1;
				let state = cloneData(snapshot.extensions[id], `snapshot.extensions.${id}`);
				for (let version = from; version < to; version++) {
					const migration = extension.migrations?.[version + 1];
					if (!migration) throw new Error(`missing state migration for ${id} to version ${version + 1}`);
					state = migration(state);
				}
				extension.restore(cloneData(state, `migrated extension ${id}`));
				diagnostics.push({ extension: id, from, to, status: from === to ? 'unchanged' : 'migrated' });
			}
		} catch (error) {
			for (const [id, extension] of this.extensions)
				if (id in before.extensions) extension.restore(structuredClone(before.extensions[id]) as StateValue);
			throw error;
		}
		for (const diagnostic of diagnostics) options.onDiagnostic?.(diagnostic);
		return diagnostics;
	}

	transaction<T>(work: () => T): T {
		const before = this.snapshot();
		try {
			return work();
		} catch (error) {
			this.restore(before);
			throw error;
		}
	}
}

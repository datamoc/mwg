interface MapDefinition<M> {
	create: MapFactory<M>;
	persistent: boolean;
}

/**
 * Builds a map. It receives the spawn point passed to `enter`/`enterAsync`, so a scene can
 * capture where it starts as it is built instead of being told afterwards. A factory may
 * return the map directly or a promise of one - the promise path needs `enterAsync`.
 */
export type MapFactory<M> = (spawn?: string) => M | Promise<M>;

/**
 * Many maps in one world, joined by transitions.
 *
 * `mwg` deliberately does not say what a "map" is here - a `TileMap` and a `Level`, a
 * `DialogueStage`, or a game's own bundle of the two. What `World` owns is the part that is
 * the same regardless: a map is created from a factory registered by id, and by default kept
 * alive for as long as the world exists - so a monster left half-dead in a dungeon room is
 * still half-dead when the player wanders back in, without the game writing that by hand.
 *
 * That default is ADOM's shape, not every game's. A game with SPD's shape - most floors are
 * never revisited, and the ones that are should feel new - marks those maps
 * `persistent: false` at `define` time: `enter` then rebuilds them from the factory every
 * time, discarding whatever was there. Both live in the same `World`; a game's overworld and
 * towns can stay persistent while its dungeon floors do not.
 *
 * @example
 * ```ts
 * import { World } from '@datamoc/mwg/world';
 *
 * interface MyMap { name: string }
 *
 * const world = new World<MyMap>();
 * world.define('town', () => ({ name: 'town' })); // persistent by default
 * world.define('dungeon1', () => ({ name: 'dungeon1' }), { persistent: false });
 *
 * world.enter('town');
 * console.log(world.current?.name); // 'town'
 * ```
 */
export class World<M> {
	private factories = new Map<string, MapDefinition<M>>();
	private loaded = new Map<string, M>();
	//one in-flight creation per persistent id, so two concurrent enters do not build twice
	private pending = new Map<string, Promise<M>>();
	//the most recent enter request; an older async creation still resolves, but does not
	//take over the current map from a newer one
	private enterToken = 0;

	private currentId: string | null = null;
	private lastSpawn: string | undefined;

	/**
	 * Registers how to build a map.
	 *
	 * @param create builds the map, receiving the spawn point this entry asked for. It may
	 * return a promise; only `enterAsync` can wait for one
	 * @param persistent false rebuilds the map from `create` on every `enter`, discarding
	 * its previous state - the default, true, keeps it alive for as long as `World` does
	 */
	define(id: string, create: MapFactory<M>, options: { persistent?: boolean } = {}): void {
		this.factories.set(id, { create, persistent: options.persistent ?? true });
	}

	/**
	 * Switches to a map - creating it on first entry, reusing it on every one after unless
	 * it was defined `persistent: false`, in which case every entry rebuilds it.
	 *
	 * A factory that returns a promise is refused here rather than resolving to a
	 * `Promise` masquerading as a map: use `enterAsync` for that map.
	 *
	 * @param spawn a named entry point within the target map; it is passed to the factory
	 * and read back from `World.spawn`, and `World` does not know what a position is,
	 * only that one was asked for
	 */
	enter(id: string, spawn?: string): M {
		const definition = this.require(id);

		let map = this.loaded.get(id);
		if (map === undefined || !definition.persistent) {
			const built = definition.create(spawn);
			if (isThenable<M>(built)) {
				throw new Error(`map "${id}" is built asynchronously - use enterAsync`);
			}
			map = built;
			this.loaded.set(id, map);
		}

		this.activate(id, spawn);
		return map;
	}

	/**
	 * `enter` for a map whose factory loads something first (an atlas, a decoded level): the
	 * current map stays current while the next one builds, and only the last request to
	 * arrive takes over - an older creation that resolves late does not pull the player back
	 * to a map they have already left.
	 *
	 * Two concurrent entries to the same persistent map share one creation, so a double
	 * click on a door does not build the room twice.
	 */
	async enterAsync(id: string, spawn?: string): Promise<M> {
		const definition = this.require(id);
		const token = ++this.enterToken;

		const loaded = this.loaded.get(id);
		if (loaded !== undefined && definition.persistent) {
			this.activate(id, spawn, token);
			return loaded;
		}

		const pending = definition.persistent ? this.pending.get(id) : undefined;
		if (pending) {
			const map = await pending;
			this.activate(id, spawn, token);
			return map;
		}

		const creating = Promise.resolve(definition.create(spawn)).then((map) => {
			if (definition.persistent) this.loaded.set(id, map);
			this.pending.delete(id);
			this.activate(id, spawn, token);
			return map;
		});
		if (definition.persistent) this.pending.set(id, creating);
		creating.catch(() => this.pending.delete(id));
		return creating;
	}

	/** marks a map as current, unless a newer `enterAsync` has already been asked for */
	private activate(id: string, spawn: string | undefined, token?: number): void {
		if (token !== undefined && token !== this.enterToken) return;
		this.currentId = id;
		this.lastSpawn = spawn;
	}

	private require(id: string): MapDefinition<M> {
		const definition = this.factories.get(id);
		if (!definition) throw new Error(`no such map: "${id}"`);
		return definition;
	}

	get current(): M | null {
		return this.currentId ? (this.loaded.get(this.currentId) ?? null) : null;
	}

	get currentMapId(): string | null {
		return this.currentId;
	}

	/** the spawn point passed to the most recent `enter`, for the game to place its player by */
	get spawn(): string | undefined {
		return this.lastSpawn;
	}

	/** true once a map has been created, whether or not it is the current one */
	isLoaded(id: string): boolean {
		return this.loaded.has(id);
	}

	/** true if this id was `define`d with `persistent: false` */
	isPersistent(id: string): boolean {
		return this.factories.get(id)?.persistent ?? true;
	}

	/** drops a map's live state, so its factory builds a fresh one next time it is entered */
	unload(id: string): void {
		if (id === this.currentId) throw new Error(`cannot unload the current map: "${id}"`);
		this.loaded.delete(id);
	}
}

function isThenable<T>(value: unknown): value is Promise<T> {
	return typeof (value as { then?: unknown } | null)?.then === 'function';
}

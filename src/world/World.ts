interface MapDefinition<M> {
	create: () => M;
	persistent: boolean;
}

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
 */
export class World<M> {
	private factories = new Map<string, MapDefinition<M>>();
	private loaded = new Map<string, M>();

	private currentId: string | null = null;
	private lastSpawn: string | undefined;

	/**
	 * Registers how to build a map.
	 *
	 * @param persistent false rebuilds the map from `create` on every `enter`, discarding
	 * its previous state - the default, true, keeps it alive for as long as `World` does
	 */
	define(id: string, create: () => M, options: { persistent?: boolean } = {}): void {
		this.factories.set(id, { create, persistent: options.persistent ?? true });
	}

	/**
	 * Switches to a map - creating it on first entry, reusing it on every one after unless
	 * it was defined `persistent: false`, in which case every entry rebuilds it.
	 *
	 * @param spawn a named entry point within the target map; the game reads it back from
	 * `World.spawn` to know where to place the player - `World` does not know what a
	 * position is, only that one was asked for
	 */
	enter(id: string, spawn?: string): M {
		const definition = this.factories.get(id);
		if (!definition) throw new Error(`no such map: "${id}"`);

		let map = this.loaded.get(id);
		if (!map || !definition.persistent) {
			map = definition.create();
			this.loaded.set(id, map);
		}

		this.currentId = id;
		this.lastSpawn = spawn;
		return map;
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

/**
 * Many maps in one world, joined by transitions, each persisting after it's left.
 *
 * `mwg` deliberately does not say what a "map" is here - a `TileMap` and a `Level`, a
 * `DialogueStage`, or a game's own bundle of the two. What `World` owns is the part that is
 * the same regardless: a map is created once, from a factory registered by id, and kept
 * alive for as long as the world exists - so a monster left half-dead in a dungeon room is
 * still half-dead when the player wanders back in, without the game writing that by hand.
 */
export class World<M> {
	private factories = new Map<string, () => M>();
	private loaded = new Map<string, M>();

	private currentId: string | null = null;
	private lastSpawn: string | undefined;

	/** registers how to build a map the first time it is entered */
	define(id: string, create: () => M): void {
		this.factories.set(id, create);
	}

	/**
	 * Switches to a map, creating it on first entry and reusing it on every one after.
	 *
	 * @param spawn a named entry point within the target map; the game reads it back from
	 * `World.spawn` to know where to place the player - `World` does not know what a
	 * position is, only that one was asked for
	 */
	enter(id: string, spawn?: string): M {
		let map = this.loaded.get(id);
		if (!map) {
			const factory = this.factories.get(id);
			if (!factory) throw new Error(`no such map: "${id}"`);
			map = factory();
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

	/** drops a map's live state, so its factory builds a fresh one next time it is entered */
	unload(id: string): void {
		if (id === this.currentId) throw new Error(`cannot unload the current map: "${id}"`);
		this.loaded.delete(id);
	}
}

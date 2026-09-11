/**
 * A logical identity for a live object, so events, saves, AI targets and buffs can name a
 * creature or item without holding the object itself - a sprite can be swapped, a save can
 * be reloaded into fresh objects, but the id names the same thing across both.
 *
 * @example
 * ```ts
 * import { EntityRegistry, type EntityId } from '@datamoc/mw_games/core';
 *
 * interface Monster { name: string }
 *
 * const monsters = new EntityRegistry<Monster>();
 * const rat: EntityId = monsters.add({ name: 'rat' });
 *
 * console.log(monsters.get(rat)?.name); // 'rat'
 * console.log(monsters.idOf(monsters.get(rat)!)); // same id back - the reverse lookup a
 * // game passes as `SimulationRuntime`'s or `Scheduler`'s `actorId`
 * ```
 */
export type EntityId = string;

/**
 * Assigns and looks up stable ids for live objects.
 *
 * Deliberately not an ECS: it holds no components and imposes no shape on `T` beyond being
 * an object. A game that needs one still owns its own entity type; this only solves the
 * "how do I name it" problem `roguelike.Scheduler.toJSON`/`simulation.SimulationRuntime.
 * snapshot` already need an answer to.
 */
export class EntityRegistry<T extends object> {
	private entities = new Map<EntityId, T>();
	private ids = new Map<T, EntityId>();
	private sequence = 0;

	/** registers an entity, using a caller-supplied stable id when provided */
	add(entity: T, requestedId?: EntityId): EntityId {
		const existing = this.ids.get(entity);
		if (existing !== undefined) {
			if (requestedId !== undefined && requestedId !== existing)
				throw new Error(`entity already has id ${existing}`);
			return existing;
		}

		let id = requestedId;
		if (id !== undefined) {
			if (id.length === 0) throw new Error('entity id must not be empty');
			if (this.entities.has(id)) throw new Error(`entity id already exists: ${id}`);
		} else {
			do id = `e${this.sequence++}`;
			while (this.entities.has(id));
		}
		this.entities.set(id, entity);
		this.ids.set(entity, id);
		return id;
	}

	get(id: EntityId): T | undefined {
		return this.entities.get(id);
	}

	/** the reverse lookup - what a game passes as another API's `actorId`/`id` callback */
	idOf(entity: T): EntityId | undefined {
		return this.ids.get(entity);
	}

	has(id: EntityId): boolean {
		return this.entities.has(id);
	}

	remove(id: EntityId): boolean {
		const entity = this.entities.get(id);
		if (entity === undefined) return false;

		this.entities.delete(id);
		this.ids.delete(entity);
		return true;
	}

	get size(): number {
		return this.entities.size;
	}
}

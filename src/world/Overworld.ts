/**
 * A named point on a map that leads somewhere else - a town gate, a cave mouth, a dungeon
 * entrance on the overworld. This is the shared floor `mwg/rpg`'s tile events (item pages,
 * triggers) will sit on top of later; on its own it is just the lookup, by position or by
 * name, that turns "the player stepped here" into "which map, and which spawn, is next".
 */
export interface Location {
	id: string;
	x: number;
	y: number;

	/** the map id this location leads to */
	leadsTo: string;

	/** the spawn point to enter that map at, passed straight to `World.enter` */
	spawn?: string;
}

export class Overworld {
	private locations = new Map<string, Location>();

	add(location: Location): void {
		this.locations.set(location.id, location);
	}

	remove(id: string): void {
		this.locations.delete(id);
	}

	get(id: string): Location | undefined {
		return this.locations.get(id);
	}

	/** the location at these exact coordinates, if any - for "the player stepped onto it" */
	at(x: number, y: number): Location | undefined {
		for (const location of this.locations.values()) {
			if (location.x === x && location.y === y) return location;
		}
		return undefined;
	}

	get all(): readonly Location[] {
		return [...this.locations.values()];
	}
}

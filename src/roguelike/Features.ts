/**
 * A generated cell wearing a named behaviour: a sign, a well, a plant, a statue, a chasm
 * edge, a trap - anything a regional generator places that the player later looks at or
 * steps on. `mwg` supplies the four rule slots every one of those shares (inspect it without
 * triggering it, interact with it, run the consequence that follows, and decide whether it
 * persists), never what any specific kind actually does - that stays the game's own
 * definition, supplied fresh each load the way `QuestLog`'s quest definitions already are.
 */
export interface CellFeatureDef<TContext = unknown> {
	/** looking at or searching the cell, without triggering anything */
	inspect?(cell: number, ctx: TContext): void;

	/** stepping on or using the cell; returning false refuses the interaction before any consequence runs */
	interact?(cell: number, ctx: TContext): boolean | void;

	/** runs once `interact` did not refuse it - the actual effect: damage, an item, a reveal */
	consequence?(cell: number, ctx: TContext): void;

	/** false removes the feature immediately after its consequence runs once; default true (repeatable) */
	persistent?: boolean;
}

/**
 * @example
 * ```ts
 * import { FeatureLayer } from '@datamoc/mw_games/roguelike';
 *
 * const features = new FeatureLayer<{ hp: number }>();
 * features.define('trap', {
 *   interact: () => true,
 *   consequence: (_cell, ctx) => { ctx.hp -= 5; },
 *   persistent: false, // sprung once, then gone
 * });
 *
 * features.place(42, 'trap');
 * const hero = { hp: 20 };
 * features.interact(42, hero); // hero.hp is now 15, and the trap is gone
 * ```
 */
export class FeatureLayer<TContext = unknown> {
	private defs = new Map<string, CellFeatureDef<TContext>>();
	private placed = new Map<number, string>();

	/** registers what a named kind does; call again to replace it, e.g. after loading a save */
	define(kind: string, def: CellFeatureDef<TContext>): void {
		this.defs.set(kind, def);
	}

	/** places a defined kind onto a cell, replacing whatever was there */
	place(cell: number, kind: string): void {
		if (!this.defs.has(kind)) throw new Error(`FeatureLayer.place: no definition for kind "${kind}"`);
		this.placed.set(cell, kind);
	}

	has(cell: number): boolean {
		return this.placed.has(cell);
	}

	kindAt(cell: number): string | undefined {
		return this.placed.get(cell);
	}

	remove(cell: number): void {
		this.placed.delete(cell);
	}

	/** looking at or searching the cell; a no-op on a cell with no feature or no `inspect` rule */
	inspect(cell: number, ctx: TContext): void {
		const def = this.defAt(cell);
		def?.inspect?.(cell, ctx);
	}

	/** using or stepping on the cell; runs `interact` then, unless refused, `consequence` */
	interact(cell: number, ctx: TContext): void {
		const def = this.defAt(cell);
		if (!def) return;

		const allowed = def.interact ? def.interact(cell, ctx) !== false : true;
		if (!allowed) return;

		def.consequence?.(cell, ctx);
		if (def.persistent === false) this.remove(cell);
	}

	private defAt(cell: number): CellFeatureDef<TContext> | undefined {
		const kind = this.placed.get(cell);
		return kind === undefined ? undefined : this.defs.get(kind);
	}

	/** only which cell has which kind is save data; definitions are supplied fresh on load */
	toJSON(): { cells: [number, string][] } {
		return { cells: [...this.placed.entries()] };
	}

	static fromJSON<T>(
		defs: ReadonlyMap<string, CellFeatureDef<T>>,
		data: { cells: [number, string][] },
	): FeatureLayer<T> {
		const layer = new FeatureLayer<T>();
		for (const [kind, def] of defs) layer.define(kind, def);
		for (const [cell, kind] of data.cells) layer.place(cell, kind);
		return layer;
	}
}

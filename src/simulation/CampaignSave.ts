import { SaveSystem, type SaveMeta, type SaveSystemOptions } from '../core/Save.ts';
import type { StateValue } from '../core/State.ts';
import type { CampaignSnapshot } from './Campaign.ts';
import type { SimulationSnapshot } from './Runtime.ts';

/**
 * Everything one campaign save holds, as plain JSON: which level the campaign is on and what
 * it carries, the scenario/world state, and the turn-level simulation. The `world` payload is
 * opaque here on purpose - an `mwl.MwlWorld`, a `roguelike.Level`, a game's own scenario
 * object - because this is a container, the same way `SaveSystem` is.
 */
export interface CampaignSaveState<CampaignState extends StateValue, Result extends StateValue, World, TurnState> {
	readonly campaign: CampaignSnapshot<CampaignState, Result>;
	readonly world: World;
	readonly simulation: SimulationSnapshot<TurnState> | null;
}

/** The live pieces to capture: anything with the snapshot method, so no class import is forced. */
export interface CampaignSaveParts<CampaignState extends StateValue, Result extends StateValue, World, TurnState> {
	readonly campaign: { snapshot(): CampaignSnapshot<CampaignState, Result> };
	readonly world: World;
	readonly simulation?: { snapshot(): SimulationSnapshot<TurnState> } | null;
}

/**
 * One save slot for a whole campaign, over `core.SaveSystem`. `SaveSystem` deliberately owns
 * one state value and `mwl`'s persistence owns one world, so neither saves a campaign's level
 * sequence, its world and its turn together; this is the composition, not a second save
 * format. Versioning, migrations, previews, the storage fallback and slot listing are all
 * `SaveSystem`'s, unchanged.
 *
 * Capturing takes each piece's own `snapshot()`, so the pieces stay responsible for what
 * resuming them means: `Campaign.restore` and `SimulationRuntime.restore` read their halves
 * back, and the game reads its own world.
 *
 * @example
 * ```ts
 * import { CampaignSave } from '@datamoc/mw_games/simulation';
 *
 * const saves = new CampaignSave<{ gold: number }, never, unknown, { hp: number }>({
 *   namespace: 'my-campaign',
 *   version: 1,
 * });
 *
 * declare const campaign: { snapshot(): never };
 * declare const simulation: { snapshot(): never };
 * saves.save('slot1', { campaign, world: { terrain: '...' }, simulation }, 'Chapter 2');
 *
 * const loaded = saves.load('slot1');
 * // loaded.campaign -> Campaign.restore(...); loaded.world -> the game's own; loaded.simulation -> SimulationRuntime.restore(...)
 * ```
 */
export class CampaignSave<CampaignState extends StateValue, Result extends StateValue, World, TurnState> {
	private readonly saves: SaveSystem<CampaignSaveState<CampaignState, Result, World, TurnState>>;

	constructor(options: SaveSystemOptions) {
		this.saves = new SaveSystem<CampaignSaveState<CampaignState, Result, World, TurnState>>(options);
	}

	/** Writes one slot: the campaign, the world and the simulation captured together. */
	save(slot: string, parts: CampaignSaveParts<CampaignState, Result, World, TurnState>, preview?: unknown): void {
		this.saves.save(
			slot,
			{
				campaign: parts.campaign.snapshot(),
				world: parts.world,
				simulation: parts.simulation ? parts.simulation.snapshot() : null,
			},
			preview,
		);
	}

	/** Reads one slot back as plain state, already migrated to the current version. */
	load(slot: string): CampaignSaveState<CampaignState, Result, World, TurnState> | null {
		return this.saves.load(slot)?.state ?? null;
	}

	/** Every slot with a save, and its metadata, for a save-select screen. */
	list(): Array<{ slot: string; meta: SaveMeta }> {
		return this.saves.list();
	}

	delete(slot: string): void {
		this.saves.delete(slot);
	}
}

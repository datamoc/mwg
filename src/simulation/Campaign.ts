import type { StateValue } from '../core/State.ts';

export type CampaignOutcome = 'completed' | 'failed' | 'abandoned';

export interface CampaignLevel<State extends StateValue, Result extends StateValue = StateValue> {
	readonly id: string;
	readonly run: (state: State, context: { readonly levelId: string }) => CampaignLevelResult<State, Result>;
}

export interface CampaignLevelResult<State extends StateValue, Result extends StateValue = StateValue> {
	readonly outcome: CampaignOutcome;
	readonly state: State;
	readonly result?: Result;
	readonly next?: string | null;
	readonly reminders?: readonly string[];
}

export interface CampaignSnapshot<State extends StateValue, Result extends StateValue = StateValue> {
	readonly currentLevel: string | null;
	readonly state: State;
	readonly reminders: readonly string[];
	readonly results: Readonly<Record<string, Result>>;
}

/**
 * Game-neutral level sequencing and carry-over state. A campaign adapter supplies the
 * actual level runner and decides what a level result means; MWG only preserves order,
 * transitions, reminders and serialisable state.
 *
 * @example
 * ```ts
 * import { Campaign } from '@datamoc/mw_games/simulation';
 * const campaign = new Campaign({
 *   levels: [{ id: 'intro', run: (state) => ({ outcome: 'completed', state, next: null }) }],
 *   start: 'intro', state: { gold: 0 },
 * });
 * campaign.completeCurrent({ outcome: 'completed', state: { gold: 10 }, next: null });
 * ```
 */
export class Campaign<State extends StateValue, Result extends StateValue = StateValue> {
	private readonly levels: ReadonlyMap<string, CampaignLevel<State, Result>>;
	private _currentLevel: string | null;
	private _state: State;
	private _reminders: string[] = [];
	private _results: Record<string, Result> = {};

	constructor(options: {
		readonly levels: readonly CampaignLevel<State, Result>[];
		readonly start: string;
		readonly state: State;
	}) {
		this.levels = new Map(options.levels.map((level) => [level.id, level]));
		if (this.levels.size !== options.levels.length) throw new Error('campaign level ids must be unique');
		if (!this.levels.has(options.start)) throw new Error(`unknown campaign start level: ${options.start}`);
		this._currentLevel = options.start;
		this._state = structuredClone(options.state);
	}

	get currentLevel(): string | null {
		return this._currentLevel;
	}
	get state(): State {
		return structuredClone(this._state);
	}
	get reminders(): readonly string[] {
		return [...this._reminders];
	}
	get results(): Readonly<Record<string, Result>> {
		return structuredClone(this._results);
	}

	/** Runs the current level and applies its carry-over state and transition. */
	playCurrent(): CampaignLevelResult<State, Result> {
		if (!this._currentLevel) throw new Error('campaign has no current level');
		const level = this.levels.get(this._currentLevel)!;
		return this.completeCurrent(level.run(this.state, { levelId: level.id }));
	}

	completeCurrent(result: CampaignLevelResult<State, Result>): CampaignLevelResult<State, Result> {
		if (!this._currentLevel) throw new Error('campaign has no current level');
		const completedId = this._currentLevel;
		this._state = structuredClone(result.state);
		if (result.result !== undefined) this._results[completedId] = structuredClone(result.result);
		this._reminders = [...(result.reminders ?? [])];
		if (result.outcome !== 'completed') this._currentLevel = null;
		else if (result.next === undefined)
			throw new Error(`campaign level ${completedId} did not choose a next level`);
		else {
			if (result.next !== null && !this.levels.has(result.next))
				throw new Error(`unknown campaign transition: ${completedId} -> ${result.next}`);
			this._currentLevel = result.next;
		}
		return { ...result, state: this.state };
	}

	snapshot(): CampaignSnapshot<State, Result> {
		return {
			currentLevel: this._currentLevel,
			state: this.state,
			reminders: this.reminders,
			results: this.results,
		};
	}

	static restore<State extends StateValue, Result extends StateValue = StateValue>(
		snapshot: CampaignSnapshot<State, Result>,
		options: { readonly levels: readonly CampaignLevel<State, Result>[] },
	): Campaign<State, Result> {
		const start = snapshot.currentLevel ?? options.levels[0]?.id;
		if (!start) throw new Error('campaign restore requires at least one level');
		const campaign = new Campaign({ levels: options.levels, start, state: snapshot.state });
		campaign._currentLevel = snapshot.currentLevel;
		campaign._reminders = [...snapshot.reminders];
		campaign._results = structuredClone(snapshot.results);
		return campaign;
	}
}

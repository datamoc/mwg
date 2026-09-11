import type { StateValue } from '../core/State.ts';
import type { CampaignLevel, CampaignLevelResult } from '../simulation/Campaign.ts';
import type { MwlCampaignDefinition, MwlScenarioLink } from './content.ts';

/** What playing one scenario means, which only the game can say. */
export type MwlScenarioRunner<State extends StateValue, Result extends StateValue = StateValue> = (
	scenario: MwlScenarioLink,
	state: State,
	context: { readonly levelId: string },
) => CampaignLevelResult<State, Result>;

/** A campaign's chain, shaped for `simulation.Campaign`: where it opens, and one level per scenario. */
export interface MwlCampaignChain<State extends StateValue, Result extends StateValue = StateValue> {
	readonly start: string;
	readonly levels: readonly CampaignLevel<State, Result>[];
}

/**
 * Points a `[campaign]` at `simulation.Campaign`: the order comes out of the content, the playing
 * stays the game's.
 *
 * `first_scenario` opens the campaign, and the first declared scenario opens it when the attribute
 * is not set. Each scenario's `next_scenario` is where it goes when it is won, and a scenario that
 * ends the chain leaves it: the campaign finishes. A scenario that decides for itself keeps its
 * decision, because a result carrying `next` is passed through untouched - which is exactly what a
 * runtime `[endlevel]` does when it overrides the authored chain.
 *
 * Malformed chains throw by name rather than being guessed at: no scenarios, the same id twice, or
 * a `first_scenario` naming something the campaign does not have.
 *
 * @example
 * ```ts
 * import { campaignChain } from '@datamoc/mw_games/mwl';
 * import { Campaign } from '@datamoc/mw_games/simulation';
 *
 * const definition = {
 *   id: 'prologue',
 *   firstScenario: 'opening',
 *   scenarios: [{ id: 'opening', nextScenario: 'siege' }, { id: 'siege' }],
 * };
 *
 * const chain = campaignChain(definition, {
 *   run: (scenario, state) => ({ outcome: 'completed', state, result: scenario.id }),
 * });
 *
 * const campaign = new Campaign({ levels: chain.levels, start: chain.start, state: { gold: 100 } });
 * campaign.playCurrent();
 * console.log(campaign.currentLevel); // 'siege'
 * campaign.playCurrent();
 * console.log(campaign.currentLevel); // null - the chain is done
 * ```
 */
export function campaignChain<State extends StateValue, Result extends StateValue = StateValue>(
	definition: MwlCampaignDefinition,
	options: { readonly run: MwlScenarioRunner<State, Result> },
): MwlCampaignChain<State, Result> {
	const scenarios = definition.scenarios;
	if (scenarios.length === 0) throw new Error(`campaign ${definition.id} declares no scenarios`);

	const known = new Set(scenarios.map((scenario) => scenario.id));
	if (known.size !== scenarios.length) throw new Error(`campaign ${definition.id} declares a scenario twice`);

	const start = definition.firstScenario || scenarios[0].id;
	if (!known.has(start)) throw new Error(`campaign ${definition.id} starts on an unknown scenario: ${start}`);

	return {
		start,
		levels: scenarios.map((scenario) => ({
			id: scenario.id,
			run: (state, context) => {
				const result = options.run(scenario, state, context);
				//the authored chain answers "where next" unless the scenario answered for itself
				return result.next === undefined ? { ...result, next: scenario.nextScenario ?? null } : result;
			},
		})),
	};
}

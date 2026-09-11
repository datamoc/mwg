import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/mwl/compiler.ts';
import { contentCatalog } from '../src/mwl/content.ts';
import { campaignChain } from '../src/mwl/campaign.ts';
import { Campaign } from '../src/simulation/Campaign.ts';

/**
 * A campaign is a chain of scenarios, and the chain is content: `[campaign]` says where it opens
 * and each `[scenario]` says where it goes next. What playing one scenario *means* stays the game's,
 * so these tests hand `campaignChain` a runner that just records what it was asked to run and which
 * state it was handed - which is also how the carry-over between scenarios is checked.
 */

const definitions = (source: string) => contentCatalog(compile(source)).campaigns;

test('a campaign chain plays in the order the content declares', () => {
	const [definition] = definitions(`[game]
[campaign]
id=prologue
first_scenario=opening
[scenario]
id=opening
next_scenario=siege
[/scenario]
[scenario]
id=siege
[/scenario]
[/campaign]
[/game]`);

	assert.deepEqual(definition.scenarios, [
		{ id: 'opening', nextScenario: 'siege' },
		{ id: 'siege', nextScenario: undefined },
	]);
	assert.equal(definition.firstScenario, 'opening');

	const played: string[] = [];
	const chain = campaignChain(definition, {
		run: (scenario, state) => {
			played.push(scenario.id);
			return { outcome: 'completed', state };
		},
	});
	const campaign = new Campaign({ levels: chain.levels, start: chain.start, state: { gold: 0 } });

	assert.equal(campaign.currentLevel, 'opening');
	campaign.playCurrent();
	assert.equal(campaign.currentLevel, 'siege', 'the authored next_scenario is where it goes');
	campaign.playCurrent();
	assert.equal(campaign.currentLevel, null, 'and a scenario with no next one ends the campaign');
	assert.deepEqual(played, ['opening', 'siege']);
});

test('a scenario that decides for itself overrides the authored chain', () => {
	// this is what a runtime `[endlevel]` with its own `next_scenario` does: the content said siege,
	// the scenario says intercept
	const [definition] = definitions(`[game]
[campaign]
id=override
first_scenario=opening
[scenario]
id=opening
next_scenario=siege
[/scenario]
[scenario]
id=siege
[/scenario]
[scenario]
id=intercept
[/scenario]
[/campaign]
[/game]`);

	const chain = campaignChain(definition, {
		run: (scenario, state) =>
			scenario.id === 'opening'
				? { outcome: 'completed', state, next: 'intercept' }
				: { outcome: 'completed', state },
	});
	const campaign = new Campaign({ levels: chain.levels, start: chain.start, state: {} });

	campaign.playCurrent();
	assert.equal(campaign.currentLevel, 'intercept', 'the scenario spoke, so the content did not');
});

test('a campaign with no first_scenario opens on the first scenario it declares', () => {
	const [definition] = definitions(`[game]
[campaign]
id=prologue
[scenario]
id=later
[/scenario]
[scenario]
id=earlier
[/scenario]
[/campaign]
[/game]`);

	const chain = campaignChain(definition, {
		run: (_scenario, state) => ({ outcome: 'completed', state }),
	});

	assert.equal(chain.start, 'later', 'declaration order, not alphabetical');
});

test('an empty next_scenario ends the campaign as surely as a missing one', () => {
	const [definition] = definitions(`[game]
[campaign]
id=solo
first_scenario=only
[scenario]
id=only
next_scenario=""
[/scenario]
[/campaign]
[/game]`);

	assert.deepEqual(definition.scenarios, [{ id: 'only', nextScenario: undefined }]);
});

test('a chain that cannot be followed is refused by name, not guessed at', () => {
	const withScenarios = (id: string, body: string) =>
		definitions(`[game]\n[campaign]\nid=${id}\n${body}\n[/campaign]\n[/game]`)[0];
	const runner = {
		run: (_scenario: { id: string }, state: Record<string, never>) => ({ outcome: 'completed' as const, state }),
	};

	assert.throws(() => campaignChain(withScenarios('empty', ''), runner), /campaign empty declares no scenarios/);
	assert.throws(
		() =>
			campaignChain(
				withScenarios('twice', '[scenario]\nid=same\n[/scenario]\n[scenario]\nid=same\n[/scenario]'),
				runner,
			),
		/campaign twice declares a scenario twice/,
	);
	assert.throws(
		() => campaignChain(withScenarios('lost', 'first_scenario=missing\n[scenario]\nid=only\n[/scenario]'), runner),
		/campaign lost starts on an unknown scenario: missing/,
	);
});

test('the carry-over state a scenario hands back is the state the next one is handed', () => {
	const [definition] = definitions(`[game]
[campaign]
id=carry
first_scenario=first
[scenario]
id=first
next_scenario=second
[/scenario]
[scenario]
id=second
[/scenario]
[/campaign]
[/game]`);

	const seen: number[] = [];
	const chain = campaignChain(definition, {
		run: (_scenario, state: { gold: number }) => {
			seen.push(state.gold);
			return { outcome: 'completed', state: { gold: state.gold + 100 } };
		},
	});
	const campaign = new Campaign({ levels: chain.levels, start: chain.start, state: { gold: 50 } });

	campaign.playCurrent();
	campaign.playCurrent();

	assert.deepEqual(seen, [50, 150], 'the second scenario started from the first one s ending gold');
	assert.deepEqual(campaign.state, { gold: 250 });
});

test('a campaign that fails stops where it stopped, and does not chain on', () => {
	const [definition] = definitions(`[game]
[campaign]
id=failed
first_scenario=first
[scenario]
id=first
next_scenario=second
[/scenario]
[scenario]
id=second
[/scenario]
[/campaign]
[/game]`);

	const chain = campaignChain(definition, {
		run: (scenario, state) =>
			scenario.id === 'first' ? { outcome: 'failed', state } : { outcome: 'completed', state },
	});
	const campaign = new Campaign({ levels: chain.levels, start: chain.start, state: {} });

	campaign.playCurrent();
	assert.equal(campaign.currentLevel, null, 'a defeat does not go looking for the next scenario');
});

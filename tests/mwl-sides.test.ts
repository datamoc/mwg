import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/mwl/compiler.ts';
import { MwlRuntime, sideVisionGroups } from '../src/mwl/runtime.ts';

/**
 * The `[side]` surface: the keys Wesnoth's own data writes, kept as it wrote them, and the one of
 * them that has behaviour here - `team_name` with `share_vision`, which is what groups sides for
 * `FactionFog.share`. Values are checked as written rather than normalised, because "what the
 * content said" is what a ported scenario needs to be able to read back.
 */

const side = (attributes: string) => `{ tag: 'side', ${attributes} },`;

const worldOf = (...sides: string[]) =>
	new MwlRuntime(compile(`[{ tag: 'game', children: [${sides.join('\n')}] }]`)).world;

test('the side surface keeps what the content wrote, and nothing it did not', () => {
	const world = worldOf(
		side(`id: 1,
			team_name: 'north',
			user_team_name: _("Northmen"),
			share_vision: 'all',
			village_gold: 2,
			heal: true,
			fog: true,
			shroud: false,
			hidden: true,
			flag: 'flags/north.png'`),
	);

	assert.deepEqual(world.sides['1'], {
		gold: 0,
		income: 0,
		teamName: 'north',
		//the `_(...)` marker is content saying "translate this", and the compiler unwraps it, so what
		//arrives here is the text to translate rather than its syntax
		userTeamName: 'Northmen',
		shareVision: 'all',
		villageGold: 2,
		heal: true,
		fog: true,
		shroud: false,
		hidden: true,
		flag: 'flags/north.png',
	});
});

test('a side that wrote none of it carries none of it', () => {
	assert.deepEqual(Object.keys(worldOf(side('id: 2')).sides['2']), ['gold', 'income']);
});

test('yes and no are the booleans they read as, in either spelling', () => {
	const world = worldOf(side(`id: 1, fog: 'yes', shroud: true, heal: 'no', hidden: false`));
	const only = world.sides['1'];

	assert.deepEqual([only.fog, only.shroud, only.heal, only.hidden], [true, true, false, false]);
});

test('sides sharing a team_name are the group that shares vision', () => {
	const world = worldOf(
		side(`id: 1, team_name: 'north'`),
		side(`id: 2, team_name: 'north'`),
		side(`id: 3, team_name: 'south'`),
	);

	assert.deepEqual(sideVisionGroups(world), [['1', '2']]);
});

test('a side that asked for share_vision=none is not in its team s group', () => {
	const world = worldOf(
		side(`id: 1, team_name: 'north'`),
		side(`id: 2, team_name: 'north', share_vision: 'none'`),
		side(`id: 3, team_name: 'north'`),
	);

	assert.deepEqual(sideVisionGroups(world), [['1', '3']]);
});

test('a side with no team shares with nobody, and a team of one is not a group', () => {
	const world = worldOf(side(`id: 1`), side(`id: 2, team_name: 'lone'`), side(`id: 3, share_vision: 'all'`));

	assert.deepEqual(sideVisionGroups(world), [], 'sharing needs someone to share with');
});

test('every team gets its own group, in the order the sides were written', () => {
	const world = worldOf(
		side(`id: 1, team_name: 'north'`),
		side(`id: 2, team_name: 'south'`),
		side(`id: 3, team_name: 'north'`),
		side(`id: 4, team_name: 'south'`),
	);

	//teams come out in the order their sides are visited, and a side id is a number written as a
	//string, which JavaScript iterates numerically: 1, 2, 3, 4 rather than the order the content
	//wrote them in. Both facts are the behaviour, so both are asserted rather than left implied.
	assert.deepEqual(sideVisionGroups(world), [
		['1', '3'],
		['2', '4'],
	]);
});

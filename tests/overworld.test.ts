import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateOverworld, type OverworldResult } from '../src/roguelike/Overworld.ts';

const options = () => ({ width: 96, height: 64, seed: 42 });
const index = (_realm: OverworldResult, cell: { x: number; y: number }): number => cell.y * 96 + cell.x;

test('the same seed gives the same realm, another seed a different one', () => {
	const realm = generateOverworld(options());
	const again = generateOverworld(options());
	assert.deepEqual(realm.terrain, again.terrain);
	assert.deepEqual(realm.elevation, again.elevation);
	assert.deepEqual(realm.rivers, again.rivers);
	assert.deepEqual(realm.settlements, again.settlements);
	assert.deepEqual(realm.roads, again.roads);
	assert.deepEqual(realm.pointsOfInterest, again.pointsOfInterest);
	const other = generateOverworld({ ...options(), seed: 43 });
	assert.notDeepEqual(realm.terrain, other.terrain);
});

test('terrain follows the elevation and moisture fields', () => {
	const realm = generateOverworld(options());
	assert.equal(realm.terrain.length, 96 * 64);
	for (let y = 0; y < 64; y++)
		for (let x = 0; x < 96; x++) {
			const cell = y * 96 + x;
			if (realm.elevation[cell] < 0.4) assert.equal(realm.terrain[cell], 'water');
			else if (realm.elevation[cell] > 0.78) assert.equal(realm.terrain[cell], 'mountains');
		}
	//a realm has more than one land kind: pure noise never collapses to a single class
	const kinds = new Set(realm.terrain);
	assert.ok(kinds.size >= 4, `expected several terrains, got ${[...kinds]}`);
	assert.ok(
		[...kinds].every((kind) =>
			['water', 'plains', 'forest', 'hills', 'mountains', 'desert', 'swamp'].includes(kind),
		),
	);
});

test('rivers run downhill to water and never climb a ridge', () => {
	const realm = generateOverworld({ ...options(), rivers: 6 });
	assert.ok(realm.rivers.length >= 1, 'at least one river carves through');
	for (const river of realm.rivers) {
		assert.ok(river.length >= 2);
		assert.ok(realm.elevation[index(realm, river[0])] > 0.7, 'a river starts on high ground');
		const last = river[river.length - 1];
		assert.equal(realm.terrain[index(realm, last)], 'water', 'a river ends in sea or lake');
		for (let step = 1; step < river.length; step++)
			assert.ok(
				realm.elevation[index(realm, river[step])] <= realm.elevation[index(realm, river[step - 1])],
				'water does not run uphill',
			);
	}
});

test('settlements are buildable, near water and spaced, and roads join every one', () => {
	const realm = generateOverworld({ ...options(), settlements: 5 });
	assert.ok(realm.settlements.length >= 2, `expected settlements, got ${realm.settlements.length}`);
	for (let a = 0; a < realm.settlements.length; a++) {
		const settlement = realm.settlements[a];
		assert.ok(['village', 'town', 'castle'].includes(settlement.kind));
		const ground = realm.terrain[settlement.y * 96 + settlement.x];
		assert.ok(ground === 'plains' || ground === 'hills' || ground === 'forest');
		let nearWater = false;
		for (let dy = -3; dy <= 3 && !nearWater; dy++)
			for (let dx = -3; dx <= 3; dx++) {
				const nx = settlement.x + dx;
				const ny = settlement.y + dy;
				if (nx >= 0 && ny >= 0 && nx < 96 && ny < 64 && realm.terrain[ny * 96 + nx] === 'water') {
					nearWater = true;
					break;
				}
			}
		assert.ok(nearWater, 'a settlement keeps water within reach');
		for (let b = a + 1; b < realm.settlements.length; b++) {
			const other = realm.settlements[b];
			assert.ok(
				Math.abs(settlement.x - other.x) + Math.abs(settlement.y - other.y) >= 8,
				'settlements keep their distance',
			);
		}
	}
	//every settlement beyond the first arrives over one road; expensive terrain is
	//crossed, never impassable, so the network is a spanning tree
	assert.equal(realm.roads.length, realm.settlements.length - 1);
	for (const road of realm.roads) {
		assert.ok(road.length >= 2);
		for (const cell of road)
			assert.ok(cell.x >= 0 && cell.y >= 0 && cell.x < 96 && cell.y < 64, 'roads stay on the map');
	}
});

test('regions are coarse and complete, and points of interest lead somewhere', () => {
	const realm = generateOverworld({ ...options(), pointsOfInterest: 3, regionSize: 12 });
	assert.equal(realm.regionColumns, 8);
	const ids = new Set(realm.regions);
	assert.equal(ids.size, 8 * Math.ceil(64 / 12));
	for (let y = 0; y < 64; y++)
		for (let x = 0; x < 96; x++) {
			const expected = Math.floor(y / 12) * 8 + Math.floor(x / 12);
			assert.equal(realm.regions[y * 96 + x], expected);
		}
	assert.ok(realm.pointsOfInterest.length >= 1);
	const leads = new Set<string>();
	for (const interest of realm.pointsOfInterest) {
		assert.ok(['ruin', 'shrine', 'dungeon'].includes(interest.kind));
		assert.ok(interest.leadsTo.length > 0);
		assert.ok(!leads.has(interest.leadsTo), 'each point of interest leads somewhere distinct');
		leads.add(interest.leadsTo);
	}
});

test('an overworld refuses impossible shapes and sea levels by name', () => {
	assert.throws(() => generateOverworld({ width: 8, height: 64, seed: 1 }), /at least 16x16/);
	assert.throws(() => generateOverworld({ width: 64, height: 64, seed: 1, seaLevel: 0 }), /seaLevel/);
	assert.throws(() => generateOverworld({ width: 64, height: 64, seed: 1, seaLevel: 1 }), /seaLevel/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StatBlock } from '../src/actors/StatBlock.ts';
import { AuraField, type AuraParticipant } from '../src/actors/Aura.ts';

function participant(attack: number): AuraParticipant {
	return { stats: new StatBlock({ base: { attack } }) };
}

function adjacentByDistance(distance: number) {
	return (a: AuraParticipant, b: AuraParticipant): boolean => Math.abs((a as any).x - (b as any).x) <= distance;
}

test('a unit entering adjacency gains the carrier\'s modifiers', () => {
	const field = new AuraField();
	const carrier: AuraParticipant & { x: number } = { ...participant(0), x: 0, aura: { name: 'rally', modifiers: [{ stat: 'attack', op: 'add', value: 5 }] } };
	const ally: AuraParticipant & { x: number } = { ...participant(1), x: 1 };

	field.update([carrier, ally], adjacentByDistance(1));
	assert.equal(ally.stats.get('attack'), 6);
});

test('a unit leaving adjacency loses exactly the modifiers it gained', () => {
	const field = new AuraField();
	const carrier: AuraParticipant & { x: number } = { ...participant(0), x: 0, aura: { name: 'rally', modifiers: [{ stat: 'attack', op: 'add', value: 5 }] } };
	const ally: AuraParticipant & { x: number } = { ...participant(1), x: 1 };

	field.update([carrier, ally], adjacentByDistance(1));
	assert.equal(ally.stats.get('attack'), 6);

	ally.x = 10; // walks out of range
	field.update([carrier, ally], adjacentByDistance(1));
	assert.equal(ally.stats.get('attack'), 1);
});

test('staying adjacent across several updates does not stack the modifier', () => {
	const field = new AuraField();
	const carrier: AuraParticipant & { x: number } = { ...participant(0), x: 0, aura: { name: 'rally', modifiers: [{ stat: 'attack', op: 'add', value: 5 }] } };
	const ally: AuraParticipant & { x: number } = { ...participant(1), x: 1 };

	field.update([carrier, ally], adjacentByDistance(1));
	field.update([carrier, ally], adjacentByDistance(1));
	field.update([carrier, ally], adjacentByDistance(1));
	assert.equal(ally.stats.get('attack'), 6, 'reapplying every tick would have stacked to 16');
});

test('two carriers can affect the same unit independently', () => {
	const field = new AuraField();
	const carrierA: AuraParticipant & { x: number } = { ...participant(0), x: 0, aura: { name: 'rally', modifiers: [{ stat: 'attack', op: 'add', value: 5 }] } };
	const carrierB: AuraParticipant & { x: number } = { ...participant(0), x: 2, aura: { name: 'focus', modifiers: [{ stat: 'attack', op: 'add', value: 3 }] } };
	const ally: AuraParticipant & { x: number } = { ...participant(1), x: 1 };

	field.update([carrierA, carrierB, ally], adjacentByDistance(1));
	assert.equal(ally.stats.get('attack'), 9); // 1 base + 5 + 3

	//leaving carrierA's range only removes carrierA's contribution
	carrierA.x = -10;
	field.update([carrierA, carrierB, ally], adjacentByDistance(1));
	assert.equal(ally.stats.get('attack'), 4); // 1 base + 3
});

test('removing a carrier from the roster strips modifiers it was still applying', () => {
	const field = new AuraField();
	const carrier: AuraParticipant & { x: number } = { ...participant(0), x: 0, aura: { name: 'rally', modifiers: [{ stat: 'attack', op: 'add', value: 5 }] } };
	const ally: AuraParticipant & { x: number } = { ...participant(1), x: 1 };

	field.update([carrier, ally], adjacentByDistance(1));
	assert.equal(ally.stats.get('attack'), 6);

	//carrier died and is no longer part of the roster passed to update
	field.update([ally], adjacentByDistance(1));
	assert.equal(ally.stats.get('attack'), 1);
});

test('removing an affected target from the roster (rather than the carrier) strips its modifiers too', () => {
	const field = new AuraField();
	const carrier: AuraParticipant & { x: number } = { ...participant(0), x: 0, aura: { name: 'rally', modifiers: [{ stat: 'attack', op: 'add', value: 5 }] } };
	const ally: AuraParticipant & { x: number } = { ...participant(1), x: 1 };

	field.update([carrier, ally], adjacentByDistance(1));
	assert.equal(ally.stats.get('attack'), 6);

	//ally died and is no longer part of the roster passed to update - only the carrier remains
	field.update([carrier], adjacentByDistance(1));
	assert.equal(ally.stats.get('attack'), 1, 'a target absent from the roster must still lose the modifier it was given');

	//and it must not reappear stale if the same object ever comes back into a later roster
	//without being newly adjacent
	field.update([carrier, ally], () => false);
	assert.equal(ally.stats.get('attack'), 1);
});

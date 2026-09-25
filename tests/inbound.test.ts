import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInbound } from '../src/core/Sanitize.ts';
import { SaveSystem } from '../src/core/Save.ts';
import { Collection } from '../src/core/Collection.ts';
import { StoredValue } from '../src/core/StoredValue.ts';
import { LockstepClient } from '../src/core/Multiplayer.ts';
import { FakeSocket, memoryStorage } from '../src/testing/index.ts';

test('parseInbound refuses forbidden keys at any depth, oversize text and control characters', () => {
	assert.deepEqual(parseInbound('{"a":[1,{"b":2}]}'), { a: [1, { b: 2 }] });
	assert.throws(() => parseInbound('{"a":{"__proto__":{"x":1}}}'), /forbidden key "__proto__"/);
	assert.throws(
		() => parseInbound('[{"constructor":1}]', { label: 'feed' }),
		/^Error: feed contains a forbidden key/,
	);
	assert.throws(() => parseInbound('"xxxx"', { maxBytes: 3 }), /exceeds the 3-byte limit/);
	assert.throws(() => parseInbound('{"a":"\u0001"}'), /control character/);
	assert.throws(() => parseInbound('{oops', { label: 'save' }), /^Error: save is not valid JSON/);
	assert.equal(({} as Record<string, unknown>).x, undefined, 'nothing reached Object.prototype');
});

test('SaveSystem.load and list treat a tampered local slot as unusable instead of trusting it', () => {
	const storage = memoryStorage();
	const saves = new SaveSystem<{ gold: number }>({ namespace: 'tamper', version: 1, storage });
	saves.save('good', { gold: 3 });
	storage.write('mwg-save:tamper:proto', '{"meta":{"version":1,"savedAt":1},"state":{"__proto__":{"admin":true}}}');
	storage.write('mwg-save:tamper:shape', '{"state":{"gold":1}}');
	storage.write('mwg-save:tamper:junk', '{not json');
	assert.equal(saves.load('proto'), null);
	assert.equal(saves.load('shape'), null);
	assert.equal(saves.load('junk'), null);
	assert.deepEqual(saves.load('good')?.state, { gold: 3 });
	assert.deepEqual(
		saves.list().map((entry) => entry.slot),
		['good'],
	);
});

test('SaveSystem.importSlot names what is wrong and writes nothing', () => {
	const storage = memoryStorage();
	const saves = new SaveSystem<{ gold: number }>({ namespace: 'import', version: 1, storage });
	assert.throws(() => saves.importSlot('a', 'null'), /is not save data/);
	assert.throws(() => saves.importSlot('a', '{"meta":{"version":"1","savedAt":1},"state":{}}'), /meta\.version/);
	assert.throws(
		() => saves.importSlot('a', '{"meta":{"version":1,"savedAt":1},"state":{"constructor":{}}}'),
		/forbidden key "constructor"/,
	);
	assert.deepEqual(storage.keys(), []);
});

test('Collection and StoredValue refuse a forbidden key with a label naming the key', () => {
	const storage = memoryStorage();
	storage.write('mwg-db:default:quests:q1', '{"id":"q1","__proto__":{}}');
	assert.throws(
		() => new Collection('quests', { storage }).get('q1'),
		/record "mwg-db:default:quests:q1" contains a forbidden key/,
	);
	storage.write('stats', '{"prototype":1}');
	assert.throws(() => new StoredValue(storage, 'stats').read({}), /stored value "stats" contains a forbidden key/);
});

test('LockstepClient drops malformed server messages through onProtocolError instead of throwing', () => {
	const socket = new FakeSocket();
	const client = new LockstepClient({ url: 'wss://example.test', create: () => socket, maxMessageBytes: 200 });
	const errors: string[] = [];
	const ticks: number[] = [];
	client.onProtocolError.add(({ reason }) => void errors.push(reason));
	client.onTick.add(({ tick }) => void ticks.push(tick));
	client.connect();
	const send = (data: string) => socket.receiveRaw(data);
	send('{not json');
	send(JSON.stringify({ type: 'tick', tick: 'one', inputs: {} }));
	send(JSON.stringify({ type: 'tick', tick: 1, inputs: {}, checksums: { a: 'x' } }));
	send(JSON.stringify({ type: 'welcome' }));
	send(
		JSON.stringify({ type: 'tick', tick: 1, inputs: { __proto__: 1 } }).replace(
			'"inputs":{}',
			'"inputs":{"__proto__":1}',
		),
	);
	send(JSON.stringify({ type: 'surprise' }));
	send(JSON.stringify({ type: 'tick', tick: 2, inputs: { pad: 'x'.repeat(300) } }));
	send(JSON.stringify({ type: 'tick', tick: 3, inputs: { a: 'left' } }));
	assert.equal(errors.length, 7);
	assert.match(errors[0], /not valid JSON/);
	assert.match(errors[5], /unknown lockstep message type "surprise"/);
	assert.match(errors[6], /exceeds the 200-byte limit/);
	assert.deepEqual(ticks, [3]);
});

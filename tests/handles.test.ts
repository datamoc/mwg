import assert from 'node:assert/strict';
import test from 'node:test';
import { createHandles } from '../src/core/Handles.ts';

test('put stores a value and get resolves its id', () => {
	const handles = createHandles<string>();
	const id = handles.put('rng');
	assert.equal(handles.get(id), 'rng');
	assert.equal(handles.size, 1);
});

test('ids start at 1 and are never reused after a drop', () => {
	const handles = createHandles<string>();
	const first = handles.put('a');
	handles.drop(first);
	const second = handles.put('b');
	assert.notEqual(second, first);
	assert.equal(handles.get(second), 'b');
});

test('get on an unknown or dropped id throws', () => {
	const handles = createHandles<string>();
	assert.throws(() => handles.get(999), /unknown handle 999/);
	const id = handles.put('a');
	handles.drop(id);
	assert.throws(() => handles.get(id), /unknown handle/);
});

test('dropping an unknown id is ignored and clear empties the table', () => {
	const handles = createHandles<string>();
	handles.drop(12345);
	const id = handles.put('a');
	handles.clear();
	assert.equal(handles.size, 0);
	assert.throws(() => handles.get(id), /unknown handle/);
});

test('with leases the id for the body and drops it afterwards', () => {
	const handles = createHandles<() => number>();
	const seen: number[] = [];
	const result = handles.with(
		() => 7,
		(id) => {
			seen.push(id);
			assert.equal(handles.size, 1);
			return handles.get(id)();
		},
	);
	assert.equal(result, 7);
	assert.equal(handles.size, 0);
	assert.throws(() => handles.get(seen[0]), /unknown handle/);
});

test('with drops the lease even when the body throws', () => {
	const handles = createHandles<string>();
	let leased = 0;
	assert.throws(
		() =>
			handles.with('live', (id) => {
				leased = id;
				throw new Error('rule failed');
			}),
		/rule failed/,
	);
	assert.equal(handles.size, 0);
	assert.throws(() => handles.get(leased), /unknown handle/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Logger, type LogEntry } from '../src/core/Log.ts';

function captured(level?: 'debug' | 'info' | 'warn' | 'error') {
	const entries: LogEntry[] = [];
	const log = new Logger('dungeon', { level, sink: (e) => void entries.push(e) });
	return { entries, log };
}

test('entries carry their category, level, message and data', () => {
	const { entries, log } = captured();
	log.info('descended', { depth: 3 });

	assert.equal(entries.length, 1);
	assert.equal(entries[0].category, 'dungeon');
	assert.equal(entries[0].level, 'info');
	assert.equal(entries[0].message, 'descended');
	assert.deepEqual(entries[0].data, { depth: 3 });
	assert.equal(typeof entries[0].time, 'number');
});

test('levels below the filter never reach the sink', () => {
	const { entries, log } = captured('warn');
	log.debug('noise');
	log.info('chat');
	log.warn('attention');
	log.error('failure');

	assert.deepEqual(
		entries.map((e) => e.level),
		['warn', 'error']
	);
});

test('setLevel moves the filter afterwards', () => {
	const { entries, log } = captured('error');
	log.warn('missed');
	log.setLevel('debug');
	log.debug('kept');

	assert.deepEqual(
		entries.map((e) => e.message),
		['kept']
	);
});

test('a logger needs a category', () => {
	assert.throws(() => new Logger(''), /category/);
});

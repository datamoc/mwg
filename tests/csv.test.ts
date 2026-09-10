import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCSV } from '../src/core/Csv.ts';

test('a plain header/row csv parses into an array of string-keyed records', () => {
	const rows = parseCSV('id,name\nblazing,Blazing\nchilling,Chilling');
	assert.deepEqual(rows, [
		{ id: 'blazing', name: 'Blazing' },
		{ id: 'chilling', name: 'Chilling' },
	]);
});

test('an empty cell omits the field entirely, rather than an empty string', () => {
	const rows = parseCSV<{ id: string; description?: string }>('id,description\nblazing,\nchilling,Chills the victim');
	assert.deepEqual(rows[0], { id: 'blazing' });
	assert.equal('description' in rows[0], false);
	assert.deepEqual(rows[1], { id: 'chilling', description: 'Chills the victim' });
});

test('declared columns coerce number, boolean and list types', () => {
	const rows = parseCSV<{ id: string; weight: number; curse: boolean; kinds: string[] }>(
		'id,weight,curse,kinds\nblazing,3,false,melee;bow\nwayward,1,true,',
		{ columns: { weight: 'number', curse: 'boolean', kinds: 'list' } },
	);
	assert.deepEqual(rows[0], { id: 'blazing', weight: 3, curse: false, kinds: ['melee', 'bow'] });
	assert.deepEqual(rows[1], { id: 'wayward', weight: 1, curse: true });
});

test('a map column splits key=value pairs into a plain object', () => {
	const rows = parseCSV<{ id: string; properties: Record<string, string> }>(
		'id,properties\nblazing,str=2;dex=-1\nplain,',
		{ columns: { properties: 'map' } },
	);
	assert.deepEqual(rows[0], { id: 'blazing', properties: { str: '2', dex: '-1' } });
	assert.deepEqual(rows[1], { id: 'plain' });
});

test('a map entry with no delimiter throws with row and column context', () => {
	assert.throws(
		() => parseCSV('id,properties\nblazing,str', { columns: { properties: 'map' } }),
		/row 1, column "properties": "str" has no "=" to split a key from its value/,
	);
});

test('a bad number or boolean cell throws with row and column context', () => {
	assert.throws(
		() => parseCSV('id,weight\nblazing,three', { columns: { weight: 'number' } }),
		/row 1, column "weight": "three" is not a number/,
	);
	assert.throws(
		() => parseCSV('id,curse\nblazing,yes', { columns: { curse: 'boolean' } }),
		/row 1, column "curse": "yes" is not "true" or "false"/,
	);
});

test('a quoted field survives an embedded comma and an escaped quote', () => {
	const rows = parseCSV('id,description\nblazing,"Ignites, then burns for ""3"" turns"');
	assert.equal(rows[0].description, 'Ignites, then burns for "3" turns');
});

test('a quoted field survives an embedded newline', () => {
	const rows = parseCSV('id,description\nblazing,"Line one\nLine two"');
	assert.equal(rows[0].description, 'Line one\nLine two');
});

test('CRLF line endings and a trailing newline do not add a spurious blank row', () => {
	const rows = parseCSV('id,name\r\nblazing,Blazing\r\nchilling,Chilling\r\n');
	assert.equal(rows.length, 2);
});

test('empty source parses to no rows', () => {
	assert.deepEqual(parseCSV(''), []);
});

test('a header with no data rows parses to no rows', () => {
	assert.deepEqual(parseCSV('id,name'), []);
});

test('round-trips a real AffixTable authored as CSV, matching the hand-written object it replaces', () => {
	const csv = `id,trigger,weight,curse,description
blazing,strike,3,,Ignites the victim
vampiric,strike,2,,Heals 1 on a hit
wayward,strike,1,true,Cursed: -3 accuracy`;

	const entries = parseCSV<{ id: string; trigger: string; weight: number; curse?: boolean; description?: string }>(
		csv,
		{ columns: { weight: 'number', curse: 'boolean' } },
	);

	assert.deepEqual(entries, [
		{ id: 'blazing', trigger: 'strike', weight: 3, description: 'Ignites the victim' },
		{ id: 'vampiric', trigger: 'strike', weight: 2, description: 'Heals 1 on a hit' },
		{ id: 'wayward', trigger: 'strike', weight: 1, curse: true, description: 'Cursed: -3 accuracy' },
	]);
});

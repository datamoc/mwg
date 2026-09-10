import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	copyFromBase,
	createEditSession,
	cueKeyFor,
	deleteTargetKey,
	isAudioKey,
	sessionCompleteness,
	sessionKeys,
	sessionRow,
	sessionRows,
	setTargetSound,
	setTargetText,
	swapSession,
	type Catalog,
} from '../src/i18n/index.ts';

const base: Catalog = {
	locale: 'en',
	direction: 'ltr',
	messages: {
		greeting: 'Hello, {name}!',
		farewell: 'Goodbye.',
		gems: { one: '{count} gem', other: '{count} gems' },
		'hit.audio': 'sounds/hit.wav',
	},
};

const target: Catalog = {
	locale: 'fr',
	direction: 'ltr',
	messages: {
		greeting: 'Bonjour, {name}!',
		greeting_extra: 'oops',
		'hit.audio': 'sons/coup.wav',
	},
};

test('sessionKeys unions both catalogs, sorted, skipping audio cues', () => {
	const session = createEditSession(base, target);
	assert.deepEqual(sessionKeys(session), ['farewell', 'gems', 'greeting', 'greeting_extra']);
});

test('isAudioKey matches the cue suffix only', () => {
	assert.equal(isAudioKey('hit.audio'), true);
	assert.equal(isAudioKey('audio'), false);
	assert.equal(isAudioKey('greeting'), false);
});

test('sessionRow reports status and the effective sound cue', () => {
	const session = createEditSession(base, target);
	assert.deepEqual(sessionRow(session, 'greeting'), {
		key: 'greeting',
		baseText: 'Hello, {name}!',
		targetText: 'Bonjour, {name}!',
		status: 'ok',
		sound: undefined,
		soundKey: undefined,
		soundInherited: false,
	});

	const missing = sessionRow(session, 'farewell');
	assert.equal(missing.status, 'missing');
	assert.equal(missing.targetText, '');

	const extra = sessionRow(session, 'greeting_extra');
	assert.equal(extra.status, 'extra');
	assert.equal(extra.baseText, '');

	const plural = sessionRow(session, 'gems');
	assert.equal(plural.baseText, '{count} gems');

	const sounded = sessionRow(session, 'hit');
	assert.equal(sounded.sound, 'sons/coup.wav');
	assert.equal(sounded.soundInherited, false);
});

test('a cue owned by the base alone shows as inherited', () => {
	const bare: Catalog = { locale: 'fr', direction: 'ltr', messages: {} };
	const row = sessionRow(createEditSession(base, bare), 'hit');
	assert.equal(row.sound, 'sounds/hit.wav');
	assert.equal(row.soundInherited, true);
});

test('sessionRows filters missing-only and free-text queries', () => {
	const session = createEditSession(base, target);
	assert.deepEqual(
		sessionRows(session, { missingOnly: true }).map((row) => row.key),
		['farewell', 'gems'],
	);
	assert.deepEqual(sessionRows(session, { query: 'BONJOUR' }).map((row) => row.key), ['greeting']);
	assert.deepEqual(sessionRows(session, { query: 'gem' }).map((row) => row.key), ['gems']);
});

test('setTargetText writes a string and preserves plural shape from JSON', () => {
	let session = createEditSession(base, target);
	session = setTargetText(session, 'farewell', 'Au revoir.');
	assert.equal(session.target.messages.farewell, 'Au revoir.');

	session = setTargetText(session, 'gems', '{"one": "{count} gemme", "other": "{count} gemmes"}');
	assert.deepEqual(session.target.messages.gems, { one: '{count} gemme', other: '{count} gemmes' });

	session = setTargetText(session, 'gems', 'not json');
	assert.equal(session.target.messages.gems, 'not json');
});

test('copyFromBase fills a missing entry with the base value, plural included', () => {
	const session = copyFromBase(createEditSession(base, target), 'gems');
	assert.deepEqual(session.target.messages.gems, { one: '{count} gem', other: '{count} gems' });
	assert.throws(() => copyFromBase(createEditSession(base, target), 'nowhere'), /not a key in the base catalog/);
});

test('deleteTargetKey drops the entry and refuses unknown keys', () => {
	const session = deleteTargetKey(createEditSession(base, target), 'greeting');
	assert.ok(!('greeting' in session.target.messages));
	assert.throws(() => deleteTargetKey(session, 'greeting'), /not a key in the target catalog/);
});

test('setTargetSound sets and clears the cue entry', () => {
	let session = createEditSession(base, target);
	session = setTargetSound(session, 'greeting', 'sons/salut.wav');
	assert.equal(session.target.messages['greeting.audio'], 'sons/salut.wav');

	session = setTargetSound(session, 'greeting', '');
	assert.ok(!('greeting.audio' in session.target.messages));
});

test('a channel key shows its semantic family cue, and setting one writes the family key', () => {
	const semanticBase: Catalog = {
		locale: 'en',
		direction: 'ltr',
		messages: { 'combat.damage.log': 'The {target} takes {amount} damage.', 'combat.damage.audio': 'sounds/hit.wav' },
	};
	const semanticTarget: Catalog = { locale: 'fr', direction: 'ltr', messages: {} };
	const session = createEditSession(semanticBase, semanticTarget);

	const row = sessionRow(session, 'combat.damage.log');
	assert.equal(row.sound, 'sounds/hit.wav');
	assert.equal(row.soundKey, 'combat.damage.audio');
	assert.equal(row.soundInherited, true);

	assert.equal(cueKeyFor(session, 'combat.damage.log'), 'combat.damage.audio');
	assert.equal(cueKeyFor(session, 'greeting'), 'greeting.audio');

	const updated = setTargetSound(session, 'combat.damage.log', 'sons/coup.wav');
	assert.equal(updated.target.messages['combat.damage.audio'], 'sons/coup.wav');
	assert.ok(!('combat.damage.log.audio' in updated.target.messages));
	const updatedRow = sessionRow(updated, 'combat.damage.log');
	assert.equal(updatedRow.sound, 'sons/coup.wav');
	assert.equal(updatedRow.soundInherited, false);
});

test('sessionCompleteness ignores cue keys', () => {
	assert.equal(sessionCompleteness(createEditSession(base, target)), 1 / 3);
	const full: Catalog = {
		locale: 'fr',
		direction: 'ltr',
		messages: { greeting: 'x', farewell: 'x', gems: 'x', greeting_extra: 'x' },
	};
	assert.equal(sessionCompleteness(createEditSession(base, full)), 1);
});

test('swapSession exchanges reference and target', () => {
	const session = swapSession(createEditSession(base, target));
	assert.equal(session.base.locale, 'fr');
	assert.equal(session.target.locale, 'en');
	assert.equal(sessionRow(session, 'farewell').status, 'extra');
});

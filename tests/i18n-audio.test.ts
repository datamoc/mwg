import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	reset,
	setBase,
	setActive,
	t,
	tRaw,
	createCatalogFormatter,
	validateMessageAudio,
	parseSoundMarkers,
	stripSoundMarkers,
	type SemanticMessage,
} from '../src/i18n/index.ts';

const THIN_NBSP = ' ';

test('inline sound markers are removed and keep visible positions', () => {
	const parsed = parseSoundMarkers('Hit! {sound:sounds/hit.wav} Take {amount} damage. {sound:blip.wav}');
	assert.equal(parsed.text, 'Hit!  Take {amount} damage. ');
	assert.deepEqual(parsed.cues, [
		{ path: 'sounds/hit.wav', index: 5 },
		{ path: 'blip.wav', index: 28 },
	]);
	assert.equal(stripSoundMarkers('A {sound:a.wav} B'), 'A  B');
});

test('inline sound markers are not counted as translation placeholders', () => {
	setBase({ locale: 'en', direction: 'ltr', messages: { hit: 'Hit {sound:hit.wav} for {amount}.' } });
	assert.equal(t('hit', { amount: 7 }), 'Hit {sound:hit.wav} for 7.');
	reset();
});

test('French typography preserves inline sound markers', () => {
	setBase({ locale: 'fr', direction: 'ltr', messages: { hit: 'Touché {sound:hit.wav} !' } });
	assert.equal(t('hit'), `Touché {sound:hit.wav}${THIN_NBSP}!`);
	reset();
});

test('the audio channel resolves <type>.audio to its sound path', () => {
	setBase({
		locale: 'en',
		direction: 'ltr',
		messages: {
			'combat.damage.log': 'The {target} takes {amount} damage.',
			'combat.damage.audio': 'sounds/sword-hit.wav',
		},
	});
	const formatter = createCatalogFormatter();
	const message: SemanticMessage = { type: 'combat.damage', params: { target: 'gnoll', amount: 7 } };
	assert.equal(formatter.format(message, 'log'), 'The gnoll takes 7 damage.');
	assert.equal(formatter.format(message, 'audio'), 'sounds/sword-hit.wav');
	reset();
});

test('the audio channel returns an empty string when no cue is declared', () => {
	setBase({ locale: 'en', direction: 'ltr', messages: { 'combat.damage.log': 'Ouch.' } });
	const formatter = createCatalogFormatter();
	assert.equal(formatter.format({ type: 'combat.damage', params: {} }, 'audio'), '');
	reset();
});

test('the audio channel never falls back to a bare type holding a sentence', () => {
	setBase({ locale: 'en', direction: 'ltr', messages: { 'combat.damage': 'combat.damage generic' } });
	const formatter = createCatalogFormatter();
	assert.equal(formatter.format({ type: 'combat.damage', params: {} }, 'audio'), '');
	reset();
});

test('an audio path resolves raw: no typographic spacing, no RTL wrapping', () => {
	setBase({ locale: 'fr', direction: 'ltr', messages: { 'ui.click.audio': 'sounds/hit!.wav' } });
	const formatter = createCatalogFormatter();
	assert.equal(formatter.format({ type: 'ui.click', params: {} }, 'audio'), 'sounds/hit!.wav');
	assert.ok(!formatter.format({ type: 'ui.click', params: {} }, 'audio').includes(THIN_NBSP));
	reset();

	setBase({ locale: 'en', direction: 'ltr', messages: {} });
	setActive({ locale: 'ar', direction: 'rtl', messages: { 'ui.click.audio': 'sounds/click.wav' } });
	const rtlFormatter = createCatalogFormatter();
	assert.equal(rtlFormatter.format({ type: 'ui.click', params: {} }, 'audio'), 'sounds/click.wav');
	reset();
});

test('an audio path still interpolates params', () => {
	setBase({ locale: 'en', direction: 'ltr', messages: { 'step.audio': 'sounds/step-{surface}.wav' } });
	const formatter = createCatalogFormatter();
	assert.equal(formatter.format({ type: 'step', params: { surface: 'stone' } }, 'audio'), 'sounds/step-stone.wav');
	reset();
});

test('tRaw resolves without typographic or RTL decoration, t keeps both', () => {
	setBase({ locale: 'fr', direction: 'ltr', messages: { greeting: 'Vraiment ?' } });
	assert.equal(tRaw('greeting'), 'Vraiment ?');
	assert.equal(t('greeting'), `Vraiment${THIN_NBSP}?`);
	reset();

	setBase({ locale: 'en', direction: 'ltr', messages: {} });
	setActive({ locale: 'ar', direction: 'rtl', messages: { greeting: 'sounds/x.wav' } });
	assert.equal(tRaw('greeting'), 'sounds/x.wav');
	assert.notEqual(t('greeting'), 'sounds/x.wav');
	reset();
});

test('tRaw returns the key itself for a missing key, like t', () => {
	setBase({ locale: 'en', direction: 'ltr', messages: {} });
	assert.equal(tRaw('nowhere'), 'nowhere');
	assert.equal(t('nowhere'), 'nowhere');
	reset();
});

test('validateMessageAudio flags empty and non-string audio entries, nothing else', () => {
	const issues = validateMessageAudio({
		locale: 'en',
		direction: 'ltr',
		messages: {
			'hit.audio': '',
			'loot.audio': { one: 'a.wav', other: 'b.wav' },
			'step.audio': 'sounds/step.wav',
			greeting: '',
		},
	});
	assert.deepEqual(
		issues.map((issue) => [issue.key, issue.kind]),
		[
			['hit.audio', 'empty-audio-path'],
			['loot.audio', 'audio-not-a-path'],
		],
	);
});

test('validateMessageAudio is clean for a catalog with only plain path cues', () => {
	assert.deepEqual(
		validateMessageAudio({
			locale: 'en',
			direction: 'ltr',
			messages: { 'hit.audio': 'sounds/hit.wav', greeting: 'Hello' },
		}),
		[],
	);
});

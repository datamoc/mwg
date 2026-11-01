import assert from 'node:assert/strict';
import test from 'node:test';
import { escapesToMarkup } from '../src/two-d/ui/escape-markup.ts';
import type { EscapeRule } from '../src/two-d/ui/escape-markup.ts';

const RULES: EscapeRule[] = [
	{ code: '\\C', open: "<span color='{argument}'>", close: '</span>', argument: 'color' },
	{ code: '\\FS', open: "<span size='{argument}'>", close: '</span>', argument: 'number' },
	{ code: '\\B', open: '<b>' },
];

const RESOLVE = (rule: EscapeRule, argument: string): string | undefined =>
	rule.code === '\\C' && argument === '3' ? '#c0ffee' : undefined;

test('a colour rule opens and closes around the rest of its line', () => {
	const markup = escapesToMarkup('\\C[#ff0000]Danger ahead\nback to normal', RULES);
	assert.equal(markup, "<span color='#ff0000'>Danger ahead</span>\nback to normal");
});

test('a size rule takes a number argument', () => {
	const markup = escapesToMarkup('\\FS[20]Big news', RULES);
	assert.equal(markup, "<span size='20'>Big news</span>");
});

test('an unknown code stays literal', () => {
	assert.equal(escapesToMarkup('\\Q[1] untouched', RULES), '\\Q[1] untouched');
	assert.equal(escapesToMarkup('\\FS[big] untouched', RULES), '\\FS[big] untouched');
	assert.equal(escapesToMarkup('\\C[3 unterminated', RULES), '\\C[3 unterminated');
});

test('a rule with no close leaves the rest of its line open', () => {
	const markup = escapesToMarkup('plain \\Bbold\nnext line', RULES);
	assert.equal(markup, 'plain <b>bold\nnext line');
	assert.equal(markup.includes('</b>'), false);
});

test('a caller resolve maps an engine argument to markup text', () => {
	const calls: { code: string; argument: string }[] = [];
	const markup = escapesToMarkup('\\C[3]Danger', RULES, {
		resolve: (rule, argument) => {
			calls.push({ code: rule.code, argument });
			return RESOLVE(rule, argument);
		},
	});

	assert.equal(markup, "<span color='#c0ffee'>Danger</span>");
	assert.deepEqual(calls, [{ code: '\\C', argument: '3' }]);
});

test('the {#rrggbb} shape needs no resolve callback', () => {
	//the code consumed the `#`, so the rule writes it back into the open markup
	const rules: EscapeRule[] = [
		{ code: '{#', open: "<span color='#{argument}'>", close: '</span>', argument: 'color' },
	];
	assert.equal(escapesToMarkup('{#ff0000}red', rules), "<span color='#ff0000'>red</span>");
});

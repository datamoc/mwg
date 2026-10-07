import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dispatchComposition, dispatchText, onText } from '../src/core/Input.ts';
import { TextPrompt, type TextPromptOptions } from '../src/two-d/ui/TextPrompt.ts';

/**
 * A modal text field is all wiring: keystrokes in through `onText`, edits and
 * movement through `handleAction`, answers out through `onConfirm`/`onCancel`.
 * These tests drive that wiring headless, with a fake announcer standing in for
 * the DOM the real `screenReader` needs.
 */

//no title and no `place()` anywhere: a Label measures text through a canvas,
//which node --test has no document for
function promptWith(options: Partial<TextPromptOptions> & { onConfirm?: (value: string) => void }) {
	return new TextPrompt({
		width: 320,
		height: 140,
		onConfirm: () => {},
		...options,
	});
}

function announcer() {
	const calls: Array<{ text: string; assertive: boolean }> = [];
	return {
		calls,
		reader: {
			announce(text: string, options: { assertive?: boolean } = {}): void {
				calls.push({ text, assertive: options.assertive ?? false });
			},
		},
	};
}

test('typed text lands in the field, and nothing else sees it', () => {
	const prompt = promptWith({});
	try {
		assert.equal(onText.dispatch('A'), true, 'swallowed, so the game underneath never walks away mid-name');
		dispatchText('bc');
		assert.equal(prompt.value, 'Abc');
		assert.equal(prompt.caretIndex, 3);
	} finally {
		prompt.close();
	}
});

test('a closed prompt leaves text alone', () => {
	const prompt = promptWith({});
	prompt.close();
	assert.equal(onText.dispatch('x'), false, 'nobody home to swallow it');
	assert.equal(prompt.value, '');
});

test('backspace, delete and the arrow keys edit around the caret', () => {
	const prompt = promptWith({});
	try {
		dispatchText('abc');
		assert.equal(prompt.handleAction('left'), true);
		assert.equal(prompt.handleAction('left'), true);
		assert.equal(prompt.caretIndex, 1);
		assert.equal(prompt.handleAction('delete'), true, 'removes b');
		assert.equal(prompt.value, 'ac');
		assert.equal(prompt.handleAction('backspace'), true, 'removes a');
		assert.equal(prompt.value, 'c');
		assert.equal(prompt.caretIndex, 0);
	} finally {
		prompt.close();
	}
});

test('edits at the edges are swallowed no-ops rather than falling through', () => {
	const prompt = promptWith({});
	try {
		assert.equal(prompt.handleAction('backspace'), true, 'nothing before the caret');
		assert.equal(prompt.handleAction('delete'), true, 'nothing after it either');
		assert.equal(prompt.value, '');
		assert.equal(prompt.handleAction('up'), false, 'vertical movement passes through untouched');
	} finally {
		prompt.close();
	}
});

test('confirm delivers the value and closes', () => {
	let confirmed: string | null = null;
	const prompt = promptWith({ onConfirm: (value) => (confirmed = value) });
	dispatchText('Ash');
	assert.equal(prompt.handleAction('confirm'), true);
	assert.equal(confirmed, 'Ash');
	assert.equal(prompt.closed, true);
});

test('a validator keeps the prompt open until the value passes', () => {
	const announced = announcer();
	let confirmed: string | null = null;
	const prompt = promptWith({
		message: 'Name your hero',
		validate: (value) => (value.length < 3 ? 'Give them a longer name.' : null),
		onConfirm: (value) => (confirmed = value),
		announcer: announced.reader,
	});
	try {
		assert.deepEqual(
			announced.calls,
			[{ text: 'Name your hero', assertive: false }],
			'the message is announced politely on open',
		);
		dispatchText('Al');
		prompt.handleAction('confirm');
		assert.equal(confirmed, null, 'too short: no answer yet');
		assert.equal(prompt.closed, false);
		assert.equal(prompt.error, 'Give them a longer name.');
		assert.deepEqual(announced.calls.at(-1), {
			text: 'Give them a longer name.',
			assertive: true,
		});

		dispatchText('i');
		assert.equal(prompt.error, null, 'the next edit drops the stale error');
		prompt.handleAction('confirm');
		assert.equal(confirmed, 'Ali');
		assert.equal(prompt.closed, true);
	} finally {
		prompt.close();
	}
});

test('cancel calls back and closes without confirming', () => {
	let confirmed = false;
	let cancelled = false;
	const prompt = promptWith({ onConfirm: () => (confirmed = true), onCancel: () => (cancelled = true) });
	dispatchText('junk');
	assert.equal(prompt.handleAction('cancel'), true);
	assert.equal(cancelled, true);
	assert.equal(confirmed, false);
	assert.equal(prompt.closed, true);
});

test('cancel with no callback just closes', () => {
	const prompt = promptWith({});
	assert.equal(prompt.handleAction('cancel'), true);
	assert.equal(prompt.closed, true);
});

test('an IME composition previews until it commits', () => {
	const prompt = promptWith({});
	try {
		dispatchComposition({ phase: 'start', text: '' });
		dispatchComposition({ phase: 'update', text: 'に' });
		assert.equal(prompt.value, '', 'in-progress composition is not value yet');
		dispatchComposition({ phase: 'end', text: 'に' });
		assert.equal(prompt.value, 'に', 'commit types through the same path as a key');
	} finally {
		prompt.close();
	}
});

test('announce:false stays silent', () => {
	const announced = announcer();
	const prompt = promptWith({
		message: 'Name your hero',
		validate: () => 'No.',
		announcer: announced.reader,
		announce: false,
	});
	try {
		dispatchText('x');
		prompt.handleAction('confirm');
		assert.equal(announced.calls.length, 0);
	} finally {
		prompt.close();
	}
});

test('maxLength caps what typing can add', () => {
	const prompt = promptWith({ maxLength: 2 });
	try {
		dispatchText('abcd');
		assert.equal(prompt.value, 'ab');
	} finally {
		prompt.close();
	}
});

test('initialValue starts the field with the caret at the end', () => {
	const prompt = promptWith({ initialValue: 'Hi' });
	try {
		assert.equal(prompt.value, 'Hi');
		assert.equal(prompt.caretIndex, 2);
		dispatchText('!');
		assert.equal(prompt.value, 'Hi!');
	} finally {
		prompt.close();
	}
});

test('overlapping prompts: the newest one gets the keystrokes', () => {
	const first = promptWith({});
	const second = promptWith({});
	try {
		dispatchText('x');
		assert.equal(second.value, 'x');
		assert.equal(first.value, '', 'the older prompt never saw it');
	} finally {
		second.close();
		first.close();
	}
});

test('caret blinking ticks without a renderer', () => {
	const prompt = promptWith({});
	try {
		prompt.update(0.6);
		prompt.update(0.6);
		dispatchText('x');
		prompt.update(0.6);
		assert.equal(prompt.value, 'x');
	} finally {
		prompt.close();
	}
});

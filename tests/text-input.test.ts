import { test } from 'node:test';
import assert from 'node:assert/strict';

import { onText, onComposition, textFromKey, dispatchText, dispatchComposition } from '../src/core/Input.ts';
import type { CompositionInput } from '../src/core/Input.ts';

/** a KeyboardEvent reduced to the fields `textFromKey` reads, so no DOM is needed */
function key(
	key: string,
	modifiers: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; isComposing: boolean }> = {},
) {
	return { key, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, ...modifiers };
}

test('a printable key yields its character', () => {
	assert.equal(textFromKey(key('a')), 'a');
	assert.equal(textFromKey(key('A')), 'A');
	assert.equal(textFromKey(key(' ')), ' ');
	assert.equal(textFromKey(key('7')), '7');
	assert.equal(textFromKey(key('é')), 'é');
	assert.equal(textFromKey(key('あ')), 'あ');
});

test('named keys yield no text, so Enter does not type a newline by accident', () => {
	assert.equal(textFromKey(key('Enter')), null);
	assert.equal(textFromKey(key('Backspace')), null);
	assert.equal(textFromKey(key('ArrowLeft')), null);
	assert.equal(textFromKey(key('Escape')), null);
	assert.equal(textFromKey(key('Dead')), null);
	assert.equal(textFromKey(key('Unidentified')), null);
	assert.equal(textFromKey(key('')), null);
});

test('a modifier held means a shortcut, not text', () => {
	assert.equal(textFromKey(key('a', { ctrlKey: true })), null);
	assert.equal(textFromKey(key('a', { metaKey: true })), null);
	assert.equal(textFromKey(key('a', { altKey: true })), null);
	assert.equal(textFromKey(key('a', { ctrlKey: true, metaKey: true, altKey: true })), null);
});

test('a key pressed during an input-method composition is not also reported as text', () => {
	assert.equal(textFromKey(key('a', { isComposing: true })), null);
	assert.equal(textFromKey(key('あ', { isComposing: true })), null);
});

test('dispatchText fires onText for a non-empty string and is a no-op for empty', () => {
	const seen: string[] = [];
	const listener = (text: string) => {
		seen.push(text);
	};
	onText.add(listener);
	try {
		dispatchText('');
		assert.deepEqual(seen, [], 'empty text produces no event');

		dispatchText('h');
		dispatchText('i');
		assert.deepEqual(seen, ['h', 'i']);
	} finally {
		onText.remove(listener);
	}
});

test('a text listener returning true stops the text reaching the next listener', () => {
	const seen: string[] = [];
	const consumer = () => true;
	const later = (text: string) => {
		seen.push(text);
	};
	//stack mode: the most recently added listener is offered the event first
	onText.add(later);
	onText.add(consumer);
	try {
		dispatchText('x');
		assert.deepEqual(seen, [], 'the focused field swallowed it');
	} finally {
		onText.remove(consumer);
		onText.remove(later);
	}
});

test('dispatchComposition carries the phase and the composing text', () => {
	const seen: CompositionInput[] = [];
	const listener = (input: CompositionInput) => {
		seen.push(input);
	};
	onComposition.add(listener);
	try {
		dispatchComposition({ phase: 'start', text: '' });
		dispatchComposition({ phase: 'update', text: 'に' });
		dispatchComposition({ phase: 'end', text: '日本' });
		assert.deepEqual(seen, [
			{ phase: 'start', text: '' },
			{ phase: 'update', text: 'に' },
			{ phase: 'end', text: '日本' },
		]);
	} finally {
		onComposition.remove(listener);
	}
});

test('dispatchComposition copies, so a listener cannot be handed the caller mutable state', () => {
	const source: CompositionInput = { phase: 'update', text: 'a' };
	let received: CompositionInput | null = null;
	const listener = (input: CompositionInput) => {
		received = input;
	};
	onComposition.add(listener);
	try {
		dispatchComposition(source);
		source.text = 'changed';
		source.phase = 'end';
		assert.deepEqual(received, { phase: 'update', text: 'a' });
	} finally {
		onComposition.remove(listener);
	}
});

test('a composition consumer returning true stops later composition listeners', () => {
	let laterCalled = false;
	const consumer = () => true;
	const later = () => {
		laterCalled = true;
	};
	onComposition.add(later);
	onComposition.add(consumer);
	try {
		dispatchComposition({ phase: 'update', text: 'x' });
		assert.equal(laterCalled, false);
	} finally {
		onComposition.remove(consumer);
		onComposition.remove(later);
	}
});

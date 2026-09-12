import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as Input from '../src/core/Input.ts';
import type { Action } from '../src/core/Input.ts';
import { Window } from '../src/two-d/ui/Window.ts';
import { WindowStack } from '../src/two-d/ui/WindowStack.ts';

/**
 * Who a keypress belongs to when a scene and a window stack both listen. `Input.onAction` offers
 * an action to the most recently registered listener first, and the stack registers itself in
 * its constructor - so a scene that registers after building its stack is asked first, and can
 * take a key away from an open window without meaning to. `WindowStack.handleAction` is the
 * window's routing, exposed so a scene can chain through it instead of depending on that order.
 */

/** the one action signal outlives every stack, so a listener added by a test comes back out */
function withListener(listener: (action: Action) => boolean, body: () => void): void {
	Input.onAction.add(listener);
	try {
		body();
	} finally {
		Input.onAction.remove(listener);
	}
}

test('handleAction offers an action to the top window, and nothing to an empty stack', () => {
	const stack = new WindowStack();
	try {
		assert.equal(stack.handleAction('cancel'), false, 'an empty stack consumes nothing');

		const window = stack.push(new Window({ width: 100, height: 60 }));
		assert.equal(stack.handleAction('cancel'), true);
		assert.equal(window.closed, true);
	} finally {
		stack.destroy({ children: true });
	}
});

test('a scene that chains through handleAction keeps the windows ahead of itself', () => {
	const stack = new WindowStack();
	const window = stack.push(new Window({ width: 100, height: 60 }));
	const routed: string[] = [];
	const scene = (action: Action): boolean => {
		if (stack.handleAction(action)) {
			routed.push(`window ${action}`);
			return true;
		}
		routed.push(`scene ${action}`);
		return action === 'inventory';
	};

	try {
		withListener(scene, () => {
			//the scene registered last, so it is offered the action first - and still hands the
			//window its key, because it asks the stack rather than depending on registration order
			assert.equal(Input.onAction.dispatch('cancel'), true);
			assert.deepEqual(routed, ['window cancel']);
			assert.equal(window.closed, true);

			assert.equal(Input.onAction.dispatch('inventory'), true, 'its own key still reaches it');
			assert.deepEqual(routed, ['window cancel', 'scene inventory']);
		});
	} finally {
		stack.destroy({ children: true });
	}
});

test('a scene that does not chain is offered the action before the window, and can swallow it', () => {
	const stack = new WindowStack();
	const window = stack.push(new Window({ width: 100, height: 60 }));
	const greedy = (action: Action): boolean => action === 'cancel';

	try {
		withListener(greedy, () => {
			assert.equal(Input.onAction.dispatch('cancel'), true);
			assert.equal(window.closed, false, 'the window never saw the key: the trap the class doc names');
		});
	} finally {
		stack.destroy({ children: true });
	}
});

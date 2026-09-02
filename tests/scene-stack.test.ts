import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Scene } from '../src/core/Scene.ts';
import { SceneStack } from '../src/core/SceneStack.ts';

/** a scene that records its own lifecycle instead of drawing anything */
class Scripted extends Scene {
	calls: string[] = [];
	lastResult: unknown = 'nothing yet';

	create(): void {
		this.calls.push('create');
	}

	override update(_dt: number): void {
		this.calls.push('update');
	}

	override onSuspend(): void {
		this.calls.push('suspend');
	}

	override onResume(result: unknown): void {
		this.calls.push('resume');
		this.lastResult = result;
	}
}

test('a pushed scene suspends the one below, and popping resumes it with a result', () => {
	const stack = new SceneStack();
	const dungeon = new Scripted();
	const lockpick = new Scripted();

	stack.replace(dungeon);
	stack.update(1 / 60);
	stack.push(lockpick);
	stack.update(1 / 60);
	stack.pop({ picked: true });
	stack.update(1 / 60);

	assert.deepEqual(dungeon.calls, ['create', 'update', 'suspend', 'resume', 'update']);
	assert.deepEqual(lockpick.calls, ['create', 'update']);
	assert.deepEqual(dungeon.lastResult, { picked: true });
	assert.equal(stack.current, dungeon);
	assert.equal(stack.depth, 1);
});

test('only the top scene updates, however deep the stack', () => {
	const stack = new SceneStack();
	const a = new Scripted();
	const b = new Scripted();
	const c = new Scripted();

	stack.replace(a);
	stack.push(b);
	stack.push(c);
	stack.update(1 / 60);

	assert.deepEqual(a.calls, ['create', 'suspend']);
	assert.deepEqual(b.calls, ['create', 'suspend']);
	assert.deepEqual(c.calls, ['create', 'update']);
	assert.equal(stack.depth, 3);
});

test('popping the last scene is refused, and switching destroys everything', () => {
	const stack = new SceneStack();
	const a = new Scripted();
	const b = new Scripted();

	stack.replace(a);
	assert.throws(() => stack.pop(), /last scene/);
	assert.equal(stack.current, a);

	stack.push(b);
	const c = new Scripted();
	stack.replace(c);
	assert.equal(a.isDestroyed, true, 'the suspended scene goes down with the switch');
	assert.equal(b.isDestroyed, true);
	assert.equal(stack.depth, 1);
	assert.equal(stack.current, c);
});

test('resize reaches suspended scenes, and destroy empties the stack', () => {
	const stack = new SceneStack();
	const resized: string[] = [];

	class Placed extends Scene {
		private readonly id: string;
		constructor(id: string) {
			super();
			this.id = id;
		}
		create(): void {}
		override resize(_w: number, _h: number): void {
			resized.push(this.id);
		}
	}

	const a = new Placed('a');
	const b = new Placed('b');
	stack.replace(a);
	stack.push(b);
	stack.resize(800, 600);
	assert.deepEqual(resized, ['a', 'b']);

	stack.destroy();
	assert.equal(stack.current, null);
	assert.equal(stack.depth, 0);
	assert.equal(a.isDestroyed, true);
	assert.equal(b.isDestroyed, true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StageScript } from '../src/stage/script.ts';
import type { StageCommand } from '../src/stage/script.ts';

/**
 * The script runner, tested without a browser.
 *
 * What is worth testing here is the sequencing: that commands run in order, that a `say`
 * waits for the player rather than racing ahead, that an answer reaches the state, and
 * that cancelling stops the rest. None of that needs a renderer, so none of it is tested
 * through one — the fakes below record what they were asked to do and nothing more.
 */

interface Recorded {
	calls: string[];
	focused: (string | null)[];
}

function fakes() {
	const recorded: Recorded = { calls: [], focused: [] };

	const stage = {
		setBackdrop: async (_t: unknown, fade?: number) => {
			recorded.calls.push(`backdrop(${fade ?? 'default'})`);
		},
		show: async (id: string, options: { at?: unknown; expression?: string }) => {
			recorded.calls.push(`show(${id},${String(options.at)},${options.expression ?? '-'})`);
		},
		hide: async (id: string) => {
			recorded.calls.push(`hide(${id})`);
		},
		hideAll: async () => {
			recorded.calls.push('hideAll');
		},
		setExpression: (id: string, expression: string) => {
			recorded.calls.push(`expression(${id},${expression})`);
		},
		focus: (id: string | null) => {
			recorded.focused.push(id);
		},
	};

	//never reached: TestScript overrides speak, so no real window is ever built
	const windows = { push: (box: unknown) => box };

	return { recorded, stage, windows };
}

/**
 * The script builds a real MessageBox, which needs a renderer. Rather than stubbing Pixi,
 * the runner is driven through a subclass that reports each line and resolves when told —
 * the same seam a game would use to swap in its own dialogue presentation.
 */
class TestScript extends StageScript {
	readonly lines: Array<{ text: string; as?: string }> = [];
	private waiting: ((chosen: unknown) => void) | null = null;

	protected override speak(text: string, as: string | undefined): Promise<unknown> {
		this.lines.push({ text, as });
		return new Promise((resolve) => {
			this.waiting = resolve;
		});
	}

	/** stands in for the player pressing confirm, or choosing an option */
	answer(chosen?: unknown): void {
		const resolve = this.waiting;
		assert.ok(resolve, 'nothing is waiting for an answer');
		this.waiting = null;
		resolve(chosen);
	}

	get isWaiting(): boolean {
		return this.waiting !== null;
	}
}

function script(overrides: Partial<ConstructorParameters<typeof StageScript>[0]> = {}) {
	const f = fakes();
	const instance = new TestScript({
		stage: f.stage as never,
		windows: f.windows as never,
		backdrop: () => ({}) as never,
		...overrides,
	});
	return { script: instance, ...f };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('commands run in the order they are written', async () => {
	const { script: s, recorded } = script();

	const commands: StageCommand[] = [
		{ backdrop: 'room', fade: 0.5 },
		{ show: 'a', at: 'left', expression: 'neutral' },
		{ show: 'b', at: 'right' },
		{ expression: 'cross', of: 'a' },
		{ hide: 'b' },
		{ hideAll: true },
	];

	await s.run(commands);

	assert.deepEqual(recorded.calls, [
		'backdrop(0.5)',
		'show(a,left,neutral)',
		'show(b,right,-)',
		'expression(a,cross)',
		'hide(b)',
		'hideAll',
	]);
});

test('a line waits for the player before the next command runs', async () => {
	const { script: s, recorded } = script();

	const done = s.run([{ say: 'first' }, { show: 'a' }]);
	await tick();

	//the show must not have happened yet: a cutscene that runs ahead of its own dialogue
	//is the classic failure here
	assert.deepEqual(recorded.calls, []);
	assert.equal(s.lines.length, 1);
	assert.ok(s.isWaiting);

	s.answer();
	await done;

	assert.deepEqual(recorded.calls, ['show(a,undefined,-)']);
});

test('an answer is stored under its name', async () => {
	const { script: s } = script();

	const done = s.run([
		{ ask: 'well?', choices: [{ text: 'yes' }, { text: 'no' }], store: 'reply' },
		{ say: 'noted' },
	]);
	await tick();

	s.answer('yes');
	await tick();
	s.answer();

	const state = await done;
	assert.equal(state.answers.reply, 'yes');
});

test('cancelling stops the remaining commands', async () => {
	const { script: s, recorded } = script();

	const done = s.run([{ say: 'first' }, { show: 'a' }, { show: 'b' }]);
	await tick();

	s.cancel();
	s.answer();
	await done;

	//the line that was already open still finishes, but nothing after it runs
	assert.deepEqual(recorded.calls, []);
});

test('a call command receives the state and is awaited', async () => {
	const { script: s } = script();
	const seen: unknown[] = [];

	const done = s.run([
		{ ask: 'pick', choices: [{ text: 'x' }], store: 'pick' },
		{
			call: async (state) => {
				await tick();
				seen.push(state.answers.pick);
			},
		},
	]);

	await tick();
	s.answer('x');
	await done;

	assert.deepEqual(seen, ['x']);
});

test('runStory follows a goto into the named passage', async () => {
	const { script: s } = script();

	const done = s.runStory(
		{
			start: [{ say: 'one' }, { goto: 'end' }, { say: 'skipped' }],
			end: [{ say: 'two' }],
		},
		'start'
	);
	await tick();
	s.answer();
	await tick();
	s.answer();
	const state = await done;

	assert.deepEqual(
		s.lines.map((l) => l.text),
		['one', 'two']
	);
	assert.deepEqual(state.answers, {});
});

test('a choice with a goto jumps to its passage, and passages can loop back', async () => {
	const { script: s } = script();

	const done = s.runStory(
		{
			start: [
				{
					ask: 'where?',
					choices: [{ text: 'left', goto: 'left' }, { text: 'stay' }],
					store: 'where',
				},
			],
			left: [{ say: 'went left' }, { goto: 'start' }],
		},
		'start'
	);

	await tick();
	s.answer('left'); //jumps to 'left', says its line, loops back to 'start'
	await tick();
	assert.equal(s.lines.length, 2);
	s.answer();
	await tick();
	s.answer('stay'); //no goto: the passage ends, and so does the story
	const state = await done;

	assert.deepEqual(
		s.lines.map((l) => l.text),
		['where?', 'went left', 'where?']
	);
	assert.equal(state.answers.where, 'stay');
});

test('runStory refuses an unknown start or jump target', async () => {
	const { script: s } = script();

	await assert.rejects(s.runStory({ a: [] }, 'missing'), /no passage named "missing"/);
	await assert.rejects(
		s.runStory({ a: [{ goto: 'missing' }] }, 'a'),
		/no passage named "missing"/
	);
});

test('a goto in a straight run is an error, not a silent skip', async () => {
	const { script: s } = script();

	await assert.rejects(s.run([{ goto: 'anywhere' }]), /only runs inside runStory/);
});

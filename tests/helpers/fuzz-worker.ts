/**
 * The worker half of `tests/fuzz.test.ts`: runs one decoder over seeded mutations of its corpus
 * and reports the first input that breaks the contract. It runs in a worker so the test can
 * terminate a decoder that never returns, which a synchronous hang in the test thread would
 * make impossible.
 *
 * The contract every decoder here keeps with hostile input: return, or throw an `Error` with a
 * message. Never loop, never overflow the stack (a `RangeError` about the call stack), never
 * throw something that is not an `Error`.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { Generator } from '../../src/core/Random.ts';
import { decodeMarshal, encodeMarshal } from '../../src/rpg/Marshal.ts';
import { parse as parseMwl } from '../../src/mwl/grammar.ts';
import { parseMapFile } from '../../src/mwl/MapFile.ts';
import { parseExpression } from '../../src/mwl/expression.ts';
import { parseTwee } from '../../src/core/Twee.ts';
import { parseDialogueText } from '../../src/rpg/dialogue-text.ts';
import { deserializeReplay } from '../../src/core/Replay.ts';
import { parseInbound } from '../../src/core/Sanitize.ts';
import { parseFTL } from '../../src/i18n/Fluent.ts';
import { parsePo } from '../../src/i18n/Po.ts';
import { SaveSystem, type SaveStorage } from '../../src/core/Save.ts';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const memory = (): SaveStorage => {
	const data = new Map<string, string>();
	return {
		read: (key) => data.get(key) ?? null,
		write: (key, value) => void data.set(key, value),
		remove: (key) => void data.delete(key),
		keys: () => [...data.keys()],
	};
};

interface Target {
	corpus: string[];
	run: (input: string) => unknown;
	/** feeds the decoder bytes instead of text: each char code is one byte */
	bytes?: boolean;
	/** characters worth inserting, besides random ones: the format's own syntax */
	syntax: string;
}

const marshalCorpus = [
	encodeMarshal(
		new Map<unknown, unknown>([
			['hp', 12],
			['name', 'hero'],
			['items', [1, 2, [3, 'x']]],
			['flag', true],
			['none', null],
		]),
	),
	encodeMarshal([1.5, -7, 'é', new Map([['a', new Map([['b', []]])]])]),
].map((bytes) => String.fromCharCode(...bytes));

export const TARGETS: Record<string, Target> = {
	marshal: {
		corpus: marshalCorpus,
		bytes: true,
		syntax: '\x04\x08[{"0TFi:@;fl\x00\x7f\xff',
		run: (input) => decodeMarshal(Uint8Array.from(input, (c) => c.charCodeAt(0) & 0xff)),
	},
	mwl: { corpus: [fixture('mwl/skirmish.mwl')], syntax: '[]{}(),:"\'_#\n\\', run: (input) => parseMwl(input) },
	mapFile: {
		corpus: ['border_size=1\nusage=map\n\nGg, Gg^Ve, Gg\nGg, 1 Gg, Gg\n'],
		syntax: '=,^ \n',
		run: parseMapFile,
	},
	expression: {
		corpus: ['hp < max_hp / 2 and not (side == 1 or turn >= 10)', '"a" .. name == "b" or -(x + 3) * 2 > 1'],
		syntax: '()<>=!+-*/.,"\' andornot',
		run: parseExpression,
	},
	twee: {
		corpus: [
			':: StoryTitle\nDemo\n\n:: Start\nPick a door.\n\n[[Left->A]]\n[[Right->B]]\n\n:: A\nTreasure.\n\n:: B\n<<set $gold to 3>>\nEmpty.\n',
		],
		syntax: ':[]<>$|->\n',
		run: parseTwee,
	},
	dialogue: {
		corpus: ['\n@alice Hello.\n@bob Hi!\n- How are you?\n- Fine.\nNarration.\n'],
		syntax: '@-\n *_',
		run: parseDialogueText,
	},
	replay: {
		corpus: ['[{"frame":0,"action":"up"},{"frame":3,"action":"fire"}]'],
		syntax: '[]{}":,0-9',
		run: deserializeReplay,
	},
	inbound: {
		corpus: ['{"a":[1,{"b":"c"}],"d":null,"e":true}'],
		syntax: '[]{}":,\\u',
		run: (input) => parseInbound(input),
	},
	fluent: {
		corpus: [
			'welcome = Welcome, { $name }!\nitems = { $count ->\n  [one] one item\n *[other] { $count } items\n}\n',
		],
		syntax: '{}[]$*=->\n.',
		run: (input) => parseFTL('en', input),
	},
	po: {
		corpus: ['msgid "greeting"\nmsgstr "Bonjour"\n\nmsgid "two\\nlines"\nmsgstr "a\\tb"\n'],
		syntax: '"\\ntmsgidstr#',
		run: (input) => parsePo('fr', input),
	},
	saveImport: {
		corpus: ['{"meta":{"version":1,"savedAt":1700000000000,"preview":"F3"},"state":{"gold":3,"bag":["key"]}}'],
		syntax: '[]{}":,',
		run: (input) => new SaveSystem({ namespace: 'fuzz', version: 2, storage: memory() }).importSlot('s', input),
	},
};

/** one seeded mutation of `input`: truncation, deletion, duplication, insertion, replacement or deep nesting */
export function mutate(random: Generator, input: string, syntax: string): string {
	const at = () => random.int(input.length + 1);
	const char = () => (random.int(3) === 0 ? String.fromCharCode(random.int(256)) : syntax[random.int(syntax.length)]);
	switch (random.int(7)) {
		case 0:
			return input.slice(0, at());
		case 1: {
			const start = at();
			return input.slice(0, start) + input.slice(start + random.int(16) + 1);
		}
		case 2: {
			const start = at();
			const slice = input.slice(start, start + random.int(32) + 1);
			return input.slice(0, start) + slice.repeat(random.int(8) + 2) + input.slice(start);
		}
		case 3: {
			const start = at();
			return input.slice(0, start) + char() + input.slice(start);
		}
		case 4: {
			const start = random.int(Math.max(1, input.length));
			return input.slice(0, start) + char() + input.slice(start + 1);
		}
		case 5: {
			//deep nesting: the input shape a recursive decoder is weakest against
			const open = syntax[random.int(syntax.length)];
			return open.repeat(2000 + random.int(20000)) + input;
		}
		default:
			return Array.from({ length: random.int(64) }, char).join('');
	}
}

export function fuzz(name: string, iterations: number, seed: number) {
	const target = TARGETS[name];
	const random = new Generator(seed);
	for (let i = 0; i < iterations; i++) {
		let input = target.corpus[random.int(target.corpus.length)];
		for (let rounds = random.int(3) + 1; rounds > 0; rounds--) input = mutate(random, input, target.syntax);
		try {
			target.run(input);
		} catch (error) {
			const stack = error instanceof RangeError && /call stack/i.test(error.message);
			if (!(error instanceof Error) || stack || !error.message)
				return { iteration: i, input: input.slice(0, 200), length: input.length, error: String(error) };
		}
	}
	return null;
}

if (parentPort && workerData) {
	const { name, iterations, seed } = workerData as { name: string; iterations: number; seed: number };
	parentPort.postMessage(fuzz(name, iterations, seed));
}

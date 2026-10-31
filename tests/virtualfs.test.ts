import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	installVirtualReads,
	listVirtualMods,
	memoryWriteback,
	normalizeVirtualPath,
	setVirtualModEnabled,
	VirtualFileError,
	VirtualFileSystem,
} from '../src/assets/virtualfs.ts';

const shipped = new Map<string, Uint8Array | string>([
	['data/items.json', '[1]'],
	['img/a.png', new Uint8Array([9, 8])],
	['mods/hd/mod.json', '{}'],
	['mods/readme.txt', 'not a mod'],
]);

function codeOf(run: () => unknown): string {
	try {
		run();
	} catch (error) {
		return (error as VirtualFileError).code;
	}
	return 'none';
}

test('normalizeVirtualPath drops dot segments and refuses to climb above the root', () => {
	assert.equal(normalizeVirtualPath('/./a//b/../c\\d'), 'a/c/d');
	assert.equal(
		codeOf(() => normalizeVirtualPath('../x')),
		'EINVAL',
	);
});

test('a write is visible to every read, shadows the shipped file and lists in its directory', () => {
	const fs = new VirtualFileSystem({ mount: shipped, now: () => 5 });
	fs.writeFile('cache/a.bin', new Uint8Array([1, 2, 3]));
	fs.writeFile('data/items.json', '[2]');
	assert.deepEqual([...fs.readFile('cache/a.bin')], [1, 2, 3]);
	assert.equal(fs.readText('data/items.json'), '[2]');
	assert.deepEqual(fs.readdir('cache'), ['a.bin']);
	assert.deepEqual(fs.readdir('/'), ['cache', 'data', 'img', 'mods']);
	assert.deepEqual(fs.stat('cache/a.bin'), { size: 3, mtime: 5, isDirectory: false });
	assert.equal(fs.stat('cache').isDirectory, true);
});

test('errors carry the Node codes', () => {
	const fs = new VirtualFileSystem({ mount: shipped });
	assert.equal(
		codeOf(() => fs.readFile('nope')),
		'ENOENT',
	);
	assert.equal(
		codeOf(() => fs.readFile('data')),
		'EISDIR',
	);
	assert.equal(
		codeOf(() => fs.readdir('data/items.json')),
		'ENOTDIR',
	);
	assert.equal(
		codeOf(() => fs.writeFile('data', 'x')),
		'EISDIR',
	);
	assert.equal(
		codeOf(() => fs.unlink('nope')),
		'ENOENT',
	);
});

test('deleting a shipped file leaves a tombstone, and deleting a written one just removes it', () => {
	const fs = new VirtualFileSystem({ mount: shipped });
	fs.unlink('data/items.json');
	assert.equal(fs.exists('data/items.json'), false);
	assert.equal(fs.exists('data'), false, 'a directory with no file left is gone');
	fs.writeFile('cache/x', 'x');
	fs.rm('cache');
	assert.equal(fs.exists('cache'), false);
	fs.rm('never/was');
});

test('durability rules decide what reaches the writeback, first match wins, durable by default', async () => {
	const writeback = memoryWriteback();
	const fs = new VirtualFileSystem({
		writeback,
		durability: [
			{ pattern: 'cache/keep.lock', durability: 'durable' },
			{ pattern: 'cache/*.lock', durability: 'session' },
			{ pattern: 'tmp/**', durability: 'session' },
		],
	});
	fs.writeFile('save/slot1', 'a');
	fs.writeFile('cache/keep.lock', 'b');
	fs.writeFile('cache/gen.lock', 'c');
	fs.writeFile('tmp/deep/x', 'd');
	await fs.flush();
	assert.deepEqual([...writeback.files.keys()].sort(), ['cache/keep.lock', 'save/slot1']);
	assert.equal(fs.readText('cache/gen.lock'), 'c', 'a session file still reads back this session');
	fs.unlink('save/slot1');
	await fs.flush();
	assert.equal(writeback.files.has('save/slot1'), false, 'delete reaches the adapter');
});

test('restore brings durable files back into a fresh filesystem, deletions of shipped files included', async () => {
	const writeback = memoryWriteback();
	const first = new VirtualFileSystem({ mount: shipped, writeback });
	first.writeFile('save/a', 'kept');
	await first.flush();
	const second = new VirtualFileSystem({ mount: shipped, writeback });
	assert.equal(second.exists('save/a'), false, 'nothing is visible before restore');
	await second.restore();
	assert.equal(second.readText('save/a'), 'kept');

	const tombstoned = { ...writeback, load: async () => [['data/items.json', null] as const] };
	const third = new VirtualFileSystem({ mount: shipped, writeback: tombstoned });
	await third.restore();
	assert.equal(third.exists('data/items.json'), false);
});

test('flush rejects with the first adapter failure, once', async () => {
	const fs = new VirtualFileSystem({
		writeback: { ...memoryWriteback(), put: async () => Promise.reject(new Error('disk full')) },
	});
	fs.writeFile('a', 'x');
	await assert.rejects(fs.flush(), /disk full/);
	await fs.flush();
});

test('mods are the directories holding a manifest, and the enable choice persists as a file', async () => {
	const writeback = memoryWriteback();
	const fs = new VirtualFileSystem({ mount: shipped, writeback });
	assert.deepEqual(listVirtualMods(fs), [{ id: 'hd', dir: 'mods/hd', enabled: true }]);
	setVirtualModEnabled(fs, 'hd', false);
	assert.equal(listVirtualMods(fs)[0].enabled, false);
	await fs.flush();
	const again = new VirtualFileSystem({ mount: shipped, writeback });
	await again.restore();
	assert.equal(listVirtualMods(again)[0].enabled, false);
	assert.deepEqual(listVirtualMods(new VirtualFileSystem()), []);
});

test('installVirtualReads answers fetch from the store, 404s silently under the prefix and passes the rest through', async () => {
	const fs = new VirtualFileSystem({ mount: shipped });
	const passed: string[] = [];
	const target: Record<string, any> = {
		fetch: async (input: string) => {
			passed.push(input);
			return new Response('network');
		},
	};
	const uninstall = installVirtualReads(fs, { prefix: 'game/', target });
	fs.writeFile('cache/gen.json', '{"ok":true}');

	const hit = await target.fetch('game/cache/gen.json?v=1');
	assert.equal(hit.status, 200);
	assert.equal(hit.headers.get('content-type'), 'application/json');
	assert.deepEqual(await hit.json(), { ok: true });
	assert.equal((await target.fetch('game/cache/not-yet.json')).status, 404);
	assert.equal(await (await target.fetch('https://example.com/x')).text(), 'network');
	assert.equal(await (await target.fetch('other/file')).text(), 'network');
	assert.deepEqual(passed, ['https://example.com/x', 'other/file']);

	uninstall();
	await target.fetch('game/cache/gen.json');
	assert.equal(passed.length, 3, 'restored: the original handles it again');
});

test('installVirtualReads redirects XMLHttpRequest and element src, and completes a missing XHR as 404', async () => {
	const fs = new VirtualFileSystem({ mount: shipped });
	const opened: string[] = [];
	class FakeXhr extends EventTarget {
		open(_method: string, url: string) {
			opened.push(url);
		}
		send() {
			throw new Error('a missing file must not be sent');
		}
	}
	let assigned = '';
	class FakeImage {
		set src(value: string) {
			assigned = value;
		}
		get src() {
			return assigned;
		}
	}
	const created: Blob[] = [];
	const target: Record<string, any> = {
		XMLHttpRequest: FakeXhr,
		HTMLImageElement: FakeImage,
		URL: { createObjectURL: (blob: Blob) => (created.push(blob), `blob:${created.length}`) },
	};
	const uninstall = installVirtualReads(fs, { target });

	const hit = new target.XMLHttpRequest();
	hit.open('GET', 'img/a.png');
	assert.deepEqual(opened, ['blob:1']);
	assert.equal(created[0].type, 'image/png');

	const miss = new target.XMLHttpRequest();
	const done = new Promise<void>((resolve) => miss.addEventListener('load', () => resolve()));
	miss.open('GET', 'cache/not-yet.bin');
	miss.send();
	await done;
	assert.equal(miss.status, 404);
	assert.equal(miss.readyState, 4);

	const image = new target.HTMLImageElement();
	image.src = 'img/a.png';
	assert.equal(assigned, 'blob:2');
	image.src = 'https://example.com/a.png';
	assert.equal(assigned, 'https://example.com/a.png');

	uninstall();
	image.src = 'img/a.png';
	assert.equal(assigned, 'img/a.png');
});

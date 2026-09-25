import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitPage } from '../tools/emit-page.mjs';
import { mwgPage } from '../tools/vite.mjs';

const VITE_HTML =
	'<!doctype html>\n<html>\n<head>\n\t<script type="module" crossorigin src="./game.js"></script>\n</head>\n<body></body>\n</html>\n';

function scratch(): string {
	return mkdtempSync(join(tmpdir(), 'mwg-emit-'));
}

test('emitPage compiles assets and puts their scripts before a classic, deferred entry', async () => {
	const dir = scratch();
	try {
		mkdirSync(join(dir, 'dist', '.vite'), { recursive: true });
		writeFileSync(join(dir, 'dist', 'index.html'), VITE_HTML);
		mkdirSync(join(dir, 'assets'));
		writeFileSync(join(dir, 'assets', 'hello.txt'), 'hi');
		const result = await emitPage({ dist: join(dir, 'dist'), assets: join(dir, 'assets'), compress: false });
		const html = readFileSync(join(dir, 'dist', 'index.html'), 'utf8');
		assert.equal(result.entry, './game.js');
		assert.deepEqual(
			result.groups.map((group) => group.name),
			['assets'],
		);
		assert.match(
			html,
			/<script defer src="\.\/assets\/assets\.js"><\/script>\n\t<script defer src="\.\/game\.js"><\/script>/,
		);
		assert.doesNotMatch(html, /type="module"|crossorigin/);
		assert.equal(existsSync(join(dir, 'dist', '.vite')), false);
		assert.equal(result.compressed, null);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('emitPage with no assets only rewrites the entry tag, and refuses a folder that is not a vite build', async () => {
	const dir = scratch();
	try {
		mkdirSync(join(dir, 'dist'));
		writeFileSync(join(dir, 'dist', 'index.html'), VITE_HTML);
		const result = await emitPage({ dist: join(dir, 'dist'), compress: false });
		assert.deepEqual(result.groups, []);
		assert.match(
			readFileSync(join(dir, 'dist', 'index.html'), 'utf8'),
			/\n<script defer src="\.\/game\.js"><\/script>/,
		);
		await assert.rejects(
			() => emitPage({ dist: join(dir, 'dist'), compress: false }),
			/no <script type="module"> entry tag/,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('mwgPage sets the file:// build configuration and serves the assets folder in dev', () => {
	const config = mwgPage().config() as {
		base: string;
		publicDir: string;
		build: { copyPublicDir: boolean; rollupOptions: { output: { format: string; entryFileNames: string } } };
	};
	assert.equal(config.base, './');
	assert.equal(config.publicDir, 'assets');
	assert.equal(config.build.copyPublicDir, false);
	assert.deepEqual(config.build.rollupOptions.output.format, 'iife');
	assert.equal(config.build.rollupOptions.output.entryFileNames, 'game.js');
	assert.equal((mwgPage({ assets: false }).config() as { publicDir: unknown }).publicDir, false);
});

test('mwgPage leaves the output alone when a dev server closes', async () => {
	const dir = scratch();
	try {
		mkdirSync(join(dir, 'dist'));
		writeFileSync(join(dir, 'dist', 'index.html'), VITE_HTML);
		const plugin = mwgPage();
		plugin.configResolved({ root: dir, command: 'serve', build: { outDir: 'dist' } });
		await plugin.closeBundle.call({});
		assert.equal(readFileSync(join(dir, 'dist', 'index.html'), 'utf8'), VITE_HTML);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('every bin entry is a shipped file with a node shebang', () => {
	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
		bin: Record<string, string>;
		files: string[];
	};
	assert.ok(Object.keys(pkg.bin).length > 0);
	for (const [name, file] of Object.entries(pkg.bin)) {
		assert.ok(pkg.files.includes(file), `${name} -> ${file} is not in files`);
		assert.match(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /^#!\/usr\/bin\/env node\n/, name);
	}
});

test('the Content-Security-Policy hashes each inline script and opens connect-src only to declared origins', async () => {
	const { contentSecurityPolicy, withContentSecurityPolicy } = await import('../tools/csp.mjs');
	const { createHash } = await import('node:crypto');
	const html = '<html><head><script>window.x = 1</script><script defer src="./game.js"></script></head></html>';
	const hash = createHash('sha256').update('window.x = 1').digest('base64');
	const policy = contentSecurityPolicy(html, { connect: ['https://news.example'] });
	assert.match(policy, new RegExp(`script-src 'self' file: 'sha256-${hash.replace(/[+/]/g, '\\$&')}' 'unsafe-eval'`));
	assert.match(policy, /connect-src data: blob: https:\/\/news\.example;/);
	assert.match(policy, /default-src 'none'/);
	assert.match(policy, /object-src 'none'/);
	assert.doesNotMatch(contentSecurityPolicy(html, { eval: false }), /unsafe-eval/);

	const once = withContentSecurityPolicy(html);
	assert.match(once, /^<html><head>\n\t<meta http-equiv="Content-Security-Policy"/);
	assert.equal(withContentSecurityPolicy(once).match(/Content-Security-Policy/g)?.length, 1, 'a rerun replaces it');
	assert.throws(() => withContentSecurityPolicy('<p>no head</p>'), /no <head>/);
});

test('emitPage writes the policy by default and leaves it out with csp: false', async () => {
	const dir = scratch();
	try {
		mkdirSync(join(dir, 'dist'));
		writeFileSync(join(dir, 'dist', 'index.html'), VITE_HTML);
		await emitPage({ dist: join(dir, 'dist'), compress: false, csp: { connect: ['wss://room.example'] } });
		assert.match(
			readFileSync(join(dir, 'dist', 'index.html'), 'utf8'),
			/connect-src data: blob: wss:\/\/room\.example/,
		);
		writeFileSync(join(dir, 'dist', 'index.html'), VITE_HTML);
		await emitPage({ dist: join(dir, 'dist'), compress: false, csp: false });
		assert.doesNotMatch(readFileSync(join(dir, 'dist', 'index.html'), 'utf8'), /Content-Security-Policy/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

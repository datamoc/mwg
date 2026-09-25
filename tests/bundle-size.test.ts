import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareBudget, measureBuild } from '../tools/bundle-size.mjs';

test('measureBuild counts what a player receives, and compareBudget fails only past the tolerance', () => {
	const dist = mkdtempSync(join(tmpdir(), 'mwg-size-'));
	try {
		mkdirSync(join(dist, 'assets'));
		writeFileSync(join(dist, 'index.html'), '<html></html>');
		writeFileSync(join(dist, 'game.js'), 'x'.repeat(1000));
		writeFileSync(join(dist, 'game.js.gz'), 'ignored');
		writeFileSync(join(dist, 'game.js.map'), 'ignored');
		writeFileSync(join(dist, 'sbom.cdx.json'), 'ignored');
		writeFileSync(join(dist, 'assets', 'assets.js'), 'y'.repeat(500));
		const current = measureBuild(dist);
		assert.deepEqual(Object.keys(current), ['assets/assets.js', 'game.js', 'index.html', 'total']);
		assert.equal(current.total.raw, 1513);

		const grown = { ...current, 'game.js': { raw: 1030, gzip: current['game.js'].gzip } };
		assert.equal(compareBudget(grown, current, 0.02).failed, true, '+3% fails a 2% budget');
		assert.equal(compareBudget(grown, current, 0.05).failed, false);
		const added = compareBudget({ ...current, 'extra.js': { raw: 10, gzip: 10 } }, current);
		assert.equal(added.failed, false);
		assert.ok(added.lines.includes('extra.js raw: 10 B (no baseline)'));
	} finally {
		rmSync(dist, { recursive: true, force: true });
	}
});

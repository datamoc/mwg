import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

/**
 * API_REPORT.md is the reviewable half of the API-surface guard: a generated index of every
 * public export and its declaration, committed so a rename, removal, or signature change
 * shows up as a readable diff in a pull request. A committed report drifts the moment the
 * source drifts unless something checks it, so this test emits the current declarations with
 * `tsc --emitDeclarationOnly` into a temp dir and asks `tools/api-report.mjs --check` to
 * compare them against the committed file. The generator itself is one implementation, not
 * two: the test only supplies fresh declarations, it never re-parses them.
 */

const ROOT = resolvePath(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

test('API_REPORT.md matches the declarations emitted from the current src/', () => {
	const scratchRoot = join(ROOT, '.example-check');
	mkdirSync(scratchRoot, { recursive: true });
	const dir = mkdtempSync(join(scratchRoot, 'api-report-'));

	try {
		execFileSync(
			'npx',
			[
				'tsc',
				'-p',
				'tsconfig.build.json',
				'--emitDeclarationOnly',
				'--outDir',
				dir,
				'--declarationMap',
				'false',
				'--sourceMap',
				'false',
			],
			{ cwd: ROOT, stdio: 'pipe', shell: true },
		);

		execFileSync('node', [join(ROOT, 'tools', 'api-report.mjs'), '--check', '--declarations', dir], {
			cwd: ROOT,
			stdio: 'pipe',
			shell: true,
		});
	} catch (error) {
		const caught = error as { stdout?: Buffer; stderr?: Buffer };
		const output =
			[caught.stdout?.toString(), caught.stderr?.toString()].filter(Boolean).join('\n') || String(error);
		assert.fail(
			`API_REPORT.md is out of date with the current source. Run "npm run api:report" and commit the result.\n\n${output}`,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

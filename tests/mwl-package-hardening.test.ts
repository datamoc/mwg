import assert from 'node:assert/strict';
import test from 'node:test';
import { PackageFormatError } from '../src/mwl/package-container.ts';
import { parsePackageDocument } from '../src/mwl/package-document.ts';

const head = "{ tag: 'package', id: 'p', version: '1.0.0' }";
const imports = (src: string, count: number): string =>
	Array.from({ length: count }, () => `{ tag: 'import', src: '${src}' }`).join(', ');

test('repeated imports are capped across the whole package, not only by depth', () => {
	// 8 reads of b.mwl, each reading c.mwl 8 times: 72 reads within a depth of 2
	const files = { 'b.mwl': `[${imports('c.mwl', 8)}]`, 'c.mwl': '[]' };
	assert.throws(() => parsePackageDocument(`[${head}, ${imports('b.mwl', 8)}]`, { files }), /more than 64 imports/);
});

test('an import named like an Object.prototype member is "not in the package", not a crash', () => {
	assert.throws(
		() => parsePackageDocument(`[${head}, { tag: 'import', src: 'constructor' }]`, { files: {} }),
		(error: unknown) => error instanceof PackageFormatError && /not in the package/.test(error.message),
	);
});

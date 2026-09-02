import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Generates the API reference into `webpage/documentation/` with TypeDoc.
 *
 * TypeDoc's checker-based analysis needs the classic TypeScript compiler API
 * (`ts.createProgram`, `ts.SyntaxKind`, ...), which `typescript@7`'s package no longer
 * exposes through its main entry point — it ships a new native compiler with a different
 * API surface instead. `tools/docs/` is an isolated nested npm project that pins an older,
 * compatible `typescript` purely for TypeDoc to read the source with; it never touches the
 * root project's own build or type-check, which keep using the real typescript@7.
 *
 * Run this before viewing the Documentation page or deploying the site.
 */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docsDir = join(root, 'tools', 'docs');

console.log('installing tools/docs dependencies (isolated typescript for TypeDoc)...');
execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: docsDir, stdio: 'inherit', shell: true });

console.log('generating API reference...');
execFileSync('node', ['node_modules/typedoc/bin/typedoc', '--options', 'typedoc.json'], {
	cwd: docsDir,
	stdio: 'inherit',
	shell: true,
});

console.log('\nwebpage/documentation/ now holds the generated API reference.');

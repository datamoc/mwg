import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

//Packs the project, installs the tarball into an empty folder and runs every `mwg-*` bin with --help on the
//Node running this script, so `engines.node` and the published `files` list are exercised the way an
//installed package sees them (no `src`, no devDependencies; `ws` is added, the optional peer the lockstep server needs). Run on the oldest Node the package claims.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const scratch = mkdtempSync(join(tmpdir(), 'mwg-bins-'));
const run = (command, args, cwd) =>
	execFileSync(command, args, {
		cwd,
		encoding: 'utf8',
		shell: process.platform === 'win32',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
try {
	const tarball = run('npm', ['pack', '--silent', '--pack-destination', scratch], '.').trim().split(/\r?\n/).pop();
	const project = join(scratch, 'project');
	mkdirSync(project);
	run('npm', ['init', '-y'], project);
	run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', resolve(scratch, tarball), 'ws'], project);
	for (const [name, file] of Object.entries(pkg.bin)) {
		const bin = join(project, 'node_modules', pkg.name, file);
		//some tools print their usage to stderr and exit non-zero for --help: only a crash prints an error
		let output;
		try {
			output = run(process.execPath, [bin, '--help'], project);
		} catch (error) {
			output = `${error.stdout}${error.stderr}`;
		}
		assert.doesNotMatch(
			output,
			/ERR_[A-Z_]+|Cannot find|SyntaxError|Error:/,
			`${name} --help on Node ${process.version}: ${output}`,
		);
		assert.ok(output.trim(), `${name} --help prints nothing`);
		console.log(`ok ${name}`);
	}
} finally {
	rmSync(scratch, { recursive: true, force: true });
}

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// npm 12 can inherit a user-level allow-scripts policy that rejects audit before it
// contacts the registry. Audit never needs lifecycle scripts, and its cache is temporary
// so a locked or stale user cache cannot make the project check fail.
const cache = mkdtempSync(join(tmpdir(), 'mwg-npm-audit-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const env = { ...process.env };
delete env.npm_config_allow_scripts;

try {
	const result = spawnSync(npm, ['audit', '--ignore-scripts', '--audit-level=high', '--cache', cache], {
		stdio: 'inherit',
		env,
		shell: true,
	});
	process.exitCode = result.status ?? 1;
} finally {
	rmSync(cache, { recursive: true, force: true });
}

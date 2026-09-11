/**
 * Waits for every workflow run of one commit and reports how each of them ended.
 *
 * This is the honest version of `gh run list --limit=1`, which is wrong in a way that looks right:
 * right after a push it still answers about the *previous* commit, so a red commit can be reported
 * green. That is not hypothetical, it is what happened to b1f7575, where CI failed on `stats:check`
 * while a green run of the commit before it was read instead. Filtering by sha is the entire point
 * of this file.
 *
 *   node tools/ci-status.mjs          # the current HEAD
 *   node tools/ci-status.mjs <sha>    # one commit, short or full
 *   node tools/ci-status.mjs --timeout 1200
 *
 * Exits 0 when every run of that commit succeeded, 1 when one did not, 2 when it gave up waiting.
 * There is no test: it is a thin wrapper around `gh` and a network, and the one thing it must not do
 * is the one thing a fake would happily let it do.
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const timeoutIndex = args.indexOf('--timeout');
const timeoutSeconds = timeoutIndex >= 0 ? Number(args[timeoutIndex + 1]) : 900;
const named = timeoutIndex >= 0 ? args[timeoutIndex + 1] : undefined;
const sha = args.find((arg) => !arg.startsWith('--') && arg !== named);

const head = execFileSync('git', ['rev-parse', sha ?? 'HEAD'], { encoding: 'utf8' }).trim();
const deadline = Date.now() + timeoutSeconds * 1000;
const short = head.slice(0, 7);

function runsOnThisCommit() {
	const output = execFileSync(
		'gh',
		['run', 'list', '--commit', head, '--limit', '30', '--json', 'databaseId,workflowName,status,conclusion'],
		{ encoding: 'utf8' },
	);
	return JSON.parse(output);
}

let listed = [];
while (Date.now() < deadline) {
	listed = runsOnThisCommit();
	if (listed.length > 0 && listed.every((run) => run.status === 'completed')) break;
	//right after a push the runs for this commit may not exist yet, which is exactly the window in
	//which asking for "the latest run" answers about someone else's commit
	await new Promise((resolve) => setTimeout(resolve, 15000));
}

if (listed.length === 0) {
	console.error(`no workflow run found for ${short} after ${timeoutSeconds}s`);
	process.exit(2);
}
if (!listed.every((run) => run.status === 'completed')) {
	console.error(`still running after ${timeoutSeconds}s on ${short}:`);
	for (const run of listed) console.error(`  ${run.workflowName}: ${run.status}`);
	process.exit(2);
}

const width = Math.max(...listed.map((run) => run.workflowName.length));
console.log(`${listed.length} workflow run(s) on ${short}:`);
for (const run of listed) console.log(`  ${run.workflowName.padEnd(width)}  ${run.conclusion}`);

const failed = listed.filter((run) => run.conclusion !== 'success');
if (failed.length > 0) {
	console.error(`\n${failed.length} of them failed. Read one with:`);
	for (const run of failed) console.error(`  gh run view ${run.databaseId} --log-failed`);
	process.exit(1);
}

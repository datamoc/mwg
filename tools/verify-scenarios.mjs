#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchChrome } from './find-chrome.mjs';

/** Validate the serialisable, game-owned plan before running any scene steps. */
export function validateScenarioPlan(plan) {
	if (!Array.isArray(plan) || plan.length === 0) throw new Error('scenario plan must be a nonempty array');
	const ids = new Set();
	for (const scenario of plan) {
		if (!scenario || typeof scenario.id !== 'string' || !scenario.id || ids.has(scenario.id))
			throw new Error('scenario IDs must be nonempty and unique');
		ids.add(scenario.id);
		for (const field of ['enter', 'verify'])
			if (typeof scenario[field] !== 'string' || !scenario[field])
				throw new Error(`${scenario.id}: ${field} needs a scene control name`);
		if (
			!Array.isArray(scenario.turn) ||
			scenario.turn.length === 0 ||
			scenario.turn.some((step) => typeof step !== 'string' || !step)
		)
			throw new Error(`${scenario.id}: turn needs a nonempty list of scene control names`);
		if (scenario.leave !== undefined && (typeof scenario.leave !== 'string' || !scenario.leave))
			throw new Error(`${scenario.id}: leave needs a scene control name`);
	}
	return plan;
}

/** Opens one local page and drives every scenario through its registered SceneControls. */
export async function verifyScenarios({ file, turns = 3, timeoutMs = 120000, only = '' }) {
	if (!Number.isSafeInteger(turns) || turns < 1) throw new Error('turns must be a positive integer');
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('timeoutMs must be a positive integer');
	const browser = await launchChrome({ argsEnv: 'MWG_VISUAL_CHROME_ARGS' });
	const failures = [];
	const scenarios = [];
	let expired = false;
	const bounded = async (operation) => {
		let timer;
		try {
			return await Promise.race([
				operation,
				new Promise((_, reject) => {
					timer = setTimeout(() => {
						expired = true;
						reject(new Error(`scene step exceeded ${timeoutMs} ms`));
					}, timeoutMs);
				}),
			]);
		} finally {
			clearTimeout(timer);
		}
	};
	try {
		const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
		let current = 'startup';
		page.on('pageerror', (error) => failures.push(`${current}: ${error.message}`));
		page.on('console', (message) => {
			if (message.type() === 'error') failures.push(`${current}: ${message.text()}`);
		});
		await page.goto(pathToFileURL(resolve(file)).href, { waitUntil: 'load', timeout: timeoutMs });
		await page.waitForFunction(() => Boolean(window.__MWG_SCENARIOS__), undefined, { timeout: timeoutMs });
		const plan = validateScenarioPlan(await page.evaluate(() => window.__MWG_SCENARIOS__.scenarios));
		const selected = plan.filter((scenario) => scenario.id.startsWith(only));
		if (!selected.length) throw new Error(`no scenarios match ${JSON.stringify(only)}`);
		// Refuse a missing step before entering the first scenario.
		await page.evaluate((plan) => {
			const controls = window.__MWG_SCENARIOS__.controls;
			for (const scenario of plan)
				for (const step of [scenario.enter, ...scenario.turn, scenario.verify, scenario.leave].filter(Boolean))
					if (!controls.has(step)) throw new Error(`scene control step is not registered: ${step}`);
		}, selected);
		for (const scenario of selected) {
			current = scenario.id;
			const before = failures.length;
			let played = 0;
			const run = (step) => bounded(page.evaluate((name) => window.__MWG_SCENARIOS__.controls.run(name), step));
			try {
				await run(scenario.enter);
				for (; played < turns; played++) {
					for (const step of scenario.turn) await run(step);
					await run(scenario.verify);
				}
			} catch (error) {
				failures.push(`${current}: ${error.message}`);
			} finally {
				if (scenario.leave && !expired) {
					try {
						await run(scenario.leave);
					} catch (error) {
						failures.push(`${current}: cleanup: ${error.message}`);
					}
				}
			}
			scenarios.push({ id: scenario.id, turns: played, ok: failures.length === before });
			// A timed-out promise is still live in the page. Do not overlap another scenario with it.
			if (expired) break;
		}
		return { ok: failures.length === 0, scenarios, failures };
	} finally {
		await browser.close();
	}
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [file, ...args] = process.argv.slice(2);
	const options = { file };
	try {
		if (!file)
			throw new Error('usage: mwg-scenarios <built index.html> [--turns N] [--timeout-ms N] [--only prefix]');
		for (let i = 0; i < args.length; i += 2) {
			const name = { '--turns': 'turns', '--timeout-ms': 'timeoutMs', '--only': 'only' }[args[i]];
			if (!name || args[i + 1] === undefined) throw new Error(`invalid option: ${args[i]}`);
			options[name] = name === 'only' ? args[i + 1] : Number(args[i + 1]);
		}
		verifyScenarios(options)
			.then((report) => {
				console.log(JSON.stringify(report, null, 2));
				process.exitCode = report.ok ? 0 : 1;
			})
			.catch((error) => {
				console.error(error.message);
				process.exitCode = 1;
			});
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}

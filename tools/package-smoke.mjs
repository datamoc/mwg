import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { smokePage } from './browser-smoke.mjs';

/**
 * The published-package smoke: the central promise is a game you open by double-clicking a
 * local file, and the getting-started tutorial's install paths were only ever followed by hand.
 * `tests/consumer-app.test.ts` names the public specifiers but compiles them against `src/`, so
 * a broken `dist` export map, a `files` leak, or a `file://` regression in a packed build would
 * only surface when someone actually ran the tutorial.
 *
 * Both documented paths are exercised in a scratch directory outside the repo:
 *
 *   - with npm: `npm pack`, install the tarball, build a tiny game through the tutorial's own
 *     vite config, apply step 10's module-to-classic script edit, and open the result;
 *   - without npm: `dist/mw_games.global.js` in a plain `<script>` tag, also from `file://`.
 *
 * Run `npm run build` first. Each page is judged the same way the per-PR visual smoke judges
 * one, and its screenshot lands under `benchmark-results/package-smoke/` for a reviewer.
 */

const root = resolve(import.meta.dirname, '..');
const { devDependencies } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const globalBundle = join(root, 'dist', 'mw_games.global.js');

if (!existsSync(globalBundle)) {
	throw new Error(`no build found at ${globalBundle} - run "npm run build" first`);
}

/** runs a command, inheriting output, and fails the smoke on a non-zero exit */
function run(command, args, cwd) {
	//the outer `npm run` exports npm_config_allow_scripts from the developer's own .npmrc, and
	//npm 12 rejects that as a CLI policy inside a project install; the scratch project's own
	//package.json is the policy this install should follow
	const env = { ...process.env };
	delete env.npm_config_allow_scripts;

	const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: true, env });
	if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status})`);
}

const NPM_INDEX = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<style>
		html, body { margin: 0; height: 100%; background: #101018; overflow: hidden; }
		#game { display: block; width: 100vw; height: 100vh; }
	</style>
</head>
<body>
	<canvas id="game"></canvas>
	<script type="module" src="./main.ts"></script>
</body>
</html>
`;

const NPM_MAIN = `import { Game, Scene2D } from '@datamoc/mw_games/two-d';
import { Shape2D, Text2D } from '@datamoc/mw_games/two-d/render';

class SmokeScene extends Scene2D {
	override create(): void {
		const { width, height } = Game.current;

		//a full-canvas backdrop, so extracting the stage covers the whole canvas rather than
		//just the bounds of whatever small thing was drawn first
		this.stage.addChild(new Shape2D().rect(0, 0, width, height).fill(0x101018));
		this.stage.addChild(new Shape2D().rect(40, 40, 220, 60).fill(0x6fb1ff));
		this.stage.addChild(new Shape2D().rect(40, 120, 220, 60).fill(0xd07080));

		const label = new Text2D({
			text: 'mwg package smoke',
			style: { fill: 0xd8dae6, fontFamily: 'monospace', fontSize: 16 },
		});
		label.position.set(40, 200);
		this.stage.addChild(label);
	}
}

const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });
game.start(SmokeScene).catch((error) => console.error(error));
`;

//the tutorial's step 10: a classic-script build with relative paths, so file:// can load it
const VITE_CONFIG = `import { defineConfig } from 'vite';

export default defineConfig({
	base: './',
	build: {
		rollupOptions: {
			output: { format: 'iife', entryFileNames: 'game.js' },
		},
	},
});
`;

const GLOBAL_INDEX = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<style>
		html, body { margin: 0; height: 100%; background: #101018; overflow: hidden; }
		#game { display: block; width: 100vw; height: 100vh; }
	</style>
</head>
<body>
	<canvas id="game"></canvas>
	<script src="./mw_games.global.js"></script>
	<script>
		const { Game, Scene2D, Shape2D, Text2D } = window.mw_games;

		class SmokeScene extends Scene2D {
			create() {
				const { width, height } = Game.current;

				//a full-canvas backdrop, so extracting the stage covers the whole canvas rather
				//than just the bounds of whatever small thing was drawn first
				this.stage.addChild(new Shape2D().rect(0, 0, width, height).fill(0x101018));
				this.stage.addChild(new Shape2D().rect(40, 40, 220, 60).fill(0x6fb1ff));
				this.stage.addChild(new Shape2D().rect(40, 120, 220, 60).fill(0xd07080));

				const label = new Text2D({
					text: 'mwg package smoke',
					style: { fill: 0xd8dae6, fontFamily: 'monospace', fontSize: 16 },
				});
				label.position.set(40, 200);
				this.stage.addChild(label);
			}
		}

		new Game({ canvas: document.getElementById('game'), background: 0x101018 })
			.start(SmokeScene)
			.catch((error) => console.error(error));
	</script>
</body>
</html>
`;

const scratch = mkdtempSync(join(tmpdir(), 'mwg-package-smoke-'));
console.log(`scratch: ${scratch}`);

try {
	run('npm', ['pack', '--pack-destination', scratch], root);
	const tarball = readdirSync(scratch).find((name) => name.endsWith('.tgz'));
	if (!tarball) throw new Error('npm pack produced no tarball');
	console.log(`packed ${tarball}`);

	// the with-npm path: install the tarball and build through the tutorial's own steps
	const npmApp = join(scratch, 'npm-app');
	mkdirSync(npmApp, { recursive: true });
	writeFileSync(
		join(npmApp, 'package.json'),
		`${JSON.stringify(
			{
				name: 'mwg-package-smoke',
				private: true,
				type: 'module',
				dependencies: {
					'@datamoc/mw_games': `file:${join(scratch, tarball).replace(/\\/g, '/')}`,
					vite: devDependencies.vite,
				},
				//npm 12 refuses lifecycle scripts unless a project allows them by name; esbuild is
				//the one dependency in this tree that installs a platform binary
				allowScripts: { esbuild: true },
			},
			null,
			'\t',
		)}\n`,
	);
	writeFileSync(join(npmApp, 'index.html'), NPM_INDEX);
	writeFileSync(join(npmApp, 'main.ts'), NPM_MAIN);
	writeFileSync(join(npmApp, 'vite.config.ts'), VITE_CONFIG);

	run('npm', ['install', '--no-audit', '--no-fund'], npmApp);
	run('npx', ['vite', 'build'], npmApp);

	// the tutorial's step 10 edit: vite's module tag cannot run from file://
	const distIndex = join(npmApp, 'dist', 'index.html');
	const html = readFileSync(distIndex, 'utf8');
	const rewritten = html.replace(
		/[ \t]*<script[^>]*src="\.\/game\.js"[^>]*><\/script>/,
		'\t<script defer src="./game.js"></script>',
	);
	if (rewritten === html)
		throw new Error('no ./game.js script tag found after the vite build - did the build succeed?');
	writeFileSync(distIndex, rewritten);

	const npmResult = await smokePage({
		url: pathToFileURL(distIndex).href,
		screenshot: join(root, 'benchmark-results', 'package-smoke', 'npm-app.png'),
	});
	console.log(JSON.stringify({ path: 'npm-app', ...npmResult }, null, 2));

	// the no-install path: the standalone global, no node_modules at all
	const globalApp = join(scratch, 'global-app');
	mkdirSync(globalApp, { recursive: true });
	cpSync(globalBundle, join(globalApp, 'mw_games.global.js'));
	writeFileSync(join(globalApp, 'index.html'), GLOBAL_INDEX);

	const globalResult = await smokePage({
		url: pathToFileURL(join(globalApp, 'index.html')).href,
		screenshot: join(root, 'benchmark-results', 'package-smoke', 'global.png'),
	});
	console.log(JSON.stringify({ path: 'global', ...globalResult }, null, 2));

	console.log('\nboth published-package paths reached a working file:// page');
} finally {
	rmSync(scratch, { recursive: true, force: true });
}

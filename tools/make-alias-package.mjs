import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Generates `packages/mw_games`, the `@datamoc/mw_games` package: the former name of
 * `@datamoc/mwg`, kept so installs made under it keep resolving. It holds no code of its own. Every public entry point of the main
 * package gets a one-line module that re-exports the same entry point, and the package
 * depends on the exact matching version, so `npm install @datamoc/mw_games` and
 * `import { Game } from '@datamoc/mw_games/two-d'` behave as the main name does.
 *
 * Generated rather than hand-kept so the two cannot drift: `tests/alias-package.test.ts`
 * fails when the committed folder differs from what this writes.
 */
const SOURCE = '@datamoc/mwg';
const NAME = '@datamoc/mw_games';

/** the file set and package.json for the alias, as `{ path: content }`, from the main package.json */
export function aliasFiles(main) {
	const files = {};
	const exports = {};
	for (const [key, target] of Object.entries(main.exports)) {
		//data entries (the API manifest is JSON) cannot be re-exported as a module
		if (typeof target === 'string' && target.endsWith('.json')) continue;
		const specifier = key === '.' ? SOURCE : `${SOURCE}/${key.slice(2)}`;
		const base = key === '.' ? 'index' : key.slice(2);
		const isTool = typeof target === 'string';
		const js = `${base}.${isTool ? 'mjs' : 'js'}`;
		const dts = `${base}.d.${isTool ? 'mts' : 'ts'}`;
		const body = `export * from '${specifier}';\n`;
		files[js] = body;
		files[dts] = body;
		exports[key] = { types: `./${dts}`, import: `./${js}` };
	}
	files['package.json'] =
		JSON.stringify(
			{
				name: NAME,
				version: main.version,
				description: `The former name of ${SOURCE}, kept for existing installs: every entry point re-exports the same one there.`,
				license: main.license,
				//the same repository, with the folder this package is generated into so npm links to it
				repository: { ...main.repository, directory: 'packages/mw_games' },
				homepage: main.homepage,
				bugs: main.bugs,
				keywords: main.keywords,
				engines: main.engines,
				type: 'module',
				sideEffects: false,
				//a scoped package is private by default, which npm only allows on a paid plan
				publishConfig: { access: 'public' },
				dependencies: { [SOURCE]: main.version },
				exports: { ...exports, './package.json': './package.json' },
				files: ['*.js', '*.mjs', '*.d.ts', '*.d.mts', '**/*.js', '**/*.mjs', '**/*.d.ts', '**/*.d.mts'],
			},
			null,
			'\t',
		) + '\n';
	files['README.md'] =
		`# ${NAME}\n\nThe former name of [\`${SOURCE}\`](https://www.npmjs.com/package/${SOURCE}).\n\n` +
		'```\nnpm install @datamoc/mwg\n```\n\nNew projects install the main name above; this package only forwards to it.\n\n' +
		`\`import { Game } from '${NAME}/two-d'\` is the same module as \`import { Game } from '${SOURCE}/two-d'\`. ` +
		`The \`mwg-*\` command line tools are installed by \`${SOURCE}\`; run them with ` +
		`\`npx -p ${SOURCE} mwg-emit\`. Documentation: ${main.homepage}\n`;
	return files;
}

/** writes the alias folder, replacing what was there */
export function writeAliasPackage(root, out = join(root, 'packages', 'mw_games')) {
	const main = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	rmSync(out, { recursive: true, force: true });
	for (const [path, content] of Object.entries(aliasFiles(main))) {
		const file = join(out, path);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, content, 'utf8');
	}
	return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
	const out = writeAliasPackage(root);
	console.log(`wrote ${existsSync(out) ? out : ''}`);
}

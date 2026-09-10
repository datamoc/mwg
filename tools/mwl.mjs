import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
	collectHookReferences,
	compile,
	compileSources,
	emitHooksDeclaration,
	emitModule,
	extractCatalog,
	parse,
	preprocess,
	validate,
	validateHookReferences,
} from '../dist/mwl/index.js';

/**
 * Command line for MWL: validate, compile, extract-i18n, assets, hooks, build.
 *
 * Reading files happens here, not in the published module, so the library
 * itself stays free of node builtins. `hooks` needs esbuild and says so
 * clearly when it is not installed; the framework does not depend on it, so a
 * project without hooks pays nothing for the feature.
 */

const args = process.argv.slice(2);
const commands = ['validate', 'compile', 'extract-i18n', 'assets', 'hooks', 'build'];
const [command, input] = args;
const outputFlag = args.indexOf('-o');
const output = outputFlag === -1 ? undefined : args[outputFlag + 1];
const manifestFlag = args.indexOf('--manifest');
const manifestPath = manifestFlag === -1 ? undefined : args[manifestFlag + 1];

if (!command || !input || !commands.includes(command)) {
	console.error(
		'Usage: mwl <validate|compile|extract-i18n|assets|hooks|build> input.mwl [-o output] [--manifest hooks.json]',
	);
	process.exitCode = 2;
} else {
	const files = fs.statSync(input).isDirectory()
		? collectSources(input)
		: [{ file: sourceLabel(input), source: fs.readFileSync(input, 'utf8') }];
	if (command === 'validate') {
		const diagnostics = files.flatMap((file) =>
			validate(parse(preprocess(file.source, { file: file.file }), file.file)),
		);
		if (diagnostics.length) {
			for (const diagnostic of diagnostics)
				console.error(
					`${diagnostic.location.file}:${diagnostic.location.line}:${diagnostic.location.column}: ${diagnostic.message}`,
				);
			process.exitCode = 1;
		} else {
			try {
				compileSources(files);
				console.log(`${input}: valid MWL`);
			} catch (error) {
				console.error(error instanceof Error ? error.message : String(error));
				process.exitCode = 1;
			}
		}
	} else if (command === 'hooks') {
		await hooks(files);
	} else if (command === 'build') {
		build(files);
	} else {
		const result = compileSources(files);
		const values =
			command === 'extract-i18n' ? extractCatalog(result) : command === 'assets' ? result.assets : result;
		const text = command === 'compile' ? emitModule(result) : `${JSON.stringify(values, null, '\t')}\n`;
		if (output) {
			fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
			fs.writeFileSync(output, text);
		} else process.stdout.write(text);
	}
}

function collectSources(directory) {
	const files = [];
	const root = path.resolve(directory);
	const label = sourceLabel(root);
	const visit = (current) => {
		for (const entry of fs
			.readdirSync(current, { withFileTypes: true })
			.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) visit(full);
			else if (/\.mwl$/i.test(entry.name)) {
				const relative = path.relative(root, full);
				files.push({
					file: path.join(label, relative).split(path.sep).join('/'),
					source: fs.readFileSync(full, 'utf8'),
				});
			}
		}
	};
	visit(root);
	if (!files.length) throw new Error(`no .mwl files found in ${directory}`);
	return files;
}

function sourceLabel(file) {
	const relative = path.relative(process.cwd(), path.resolve(file));
	return (relative || path.basename(path.resolve(file))).split(path.sep).join('/');
}

/** One deterministic build step for the three files every MWL game consumes. */
function build(files) {
	const game = compileSources(files);
	const directory = path.resolve(output ?? 'generated');
	fs.mkdirSync(directory, { recursive: true });
	fs.writeFileSync(path.join(directory, 'game-data.ts'), emitModule(game));
	fs.writeFileSync(path.join(directory, 'i18n.json'), `${JSON.stringify(extractCatalog(game), null, '\t')}\n`);
	fs.writeFileSync(path.join(directory, 'assets.json'), `${JSON.stringify({ assets: game.assets }, null, '\t')}\n`);
	console.log(`built MWL into ${directory}`);
}

/**
 * `mwl hooks game.mwl` prints the hook references content needs.
 * `mwl hooks game.mwl --manifest hooks.json -o generated/hooks.mjs` resolves
 * each reference against the manifest, bundles the hook sources with esbuild,
 * and writes the matching declaration next to the bundle.
 */
async function hooks(files) {
	const game = compileSources(files);
	const references = collectHookReferences(game);
	if (!output) {
		process.stdout.write(
			`${JSON.stringify(
				references.map((reference) => `${reference.type}:${reference.name}`),
				null,
				'\t',
			)}\n`,
		);
		return;
	}
	const manifest = manifestPath ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
	const diagnostics = validateHookReferences(references, Object.keys(manifest));
	if (diagnostics.length) {
		for (const diagnostic of diagnostics)
			console.error(`${diagnostic.location.file}:${diagnostic.location.line}: ${diagnostic.message}`);
		console.error(`${diagnostics.length} hook reference(s) have no manifest entry; nothing was bundled`);
		process.exitCode = 1;
		return;
	}

	// Resolve esbuild from the game project (the working directory), not from
	// the framework package: the framework does not depend on esbuild, and the
	// project that writes hooks is the one that installs the bundler.
	const requireFromProject = createRequire(pathToFileURL(path.join(process.cwd(), 'package.json')));
	let esbuild = null;
	try {
		esbuild = requireFromProject('esbuild');
	} catch {
		esbuild = null;
	}
	if (!esbuild) {
		console.error('mwl hooks needs esbuild. Install it in the game project: npm install --save-dev esbuild');
		process.exitCode = 2;
		return;
	}

	const manifestDir = manifestPath ? path.dirname(path.resolve(manifestPath)) : process.cwd();
	// The entry file lives beside the hooks so its imports stay relative;
	// esbuild does not resolve `file://` import specifiers.
	const entryFile = path.join(manifestDir, `.mwl-hooks-${process.pid}-${Date.now()}.ts`);
	const imports = [];
	const exports = [];
	references.forEach((reference, index) => {
		const id = `${reference.type}:${reference.name}`;
		const [file, exportName = reference.name] = String(manifest[id]).split('#');
		const relative = path.relative(manifestDir, path.resolve(manifestDir, file)).split(path.sep).join('/');
		const specifier = relative.startsWith('.') ? relative : `./${relative}`;
		imports.push(`import { ${exportName} as hook${index} } from ${JSON.stringify(specifier)};`);
		exports.push(`\t${JSON.stringify(id)}: hook${index},`);
	});
	const entry = `${imports.join('\n')}\n\nexport const hooks = {\n${exports.join('\n')}\n};\n`;
	fs.writeFileSync(entryFile, entry);
	try {
		fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
		await esbuild.build({
			entryPoints: [entryFile],
			bundle: true,
			format: 'esm',
			platform: 'neutral',
			target: 'es2022',
			outfile: output,
			logLevel: 'silent',
		});
		fs.writeFileSync(`${output}.d.ts`, emitHooksDeclaration(references));
		console.log(`bundled ${references.length} hook(s) into ${output}`);
	} finally {
		fs.rmSync(entryFile, { force: true });
	}
}

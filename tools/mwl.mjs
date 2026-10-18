#!/usr/bin/env node
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
	collectHookReferences,
	compile,
	compileAndEmitSources,
	compilePackages,
	compileSources,
	contentReport,
	decodePackage,
	emitArtifacts,
	emitHooksDeclaration,
	emitModule,
	encodePackage,
	extractCatalog,
	generateCredits,
	loadPackage,
	mergePackage,
	packageContent,
	parse,
	preprocess,
	validate,
	validateHookReferences,
	verifyPackage,
} from '../dist/mwl/index.js';

/**
 * Command line for MWL: validate, compile, format, migrate, extract-i18n, assets, report,
 * diagnostics, ci, hooks, build.
 *
 * Reading files happens here, not in the published module, so the library
 * itself stays free of node builtins. `hooks` needs esbuild and says so
 * clearly when it is not installed; the framework does not depend on it, so a
 * project without hooks pays nothing for the feature.
 *
 * `build` is deliberately just the three files every MWL game consumes
 * (game-data.ts, i18n.json, assets.json) plus, opted into with
 * `--asset-root`, one asset-existence check (item 305). A game that needs
 * more than that - its own extra generated module, or a cross-table check
 * this CLI has no flag for (a recipe's ingredient existing in the item
 * table, say) - is not a gap in this command's flags to fill one at a time;
 * every one of `compileSources`, `emitArtifacts`, `validateCatalog` and
 * `contentReport` this command itself calls is public
 * (`@datamoc/mwg/mwl`), so that game's own small Node script, written
 * against the same library API this file uses, is the actual extension
 * point - not a CLI kept open-ended for checks no two games would agree on.
 */

const args = process.argv.slice(2);
const commands = [
	'validate',
	'compile',
	'format',
	'migrate',
	'extract-i18n',
	'assets',
	'report',
	'diagnostics',
	'ci',
	'hooks',
	'build',
	'pack',
	'unpack',
	'verify',
];
const [command, input] = args;
const outputFlag = args.indexOf('-o');
const output = outputFlag === -1 ? undefined : args[outputFlag + 1];
const manifestFlag = args.indexOf('--manifest');
const manifestPath = manifestFlag === -1 ? undefined : args[manifestFlag + 1];
const assetRootFlag = args.indexOf('--asset-root');
const assetRoot = assetRootFlag === -1 ? undefined : args[assetRootFlag + 1];
const targetFlag = args.indexOf('--to');
const target = targetFlag === -1 ? undefined : args[targetFlag + 1];

if (args.includes('--help') || args.includes('-h')) {
	console.log(
		'usage: mwg-mwl <validate|compile|format|migrate|extract-i18n|assets|report|diagnostics|ci|hooks|build|pack|unpack|verify> input.mwl|input.mwp|directory [-o output] [--to 1.0] [--manifest hooks.json] [--asset-root directory] [--audio-converter module] [--allow capabilities] [--json]',
	);
	process.exit(0);
}

if (!command || !input || !commands.includes(command)) {
	console.error(
		'Usage: mwl <validate|compile|format|migrate|extract-i18n|assets|report|diagnostics|ci|hooks|build|pack|unpack|verify> input.mwl|input.mwp|directory [-o output] [--to 1.0] [--manifest hooks.json] [--asset-root directory] [--audio-converter module] [--allow capabilities] [--json]',
	);
	process.exitCode = 2;
} else if (command === 'pack' || command === 'unpack' || command === 'verify' || /.mwp$/i.test(input)) {
	process.exitCode = await packageCommand();
} else {
	const files = fs.statSync(input).isDirectory()
		? collectSources(input)
		: [{ file: sourceLabel(input), source: fs.readFileSync(input, 'utf8') }];
	if (command === 'format' || command === 'migrate') {
		if (command === 'migrate' && target !== '1.0') {
			console.error('mwl migrate currently supports only --to 1.0');
			process.exitCode = 2;
		} else {
			const nodes = files.flatMap((file) => parse(preprocess(file.source, { file: file.file }), file.file));
			const text = `${JSON.stringify(
				nodes.map((node) => formatNode(node, command === 'migrate' ? target : undefined)),
				null,
				'\t',
			)}\n`;
			if (output) {
				fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
				fs.writeFileSync(output, text);
			} else process.stdout.write(text);
		}
	} else if (command === 'diagnostics' || command === 'ci') {
		const diagnostics = diagnose(files);
		const report = command === 'ci' ? { valid: diagnostics.length === 0, diagnostics } : diagnostics;
		const text = `${JSON.stringify(report, null, '\t')}\n`;
		if (output) {
			fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
			fs.writeFileSync(output, text);
		} else process.stdout.write(text);
		if (diagnostics.length) process.exitCode = 1;
	} else if (command === 'validate') {
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
		const report = command === 'report' ? contentReport(result) : values;
		const text = command === 'compile' ? emitModule(result) : `${JSON.stringify(report, null, '\t')}\n`;
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

/** Parse and validate every input without throwing, for machine-readable CI diagnostics. */
function diagnose(files) {
	const diagnostics = [];
	for (const file of files) {
		try {
			diagnostics.push(...validate(parse(preprocess(file.source, { file: file.file }), file.file)));
		} catch (error) {
			if (error?.diagnostic) diagnostics.push(error.diagnostic);
			else
				diagnostics.push({
					code: 'MWL_CLI',
					message: error instanceof Error ? error.message : String(error),
					location: { file: file.file, line: 1, column: 1 },
				});
		}
	}
	return diagnostics.sort(
		(a, b) =>
			a.location.file.localeCompare(b.location.file) ||
			a.location.line - b.location.line ||
			a.location.column - b.location.column ||
			a.code.localeCompare(b.code),
	);
}

/** Emit a stable, source-independent MWL document after preprocessing. */
function formatNode(node, target) {
	const attributes = Object.fromEntries(
		Object.entries(node.attributes).map(([name, value]) => [
			name,
			node.gettext?.includes(name) ? { $gettext: value } : value,
		]),
	);
	if (target === '1.0' && node.tag === 'game') attributes.schema = '1.0';
	return {
		tag: node.tag,
		...attributes,
		...(node.children.length ? { children: node.children.map((child) => formatNode(child, target)) } : {}),
	};
}

/** One deterministic build step for the three files every MWL game consumes. */
function build(files) {
	const game = compileSources(files);
	if (assetRoot) validateAssets(game, path.resolve(assetRoot));
	const directory = path.resolve(output ?? 'generated');
	fs.mkdirSync(directory, { recursive: true });
	const artifacts = compileAndEmitSources(files);
	for (const artifact of artifacts) fs.writeFileSync(path.join(directory, artifact.name), artifact.content);
	console.log(`built MWL into ${directory}`);
}

function validateAssets(game, root) {
	const missing = game.assets.filter(
		(asset) => !asset.startsWith('data:') && !fs.existsSync(path.resolve(root, asset)),
	);
	if (!missing.length) return;
	const locations = new Map();
	const visit = (node) => {
		for (const value of Object.values(node.attributes))
			for (const asset of missing)
				if (value.includes(asset) && !locations.has(asset)) locations.set(asset, node.location);
		node.children.forEach(visit);
	};
	game.roots.forEach(visit);
	for (const asset of missing) {
		const location = locations.get(asset);
		const prefix = location ? `${location.file}:${location.line}:${location.column}: ` : '';
		console.error(`${prefix}missing MWL asset "${asset}" under ${root}`);
	}
	throw new Error(`${missing.length} MWL asset(s) not found`);
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

/**
 * `pack <dir> -o x.mwp` writes a folder (`content.mwl` plus its media) as one package, refusing to
 * write one that `verify` would reject. `unpack x.mwp -o dir` writes the files back. `verify x.mwp`
 * checks digests, limits, schema, references, licences, ROM images and the capabilities requested
 * (`--allow audio,script` applies a game policy, `--json` prints the report, `--share` also demands a
 * licence on every synth-patch bank, as a package meant for others must have). Any other command
 * given a `.mwp` runs on the content the package's characters expand to.
 *
 * Audio conversion to MWA belongs to the retro-audio package, not to mwg: `--audio-converter module`
 * names an ES module whose default export is `(path, bytes) => { path, data } | undefined`, called
 * for chip-music files (.ym .vgm .nsf .sid .dro .imf .cmf). Without it those files are packed as
 * they are, with a warning.
 */
async function packageCommand() {
	const flag = (name) => {
		const at = args.indexOf(name);
		return at === -1 ? undefined : args[at + 1];
	};
	if (command === 'pack') {
		const root = path.resolve(input);
		const converter = flag('--audio-converter');
		const convert = converter ? (await import(pathToFileURL(path.resolve(converter)).href)).default : undefined;
		if (converter && typeof convert !== 'function') throw new Error(`${converter} must default-export a function`);
		const files = [];
		const visit = (directory) => {
			for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
				if (entry.name.startsWith('.')) continue;
				const full = path.join(directory, entry.name);
				if (entry.isDirectory()) visit(full);
				else
					files.push({
						path: path.relative(root, full).split(path.sep).join('/'),
						data: new Uint8Array(fs.readFileSync(full)),
					});
			}
		};
		visit(root);
		const chip = /.(?:ym|vgm|nsf|sid|dro|imf|cmf)$/i;
		const packed = [];
		for (const file of files) {
			if (!chip.test(file.path)) {
				packed.push(file);
				continue;
			}
			if (!convert)
				console.error(`warning: ${file.path} is packed as it is; pass --audio-converter to store it as MWA`);
			packed.push((convert && (await convert(file.path, file.data))) || file);
		}
		const bytes = await encodePackage(packed, { main: flag('--main') });
		const report = await verifyPackage(bytes, { shared: args.includes('--share') });
		for (const warning of report.warnings) console.error(`warning: ${warning}`);
		if (!report.ok) {
			for (const error of report.errors) console.error(`error: ${error}`);
			console.error('nothing was written');
			return 1;
		}
		const target = path.resolve(output ?? `${root}.mwp`);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, bytes);
		console.log(`packed ${packed.length} file(s) into ${target} (${report.ref})`);
		return 0;
	}
	const bytes = new Uint8Array(fs.readFileSync(input));
	if (command === 'verify') {
		const allow = flag('--allow');
		const report = await verifyPackage(bytes, {
			...(allow === undefined ? {} : { policy: { allow: allow.split(',').filter(Boolean) } }),
			shared: args.includes('--share'),
		});
		if (args.includes('--json')) console.log(JSON.stringify(report, null, '	'));
		else {
			for (const warning of report.warnings) console.error(`warning: ${warning}`);
			for (const error of report.errors) console.error(`error: ${error}`);
			if (report.ok)
				console.log(
					`${input}: valid package ${report.ref} (capabilities: ${report.capabilities.join(', ') || 'none'})`,
				);
		}
		return report.ok ? 0 : 1;
	}
	if (command === 'unpack') {
		const decoded = await decodePackage(bytes);
		const target = path.resolve(output ?? input.replace(/.mwp$/i, ''));
		for (const file of decoded.files) {
			const destination = path.resolve(target, file.path);
			if (!destination.startsWith(target + path.sep))
				throw new Error(`${file.path} escapes the output directory`);
			fs.mkdirSync(path.dirname(destination), { recursive: true });
			fs.writeFileSync(destination, file.data);
		}
		console.log(`unpacked ${decoded.files.length} file(s) into ${target}`);
		return 0;
	}
	if (!['validate', 'compile', 'extract-i18n', 'assets', 'report', 'build'].includes(command)) {
		console.error(`mwl ${command} does not take a package; unpack it first`);
		return 2;
	}
	const loaded = await loadPackage(bytes);
	const set = mergePackage(loaded);
	const game = compilePackages(set);
	if (command === 'validate') {
		console.log(`${input}: valid package`);
		return 0;
	}
	if (command === 'build') {
		const directory = path.resolve(output ?? 'generated');
		fs.mkdirSync(directory, { recursive: true });
		const content = JSON.stringify(packageContent(set), null, '	');
		for (const artifact of emitArtifacts(game, {
			artifacts: {
				'package-content.json': `${content}
`,
			},
		}))
			fs.writeFileSync(path.join(directory, artifact.name), artifact.content);
		const credits = generateCredits([loaded.document]);
		if (credits) fs.writeFileSync(path.join(directory, 'CREDITS.txt'), credits);
		console.log(`built package ${loaded.document.meta.id} into ${directory}`);
		return 0;
	}
	const values =
		command === 'extract-i18n' ? extractCatalog(game) : command === 'assets' ? game.assets : contentReport(game);
	const text = `${JSON.stringify(values, null, '	')}
`;
	if (output) fs.writeFileSync(output, text);
	else process.stdout.write(text);
	return 0;
}

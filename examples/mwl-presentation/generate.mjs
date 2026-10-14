import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compilePresentation, emitPresentationModule } from '../../dist/mwl/presentation.js';
import { manifest } from './manifest.ts';
import { format } from 'prettier';

const files = [{ file: 'content.mwl', source: readFileSync(join(import.meta.dirname, 'content.mwl'), 'utf8') }];
const data = compilePresentation(files, manifest);
const output = emitPresentationModule(data);
if (output !== emitPresentationModule(compilePresentation(files, manifest)))
	throw new Error('presentation output is not deterministic');
const folder = join(import.meta.dirname, 'generated');
mkdirSync(folder, { recursive: true });
const prettierOptions = JSON.parse(readFileSync(join(import.meta.dirname, '../../.prettierrc.json'), 'utf8'));
async function writeArtifacts() {
	const artifacts = {
		'presentation.ts': output,
		'i18n.json': JSON.stringify(Object.fromEntries(data.messages.map((message) => [message, message]))),
		'assets.json': JSON.stringify(data.assets),
	};
	for (const [name, content] of Object.entries(artifacts)) {
		const formatted = await format(content, {
			...prettierOptions,
			parser: name.endsWith('.ts') ? 'typescript' : 'json',
		});
		writeFileSync(join(folder, name), formatted);
	}
}
writeArtifacts().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

// The two decorative variants are generated here, so the example borrows no art.
const assets = join(import.meta.dirname, 'assets', 'scenery');
mkdirSync(assets, { recursive: true });
for (const [name, color] of [
	['trees', '#163a28'],
	['snow', '#edf5fb'],
]) {
	const shapes = Array.from({ length: 5 }, (_, i) => {
		const x = i < 3 ? 25 + i * 35 : 520 + (i - 3) * 40;
		return `<path d="M${x} 205 l-12 25 h24 Z" fill="${color}"/>`;
	}).join('');
	writeFileSync(
		join(assets, `${name}.svg`),
		`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${shapes}</svg>\n`,
	);
}

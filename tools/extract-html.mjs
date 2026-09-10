import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const MIME_EXTENSIONS = {
	'text/javascript': '.js',
	'application/javascript': '.js',
	'application/json': '.json',
	'text/css': '.css',
	'image/svg+xml': '.svg',
	'image/png': '.png',
	'image/jpeg': '.jpg',
	'image/gif': '.gif',
	'image/webp': '.webp',
	'audio/wav': '.wav',
	'audio/ogg': '.ogg',
	'audio/mpeg': '.mp3',
	'font/woff2': '.woff2',
};

/**
 * Extract inline HTML resources without parsing the document through a DOM.
 * This keeps the operation usable for large self-contained pages and preserves
 * all unrelated bytes in the source as-is.
 */
export async function extractHtml(inputFile, outputDirectory) {
	const source = await readFile(inputFile, 'utf8');
	const output = resolve(outputDirectory ?? join(dirname(resolve(inputFile)), 'extracted'));
	const assetDirectory = join(output, 'assets');
	await mkdir(output, { recursive: true });
	await rm(assetDirectory, { recursive: true, force: true });
	await mkdir(assetDirectory, { recursive: true });

	const resources = [];
	const warnings = [];
	const bySource = new Map();
	let html = source;
	const inlineBlocks = /<(script|style)(\b[^>]*)>([\s\S]*?)<\/\1\s*>/gi;
	const dataUri = /(\b(?:src|href|poster|content)\s*=\s*["'])(data:([^"']+?))["']/gi;
	const srcset = /(\bsrcset\s*=\s*["'])([^"']+)(["'])/gi;
	const inlineMatches = [...source.matchAll(inlineBlocks)];
	const dataMatches = [...source.matchAll(dataUri)].filter(
		(match) =>
			!inlineMatches.some((block) => match.index >= block.index && match.index < block.index + block[0].length),
	);
	const srcsetMatches = [...source.matchAll(srcset)].filter((match) => match[2].includes('data:'));
	const occurrences = [...inlineMatches.filter((match) => match[3].trim()), ...dataMatches, ...srcsetMatches].sort(
		(a, b) => a.index - b.index,
	);
	const order = new Map(occurrences.map((match, index) => [match.index, index + 1]));
	let nextId = occurrences.length + 1;
	const usedIds = new Set();

	const writeResource = async ({ kind, mime, data, sourceOffset, sourceValue }) => {
		const key = `${mime}\0${data.toString('base64')}`;
		const existing = bySource.get(key);
		if (existing) return existing.path;
		const extension = MIME_EXTENSIONS[mime] ?? extensionForKind(kind);
		let id = order.get(sourceOffset);
		if (id === undefined || usedIds.has(id)) id = nextId++;
		usedIds.add(id);
		const filename = `inline-${String(id).padStart(4, '0')}${extension}`;
		const relativePath = `assets/${filename}`;
		await writeFile(join(assetDirectory, filename), data);
		const resource = {
			kind,
			path: relativePath,
			mime,
			bytes: data.length,
			sourceOffset,
			sourceValue,
		};
		resources.push(resource);
		bySource.set(key, resource);
		return relativePath;
	};

	const replacements = [];
	for (const match of inlineMatches) {
		const tag = match[1].toLowerCase();
		const attributes = match[2];
		const body = match[3];
		if (!body.trim()) continue;
		const type = attributeValue(attributes, 'type');
		const mime =
			tag === 'style'
				? 'text/css'
				: type?.toLowerCase() === 'application/json'
					? 'application/json'
					: 'text/javascript';
		const kind = tag === 'style' ? 'style' : mime === 'application/json' ? 'json' : 'script';
		const path = await writeResource({
			kind,
			mime,
			data: Buffer.from(body),
			sourceOffset: match.index,
			sourceValue: `<${tag}>`,
		});
		if (tag === 'style') {
			let css = body;
			const cssDataUri = /url\(\s*(["']?)(data:[^\)"']+)\1\s*\)/gi;
			for (const cssMatch of [...body.matchAll(cssDataUri)]) {
				const parsed = decodeDataUri(cssMatch[2]);
				if (!parsed) {
					warnings.push(`unsupported CSS data URI at offset ${match.index + cssMatch.index}`);
					continue;
				}
				const assetPath = await writeResource({
					kind: 'css-data-uri',
					mime: parsed.mime,
					data: parsed.data,
					sourceOffset: match.index + cssMatch.index,
					sourceValue: 'data:',
				});
				css = css.replace(cssMatch[2], `./${assetPath.slice('assets/'.length)}`);
			}
			if (css !== body) await writeFile(join(assetDirectory, path.slice('assets/'.length)), css);
		}
		if (kind === 'script' && type?.toLowerCase() === 'module' && /(?:^|[^\w])(?:import|export)\s/.test(body)) {
			warnings.push(`inline module at offset ${match.index} was moved under assets/; verify relative imports`);
		}
		const replacement =
			tag === 'style'
				? `<link${copyStyleAttributes(attributes)} rel="stylesheet" href="./${path}">`
				: `<script${copyScriptAttributes(attributes)} src="./${path}"></script>`;
		replacements.push({ start: match.index, end: match.index + match[0].length, replacement });
	}
	for (const match of dataMatches) {
		const parsed = decodeDataUri(match[2]);
		if (!parsed) {
			warnings.push(`unsupported data URI at offset ${match.index}`);
			continue;
		}
		const path = await writeResource({
			kind: 'data-uri',
			mime: parsed.mime,
			data: parsed.data,
			sourceOffset: match.index,
			sourceValue: 'data:',
		});
		replacements.push({
			start: match.index + match[1].length,
			end: match.index + match[0].length - 1,
			replacement: `./${path}`,
		});
	}
	for (const match of srcsetMatches) {
		const candidates = [];
		for (const candidate of match[2].split(/,\s*(?=data:)/i)) {
			const parts = candidate.trim().split(/\s+/);
			const parsed = decodeDataUri(parts.shift() ?? '');
			if (!parsed) {
				warnings.push(`unsupported srcset data URI at offset ${match.index}`);
				candidates.push(candidate);
				continue;
			}
			const path = await writeResource({
				kind: 'data-uri',
				mime: parsed.mime,
				data: parsed.data,
				sourceOffset: match.index,
				sourceValue: 'data:',
			});
			candidates.push([`./${path}`, ...parts].join(' '));
		}
		replacements.push({
			start: match.index + match[1].length,
			end: match.index + match[0].length - 1,
			replacement: candidates.join(', '),
		});
	}
	for (const replacement of replacements.sort((a, b) => b.start - a.start))
		html = html.slice(0, replacement.start) + replacement.replacement + html.slice(replacement.end);

	resources.sort((a, b) => a.sourceOffset - b.sourceOffset || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	const manifest = {
		version: 1,
		source: basename(inputFile),
		resources,
		warnings,
		fingerprint: crypto.createHash('sha256').update(source).digest('hex'),
	};
	await writeFile(join(output, 'index.html'), html, 'utf8');
	await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, '\t')}\n`, 'utf8');
	return { output, html, resources, warnings, manifest };
}

function extensionForKind(kind) {
	return kind === 'style' ? '.css' : kind === 'json' ? '.json' : '.js';
}

function attributeValue(attributes, name) {
	const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*[\\"']([^\\"']*)[\\"']`, 'i'));
	return match?.[1];
}

function copyScriptAttributes(attributes) {
	return attributes.replace(/\s+(?:src|type)\s*=\s*["'][^"']*["']/gi, '').replace(/\s+$/, '');
}

function copyStyleAttributes(attributes) {
	return attributes.replace(/\s+type\s*=\s*["'][^"']*["']/gi, '').replace(/\s+$/, '');
}

function decodeDataUri(value) {
	const comma = value.indexOf(',');
	if (comma === -1) return null;
	const header = value.slice(5, comma);
	const payload = value.slice(comma + 1);
	const fields = header.split(';');
	const mime = fields.shift() || 'text/plain';
	try {
		return {
			mime,
			data: fields.includes('base64') ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload)),
		};
	} catch {
		return null;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const input = process.argv[2];
	const outputFlag = process.argv.indexOf('-o');
	const output = outputFlag === -1 ? undefined : process.argv[outputFlag + 1];
	if (!input || (outputFlag !== -1 && !output)) {
		console.error('Usage: node tools/extract-html.mjs input.html [-o output-directory]');
		process.exitCode = 2;
	} else {
		const result = await extractHtml(input, output);
		console.log(`extracted ${result.resources.length} resource(s) into ${result.output}`);
		for (const warning of result.warnings) console.warn(`warning: ${warning}`);
	}
}

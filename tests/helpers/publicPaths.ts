import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** the repository root, from this file's own location */
const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/**
 * The public subpath -> `src` barrel mapping, derived from `package.json`'s own `exports`
 * field so a rename updates the checks automatically rather than leaving them pointing at a
 * path that no longer exists.
 *
 * Shared by the two tests that resolve `@datamoc/mw_games/...` specifiers onto source -
 * `api-examples.test.ts` and `consumer-app.test.ts` - which used to carry a copy each, free to
 * drift apart.
 */
export function publicPathMap(): Record<string, string> {
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
	const map: Record<string, string> = {};

	for (const [subpath, target] of Object.entries<unknown>(pkg.exports)) {
		if (subpath.startsWith('./tools')) continue;
		const distPath = typeof target === 'string' ? target : (target as { import: string }).import;
		const srcPath = distPath.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts');
		const specifier = subpath === '.' ? pkg.name : `${pkg.name}${subpath.slice(1)}`;
		//an absolute path rather than baseUrl + relative: TypeScript 7 removed `baseUrl` outright
		map[specifier] = join(ROOT, srcPath);
	}
	return map;
}

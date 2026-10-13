/** the alias package's files as `{ path: content }`, from the main package.json */
export function aliasFiles(main: {
	version: string;
	license?: string;
	repository?: unknown;
	exports: Record<string, string | Record<string, string>>;
}): Record<string, string>;

/** writes `packages/mwg` (or `out`), replacing what was there; returns the folder */
export function writeAliasPackage(root: string, out?: string): string;

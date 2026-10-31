/**
 * One filesystem for a hosted game, whichever route reads it.
 *
 * A modded game expects its toolchain to write a generated cache or a lock file through `fs`
 * and read the same path back through `fetch`, `XMLHttpRequest` or an element URL. A standalone
 * host splits those routes, so a file just written is invisible to the others and every probe of
 * a not-yet-generated file shows up as an HTTP 404. `VirtualFileSystem` is the one store behind
 * all of them: a read-only mount of the files the game shipped, a writable overlay on top, and
 * a durability rule per path pattern that the game declares instead of the host hard-coding a
 * name list. `installVirtualReads` points `fetch`, `XMLHttpRequest` and element `src` at it.
 *
 * Reads and writes are synchronous (a Node-style `fs` shim cannot await); durability is the
 * adapter's job, written behind the call and awaited with `flush()`. Renderer-free.
 */

/** how long a written path lives: `'durable'` goes to the writeback adapter, `'session'` is forgotten with the page */
export type VirtualDurability = 'durable' | 'session';

export interface VirtualDurabilityRule {
	/** a path pattern: `*` matches within one segment, `**` across segments, `?` one character */
	pattern: string;
	durability: VirtualDurability;
}

/** the files a game shipped, as a read-only layer under the overlay */
export interface VirtualMount {
	read(path: string): Uint8Array | undefined;
	/** every file path the mount holds, for listings */
	paths(): Iterable<string>;
}

/** where durable writes go: `null` from `load` for a path means it was deleted */
export interface VirtualWriteback {
	load(): Promise<Iterable<readonly [path: string, bytes: Uint8Array | null]>>;
	put(path: string, bytes: Uint8Array): Promise<void>;
	remove(path: string): Promise<void>;
}

export interface VirtualStat {
	size: number;
	mtime: number;
	isDirectory: boolean;
}

export interface VirtualFileSystemOptions {
	/** the read-only layer; a plain map of path to bytes or text works too */
	mount?: VirtualMount | ReadonlyMap<string, Uint8Array | string>;
	/** first matching rule wins; a path no rule names is `'durable'` */
	durability?: readonly VirtualDurabilityRule[];
	/** durable writes and deletes are sent here; without one every write is session-only */
	writeback?: VirtualWriteback;
	/** the clock for `mtime`, injectable for tests */
	now?: () => number;
}

/**
 * A Node-shaped error: `code` is `'ENOENT'`, `'EISDIR'`, `'ENOTDIR'` or `'EINVAL'`, so a shim of
 * `fs` can pass it on and game code that tests `error.code` keeps working.
 *
 * @example
 * ```ts
 * import { VirtualFileError, VirtualFileSystem } from '@datamoc/mwg/assets/virtualfs';
 *
 * try {
 * 	new VirtualFileSystem().readFile('missing.json');
 * } catch (error) {
 * 	console.log(error instanceof VirtualFileError && error.code); // 'ENOENT'
 * }
 * ```
 */
export class VirtualFileError extends Error {
	readonly code: 'ENOENT' | 'EISDIR' | 'ENOTDIR' | 'EINVAL';
	readonly path: string;

	constructor(code: 'ENOENT' | 'EISDIR' | 'ENOTDIR' | 'EINVAL', path: string) {
		super(`${code}: ${path}`);
		this.name = 'VirtualFileError';
		this.code = code;
		this.path = path;
	}
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * A path as the store keys it: no leading slash or `./`, `..` resolved, never above the root
 * (that throws `EINVAL`), backslashes read as slashes.
 *
 * @example
 * ```ts
 * import { normalizeVirtualPath } from '@datamoc/mwg/assets/virtualfs';
 *
 * console.log(normalizeVirtualPath('/game/./data//maps/../items.json')); // 'game/data/items.json'
 * ```
 */
export function normalizeVirtualPath(path: string): string {
	const parts: string[] = [];
	for (const part of path.replace(/\\/g, '/').split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') {
			if (parts.length === 0) throw new VirtualFileError('EINVAL', path);
			parts.pop();
		} else parts.push(part);
	}
	return parts.join('/');
}

function patternToRegExp(pattern: string): RegExp {
	let source = '';
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		if (char === '*') {
			if (pattern[i + 1] === '*') {
				source += '.*';
				i++;
			} else source += '[^/]*';
		} else if (char === '?') source += '[^/]';
		else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	}
	return new RegExp(`^${source}$`);
}

function toBytes(data: Uint8Array | string): Uint8Array {
	return typeof data === 'string' ? encoder.encode(data) : data;
}

interface Entry {
	bytes: Uint8Array | null;
	mtime: number;
	durable: boolean;
}

/**
 * A shipped layer, a writable overlay and a durability policy behind one synchronous API.
 * Deleting a shipped file records a tombstone in the overlay, so the file stays gone and the
 * deletion itself is durable like a write.
 *
 * @example
 * ```ts
 * import { VirtualFileSystem } from '@datamoc/mwg/assets/virtualfs';
 *
 * const fs = new VirtualFileSystem({
 * 	mount: new Map([['data/items.json', '[]']]),
 * 	durability: [{ pattern: 'cache/*.lock', durability: 'session' }],
 * });
 * fs.writeFile('cache/items.bin', new Uint8Array([1, 2, 3]));
 * console.log(fs.readdir('cache'), fs.readText('data/items.json')); // ['items.bin'] '[]'
 * ```
 */
export class VirtualFileSystem {
	private readonly overlay = new Map<string, Entry>();
	private readonly shipped: VirtualMount;
	private readonly rules: { test: RegExp; durability: VirtualDurability }[];
	private readonly writeback: VirtualWriteback | undefined;
	private readonly now: () => number;
	private liveBelow: Map<string, number> | undefined;
	private pending: Promise<unknown> = Promise.resolve();
	private failure: unknown;

	constructor(options: VirtualFileSystemOptions = {}) {
		const mount = options.mount;
		this.shipped =
			mount && 'read' in mount
				? mount
				: mapMount(
						new Map([...(mount ?? [])].map(([path, data]) => [normalizeVirtualPath(path), toBytes(data)])),
					);
		this.rules = (options.durability ?? []).map((rule) => ({
			test: patternToRegExp(normalizeVirtualPath(rule.pattern)),
			durability: rule.durability,
		}));
		this.writeback = options.writeback;
		this.now = options.now ?? Date.now;
	}

	/** reads back what the adapter holds, so the overlay survives a reload; call once before the game reads */
	async restore(): Promise<void> {
		if (!this.writeback) return;
		for (const [path, bytes] of await this.writeback.load()) {
			this.overlay.set(normalizeVirtualPath(path), { bytes, mtime: this.now(), durable: true });
		}
		this.liveBelow = undefined;
	}

	durabilityOf(path: string): VirtualDurability {
		const key = normalizeVirtualPath(path);
		return this.rules.find((rule) => rule.test.test(key))?.durability ?? 'durable';
	}

	private lookup(key: string): Uint8Array | undefined {
		const entry = this.overlay.get(key);
		return entry ? (entry.bytes ?? undefined) : this.shipped.read(key);
	}

	private files(): Set<string> {
		const found = new Set<string>();
		for (const path of this.shipped.paths()) found.add(path);
		for (const [path, entry] of this.overlay) {
			if (entry.bytes) found.add(path);
			else found.delete(path);
		}
		return found;
	}

	/** how many live files sit under each directory, so a probe of a path costs one lookup instead of a scan */
	private counts(): Map<string, number> {
		if (!this.liveBelow) {
			this.liveBelow = new Map();
			for (const path of this.files()) this.countFile(path, 1);
		}
		return this.liveBelow;
	}

	private countFile(path: string, delta: number): void {
		const counts = this.liveBelow;
		if (!counts) return;
		for (let slash = path.lastIndexOf('/'); slash > 0; slash = path.lastIndexOf('/', slash - 1)) {
			const dir = path.slice(0, slash);
			counts.set(dir, (counts.get(dir) ?? 0) + delta);
		}
	}

	private isDirectory(key: string): boolean {
		return key === '' || (this.counts().get(key) ?? 0) > 0;
	}

	exists(path: string): boolean {
		const key = normalizeVirtualPath(path);
		return this.lookup(key) !== undefined || this.isDirectory(key);
	}

	readFile(path: string): Uint8Array {
		const key = normalizeVirtualPath(path);
		const bytes = this.lookup(key);
		if (bytes) return bytes;
		throw new VirtualFileError(this.isDirectory(key) ? 'EISDIR' : 'ENOENT', path);
	}

	readText(path: string): string {
		return decoder.decode(this.readFile(path));
	}

	stat(path: string): VirtualStat {
		const key = normalizeVirtualPath(path);
		const bytes = this.lookup(key);
		const entry = this.overlay.get(key);
		if (bytes) return { size: bytes.length, mtime: entry?.mtime ?? 0, isDirectory: false };
		if (this.isDirectory(key)) return { size: 0, mtime: 0, isDirectory: true };
		throw new VirtualFileError('ENOENT', path);
	}

	/** the names directly under a directory, sorted */
	readdir(path: string): string[] {
		const key = normalizeVirtualPath(path);
		if (!this.isDirectory(key)) throw new VirtualFileError(this.lookup(key) ? 'ENOTDIR' : 'ENOENT', path);
		const prefix = key === '' ? '' : `${key}/`;
		const names = new Set<string>();
		for (const file of this.files()) {
			if (file.startsWith(prefix)) names.add(file.slice(prefix.length).split('/')[0]);
		}
		return [...names].sort();
	}

	writeFile(path: string, data: Uint8Array | string): void {
		const key = normalizeVirtualPath(path);
		if (key === '' || this.isDirectory(key)) throw new VirtualFileError('EISDIR', path);
		const bytes = toBytes(data).slice();
		const durable = this.durabilityOf(key) === 'durable';
		const existed = this.lookup(key) !== undefined;
		this.overlay.set(key, { bytes, mtime: this.now(), durable });
		if (!existed) this.countFile(key, 1);
		if (durable) this.enqueue(() => this.writeback?.put(key, bytes));
	}

	/** deletes a file; one the game shipped stays gone through a tombstone */
	unlink(path: string): void {
		const key = normalizeVirtualPath(path);
		if (this.lookup(key) === undefined)
			throw new VirtualFileError(this.isDirectory(key) ? 'EISDIR' : 'ENOENT', path);
		this.drop(key);
	}

	/** deletes a file or a whole directory; a missing path is not an error */
	rm(path: string): void {
		const key = normalizeVirtualPath(path);
		const prefix = `${key}/`;
		for (const file of this.files()) if (file === key || file.startsWith(prefix)) this.drop(file);
	}

	private drop(key: string): void {
		const durable = this.durabilityOf(key) === 'durable';
		const inShipped = this.shipped.read(key) !== undefined;
		if (inShipped) this.overlay.set(key, { bytes: null, mtime: this.now(), durable });
		else this.overlay.delete(key);
		this.countFile(key, -1);
		if (durable) this.enqueue(() => this.writeback?.remove(key));
	}

	private enqueue(task: () => Promise<void> | undefined): void {
		this.pending = this.pending.then(task).catch((error: unknown) => {
			this.failure ??= error;
		});
	}

	/** resolves once every durable write so far reached the adapter, and rejects with the first adapter failure since the last flush */
	async flush(): Promise<void> {
		await this.pending;
		const failure = this.failure;
		this.failure = undefined;
		if (failure !== undefined) throw failure;
	}

	/** a `blob:` URL for a file's bytes, for an element or an `XMLHttpRequest` that cannot be handed a `Response` */
	objectUrl(
		path: string,
		type = '',
		createObjectURL: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
	): string {
		return createObjectURL(new Blob([this.readFile(path) as BlobPart], { type }));
	}
}

function mapMount(files: Map<string, Uint8Array>): VirtualMount {
	return { read: (path) => files.get(path), paths: () => files.keys() };
}

/**
 * The writeback adapter that keeps everything in a map: for tests, and a host with nowhere else to put it.
 *
 * @example
 * ```ts
 * import { memoryWriteback, VirtualFileSystem } from '@datamoc/mwg/assets/virtualfs';
 *
 * const writeback = memoryWriteback();
 * const fs = new VirtualFileSystem({ writeback });
 * fs.writeFile('save/slot1.json', '{}');
 * await fs.flush();
 * console.log([...writeback.files.keys()]); // ['save/slot1.json']
 * ```
 */
export function memoryWriteback(initial: Iterable<readonly [string, Uint8Array]> = []): VirtualWriteback & {
	readonly files: Map<string, Uint8Array>;
} {
	const files = new Map(initial);
	return {
		files,
		load: async () => [...files],
		put: async (path, bytes) => void files.set(path, bytes),
		remove: async (path) => void files.delete(path),
	};
}

const MIME: Record<string, string> = {
	json: 'application/json',
	js: 'text/javascript',
	txt: 'text/plain',
	html: 'text/html',
	css: 'text/css',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	ogg: 'audio/ogg',
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	mid: 'audio/midi',
	woff: 'font/woff',
	woff2: 'font/woff2',
	ttf: 'font/ttf',
};

/**
 * The content type a file's extension implies, `application/octet-stream` when unknown.
 *
 * @example
 * ```ts
 * import { virtualMimeType } from '@datamoc/mwg/assets/virtualfs';
 *
 * console.log(virtualMimeType('img/hero.PNG'), virtualMimeType('data/blob.bin')); // 'image/png' 'application/octet-stream'
 * ```
 */
export function virtualMimeType(path: string): string {
	return MIME[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';
}

export interface VirtualReadsOptions {
	/** the URL prefix the filesystem owns, such as `'game/'`; only URLs under it are answered, the rest pass through. Empty owns every relative URL. */
	prefix?: string;
	/** the global object to patch: `globalThis` when omitted */
	target?: Record<string, any>;
}

/**
 * Makes `fetch`, `XMLHttpRequest` and element `src` attributes (images, audio, video, scripts)
 * read from the filesystem. A URL under `prefix` is answered entirely from the store and never
 * reaches the network: a file the overlay holds comes back 200, one it lacks comes back 404
 * with no request at all, so a probe of a not-yet-generated cache is silent. Anything else
 * passes to the original. Returns a function that restores the originals.
 *
 * `XMLHttpRequest` and elements are pointed at a `blob:` URL of the file, so their own
 * response handling is untouched; a missing file completes an `XMLHttpRequest` as a 404 with no request. This is a page-script patch, which needs no service worker
 * and so works from `file://`; a host that serves a real origin may add a worker for requests
 * made before the patch runs.
 *
 * @example
 * ```ts
 * import { installVirtualReads, VirtualFileSystem } from '@datamoc/mwg/assets/virtualfs';
 *
 * const fs = new VirtualFileSystem({ mount: new Map([['data/map.json', '{}']]) });
 * const uninstall = installVirtualReads(fs, { prefix: 'game/' });
 * const response = await fetch('game/data/map.json');
 * console.log(response.status, await response.json()); // 200 {}
 * uninstall();
 * ```
 */
export function installVirtualReads(fs: VirtualFileSystem, options: VirtualReadsOptions = {}): () => void {
	const target = options.target ?? (globalThis as Record<string, any>);
	const prefix = options.prefix ?? '';
	const restore: (() => void)[] = [];

	/** the store path a URL names, or undefined when the URL is not this filesystem's */
	const owned = (url: string): string | undefined => {
		if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return undefined;
		const clean = url.split(/[?#]/)[0];
		const path = normalizeVirtualPath(decodeURIComponent(clean));
		const stem = normalizeVirtualPath(prefix);
		if (stem === '') return path;
		return path === stem || path.startsWith(`${stem}/`) ? path.slice(stem.length).replace(/^\//, '') : undefined;
	};
	const hit = (path: string): Uint8Array | undefined => {
		try {
			return fs.readFile(path);
		} catch {
			return undefined;
		}
	};
	const blobUrl = (path: string, bytes: Uint8Array): string =>
		(target.URL ?? URL).createObjectURL(new Blob([bytes as BlobPart], { type: virtualMimeType(path) }));

	const originalFetch = target.fetch;
	if (originalFetch) {
		target.fetch = (input: unknown, init?: unknown) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request)?.url;
			const path = typeof url === 'string' ? owned(url) : undefined;
			if (path === undefined) return originalFetch.call(target, input, init);
			const bytes = hit(path);
			return Promise.resolve(
				bytes
					? new Response(bytes as BodyInit, {
							status: 200,
							headers: { 'content-type': virtualMimeType(path) },
						})
					: new Response(null, { status: 404, statusText: 'Not Found' }),
			);
		};
		restore.push(() => (target.fetch = originalFetch));
	}

	const xhrProto = target.XMLHttpRequest?.prototype;
	if (xhrProto) {
		const originalOpen = xhrProto.open;
		const originalSend = xhrProto.send;
		const absent = new WeakSet<object>();
		xhrProto.open = function (this: object, method: string, url: string | URL, ...rest: unknown[]) {
			const path = owned(String(url));
			absent.delete(this);
			if (path === undefined) return originalOpen.call(this, method, url, ...rest);
			const bytes = hit(path);
			if (!bytes) absent.add(this);
			return originalOpen.call(this, method, bytes ? blobUrl(path, bytes) : 'data:,', ...rest);
		};
		//a missing file completes as the 404 a server would send, without a request
		xhrProto.send = function (this: EventTarget, ...args: unknown[]) {
			if (!absent.has(this)) return originalSend.apply(this, args);
			const Ev = target.Event ?? Event;
			setTimeout(() => {
				Object.defineProperties(this, {
					readyState: { value: 4, configurable: true },
					status: { value: 404, configurable: true },
					statusText: { value: 'Not Found', configurable: true },
					response: { value: '', configurable: true },
					responseText: { value: '', configurable: true },
				});
				for (const type of ['readystatechange', 'load', 'loadend']) this.dispatchEvent(new Ev(type));
			}, 0);
		};
		restore.push(() => {
			xhrProto.open = originalOpen;
			xhrProto.send = originalSend;
		});
	}

	for (const name of ['HTMLImageElement', 'HTMLMediaElement', 'HTMLScriptElement']) {
		const proto = target[name]?.prototype;
		const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'src');
		if (!descriptor?.set || !descriptor.get) continue;
		const { get, set } = descriptor;
		Object.defineProperty(proto, 'src', {
			...descriptor,
			get,
			set(this: unknown, value: string) {
				const path = owned(String(value));
				const bytes = path === undefined ? undefined : hit(path);
				set.call(this, path !== undefined && bytes ? blobUrl(path, bytes) : value);
			},
		});
		restore.push(() => Object.defineProperty(proto, 'src', descriptor));
	}

	return () => {
		for (const undo of restore.reverse()) undo();
	};
}

/** one mod the filesystem holds under the mods directory */
export interface VirtualMod {
	id: string;
	/** the mod's directory, relative to the root */
	dir: string;
	enabled: boolean;
}

export interface VirtualModOptions {
	/** where mods live; `'mods'` when omitted */
	dir?: string;
	/** the file in a mod's directory that marks it as a mod; `'mod.json'` when omitted */
	manifest?: string;
}

const MOD_STATE = '.mwg/mods.json';

function readModState(fs: VirtualFileSystem): Record<string, boolean> {
	if (!fs.exists(MOD_STATE)) return {};
	return JSON.parse(fs.readText(MOD_STATE)) as Record<string, boolean>;
}

/**
 * The mods under `dir`: each subdirectory holding a manifest file, with its enable state. A mod
 * with no recorded state is enabled; `setVirtualModEnabled` records the player's choice in the
 * filesystem itself, so it follows the same durability rule as any other file.
 *
 * @example
 * ```ts
 * import { listVirtualMods, setVirtualModEnabled, VirtualFileSystem } from '@datamoc/mwg/assets/virtualfs';
 *
 * const fs = new VirtualFileSystem({ mount: new Map([['mods/hd/mod.json', '{}']]) });
 * setVirtualModEnabled(fs, 'hd', false);
 * console.log(listVirtualMods(fs)); // [{ id: 'hd', dir: 'mods/hd', enabled: false }]
 * ```
 */
export function listVirtualMods(fs: VirtualFileSystem, options: VirtualModOptions = {}): VirtualMod[] {
	const dir = normalizeVirtualPath(options.dir ?? 'mods');
	const manifest = options.manifest ?? 'mod.json';
	if (!fs.exists(dir)) return [];
	const state = readModState(fs);
	return fs
		.readdir(dir)
		.filter((id) => fs.exists(`${dir}/${id}/${manifest}`))
		.map((id) => ({ id, dir: `${dir}/${id}`, enabled: state[id] !== false }));
}

/** records whether a mod is enabled; the state lives at `.mwg/mods.json` in the filesystem */
export function setVirtualModEnabled(fs: VirtualFileSystem, id: string, enabled: boolean): void {
	fs.writeFile(MOD_STATE, JSON.stringify({ ...readModState(fs), [id]: enabled }));
}

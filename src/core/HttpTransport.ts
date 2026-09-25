import { checkSize, parseInbound } from './Sanitize.ts';

export interface HttpTransportOptions {
	endpoint: string;
	timeoutMs?: number;
	fetch?: typeof globalThis.fetch;
	/** largest response body read, in bytes; defaults to 10 MB */
	maxResponseBytes?: number;
	/** accept `http://` to a host other than this machine; off by default */
	allowInsecure?: boolean;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Throws unless `url` is encrypted (`https:`/`wss:`) or stays on this machine (`localhost`,
 * `127.0.0.1`, `[::1]`), or `allowInsecure` says otherwise. A save, a telemetry event or a
 * multiplayer input sent in clear text is readable and alterable by anyone on the path; a
 * relative url inherits the page's own scheme, so it is accepted as is.
 */
export function assertSecureUrl(url: string, label: string, allowInsecure = false): void {
	if (allowInsecure || !/^[a-z][a-z0-9+.-]*:/i.test(url)) return;
	const parsed = new URL(url);
	if (parsed.protocol === 'https:' || parsed.protocol === 'wss:') return;
	if ((parsed.protocol === 'http:' || parsed.protocol === 'ws:') && LOCAL_HOSTS.has(parsed.hostname)) return;
	throw new Error(
		`${label} url must use https: or wss: (got ${parsed.protocol}//${parsed.host}); pass allowInsecure: true to accept it`,
	);
}

/**
 * The constructor validation and timeout-wrapped fetch shared by every injectable HTTPS
 * transport here (`FeedbackClient`, `NewsClient`, `SaveSyncClient`, `TelemetryClient`) - each one is a
 * plain request/response against a game's own endpoint, differing only in what they send and
 * expect back, not in how the endpoint/timeout/fetch options are validated or how a request
 * is aborted after `timeoutMs`. `label` names the concrete client in its own error messages
 * ("feedback endpoint is required", not a generic one that would leave a game guessing which
 * of several clients threw).
 */
export abstract class HttpTransport {
	protected readonly endpoint: string;
	protected readonly timeoutMs: number;
	protected readonly fetchFn: typeof globalThis.fetch;
	protected readonly maxResponseBytes: number;
	private readonly label: string;

	constructor(options: HttpTransportOptions, label: string) {
		if (!options.endpoint) throw new Error(`${label} endpoint is required`);
		assertSecureUrl(options.endpoint, `${label} endpoint`, options.allowInsecure);
		this.endpoint = options.endpoint;
		this.label = label;
		this.maxResponseBytes = options.maxResponseBytes ?? 10 * 1024 * 1024;
		this.timeoutMs = options.timeoutMs ?? 10000;
		if (!(this.timeoutMs > 0)) throw new Error(`${label} timeout must be positive`);
		this.fetchFn = options.fetch ?? globalThis.fetch;
		if (!this.fetchFn) throw new Error(`fetch is unavailable; provide ${label}Options.fetch`);
	}

	protected async withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			return await run(controller.signal);
		} finally {
			clearTimeout(timer);
		}
	}

	/** the response body as text, refused as soon as it passes `maxResponseBytes` rather than after it is all in memory */
	protected async readText(response: Response): Promise<string> {
		const limit = this.maxResponseBytes;
		const declared = Number(response.headers?.get?.('content-length'));
		if (declared > limit)
			throw new Error(`${this.label} response exceeds the ${limit}-byte limit (${declared} bytes)`);
		if (!response.body) {
			const text = await response.text();
			checkSize(text, { maxBytes: limit });
			return text;
		}
		const reader = response.body.getReader();
		const chunks: Uint8Array[] = [];
		let size = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > limit) {
				await reader.cancel();
				throw new Error(`${this.label} response exceeds the ${limit}-byte limit`);
			}
			chunks.push(value);
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return new TextDecoder().decode(bytes);
	}

	/** `readText`, then `parseInbound` */
	protected async readJson(response: Response, what: string): Promise<unknown> {
		return parseInbound(await this.readText(response), {
			maxBytes: this.maxResponseBytes,
			label: `${this.label} ${what}`,
		});
	}
}

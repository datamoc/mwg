export interface HttpTransportOptions {
	endpoint: string;
	timeoutMs?: number;
	fetch?: typeof globalThis.fetch;
}

/**
 * The constructor validation and timeout-wrapped fetch shared by every injectable HTTPS
 * transport here (`FeedbackClient`, `SaveSyncClient`, `TelemetryClient`) - each one is a
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

	constructor(options: HttpTransportOptions, label: string) {
		if (!options.endpoint) throw new Error(`${label} endpoint is required`);
		this.endpoint = options.endpoint;
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
}

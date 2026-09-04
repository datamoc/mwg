/**
 * Uploads/downloads one `SaveSystem.exportSlot` payload to a game's own HTTPS endpoint - the
 * server half of item 124's save export/import, following `FeedbackClient`'s own shape
 * (an injectable transport a game points at its own endpoint) rather than a second pattern:
 * `mwg` ships no backend and assumes none here either.
 */
export interface SaveSyncOptions {
	endpoint: string;
	timeoutMs?: number;
	fetch?: typeof globalThis.fetch;
}

export interface SaveSyncResponse {
	ok: boolean;
	status: number;
}

export class SaveSyncClient {
	private readonly endpoint: string;
	private readonly timeoutMs: number;
	private readonly fetchFn: typeof globalThis.fetch;

	constructor(options: SaveSyncOptions) {
		if (!options.endpoint) throw new Error('save sync endpoint is required');
		this.endpoint = options.endpoint;
		this.timeoutMs = options.timeoutMs ?? 10000;
		if (!(this.timeoutMs > 0)) throw new Error('save sync timeout must be positive');
		this.fetchFn = options.fetch ?? globalThis.fetch;
		if (!this.fetchFn) throw new Error('fetch is unavailable; provide SaveSyncOptions.fetch');
	}

	/** sends an `exportSlot` payload to the endpoint, replacing whatever it held before */
	async upload(payload: string): Promise<SaveSyncResponse> {
		if (!payload) throw new Error('save sync payload cannot be empty');
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const response = await this.fetchFn(this.endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ payload }),
				signal: controller.signal,
			});
			if (!response.ok) throw new Error(`save upload failed with HTTP ${response.status}`);
			return { ok: true, status: response.status };
		} finally {
			clearTimeout(timer);
		}
	}

	/** fetches whatever payload the endpoint currently holds, ready for `SaveSystem.importSlot` */
	async download(): Promise<string> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const response = await this.fetchFn(this.endpoint, { signal: controller.signal });
			if (!response.ok) throw new Error(`save download failed with HTTP ${response.status}`);
			const data = (await response.json()) as { payload?: unknown };
			if (typeof data.payload !== 'string') throw new Error('save download response missing a string payload');
			return data.payload;
		} finally {
			clearTimeout(timer);
		}
	}
}

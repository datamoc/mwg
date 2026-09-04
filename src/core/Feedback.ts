export interface FeedbackRequest {
	message: string;
	contact?: string;
	context?: Record<string, string | number | boolean>;
}

export interface FeedbackOptions {
	endpoint: string;
	timeoutMs?: number;
	fetch?: typeof globalThis.fetch;
}

export interface FeedbackResponse {
	ok: boolean;
	status: number;
}

/** Small, injectable transport for a game's own feedback endpoint. */
export class FeedbackClient {
	private readonly endpoint: string;
	private readonly timeoutMs: number;
	private readonly fetchFn: typeof globalThis.fetch;

	constructor(options: FeedbackOptions) {
		if (!options.endpoint) throw new Error('feedback endpoint is required');
		this.endpoint = options.endpoint;
		this.timeoutMs = options.timeoutMs ?? 10000;
		if (!(this.timeoutMs > 0)) throw new Error('feedback timeout must be positive');
		this.fetchFn = options.fetch ?? globalThis.fetch;
		if (!this.fetchFn) throw new Error('fetch is unavailable; provide FeedbackOptions.fetch');
	}

	async submit(request: FeedbackRequest): Promise<FeedbackResponse> {
		if (!request.message?.trim()) throw new Error('feedback message cannot be empty');
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const response = await this.fetchFn(this.endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(request),
				signal: controller.signal,
			});
			if (!response.ok) throw new Error(`feedback request failed with HTTP ${response.status}`);
			return { ok: true, status: response.status };
		} finally {
			clearTimeout(timer);
		}
	}
}

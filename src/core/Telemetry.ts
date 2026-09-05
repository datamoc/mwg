export interface TelemetryEvent {
	name: string;
	properties?: Record<string, string | number | boolean | null>;
}

export interface TelemetryOptions {
	endpoint: string;
	timeoutMs?: number;
	fetch?: typeof globalThis.fetch;
}

export interface TelemetryResponse {
	ok: boolean;
	status: number;
}

/**
 * An injectable transport for automatic, structured analytics events - `FeedbackClient`'s own
 * shape, for a different question. `FeedbackClient` is a player choosing to write something
 * and send it; this is a game deciding on its own to send something, which needs its own
 * consent gate before anything ever leaves the machine, unlike a player action that already
 * consents to sending just by happening. `send` is a silent no-op, not an error, until
 * `setConsent(true)` has been called - automatic collection defaults off.
 *
 * `mwg` stays opinion-free on what an event actually contains, what "consent" means for a
 * given game (a settings toggle, a first-launch prompt, a platform-level flag), and where the
 * endpoint lives - the same boundary `FeedbackClient`'s own doc comment draws for manual
 * reports.
 */
export class TelemetryClient {
	private readonly endpoint: string;
	private readonly timeoutMs: number;
	private readonly fetchFn: typeof globalThis.fetch;
	private consented = false;

	constructor(options: TelemetryOptions) {
		if (!options.endpoint) throw new Error('telemetry endpoint is required');
		this.endpoint = options.endpoint;
		this.timeoutMs = options.timeoutMs ?? 10000;
		if (!(this.timeoutMs > 0)) throw new Error('telemetry timeout must be positive');
		this.fetchFn = options.fetch ?? globalThis.fetch;
		if (!this.fetchFn) throw new Error('fetch is unavailable; provide TelemetryOptions.fetch');
	}

	/** whether `send` will actually transmit anything right now */
	get hasConsent(): boolean {
		return this.consented;
	}

	/** a game calls this from its own consent flow; not read from anywhere `mwg` controls */
	setConsent(granted: boolean): void {
		this.consented = granted;
	}

	/** sends one structured event; a silent no-op before consent is granted, not an error */
	async send(event: TelemetryEvent): Promise<TelemetryResponse | null> {
		if (!event.name) throw new Error('telemetry event needs a name');
		if (!this.consented) return null;

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const response = await this.fetchFn(this.endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(event),
				signal: controller.signal,
			});
			if (!response.ok) throw new Error(`telemetry request failed with HTTP ${response.status}`);
			return { ok: true, status: response.status };
		} finally {
			clearTimeout(timer);
		}
	}
}

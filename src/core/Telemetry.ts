import { HttpTransport, type HttpTransportOptions } from './HttpTransport.ts';

export interface TelemetryEvent {
	name: string;
	properties?: Record<string, string | number | boolean | null>;
}

export interface TelemetryOptions extends HttpTransportOptions {
	/** longest string sent (event name, property name or value), in characters; a longer one is cut there. Default 256 */
	maxStringLength?: number;
	/** most properties one event carries; the rest are dropped. Default 32 */
	maxProperties?: number;
	/** the only property names sent, when given; any other is dropped */
	allowedProperties?: readonly string[];
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
 *
 * @example
 * ```ts
 * import { TelemetryClient } from '@datamoc/mw_games/core';
 *
 * const telemetry = new TelemetryClient({ endpoint: 'https://example.com/api/telemetry' });
 *
 * // nothing sends until a game's own consent flow grants it
 * telemetry.setConsent(true);
 * await telemetry.send({ name: 'level_started', properties: { level: 3 } });
 * ```
 */
export class TelemetryClient extends HttpTransport {
	private consented = false;
	private readonly maxStringLength: number;
	private readonly maxProperties: number;
	private readonly allowed: ReadonlySet<string> | null;

	constructor(options: TelemetryOptions) {
		super(options, 'telemetry');
		this.maxStringLength = options.maxStringLength ?? 256;
		this.maxProperties = options.maxProperties ?? 32;
		this.allowed = options.allowedProperties ? new Set(options.allowedProperties) : null;
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

		return this.withTimeout(async (signal) => {
			const response = await this.fetchFn(this.endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(this.bounded(event)),
				signal,
			});
			if (!response.ok) throw new Error(`telemetry request failed with HTTP ${response.status}`);
			return { ok: true, status: response.status };
		});
	}

	/**
	 * The event as it leaves the machine: strings cut at `maxStringLength`, at most
	 * `maxProperties` properties, and only `allowedProperties` when that list is given. A game
	 * that passes an error message or a file path by mistake then sends a bounded fragment of
	 * it rather than the whole thing, and an allowlist makes the payload's shape a decision
	 * rather than whatever the calling code happened to put in.
	 */
	private bounded(event: TelemetryEvent): TelemetryEvent {
		const cut = (value: string) =>
			value.length > this.maxStringLength ? value.slice(0, this.maxStringLength) : value;
		if (!event.properties) return { name: cut(event.name) };
		const properties: Record<string, string | number | boolean | null> = {};
		let count = 0;
		for (const [key, value] of Object.entries(event.properties)) {
			if (this.allowed && !this.allowed.has(key)) continue;
			if (count++ >= this.maxProperties) break;
			properties[cut(key)] = typeof value === 'string' ? cut(value) : value;
		}
		return { name: cut(event.name), properties };
	}
}

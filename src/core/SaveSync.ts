import { HttpTransport, type HttpTransportOptions } from './HttpTransport.ts';

/**
 * Uploads/downloads `SaveSystem.exportSlot` payloads to a game's own HTTPS endpoint - the
 * server half of item 124's save export/import, following `FeedbackClient`'s own shape
 * (an injectable transport a game points at its own endpoint) rather than a second pattern:
 * `mwg` ships no backend and assumes none here either.
 *
 * Every call names a `slot`, the same name `SaveSystem.exportSlot`/`importSlot` already use
 * locally, so a player with several named profiles (`SaveSystem` supports as many as a game
 * creates) can sync each independently against one endpoint rather than the endpoint holding
 * only ever one save. `list()` is the seam a profile picker reads before choosing which slot
 * to `download`.
 */
export type SaveSyncOptions = HttpTransportOptions;

export interface SaveSyncResponse {
	ok: boolean;
	status: number;
}

export class SaveSyncClient extends HttpTransport {
	constructor(options: SaveSyncOptions) {
		super(options, 'save sync');
	}

	/** sends an `exportSlot` payload for `slot` to the endpoint, replacing whatever it held before */
	async upload(slot: string, payload: string): Promise<SaveSyncResponse> {
		if (!slot) throw new Error('save sync slot name is required');
		if (!payload) throw new Error('save sync payload cannot be empty');
		return this.withTimeout(async (signal) => {
			const response = await this.fetchFn(this.slotUrl(slot), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ payload }),
				signal,
			});
			if (!response.ok) throw new Error(`save upload failed with HTTP ${response.status}`);
			return { ok: true, status: response.status };
		});
	}

	/** fetches whatever payload the endpoint currently holds for `slot`, ready for `SaveSystem.importSlot` */
	async download(slot: string): Promise<string> {
		if (!slot) throw new Error('save sync slot name is required');
		return this.withTimeout(async (signal) => {
			const response = await this.fetchFn(this.slotUrl(slot), { signal });
			if (!response.ok) throw new Error(`save download failed with HTTP ${response.status}`);
			const data = (await response.json()) as { payload?: unknown };
			if (typeof data.payload !== 'string') throw new Error('save download response missing a string payload');
			return data.payload;
		});
	}

	/** every slot name this endpoint currently holds for this player, for a profile picker to list */
	async list(): Promise<string[]> {
		return this.withTimeout(async (signal) => {
			const response = await this.fetchFn(this.endpoint, { signal });
			if (!response.ok) throw new Error(`save slot list failed with HTTP ${response.status}`);
			const data = (await response.json()) as { slots?: unknown };
			if (!Array.isArray(data.slots) || !data.slots.every((slot) => typeof slot === 'string')) {
				throw new Error('save slot list response missing a string array of slots');
			}
			return data.slots as string[];
		});
	}

	private slotUrl(slot: string): string {
		const separator = this.endpoint.includes('?') ? '&' : '?';
		return `${this.endpoint}${separator}slot=${encodeURIComponent(slot)}`;
	}
}

import type { WebSocketServer } from 'ws';

export interface LockstepServerOptions {
	port?: number;
	/** the address to listen on; every interface when omitted (the `mwg-lockstep-server` command defaults to 127.0.0.1) */
	host?: string;
	tickTimeoutMs?: number;
	/** the room seed sent in every `welcome` */
	seed?: number;
	/** the JSON-safe state every peer starts from, sent in every `welcome` */
	initialState?: unknown;
	/** returning `false` or a reason rejects an input */
	validateInput?: (payload: unknown) => boolean | string;
	/** largest client message accepted, in bytes; defaults to 64 KB */
	maxMessageBytes?: number;
	/** further connections to a full room are closed with 1013; defaults to 64 */
	maxClientsPerRoom?: number;
}

export interface LockstepServer {
	wss: WebSocketServer;
	ready: Promise<void>;
	address: () => ReturnType<WebSocketServer['address']>;
	close: () => Promise<void>;
}

export function createLockstepServer(options?: LockstepServerOptions): LockstepServer;

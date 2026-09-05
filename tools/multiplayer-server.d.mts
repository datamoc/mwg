import type { WebSocketServer } from 'ws';

export interface LockstepServerOptions {
	port?: number;
	tickTimeoutMs?: number;
}

export interface LockstepServer {
	wss: WebSocketServer;
	ready: Promise<void>;
	address: () => ReturnType<WebSocketServer['address']>;
	close: () => Promise<void>;
}

export function createLockstepServer(options?: LockstepServerOptions): LockstepServer;

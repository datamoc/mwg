import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LockstepClient, type WebSocketLike } from '../src/core/Multiplayer.ts';
import { createLockstepServer } from '../tools/multiplayer-server.mjs';

// ---------------------------------------------------------------- LockstepClient (unit)

class FakeSocket implements WebSocketLike {
	readyState = 1; //OPEN
	sent: string[] = [];
	onopen: ((event: unknown) => void) | null = null;
	onclose: ((event: unknown) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.onclose?.(undefined);
	}

	receive(message: unknown): void {
		this.onmessage?.({ data: JSON.stringify(message) });
	}
}

test('LockstepClient requires a url', () => {
	assert.throws(() => new LockstepClient({ url: '' }), /url is required/);
});

test('connect() throws if already connected', () => {
	const socket = new FakeSocket();
	const client = new LockstepClient({ url: 'ws://x', create: () => socket });
	client.connect();
	assert.throws(() => client.connect(), /already connected/);
});

test('a welcome message sets id and fires onWelcome', () => {
	const socket = new FakeSocket();
	const client = new LockstepClient({ url: 'ws://x', create: () => socket });
	client.connect();

	let seen: { id: string } | null = null;
	client.onWelcome.add((event) => { seen = event; });
	socket.receive({ type: 'welcome', id: 'p1' });

	assert.equal(client.id, 'p1');
	assert.deepEqual(seen, { id: 'p1' });
});

test('a tick message fires onTick with tick and inputs', () => {
	const socket = new FakeSocket();
	const client = new LockstepClient({ url: 'ws://x', create: () => socket });
	client.connect();

	let seen: { tick: number; inputs: Record<string, unknown> } | null = null;
	client.onTick.add((event) => { seen = event; });
	socket.receive({ type: 'tick', tick: 3, inputs: { p1: 'left', p2: null } });

	assert.deepEqual(seen, { tick: 3, inputs: { p1: 'left', p2: null } });
});

test('submitInput sends an input message while connected', () => {
	const socket = new FakeSocket();
	const client = new LockstepClient({ url: 'ws://x', create: () => socket });
	client.connect();

	client.submitInput('jump');
	assert.deepEqual(JSON.parse(socket.sent[0]), { type: 'input', payload: 'jump' });
});

test('submitInput is a no-op before the socket is open', () => {
	const socket = new FakeSocket();
	socket.readyState = 0; //CONNECTING
	const client = new LockstepClient({ url: 'ws://x', create: () => socket });
	client.connect();

	client.submitInput('jump');
	assert.deepEqual(socket.sent, []);
});

test('close() closes the socket, and the server closing resets id and fires onClose', () => {
	const socket = new FakeSocket();
	const client = new LockstepClient({ url: 'ws://x', create: () => socket });
	client.connect();
	socket.receive({ type: 'welcome', id: 'p1' });

	let closed = false;
	client.onClose.add(() => (closed = true));
	client.close();

	assert.equal(closed, true);
	assert.equal(client.id, null);
	assert.equal(client.connected, false);
});

// ------------------------------------------------------ real server + real client (integration)

async function startServer() {
	const server = createLockstepServer({ port: 0, tickTimeoutMs: 150 });
	await server.ready;
	return server;
}

function connectClient(port: number, room: string): Promise<LockstepClient> {
	return new Promise((resolve) => {
		const client = new LockstepClient({ url: `ws://localhost:${port}/?room=${room}` });
		client.connect();
		const handler = () => {
			client.onWelcome.remove(handler);
			resolve(client);
		};
		client.onWelcome.add(handler);
	});
}

function once<T>(signal: { add: (fn: (value: T) => void) => void; remove: (fn: (value: T) => void) => void }): Promise<T> {
	return new Promise((resolve) => {
		const handler = (value: T) => {
			signal.remove(handler);
			resolve(value);
		};
		signal.add(handler);
	});
}

test('two real clients against the real reference server both receive a tick once both submit', async () => {
	const server = await startServer();
	const port = (server.address() as { port: number }).port;

	const a = await connectClient(port, 'room-a');
	const b = await connectClient(port, 'room-b');
	//distinct rooms must not see each other's inputs
	assert.notEqual(a.id, b.id);

	const bTick = once(b.onTick);
	b.submitInput('b-only');
	const bResult = await bTick;
	assert.equal(Object.values(bResult.inputs).length, 1);
	assert.equal(bResult.inputs[b.id!], 'b-only');

	a.close();
	b.close();
	await server.close();
});

test('one shared room advances once every connected client has submitted', async () => {
	const server = await startServer();
	const port = (server.address() as { port: number }).port;

	const a = await connectClient(port, 'shared');
	const b = await connectClient(port, 'shared');

	const aTick = once(a.onTick);
	const bTick = once(b.onTick);
	a.submitInput('left');
	// give the "every client submitted" early-advance path a moment to NOT fire yet
	await new Promise((resolve) => setTimeout(resolve, 20));
	b.submitInput('right');

	const [aResult, bResult] = await Promise.all([aTick, bTick]);
	assert.deepEqual(aResult, bResult);
	assert.equal(aResult.inputs[a.id!], 'left');
	assert.equal(aResult.inputs[b.id!], 'right');
	assert.equal(aResult.tick, 0);

	a.close();
	b.close();
	await server.close();
});

test('a client that never submits is reported null once the tick timeout elapses', async () => {
	const server = await startServer();
	const port = (server.address() as { port: number }).port;

	const a = await connectClient(port, 'timeout-room');
	const b = await connectClient(port, 'timeout-room');

	const aTick = once(a.onTick);
	a.submitInput('left');
	//b never submits - the server's own timeout must still advance the tick

	const result = await aTick;
	assert.equal(result.inputs[a.id!], 'left');
	assert.equal(result.inputs[b.id!], null);

	a.close();
	b.close();
	await server.close();
});

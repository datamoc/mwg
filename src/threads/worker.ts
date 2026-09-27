/** what the main thread posts to a fresh worker: the task's source and its arguments */
export interface WorkerRequest {
	/** the stringified task function, rehydrated in the worker with `new Function` */
	code: string;
	args: readonly unknown[];
}

/** what the worker posts back: the value, or the failure that stopped it */
export type WorkerReply = { ok: true; value: unknown } | { ok: false; message: string; stack?: string };

/**
 * The slice of `node:worker_threads` this module uses, described structurally: `src/`
 * compiles in a browser-only config (the `@example` fence compiler runs with `types: []`),
 * so nothing here may name `process` or a `node:` type directly.
 */
export interface NodeThreads {
	parentPort: {
		on(event: 'message', listener: (request: WorkerRequest) => void): void;
		postMessage(message: WorkerReply, transfer?: ArrayBuffer[]): void;
	} | null;
	Worker: new (
		code: string,
		options: { eval: true },
	) => {
		on(event: 'message', listener: (reply: WorkerReply) => void): void;
		on(event: 'error', listener: (error: unknown) => void): void;
		on(event: 'messageerror', listener: () => void): void;
		on(event: 'exit', listener: (code: number) => void): void;
		postMessage(message: WorkerRequest, transfer?: readonly unknown[]): void;
		terminate(): Promise<number> | void;
	};
}

/** `node:worker_threads` reached through `globalThis`, so nothing here needs @types/node */
export function nodeThreads(): NodeThreads | undefined {
	return (
		globalThis as {
			process?: { getBuiltinModule?: (id: string) => NodeThreads | undefined };
		}
	).process?.getBuiltinModule?.('node:worker_threads');
}

/**
 * The worker half of `threads.spawn`: receives one task, runs it, replies, and goes no
 * further (spawn terminates it as soon as the reply settles).
 *
 * **This function must stay self-contained.** `spawn` ships it to a worker with
 * `workerMain.toString()`, so it may not reference imports, module-scope helpers or any
 * outer binding - everything it needs is either a language global or nested inside it.
 * The same body runs in both transports: a classic blob worker in the browser (where the
 * shipped `file://` CSP allows only `worker-src blob:` and `new Function`, per the T161
 * probe) and an eval'd `node:worker_threads` worker in Node, which has no `self`.
 */
export function workerMain(): void {
	//the same chain as nodeThreads(), inlined because workerMain is stringified into the
	//worker and may not call anything module-scoped; the cast is a type, erased before then
	const nodePort =
		(
			globalThis as {
				process?: { getBuiltinModule?: (id: string) => NodeThreads | undefined };
			}
		).process?.getBuiltinModule?.('node:worker_threads')?.parentPort ?? null;
	const scope = globalThis as unknown as {
		postMessage(message: unknown, transfer?: Transferable[]): void;
		onmessage: ((event: MessageEvent) => void) | null;
	};

	/** every ArrayBuffer reachable through plain objects and arrays, listed once each */
	const transferablesOf = (value: unknown): ArrayBuffer[] => {
		const out: ArrayBuffer[] = [];
		const seen = new Set<unknown>();
		const visit = (item: unknown): void => {
			if (item === null || typeof item !== 'object') return;
			if (seen.has(item)) return;
			seen.add(item);
			if (ArrayBuffer.isView(item)) {
				//a view transfers its whole buffer; a SharedArrayBuffer cannot transfer, so it
				//stays a copy (and does not exist in the shipped file:// target at all)
				const buffer = (item as ArrayBufferView).buffer;
				if (buffer instanceof ArrayBuffer && !out.includes(buffer)) out.push(buffer);
				return;
			}
			if (item instanceof ArrayBuffer) {
				if (!out.includes(item)) out.push(item);
				return;
			}
			if (Array.isArray(item)) {
				for (const entry of item) visit(entry);
				return;
			}
			const prototype = Object.getPrototypeOf(item);
			if (prototype === Object.prototype || prototype === null) {
				for (const entry of Object.values(item)) visit(entry);
			}
		};
		visit(value);
		return out;
	};

	const reply = (message: WorkerReply, transfer: ArrayBuffer[] = []): void => {
		if (nodePort) nodePort.postMessage(message, transfer);
		else scope.postMessage(message, transfer);
	};

	const onRequest = async (request: WorkerRequest): Promise<void> => {
		try {
			const task = new Function(`return (${request.code});`)() as (...args: unknown[]) => unknown;
			const value = await task(...request.args);
			reply({ ok: true, value }, transferablesOf(value));
		} catch (error) {
			const failure = error as { message?: unknown; stack?: unknown };
			reply({
				ok: false,
				message: String(failure?.message ?? error),
				stack: typeof failure?.stack === 'string' ? failure.stack : undefined,
			});
		}
	};

	if (nodePort) nodePort.on('message', (request: WorkerRequest) => void onRequest(request));
	else scope.onmessage = (event) => void onRequest(event.data as WorkerRequest);
}

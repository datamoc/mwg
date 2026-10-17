import { nodeThreads, workerMain, type WorkerReply, type WorkerRequest } from './worker.ts';

export interface SpawnOptions {
	/** buffers posted to the task instead of copied: each is detached from this thread when spawn runs */
	transfer?: Transferable[];
	/** abandons the task after this many milliseconds; there is no default, because a render can legitimately take minutes */
	timeout?: number;
	/** aborting rejects the promise with the signal's reason and terminates the task's worker */
	signal?: AbortSignal;
}

/** one open worker: post to it, terminate it */
export interface WorkerLink {
	post(message: unknown, transfer?: Transferable[]): void;
	terminate(): void;
}

export interface WorkerLinkEvents {
	/** a message the worker posted */
	message(data: unknown): void;
	/** the worker failed, died or sent something that could not be read */
	fail(error: Error): void;
}

type WorkerHost = (source: string, events: WorkerLinkEvents) => WorkerLink | null;

const browserWorker: WorkerHost = (source, events) => {
	if (
		typeof Worker === 'undefined' ||
		typeof Blob === 'undefined' ||
		typeof URL === 'undefined' ||
		typeof URL.createObjectURL !== 'function'
	) {
		return null;
	}
	//a blob worker, because the shipped file:// page allows worker-src blob: and because a
	//file:// module worker is blocked by CORS whatever the policy says
	const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
	let worker: Worker;
	try {
		worker = new Worker(url);
	} catch (error) {
		URL.revokeObjectURL(url);
		throw error;
	}
	worker.onmessage = (event) => events.message(event.data);
	worker.onerror = (event) => events.fail(new Error(event.message || 'the worker failed to run'));
	worker.onmessageerror = () => events.fail(new Error('the worker sent a reply that could not be deserialized'));
	return {
		post: (message, transfer = []) => worker.postMessage(message, transfer),
		terminate: () => {
			worker.terminate();
			URL.revokeObjectURL(url);
		},
	};
};

const nodeWorker: WorkerHost = (source, events) => {
	const threads = nodeThreads();
	if (!threads) return null;
	//the same source string as the browser path, executed as CJS by Node's eval mode
	const worker = new threads.Worker(source, { eval: true });
	worker.on('message', (reply) => events.message(reply));
	worker.on('error', (error) => events.fail(error instanceof Error ? error : new Error(String(error))));
	worker.on('messageerror', () => events.fail(new Error('the worker sent a reply that could not be deserialized')));
	//a task that kills its worker without answering must reject rather than hang forever -
	//the failure the multithreading package's pool never reports (T161)
	worker.on('exit', (code) => events.fail(new Error(`the worker exited with code ${code} before answering`)));
	return {
		post: (message, transfer = []) => worker.postMessage(message as WorkerRequest, transfer),
		terminate: () => void worker.terminate(),
	};
};

/**
 * Opens a worker running a classic script, in a browser (a blob worker, which the shipped
 * `file://` page's policy allows) or in Node (`worker_threads` in eval mode), and returns null
 * where neither exists. `spawn` is the one-task-per-worker use of this; a long-lived service
 * such as the audio core host keeps its worker and talks to it with messages.
 *
 * The script must be self-contained for the same reason a `spawn` task must: it runs with
 * nothing but its own text in scope.
 *
 * @example
 * ```ts
 * import { openWorker } from '@datamoc/mw_games/threads';
 *
 * const link = openWorker('globalThis.onmessage = (event) => globalThis.postMessage(event.data * 2);', {
 * 	message: (value) => console.log(value),
 * 	fail: (error) => console.warn(error.message),
 * });
 * link?.post(21);
 * ```
 */
export function openWorker(source: string, events: WorkerLinkEvents): WorkerLink | null {
	//each host returns null when its environment is absent, so they are tried in order
	return browserWorker(source, events) ?? nodeWorker(source, events);
}

/** the error a failed reply carries, with the worker-side stack where there was one */
function taskError(reply: { message: string; stack?: string }): Error {
	const error = new Error(reply.message);
	if (reply.stack) error.stack = reply.stack;
	return error;
}

/**
 * Runs `fn` on a worker thread and resolves with its value, keeping the caller's thread
 * free: the one synchronous block a game can never get back is the frame it spends waiting.
 *
 * The task is serialized with `Function.prototype.toString` and rehydrated in the worker,
 * so it must be **self-contained** - no closures over module scope, no imports, no bound or
 * native functions. Everything it needs arrives as `args`, structured-cloned in; buffers
 * listed in `options.transfer` are moved instead, detached from the caller's thread. The
 * result comes back structured-cloned, with every ArrayBuffer inside it transferred rather
 * than copied (the worker is finished with them). A task that throws, closes over
 * something the worker cannot see, or exits its worker without answering rejects the
 * promise - it never hangs - and `timeout` or `signal` abandon a task that never returns.
 *
 * One worker per task: construction costs a few milliseconds, which is nothing next to the
 * work worth moving off the main thread (T161 measured break-even at roughly 10 ms per
 * task in a batch, and far less against a dropped frame).
 *
 * @example
 * ```ts
 * import { spawn } from '@datamoc/mw_games/threads';
 *
 * const sum = await spawn((a: number, b: number) => a + b, [40, 2]);
 * console.log(sum); // 42
 *
 * //a task that never returns is abandoned rather than hanging the caller
 * const controller = new AbortController();
 * const pending = spawn(() => new Promise(() => {}), [], { signal: controller.signal });
 * controller.abort();
 * pending.catch((error: Error) => console.log(error.name)); // 'AbortError'
 * ```
 */
export function spawn<Args extends readonly unknown[], Result>(
	fn: (...args: Args) => Result,
	args?: Args,
	options: SpawnOptions = {},
): Promise<Awaited<Result>> {
	return new Promise<Awaited<Result>>((resolve, reject) => {
		if (options.signal?.aborted) {
			reject(options.signal.reason);
			return;
		}

		let settled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let worker: WorkerLink | null | undefined;
		const settle = (finish: () => void): void => {
			if (settled) return;
			settled = true;
			if (timer !== undefined) clearTimeout(timer);
			options.signal?.removeEventListener('abort', onAbort);
			//one worker per task: whatever settled it, the worker is done
			worker?.terminate();
			finish();
		};
		function onAbort(): void {
			settle(() => reject(options.signal!.reason));
		}

		const events: WorkerLinkEvents = {
			message: (data) =>
				settle(() => {
					const reply = data as WorkerReply;
					if (reply.ok) resolve(reply.value as Awaited<Result>);
					else reject(taskError(reply));
				}),
			fail: (error) => settle(() => reject(error)),
		};
		try {
			worker = openWorker(`(${workerMain.toString()})()`, events);
		} catch (error) {
			reject(error);
			return;
		}
		if (!worker) {
			reject(new Error('spawn() needs Web Workers or node:worker_threads, and this environment offers neither'));
			return;
		}

		if (options.timeout !== undefined && options.timeout > 0) {
			timer = setTimeout(
				() => settle(() => reject(new Error(`the task did not answer within ${options.timeout} ms`))),
				options.timeout,
			);
		}
		options.signal?.addEventListener('abort', onAbort, { once: true });

		try {
			worker.post({ code: fn.toString(), args: args ?? [] }, options.transfer ?? []);
		} catch (error) {
			//unclonable arguments, or a transfer list that does not match the message
			settle(() => reject(error));
		}
	});
}

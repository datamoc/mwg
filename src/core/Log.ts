/**
 * What severity a log entry carries. Ordered, so a logger can keep `warn` and
 * above while silencing the chatter below.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LogEntry {
	level: LogLevel;
	category: string;
	message: string;
	data?: unknown;
	time: number;
}

export interface LoggerOptions {
	/** entries below this never reach the sink; defaults to `debug` (everything) */
	level?: LogLevel;
	/** where entries go; defaults to the matching console method */
	sink?: (entry: LogEntry) => void;
}

/**
 * Categories and severity over bare `console.log`.
 *
 * Marginal on its own - the browser console already exists - which is why this
 * stays small: a named category per system, four levels, a filter, and a sink
 * tests can capture instead of the console.
 */
export class Logger {
	private readonly category: string;
	private level: LogLevel;
	private readonly sink: (entry: LogEntry) => void;

	constructor(category: string, options: LoggerOptions = {}) {
		if (!category) throw new Error('a logger needs a category');
		this.category = category;
		this.level = options.level ?? 'debug';
		this.sink = options.sink ?? defaultSink;
	}

	/** raises or lowers what reaches the sink from here on */
	setLevel(level: LogLevel): void {
		this.level = level;
	}

	debug(message: string, data?: unknown): void {
		this.write('debug', message, data);
	}

	info(message: string, data?: unknown): void {
		this.write('info', message, data);
	}

	warn(message: string, data?: unknown): void {
		this.write('warn', message, data);
	}

	error(message: string, data?: unknown): void {
		this.write('error', message, data);
	}

	private write(level: LogLevel, message: string, data?: unknown): void {
		if (ORDER[level] < ORDER[this.level]) return;
		this.sink({ level, category: this.category, message, data, time: Date.now() });
	}
}

function defaultSink(entry: LogEntry): void {
	const line = `[${entry.category}] ${entry.message}`;
	if (entry.level === 'debug') console.debug(line, entry.data ?? '');
	else if (entry.level === 'info') console.info(line, entry.data ?? '');
	else if (entry.level === 'warn') console.warn(line, entry.data ?? '');
	else console.error(line, entry.data ?? '');
}

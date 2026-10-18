import type { StereoFrames } from './Resample.ts';

export interface OutputRecorderOptions {
	/** the longest take in seconds; the recording stops by itself there. 600 when omitted, so a forgotten recorder cannot fill memory */
	maxSeconds?: number;
	/** frames per delivered block (a power of two from 256 to 16384); 4096 when omitted */
	bufferSize?: number;
}

/** what a finished take is: the frames, and whether the limit cut it short */
export interface Recording extends StereoFrames {
	truncated: boolean;
}

/**
 * Records what flows through some nodes of a WebAudio graph as plain stereo frames, ready for
 * `AudioExport`: the nodes are tapped (they keep playing to wherever they already went), a script
 * processor collects their blocks, and `stop` hands back the take. The processor is the one capture
 * node that exists everywhere, `file://` pages included; it is silent, writing nothing of its own to
 * the speakers. The take is bounded by `maxSeconds`, so memory cannot grow without limit.
 *
 * @example
 * ```ts
 * import { AudioExport, OutputRecorder } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 * declare const master: AudioNode;
 *
 * const recorder = new OutputRecorder(context, [master], { maxSeconds: 30 });
 * // ... the player plays for a while ...
 * const take = recorder.stop();
 * const wav = await new AudioExport().export(take, { format: 'wav' });
 * console.log(take.truncated, wav.byteLength);
 * ```
 */
export class OutputRecorder {
	private readonly processor: ScriptProcessorNode;
	private readonly inputs: readonly AudioNode[];
	private readonly sampleRate: number;
	private readonly maxFrames: number;
	private readonly left: Float32Array[] = [];
	private readonly right: Float32Array[] = [];
	private frames = 0;
	private cut = false;
	private done = false;

	constructor(context: AudioContext, inputs: readonly AudioNode[], options: OutputRecorderOptions = {}) {
		this.sampleRate = context.sampleRate;
		this.maxFrames = Math.floor((options.maxSeconds ?? 600) * context.sampleRate);
		this.inputs = inputs;
		this.processor = context.createScriptProcessor(options.bufferSize ?? 4096, 2, 2);
		this.processor.onaudioprocess = (event) => this.collect(event.inputBuffer);
		for (const input of inputs) input.connect(this.processor);
		//some engines only run a processor that reaches the destination; it writes no output, so nothing is heard
		this.processor.connect(context.destination);
	}

	/** how many seconds have been taken so far */
	get seconds(): number {
		return this.frames / this.sampleRate;
	}

	/** whether the take is over, by `stop` or by reaching `maxSeconds` */
	get finished(): boolean {
		return this.done;
	}

	private collect(buffer: AudioBuffer): void {
		if (this.done) return;
		const room = this.maxFrames - this.frames;
		const take = Math.min(buffer.length, room);
		const left = buffer.getChannelData(0);
		const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
		//the buffer is reused by the browser, so it is copied out
		this.left.push(left.slice(0, take));
		this.right.push(right.slice(0, take));
		this.frames += take;
		if (this.frames >= this.maxFrames) {
			this.cut = true;
			this.finish();
		}
	}

	private finish(): void {
		if (this.done) return;
		this.done = true;
		this.processor.onaudioprocess = null;
		for (const input of this.inputs) {
			try {
				input.disconnect(this.processor);
			} catch {
				//already disconnected
			}
		}
		this.processor.disconnect();
	}

	/** ends the take and returns it; calling it again returns the same take */
	stop(): Recording {
		this.finish();
		const join = (parts: Float32Array[]): Float32Array => {
			const out = new Float32Array(this.frames);
			let at = 0;
			for (const part of parts) {
				out.set(part, at);
				at += part.length;
			}
			return out;
		};
		return { sampleRate: this.sampleRate, left: join(this.left), right: join(this.right), truncated: this.cut };
	}
}

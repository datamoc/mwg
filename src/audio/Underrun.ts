import { Signal } from '../core/Signal.ts';

/** audio that ran out before the next block was ready: a gap the player hears as a click or a dropout */
export interface AudioUnderrun {
	/** what ran dry: `'stream'` for a `StreamChannel`, `'core'` for an `AudioCoreHost` */
	source: 'stream' | 'core';
	/** how much audio was missing, in seconds */
	lateSeconds: number;
}

/**
 * The one place every audio underrun is reported, whichever voice had it. A game forwards this to
 * its telemetry (`TelemetryClient`, which bounds what it sends) or shows it in a settings panel;
 * the voices also have their own signals for code that cares about a single one.
 *
 * @example
 * ```ts
 * import { onAudioUnderrun } from '@datamoc/mw_games/audio';
 *
 * let dropouts = 0;
 * onAudioUnderrun.add(() => {
 * 	dropouts++;
 * });
 * ```
 */
export const onAudioUnderrun = new Signal<AudioUnderrun>();

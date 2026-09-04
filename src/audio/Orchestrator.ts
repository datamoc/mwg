import type { Music } from './Music.ts';
import type { Sound } from './Sound.ts';

/** what playing this state's music should look like - `fadeDuration` follows `Music.play`'s own default */
export interface OrchestratorState {
	track: string;
	fadeDuration?: number;
}

/**
 * The data a game writes once instead of scattering `Music.play`/`Sound.play` calls across
 * every place a fight starts or a menu opens: name the states ("exploring", "combat",
 * "boss", "menu") and the cues ("hit", "levelUp"), and call `enter`/`trigger` by name from
 * then on.
 *
 * `enter` is idempotent by track, not by state name - two state names that happen to map to
 * the same track will not refade into each other either, since there is nothing to refade
 * to. Re-entering "combat" mid-fight (the same fight, the same track) must not reset the
 * music, which is the one behaviour a direct `Music.play` call at every call site cannot
 * give you for free: the orchestrator remembers the current track and treats entering an
 * already-current one as a no-op.
 *
 * Cues are separate from states because they are fire-and-forget one-shots (`Sound`, not
 * `Music`) - folding them into `enter` would conflate "this is where we are" with "this just
 * happened".
 */
export class Orchestrator {
	private states = new Map<string, OrchestratorState>();
	private cues = new Map<string, Sound>();
	private currentTrack: string | null = null;
	private music: Music;

	constructor(music: Music) {
		this.music = music;
	}

	/** defines or replaces one state's music mapping */
	define(state: string, mapping: OrchestratorState): void {
		this.states.set(state, mapping);
	}

	/** switches to `state`'s track, crossfading; a no-op if that track is already playing */
	enter(state: string): void {
		const mapping = this.states.get(state);
		if (!mapping) throw new Error(`Orchestrator: no state defined for "${state}"`);

		if (mapping.track === this.currentTrack) return;

		this.music.play(mapping.track, mapping.fadeDuration);
		this.currentTrack = mapping.track;
	}

	/** registers the one-shot sound played by `trigger(event)` */
	on(event: string, cue: Sound): void {
		this.cues.set(event, cue);
	}

	/** plays the sound registered for `event`, if any; silently does nothing otherwise */
	trigger(event: string): void {
		this.cues.get(event)?.play();
	}
}

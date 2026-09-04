import { Signal } from '../core/Signal.ts';

/**
 * A visual cue for a sound effect a deaf or hard-of-hearing player cannot hear - a footstep,
 * a monster's growl, a door creaking. Dialogue already has its own on-screen text (`mwg/stage`'s
 * `MessageBox` is how every line is shown at all, not an addition over voiced audio), so this
 * exists for `Sound` alone, not `Music`: background music is not ordinarily captioned the way
 * an important sound effect is.
 */
export interface CaptionEvent {
	/** shown by a captioning overlay - "footsteps", "door creaks", "a growl nearby" */
	text: string;
}

/** fires whenever a captioned `Sound` plays - a captioning overlay subscribes here, entirely decoupled from `Sound` itself, which never imports anything UI-shaped */
export const onCaption = new Signal<CaptionEvent>();

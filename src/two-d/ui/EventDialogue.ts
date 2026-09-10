import { MessageBox } from './MessageBox.ts';
import type { WindowStack } from './WindowStack.ts';
import type { DialoguePresenter } from '../../rpg/EventRunner.ts';

export interface MessageBoxPresenterOptions {
	/** width/height of the dialogue box; characters revealed per second */
	width?: number;
	height?: number;
	speed?: number;
	anchor?: 'center' | 'bottom' | 'top';
}

/**
 * The standard way to show an `rpg.EventRunner`'s dialogue: a `MessageBox` on a `WindowStack`.
 *
 * This is exactly what `EventRunner` used to do inside itself. Moving it here is what lets
 * `mwg/rpg` stay renderer-free while the common case stays a single argument - a game writes
 * `present: messageBoxPresenter(this.windows)` rather than the twelve lines of box
 * construction every game would otherwise copy.
 *
 * It lives in `two-d/ui` rather than in `rpg` because it is the half that knows about widgets;
 * the type it satisfies comes back the other way as a type-only import, which erases at
 * runtime and so adds no dependency in either direction.
 */
export function messageBoxPresenter(windows: WindowStack, options: MessageBoxPresenterOptions = {}): DialoguePresenter {
	return (request) =>
		new Promise((resolve) => {
			windows.push(
				new MessageBox({
					width: options.width ?? 480,
					height: options.height ?? 120,
					speed: options.speed ?? 45,
					pages: [{ text: request.text, speaker: request.speaker }],
					choices: request.choices,
					anchor: options.anchor ?? 'bottom',
					onDone: (chosen) => resolve(chosen),
				}),
			);
		});
}

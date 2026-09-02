import { Container, Graphics } from 'pixi.js';
import * as Input from '../core/Input.ts';
import type { Action } from '../core/Input.ts';
import type { Window } from './Window.ts';
import { theme } from './theme.ts';

/**
 * The stack of open windows, and the arbiter of who has the keyboard.
 *
 * Only the topmost window is offered input. That single rule is what makes nested
 * interfaces behave: opening a confirmation over an inventory means the inventory stops
 * responding until the confirmation is answered, without either window knowing about the
 * other.
 *
 * Below a modal window sits a dimming layer, which is both a visual cue and a hint that
 * the world underneath is not listening.
 */
export class WindowStack extends Container {
	private windows: Window[] = [];
	private overlay = new Graphics();

	private viewportWidth = 0;
	private viewportHeight = 0;

	private listener = (action: Action): boolean => this.handleAction(action);

	constructor() {
		super();
		this.overlay.visible = false;
		this.addChild(this.overlay);

		//stack mode, so this is offered actions before anything registered earlier: a window
		//that is open should always win over the map underneath
		Input.onAction.add(this.listener);
	}

	setViewport(width: number, height: number): void {
		this.viewportWidth = width;
		this.viewportHeight = height;
		this.drawOverlay();

		for (const window of this.windows) window.place(width, height);
	}

	get top(): Window | null {
		return this.windows[this.windows.length - 1] ?? null;
	}

	get isEmpty(): boolean {
		return this.windows.length === 0;
	}

	get depth(): number {
		return this.windows.length;
	}

	/** opens a window on top; it takes the keyboard until it closes */
	push(window: Window): Window {
		this.windows.push(window);
		this.addChild(window);

		window.onClose.add(() => {
			this.forget(window);
			return false;
		});

		window.place(this.viewportWidth, this.viewportHeight);
		this.updateOverlay();
		return window;
	}

	/** closes the top window, as `cancel` would */
	pop(): void {
		this.top?.close();
	}

	closeAll(): void {
		//iterate a copy: closing a window mutates the list through its onClose handler
		for (const window of [...this.windows].reverse()) window.close();
	}

	private forget(window: Window): void {
		const index = this.windows.indexOf(window);
		if (index !== -1) this.windows.splice(index, 1);
		this.updateOverlay();
	}

	private updateOverlay(): void {
		//the overlay sits directly beneath the lowest window that asks to dim, so windows
		//above it stay lit and the world below is dimmed exactly once however many are open
		const firstModal = this.windows.findIndex((window) => window.dims);

		if (firstModal === -1) {
			this.overlay.visible = false;
			return;
		}

		this.overlay.visible = true;
		this.setChildIndex(this.overlay, Math.max(0, this.getChildIndex(this.windows[firstModal]) - 1));
	}

	private drawOverlay(): void {
		const t = theme();
		this.overlay
			.clear()
			.rect(0, 0, this.viewportWidth, this.viewportHeight)
			.fill({ color: t.color.overlay, alpha: t.overlayAlpha });
	}

	/** @returns true when a window consumed the action */
	private handleAction(action: Action): boolean {
		return this.top?.handleAction(action) ?? false;
	}

	/** true while any window is open, so the world knows to hold still */
	get blocksWorld(): boolean {
		return this.windows.some((window) => window.modal);
	}

	update(dt: number): void {
		this.top?.update(dt);
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		Input.onAction.remove(this.listener);
		super.destroy(options);
	}
}

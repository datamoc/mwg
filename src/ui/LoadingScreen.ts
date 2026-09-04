import { Container, Graphics } from 'pixi.js';
import type { LoadQueue, LoadSnapshot } from '../core/Loading.ts';
import { Bar } from './Bar.ts';
import { Label } from './Label.ts';
import { theme } from './theme.ts';

export interface LoadingScreenOptions {
	width: number;
	height: number;
	title?: string;
	onRetry?: () => void;
	onCancel?: () => void;
}

/** A themed loading view driven by `LoadQueue.snapshot`, with game-owned retry/cancel hooks. */
export class LoadingScreen extends Container {
	private readonly backdrop = new Graphics();
	private readonly title: Label;
	private readonly status: Label;
	private readonly progress = new Bar({ width: 240, height: 10, value: 0 });
	private readonly onRetry?: () => void;
	private readonly onCancel?: () => void;
	private width_: number;
	private height_: number;

	constructor(options: LoadingScreenOptions) {
		super();
		this.width_ = options.width;
		this.height_ = options.height;
		this.onRetry = options.onRetry;
		this.onCancel = options.onCancel;
		this.title = new Label({ text: options.title ?? 'Loading', size: 18, bold: true, align: 'center' });
		this.status = new Label({ text: 'Preparing...', align: 'center' });
		this.addChild(this.backdrop, this.title, this.status, this.progress);
		this.layout();
	}

	setSnapshot(snapshot: LoadSnapshot): void {
		const fraction = snapshot.total > 0 ? snapshot.completed / snapshot.total : 0;
		this.progress.setValue(fraction);
		if (snapshot.status === 'failed') this.status.setText('Loading failed. Retry or cancel.');
		else if (snapshot.status === 'cancelled') this.status.setText('Loading cancelled.');
		else if (snapshot.status === 'ready') this.status.setText('Ready');
		else this.status.setText(snapshot.current ? `Loading ${snapshot.current}...` : 'Preparing...');
	}

	/** Connects the screen to one queue and returns the cleanup needed when its scene closes. */
	bind(queue: LoadQueue): () => void {
		this.setSnapshot(queue.snapshot);
		const listener = (snapshot: LoadSnapshot) => this.setSnapshot(snapshot);
		queue.changed.add(listener);
		return () => queue.changed.remove(listener);
	}

	/** invoke from a game-owned retry button or keyboard binding */
	retry(): void { this.onRetry?.(); }
	/** invoke from a game-owned cancel button or keyboard binding */
	cancel(): void { this.onCancel?.(); }

	resize(width: number, height: number): void {
		this.width_ = width;
		this.height_ = height;
		this.layout();
	}

	private layout(): void {
		const colors = theme().color;
		this.backdrop.clear().rect(0, 0, this.width_, this.height_).fill({ color: colors.overlay, alpha: 0.92 });
		const centerX = this.width_ / 2;
		const centerY = this.height_ / 2;
		this.title.anchor.set(0.5);
		this.status.anchor.set(0.5);
		this.title.position.set(centerX, centerY - 36);
		this.status.position.set(centerX, centerY - 8);
		this.progress.position.set(centerX - 120, centerY + 16);
	}
}

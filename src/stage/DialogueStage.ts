import { Container, Sprite, Texture } from 'pixi.js';
import { TintedSprite } from '../render/TintedSprite.ts';
import type { SpriteSheet } from '../render/SpriteSheet.ts';

export type SlotName = 'left' | 'center' | 'right' | 'farLeft' | 'farRight';

/** where a slot sits, as a fraction of the stage width */
const SLOTS: Record<SlotName, number> = {
	farLeft: 0.12,
	left: 0.28,
	center: 0.5,
	right: 0.72,
	farRight: 0.88,
};

export interface CharacterDefinition {
	sheet: SpriteSheet;

	/** expression name to frame index in the sheet */
	expressions: Record<string, number>;

	/** how tall the character stands, as a fraction of the stage height */
	height?: number;

	/** where the character's feet sit, as a fraction of the stage height */
	baseline?: number;
}

export interface ShowOptions {
	at?: SlotName | number;
	expression?: string;

	/** seconds to fade in; 0 appears at once */
	fade?: number;
}

interface Actor {
	id: string;
	sprite: TintedSprite;
	definition: CharacterDefinition;
	slot: number;
	expression: string;
}

/**
 * A dialogue scene: a backdrop, characters standing in front of it, and whoever is
 * speaking picked out from the rest.
 *
 * This is the presentation the tile map is not — a still image with figures on it, the
 * mode nearly every RPG drops into for a conversation that matters, and the whole of how a
 * visual novel looks.
 *
 * It draws only the scene. The words go in a `MessageBox` from `mwg/ui`, so a game gets
 * the same dialogue box whether it is talking to a shopkeeper on a tile map or running a
 * scripted scene here.
 */
export class DialogueStage extends Container {
	private backdropLayer = new Container();
	private actorLayer = new Container();

	private backdrop: Sprite | null = null;
	private outgoingBackdrop: Sprite | null = null;

	private actors = new Map<string, Actor>();
	private definitions = new Map<string, CharacterDefinition>();

	private focused: string | null = null;

	private stageWidth: number;
	private stageHeight: number;

	private tweens: Tween[] = [];

	/** how far a character is darkened while someone else is speaking, 0 to 1 */
	dimAmount = 0.45;

	constructor(width: number, height: number) {
		super();
		this.stageWidth = width;
		this.stageHeight = height;

		this.addChild(this.backdropLayer);
		this.addChild(this.actorLayer);
	}

	/** registers a character so a script can refer to it by name alone */
	defineCharacter(id: string, definition: CharacterDefinition): void {
		this.definitions.set(id, definition);
	}

	resize(width: number, height: number): void {
		this.stageWidth = width;
		this.stageHeight = height;

		for (const sprite of [this.backdrop, this.outgoingBackdrop]) {
			if (sprite) this.fitBackdrop(sprite);
		}
		for (const actor of this.actors.values()) this.placeActor(actor);
	}

	/**
	 * Changes the backdrop.
	 *
	 * The old one stays underneath while the new one fades in over it, so the scene never
	 * flashes through to an empty stage mid-transition.
	 */
	setBackdrop(texture: Texture, fade = 0.4): Promise<void> {
		this.outgoingBackdrop?.destroy();
		this.outgoingBackdrop = this.backdrop;

		const sprite = new Sprite(texture);
		this.fitBackdrop(sprite);
		this.backdrop = sprite;
		this.backdropLayer.addChild(sprite);

		if (fade <= 0) {
			this.outgoingBackdrop?.destroy();
			this.outgoingBackdrop = null;
			return Promise.resolve();
		}

		sprite.alpha = 0;
		return this.tween(fade, (t) => {
			sprite.alpha = t;
		}).then(() => {
			this.outgoingBackdrop?.destroy();
			this.outgoingBackdrop = null;
		});
	}

	private fitBackdrop(sprite: Sprite): void {
		//cover the stage without distorting: scale by the larger ratio and centre the rest
		const source = sprite.texture;
		const scale = Math.max(this.stageWidth / source.width, this.stageHeight / source.height);
		sprite.scale.set(scale);
		sprite.x = Math.round((this.stageWidth - source.width * scale) / 2);
		sprite.y = Math.round((this.stageHeight - source.height * scale) / 2);
	}

	show(id: string, options: ShowOptions = {}): Promise<void> {
		const definition = this.definitions.get(id);
		if (!definition) throw new Error(`no character defined as "${id}"`);

		const expression = options.expression ?? Object.keys(definition.expressions)[0];
		const existing = this.actors.get(id);

		if (existing) {
			//already on stage: this is a move or an expression change, not an entrance
			if (options.at !== undefined) existing.slot = this.slotOf(options.at);
			this.setExpression(id, expression);
			this.placeActor(existing);
			return Promise.resolve();
		}

		const sprite = new TintedSprite(definition.sheet.get(definition.expressions[expression]));
		const actor: Actor = {
			id,
			sprite,
			definition,
			slot: this.slotOf(options.at ?? 'center'),
			expression,
		};

		this.actors.set(id, actor);
		this.actorLayer.addChild(sprite);
		this.placeActor(actor);
		this.applyFocus();

		const fade = options.fade ?? 0.25;
		if (fade <= 0) return Promise.resolve();

		sprite.alpha = 0;
		return this.tween(fade, (t) => {
			sprite.alpha = t;
		});
	}

	hide(id: string, fade = 0.25): Promise<void> {
		const actor = this.actors.get(id);
		if (!actor) return Promise.resolve();

		this.actors.delete(id);
		if (this.focused === id) this.focused = null;
		this.applyFocus();

		if (fade <= 0) {
			actor.sprite.destroy();
			return Promise.resolve();
		}

		return this.tween(fade, (t) => {
			actor.sprite.alpha = 1 - t;
		}).then(() => actor.sprite.destroy());
	}

	hideAll(fade = 0.25): Promise<void> {
		return Promise.all([...this.actors.keys()].map((id) => this.hide(id, fade))).then(() => undefined);
	}

	setExpression(id: string, expression: string): void {
		const actor = this.actors.get(id);
		if (!actor) return;

		const frame = actor.definition.expressions[expression];
		if (frame === undefined) {
			throw new Error(`character "${id}" has no expression "${expression}"`);
		}

		actor.expression = expression;
		actor.sprite.texture = actor.definition.sheet.get(frame);
	}

	/**
	 * Picks out whoever is speaking by dimming everyone else.
	 *
	 * A multiply tint is exactly right here: it darkens without changing hue, so a dimmed
	 * character reads as standing back rather than as being a different colour.
	 */
	focus(id: string | null): void {
		this.focused = id;
		this.applyFocus();
	}

	private applyFocus(): void {
		const lit = Math.round(0xff * (1 - this.dimAmount));
		const dim = (lit << 16) | (lit << 8) | lit;

		for (const actor of this.actors.values()) {
			const isDimmed = this.focused !== null && actor.id !== this.focused;
			actor.sprite.tint = isDimmed ? dim : 0xffffff;
		}
	}

	private slotOf(at: SlotName | number): number {
		return typeof at === 'number' ? at : SLOTS[at];
	}

	private placeActor(actor: Actor): void {
		const definition = actor.definition;
		const wanted = (definition.height ?? 0.7) * this.stageHeight;
		const scale = wanted / definition.sheet.frameHeight;

		actor.sprite.scale.set(scale);
		actor.sprite.x = Math.round(actor.slot * this.stageWidth - (definition.sheet.frameWidth * scale) / 2);
		//positioned by the feet, so characters of different heights stand on the same floor
		actor.sprite.y = Math.round((definition.baseline ?? 0.92) * this.stageHeight - wanted);
	}

	private tween(duration: number, apply: (t: number) => void): Promise<void> {
		return new Promise((resolve) => {
			this.tweens.push({ elapsed: 0, duration, apply, resolve });
		});
	}

	update(dt: number): void {
		if (this.tweens.length === 0) return;

		//iterate a copy: a tween's resolve may start another
		for (const tween of [...this.tweens]) {
			tween.elapsed += dt;
			const t = Math.min(1, tween.elapsed / tween.duration);
			tween.apply(t);

			if (t >= 1) {
				this.tweens.splice(this.tweens.indexOf(tween), 1);
				tween.resolve();
			}
		}
	}

	/** true while a fade is running, so a script can wait for it */
	get isBusy(): boolean {
		return this.tweens.length > 0;
	}
}

interface Tween {
	elapsed: number;
	duration: number;
	apply: (t: number) => void;
	resolve: () => void;
}

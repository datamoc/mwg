import { Container, Sprite, Texture } from 'pixi.js';
import { Signal } from '../../core/Signal.ts';
import { Label } from '../ui/Label.ts';
import { theme } from '../ui/theme.ts';

/** One full-screen story beat: a backdrop image, a title, the text, and the music under it. */
export interface StoryBeat {
	text: string;
	title?: string;
	/** the backdrop image path, resolved by the screen's `textureFor` */
	image?: string;
	/** the music track to play while this beat is up */
	music?: string;
}

/**
 * The beats of a story screen and where the reader is in them, with no renderer attached - the
 * same split `TabbedList` keeps, so the advance/back/skip rules are testable without a DOM.
 *
 * Music is reported as a signal rather than played: the sequence says *what* track a beat wants,
 * and the game decides whether to crossfade, loop or ignore it. A beat with no `music` reports
 * `null`, so a reader who turns the page to a silent beat gets the previous track stopped.
 *
 * @example
 * ```ts
 * import { StorySequence } from '@datamoc/mw_games/two-d/stage';
 *
 * const story = new StorySequence([
 *   { title: 'Prologue', text: 'The war begins.', music: 'intro.ogg' },
 *   { text: 'And so it went.' },
 * ]);
 * story.onMusic.add((track) => console.log(track)); // 'intro.ogg', then null
 * story.advance();
 * console.log(story.done); // true, only one page was left
 * ```
 */
export class StorySequence {
	readonly onChange = new Signal<StoryBeat>();
	readonly onMusic = new Signal<string | null>();

	private readonly beats: readonly StoryBeat[];
	private index = 0;

	constructor(beats: readonly StoryBeat[]) {
		this.beats = beats;
	}

	get length(): number {
		return this.beats.length;
	}

	/** the beat on screen, 0 when empty */
	get position(): number {
		return this.index;
	}

	/** the beat on screen; `null` for an empty story */
	get current(): StoryBeat | null {
		return this.beats[this.index] ?? null;
	}

	/** whether the last beat is the one on screen */
	get done(): boolean {
		return this.beats.length === 0 || this.index >= this.beats.length - 1;
	}

	/** the music the current beat wants, or `null` for silence */
	get music(): string | null {
		return this.current?.music ?? null;
	}

	/** moves to a beat, clamped to the ends; reports the beat and its music either way */
	goTo(index: number): void {
		const next = Math.max(0, Math.min(this.beats.length - 1, index));
		this.index = next;
		this.report();
	}

	/** turns one page; false when there was no next page */
	advance(): boolean {
		if (this.done) return false;
		this.goTo(this.index + 1);
		return true;
	}

	/** turns back one page; false when already at the first */
	back(): boolean {
		if (this.index === 0) return false;
		this.goTo(this.index - 1);
		return true;
	}

	/** jumps to the last beat, the "skip" a player who has read it before reaches for */
	skip(): void {
		this.goTo(this.beats.length - 1);
	}

	restart(): void {
		this.goTo(0);
	}

	private report(): void {
		const beat = this.current;
		if (beat) this.onChange.dispatch(beat);
		this.onMusic.dispatch(this.music);
	}
}

export interface StoryScreenOptions {
	sequence: StorySequence;
	width: number;
	height: number;
	/** how a beat's `image` path becomes a texture; `null` when the path cannot be resolved */
	textureFor?: (path: string) => Texture | null;
	/** called with the current beat's music, or `null` for a silent beat */
	playMusic?: (track: string | null) => void;
}

/**
 * A full-screen story beat: a backdrop image, a title and the text over it, advanced by a click -
 * the campaign interlude a scenario shows between maps.
 *
 * `DialogueStage` is the visual-novel model: characters standing on a backdrop, a box under them
 * doing the talking. This is the other shape an interlude needs and that one is not - one page of
 * prose filling the screen, no cast, page forward on any input - so it reuses the same `Label`
 * everything else lays words out with and leaves the sequencing to `StorySequence`, the part worth
 * testing without a renderer. Feeding it `MwlWorld.story` from an `.mwl` scenario is the intended
 * use: both carry the same `{ text, title, image, music }` shape.
 *
 * @example
 * ```ts
 * import { StoryScreen, StorySequence } from '@datamoc/mw_games/two-d/stage';
 *
 * const sequence = new StorySequence([{ title: 'Prologue', text: 'The war begins.' }]);
 * const screen = new StoryScreen({ sequence, width: 960, height: 540 });
 * console.log(screen.current?.title); // 'Prologue'
 * ```
 */
export class StoryScreen extends Container {
	readonly sequence: StorySequence;

	private readonly backdrop = new Sprite(Texture.EMPTY);
	private readonly titleLabel: Label;
	private readonly textLabel: Label;

	private readonly textureFor: (path: string) => Texture | null;
	private readonly playMusic: (track: string | null) => void;
	private width_: number;
	private height_: number;

	constructor(options: StoryScreenOptions) {
		super();

		this.sequence = options.sequence;
		this.textureFor = options.textureFor ?? (() => null);
		this.playMusic = options.playMusic ?? (() => {});
		this.width_ = options.width;
		this.height_ = options.height;
		this.titleLabel = new Label({ text: '', color: theme().color.textHighlight });
		this.textLabel = new Label({ text: '', wrapWidth: this.width_ * 0.8 });

		this.addChild(this.backdrop);
		this.addChild(this.titleLabel);
		this.addChild(this.textLabel);

		this.eventMode = 'static';
		this.on('pointertap', this.handleAdvance);

		this.sequence.onChange.add(this.handleBeat);
		this.sequence.onMusic.add(this.playMusic);

		this.applyBeat(this.sequence.current);
	}

	/** the beat on screen */
	get current(): StoryBeat | null {
		return this.sequence.current;
	}

	/** turns one page; false when the story is over, the caller's cue to change scene */
	advance(): boolean {
		return this.sequence.advance();
	}

	/** jumps to the end, for a player who has already read it */
	skip(): void {
		this.sequence.skip();
	}

	resize(width: number, height: number): void {
		this.width_ = width;
		this.height_ = height;
		this.applyBeat(this.current);
	}

	private readonly handleAdvance = (): void => {
		this.advance();
	};

	private readonly handleBeat = (beat: StoryBeat): void => {
		this.applyBeat(beat);
	};

	private applyBeat(beat: StoryBeat | null): void {
		if (!beat) {
			this.backdrop.visible = false;
			return;
		}

		const texture = beat.image ? this.textureFor(beat.image) : null;
		this.backdrop.visible = texture !== null;
		if (texture) {
			this.backdrop.texture = texture;
			//cover the screen without distorting the art, the way a backdrop changes aspect
			const scale = Math.max(this.width_ / texture.width, this.height_ / texture.height);
			this.backdrop.scale.set(scale);
			this.backdrop.x = (this.width_ - texture.width * scale) / 2;
			this.backdrop.y = (this.height_ - texture.height * scale) / 2;
		}

		this.titleLabel.setText(beat.title ?? '');
		this.titleLabel.x = this.width_ * 0.1;
		this.titleLabel.y = this.height_ * 0.12;
		this.textLabel.setText(beat.text);
		this.textLabel.x = this.width_ * 0.1;
		this.textLabel.y = this.height_ * 0.24;
		this.textLabel.style.wordWrapWidth = this.width_ * 0.8;
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		this.sequence.onChange.remove(this.handleBeat);
		this.sequence.onMusic.remove(this.playMusic);
		super.destroy(options);
	}
}

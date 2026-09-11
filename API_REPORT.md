# mwg API report

Generated from the built declarations by `npm run api:report`; verified by
`tests/api-surface.test.ts`. Do not edit by hand - run `npm run api:report` after a
build instead.

## root (`@datamoc/mw_games`)

### `Achievements` (class)

    export declare class Achievements {
        private definitions;
        private counts;

        private fresh;
        define(definition: AchievementDef): void;

        count(counter: string): number;

        increment(counter: string, amount?: number): string[];

        unlocked(id: string): boolean;

        progress(id: string): {
            count: number;
            target: number;
        };

        drainNew(): string[];
        toJSON(): {
            counts: [string, number][];
        };

        static fromJSON(definitions: AchievementDef[], data: {
            counts: [string, number][];
        }): Achievements;
    }

### `ActionJournal` (class)

    export declare class ActionJournal<Action, Event> {
        private entries;
        private nextSequence;
        append(action: Action, events?: readonly Event[]): ActionJournalEntry<Action, Event>;
        get size(): number;
        get all(): readonly ActionJournalEntry<Action, Event>[];

        mark(): number;
        since(sequence: number): ActionJournalEntry<Action, Event>[];

        truncate(sequence: number): void;
        toJSON(): ActionJournalEntry<Action, Event>[];
        static fromJSON<Action, Event>(entries: readonly ActionJournalEntry<Action, Event>[]): ActionJournal<Action, Event>;
    }

### `ActorAnimator` (class)

    export declare class ActorAnimator {
        private sprite;
        private animationName;
        private variant;
        private idleOrMove;
        private inAction;
        constructor(sprite: AnimatedSprite, options: ActorAnimatorOptions);

        get state(): ActorAnimationState;
        get variantName(): string;

        setMoving(moving: boolean, variant?: string): void;

        playAction(variant?: string, restart?: boolean): void;
        private onSpriteFinish;
        private apply;
    }

### `Actors` (namespace)

    export * as Actors from './actors/index.ts'

### `advanceReveal` (function)

    export declare function advanceReveal(state: RevealState, dt: number): boolean;

### `AI` (namespace)

    export * as AI from './ai/index.ts'

### `AnimatedSprite` (class)

    export declare class AnimatedSprite extends TintedSprite {
        private animations;
        private current;
        private currentName;
        private elapsed;
        private finished;
        private readonly offset;

        onFinish: ((name: string) => void) | null;
        paused: boolean;
        add(name: string, frames: readonly AnimationFrameInput[], options?: AnimationOptions): this;
        has(name: string): boolean;
        get playing(): string | null;
        get isFinished(): boolean;

        get frameOffset(): {
            readonly x: number;
            readonly y: number;
        };

        get elapsedTime(): number;

        play(name: string, restart?: boolean): this;
        stop(): void;
        update(dt: number): void;
        private show;
    }

### `Animation` (class)

    export declare class Animation {
        readonly frames: readonly AnimationFrame[];

        readonly frameDuration: number;
        readonly loop: boolean;
        readonly startTime: number;

        readonly duration: number;

        private readonly times;
        constructor(frames: readonly AnimationFrameInput[], { fps, loop, startTime }?: AnimationOptions);

        frameAt(seconds: number): AnimationFrame;

        frameIndexAt(seconds: number): number;
    }

### `applyImageModifiers` (function)

    export declare function applyImageModifiers(sprite: Sprite, parsed: ParsedImagePath, scale?: number): void;

### `Audio` (namespace)

    export * as Audio from './audio/index.ts'

### `autotileFrames` (function)

    export declare function autotileFrames(width: number, height: number, sameTerrain: (x: number, y: number) => boolean, frames: readonly number[]): Int32Array;

### `Bar` (class)

    export declare class Bar extends Container {
        private track;
        private fill;
        private width_;
        private height_;
        private explicitColor;
        private fillColor;
        private fraction;
        private readonly fillTexture?;
        private readonly backgroundTexture?;
        private readonly background_?;
        private readonly roundUpToPixel;
        private readonly themeListener;
        constructor(options: BarOptions);

        get value(): number;
        setValue(value: number, max?: number): void;

        get color(): number;

        setColor(color: number): void;

        get background(): number;
        resize(width: number, height: number): void;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `Battle` (namespace)

    export * as Battle from './battle/index.ts'

### `BitmapLabel` (class)

    export declare class BitmapLabel extends BitmapText {
        private readonly opts;
        private readonly themeListener;
        constructor(options?: BitmapLabelOptions | string);

        setText(value: string): void;

        private restyle;
        destroy(options?: Parameters<BitmapText['destroy']>[0]): void;
    }

### `bitmapLabelStyle` (function)

    export declare function bitmapLabelStyle(opts: BitmapLabelOptions, t: Theme): TextStyleOptions;

### `Blob` (class)

    export declare class Blob {
        readonly width: number;
        readonly height: number;
        private volume;
        constructor(width: number, height: number);

        private index;

        volumeAt(x: number, y: number): number;

        total(): number;

        seed(x: number, y: number, amount: number): void;

        clear(x: number, y: number): void;

        spread(open: (x: number, y: number) => boolean, spread?: number, decay?: number): Array<{
            x: number;
            y: number;
        }>;

        cellsAbove(minimum: number): Array<{
            x: number;
            y: number;
            volume: number;
        }>;
        toJSON(): {
            width: number;
            height: number;
            volume: number[];
        };
        static fromJSON(data: {
            width: number;
            height: number;
            volume: number[];
        }): Blob;
    }

### `BLOB_SHAPES` (const)

    export declare const BLOB_SHAPES: readonly NeighborMask[];

### `blobIndex` (function)

    export declare function blobIndex(neighbors: NeighborMask): number;

### `Board` (namespace)

    export * as Board from './board/index.ts'

### `Button` (class)

    export declare class Button extends Container {
        readonly onClick: Signal<void>;
        readonly onPress: Signal<void>;
        readonly onRelease: Signal<void>;
        private readonly skin?;
        private readonly labelOptions;
        private background;
        private labelText;
        private icon;
        private width_;
        private height_;
        private state;
        private disabled_;
        private readonly themeListener;
        constructor(options: ButtonOptions);

        private static createBackground;

        resize(width: number, height: number): void;
        setText(text: string | undefined): void;
        get disabled(): boolean;
        setDisabled(disabled: boolean): void;
        private setState;

        private layoutContent;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `Camera` (class)

    export declare class Camera {

        readonly world: Container<import("pixi.js").ContainerChild>;

        x: number;
        y: number;
        private _zoom;
        private deadzone;
        private readonly pixelPerfectTileSize?;
        private viewWidth;
        private viewHeight;
        private screenX;
        private screenY;
        private followTarget;
        private followIntensity;
        private shakeMagnitude;
        private shakeRemaining;
        private shakeDuration;
        private shakeX;
        private shakeY;

        private bounds;
        constructor(options?: CameraOptions);
        get zoom(): number;
        set zoom(value: number);

        setViewport(width: number, height: number, screenX?: number, screenY?: number): void;

        get view(): {
            x: number;
            y: number;
            width: number;
            height: number;
        };

        setBounds(bounds: {
            minX: number;
            minY: number;
            maxX: number;
            maxY: number;
        } | null): void;

        snapTo(x: number, y: number): void;

        panTo(x: number, y: number, intensity?: number): void;

        follow(target: {
            x: number;
            y: number;
        }, intensity?: number): void;
        stopFollowing(): void;

        shake(magnitude: number, duration?: number): void;
        update(dt: number): void;

        toScreen(x: number, y: number): {
            x: number;
            y: number;
        };

        toWorld(x: number, y: number): {
            x: number;
            y: number;
        };
        private clampedCentre;
        private apply;
    }

### `checkNoControlCharacters` (function)

    export declare function checkNoControlCharacters(text: string): void;

### `checkSize` (function)

    export declare function checkSize(data: string | Uint8Array, options?: SizeLimitOptions): void;

### `Collection` (class)

    export declare class Collection {
        private readonly prefix;
        private readonly storage;
        constructor(name: string, options?: CollectionOptions);

        get size(): number;

        all(): DbRecord[];
        get(id: string): DbRecord | undefined;

        put(record: DbRecord): void;
        remove(id: string): void;

        where(predicate: (record: DbRecord) => boolean): DbRecord[];

        clear(): void;
        private keys;
        private read;
    }

### `COLOR_BLINDNESS_MATRICES` (const)

    export declare const COLOR_BLINDNESS_MATRICES: Record<ColorBlindnessType, ColorMatrix>;

### `colorShiftMatrix` (function)

    export declare function colorShiftMatrix(red: number, green: number, blue: number): ColorMatrixFilter['matrix'];

### `ColorTransformBatcher` (class)

    export declare class ColorTransformBatcher extends Batcher {

        static extension: {
            readonly type: readonly [ExtensionType.Batcher];
            readonly name: 'mwg-color-transform';
        };
        geometry: Geometry;
        shader: Shader;
        name: "mwg-color-transform";
        vertexSize: number;
        constructor(options: BatcherOptions);
        packAttributes(element: MeshElement, float32View: Float32Array, uint32View: Uint32Array, index: number, textureId: number): void;
        packQuadAttributes(element: QuadElement, float32View: Float32Array, uint32View: Uint32Array, index: number, textureId: number): void;

        _updateMaxTextures(maxTextures: number): void;
        destroy(): void;
    }

### `completeReveal` (function)

    export declare function completeReveal(state: RevealState): void;

### `Container2D` (export)

    export { Container2D }

### `contrastRatio` (function)

    export declare function contrastRatio(a: number, b: number): number;

### `createCamera` (function)

    export declare function createCamera(options?: CameraOptions): Camera;

### `createColorBlindnessFilter` (function)

    export declare function createColorBlindnessFilter(type: ColorBlindnessType): ColorMatrixFilter;

### `croppedTexture` (function)

    export declare function croppedTexture(texture: Texture, parsed: ParsedImagePath): Texture;

### `defaultTheme` (const)

    export declare const defaultTheme: Theme;

### `deserializeReplay` (function)

    export declare function deserializeReplay(json: string): ReplayEvent[];

### `detectWebGpu` (function)

    export declare function detectWebGpu(): Promise<WebGpuDetection>;

### `DialogueStage` (class)

    export declare class DialogueStage extends Container {
        private backdropLayer;
        private actorLayer;
        private backdrop;
        private outgoingBackdrop;
        private actors;
        private definitions;
        private focused;
        private stageWidth;
        private stageHeight;
        private tweener;

        dimAmount: number;
        constructor(width: number, height: number);

        defineCharacter(id: string, definition: CharacterDefinition): void;
        resize(width: number, height: number): void;

        setBackdrop(texture: Texture, fade?: number): Promise<void>;
        private fitBackdrop;
        show(id: string, options?: ShowOptions): Promise<void>;
        hide(id: string, fade?: number): Promise<void>;
        hideAll(fade?: number): Promise<void>;
        setExpression(id: string, expression: string): void;

        focus(id: string | null): void;
        private applyFocus;
        private slotOf;
        private placeActor;
        update(dt: number): void;

        get isBusy(): boolean;
    }

### `Easing` (const)

    export declare const Easing: Record<'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic', Easing>;

### `EMPTY` (const)

    export declare const EMPTY = -1;

### `EntityRegistry` (class)

    export declare class EntityRegistry<T extends object> {
        private entities;
        private ids;
        private sequence;

        add(entity: T, requestedId?: EntityId): EntityId;
        get(id: EntityId): T | undefined;

        idOf(entity: T): EntityId | undefined;
        has(id: EntityId): boolean;
        remove(id: EntityId): boolean;
        get size(): number;
    }

### `escapeHtml` (function)

    export declare function escapeHtml(text: string): string;

### `FeedbackClient` (class)

    export declare class FeedbackClient extends HttpTransport {
        constructor(options: FeedbackOptions);
        submit(request: FeedbackRequest): Promise<FeedbackResponse>;
    }

### `FLOATING_TEXT_STACK_GAP` (const)

    export declare const FLOATING_TEXT_STACK_GAP = 4;

### `FloatingText` (class)

    export declare class FloatingText extends Container {
        private readonly duration;
        private readonly rise;
        private readonly hold;

        private readonly rising;
        private elapsed;
        private done;
        constructor(options: FloatingTextOptions);

        get finished(): boolean;

        get riseOffset(): number;

        ageAtLeast(seconds: number): void;

        update(dt: number): void;
    }

### `floatingTextAgeAtLeast` (function)

    export declare function floatingTextAgeAtLeast(elapsed: number, duration: number, atLeast: number): number;

### `floatingTextAlpha` (function)

    export declare function floatingTextAlpha(t: number, hold: number): number;

### `floatingTextRise` (function)

    export declare function floatingTextRise(t: number, rise: number, reduce?: boolean): number;

### `FloatingTextStack` (class)

    export declare class FloatingTextStack extends Container {
        private readonly live;

        push(options: FloatingTextPush): FloatingText;

        update(dt: number): void;

        get count(): number;

        clear(): void;
    }

### `floatingTextStackLifePenalty` (function)

    export declare function floatingTextStackLifePenalty(linesBelow: number): number;

### `floatingTextStackLift` (function)

    export declare function floatingTextStackLift(older: FloatingTextStackEntry, below: FloatingTextStackEntry, gap?: number): number;

### `floatingTextStackMoves` (function)

    export declare function floatingTextStackMoves(live: readonly FloatingTextStackEntry[], incoming: FloatingTextStackEntry, gap?: number): FloatingTextStackMove[];

### `Game` (class)

    export declare class Game {
        private static instance;
        readonly app: Application<import("pixi.js").Renderer>;

        elapsed: number;

        timeTotal: number;

        timeScale: number;

        readonly onFrame: Signal<number>;
        private hitStopRemaining;
        private hitStopScale;
        private stack;
        private pending;
        private options;
        private started;
        private stopWatchingDpr;
        constructor(options?: GameOptions);

        get width(): number;
        get height(): number;

        static get current(): Game;
        start(first: SceneClass<Scene2D>): Promise<void>;

        switchScene(next: SceneClass<Scene2D>): void;

        pushScene(next: SceneClass<Scene2D>): void;

        popScene(result?: unknown): void;

        get currentScene(): Scene2D | null;

        hitStop(duration: number, scale?: number): void;

        step(dt: number): void;

        private expose;
        private frame;
        private switchNow;

        private applySwitch;

        private applyPush;

        private applyPop;
        destroy(): void;
    }

### `Generator` (class)

    export declare class Generator {
        private s0;
        private s1;
        private s2;
        private s3;
        readonly seed: number;
        constructor(seed?: number);

        nextUint32(): number;

        float(): number;

        int(bound: number): number;

        getState(): [number, number, number, number];
        setState(state: readonly [number, number, number, number]): void;
    }

### `Gradient` (const)

    export declare const Gradient: typeof FillGradient;

### `Halo` (class)

    export declare class Halo extends AnimatedSprite {
        private readonly offsetX;
        private readonly offsetY;
        constructor(options: HaloOptions);

        follow(x: number, y: number): this;
    }

### `HALO_ANIMATION` (const)

    export declare const HALO_ANIMATION = "halo";

### `HelpScreen` (class)

    export declare class HelpScreen extends Container {
        private list;
        private body;
        private topics;
        constructor(options: HelpScreenOptions);
        private showBody;

        handleAction(action: Action): boolean;
    }

### `hexDistance` (function)

    export declare function hexDistance(a: HexCoord, b: HexCoord): number;

### `hexLine` (function)

    export declare function hexLine(a: HexCoord, b: HexCoord): HexCoord[];

### `hexNeighbors` (function)

    export declare function hexNeighbors(x: number, y: number): HexCoord[];

### `hexRange` (function)

    export declare function hexRange(center: HexCoord, radius: number): HexCoord[];

### `hexToPixel` (function)

    export declare function hexToPixel(x: number, y: number, tileWidth: number, tileHeight: number, shape?: HexShape): {
        x: number;

### `highContrastTheme` (const)

    export declare const highContrastTheme: Theme;

### `HookRegistry` (class)

    export declare class HookRegistry<TArgs extends unknown[]> {
        private hooks;
        on(event: string, handler: (...args: TArgs) => void, source?: unknown): void;

        off(handler: (...args: TArgs) => void): void;

        offSource(source: unknown): void;

        emit(event: string, ...args: TArgs): void;

        get size(): number;
        clear(): void;
    }

### `I18n` (namespace)

    export * as I18n from './i18n/index.ts'

### `IconGrid` (class)

    export declare class IconGrid extends Container {
        private readonly selection;
        private cells;
        private cellsLayer;
        private highlight;
        private pickupHighlight;
        private mask_;
        private viewWidth;
        private viewHeight;
        private columns;
        private cellSize;
        private longPressDuration;
        private scrollRow;

        private pickedUp;
        private pressedIndex;
        private pressTimer;
        onSelect: ((item: IconGridItem, index: number) => void) | null;
        onHighlight: ((item: IconGridItem, index: number) => void) | null;
        onQuickslot: ((item: IconGridItem, index: number) => void) | null;
        onReorder: ((fromIndex: number, toIndex: number) => void) | null;

        private readonly themeListener;

        private columnX;
        constructor(options: IconGridOptions);
        destroy(options?: Parameters<Container['destroy']>[0]): void;
        private drawMask;
        get visibleRows(): number;
        get rows(): number;
        get selectedIndex(): number;
        get selected(): IconGridItem | null;
        get length(): number;
        setItems(items: IconGridItem[]): void;
        private releaseCell;
        resize(width: number, height: number): void;

        update(dt: number): void;

        tapCell(index: number): void;

        private swapCells;

        cancelPickup(): void;

        move(dx: number, dy: number): boolean;
        select(index: number): void;
        confirm(): boolean;

        handleAction(action: Action): boolean;

        private cellRect;
        private refresh;
    }

### `imageModifier` (function)

    export declare function imageModifier(path: ParsedImagePath, name: string): ImageModifier | undefined;

### `importTwee` (function)

    export declare function importTwee(source: string): TwineStory;

### `Input` (namespace)

    export * as Input from './Input.ts'

### `inspectGraphicsCapabilities` (function)

    export declare function inspectGraphicsCapabilities(probe?: GraphicsProbe): GraphicsCapabilities;

### `Label` (class)

    export declare class Label extends Text {
        private readonly opts;
        private readonly themeListener;
        private revealSource;
        private reveal;
        constructor(options?: LabelOptions | string);

        setColor(color: number): void;

        setText(value: string): void;

        showProgressive(value: string, speed?: number): void;

        updateReveal(dt: number): boolean;

        completeReveal(): void;
        private renderRevealed;

        private restyle;
        destroy(options?: Parameters<Text['destroy']>[0]): void;
    }

### `LayeredSprite` (class)

    export declare class LayeredSprite extends Container {
        private layers;

        addLayer(name: string, texture: Texture2D, order?: number): TintedSprite;
        removeLayer(name: string): void;
        layer(name: string): TintedSprite | undefined;
        hasLayer(name: string): boolean;

        setTexture(name: string, texture: Texture2D): void;
        private resort;
    }

### `layoutVertical` (function)

    export declare function layoutVertical(text: string, options: VerticalLayoutOptions): GlyphLayout[];

### `ListView` (class)

    export declare class ListView extends Container {
        private readonly selection;
        private rows;
        private rowsLayer;
        private highlight;
        private mask_;
        private viewWidth;
        private viewHeight;
        private rowHeight;
        private readonly explicitRowHeight;
        private scroll;
        private readonly themeListener;
        onSelect: ((item: ListItem, index: number) => void) | null;
        onHighlight: ((item: ListItem, index: number) => void) | null;
        constructor(options: ListViewOptions);

        private restyle;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
        private drawMask;
        get visibleRows(): number;
        get selectedIndex(): number;
        get selected(): ListItem | null;
        get length(): number;
        setItems(items: ListItem[]): void;
        resize(width: number, height: number): void;

        move(delta: number): boolean;
        select(index: number): void;
        confirm(): boolean;

        handleAction(action: Action): boolean;
        private refresh;
    }

### `LoadingScreen` (class)

    export declare class LoadingScreen extends Container {
        private readonly backdrop;
        private readonly title;
        private readonly status;
        private readonly progress;
        private readonly onRetry?;
        private readonly onCancel?;
        private width_;
        private height_;
        constructor(options: LoadingScreenOptions);
        setSnapshot(snapshot: LoadSnapshot): void;

        bind(queue: LoadQueue): () => void;

        retry(): void;

        cancel(): void;
        resize(width: number, height: number): void;
        private layout;
    }

### `LoadQueue` (class)

    export declare class LoadQueue {
        readonly changed: Signal<LoadSnapshot>;
        private readonly tasks;
        private readonly progress;
        private status_;
        private current_;
        private error_;
        private cancelled;
        add(task: LoadTask): this;
        get snapshot(): LoadSnapshot;

        start(): Promise<void>;

        cancel(): void;

        retry(): void;
        private report;
        private emit;
    }

### `loadTiledMap` (function)

    export declare function loadTiledMap(data: TiledMapData, sheets: SpriteSheet | TilesetSheet[]): LoadedTiledMap;

### `LockstepClient` (class)

    export declare class LockstepClient {
        readonly onWelcome: Signal<{
            id: string;
        }>;
        readonly onTick: Signal<TickEvent>;
        readonly onClose: Signal<void>;
        private socket;
        private readonly url;
        private readonly createSocket;
        private _id;
        constructor(options: LockstepClientOptions);

        get id(): string | null;
        get connected(): boolean;
        connect(): void;

        submitInput(payload: unknown): void;
        close(): void;
        private handleMessage;
    }

### `Logger` (class)

    export declare class Logger {
        private readonly category;
        private level;
        private readonly sink;
        constructor(category: string, options?: LoggerOptions);

        setLevel(level: LogLevel): void;
        debug(message: string, data?: unknown): void;
        info(message: string, data?: unknown): void;
        warn(message: string, data?: unknown): void;
        error(message: string, data?: unknown): void;
        private write;
    }

### `markupToHtml` (function)

    export declare function markupToHtml(spans: readonly MarkupSpan[]): string;

### `meetsContrast` (function)

    export declare function meetsContrast(foreground: number, background: number, level?: ContrastLevel, large?: boolean): boolean;

### `MersenneTwister` (class)

    export declare class MersenneTwister {
        private state;
        private index;
        private seedValue;
        private produced;
        constructor(seed?: number);

        seed(seed: number): void;
        private generate;

        nextUint32(): number;

        float(): number;

        int(bound: number): number;

        discard(count: number): void;

        get discardCount(): number;
        getState(): MersenneTwisterState;
        setState(state: MersenneTwisterState): void;
    }

### `MessageBox` (class)

    export declare class MessageBox extends Window {
        private pages;
        private pageIndex;
        private speed;
        private reveal;
        private pageText;
        private pageCues;
        private nextCue;
        private mode;
        private body;
        private speakerLabel;
        private portrait;
        private portraitLayer;
        private prompt;
        private choices;
        private choiceList;
        private onDone;
        private onSound;
        private finished;
        private autoAdvance?;
        private autoAdvanceElapsed;
        private announce;
        private readonly messageThemeListener;
        constructor(options: MessageBoxOptions);

        private restyleMessage;
        destroy(options?: Parameters<Window['destroy']>[0]): void;
        private showPage;

        private renderBody;
        private formatLine;
        private playRevealedSounds;
        private get pageComplete();
        update(dt: number): void;
        handleAction(action: Action): boolean;

        private advance;
        private showChoices;

        private grow;
        private finish;
    }

### `messageBoxPresenter` (function)

    export declare function messageBoxPresenter(windows: WindowStack, options?: MessageBoxPresenterOptions): DialoguePresenter;

### `Minimap` (class)

    export declare class Minimap extends Container {
        private readonly widthInCells;
        private readonly cellSize;
        private readonly shape;
        private renderTexture;
        private sprite;
        private drawn;
        private marker;
        constructor(options: MinimapOptions);

        get exploredCount(): number;

        sync(explored: ReadonlySet<number>, colorFor: (x: number, y: number) => number): void;

        setMarker(x: number, y: number, facing?: number, color?: number): void;

        setMarkers(markers: readonly MinimapMarker[]): void;

        reset(): void;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `minimapCellCenter` (function)

    export declare function minimapCellCenter(x: number, y: number, cellSize: number, shape?: 'square' | 'hex'): {
        x: number;

### `motionDuration` (function)

    export declare function motionDuration(duration: number, intent?: MotionIntent): number;

### `Mwl` (namespace)

    export * as Mwl from './mwl/index.ts'

### `newlyRevealed` (function)

    export declare function newlyRevealed(explored: ReadonlySet<number>, alreadyDrawn: ReadonlySet<number>): number[];

### `NewsClient` (class)

    export declare class NewsClient extends HttpTransport {
        constructor(options: NewsOptions);

        fetchItems(): Promise<NewsItem[]>;
    }

### `NewsSeenTracker` (class)

    export declare class NewsSeenTracker {
        private readonly store;
        constructor(options: NewsSeenOptions);
        private readSeen;
        isSeen(id: string): boolean;
        markSeen(id: string): void;

        unseen(items: readonly NewsItem[]): NewsItem[];
    }

### `NinePatch` (class)

    export declare class NinePatch extends Container {
        private sprite;
        constructor(texture: Texture2D, options: NinePatchOptions);

        get border(): {
            left: number;
            top: number;
            right: number;
            bottom: number;
        };
        resize(width: number, height: number): void;
    }

### `NO_COLOR_ADD` (const)

    export declare const NO_COLOR_ADD = 0;

### `Node2D` (class)

    export declare class Node2D extends Container {
    }

### `packColorAdd` (function)

    export declare function packColorAdd(r: number, g: number, b: number, a?: number): number;

### `packTintAdd` (function)

    export declare function packTintAdd(color: number, strength: number): number;

### `parseCSV` (function)

    export declare function parseCSV<T = Record<string, string>>(source: string, options?: CsvOptions): T[];

### `parseImagePath` (function)

    export declare function parseImagePath(value: string): ParsedImagePath;

### `parseMarkdown` (function)

    export declare function parseMarkdown(text: string): MarkdownSpan[];

### `parseMarkup` (function)

    export declare function parseMarkup(source: string, options?: MarkupOptions): MarkupSpan[];

### `ParticleEmitter` (class)

    export declare class ParticleEmitter extends Container {
        private readonly pool;
        private readonly sprites;
        private readonly rate;
        private readonly life;
        private readonly speed;
        private readonly angleRange;
        private readonly gravityX;
        private readonly gravityY;
        private readonly scaleRange;
        private readonly alphaRange;
        private readonly spin;

        private readonly frames?;

        private readonly spawnArea;
        private emitting;

        private poolCursor;

        private debt;
        constructor(options?: ParticleEmitterOptions);

        start(): void;

        stop(): void;
        get isEmitting(): boolean;

        get activeCount(): number;

        get particles(): readonly Particle[];

        burst(count: number): number;
        private spawn;

        private spawnOffset;
        update(dt: number): void;

        private draw;

        clear(): void;
    }

### `pixelToHex` (function)

    export declare function pixelToHex(px: number, py: number, tileWidth: number, tileHeight: number, shape?: HexShape): HexCoord;

### `Player` (class)

    export declare class Player {
        private frame;
        private index;
        private readonly events;
        private readonly dispatch;
        private readonly frames;
        private readonly onFrame;
        constructor(events: readonly ReplayEvent[], dispatch: (action: string) => void, frames: Signal<number>);

        get done(): boolean;

        stop(): void;
        private pump;
    }

### `PlayerInput` (class)

    export declare class PlayerInput {
        readonly id: string;
        readonly padIndex?: number;
        constructor(id: string, options?: PlayerInputOptions);
        private scoped;

        bind(action: Action, keys: readonly string[]): void;

        bindButton(action: Action, buttons: readonly number[]): void;

        bindAxis(action: Action, axis: number, direction: 1 | -1): void;

        bindTouch(action: Action, id?: string): void;

        pressTouch(id: string): void;
        releaseTouch(id: string): void;
        isDown(action: Action): boolean;
        justPressed(action: Action): boolean;
        justReleased(action: Action): boolean;

        keysFor(action: Action): string[];
    }

### `PlayerStats` (class)

    export declare class PlayerStats<T, S = T> {
        private readonly store;
        private readonly initial;
        private readonly combine;
        constructor(options: PlayerStatsOptions<T, S>);

        get(): T;

        record(summary: S): T;

        reset(): void;
    }

### `prefersReducedMotion` (function)

    export declare function prefersReducedMotion(): boolean;

### `PresentationQueue` (class)

    export declare class PresentationQueue<Event> {
        private readonly play;
        private queue;
        private busy;
        private remaining;
        constructor(options: PresentationQueueOptions<Event>);

        enqueue(events: readonly Event[]): void;

        update(dt: number): void;

        get isBusy(): boolean;

        clear(): void;
        private advance;
    }

### `Projectile` (class)

    export declare class Projectile {
        private sprite;
        private fromX;
        private fromY;
        private toX;
        private toY;
        private duration;
        private elapsed;
        private arrived;
        constructor(sprite: ProjectilePoint, from: ProjectilePoint, to: ProjectilePoint, options?: ProjectileOptions);
        get done(): boolean;

        get progress(): number;

        update(dt: number): boolean;
    }

### `Random` (namespace)

    export * as Random from './Random.ts'

### `RandomStreams` (class)

    export declare class RandomStreams {
        private baseSeed;
        private streams;
        constructor(seed?: number);

        stream(name: string): MersenneTwister;

        seedOf(name: string): number | undefined;

        reseed(seed: number): void;

        names(): string[];
        getState(): Record<string, MersenneTwisterState>;

        setState(state: Readonly<Record<string, MersenneTwisterState>>): void;
    }

### `ReactionTable` (class)

    export declare class ReactionTable<TState> {
        private rules;
        private active;
        private spent;
        constructor(rules?: ReactionRule<TState>[]);
        add(rule: ReactionRule<TState>): void;

        remove(id: string): void;

        check(state: Readonly<TState>): string[];

        isActive(id: string): boolean;

        reset(): void;
        toJSON(): {
            active: string[];
            spent: string[];
        };

        static fromJSON<TState>(rules: ReactionRule<TState>[], data: {
            active: string[];
            spent: string[];
        }): ReactionTable<TState>;
    }

### `RebindScreen` (class)

    export declare class RebindScreen extends Container {
        private list;
        private actions;
        private labelFor;
        private onConflict;
        private capturing;
        private onKeyCaptured;
        constructor(options: RebindScreenOptions);
        private rows;
        private rowText;
        private refresh;
        private startCapture;
        private cancelCapture;
        private finishCapture;

        get isCapturing(): boolean;

        handleAction(action: Action): boolean;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `Recorder` (class)

    export declare class Recorder {
        private frame;
        private readonly recorded;
        private readonly actions;
        private readonly frames;
        private readonly onAction;
        private readonly onFrame;
        constructor(actions: Signal<string>, frames: Signal<number>);
        get events(): readonly ReplayEvent[];

        toJSON(): ReplayEvent[];

        stop(): void;
    }

### `Rectangle2D` (export)

    export { Rectangle2D }

### `rectOf` (function)

    export declare function rectOf(rectangle: Rectangle): Rect;

### `reducedMotion` (function)

    export declare function reducedMotion(): boolean;

### `registerColorTransform` (function)

    export declare function registerColorTransform(): void;

### `Registry` (class)

    export declare class Registry<T> {
        private items;

        register(name: string, value: T): void;
        get(name: string): T;
        has(name: string): boolean;

        list(): string[];
    }

### `relativeLuminance` (function)

    export declare function relativeLuminance(color: number): number;

### `RENDERING_DECISIONS` (const)

    export declare const RENDERING_DECISIONS: readonly RenderingDecision[];

### `Resources` (namespace)

    export * as Resources from './assets/index.ts'

### `revealComplete` (function)

    export declare function revealComplete(state: RevealState): boolean;

### `RichLabel` (class)

    export declare class RichLabel extends HTMLText {
        private readonly opts;
        private readonly themeListener;
        private revealSpans;
        private reveal;
        constructor(options?: RichLabelOptions | string);

        setText(value: string): void;

        showProgressive(value: string, speed?: number): void;

        updateReveal(dt: number): boolean;

        completeReveal(): void;
        private renderRevealed;

        private restyle;
        destroy(options?: Parameters<HTMLText['destroy']>[0]): void;
    }

### `Roguelike` (namespace)

    export * as Roguelike from './roguelike/index.ts'

### `Rpg` (namespace)

    export * as Rpg from './rpg/index.ts'

### `RunHistory` (class)

    export declare class RunHistory<T> {
        private readonly store;
        private readonly limit?;
        constructor(options: RunHistoryOptions);
        private readAll;

        record(summary: T): RunHistoryEntry<T>;

        all(): readonly RunHistoryEntry<T>[];

        ranked(by: (summary: T) => number, order?: 'asc' | 'desc'): readonly RunHistoryEntry<T>[];

        clear(): void;
    }

### `sanitizeInboundText` (function)

    export declare function sanitizeInboundText(text: string, options?: SizeLimitOptions): string;

### `SaveSyncClient` (class)

    export declare class SaveSyncClient extends HttpTransport {
        constructor(options: SaveSyncOptions);

        upload(slot: string, payload: string): Promise<SaveSyncResponse>;

        download(slot: string): Promise<string>;

        list(): Promise<string[]>;
        private slotUrl;
    }

### `SaveSystem` (class)

    export declare class SaveSystem<T> {
        private namespace;
        private version;
        private migrations;
        private storage;
        constructor(options: SaveSystemOptions);
        private key;
        save(slot: string, state: T, preview?: unknown): void;

        load(slot: string): SaveData<T> | null;

        importExternal(slot: string, externalBytes: Uint8Array, normalize: (bytes: Uint8Array) => unknown, preview?: unknown): void;
        delete(slot: string): void;

        exportSlot(slot: string, scrambleKey?: string): string | null;

        importSlot(slot: string, payload: string, scrambleKey?: string): void;

        list(): Array<{
            slot: string;
            meta: SaveMeta;
        }>;
    }

### `Scene` (class)

    export declare abstract class Scene {

        readonly onDestroy: Signal<void>;
        private destroyed;

        abstract create(): void;

        update(_dt: number): void;

        resize(_width: number, _height: number): void;

        onSuspend(): void;

        onResume(_result: unknown): void;
        destroy(): void;

        protected teardown(): void;
        get isDestroyed(): boolean;
    }

### `Scene2D` (class)

    export declare abstract class Scene2D extends Scene {

        readonly stage: Container2D;
        protected teardown(): void;
    }

### `SceneComponentHost` (class)

    export declare class SceneComponentHost<TScene extends Scene = Scene> {
        private order;
        private registry;

        add(component: SceneComponent<TScene>, scene: TScene): void;
        has(name: string): boolean;

        get<T extends SceneComponent<TScene> = SceneComponent<TScene>>(name: string): T;
        update(scene: TScene, dt: number): void;
        resize(scene: TScene, width: number, height: number): void;
        onSuspend(scene: TScene): void;
        onResume(scene: TScene, result: unknown): void;

        destroy(scene: TScene): void;
    }

### `SceneStack` (class)

    export declare class SceneStack<T extends Scene = Scene> {
        private scenes;

        get current(): T | null;
        get depth(): number;

        replace(scene: T): void;

        push(scene: T): void;

        pop(result?: unknown): void;

        update(dt: number): void;

        resize(width: number, height: number): void;
        destroy(): void;
    }

### `scramble` (function)

    export declare function scramble(text: string, key: string): string;

### `ScreenEffects` (class)

    export declare class ScreenEffects extends Container {
        private readonly overlay;
        private readonly defaultColor;
        private viewWidth;
        private viewHeight;
        private phase;
        private elapsed;
        private duration;

        private fromAlpha;
        private toAlpha;
        constructor(options?: ScreenEffectsOptions);

        setViewport(width: number, height: number): void;
        private redraw;

        get isBusy(): boolean;

        get washAlpha(): number;

        fadeOut(duration: number, color?: number): void;

        fadeIn(duration: number, color?: number): void;

        flash(duration: number, color?: number, peak?: number): void;

        setTint(color: number, alpha: number): void;

        clear(): void;
        private begin;

        update(dt: number): boolean;
    }

### `screenReader` (const)

    export declare const screenReader: ScreenReader;

### `ScreenReader` (class)

    export declare class ScreenReader {
        private polite;
        private assertive;
        private region;

        announce(text: string, options?: {
            assertive?: boolean;
        }): void;

        clear(): void;

        destroy(): void;
    }

### `serializeReplay` (function)

    export declare function serializeReplay(events: readonly ReplayEvent[]): string;

### `Session` (class)

    export declare class Session {

        readonly launches: number;
        constructor(options?: SessionOptions);
    }

### `setReducedMotion` (function)

    export declare function setReducedMotion(value: boolean | null): void;

### `setTheme` (function)

    export declare function setTheme(next: Partial<Theme>): void;

### `Shape2D` (class)

    export declare class Shape2D extends Graphics {
    }

### `Signal` (class)

    export declare class Signal<T> {
        private listeners;
        private readonly stackMode;

        constructor(stackMode?: boolean);
        add(listener: SignalListener<T>): void;
        remove(listener: SignalListener<T>): void;
        removeAll(): void;
        get size(): number;

        dispatch(value: T): boolean;
    }

### `Simulation` (namespace)

    export * as Simulation from './simulation/index.ts'

### `sliceSpans` (function)

    export declare function sliceSpans(spans: readonly MarkdownSpan[], count: number): MarkdownSpan[];

### `snapZoom` (function)

    export declare function snapZoom(zoom: number, tileSize: number): number;

### `Spawner` (class)

    export declare class Spawner<T> {
        private schedule;
        private cursor;
        private elapsed;
        private startedWaves;
        private completed;
        private onSpawn;
        private onWaveStart?;
        private onComplete?;
        constructor(options: SpawnerOptions<T>);
        update(dt: number): void;

        get isComplete(): boolean;
    }

### `splitScreenHalves` (function)

    export declare function splitScreenHalves(width: number, height: number): [{
        x: number;

### `Sprite2D` (class)

    export declare class Sprite2D extends Sprite {
    }

### `SpriteSheet` (class)

    export declare class SpriteSheet {
        readonly texture: Texture2D;
        readonly frameWidth: number;
        readonly frameHeight: number;
        readonly columns: number;
        readonly rows: number;
        private frames;
        private names;
        private constructor();

        static grid(path: string, frameWidth: number, frameHeight?: number): SpriteSheet;
        static fromTexture(texture: Texture2D, frameWidth: number, frameHeight?: number): SpriteSheet;
        get count(): number;

        name(name: string, index: number): this;

        nameAll(names: Readonly<Record<string, number>>): this;
        indexOf(name: string): number;
        get(frame: number | string): Texture2D;

        region(frame: number | string): TextureRegion;

        range(from: number, to: number): Texture2D[];

        pick(...frames: Array<number | string>): Texture2D[];
    }

### `StageScript` (class)

    export declare class StageScript {
        private options;
        readonly state: ScriptState;
        private cancelled;
        private historyLog;
        private seenLines;

        skipSeen: boolean;
        constructor(options: ScriptOptions);
        cancel(): void;

        get history(): readonly HistoryEntry[];

        showLast(): Promise<boolean>;
        run(commands: readonly StageCommand[]): Promise<ScriptState>;

        runStory(story: StoryScript, start: string): Promise<ScriptState>;

        private step;
        private recordHistory;

        protected speak(text: string, as: string | undefined, speaker?: string, choices?: Choice[]): Promise<unknown>;
    }

### `startReveal` (function)

    export declare function startReveal(total: number, speed?: number): RevealState;

### `StateRegistry` (class)

    export declare class StateRegistry {
        private extensions;
        register<T extends StateValue>(extension: StateExtension<T>): () => void;
        snapshot(): StateSnapshot;
        restore(snapshot: StateSnapshot, options?: {
            readonly missing?: 'keep' | 'reset' | 'remove';
            readonly onDiagnostic?: (diagnostic: StateRestoreDiagnostic) => void;
        }): readonly StateRestoreDiagnostic[];
        transaction<T>(work: () => T): T;
    }

### `StatsScreen` (class)

    export declare class StatsScreen extends Container {
        private text;
        constructor(options: StatsScreenOptions);

        setStats(stats: readonly StatRow[], width?: number): void;
        private static format;
    }

### `StatusVisuals` (class)

    export declare class StatusVisuals {
        private target;
        private styles;

        private priority;
        private active;
        private elapsed;
        constructor(target: TintTarget, options: StatusVisualsOptions);

        set(kind: string, active: boolean): void;
        has(kind: string): boolean;

        update(dt: number): void;
    }

### `stripMarkdown` (function)

    export declare function stripMarkdown(text: string): string;

### `stripMarkup` (function)

    export declare function stripMarkup(source: string, options?: MarkupOptions): string;

### `TabbedList` (class)

    export declare class TabbedList<T> {

        readonly onChange: Signal<void>;
        private readonly tabList;
        private readonly rowsFor;
        private readonly pageSize;
        private readonly labelOf;
        private readonly filterOf;
        private readonly disabledOf;
        private currentTabIndex;
        private currentQuery;
        private rows_;
        private currentSelectedIndex;
        private detail;
        constructor(options: TabbedListOptions<T>);

        get tabs(): readonly ListTab[];

        get tab(): ListTab;
        get query(): string;

        get rows(): readonly T[];

        get pageCount(): number;

        get page(): number;

        get pageRows(): readonly T[];

        get selectedIndex(): number;
        get selected(): T | null;

        get detailOpen(): boolean;

        selectTab(id: string): void;

        nextTab(delta?: number): void;

        setQuery(query: string): void;

        move(delta: number): void;

        setPage(page: number): void;

        nextPage(delta: number): void;

        openDetail(): boolean;
        closeDetail(): void;

        private firstSelectableOnPage;
        private firstSelectable;

        private recompute;
        private emit;
    }

### `TelemetryClient` (class)

    export declare class TelemetryClient extends HttpTransport {
        private consented;
        constructor(options: TelemetryOptions);

        get hasConsent(): boolean;

        setConsent(granted: boolean): void;

        send(event: TelemetryEvent): Promise<TelemetryResponse | null>;
    }

### `Text2D` (class)

    export declare class Text2D extends Text {
    }

### `Texture2D` (export)

    export { Texture2D }

### `theme` (function)

    export declare function theme(): Theme;

### `themeChanged` (const)

    export declare const themeChanged: Signal<Theme>;

### `TiledSprite` (class)

    export declare class TiledSprite extends TilingSprite {
    }

### `tileFrame` (function)

    export declare function tileFrame(sheet: number, frame: number): number;

### `tileFrameIndex` (function)

    export declare function tileFrameIndex(packed: number): number;

### `tileFrameSheet` (function)

    export declare function tileFrameSheet(packed: number): number;

### `TileMap` (class)

    export declare class TileMap extends Container {
        readonly widthInTiles: number;
        readonly heightInTiles: number;
        readonly tileWidth: number;
        readonly tileHeight: number;
        readonly shape: 'square' | 'hex' | 'isometric' | 'staggered';

        readonly heightStep: number;
        private sheets;
        private layers;
        private layersByName;
        private chunkSize;
        private chunkColumns;
        private chunkRows;
        private chunks;
        private cellTint;
        private cellAdd;
        private cellHeight;
        private faces;
        constructor(options: TileMapOptions);
        get layerCount(): number;

        get worldWidth(): number;
        get worldHeight(): number;
        inside(x: number, y: number): boolean;
        private index;

        addLayer(name: string, data?: ArrayLike<number>): this;
        private layerAt;
        private chunkIndex;

        private projectedCenter;

        private projectedTile;

        private cellOrigin;

        private textureFor;
        private buildSprite;
        getTile(layer: string | number, x: number, y: number): number;
        setTile(layer: string | number, x: number, y: number, frame: number): void;

        setLayerData(layer: string | number, data: ArrayLike<number>): void;

        setCellColor(x: number, y: number, tint: number, add?: number): void;
        getCellTint(x: number, y: number): number;

        clearColors(): void;

        setCellHeight(x: number, y: number, height: number): void;

        getCellHeight(x: number, y: number): number;

        get faceCount(): number;

        private syncFaces;

        private drawFaces;

        toTile(worldX: number, worldY: number): {
            x: number;
            y: number;
        };

        tileCenter(x: number, y: number): {
            x: number;
            y: number;
        };

        cull(camera: Camera): void;

        get visibleChunks(): number;
    }

### `TintedSprite` (class)

    export declare class TintedSprite extends Sprite {
        private _colorAdd;
        constructor(options?: SpriteOptions | Texture2D);

        get colorAdd(): number;
        set colorAdd(value: number);

        setColorAdd(r: number, g: number, b: number, a?: number): void;

        lerpTint(color: number, strength: number): void;

        silhouette(color: number): void;

        resetColor(): void;
    }

### `Toast` (class)

    export declare class Toast extends Container {
        private readonly fadeIn;
        private readonly hold;
        private readonly fadeOut;
        private readonly scaleFrom;
        private queue;
        private current;
        private phase;
        private elapsed;
        constructor(options?: ToastOptions);

        show(content: Container2D): void;

        get isBusy(): boolean;
        private start;
        update(dt: number): void;
        private advance;
        private finish;
    }

### `Tooltip` (class)

    export declare class Tooltip extends Container {
        private readonly delay;
        private readonly maxWidth;
        private readonly offsetX;
        private readonly offsetY;
        private readonly margin;
        private readonly panel;
        private readonly body;
        private viewWidth;
        private viewHeight;

        private panelWidth;
        private panelHeight;
        private pending;
        private waited;
        constructor(options?: TooltipOptions);

        setViewport(width: number, height: number): void;

        hover(text: string, x: number, y: number): void;

        leave(): void;
        get isShowing(): boolean;

        get text(): string | null;

        get panelPosition(): {
            x: number;
            y: number;
        };
        get size(): {
            width: number;
            height: number;
        };

        update(dt: number): boolean;

        protected measureBody(): {
            width: number;
            height: number;
        };

        private place;
    }

### `Tweener` (class)

    export declare class Tweener {
        private tweens;

        tween(duration: number, apply: (t: number) => void, options?: Easing | TweenOptions): Promise<void>;
        update(dt: number): void;

        get isBusy(): boolean;

        clear(): void;
    }

### `UndoHistory` (class)

    export declare class UndoHistory<T> {
        private history;
        private cursor;
        private readonly limit;
        constructor(options?: UndoHistoryOptions);

        push(state: T): void;
        get canUndo(): boolean;
        get canRedo(): boolean;

        undo(): T | null;

        redo(): T | null;

        get current(): T | null;

        clear(): void;
    }

### `unscramble` (function)

    export declare function unscramble(payload: string, key: string): string;

### `validateSchema` (function)

    export declare function validateSchema(value: unknown, schema: Schema, path?: string): void;

### `version` (const)

    export declare const version = "0.7.6";

### `VerticalLabel` (class)

    export declare class VerticalLabel extends Container {
        private readonly opts;
        private readonly themeListener;
        constructor(options: VerticalLabelOptions);

        private build;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `Viewport` (class)

    export declare class Viewport {
        readonly camera: Camera;

        readonly container: Container<import("pixi.js").ContainerChild>;
        private readonly clip;
        constructor(options: ViewportOptions);

        resize(x: number, y: number, width: number, height: number): void;
        update(dt: number): void;
    }

### `watchReducedMotion` (function)

    export declare function watchReducedMotion(listener: (reduced: boolean) => void): () => void;

### `weightedFlood` (function)

    export declare function weightedFlood<T, K>(start: T, options: WeightedFloodOptions<T, K>): Map<K, WeightedCell<T>>;

### `Window` (class)

    export declare class Window extends Container {
        readonly content: Container<import("pixi.js").ContainerChild>;
        readonly onClose: Signal<void>;
        readonly modal: boolean;
        readonly closable: boolean;
        readonly dims: boolean;
        readonly anchor: 'center' | 'bottom' | 'top';
        private background;
        private titleLabel;
        private innerWidth;
        private innerHeight;
        private currentWidth;
        private currentHeight;
        private readonly themeListener;
        constructor(options: WindowOptions);

        private restyle;
        resize(width: number, height: number): void;

        get contentWidth(): number;
        get contentHeight(): number;
        setTitle(text: string): void;

        delegate: {
            handleAction(action: Action): boolean;
        } | null;

        handleAction(action: Action): boolean;

        update(_dt: number): void;
        close(): void;

        place(viewportWidth: number, viewportHeight: number): void;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `WindowStack` (class)

    export declare class WindowStack extends Container {
        private windows;
        private overlay;
        private viewportWidth;
        private viewportHeight;
        private listener;
        private readonly themeListener;
        constructor();
        setViewport(width: number, height: number): void;
        get top(): Window | null;
        get isEmpty(): boolean;
        get depth(): number;

        push(window: Window): Window;

        pop(): void;
        closeAll(): void;
        private forget;
        private updateOverlay;
        private drawOverlay;

        private handleAction;

        get blocksWorld(): boolean;
        update(dt: number): void;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `World` (namespace)

    export * as World from './world/index.ts'

## `./3d`

### `buildHeightIndex` (function)

    export declare function buildHeightIndex(cells: readonly GridCell3D[]): Map<string, number>;

### `cellAt` (function)

    export declare function cellAt(shape: GridShape3D, x: number, z: number, tileSize?: number): {
        x: number;

### `Character3D` (class)

    export declare class Character3D {
        readonly node: TransformNode;
        private target;
        private speed;
        private readonly collideXZ?;
        private readonly animations;
        private currentClip;

        constructor(node: TransformNode, animations?: readonly AnimationGroup[], collideXZ?: CollideXZ);

        hasAnimation(name: string): boolean;

        playAnimation(name: string, loop?: boolean): boolean;

        stopAnimation(): void;

        get currentAnimation(): string | null;
        moveTo(x: number, y: number, z: number, speed: number): void;
        update(deltaSeconds: number): boolean;

        static fromMesh(mesh: AbstractMesh, animations?: readonly AnimationGroup[]): Character3D;
        static billboard(scene: Scene, options: Billboard3DOptions): Character3D;
    }

### `createHeightmapTerrain3D` (function)

    export declare function createHeightmapTerrain3D(scene: Scene, source: HeightmapSource, options?: HeightmapTerrain3DOptions): GroundMesh;

### `createTileGrid3D` (function)

    export declare function createTileGrid3D(scene: Scene, cells: readonly GridCell3D[], options: TileGrid3DOptions): TileGrid3DMeshes;

### `createVoxModel3D` (function)

    export declare function createVoxModel3D(scene: Scene, model: VoxModel, voxelSize?: number): TransformNode;

### `Engine3D` (class)

    export declare class Engine3D {
        readonly engine: Engine;
        readonly scene: Scene;
        readonly camera: ArcRotateCamera;
        private frame;
        private readonly resize;
        constructor(options: Engine3DOptions);
        start(frame?: Frame3D): void;
        step(deltaSeconds: number): void;
        stop(): void;
        dispose(): void;
    }

### `gridPoint3D` (function)

    export declare function gridPoint3D(shape: GridShape3D, x: number, y: number, tileSize?: number, height?: number, heightStep?: number): Point3D;

### `heightAt` (function)

    export declare function heightAt(index: ReadonlyMap<string, number>, shape: GridShape3D, x: number, z: number, tileSize?: number): number | null;

### `parseVox` (function)

    export declare function parseVox(data: ArrayBuffer | ArrayBufferView): VoxModel;

### `resolveCapsuleAgainstGrid` (function)

    export declare function resolveCapsuleAgainstGrid(from: {
        x: number;

## `./3d/models`

### `isModelContainerLoaded` (function)

    export declare function isModelContainerLoaded(source: string): boolean;

### `loadModel3D` (function)

    export declare function loadModel3D(source: ModelSource3D, scene: Scene, options?: ImportMeshOptions): Promise<ISceneLoaderAsyncResult>;

### `loadModelContainer3D` (function)

    export declare function loadModelContainer3D(source: ModelSource3D, scene: Scene, options?: LoadAssetContainerOptions): Promise<AssetContainer>;

### `ModelSource3D` (type)

    export type ModelSource3D = string | File | ArrayBufferView;

### `releaseModelContainer` (function)

    export declare function releaseModelContainer(source: string): Promise<void>;

## `./actors`

### `Advancement` (class)

    export declare class Advancement {
        private track;

        private grantedTiers;
        private balance;
        private choices;
        constructor(track: AdvancementTrack);

        get points(): number;

        openTiers(level: number): number[];

        grant(level: number): number;

        spend(points: number): boolean;

        choose(tierIndex: number, optionId: string, level: number): void;

        choice(tierIndex: number): string | null;
        toJSON(): {
            grantedTiers: number;
            balance: number;
            choices: [number, string][];
        };

        static fromJSON(track: AdvancementTrack, data: {
            grantedTiers: number;
            balance: number;
            choices: [number, string][];
        }): Advancement;
    }

### `affixOf` (function)

    export declare function affixOf(item: InventoryItem): string | undefined;

### `Appearances` (class)

    export declare class Appearances {
        private tables;
        private assigned;
        constructor(tables: Record<string, AppearanceTable>);

        appearanceOf(category: string, kind: string): string;
        toJSON(): {
            assigned: [string, [string, string][]][];
        };

        static fromJSON(tables: Record<string, AppearanceTable>, data: {
            assigned: [string, [string, string][]][];
        }): Appearances;
    }

### `applyAffix` (function)

    export declare function applyAffix(item: InventoryItem, affix: AffixDef): void;

### `applyItemStatusEffect` (function)

    export declare function applyItemStatusEffect<T extends object>(item: T, clock: EffectClock, options: ItemStatusEffectOptions<T>): ItemStatusEffectHandle;

### `applyStatusEffect` (function)

    export declare function applyStatusEffect(stats: StatBlock, clock: EffectClock, options: StatusEffectOptions): StatusEffectHandle;

### `assignAppearances` (function)

    export declare function assignAppearances(table: AppearanceTable): Map<string, string>;

### `assignTraits` (function)

    export declare function assignTraits(stats: StatBlock, pool: readonly TraitDef[], count: number): AssignedTrait[];

### `AuraField` (class)

    export declare class AuraField {
        private affected;
        update(participants: readonly AuraParticipant[], isAdjacent: (a: AuraParticipant, b: AuraParticipant) => boolean): void;
    }

### `Barrier` (class)

    export declare class Barrier {
        private layers;

        add(amount: number, decayPerTick?: number): void;

        get total(): number;

        get layerCount(): number;

        absorb(amount: number): number;

        advance(turns?: number): void;

        clear(): void;
        toJSON(): {
            layers: BarrierLayer[];
        };
        static fromJSON(data: {
            layers: BarrierLayer[];
        }): Barrier;
    }

### `buildEntities` (function)

    export declare function buildEntities(rows: readonly EntityTemplateRow[], catalog?: EntityTemplateCatalog, onLowHp?: (entity: BuiltEntity) => void): BuiltEntity[];

### `buildEntity` (function)

    export declare function buildEntity(row: EntityTemplateRow, catalog?: EntityTemplateCatalog, onLowHp?: (entity: BuiltEntity) => void): BuiltEntity;

### `buy` (function)

    export declare function buy(wallet: StatBlock, stock: Inventory, bag: Inventory, id: string, quantity: number, options: ShopOptions): boolean;

### `canAfford` (function)

    export declare function canAfford(stats: StatBlock, cost: ResourceCost | readonly ResourceCost[]): boolean;

### `Charges` (class)

    export declare class Charges {
        readonly max: number;
        private regenRate;
        private value;
        private progress;
        constructor(options: ChargesOptions);
        get current(): number;
        canAfford(cost: number): boolean;

        spend(cost: number): boolean;

        refund(amount?: number): number;

        advance(turns?: number): void;

        toJSON(): {
            current: number;
            progress: number;
        };
        static fromJSON(options: ChargesOptions, data: {
            current: number;
            progress: number;
        }): Charges;
    }

### `composeModifiers` (function)

    export declare function composeModifiers(base: number, modifiers: readonly Modifier[]): number;

### `convertToCharges` (function)

    export declare function convertToCharges(stats: StatBlock, cost: ResourceCost, charges: Charges, rate: number): number;

### `copyAffix` (function)

    export declare function copyAffix(from: InventoryItem, to: InventoryItem): void;

### `craft` (function)

    export declare function craft(inventory: Inventory, recipe: Recipe): boolean;

### `damageItem` (function)

    export declare function damageItem(item: InventoryItem, amount: number): boolean;

### `enchant` (function)

    export declare function enchant(item: InventoryItem, delta: number, affixPolicy?: AffixUpgradePolicy): number;

### `EquipmentSlots` (class)

    export declare class EquipmentSlots<Slot extends string, Item extends EquippableItem> {
        private readonly names;
        private worn;
        private stats;
        private isSlotLocked;
        constructor(slots: readonly Slot[], stats?: StatBlock | null, options?: EquipmentOptions<Slot, Item>);
        get(slot: Slot): Item | undefined;

        isLocked(slot: Slot): boolean;

        equip(slot: Slot, item: Item): Item | undefined;

        private wear;

        unequip(slot: Slot): Item | undefined;
        get slots(): readonly Slot[];
        private assertSlot;

        toJSON(identify: (item: Item) => string): SavedEquipment<Slot>;

        static fromJSON<Slot extends string, Item extends EquippableItem>(defs: {
            slots: readonly Slot[];

            resolve: (id: string) => Item;
            stats?: StatBlock | null;
            locked?: (slot: Slot, item: Item) => boolean;
        }, data: SavedEquipment<Slot>): EquipmentSlots<Slot, Item>;
    }

### `fromEntitySaveState` (function)

    export declare function fromEntitySaveState(row: EntityTemplateRow, catalog: EntityTemplateCatalog, data: EntitySaveState, onLowHp?: (entity: BuiltEntity) => void): BuiltEntity;

### `identify` (function)

    export declare function identify(item: InventoryItem): void;

### `Inventory` (class)

    export declare class Inventory {
        private slots;
        readonly capacity?: number;
        constructor(options?: InventoryOptions);
        get items(): readonly InventoryItem[];
        get totalWeight(): number;
        private weightOf;

        find(id: string, instanceId?: string): InventoryItem | undefined;

        add(item: InventoryItem): boolean;

        remove(id: string, quantity?: number, instanceId?: string): void;

        take(id: string, quantity?: number, instanceId?: string): InventoryItem | undefined;

        toJSON(): SavedInventory;

        static fromJSON(defs: ReadonlyMap<string, ItemDefinition>, data: SavedInventory): Inventory;
    }

### `matchesContext` (function)

    export declare function matchesContext(affix: AffixDef, context: AffixContext): boolean;

### `powerCurve` (function)

    export declare function powerCurve(base: number, power: number, maxLevel: number): GrowthCurve;

### `Progression` (class)

    export declare class Progression {
        private curve;
        level: number;
        experience: number;
        constructor(curve: GrowthCurve, start?: {
            level?: number;
            experience?: number;
        });

        get experienceToNext(): number | null;

        addExperience(amount: number): number;

        toJSON(): {
            level: number;
            experience: number;
        };
        static fromJSON(curve: GrowthCurve, data: {
            level: number;
            experience: number;
        }): Progression;
    }

### `refund` (function)

    export declare function refund(stats: StatBlock, cost: ResourceCost | readonly ResourceCost[], fraction?: number): void;

### `removeAffix` (function)

    export declare function removeAffix(item: InventoryItem): void;

### `repairItem` (function)

    export declare function repairItem(item: InventoryItem, amount: number): void;

### `rollAffix` (function)

    export declare function rollAffix(table: AffixTable, options?: RollAffixOptions): AffixDef | null;

### `rollLoot` (function)

    export declare function rollLoot(table: LootTable): {
        id: string;

### `scaledModifiers` (function)

    export declare function scaledModifiers(level: number, scales: readonly LevelScale[]): Modifier[];

### `sell` (function)

    export declare function sell(wallet: StatBlock, stock: Inventory, bag: Inventory, id: string, quantity: number, options: ShopOptions): boolean;

### `skillCheck` (function)

    export declare function skillCheck(value: number, difficulty: number, roll?: () => number): boolean;

### `SkillPoints` (class)

    export declare class SkillPoints {
        private stats;
        private capFor;
        private costFor;
        private available;
        constructor(stats: StatBlock, options?: SkillPointsOptions);

        get points(): number;

        grant(points: number): void;

        canSpend(stat: string): boolean;

        spend(stat: string): boolean;

        private nextRankCost;

        toJSON(): {
            points: number;
        };
        static fromJSON(stats: StatBlock, options: SkillPointsOptions, data: {
            points: number;
        }): SkillPoints;
    }

### `spend` (function)

    export declare function spend(stats: StatBlock, cost: ResourceCost | readonly ResourceCost[]): boolean;

### `StatBlock` (class)

    export declare class StatBlock {
        private baseValues;
        private derived;
        private modifiers;
        private cache;
        constructor(options: StatBlockOptions);

        base(name: string): number;
        setBase(name: string, value: number): void;
        addModifier(modifier: Modifier): void;
        removeModifier(modifier: Modifier): void;

        removeModifiersFrom(source: unknown): void;

        get(name: string): number;
        private resolveAll;
        private modifiersFor;

        toJSON(): {
            base: Stats;
        };
        static fromJSON(options: StatBlockOptions, data: {
            base: Stats;
        }): StatBlock;
    }

### `SupportLedger` (class)

    export declare class SupportLedger {
        private levels;
        private points;
        constructor(levels: readonly SupportLevel[]);
        get(a: string, b: string): number;
        level(a: string, b: string): SupportLevel | null;
        add(a: string, b: string, amount: number): SupportChange;
        toJSON(): SupportSave;
        static fromJSON(levels: readonly SupportLevel[], data: SupportSave): SupportLedger;
    }

### `toEntitySaveState` (function)

    export declare function toEntitySaveState(entity: BuiltEntity): EntitySaveState;

## `./ai`

### `AIAction` (interface)

    export interface AIAction {
        readonly type: string;
        readonly [key: string]: AIValue;
    }

### `AIAgentDefinition` (interface)

    export interface AIAgentDefinition {
        readonly id: string;
        readonly behaviors: readonly AIBehavior[];
        readonly scope?: 'actor' | 'controller';
        readonly algorithm?: 'rules' | 'alpha_beta';
        readonly depth?: number;
        readonly maxNodes?: number;
    }

### `AIBehavior` (interface)

    export interface AIBehavior {
        readonly id: string;
        readonly when?: (context: AIDecisionContext) => boolean;
        readonly decide: (context: AIDecisionContext) => AIAction | null;
    }

### `AIBudgetExceededError` (class)

    export declare class AIBudgetExceededError extends Error {
        constructor();
    }

### `AICancelledError` (class)

    export declare class AICancelledError extends Error {
        constructor();
    }

### `AIDecision` (interface)

    export interface AIDecision {
        readonly agent: string;
        readonly action: AIAction | null;
        readonly state: AIState;
        readonly behavior?: string;
        readonly status: 'action' | 'idle' | 'cancelled' | 'budget-exceeded';
        readonly steps: number;
        readonly events: readonly AIEvent[];
    }

### `AIDecisionContext` (interface)

    export interface AIDecisionContext {
        readonly perception: AIValue;
        readonly state: AIState;
        readonly random: () => number;
        readonly checkpoint: () => void;
        emit(name: string, payload?: AIValue): void;
    }

### `AIDecisionInput` (interface)

    export interface AIDecisionInput {
        readonly perception: AIValue;
        readonly state?: AIState;
        readonly signal?: AbortSignal;
        readonly seed?: number;
        readonly maxSteps?: number;
        readonly maxMilliseconds?: number;
    }

### `AIDiagnostics` (interface)

    export interface AIDiagnostics {
        readonly onDecision?: (decision: AIDecision) => void;
    }

### `AIEvent` (interface)

    export interface AIEvent {
        readonly name: string;
        readonly payload?: AIValue;
    }

### `AIModule` (interface)

    export interface AIModule {
        register(agent: AIAgentDefinition): void;
        decide(agent: string, input: AIDecisionInput): AIDecision;
        exportState(): AIStateEnvelope;
        importState(envelope: AIStateEnvelope): void;
        dispose(): void;
    }

### `AIState` (type)

    export type AIState = Record<string, AIValue>;

### `AIStateEnvelope` (interface)

    export interface AIStateEnvelope {
        readonly version: 1;
        readonly agents: Readonly<Record<string, AIState>>;
    }

### `AIValue` (type)

    export type AIValue = null | boolean | number | string | AIValue[] | {
        readonly [key: string]: AIValue;

### `alphaBetaSearch` (function)

    export declare function alphaBetaSearch<State, Move>(game: AlphaBetaGame<State, Move>, state: State, options: AlphaBetaOptions): AlphaBetaResult<State, Move>;

### `JavaScriptAI` (class)

    export declare class JavaScriptAI implements AIModule {
        private readonly agents;
        private readonly states;
        private readonly options;
        constructor(options?: JavaScriptAIOptions);
        register(agent: AIAgentDefinition): void;
        decide(agentId: string, input: AIDecisionInput): AIDecision;

        search<State, Move>(game: AlphaBetaGame<State, Move>, state: State, options: AlphaBetaOptions): AlphaBetaResult<State, Move>;
        exportState(): AIStateEnvelope;
        importState(envelope: AIStateEnvelope): void;
        dispose(): void;
    }

### `JavaScriptAIOptions` (interface)

    export interface JavaScriptAIOptions extends AIDiagnostics {
        readonly maxSteps?: number;
        readonly maxMilliseconds?: number;
        readonly seed?: number;
    }

### `personalScoreView` (function)

    export declare function personalScoreView<T>(subject: ScoreSubject<T>, world: readonly ScoreSubject<T>[], scoreOf: (id: T) => number, sees: (x: number, y: number) => boolean): ScoreView;

### `scoreWith` (function)

    export declare function scoreWith(view: ScoreView, personality: ScorePersonality): number;

### `sideScoreView` (function)

    export declare function sideScoreView<T>(side: string, world: readonly ScoreSubject<T>[], scoreOf: (id: T) => number, sees: (x: number, y: number) => boolean): ScoreView;

## `./ai/lua`

### `createLuaAI` (function)

    export declare function createLuaAI(options?: LuaAIOptions): LuaAI;

### `LuaAI` (class)

    export declare class LuaAI {
        private readonly host;
        private readonly agents;
        private readonly states;
        private readonly options;
        private readonly loaded;
        constructor(options?: LuaAIOptions);
        register(agent: LuaAIAgentDefinition): void;
        decide(agentId: string, input: AIDecisionInput): AIDecision;

        search(agentId: string, state: import('./index.ts').AIValue, options: AlphaBetaOptions): AlphaBetaResult<import('./index.ts').AIValue, import('./index.ts').AIValue>;
        exportState(): AIStateEnvelope;
        importState(envelope: AIStateEnvelope): void;
        dispose(): void;
    }

### `LuaAIAgentDefinition` (interface)

    export interface LuaAIAgentDefinition {
        readonly id: string;
        readonly source: string;
        readonly functionName?: string;
        readonly search?: LuaAlphaBetaFunctions;
    }

### `LuaAIOptions` (interface)

    export interface LuaAIOptions extends FengariScriptHostOptions {
        readonly host?: ScriptHost;
        readonly maxSteps?: number;
        readonly maxMilliseconds?: number;
        readonly seed?: number;
        readonly onDecision?: (decision: AIDecision) => void;
    }

## `./assets`

### `AssetStream` (class)

    export declare class AssetStream {
        private readonly entries;
        private readonly budgetBytes;
        private readonly loadAssets;
        private readonly releaseAssets;
        private clock;
        constructor(options?: AssetStreamOptions);

        preload(bundle: AssetBundle, onProgress?: AssetProgress): Promise<void>;

        preloadLikely(bundles: readonly AssetBundle[], onProgress?: AssetProgress): Promise<void>;

        use(id: string): boolean;
        isReady(id: string): boolean;

        unload(id: string): Promise<void>;
        get estimatedBytes(): number;
        private enforceBudget;
        private isRetained;
    }

### `fetchWithByteProgress` (function)

    export declare function fetchWithByteProgress(url: string, onProgress?: OnByteProgress, fetchFn?: typeof fetch): Promise<Blob>;

### `get` (function)

    export declare function get<T>(path: string): T;

### `getBinary` (function)

    export declare function getBinary(path: string): ArrayBuffer;

### `has` (function)

    export declare function has(path: string): boolean;

### `isBinaryLoaded` (function)

    export declare function isBinaryLoaded(path: string): boolean;

### `isCompiled` (function)

    export declare function isCompiled(): boolean;

### `isLoaded` (function)

    export declare function isLoaded(path: string): boolean;

### `load` (function)

    export declare function load(paths: string[], options?: AssetProgress | LoadAssetsOptions): Promise<void>;

### `loadBinary` (function)

    export declare function loadBinary(paths: string[], onProgress?: AssetProgress, options?: LoadBinaryOptions): Promise<void>;

### `paths` (function)

    export declare function paths(): string[];

### `release` (function)

    export declare function release(paths: string[]): Promise<void>;

### `releaseBinary` (function)

    export declare function releaseBinary(paths: string[]): void;

### `resolve` (function)

    export declare function resolve(path: string): string;

### `setBase` (function)

    export declare function setBase(path: string): void;

### `texture` (function)

    export declare function texture(path: string): Texture;

## `./assets/binary`

### `getBinary` (function)

    export declare function getBinary(path: string): ArrayBuffer;

### `isBinaryLoaded` (function)

    export declare function isBinaryLoaded(path: string): boolean;

### `loadBinary` (function)

    export declare function loadBinary(paths: string[], onProgress?: AssetProgress, options?: LoadBinaryOptions): Promise<void>;

### `LoadBinaryOptions` (interface)

    export interface LoadBinaryOptions {

        fetch?: typeof globalThis.fetch;
    }

### `releaseBinary` (function)

    export declare function releaseBinary(paths: string[]): void;

## `./assets/paths`

### `AssetProgress` (type)

    export type AssetProgress = (fraction: number) => void;

### `has` (function)

    export declare function has(path: string): boolean;

### `isCompiled` (function)

    export declare function isCompiled(): boolean;

### `paths` (function)

    export declare function paths(): string[];

### `resolve` (function)

    export declare function resolve(path: string): string;

### `setBase` (function)

    export declare function setBase(path: string): void;

## `./audio`

### `audioGain` (function)

    export declare function audioGain(distance: number, falloff?: AudioFalloff): number;

### `AudioListener` (class)

    export declare class AudioListener implements AudioPoint {
        x: number;
        y: number;

        facing: number;
        constructor(options?: {
            x?: number;
            y?: number;
            facing?: number;
        });
        moveTo(x: number, y: number): void;
        face(radians: number): void;
    }

### `audioPan` (function)

    export declare function audioPan(listener: AudioPoint & {
        facing: number;

### `createAudio` (function)

    export declare function createAudio(path: string): Playable;

### `MidiPlayer` (class)

    export declare class MidiPlayer {
        private readonly notes;
        private readonly playFn;
        private readonly waveform;
        private readonly volume;
        private elapsed;
        private index;
        private playing;
        constructor(file: MidiFile, options?: MidiPlayerOptions);
        play(): void;
        pause(): void;

        stop(): void;
        update(dt: number): void;
        get isPlaying(): boolean;

        get duration(): number;
    }

### `Music` (class)

    export declare class Music {
        private current;
        private fades;
        private create;
        private trackQueue;
        private playlistFade;
        volume: number;
        constructor(options?: MusicOptions);

        play(path: string, fadeDuration?: number): void;

        playTracks(paths: readonly string[], fadeDuration?: number): void;
        private startNextTrack;
        private start;
        stop(fadeDuration?: number): void;
        update(dt: number): void;
    }

### `noteToFrequency` (function)

    export declare function noteToFrequency(note: number): number;

### `onCaption` (const)

    export declare const onCaption: Signal<CaptionEvent>;

### `Orchestrator` (class)

    export declare class Orchestrator {
        private states;
        private cues;
        private currentTrack;
        private music;
        constructor(music: Music);

        define(state: string, mapping: OrchestratorState): void;

        enter(state: string): void;

        on(event: string, cue: Sound): void;

        trigger(event: string): void;
    }

### `parseMidi` (function)

    export declare function parseMidi(data: ArrayBuffer | ArrayBufferView): MidiFile;

### `playTone` (function)

    export declare function playTone(options?: ToneOptions, create?: (dataUri: string) => Playable): Playable;

### `scheduleMidi` (function)

    export declare function scheduleMidi(file: MidiFile): ScheduledNote[];

### `Sound` (class)

    export declare class Sound {
        private pool;
        private next;
        private caption?;
        volume: number;
        constructor(path: string, options?: SoundOptions);

        play(gain?: number): void;
        stopAll(): void;
    }

### `SoundSource` (class)

    export declare class SoundSource implements AudioPoint {
        x: number;
        y: number;
        private readonly sound;
        private readonly falloff;
        constructor(sound: Sound, options?: SoundSourceOptions);
        moveTo(x: number, y: number): void;
        gainTo(listener: AudioPoint): number;
        panTo(listener: AudioPoint & {
            facing: number;
        }): number;

        playFor(listener: AudioPoint): number;
    }

### `synthesizeTone` (function)

    export declare function synthesizeTone(options?: ToneOptions): string;

## `./battle`

### `BattleHooks` (class)

    export declare class BattleHooks<C> extends HookRegistry<[creature: C, context?: unknown]> {
    }

### `battleOrder` (function)

    export declare function battleOrder<A extends {
        speed: number;

### `checkEvolution` (function)

    export declare function checkEvolution<S>(rules: readonly EvolutionRule<S>[], level: number): S | null;

### `chooseMove` (function)

    export declare function chooseMove<M extends {
        type: string;

### `chooseSwitch` (function)

    export declare function chooseSwitch(activeTypes: readonly string[], bench: readonly {
        types: readonly string[];

### `Creature` (class)

    export declare class Creature {
        readonly species: Species;
        readonly stats: StatBlock;
        readonly progression: Progression;
        private deriveStats?;
        constructor(options: CreatureOptions);

        refreshStats(): void;
        private computeBase;
    }

### `Field` (class)

    export declare class Field {
        private conditions;
        set(condition: FieldCondition): void;
        has(id: string): boolean;
        get(id: string): FieldCondition | undefined;
        clear(id: string): void;
        get active(): readonly FieldCondition[];

        advance(rounds?: number): void;
    }

### `Party` (class)

    export declare class Party<C> {
        private active;
        private storage;
        constructor(activeSize: number);
        get members(): readonly (C | null)[];
        get boxed(): readonly C[];

        add(creature: C): void;

        store(index: number): void;

        withdraw(storageIndex: number, activeSlot: number): void;

        get activeMembers(): C[];
    }

### `StatStages` (class)

    export declare class StatStages {
        private stats;
        private max;
        private multiplierFor;
        private stages;
        private modifiers;
        constructor(stats: StatBlock, options: StatStagesOptions);

        get(stat: string): number;

        change(stat: string, delta: number): number;
        private applyModifier;

        resetAll(): void;
    }

### `TypeMatrix` (class)

    export declare class TypeMatrix {
        private multipliers;
        private key;
        set(attacking: string, defending: string, multiplier: number): void;
        get(attacking: string, defending: string): number;

        multiplierFor(attacking: string, defendingTypes: readonly string[]): number;
    }

## `./board`

### `addSkirmishUnit` (function)

    export declare function addSkirmishUnit(state: SkirmishState, unit: SkirmishUnit): void;

### `addTacticalUnit` (function)

    export declare function addTacticalUnit(state: TacticalState, unit: TacticalUnit): void;

### `applyBackgammonMove` (function)

    export declare function applyBackgammonMove(state: BackgammonState, move: BackgammonMove): void;

### `applyCheckersMove` (function)

    export declare function applyCheckersMove(state: CheckersState, move: CheckersMove): void;

### `applyMove` (function)

    export declare function applyMove(state: ChessState, move: ChessMove): void;

### `applyUpkeep` (function)

    export declare function applyUpkeep(army: ArmyState, board: TacticalState, owner: string, rates: UpkeepRates): number;

### `armyIncome` (function)

    export declare function armyIncome(board: TacticalState, owner: string, rates: UpkeepRates): number;

### `backgammonMoves` (function)

    export declare function backgammonMoves(state: BackgammonState, dice: readonly number[]): BackgammonMove[];

### `bankUnit` (function)

    export declare function bankUnit(army: ArmyState, board: TacticalState, unitId: string): boolean;

### `BoardGrid` (class)

    export declare class BoardGrid<P> {
        readonly cells: Array<P | null>;
        readonly width: number;
        readonly height: number;
        constructor(width: number, height: number, cells?: readonly (P | null)[]);
        index(x: number, y: number): number;
        inside(x: number, y: number): boolean;
        get(x: number, y: number): P | null;
        set(x: number, y: number, piece: P | null): void;
        move(from: {
            x: number;
            y: number;
        }, to: {
            x: number;
            y: number;
        }): P;
    }

### `canPlaceSkirmishUnit` (function)

    export declare function canPlaceSkirmishUnit(state: SkirmishState, x: number, y: number): boolean;

### `canPlaceTacticalUnit` (function)

    export declare function canPlaceTacticalUnit(state: TacticalState, x: number, y: number): boolean;

### `checkersMoves` (function)

    export declare function checkersMoves(state: CheckersState): CheckersMove[];

### `chessGame` (const)

    export declare const chessGame: AlphaBetaGame<ChessState, ChessMove>;

### `chooseMove` (function)

    export declare function chooseMove(state: ChessState, options?: ChessEngineOptions): ChessMove | null;

### `cloneChess` (function)

    export declare function cloneChess(state: ChessState): ChessState;

### `createDeck` (function)

    export declare function createDeck(jokers?: number): Card[];

### `deal` (function)

    export declare function deal<T>(deck: T[], hands: number, cardsEach: number): T[][];

### `dealSolitaire` (function)

    export declare function dealSolitaire(seed?: number): SolitaireState;

### `DiceCup` (class)

    export declare class DiceCup {
        readonly values: number[];
        readonly count: number;
        readonly sides: number;
        private kept;
        constructor(count: number, sides: number);
        reRoll(): void;
        keep(index: number): void;
        clearKept(): void;
    }

### `drawSolitaire` (function)

    export declare function drawSolitaire(state: SolitaireState): Card | null;

### `endSkirmishTurn` (function)

    export declare function endSkirmishTurn(state: SkirmishState, healPerVillage?: number): void;

### `endTacticalTurn` (function)

    export declare function endTacticalTurn(state: TacticalState): void;

### `FactionFog` (class)

    export declare class FactionFog {
        readonly width: number;
        readonly height: number;
        private visible;
        private explored;

        private readonly shared;
        constructor(width: number, height: number);

        share(factions: readonly string[]): void;
        sync(faction: string, sources: readonly VisionCell[], cells: (source: VisionCell) => Iterable<VisionCell>): void;

        reveal(faction: string, cells: Iterable<VisionCell>): void;
        isVisible(faction: string, x: number, y: number): boolean;

        sees(faction: string): (x: number, y: number) => boolean;
        isExplored(faction: string, x: number, y: number): boolean;
        visibleCells(faction: string): readonly number[];
        exploredCells(faction: string): readonly number[];

        private seenBy;

        private cellsSeenBy;
        private inside;
        private index;
    }

### `gameResult` (function)

    export declare function gameResult(state: ChessState): ChessResult;

### `goResult` (function)

    export declare function goResult(state: GoState): 'ongoing' | 'finished';

### `goScore` (function)

    export declare function goScore(state: GoState): {
        black: number;

### `inCheck` (function)

    export declare function inCheck(state: ChessState, side: ChessSide): boolean;

### `legalMoves` (function)

    export declare function legalMoves(state: ChessState): ChessMove[];

### `moveSkirmishUnit` (function)

    export declare function moveSkirmishUnit(state: SkirmishState, move: SkirmishMove): void;

### `moveSolitaireTableau` (function)

    export declare function moveSolitaireTableau(state: SolitaireState, from: number, to: number, count?: number): void;

### `moveSolitaireToFoundation` (function)

    export declare function moveSolitaireToFoundation(state: SolitaireState, source: 'waste' | number): void;

### `moveTacticalUnit` (function)

    export declare function moveTacticalUnit(state: TacticalState, move: TacticalMove): void;

### `parseFen` (function)

    export declare function parseFen(fen: string): ChessState;

### `passGo` (function)

    export declare function passGo(state: GoState): void;

### `playGo` (function)

    export declare function playGo(state: GoState, x: number, y: number): void;

### `recall` (function)

    export declare function recall(army: ArmyState, board: TacticalState, unitId: string, x: number, y: number): boolean;

### `recruit` (function)

    export declare function recruit(army: ArmyState, board: TacticalState, unit: TacticalUnit, cost: number): boolean;

### `rollBackgammonDice` (function)

    export declare function rollBackgammonDice(): number[];

### `rollDice` (function)

    export declare function rollDice(count: number, sides: number): number[];

### `rollExpression` (function)

    export declare function rollExpression(expression: string): number;

### `scoreDice` (function)

    export declare function scoreDice(values: readonly number[], category: DiceCategory): number;

### `search` (function)

    export declare function search(state: ChessState, options?: ChessEngineOptions): ChessSearchResult;

### `setSkirmishTerrain` (function)

    export declare function setSkirmishTerrain(state: SkirmishState, x: number, y: number, terrain: string, village?: boolean): void;

### `setTacticalOverwatch` (function)

    export declare function setTacticalOverwatch(state: TacticalState, unitId: string): void;

### `shuffleDeck` (function)

    export declare function shuffleDeck(deck: Card[]): Card[];

### `skirmishAttack` (function)

    export declare function skirmishAttack(state: SkirmishState, attackerId: string, defenderId: string): SkirmishExchange;

### `skirmishIncome` (function)

    export declare function skirmishIncome(state: SkirmishState, owner: string, baseIncome: number, perVillage: number): number;

### `skirmishMoves` (function)

    export declare function skirmishMoves(state: SkirmishState, unitId: string): SkirmishMove[];

### `solitaireWon` (function)

    export declare function solitaireWon(state: SolitaireState): boolean;

### `sq` (function)

    export declare function sq(name: string): ChessSquare;

### `squareName` (function)

    export declare function squareName(sq: ChessSquare): string;

### `startingArmy` (function)

    export declare function startingArmy(currency: number): ArmyState;

### `startingBackgammon` (function)

    export declare function startingBackgammon(): BackgammonState;

### `startingCheckers` (function)

    export declare function startingCheckers(): CheckersState;

### `startingChess` (function)

    export declare function startingChess(): ChessState;

### `startingGo` (function)

    export declare function startingGo(size?: number): GoState;

### `startingSkirmish` (function)

    export declare function startingSkirmish(width: number, height: number, terrainTable: Record<string, SkirmishTerrain>, defaultTerrain?: string): SkirmishState;

### `startingTactics` (function)

    export declare function startingTactics(width: number, height: number, shape?: TacticalShape): TacticalState;

### `tacticalAttack` (function)

    export declare function tacticalAttack(state: TacticalState, attackerId: string, defenderId: string, damage: number): TacticalAttack;

### `tacticalMoves` (function)

    export declare function tacticalMoves(state: TacticalState, unitId: string): TacticalMove[];

### `trickWinner` (function)

    export declare function trickWinner<O = string>(plays: TrickPlay<O>[], trumpSuit?: CardSuit): O;

### `triggerTacticalOverwatch` (function)

    export declare function triggerTacticalOverwatch(state: TacticalState, movingUnitId: string, damage: number): TacticalAttack[];

## `./core`

### `Achievements` (class)

    export declare class Achievements {
        private definitions;
        private counts;

        private fresh;
        define(definition: AchievementDef): void;

        count(counter: string): number;

        increment(counter: string, amount?: number): string[];

        unlocked(id: string): boolean;

        progress(id: string): {
            count: number;
            target: number;
        };

        drainNew(): string[];
        toJSON(): {
            counts: [string, number][];
        };

        static fromJSON(definitions: AchievementDef[], data: {
            counts: [string, number][];
        }): Achievements;
    }

### `ActionJournal` (class)

    export declare class ActionJournal<Action, Event> {
        private entries;
        private nextSequence;
        append(action: Action, events?: readonly Event[]): ActionJournalEntry<Action, Event>;
        get size(): number;
        get all(): readonly ActionJournalEntry<Action, Event>[];

        mark(): number;
        since(sequence: number): ActionJournalEntry<Action, Event>[];

        truncate(sequence: number): void;
        toJSON(): ActionJournalEntry<Action, Event>[];
        static fromJSON<Action, Event>(entries: readonly ActionJournalEntry<Action, Event>[]): ActionJournal<Action, Event>;
    }

### `Blob` (class)

    export declare class Blob {
        readonly width: number;
        readonly height: number;
        private volume;
        constructor(width: number, height: number);

        private index;

        volumeAt(x: number, y: number): number;

        total(): number;

        seed(x: number, y: number, amount: number): void;

        clear(x: number, y: number): void;

        spread(open: (x: number, y: number) => boolean, spread?: number, decay?: number): Array<{
            x: number;
            y: number;
        }>;

        cellsAbove(minimum: number): Array<{
            x: number;
            y: number;
            volume: number;
        }>;
        toJSON(): {
            width: number;
            height: number;
            volume: number[];
        };
        static fromJSON(data: {
            width: number;
            height: number;
            volume: number[];
        }): Blob;
    }

### `checkNoControlCharacters` (function)

    export declare function checkNoControlCharacters(text: string): void;

### `checkSize` (function)

    export declare function checkSize(data: string | Uint8Array, options?: SizeLimitOptions): void;

### `Collection` (class)

    export declare class Collection {
        private readonly prefix;
        private readonly storage;
        constructor(name: string, options?: CollectionOptions);

        get size(): number;

        all(): DbRecord[];
        get(id: string): DbRecord | undefined;

        put(record: DbRecord): void;
        remove(id: string): void;

        where(predicate: (record: DbRecord) => boolean): DbRecord[];

        clear(): void;
        private keys;
        private read;
    }

### `deserializeReplay` (function)

    export declare function deserializeReplay(json: string): ReplayEvent[];

### `Easing` (const)

    export declare const Easing: Record<'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic', Easing>;

### `EntityRegistry` (class)

    export declare class EntityRegistry<T extends object> {
        private entities;
        private ids;
        private sequence;

        add(entity: T, requestedId?: EntityId): EntityId;
        get(id: EntityId): T | undefined;

        idOf(entity: T): EntityId | undefined;
        has(id: EntityId): boolean;
        remove(id: EntityId): boolean;
        get size(): number;
    }

### `FeedbackClient` (class)

    export declare class FeedbackClient extends HttpTransport {
        constructor(options: FeedbackOptions);
        submit(request: FeedbackRequest): Promise<FeedbackResponse>;
    }

### `Generator` (class)

    export declare class Generator {
        private s0;
        private s1;
        private s2;
        private s3;
        readonly seed: number;
        constructor(seed?: number);

        nextUint32(): number;

        float(): number;

        int(bound: number): number;

        getState(): [number, number, number, number];
        setState(state: readonly [number, number, number, number]): void;
    }

### `hexDistance` (function)

    export declare function hexDistance(a: HexCoord, b: HexCoord): number;

### `hexLine` (function)

    export declare function hexLine(a: HexCoord, b: HexCoord): HexCoord[];

### `hexNeighbors` (function)

    export declare function hexNeighbors(x: number, y: number): HexCoord[];

### `hexRange` (function)

    export declare function hexRange(center: HexCoord, radius: number): HexCoord[];

### `hexToPixel` (function)

    export declare function hexToPixel(x: number, y: number, tileWidth: number, tileHeight: number, shape?: HexShape): {
        x: number;

### `HookRegistry` (class)

    export declare class HookRegistry<TArgs extends unknown[]> {
        private hooks;
        on(event: string, handler: (...args: TArgs) => void, source?: unknown): void;

        off(handler: (...args: TArgs) => void): void;

        offSource(source: unknown): void;

        emit(event: string, ...args: TArgs): void;

        get size(): number;
        clear(): void;
    }

### `Input` (namespace)

    export * as Input from './Input.ts'

### `LoadQueue` (class)

    export declare class LoadQueue {
        readonly changed: Signal<LoadSnapshot>;
        private readonly tasks;
        private readonly progress;
        private status_;
        private current_;
        private error_;
        private cancelled;
        add(task: LoadTask): this;
        get snapshot(): LoadSnapshot;

        start(): Promise<void>;

        cancel(): void;

        retry(): void;
        private report;
        private emit;
    }

### `LockstepClient` (class)

    export declare class LockstepClient {
        readonly onWelcome: Signal<{
            id: string;
        }>;
        readonly onTick: Signal<TickEvent>;
        readonly onClose: Signal<void>;
        private socket;
        private readonly url;
        private readonly createSocket;
        private _id;
        constructor(options: LockstepClientOptions);

        get id(): string | null;
        get connected(): boolean;
        connect(): void;

        submitInput(payload: unknown): void;
        close(): void;
        private handleMessage;
    }

### `Logger` (class)

    export declare class Logger {
        private readonly category;
        private level;
        private readonly sink;
        constructor(category: string, options?: LoggerOptions);

        setLevel(level: LogLevel): void;
        debug(message: string, data?: unknown): void;
        info(message: string, data?: unknown): void;
        warn(message: string, data?: unknown): void;
        error(message: string, data?: unknown): void;
        private write;
    }

### `MersenneTwister` (class)

    export declare class MersenneTwister {
        private state;
        private index;
        private seedValue;
        private produced;
        constructor(seed?: number);

        seed(seed: number): void;
        private generate;

        nextUint32(): number;

        float(): number;

        int(bound: number): number;

        discard(count: number): void;

        get discardCount(): number;
        getState(): MersenneTwisterState;
        setState(state: MersenneTwisterState): void;
    }

### `motionDuration` (function)

    export declare function motionDuration(duration: number, intent?: MotionIntent): number;

### `NewsClient` (class)

    export declare class NewsClient extends HttpTransport {
        constructor(options: NewsOptions);

        fetchItems(): Promise<NewsItem[]>;
    }

### `NewsSeenTracker` (class)

    export declare class NewsSeenTracker {
        private readonly store;
        constructor(options: NewsSeenOptions);
        private readSeen;
        isSeen(id: string): boolean;
        markSeen(id: string): void;

        unseen(items: readonly NewsItem[]): NewsItem[];
    }

### `parseCSV` (function)

    export declare function parseCSV<T = Record<string, string>>(source: string, options?: CsvOptions): T[];

### `pixelToHex` (function)

    export declare function pixelToHex(px: number, py: number, tileWidth: number, tileHeight: number, shape?: HexShape): HexCoord;

### `Player` (class)

    export declare class Player {
        private frame;
        private index;
        private readonly events;
        private readonly dispatch;
        private readonly frames;
        private readonly onFrame;
        constructor(events: readonly ReplayEvent[], dispatch: (action: string) => void, frames: Signal<number>);

        get done(): boolean;

        stop(): void;
        private pump;
    }

### `PlayerInput` (class)

    export declare class PlayerInput {
        readonly id: string;
        readonly padIndex?: number;
        constructor(id: string, options?: PlayerInputOptions);
        private scoped;

        bind(action: Action, keys: readonly string[]): void;

        bindButton(action: Action, buttons: readonly number[]): void;

        bindAxis(action: Action, axis: number, direction: 1 | -1): void;

        bindTouch(action: Action, id?: string): void;

        pressTouch(id: string): void;
        releaseTouch(id: string): void;
        isDown(action: Action): boolean;
        justPressed(action: Action): boolean;
        justReleased(action: Action): boolean;

        keysFor(action: Action): string[];
    }

### `PlayerStats` (class)

    export declare class PlayerStats<T, S = T> {
        private readonly store;
        private readonly initial;
        private readonly combine;
        constructor(options: PlayerStatsOptions<T, S>);

        get(): T;

        record(summary: S): T;

        reset(): void;
    }

### `prefersReducedMotion` (function)

    export declare function prefersReducedMotion(): boolean;

### `PresentationQueue` (class)

    export declare class PresentationQueue<Event> {
        private readonly play;
        private queue;
        private busy;
        private remaining;
        constructor(options: PresentationQueueOptions<Event>);

        enqueue(events: readonly Event[]): void;

        update(dt: number): void;

        get isBusy(): boolean;

        clear(): void;
        private advance;
    }

### `Random` (namespace)

    export * as Random from './Random.ts'

### `RandomStreams` (class)

    export declare class RandomStreams {
        private baseSeed;
        private streams;
        constructor(seed?: number);

        stream(name: string): MersenneTwister;

        seedOf(name: string): number | undefined;

        reseed(seed: number): void;

        names(): string[];
        getState(): Record<string, MersenneTwisterState>;

        setState(state: Readonly<Record<string, MersenneTwisterState>>): void;
    }

### `ReactionTable` (class)

    export declare class ReactionTable<TState> {
        private rules;
        private active;
        private spent;
        constructor(rules?: ReactionRule<TState>[]);
        add(rule: ReactionRule<TState>): void;

        remove(id: string): void;

        check(state: Readonly<TState>): string[];

        isActive(id: string): boolean;

        reset(): void;
        toJSON(): {
            active: string[];
            spent: string[];
        };

        static fromJSON<TState>(rules: ReactionRule<TState>[], data: {
            active: string[];
            spent: string[];
        }): ReactionTable<TState>;
    }

### `Recorder` (class)

    export declare class Recorder {
        private frame;
        private readonly recorded;
        private readonly actions;
        private readonly frames;
        private readonly onAction;
        private readonly onFrame;
        constructor(actions: Signal<string>, frames: Signal<number>);
        get events(): readonly ReplayEvent[];

        toJSON(): ReplayEvent[];

        stop(): void;
    }

### `reducedMotion` (function)

    export declare function reducedMotion(): boolean;

### `Registry` (class)

    export declare class Registry<T> {
        private items;

        register(name: string, value: T): void;
        get(name: string): T;
        has(name: string): boolean;

        list(): string[];
    }

### `RunHistory` (class)

    export declare class RunHistory<T> {
        private readonly store;
        private readonly limit?;
        constructor(options: RunHistoryOptions);
        private readAll;

        record(summary: T): RunHistoryEntry<T>;

        all(): readonly RunHistoryEntry<T>[];

        ranked(by: (summary: T) => number, order?: 'asc' | 'desc'): readonly RunHistoryEntry<T>[];

        clear(): void;
    }

### `sanitizeInboundText` (function)

    export declare function sanitizeInboundText(text: string, options?: SizeLimitOptions): string;

### `SaveSyncClient` (class)

    export declare class SaveSyncClient extends HttpTransport {
        constructor(options: SaveSyncOptions);

        upload(slot: string, payload: string): Promise<SaveSyncResponse>;

        download(slot: string): Promise<string>;

        list(): Promise<string[]>;
        private slotUrl;
    }

### `SaveSystem` (class)

    export declare class SaveSystem<T> {
        private namespace;
        private version;
        private migrations;
        private storage;
        constructor(options: SaveSystemOptions);
        private key;
        save(slot: string, state: T, preview?: unknown): void;

        load(slot: string): SaveData<T> | null;

        importExternal(slot: string, externalBytes: Uint8Array, normalize: (bytes: Uint8Array) => unknown, preview?: unknown): void;
        delete(slot: string): void;

        exportSlot(slot: string, scrambleKey?: string): string | null;

        importSlot(slot: string, payload: string, scrambleKey?: string): void;

        list(): Array<{
            slot: string;
            meta: SaveMeta;
        }>;
    }

### `Scene` (class)

    export declare abstract class Scene {

        readonly onDestroy: Signal<void>;
        private destroyed;

        abstract create(): void;

        update(_dt: number): void;

        resize(_width: number, _height: number): void;

        onSuspend(): void;

        onResume(_result: unknown): void;
        destroy(): void;

        protected teardown(): void;
        get isDestroyed(): boolean;
    }

### `SceneComponentHost` (class)

    export declare class SceneComponentHost<TScene extends Scene = Scene> {
        private order;
        private registry;

        add(component: SceneComponent<TScene>, scene: TScene): void;
        has(name: string): boolean;

        get<T extends SceneComponent<TScene> = SceneComponent<TScene>>(name: string): T;
        update(scene: TScene, dt: number): void;
        resize(scene: TScene, width: number, height: number): void;
        onSuspend(scene: TScene): void;
        onResume(scene: TScene, result: unknown): void;

        destroy(scene: TScene): void;
    }

### `SceneStack` (class)

    export declare class SceneStack<T extends Scene = Scene> {
        private scenes;

        get current(): T | null;
        get depth(): number;

        replace(scene: T): void;

        push(scene: T): void;

        pop(result?: unknown): void;

        update(dt: number): void;

        resize(width: number, height: number): void;
        destroy(): void;
    }

### `scramble` (function)

    export declare function scramble(text: string, key: string): string;

### `serializeReplay` (function)

    export declare function serializeReplay(events: readonly ReplayEvent[]): string;

### `Session` (class)

    export declare class Session {

        readonly launches: number;
        constructor(options?: SessionOptions);
    }

### `setReducedMotion` (function)

    export declare function setReducedMotion(value: boolean | null): void;

### `Signal` (class)

    export declare class Signal<T> {
        private listeners;
        private readonly stackMode;

        constructor(stackMode?: boolean);
        add(listener: SignalListener<T>): void;
        remove(listener: SignalListener<T>): void;
        removeAll(): void;
        get size(): number;

        dispatch(value: T): boolean;
    }

### `Spawner` (class)

    export declare class Spawner<T> {
        private schedule;
        private cursor;
        private elapsed;
        private startedWaves;
        private completed;
        private onSpawn;
        private onWaveStart?;
        private onComplete?;
        constructor(options: SpawnerOptions<T>);
        update(dt: number): void;

        get isComplete(): boolean;
    }

### `StateRegistry` (class)

    export declare class StateRegistry {
        private extensions;
        register<T extends StateValue>(extension: StateExtension<T>): () => void;
        snapshot(): StateSnapshot;
        restore(snapshot: StateSnapshot, options?: {
            readonly missing?: 'keep' | 'reset' | 'remove';
            readonly onDiagnostic?: (diagnostic: StateRestoreDiagnostic) => void;
        }): readonly StateRestoreDiagnostic[];
        transaction<T>(work: () => T): T;
    }

### `TelemetryClient` (class)

    export declare class TelemetryClient extends HttpTransport {
        private consented;
        constructor(options: TelemetryOptions);

        get hasConsent(): boolean;

        setConsent(granted: boolean): void;

        send(event: TelemetryEvent): Promise<TelemetryResponse | null>;
    }

### `Tweener` (class)

    export declare class Tweener {
        private tweens;

        tween(duration: number, apply: (t: number) => void, options?: Easing | TweenOptions): Promise<void>;
        update(dt: number): void;

        get isBusy(): boolean;

        clear(): void;
    }

### `UndoHistory` (class)

    export declare class UndoHistory<T> {
        private history;
        private cursor;
        private readonly limit;
        constructor(options?: UndoHistoryOptions);

        push(state: T): void;
        get canUndo(): boolean;
        get canRedo(): boolean;

        undo(): T | null;

        redo(): T | null;

        get current(): T | null;

        clear(): void;
    }

### `unscramble` (function)

    export declare function unscramble(payload: string, key: string): string;

### `validateSchema` (function)

    export declare function validateSchema(value: unknown, schema: Schema, path?: string): void;

### `watchReducedMotion` (function)

    export declare function watchReducedMotion(listener: (reduced: boolean) => void): () => void;

### `weightedFlood` (function)

    export declare function weightedFlood<T, K>(start: T, options: WeightedFloodOptions<T, K>): Map<K, WeightedCell<T>>;

## `./i18n`

### `AUDIO_SUFFIX` (const)

    export declare const AUDIO_SUFFIX = ".audio";

### `Catalog` (interface)

    export interface Catalog {

        locale: string;
        direction: Direction;
        messages: Record<string, MessageValue>;

        typography?: boolean;
    }

### `catalogCompleteness` (function)

    export declare function catalogCompleteness(reference: Catalog, other: Catalog): number;

### `catalogUsage` (function)

    export declare function catalogUsage(catalog: Catalog, referencedKeys: Iterable<string>): CatalogUsageStats;

### `copyFromBase` (function)

    export declare function copyFromBase(session: EditSession, key: string): EditSession;

### `createCatalogFormatter` (function)

    export declare function createCatalogFormatter(): MessageFormatter;

### `createEditSession` (function)

    export declare function createEditSession(base: Catalog, target: Catalog): EditSession;

### `cueKeyFor` (function)

    export declare function cueKeyFor(session: EditSession, key: string): string;

### `deleteTargetKey` (function)

    export declare function deleteTargetKey(session: EditSession, key: string): EditSession;

### `diffCatalogKeys` (function)

    export declare function diffCatalogKeys(reference: Catalog, other: Catalog): CatalogKeyDiff;

### `diffPlaceholders` (function)

    export declare function diffPlaceholders(baseText: string, targetText: string): PlaceholderDiff;

### `direction` (function)

    export declare function direction(): Direction;

### `Direction` (type)

    export type Direction = 'ltr' | 'rtl';

### `findSimilarMessages` (function)

    export declare function findSimilarMessages(catalog: Catalog, minSimilarity?: number): SimilarMessagePair[];

### `FluentMessage` (interface)

    export interface FluentMessage {
        format(params?: MessageParams): string;
    }

### `formatDate` (function)

    export declare function formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string;

### `formatList` (function)

    export declare function formatList(items: readonly string[], options?: Intl.ListFormatOptions): string;

### `formatNumber` (function)

    export declare function formatNumber(value: number, options?: Intl.NumberFormatOptions): string;

### `formatSpec` (function)

    export declare function formatSpec(value: string | number, spec: string, language?: string): string | undefined;

### `has` (function)

    export declare function has(key: string): boolean;

### `isAudioKey` (function)

    export declare function isAudioKey(key: string): boolean;

### `levenshteinDistance` (function)

    export declare function levenshteinDistance(a: string, b: string): number;

### `locale` (function)

    export declare function locale(): string;

### `mergeCatalogKeys` (function)

    export declare function mergeCatalogKeys(catalog: Catalog, survivingKey: string, mergedKey: string): Catalog;

### `MessageParams` (interface)

    export interface MessageParams {

        count?: number;
        [token: string]: string | number | undefined;
    }

### `messageText` (function)

    export declare function messageText(value: MessageValue): string;

### `MessageValue` (type)

    export type MessageValue = string | PluralForms | FluentMessage;

### `nonBreakingUnit` (function)

    export declare function nonBreakingUnit(value: string | number, unit: string, language?: string): string;

### `parseFTL` (function)

    export declare function parseFTL(locale: string, source: string, options?: FluentOptions): Catalog;

### `parsePo` (function)

    export declare function parsePo(locale: string, source: string, options?: PoOptions): Catalog;

### `parseSoundMarkers` (function)

    export declare function parseSoundMarkers(source: string): ParsedSoundText;

### `pluralFormCoverage` (function)

    export declare function pluralFormCoverage(catalog: Catalog): PluralCoverage;

### `PluralForms` (type)

    export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;

### `reset` (function)

    export declare function reset(): void;

### `sessionCompleteness` (function)

    export declare function sessionCompleteness(session: EditSession): number;

### `sessionKeys` (function)

    export declare function sessionKeys(session: EditSession): string[];

### `sessionRow` (function)

    export declare function sessionRow(session: EditSession, key: string): EditRow;

### `sessionRows` (function)

    export declare function sessionRows(session: EditSession, filter?: RowFilter): EditRow[];

### `setActive` (function)

    export declare function setActive(catalog: Catalog | null): void;

### `setBase` (function)

    export declare function setBase(catalog: Catalog): void;

### `setTargetSound` (function)

    export declare function setTargetSound(session: EditSession, key: string, path: string): EditSession;

### `setTargetText` (function)

    export declare function setTargetText(session: EditSession, key: string, text: string): EditSession;

### `stripSoundMarkers` (function)

    export declare function stripSoundMarkers(source: string): string;

### `swapSession` (function)

    export declare function swapSession(session: EditSession): EditSession;

### `t` (function)

    export declare function t(key: string, params?: MessageParams): string;

### `tokenizeMessage` (function)

    export declare function tokenizeMessage(text: string): MessagePart[];

### `tRaw` (function)

    export declare function tRaw(key: string, params?: MessageParams): string;

### `typographic` (function)

    export declare function typographic(text: string, language?: string): string;

### `validateCatalog` (function)

    export declare function validateCatalog(catalog: Catalog): CatalogIssue[];

### `validateMessageAudio` (function)

    export declare function validateMessageAudio(catalog: Catalog): AudioIssue[];

## `./mwl`

### `campaignChain` (function)

    export declare function campaignChain<State extends StateValue, Result extends StateValue = StateValue>(definition: MwlCampaignDefinition, options: {
        readonly run: MwlScenarioRunner<State, Result>;

### `carryoverIntoScenario` (function)

    export declare function carryoverIntoScenario(carryover: MwlCarryover, declaredGold: number): number;

### `coerceTableValue` (function)

    export declare function coerceTableValue(raw: string, type: CsvColumnType, column: string, listDelimiter?: string, mapDelimiter?: string): unknown;

### `collectHookReferences` (function)

    export declare function collectHookReferences(game: MwlCompiledGame): HookReference[];

### `compile` (function)

    export declare function compile(source: string, options?: MwlCompileOptions): MwlCompiledGame;

### `compileAndEmitSources` (function)

    export declare function compileAndEmitSources(files: readonly MwlSourceFile[], options?: MwlCompileOptions, emitOptions?: Omit<MwlEmitOptions, 'onEmit'>): readonly MwlArtifact[];

### `compileNodes` (function)

    export declare function compileNodes(nodes: readonly MwlNode[], options?: MwlCompileOptions): MwlCompiledGame;

### `compileSources` (function)

    export declare function compileSources(files: readonly MwlSourceFile[], options?: MwlCompileOptions): MwlCompiledGame;

### `composeEffects` (function)

    export declare function composeEffects(base: number, effects: readonly MwlEffectDefinition[], context?: MwlExpressionContext): number;

### `contentCatalog` (function)

    export declare function contentCatalog(game: MwlCompiledGame): MwlContentCatalog;

### `contentReport` (function)

    export declare function contentReport(game: MwlCompiledGame): MwlContentReport;

### `createExpressionScriptHost` (function)

    export declare function createExpressionScriptHost(): ScriptHost;

### `createWorld` (function)

    export declare function createWorld(): MwlWorld;

### `decodeSave` (function)

    export declare function decodeSave(snapshot: string, options: MwlPersistenceOptions): MwlWorld;

### `effectToModifier` (function)

    export declare function effectToModifier(effect: MwlEffectDefinition, context?: MwlExpressionContext): Modifier;

### `emitArtifacts` (function)

    export declare function emitArtifacts(game: MwlCompiledGame, options?: MwlEmitOptions): readonly MwlArtifact[];

### `emitHooksDeclaration` (function)

    export declare function emitHooksDeclaration(references: readonly HookReference[]): string;

### `emitModule` (function)

    export declare function emitModule(game: MwlCompiledGame, variable?: string): string;

### `encodeSave` (function)

    export declare function encodeSave(world: MwlWorld, options: MwlPersistenceOptions): string;

### `endLevelCarryover` (function)

    export declare function endLevelCarryover(world: MwlWorld, side: MwlSideRef | null, end: MwlEndLevel): MwlCarryover;

### `evaluateCondition` (function)

    export declare function evaluateCondition(source: string, context: MwlConditionContext, options?: MwlConditionOptions): boolean;

### `evaluateExpression` (function)

    export declare function evaluateExpression(expression: MwlExpression | string, context: MwlExpressionContext): number;

### `execute` (function)

    export declare function execute(world: MwlWorld, command: MwlCommand): void;

### `extractCatalog` (function)

    export declare function extractCatalog(game: MwlCompiledGame, options?: MwlCatalogOptions): MwlCatalog;

### `hookTypes` (const)

    export declare const hookTypes: readonly HookType[];

### `inventoryItem` (function)

    export declare function inventoryItem(item: MwlActorItem, quantity?: number): InventoryItem;

### `isGettext` (function)

    export declare function isGettext(raw: string): boolean;

### `itemDefinition` (function)

    export declare function itemDefinition(item: MwlItemDefinition, context?: MwlExpressionContext): MwlActorItem;

### `loadContent` (function)

    export declare function loadContent(files: readonly MwlSourceFile[], options?: MwlCompileOptions): MwlContentLoadReport;

### `MWL_DEFAULT_CARRYOVER_PERCENTAGE` (const)

    export declare const MWL_DEFAULT_CARRYOVER_PERCENTAGE = 80;

### `MwlRuntime` (class)

    export declare class MwlRuntime {
        readonly game: MwlCompiledGame;
        readonly world: MwlWorld;
        private readonly onMessage?;
        private readonly resolveMap?;
        private readonly hooks?;
        private readonly onTrace?;
        private readonly persistence;
        private readonly unitTypes;
        private schedule;
        private pendingDialogue;
        private dialogueCounter;
        constructor(game: MwlCompiledGame, options?: MwlRuntimeOptions);
        run(trigger: string): void;

        fireEvent(id: string): boolean;

        fireMoveto(id: string): void;

        private claimEvent;
        private eventFiltersMatch;
        private executeEvent;
        private executeTracedEvent;

        private showDialogue;
        private showSay;

        answerDialogue(dialogueId: string, choiceIndex: number): boolean;

        evaluate(): MwlWorld['status'];
        save(): string;
        snapshot(): string;
        restore(snapshot: string): void;
        private loadUnitTypes;
        private loadSchedule;
        private loadInitialContent;
        private buildMap;
        private loadInitialUnits;
        private loadLeaders;
        private unitAt;
        private executeNode;
        private runHook;
        private applyMove;

        private showMessage;

        private interpolate;
        private setVariable;
        private variableAt;
        private setVariableAt;
        private spawnUnit;
        private killUnit;
        private addGold;
        private endTurn;

        private checkTimeOver;
        private advanceSchedule;
        private resetMoves;
        private filterMatches;

        private conditionMatches;
        private nodeConditionMatches;

        private filterConditionMatches;
        private conditionMet;
        private checkObjectives;
        private worldView;
        private emit;
        private attack;
        private nodes;
    }

### `MwlSyntaxError` (class)

    export declare class MwlSyntaxError extends Error {
        readonly diagnostic: MwlDiagnostic;
        constructor(diagnostic: MwlDiagnostic);
    }

### `parse` (function)

    export declare function parse(source: string, file?: string): MwlNode[];

### `parseExpression` (function)

    export declare function parseExpression(source: string): MwlExpression;

### `parseHookReference` (function)

    export declare function parseHookReference(value: string): {
        type: HookType;

### `parseTableColumns` (function)

    export declare function parseTableColumns(value: string): MwlTableColumn[];

### `parseTerrain` (function)

    export declare function parseTerrain(text: string): {
        width: number;

### `parseValue` (function)

    export declare function parseValue(raw: string, location: MwlLocation, lineText?: string): string;

### `preprocess` (function)

    export declare function preprocess(source: string, options?: MwlPreprocessOptions): string;

### `readAttributes` (function)

    export declare function readAttributes<T extends Record<string, unknown>>(node: MwlCompiledNode, fields: Readonly<Record<keyof T & string, MwlFieldSpec>>): MwlReadResult<T>;

### `readChildren` (function)

    export declare function readChildren<T>(node: MwlCompiledNode, tag: string, read: (child: MwlCompiledNode) => MwlReadResult<T>): MwlReadResult<readonly T[]>;

### `schema01` (const)

    export declare const schema01: Readonly<Record<string, MwlTagSchema>>;

### `sideVisionGroups` (function)

    export declare function sideVisionGroups(world: MwlWorld): readonly (readonly string[])[];

### `validate` (function)

    export declare function validate(nodes: readonly MwlNode[], schemas?: Readonly<Record<string, MwlTagSchema>>): MwlDiagnostic[];

### `validateCatalog` (function)

    export declare function validateCatalog(game: MwlCompiledGame, options?: MwlValidationOptions): MwlDiagnostic[];

### `validateCatalogNodes` (function)

    export declare function validateCatalogNodes(nodes: readonly MwlNode[], options?: MwlValidationOptions): MwlDiagnostic[];

### `validateHookReferences` (function)

    export declare function validateHookReferences(references: readonly HookReference[], available: Iterable<string>): MwlDiagnostic[];

### `validateWorld` (function)

    export declare function validateWorld(value: unknown): MwlWorld;

## `./mwl/fengari`

### `createFengariScriptHost` (function)

    export declare function createFengariScriptHost(options?: FengariScriptHostOptions): ScriptHost;

### `FengariScriptHostOptions` (interface)

    export interface FengariScriptHostOptions {
        readonly instructionLimit?: number;
        readonly seed?: number;
    }

## `./roguelike`

### `AbilityCycle` (class)

    export declare class AbilityCycle {
        private cooldowns;
        private remaining;
        constructor(cooldowns: Record<string, number>);

        advance(turns?: number): void;

        ready(): string[];

        use(id: string): boolean;
        toJSON(): {
            remaining: [string, number][];
        };
        static fromJSON(cooldowns: Record<string, number>, data: {
            remaining: [string, number][];
        }): AbilityCycle;
    }

### `areaFalloffMultiplier` (function)

    export declare function areaFalloffMultiplier(index: number, steps: readonly number[]): number;

### `ballistica` (function)

    export declare function ballistica(level: Level, from: Step, to: Step, options?: BallisticaOptions): BallisticaResult;

### `BossPhases` (class)

    export declare class BossPhases {
        private thresholds;
        private current;

        constructor(thresholds?: readonly number[]);

        get phase(): number;

        check(hpFraction: number): number[];

        reset(): void;
        toJSON(): {
            phase: number;
        };
        static fromJSON(thresholds: readonly number[], data: {
            phase: number;
        }): BossPhases;
    }

### `candidateCells` (function)

    export declare function candidateCells(level: Level, filter?: PlacementFilter): number[];

### `canTarget` (function)

    export declare function canTarget(level: Level, origin: Step, target: Step, options: TargetingOptions): boolean;

### `cellsNear` (function)

    export declare function cellsNear(level: Level, center: number, radius: number): number[];

### `chainTargets` (function)

    export declare function chainTargets(candidates: readonly Step[], origin: Step, jumps: number, range: number): Step[];

### `chebyshevDistance` (function)

    export declare function chebyshevDistance(a: Step, b: Step): number;

### `checkDeterminism` (function)

    export declare function checkDeterminism(generate: () => DungeonArtifacts, runs?: number): DungeonMismatch[];

### `CombatHooks` (class)

    export declare class CombatHooks<C> extends HookRegistry<[context: DamageContext<C>]> {

        modifyDamage(attacker: C, defender: C, amount: number): DamageContext<C>;
    }

### `compareDungeonArtifacts` (function)

    export declare function compareDungeonArtifacts(expected: DungeonArtifacts, actual: DungeonArtifacts): DungeonMismatch[];

### `coneCells` (function)

    export declare function coneCells(origin: Step, target: Step, width: number): Step[];

### `decideMonsterAI` (function)

    export declare function decideMonsterAI(level: Level, pathfinder: Pathfinder, self: Step, hpFraction: number, target: Step, options?: MonsterAIOptions): AIDecision;

### `Doors` (class)

    export declare class Doors {
        private level;
        private openKind;
        private closedKind;
        private lockedBy;
        private open_;
        constructor(level: Level);

        place(x: number, y: number, options: {
            open: number;
            closed: number;
            locked?: string;
            startOpen?: boolean;
        }): void;
        isDoor(x: number, y: number): boolean;
        isOpen(x: number, y: number): boolean;
        isLocked(x: number, y: number): boolean;

        requiredKey(x: number, y: number): string | undefined;

        open(x: number, y: number): boolean;

        close(x: number, y: number): boolean;

        unlock(x: number, y: number): boolean;
        toJSON(): {
            doors: {
                cell: number;
                open: number;
                closed: number;
                locked?: string;
                isOpen: boolean;
            }[];
        };

        static fromJSON(level: Level, data: {
            doors: {
                cell: number;
                open: number;
                closed: number;
                locked?: string;
                isOpen: boolean;
            }[];
        }): Doors;
    }

### `DUNGEON_KINDS` (const)

    export declare const DUNGEON_KINDS: TerrainKind[];

### `Elevation` (class)

    export declare class Elevation {
        private readonly level;
        private readonly heights;
        constructor(level: Level);

        heightAt(x: number, y: number): number;

        set(x: number, y: number, height: number): void;
    }

### `eligibleBuilders` (function)

    export declare function eligibleBuilders(builders: readonly RoomBuilder[], room: Rect): RoomBuilder[];

### `FeatureLayer` (class)

    export declare class FeatureLayer<TContext = unknown> {
        private defs;
        private placed;

        define(kind: string, def: CellFeatureDef<TContext>): void;

        place(cell: number, kind: string): void;
        has(cell: number): boolean;
        kindAt(cell: number): string | undefined;
        remove(cell: number): void;

        inspect(cell: number, ctx: TContext): void;

        interact(cell: number, ctx: TContext): void;
        private defAt;

        toJSON(): {
            cells: [number, string][];
        };
        static fromJSON<T>(defs: ReadonlyMap<string, CellFeatureDef<T>>, data: {
            cells: [number, string][];
        }): FeatureLayer<T>;
    }

### `FieldOfView` (class)

    export declare class FieldOfView {
        private level;
        private fov;

        readonly visible: Set<number>;

        readonly explored: Set<number>;

        readonly light: Map<number, number>;
        constructor(level: Level);

        update(x: number, y: number, radius?: number, sight?: HeightSight): void;

        private lightCell;

        private updateFromHeight;

        private heightBlocked;
        isVisible(x: number, y: number): boolean;
        isExplored(x: number, y: number): boolean;

        lightAt(x: number, y: number): number;

        reset(): void;

        revealAll(): void;
    }

### `findFreeCell` (function)

    export declare function findFreeCell(level: Level, taken?: ReadonlySet<number>): number | null;

### `FLOOR` (const)

    export declare const FLOOR: TerrainKind;

### `furthestRoom` (function)

    export declare function furthestRoom(level: Level, from: {
        x: number;

### `generateDungeon` (function)

    export declare function generateDungeon(options: DungeonOptions): Level;

### `generateDungeonGraph` (function)

    export declare function generateDungeonGraph(options: DungeonOptions): DungeonResult;

### `hallBuilder` (const)

    export declare const hallBuilder: RoomBuilder;

### `hasLineOfSight` (function)

    export declare function hasLineOfSight(level: Level, from: Step, to: Step): boolean;

### `hexConeCells` (function)

    export declare function hexConeCells(origin: Step, target: Step, width: number): Step[];

### `knockbackPath` (function)

    export declare function knockbackPath(level: Level, from: Step, direction: Step, distance: number): Step[];

### `Level` (class)

    export declare class Level {
        readonly width: number;
        readonly height: number;
        readonly shape: LevelShape;

        viewDistance?: number;

        readonly terrain: Uint8Array;
        private kinds;

        rooms: Rect[];
        constructor(width: number, height: number, kinds: TerrainKind[], fill?: number, shape?: LevelShape, viewDistance?: number);
        get cellCount(): number;
        index(x: number, y: number): number;
        xOf(cell: number): number;
        yOf(cell: number): number;
        inside(x: number, y: number): boolean;

        neighbors(x: number, y: number, topology?: 4 | 8): Array<{
            x: number;
            y: number;
        }>;

        forEachNeighbor(x: number, y: number, topology: 4 | 8, visit: (nx: number, ny: number) => void): void;

        insideWithBorder(x: number, y: number): boolean;
        get(x: number, y: number): number;
        set(x: number, y: number, kind: number): void;
        kindAt(x: number, y: number): TerrainKind;
        passable(x: number, y: number): boolean;
        transparent(x: number, y: number): boolean;
        fillRect(rect: Rect, kind: number): void;

        passableCells(): number[];
        toJSON(): {
            width: number;
            height: number;
            shape: LevelShape;
            terrain: number[];
            rooms: Rect[];
            viewDistance?: number;
        };

        static fromJSON(kinds: TerrainKind[], data: {
            width: number;
            height: number;
            shape: LevelShape;
            terrain: number[];
            rooms: Rect[];
            viewDistance?: number;
        }): Level;
    }

### `MultiStageAbility` (class)

    export declare class MultiStageAbility {
        private stages;
        private index;
        private remaining;
        constructor(stages: readonly AbilityStage[]);

        get active(): boolean;

        get stage(): AbilityStage | null;

        start(): boolean;

        advance(): string | null;

        cancel(): void;
        toJSON(): {
            index: number;
            remaining: number;
        };
        static fromJSON(stages: readonly AbilityStage[], data: {
            index: number;
            remaining: number;
        }): MultiStageAbility;
    }

### `MultiTurnBeam` (class)

    export declare class MultiTurnBeam<T = unknown> {
        private options;
        private path;
        private index;
        private state;
        constructor(options: MultiTurnBeamOptions<T>);
        get active(): boolean;
        get done(): boolean;
        get currentPath(): readonly Step[];
        start(): boolean;

        advance(): BeamStep<T>;
        cancel(): void;
        toJSON(): MultiTurnBeamSave;
        static fromJSON<T>(options: Omit<MultiTurnBeamOptions<T>, 'from' | 'target'>, data: MultiTurnBeamSave): MultiTurnBeam<T>;
    }

### `neighbourOffsets` (function)

    export declare function neighbourOffsets(topology: 4 | 8): ReadonlyArray<readonly [number, number]>;

### `Pathfinder` (class)

    export declare class Pathfinder {
        private level;
        constructor(level: Level);
        private passable;

        private stepper;

        find(from: Step, to: Step, options?: PathOptions): Step[];

        step(from: Step, to: Step, options?: PathOptions): Step | null;

        distanceMap(to: Step, options?: PathOptions): Int32Array;

        descend(from: Step, distances: Int32Array, options?: PathOptions): Step | null;

        autoExplore(from: Step, explored: FieldOfView, options?: PathOptions): Step[];

        private reconstruct;
    }

### `pickBuilder` (function)

    export declare function pickBuilder(builders: readonly RoomBuilder[], room: Rect): RoomBuilder | null;

### `rangeMultiplier` (function)

    export declare function rangeMultiplier(distance: number, bands: readonly RangeBand[], beyond?: number): number;

### `rectCenter` (function)

    export declare function rectCenter(rect: Rect): {
        x: number;

### `rectsOverlap` (function)

    export declare function rectsOverlap(a: Rect, b: Rect, margin?: number): boolean;

### `resolveArea` (function)

    export declare function resolveArea(origin: Step, target: Step, shape: AreaShape): Step[];

### `resolveAreaOnLevel` (function)

    export declare function resolveAreaOnLevel(level: Level, origin: Step, target: Step, shape: AreaShape): Step[];

### `rollRoster` (function)

    export declare function rollRoster<T>(regular: readonly RosterEntry<T>[], rare?: readonly RareEntry<T>[], shuffleResult?: boolean): ContentRollResult<T>;

### `Scheduler` (class)

    export declare class Scheduler<A extends Actor> {
        private entries;
        private sequence;

        now: number;
        get size(): number;
        get actors(): A[];
        has(actor: A): boolean;

        add(actor: A, delay?: number, priority?: number): void;
        remove(actor: A): void;
        clear(): void;

        peek(): A | null;

        spend(cost: number): void;

        postpone(actor: A, delay: number): void;

        timeOf(actor: A): number | null;

        toJSON(actorId: (actor: A) => string): SchedulerSnapshot;

        static restore<A extends Actor>(snapshot: SchedulerSnapshot, actorOf: (id: string) => A): Scheduler<A>;
        private sort;
    }

### `Secrets` (class)

    export declare class Secrets {
        private level;
        private revealedKind;
        private discovered;
        constructor(level: Level);

        conceal(x: number, y: number, disguise: number, revealed: number): void;

        isSecret(x: number, y: number): boolean;
        isDiscovered(x: number, y: number): boolean;

        discover(x: number, y: number): boolean;
        toJSON(): {
            revealed: [number, number][];
            discovered: number[];
        };

        static fromJSON(level: Level, data: {
            revealed: [number, number][];
            discovered: number[];
        }): Secrets;
    }

### `selectDistinctCells` (function)

    export declare function selectDistinctCells(candidates: readonly number[], count: number): PlacementResult;

### `Stealth` (class)

    export declare class Stealth {
        private detected;
        private radius;
        constructor(options: StealthOptions);
        get isDetected(): boolean;

        checkDetection(hidden: Step, observers: readonly Step[]): boolean;

        reset(): void;
    }

### `TargetingController` (class)

    export declare class TargetingController {
        readonly onMove: Signal<Step>;
        readonly onConfirm: Signal<TargetResult>;
        readonly onCancel: Signal<void>;
        private readonly level;
        private readonly origin;
        private readonly range;
        private readonly requireLineOfSight;
        private readonly validate?;
        private shape;
        private cursor;
        constructor(level: Level, options: TargetingControllerOptions);

        get target(): Step;

        get distance(): number;
        get inRange(): boolean;
        get inSight(): boolean;

        get valid(): boolean;

        move(dx: number, dy: number): void;

        moveTo(cell: Step): void;

        setShape(shape: AreaShape): void;

        preview(): Step[];

        confirm(): TargetResult | null;

        cancel(): void;
    }

### `traceLine` (function)

    export declare function traceLine(from: Step, to: Step): Step[];

### `TriggerTracker` (class)

    export declare class TriggerTracker {
        private readonly window;
        private streak;
        private lastTurn;
        constructor(window: number);

        get count(): number;

        trigger(turn: number): number;

        isActive(turn: number): boolean;

        reset(): void;
        toJSON(): {
            streak: number;
            lastTurn: number;
        };
        static fromJSON(window: number, data: {
            streak: number;
            lastTurn: number;
        }): TriggerTracker;
    }

### `WALL` (const)

    export declare const WALL: TerrainKind;

## `./rpg`

### `aabbOverlap` (function)

    export declare function aabbOverlap(a: AABB, b: AABB): boolean;

### `activePage` (function)

    export declare function activePage(event: MapEvent, state: GameState): EventPage | undefined;

### `automap` (function)

    export declare function automap(map: AutomapTarget, rules: readonly AutomapRule[], options?: AutomapOptions): number;

### `AUTOMAP_EMPTY` (const)

    export declare const EMPTY = -1;

### `circleAabbOverlap` (function)

    export declare function circleAabbOverlap(circle: Circle, box: AABB): boolean;

### `circleOverlap` (function)

    export declare function circleOverlap(a: Circle, b: Circle): boolean;

### `conditionHolds` (function)

    export declare function conditionHolds(condition: EventCondition, state: GameState): boolean;

### `decodeMarshal` (function)

    export declare function decodeMarshal(bytes: Uint8Array): unknown;

### `encodeMarshal` (function)

    export declare function encodeMarshal(value: unknown): Uint8Array;

### `EventRunner` (class)

    export declare class EventRunner {
        private options;
        readonly state: EventRunnerState;
        private cancelled;
        constructor(options: EventRunnerOptions);
        cancel(): void;
        run(commands: readonly EventCommand[]): Promise<EventRunnerState>;
        private step;
        private speak;
    }

### `FreeMover` (class)

    export declare class FreeMover {
        x: number;
        y: number;

        facing: number;
        private sprite;
        private speed;
        private options;
        private moving;
        constructor(sprite: MovableSprite, x: number, y: number, options?: FreeMoverOptions);
        get isMoving(): boolean;

        move(dx: number, dy: number, dt: number): void;

        turnTo(dx: number, dy: number): void;
        private place;
        private playWalk;
        private playIdle;
    }

### `GameState` (class)

    export declare class GameState {
        private switches;
        private variables;
        switch(name: string): boolean;
        setSwitch(name: string, value: boolean): void;
        variable(name: string): number;
        setVariable(name: string, value: number): void;
        toJSON(): {
            switches: [string, boolean][];
            variables: [string, number][];
        };
        static fromJSON(data: {
            switches: [string, boolean][];
            variables: [string, number][];
        }): GameState;
    }

### `GridMover` (class)

    export declare class GridMover {
        x: number;
        y: number;
        facing: Direction4;
        private sprite;
        private tileWidth;
        private tileHeight;
        private speed;
        private options;
        private fromX;
        private fromY;
        private target;
        private progress;
        constructor(sprite: MovableSprite, x: number, y: number, options: GridMoverOptions);
        get isMoving(): boolean;

        turnTo(dx: number, dy: number): void;

        moveBy(dx: number, dy: number): boolean;
        update(dt: number): void;
        private place;
        private playWalk;
        private playIdle;
    }

### `hashDefaultOf` (function)

    export declare function hashDefaultOf(hash: Map<unknown, unknown>): unknown;

### `QuestLog` (class)

    export declare class QuestLog {
        private definitions;

        private stageIndex;

        private tracked;
        define(quest: QuestDefinition): void;

        track(id: string | null): void;

        trackedQuest(): string | null;

        trackedLocation(): {
            map?: string;
            x: number;
            y: number;
        } | null;

        markerFor(ids: readonly string[], state: GameState): QuestMarker;

        canStart(id: string): boolean;

        start(id: string): void;
        status(id: string): QuestStatus;

        currentStage(id: string): QuestStage | null;

        progress(id: string, state: GameState): number | null;

        advanceStage(id: string, state: GameState): boolean;

        private stageSatisfied;
        private require;
        toJSON(): {
            stageIndex: [string, number][];
            tracked: string | null;
        };

        static fromJSON(definitions: QuestDefinition[], data: {
            stageIndex: [string, number][];
            tracked?: string | null;
        }): QuestLog;
    }

### `questsFromRows` (function)

    export declare function questsFromRows(rows: readonly QuestStageRow[]): QuestDefinition[];

### `resolveAabbAgainstTiles` (function)

    export declare function resolveAabbAgainstTiles(box: AABB, dx: number, dy: number, options: ResolveTileMoveOptions): {
        x: number;

### `RubySymbol` (class)

    export declare class RubySymbol {
        readonly name: string;
        constructor(name: string);
    }

### `withHashDefault` (function)

    export declare function withHashDefault(hash: Map<unknown, unknown>, defaultValue: unknown): Map<unknown, unknown>;

## `./simulation`

### `advanceToInput` (function)

    export declare function advanceToInput<Actor>(rules: TurnRules<Actor>, budget: number): TurnResult<Actor>;

### `Campaign` (class)

    export declare class Campaign<State extends StateValue, Result extends StateValue = StateValue> {
        private readonly levels;
        private _currentLevel;
        private _state;
        private _reminders;
        private _results;
        constructor(options: {
            readonly levels: readonly CampaignLevel<State, Result>[];
            readonly start: string;
            readonly state: State;
        });
        get currentLevel(): string | null;
        get state(): State;
        get reminders(): readonly string[];
        get results(): Readonly<Record<string, Result>>;

        playCurrent(): CampaignLevelResult<State, Result>;
        completeCurrent(result: CampaignLevelResult<State, Result>): CampaignLevelResult<State, Result>;
        snapshot(): CampaignSnapshot<State, Result>;
        static restore<State extends StateValue, Result extends StateValue = StateValue>(snapshot: CampaignSnapshot<State, Result>, options: {
            readonly levels: readonly CampaignLevel<State, Result>[];
        }): Campaign<State, Result>;
    }

### `EventPresentation` (class)

    export declare class EventPresentation<State, Command, Event, A extends Actor> {
        readonly runtime: SimulationRuntime<State, Command, Event, A>;
        readonly queue: PresentationQueue<Event>;
        private readonly followUpOf?;
        private followUps;
        constructor(options: EventPresentationOptions<State, Command, Event, A>);

        get locked(): boolean;

        submit(command: Command): SimulationOutcome<State, Event> | null;

        update(dt: number): void;

        cancel(): void;

        snapshot(version?: number): SimulationSnapshot<State>;

        static restore<State, Command, Event, A extends Actor>(snapshot: SimulationSnapshot<State>, options: {
            play: (event: Event) => number | void;
            followUp?: (outcome: SimulationOutcome<State, Event>) => readonly Command[];
            rule: SimulationRuntimeRule<State, Command, Event, A>;
            actorOf: (id: string) => A;
            actorId: (actor: A) => string;
        }): EventPresentation<State, Command, Event, A>;
        private commit;

        private drainFollowUps;
    }

### `runHeadlessScenario` (function)

    export declare function runHeadlessScenario<State, Command, Event>(scenario: HeadlessScenario<State, Command, Event>): HeadlessScenarioResult<State, Event>;

### `runScenario` (function)

    export declare function runScenario<State, Command, Event, Random>(scenario: Scenario<State, Command, Event, Random>): ScenarioResult<State, Event>;

### `Scheduler` (class)

    export declare class Scheduler<A extends Actor> {
        private entries;
        private sequence;

        now: number;
        get size(): number;
        get actors(): A[];
        has(actor: A): boolean;

        add(actor: A, delay?: number, priority?: number): void;
        remove(actor: A): void;
        clear(): void;

        peek(): A | null;

        spend(cost: number): void;

        postpone(actor: A, delay: number): void;

        timeOf(actor: A): number | null;

        toJSON(actorId: (actor: A) => string): SchedulerSnapshot;

        static restore<A extends Actor>(snapshot: SchedulerSnapshot, actorOf: (id: string) => A): Scheduler<A>;
        private sort;
    }

### `SimulationRuntime` (class)

    export declare class SimulationRuntime<State, Command, Event, A extends Actor> {
        private _state;
        readonly scheduler: Scheduler<A>;
        readonly random: Generator;
        private readonly rule;
        private readonly actorId;
        constructor(options: {
            state: State;
            scheduler: Scheduler<A>;
            random: Generator;
            rule: SimulationRuntimeRule<State, Command, Event, A>;
            actorId: (actor: A) => string;
        });
        get state(): State;

        dispatch(command: Command): SimulationOutcome<State, Event>;
        snapshot(version?: number): SimulationSnapshot<State>;

        static restore<State, Command, Event, A extends Actor>(snapshot: SimulationSnapshot<State>, options: {
            rule: SimulationRuntimeRule<State, Command, Event, A>;
            actorOf: (id: string) => A;
            actorId: (actor: A) => string;
        }): SimulationRuntime<State, Command, Event, A>;
    }

## `./two-d`

### `ActorAnimator` (class)

    export declare class ActorAnimator {
        private sprite;
        private animationName;
        private variant;
        private idleOrMove;
        private inAction;
        constructor(sprite: AnimatedSprite, options: ActorAnimatorOptions);

        get state(): ActorAnimationState;
        get variantName(): string;

        setMoving(moving: boolean, variant?: string): void;

        playAction(variant?: string, restart?: boolean): void;
        private onSpriteFinish;
        private apply;
    }

### `advanceReveal` (function)

    export declare function advanceReveal(state: RevealState, dt: number): boolean;

### `AnimatedSprite` (class)

    export declare class AnimatedSprite extends TintedSprite {
        private animations;
        private current;
        private currentName;
        private elapsed;
        private finished;
        private readonly offset;

        onFinish: ((name: string) => void) | null;
        paused: boolean;
        add(name: string, frames: readonly AnimationFrameInput[], options?: AnimationOptions): this;
        has(name: string): boolean;
        get playing(): string | null;
        get isFinished(): boolean;

        get frameOffset(): {
            readonly x: number;
            readonly y: number;
        };

        get elapsedTime(): number;

        play(name: string, restart?: boolean): this;
        stop(): void;
        update(dt: number): void;
        private show;
    }

### `Animation` (class)

    export declare class Animation {
        readonly frames: readonly AnimationFrame[];

        readonly frameDuration: number;
        readonly loop: boolean;
        readonly startTime: number;

        readonly duration: number;

        private readonly times;
        constructor(frames: readonly AnimationFrameInput[], { fps, loop, startTime }?: AnimationOptions);

        frameAt(seconds: number): AnimationFrame;

        frameIndexAt(seconds: number): number;
    }

### `applyImageModifiers` (function)

    export declare function applyImageModifiers(sprite: Sprite, parsed: ParsedImagePath, scale?: number): void;

### `autotileFrames` (function)

    export declare function autotileFrames(width: number, height: number, sameTerrain: (x: number, y: number) => boolean, frames: readonly number[]): Int32Array;

### `Bar` (class)

    export declare class Bar extends Container {
        private track;
        private fill;
        private width_;
        private height_;
        private explicitColor;
        private fillColor;
        private fraction;
        private readonly fillTexture?;
        private readonly backgroundTexture?;
        private readonly background_?;
        private readonly roundUpToPixel;
        private readonly themeListener;
        constructor(options: BarOptions);

        get value(): number;
        setValue(value: number, max?: number): void;

        get color(): number;

        setColor(color: number): void;

        get background(): number;
        resize(width: number, height: number): void;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `BitmapLabel` (class)

    export declare class BitmapLabel extends BitmapText {
        private readonly opts;
        private readonly themeListener;
        constructor(options?: BitmapLabelOptions | string);

        setText(value: string): void;

        private restyle;
        destroy(options?: Parameters<BitmapText['destroy']>[0]): void;
    }

### `bitmapLabelStyle` (function)

    export declare function bitmapLabelStyle(opts: BitmapLabelOptions, t: Theme): TextStyleOptions;

### `BLOB_SHAPES` (const)

    export declare const BLOB_SHAPES: readonly NeighborMask[];

### `blobIndex` (function)

    export declare function blobIndex(neighbors: NeighborMask): number;

### `Button` (class)

    export declare class Button extends Container {
        readonly onClick: Signal<void>;
        readonly onPress: Signal<void>;
        readonly onRelease: Signal<void>;
        private readonly skin?;
        private readonly labelOptions;
        private background;
        private labelText;
        private icon;
        private width_;
        private height_;
        private state;
        private disabled_;
        private readonly themeListener;
        constructor(options: ButtonOptions);

        private static createBackground;

        resize(width: number, height: number): void;
        setText(text: string | undefined): void;
        get disabled(): boolean;
        setDisabled(disabled: boolean): void;
        private setState;

        private layoutContent;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `Camera` (class)

    export declare class Camera {

        readonly world: Container<import("pixi.js").ContainerChild>;

        x: number;
        y: number;
        private _zoom;
        private deadzone;
        private readonly pixelPerfectTileSize?;
        private viewWidth;
        private viewHeight;
        private screenX;
        private screenY;
        private followTarget;
        private followIntensity;
        private shakeMagnitude;
        private shakeRemaining;
        private shakeDuration;
        private shakeX;
        private shakeY;

        private bounds;
        constructor(options?: CameraOptions);
        get zoom(): number;
        set zoom(value: number);

        setViewport(width: number, height: number, screenX?: number, screenY?: number): void;

        get view(): {
            x: number;
            y: number;
            width: number;
            height: number;
        };

        setBounds(bounds: {
            minX: number;
            minY: number;
            maxX: number;
            maxY: number;
        } | null): void;

        snapTo(x: number, y: number): void;

        panTo(x: number, y: number, intensity?: number): void;

        follow(target: {
            x: number;
            y: number;
        }, intensity?: number): void;
        stopFollowing(): void;

        shake(magnitude: number, duration?: number): void;
        update(dt: number): void;

        toScreen(x: number, y: number): {
            x: number;
            y: number;
        };

        toWorld(x: number, y: number): {
            x: number;
            y: number;
        };
        private clampedCentre;
        private apply;
    }

### `COLOR_BLINDNESS_MATRICES` (const)

    export declare const COLOR_BLINDNESS_MATRICES: Record<ColorBlindnessType, ColorMatrix>;

### `colorShiftMatrix` (function)

    export declare function colorShiftMatrix(red: number, green: number, blue: number): ColorMatrixFilter['matrix'];

### `ColorTransformBatcher` (class)

    export declare class ColorTransformBatcher extends Batcher {

        static extension: {
            readonly type: readonly [ExtensionType.Batcher];
            readonly name: 'mwg-color-transform';
        };
        geometry: Geometry;
        shader: Shader;
        name: "mwg-color-transform";
        vertexSize: number;
        constructor(options: BatcherOptions);
        packAttributes(element: MeshElement, float32View: Float32Array, uint32View: Uint32Array, index: number, textureId: number): void;
        packQuadAttributes(element: QuadElement, float32View: Float32Array, uint32View: Uint32Array, index: number, textureId: number): void;

        _updateMaxTextures(maxTextures: number): void;
        destroy(): void;
    }

### `completeReveal` (function)

    export declare function completeReveal(state: RevealState): void;

### `Container2D` (export)

    export { Container2D }

### `contrastRatio` (function)

    export declare function contrastRatio(a: number, b: number): number;

### `createCamera` (function)

    export declare function createCamera(options?: CameraOptions): Camera;

### `createColorBlindnessFilter` (function)

    export declare function createColorBlindnessFilter(type: ColorBlindnessType): ColorMatrixFilter;

### `croppedTexture` (function)

    export declare function croppedTexture(texture: Texture, parsed: ParsedImagePath): Texture;

### `defaultTheme` (const)

    export declare const defaultTheme: Theme;

### `detectWebGpu` (function)

    export declare function detectWebGpu(): Promise<WebGpuDetection>;

### `DialogueStage` (class)

    export declare class DialogueStage extends Container {
        private backdropLayer;
        private actorLayer;
        private backdrop;
        private outgoingBackdrop;
        private actors;
        private definitions;
        private focused;
        private stageWidth;
        private stageHeight;
        private tweener;

        dimAmount: number;
        constructor(width: number, height: number);

        defineCharacter(id: string, definition: CharacterDefinition): void;
        resize(width: number, height: number): void;

        setBackdrop(texture: Texture, fade?: number): Promise<void>;
        private fitBackdrop;
        show(id: string, options?: ShowOptions): Promise<void>;
        hide(id: string, fade?: number): Promise<void>;
        hideAll(fade?: number): Promise<void>;
        setExpression(id: string, expression: string): void;

        focus(id: string | null): void;
        private applyFocus;
        private slotOf;
        private placeActor;
        update(dt: number): void;

        get isBusy(): boolean;
    }

### `EMPTY` (const)

    export declare const EMPTY = -1;

### `escapeHtml` (function)

    export declare function escapeHtml(text: string): string;

### `FLOATING_TEXT_STACK_GAP` (const)

    export declare const FLOATING_TEXT_STACK_GAP = 4;

### `FloatingText` (class)

    export declare class FloatingText extends Container {
        private readonly duration;
        private readonly rise;
        private readonly hold;

        private readonly rising;
        private elapsed;
        private done;
        constructor(options: FloatingTextOptions);

        get finished(): boolean;

        get riseOffset(): number;

        ageAtLeast(seconds: number): void;

        update(dt: number): void;
    }

### `floatingTextAgeAtLeast` (function)

    export declare function floatingTextAgeAtLeast(elapsed: number, duration: number, atLeast: number): number;

### `floatingTextAlpha` (function)

    export declare function floatingTextAlpha(t: number, hold: number): number;

### `floatingTextRise` (function)

    export declare function floatingTextRise(t: number, rise: number, reduce?: boolean): number;

### `FloatingTextStack` (class)

    export declare class FloatingTextStack extends Container {
        private readonly live;

        push(options: FloatingTextPush): FloatingText;

        update(dt: number): void;

        get count(): number;

        clear(): void;
    }

### `floatingTextStackLifePenalty` (function)

    export declare function floatingTextStackLifePenalty(linesBelow: number): number;

### `floatingTextStackLift` (function)

    export declare function floatingTextStackLift(older: FloatingTextStackEntry, below: FloatingTextStackEntry, gap?: number): number;

### `floatingTextStackMoves` (function)

    export declare function floatingTextStackMoves(live: readonly FloatingTextStackEntry[], incoming: FloatingTextStackEntry, gap?: number): FloatingTextStackMove[];

### `Game` (class)

    export declare class Game {
        private static instance;
        readonly app: Application<import("pixi.js").Renderer>;

        elapsed: number;

        timeTotal: number;

        timeScale: number;

        readonly onFrame: Signal<number>;
        private hitStopRemaining;
        private hitStopScale;
        private stack;
        private pending;
        private options;
        private started;
        private stopWatchingDpr;
        constructor(options?: GameOptions);

        get width(): number;
        get height(): number;

        static get current(): Game;
        start(first: SceneClass<Scene2D>): Promise<void>;

        switchScene(next: SceneClass<Scene2D>): void;

        pushScene(next: SceneClass<Scene2D>): void;

        popScene(result?: unknown): void;

        get currentScene(): Scene2D | null;

        hitStop(duration: number, scale?: number): void;

        step(dt: number): void;

        private expose;
        private frame;
        private switchNow;

        private applySwitch;

        private applyPush;

        private applyPop;
        destroy(): void;
    }

### `Gradient` (const)

    export declare const Gradient: typeof FillGradient;

### `Halo` (class)

    export declare class Halo extends AnimatedSprite {
        private readonly offsetX;
        private readonly offsetY;
        constructor(options: HaloOptions);

        follow(x: number, y: number): this;
    }

### `HALO_ANIMATION` (const)

    export declare const HALO_ANIMATION = "halo";

### `HelpScreen` (class)

    export declare class HelpScreen extends Container {
        private list;
        private body;
        private topics;
        constructor(options: HelpScreenOptions);
        private showBody;

        handleAction(action: Action): boolean;
    }

### `highContrastTheme` (const)

    export declare const highContrastTheme: Theme;

### `IconGrid` (class)

    export declare class IconGrid extends Container {
        private readonly selection;
        private cells;
        private cellsLayer;
        private highlight;
        private pickupHighlight;
        private mask_;
        private viewWidth;
        private viewHeight;
        private columns;
        private cellSize;
        private longPressDuration;
        private scrollRow;

        private pickedUp;
        private pressedIndex;
        private pressTimer;
        onSelect: ((item: IconGridItem, index: number) => void) | null;
        onHighlight: ((item: IconGridItem, index: number) => void) | null;
        onQuickslot: ((item: IconGridItem, index: number) => void) | null;
        onReorder: ((fromIndex: number, toIndex: number) => void) | null;

        private readonly themeListener;

        private columnX;
        constructor(options: IconGridOptions);
        destroy(options?: Parameters<Container['destroy']>[0]): void;
        private drawMask;
        get visibleRows(): number;
        get rows(): number;
        get selectedIndex(): number;
        get selected(): IconGridItem | null;
        get length(): number;
        setItems(items: IconGridItem[]): void;
        private releaseCell;
        resize(width: number, height: number): void;

        update(dt: number): void;

        tapCell(index: number): void;

        private swapCells;

        cancelPickup(): void;

        move(dx: number, dy: number): boolean;
        select(index: number): void;
        confirm(): boolean;

        handleAction(action: Action): boolean;

        private cellRect;
        private refresh;
    }

### `imageModifier` (function)

    export declare function imageModifier(path: ParsedImagePath, name: string): ImageModifier | undefined;

### `importTwee` (function)

    export declare function importTwee(source: string): TwineStory;

### `inspectGraphicsCapabilities` (function)

    export declare function inspectGraphicsCapabilities(probe?: GraphicsProbe): GraphicsCapabilities;

### `Label` (class)

    export declare class Label extends Text {
        private readonly opts;
        private readonly themeListener;
        private revealSource;
        private reveal;
        constructor(options?: LabelOptions | string);

        setColor(color: number): void;

        setText(value: string): void;

        showProgressive(value: string, speed?: number): void;

        updateReveal(dt: number): boolean;

        completeReveal(): void;
        private renderRevealed;

        private restyle;
        destroy(options?: Parameters<Text['destroy']>[0]): void;
    }

### `LayeredSprite` (class)

    export declare class LayeredSprite extends Container {
        private layers;

        addLayer(name: string, texture: Texture2D, order?: number): TintedSprite;
        removeLayer(name: string): void;
        layer(name: string): TintedSprite | undefined;
        hasLayer(name: string): boolean;

        setTexture(name: string, texture: Texture2D): void;
        private resort;
    }

### `layoutVertical` (function)

    export declare function layoutVertical(text: string, options: VerticalLayoutOptions): GlyphLayout[];

### `ListView` (class)

    export declare class ListView extends Container {
        private readonly selection;
        private rows;
        private rowsLayer;
        private highlight;
        private mask_;
        private viewWidth;
        private viewHeight;
        private rowHeight;
        private readonly explicitRowHeight;
        private scroll;
        private readonly themeListener;
        onSelect: ((item: ListItem, index: number) => void) | null;
        onHighlight: ((item: ListItem, index: number) => void) | null;
        constructor(options: ListViewOptions);

        private restyle;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
        private drawMask;
        get visibleRows(): number;
        get selectedIndex(): number;
        get selected(): ListItem | null;
        get length(): number;
        setItems(items: ListItem[]): void;
        resize(width: number, height: number): void;

        move(delta: number): boolean;
        select(index: number): void;
        confirm(): boolean;

        handleAction(action: Action): boolean;
        private refresh;
    }

### `LoadingScreen` (class)

    export declare class LoadingScreen extends Container {
        private readonly backdrop;
        private readonly title;
        private readonly status;
        private readonly progress;
        private readonly onRetry?;
        private readonly onCancel?;
        private width_;
        private height_;
        constructor(options: LoadingScreenOptions);
        setSnapshot(snapshot: LoadSnapshot): void;

        bind(queue: LoadQueue): () => void;

        retry(): void;

        cancel(): void;
        resize(width: number, height: number): void;
        private layout;
    }

### `loadTiledMap` (function)

    export declare function loadTiledMap(data: TiledMapData, sheets: SpriteSheet | TilesetSheet[]): LoadedTiledMap;

### `markupToHtml` (function)

    export declare function markupToHtml(spans: readonly MarkupSpan[]): string;

### `meetsContrast` (function)

    export declare function meetsContrast(foreground: number, background: number, level?: ContrastLevel, large?: boolean): boolean;

### `MessageBox` (class)

    export declare class MessageBox extends Window {
        private pages;
        private pageIndex;
        private speed;
        private reveal;
        private pageText;
        private pageCues;
        private nextCue;
        private mode;
        private body;
        private speakerLabel;
        private portrait;
        private portraitLayer;
        private prompt;
        private choices;
        private choiceList;
        private onDone;
        private onSound;
        private finished;
        private autoAdvance?;
        private autoAdvanceElapsed;
        private announce;
        private readonly messageThemeListener;
        constructor(options: MessageBoxOptions);

        private restyleMessage;
        destroy(options?: Parameters<Window['destroy']>[0]): void;
        private showPage;

        private renderBody;
        private formatLine;
        private playRevealedSounds;
        private get pageComplete();
        update(dt: number): void;
        handleAction(action: Action): boolean;

        private advance;
        private showChoices;

        private grow;
        private finish;
    }

### `messageBoxPresenter` (function)

    export declare function messageBoxPresenter(windows: WindowStack, options?: MessageBoxPresenterOptions): DialoguePresenter;

### `Minimap` (class)

    export declare class Minimap extends Container {
        private readonly widthInCells;
        private readonly cellSize;
        private readonly shape;
        private renderTexture;
        private sprite;
        private drawn;
        private marker;
        constructor(options: MinimapOptions);

        get exploredCount(): number;

        sync(explored: ReadonlySet<number>, colorFor: (x: number, y: number) => number): void;

        setMarker(x: number, y: number, facing?: number, color?: number): void;

        setMarkers(markers: readonly MinimapMarker[]): void;

        reset(): void;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `minimapCellCenter` (function)

    export declare function minimapCellCenter(x: number, y: number, cellSize: number, shape?: 'square' | 'hex'): {
        x: number;

### `newlyRevealed` (function)

    export declare function newlyRevealed(explored: ReadonlySet<number>, alreadyDrawn: ReadonlySet<number>): number[];

### `NinePatch` (class)

    export declare class NinePatch extends Container {
        private sprite;
        constructor(texture: Texture2D, options: NinePatchOptions);

        get border(): {
            left: number;
            top: number;
            right: number;
            bottom: number;
        };
        resize(width: number, height: number): void;
    }

### `NO_COLOR_ADD` (const)

    export declare const NO_COLOR_ADD = 0;

### `Node2D` (class)

    export declare class Node2D extends Container {
    }

### `packColorAdd` (function)

    export declare function packColorAdd(r: number, g: number, b: number, a?: number): number;

### `packTintAdd` (function)

    export declare function packTintAdd(color: number, strength: number): number;

### `parseImagePath` (function)

    export declare function parseImagePath(value: string): ParsedImagePath;

### `parseMarkdown` (function)

    export declare function parseMarkdown(text: string): MarkdownSpan[];

### `parseMarkup` (function)

    export declare function parseMarkup(source: string, options?: MarkupOptions): MarkupSpan[];

### `ParticleEmitter` (class)

    export declare class ParticleEmitter extends Container {
        private readonly pool;
        private readonly sprites;
        private readonly rate;
        private readonly life;
        private readonly speed;
        private readonly angleRange;
        private readonly gravityX;
        private readonly gravityY;
        private readonly scaleRange;
        private readonly alphaRange;
        private readonly spin;

        private readonly frames?;

        private readonly spawnArea;
        private emitting;

        private poolCursor;

        private debt;
        constructor(options?: ParticleEmitterOptions);

        start(): void;

        stop(): void;
        get isEmitting(): boolean;

        get activeCount(): number;

        get particles(): readonly Particle[];

        burst(count: number): number;
        private spawn;

        private spawnOffset;
        update(dt: number): void;

        private draw;

        clear(): void;
    }

### `Projectile` (class)

    export declare class Projectile {
        private sprite;
        private fromX;
        private fromY;
        private toX;
        private toY;
        private duration;
        private elapsed;
        private arrived;
        constructor(sprite: ProjectilePoint, from: ProjectilePoint, to: ProjectilePoint, options?: ProjectileOptions);
        get done(): boolean;

        get progress(): number;

        update(dt: number): boolean;
    }

### `RebindScreen` (class)

    export declare class RebindScreen extends Container {
        private list;
        private actions;
        private labelFor;
        private onConflict;
        private capturing;
        private onKeyCaptured;
        constructor(options: RebindScreenOptions);
        private rows;
        private rowText;
        private refresh;
        private startCapture;
        private cancelCapture;
        private finishCapture;

        get isCapturing(): boolean;

        handleAction(action: Action): boolean;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `Rectangle2D` (export)

    export { Rectangle2D }

### `rectOf` (function)

    export declare function rectOf(rectangle: Rectangle): Rect;

### `registerColorTransform` (function)

    export declare function registerColorTransform(): void;

### `relativeLuminance` (function)

    export declare function relativeLuminance(color: number): number;

### `RENDERING_DECISIONS` (const)

    export declare const RENDERING_DECISIONS: readonly RenderingDecision[];

### `revealComplete` (function)

    export declare function revealComplete(state: RevealState): boolean;

### `RichLabel` (class)

    export declare class RichLabel extends HTMLText {
        private readonly opts;
        private readonly themeListener;
        private revealSpans;
        private reveal;
        constructor(options?: RichLabelOptions | string);

        setText(value: string): void;

        showProgressive(value: string, speed?: number): void;

        updateReveal(dt: number): boolean;

        completeReveal(): void;
        private renderRevealed;

        private restyle;
        destroy(options?: Parameters<HTMLText['destroy']>[0]): void;
    }

### `Scene2D` (class)

    export declare abstract class Scene2D extends Scene {

        readonly stage: Container2D;
        protected teardown(): void;
    }

### `ScreenEffects` (class)

    export declare class ScreenEffects extends Container {
        private readonly overlay;
        private readonly defaultColor;
        private viewWidth;
        private viewHeight;
        private phase;
        private elapsed;
        private duration;

        private fromAlpha;
        private toAlpha;
        constructor(options?: ScreenEffectsOptions);

        setViewport(width: number, height: number): void;
        private redraw;

        get isBusy(): boolean;

        get washAlpha(): number;

        fadeOut(duration: number, color?: number): void;

        fadeIn(duration: number, color?: number): void;

        flash(duration: number, color?: number, peak?: number): void;

        setTint(color: number, alpha: number): void;

        clear(): void;
        private begin;

        update(dt: number): boolean;
    }

### `screenReader` (const)

    export declare const screenReader: ScreenReader;

### `ScreenReader` (class)

    export declare class ScreenReader {
        private polite;
        private assertive;
        private region;

        announce(text: string, options?: {
            assertive?: boolean;
        }): void;

        clear(): void;

        destroy(): void;
    }

### `setTheme` (function)

    export declare function setTheme(next: Partial<Theme>): void;

### `Shape2D` (class)

    export declare class Shape2D extends Graphics {
    }

### `sliceSpans` (function)

    export declare function sliceSpans(spans: readonly MarkdownSpan[], count: number): MarkdownSpan[];

### `snapZoom` (function)

    export declare function snapZoom(zoom: number, tileSize: number): number;

### `splitScreenHalves` (function)

    export declare function splitScreenHalves(width: number, height: number): [{
        x: number;

### `Sprite2D` (class)

    export declare class Sprite2D extends Sprite {
    }

### `SpriteSheet` (class)

    export declare class SpriteSheet {
        readonly texture: Texture2D;
        readonly frameWidth: number;
        readonly frameHeight: number;
        readonly columns: number;
        readonly rows: number;
        private frames;
        private names;
        private constructor();

        static grid(path: string, frameWidth: number, frameHeight?: number): SpriteSheet;
        static fromTexture(texture: Texture2D, frameWidth: number, frameHeight?: number): SpriteSheet;
        get count(): number;

        name(name: string, index: number): this;

        nameAll(names: Readonly<Record<string, number>>): this;
        indexOf(name: string): number;
        get(frame: number | string): Texture2D;

        region(frame: number | string): TextureRegion;

        range(from: number, to: number): Texture2D[];

        pick(...frames: Array<number | string>): Texture2D[];
    }

### `StageScript` (class)

    export declare class StageScript {
        private options;
        readonly state: ScriptState;
        private cancelled;
        private historyLog;
        private seenLines;

        skipSeen: boolean;
        constructor(options: ScriptOptions);
        cancel(): void;

        get history(): readonly HistoryEntry[];

        showLast(): Promise<boolean>;
        run(commands: readonly StageCommand[]): Promise<ScriptState>;

        runStory(story: StoryScript, start: string): Promise<ScriptState>;

        private step;
        private recordHistory;

        protected speak(text: string, as: string | undefined, speaker?: string, choices?: Choice[]): Promise<unknown>;
    }

### `startReveal` (function)

    export declare function startReveal(total: number, speed?: number): RevealState;

### `StatsScreen` (class)

    export declare class StatsScreen extends Container {
        private text;
        constructor(options: StatsScreenOptions);

        setStats(stats: readonly StatRow[], width?: number): void;
        private static format;
    }

### `StatusVisuals` (class)

    export declare class StatusVisuals {
        private target;
        private styles;

        private priority;
        private active;
        private elapsed;
        constructor(target: TintTarget, options: StatusVisualsOptions);

        set(kind: string, active: boolean): void;
        has(kind: string): boolean;

        update(dt: number): void;
    }

### `stripMarkdown` (function)

    export declare function stripMarkdown(text: string): string;

### `stripMarkup` (function)

    export declare function stripMarkup(source: string, options?: MarkupOptions): string;

### `TabbedList` (class)

    export declare class TabbedList<T> {

        readonly onChange: Signal<void>;
        private readonly tabList;
        private readonly rowsFor;
        private readonly pageSize;
        private readonly labelOf;
        private readonly filterOf;
        private readonly disabledOf;
        private currentTabIndex;
        private currentQuery;
        private rows_;
        private currentSelectedIndex;
        private detail;
        constructor(options: TabbedListOptions<T>);

        get tabs(): readonly ListTab[];

        get tab(): ListTab;
        get query(): string;

        get rows(): readonly T[];

        get pageCount(): number;

        get page(): number;

        get pageRows(): readonly T[];

        get selectedIndex(): number;
        get selected(): T | null;

        get detailOpen(): boolean;

        selectTab(id: string): void;

        nextTab(delta?: number): void;

        setQuery(query: string): void;

        move(delta: number): void;

        setPage(page: number): void;

        nextPage(delta: number): void;

        openDetail(): boolean;
        closeDetail(): void;

        private firstSelectableOnPage;
        private firstSelectable;

        private recompute;
        private emit;
    }

### `Text2D` (class)

    export declare class Text2D extends Text {
    }

### `Texture2D` (export)

    export { Texture2D }

### `theme` (function)

    export declare function theme(): Theme;

### `themeChanged` (const)

    export declare const themeChanged: Signal<Theme>;

### `TiledSprite` (class)

    export declare class TiledSprite extends TilingSprite {
    }

### `tileFrame` (function)

    export declare function tileFrame(sheet: number, frame: number): number;

### `tileFrameIndex` (function)

    export declare function tileFrameIndex(packed: number): number;

### `tileFrameSheet` (function)

    export declare function tileFrameSheet(packed: number): number;

### `TileMap` (class)

    export declare class TileMap extends Container {
        readonly widthInTiles: number;
        readonly heightInTiles: number;
        readonly tileWidth: number;
        readonly tileHeight: number;
        readonly shape: 'square' | 'hex' | 'isometric' | 'staggered';

        readonly heightStep: number;
        private sheets;
        private layers;
        private layersByName;
        private chunkSize;
        private chunkColumns;
        private chunkRows;
        private chunks;
        private cellTint;
        private cellAdd;
        private cellHeight;
        private faces;
        constructor(options: TileMapOptions);
        get layerCount(): number;

        get worldWidth(): number;
        get worldHeight(): number;
        inside(x: number, y: number): boolean;
        private index;

        addLayer(name: string, data?: ArrayLike<number>): this;
        private layerAt;
        private chunkIndex;

        private projectedCenter;

        private projectedTile;

        private cellOrigin;

        private textureFor;
        private buildSprite;
        getTile(layer: string | number, x: number, y: number): number;
        setTile(layer: string | number, x: number, y: number, frame: number): void;

        setLayerData(layer: string | number, data: ArrayLike<number>): void;

        setCellColor(x: number, y: number, tint: number, add?: number): void;
        getCellTint(x: number, y: number): number;

        clearColors(): void;

        setCellHeight(x: number, y: number, height: number): void;

        getCellHeight(x: number, y: number): number;

        get faceCount(): number;

        private syncFaces;

        private drawFaces;

        toTile(worldX: number, worldY: number): {
            x: number;
            y: number;
        };

        tileCenter(x: number, y: number): {
            x: number;
            y: number;
        };

        cull(camera: Camera): void;

        get visibleChunks(): number;
    }

### `TintedSprite` (class)

    export declare class TintedSprite extends Sprite {
        private _colorAdd;
        constructor(options?: SpriteOptions | Texture2D);

        get colorAdd(): number;
        set colorAdd(value: number);

        setColorAdd(r: number, g: number, b: number, a?: number): void;

        lerpTint(color: number, strength: number): void;

        silhouette(color: number): void;

        resetColor(): void;
    }

### `Toast` (class)

    export declare class Toast extends Container {
        private readonly fadeIn;
        private readonly hold;
        private readonly fadeOut;
        private readonly scaleFrom;
        private queue;
        private current;
        private phase;
        private elapsed;
        constructor(options?: ToastOptions);

        show(content: Container2D): void;

        get isBusy(): boolean;
        private start;
        update(dt: number): void;
        private advance;
        private finish;
    }

### `Tooltip` (class)

    export declare class Tooltip extends Container {
        private readonly delay;
        private readonly maxWidth;
        private readonly offsetX;
        private readonly offsetY;
        private readonly margin;
        private readonly panel;
        private readonly body;
        private viewWidth;
        private viewHeight;

        private panelWidth;
        private panelHeight;
        private pending;
        private waited;
        constructor(options?: TooltipOptions);

        setViewport(width: number, height: number): void;

        hover(text: string, x: number, y: number): void;

        leave(): void;
        get isShowing(): boolean;

        get text(): string | null;

        get panelPosition(): {
            x: number;
            y: number;
        };
        get size(): {
            width: number;
            height: number;
        };

        update(dt: number): boolean;

        protected measureBody(): {
            width: number;
            height: number;
        };

        private place;
    }

### `VerticalLabel` (class)

    export declare class VerticalLabel extends Container {
        private readonly opts;
        private readonly themeListener;
        constructor(options: VerticalLabelOptions);

        private build;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `Viewport` (class)

    export declare class Viewport {
        readonly camera: Camera;

        readonly container: Container<import("pixi.js").ContainerChild>;
        private readonly clip;
        constructor(options: ViewportOptions);

        resize(x: number, y: number, width: number, height: number): void;
        update(dt: number): void;
    }

### `Window` (class)

    export declare class Window extends Container {
        readonly content: Container<import("pixi.js").ContainerChild>;
        readonly onClose: Signal<void>;
        readonly modal: boolean;
        readonly closable: boolean;
        readonly dims: boolean;
        readonly anchor: 'center' | 'bottom' | 'top';
        private background;
        private titleLabel;
        private innerWidth;
        private innerHeight;
        private currentWidth;
        private currentHeight;
        private readonly themeListener;
        constructor(options: WindowOptions);

        private restyle;
        resize(width: number, height: number): void;

        get contentWidth(): number;
        get contentHeight(): number;
        setTitle(text: string): void;

        delegate: {
            handleAction(action: Action): boolean;
        } | null;

        handleAction(action: Action): boolean;

        update(_dt: number): void;
        close(): void;

        place(viewportWidth: number, viewportHeight: number): void;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `WindowStack` (class)

    export declare class WindowStack extends Container {
        private windows;
        private overlay;
        private viewportWidth;
        private viewportHeight;
        private listener;
        private readonly themeListener;
        constructor();
        setViewport(width: number, height: number): void;
        get top(): Window | null;
        get isEmpty(): boolean;
        get depth(): number;

        push(window: Window): Window;

        pop(): void;
        closeAll(): void;
        private forget;
        private updateOverlay;
        private drawOverlay;

        private handleAction;

        get blocksWorld(): boolean;
        update(dt: number): void;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

## `./two-d/pixi-interop`

### `Container` (re-export)

    export { Container } from 'pixi.js'

### `Graphics` (re-export)

    export { Graphics } from 'pixi.js'

### `Rectangle` (re-export)

    export { Rectangle } from 'pixi.js'

### `Sprite` (re-export)

    export { Sprite } from 'pixi.js'

### `Text` (re-export)

    export { Text } from 'pixi.js'

### `Texture` (re-export)

    export { Texture } from 'pixi.js'

## `./two-d/render`

### `ActorAnimator` (class)

    export declare class ActorAnimator {
        private sprite;
        private animationName;
        private variant;
        private idleOrMove;
        private inAction;
        constructor(sprite: AnimatedSprite, options: ActorAnimatorOptions);

        get state(): ActorAnimationState;
        get variantName(): string;

        setMoving(moving: boolean, variant?: string): void;

        playAction(variant?: string, restart?: boolean): void;
        private onSpriteFinish;
        private apply;
    }

### `AnimatedSprite` (class)

    export declare class AnimatedSprite extends TintedSprite {
        private animations;
        private current;
        private currentName;
        private elapsed;
        private finished;
        private readonly offset;

        onFinish: ((name: string) => void) | null;
        paused: boolean;
        add(name: string, frames: readonly AnimationFrameInput[], options?: AnimationOptions): this;
        has(name: string): boolean;
        get playing(): string | null;
        get isFinished(): boolean;

        get frameOffset(): {
            readonly x: number;
            readonly y: number;
        };

        get elapsedTime(): number;

        play(name: string, restart?: boolean): this;
        stop(): void;
        update(dt: number): void;
        private show;
    }

### `Animation` (class)

    export declare class Animation {
        readonly frames: readonly AnimationFrame[];

        readonly frameDuration: number;
        readonly loop: boolean;
        readonly startTime: number;

        readonly duration: number;

        private readonly times;
        constructor(frames: readonly AnimationFrameInput[], { fps, loop, startTime }?: AnimationOptions);

        frameAt(seconds: number): AnimationFrame;

        frameIndexAt(seconds: number): number;
    }

### `applyImageModifiers` (function)

    export declare function applyImageModifiers(sprite: Sprite, parsed: ParsedImagePath, scale?: number): void;

### `autotileFrames` (function)

    export declare function autotileFrames(width: number, height: number, sameTerrain: (x: number, y: number) => boolean, frames: readonly number[]): Int32Array;

### `BLOB_SHAPES` (const)

    export declare const BLOB_SHAPES: readonly NeighborMask[];

### `blobIndex` (function)

    export declare function blobIndex(neighbors: NeighborMask): number;

### `Camera` (class)

    export declare class Camera {

        readonly world: Container<import("pixi.js").ContainerChild>;

        x: number;
        y: number;
        private _zoom;
        private deadzone;
        private readonly pixelPerfectTileSize?;
        private viewWidth;
        private viewHeight;
        private screenX;
        private screenY;
        private followTarget;
        private followIntensity;
        private shakeMagnitude;
        private shakeRemaining;
        private shakeDuration;
        private shakeX;
        private shakeY;

        private bounds;
        constructor(options?: CameraOptions);
        get zoom(): number;
        set zoom(value: number);

        setViewport(width: number, height: number, screenX?: number, screenY?: number): void;

        get view(): {
            x: number;
            y: number;
            width: number;
            height: number;
        };

        setBounds(bounds: {
            minX: number;
            minY: number;
            maxX: number;
            maxY: number;
        } | null): void;

        snapTo(x: number, y: number): void;

        panTo(x: number, y: number, intensity?: number): void;

        follow(target: {
            x: number;
            y: number;
        }, intensity?: number): void;
        stopFollowing(): void;

        shake(magnitude: number, duration?: number): void;
        update(dt: number): void;

        toScreen(x: number, y: number): {
            x: number;
            y: number;
        };

        toWorld(x: number, y: number): {
            x: number;
            y: number;
        };
        private clampedCentre;
        private apply;
    }

### `COLOR_BLINDNESS_MATRICES` (const)

    export declare const COLOR_BLINDNESS_MATRICES: Record<ColorBlindnessType, ColorMatrix>;

### `colorShiftMatrix` (function)

    export declare function colorShiftMatrix(red: number, green: number, blue: number): ColorMatrixFilter['matrix'];

### `ColorTransformBatcher` (class)

    export declare class ColorTransformBatcher extends Batcher {

        static extension: {
            readonly type: readonly [ExtensionType.Batcher];
            readonly name: 'mwg-color-transform';
        };
        geometry: Geometry;
        shader: Shader;
        name: "mwg-color-transform";
        vertexSize: number;
        constructor(options: BatcherOptions);
        packAttributes(element: MeshElement, float32View: Float32Array, uint32View: Uint32Array, index: number, textureId: number): void;
        packQuadAttributes(element: QuadElement, float32View: Float32Array, uint32View: Uint32Array, index: number, textureId: number): void;

        _updateMaxTextures(maxTextures: number): void;
        destroy(): void;
    }

### `Container2D` (export)

    export { Container2D }

### `createCamera` (function)

    export declare function createCamera(options?: CameraOptions): Camera;

### `createColorBlindnessFilter` (function)

    export declare function createColorBlindnessFilter(type: ColorBlindnessType): ColorMatrixFilter;

### `croppedTexture` (function)

    export declare function croppedTexture(texture: Texture, parsed: ParsedImagePath): Texture;

### `detectWebGpu` (function)

    export declare function detectWebGpu(): Promise<WebGpuDetection>;

### `EMPTY` (const)

    export declare const EMPTY = -1;

### `Gradient` (const)

    export declare const Gradient: typeof FillGradient;

### `Halo` (class)

    export declare class Halo extends AnimatedSprite {
        private readonly offsetX;
        private readonly offsetY;
        constructor(options: HaloOptions);

        follow(x: number, y: number): this;
    }

### `HALO_ANIMATION` (const)

    export declare const HALO_ANIMATION = "halo";

### `imageModifier` (function)

    export declare function imageModifier(path: ParsedImagePath, name: string): ImageModifier | undefined;

### `inspectGraphicsCapabilities` (function)

    export declare function inspectGraphicsCapabilities(probe?: GraphicsProbe): GraphicsCapabilities;

### `LayeredSprite` (class)

    export declare class LayeredSprite extends Container {
        private layers;

        addLayer(name: string, texture: Texture2D, order?: number): TintedSprite;
        removeLayer(name: string): void;
        layer(name: string): TintedSprite | undefined;
        hasLayer(name: string): boolean;

        setTexture(name: string, texture: Texture2D): void;
        private resort;
    }

### `loadTiledMap` (function)

    export declare function loadTiledMap(data: TiledMapData, sheets: SpriteSheet | TilesetSheet[]): LoadedTiledMap;

### `Minimap` (class)

    export declare class Minimap extends Container {
        private readonly widthInCells;
        private readonly cellSize;
        private readonly shape;
        private renderTexture;
        private sprite;
        private drawn;
        private marker;
        constructor(options: MinimapOptions);

        get exploredCount(): number;

        sync(explored: ReadonlySet<number>, colorFor: (x: number, y: number) => number): void;

        setMarker(x: number, y: number, facing?: number, color?: number): void;

        setMarkers(markers: readonly MinimapMarker[]): void;

        reset(): void;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `minimapCellCenter` (function)

    export declare function minimapCellCenter(x: number, y: number, cellSize: number, shape?: 'square' | 'hex'): {
        x: number;

### `newlyRevealed` (function)

    export declare function newlyRevealed(explored: ReadonlySet<number>, alreadyDrawn: ReadonlySet<number>): number[];

### `NO_COLOR_ADD` (const)

    export declare const NO_COLOR_ADD = 0;

### `Node2D` (class)

    export declare class Node2D extends Container {
    }

### `packColorAdd` (function)

    export declare function packColorAdd(r: number, g: number, b: number, a?: number): number;

### `packTintAdd` (function)

    export declare function packTintAdd(color: number, strength: number): number;

### `parseImagePath` (function)

    export declare function parseImagePath(value: string): ParsedImagePath;

### `ParticleEmitter` (class)

    export declare class ParticleEmitter extends Container {
        private readonly pool;
        private readonly sprites;
        private readonly rate;
        private readonly life;
        private readonly speed;
        private readonly angleRange;
        private readonly gravityX;
        private readonly gravityY;
        private readonly scaleRange;
        private readonly alphaRange;
        private readonly spin;

        private readonly frames?;

        private readonly spawnArea;
        private emitting;

        private poolCursor;

        private debt;
        constructor(options?: ParticleEmitterOptions);

        start(): void;

        stop(): void;
        get isEmitting(): boolean;

        get activeCount(): number;

        get particles(): readonly Particle[];

        burst(count: number): number;
        private spawn;

        private spawnOffset;
        update(dt: number): void;

        private draw;

        clear(): void;
    }

### `Projectile` (class)

    export declare class Projectile {
        private sprite;
        private fromX;
        private fromY;
        private toX;
        private toY;
        private duration;
        private elapsed;
        private arrived;
        constructor(sprite: ProjectilePoint, from: ProjectilePoint, to: ProjectilePoint, options?: ProjectileOptions);
        get done(): boolean;

        get progress(): number;

        update(dt: number): boolean;
    }

### `Rectangle2D` (export)

    export { Rectangle2D }

### `rectOf` (function)

    export declare function rectOf(rectangle: Rectangle): Rect;

### `registerColorTransform` (function)

    export declare function registerColorTransform(): void;

### `RENDERING_DECISIONS` (const)

    export declare const RENDERING_DECISIONS: readonly RenderingDecision[];

### `ScreenEffects` (class)

    export declare class ScreenEffects extends Container {
        private readonly overlay;
        private readonly defaultColor;
        private viewWidth;
        private viewHeight;
        private phase;
        private elapsed;
        private duration;

        private fromAlpha;
        private toAlpha;
        constructor(options?: ScreenEffectsOptions);

        setViewport(width: number, height: number): void;
        private redraw;

        get isBusy(): boolean;

        get washAlpha(): number;

        fadeOut(duration: number, color?: number): void;

        fadeIn(duration: number, color?: number): void;

        flash(duration: number, color?: number, peak?: number): void;

        setTint(color: number, alpha: number): void;

        clear(): void;
        private begin;

        update(dt: number): boolean;
    }

### `Shape2D` (class)

    export declare class Shape2D extends Graphics {
    }

### `snapZoom` (function)

    export declare function snapZoom(zoom: number, tileSize: number): number;

### `splitScreenHalves` (function)

    export declare function splitScreenHalves(width: number, height: number): [{
        x: number;

### `Sprite2D` (class)

    export declare class Sprite2D extends Sprite {
    }

### `SpriteSheet` (class)

    export declare class SpriteSheet {
        readonly texture: Texture2D;
        readonly frameWidth: number;
        readonly frameHeight: number;
        readonly columns: number;
        readonly rows: number;
        private frames;
        private names;
        private constructor();

        static grid(path: string, frameWidth: number, frameHeight?: number): SpriteSheet;
        static fromTexture(texture: Texture2D, frameWidth: number, frameHeight?: number): SpriteSheet;
        get count(): number;

        name(name: string, index: number): this;

        nameAll(names: Readonly<Record<string, number>>): this;
        indexOf(name: string): number;
        get(frame: number | string): Texture2D;

        region(frame: number | string): TextureRegion;

        range(from: number, to: number): Texture2D[];

        pick(...frames: Array<number | string>): Texture2D[];
    }

### `StatusVisuals` (class)

    export declare class StatusVisuals {
        private target;
        private styles;

        private priority;
        private active;
        private elapsed;
        constructor(target: TintTarget, options: StatusVisualsOptions);

        set(kind: string, active: boolean): void;
        has(kind: string): boolean;

        update(dt: number): void;
    }

### `Text2D` (class)

    export declare class Text2D extends Text {
    }

### `Texture2D` (export)

    export { Texture2D }

### `TiledSprite` (class)

    export declare class TiledSprite extends TilingSprite {
    }

### `tileFrame` (function)

    export declare function tileFrame(sheet: number, frame: number): number;

### `tileFrameIndex` (function)

    export declare function tileFrameIndex(packed: number): number;

### `tileFrameSheet` (function)

    export declare function tileFrameSheet(packed: number): number;

### `TileMap` (class)

    export declare class TileMap extends Container {
        readonly widthInTiles: number;
        readonly heightInTiles: number;
        readonly tileWidth: number;
        readonly tileHeight: number;
        readonly shape: 'square' | 'hex' | 'isometric' | 'staggered';

        readonly heightStep: number;
        private sheets;
        private layers;
        private layersByName;
        private chunkSize;
        private chunkColumns;
        private chunkRows;
        private chunks;
        private cellTint;
        private cellAdd;
        private cellHeight;
        private faces;
        constructor(options: TileMapOptions);
        get layerCount(): number;

        get worldWidth(): number;
        get worldHeight(): number;
        inside(x: number, y: number): boolean;
        private index;

        addLayer(name: string, data?: ArrayLike<number>): this;
        private layerAt;
        private chunkIndex;

        private projectedCenter;

        private projectedTile;

        private cellOrigin;

        private textureFor;
        private buildSprite;
        getTile(layer: string | number, x: number, y: number): number;
        setTile(layer: string | number, x: number, y: number, frame: number): void;

        setLayerData(layer: string | number, data: ArrayLike<number>): void;

        setCellColor(x: number, y: number, tint: number, add?: number): void;
        getCellTint(x: number, y: number): number;

        clearColors(): void;

        setCellHeight(x: number, y: number, height: number): void;

        getCellHeight(x: number, y: number): number;

        get faceCount(): number;

        private syncFaces;

        private drawFaces;

        toTile(worldX: number, worldY: number): {
            x: number;
            y: number;
        };

        tileCenter(x: number, y: number): {
            x: number;
            y: number;
        };

        cull(camera: Camera): void;

        get visibleChunks(): number;
    }

### `TintedSprite` (class)

    export declare class TintedSprite extends Sprite {
        private _colorAdd;
        constructor(options?: SpriteOptions | Texture2D);

        get colorAdd(): number;
        set colorAdd(value: number);

        setColorAdd(r: number, g: number, b: number, a?: number): void;

        lerpTint(color: number, strength: number): void;

        silhouette(color: number): void;

        resetColor(): void;
    }

### `Viewport` (class)

    export declare class Viewport {
        readonly camera: Camera;

        readonly container: Container<import("pixi.js").ContainerChild>;
        private readonly clip;
        constructor(options: ViewportOptions);

        resize(x: number, y: number, width: number, height: number): void;
        update(dt: number): void;
    }

## `./two-d/stage`

### `DialogueStage` (class)

    export declare class DialogueStage extends Container {
        private backdropLayer;
        private actorLayer;
        private backdrop;
        private outgoingBackdrop;
        private actors;
        private definitions;
        private focused;
        private stageWidth;
        private stageHeight;
        private tweener;

        dimAmount: number;
        constructor(width: number, height: number);

        defineCharacter(id: string, definition: CharacterDefinition): void;
        resize(width: number, height: number): void;

        setBackdrop(texture: Texture, fade?: number): Promise<void>;
        private fitBackdrop;
        show(id: string, options?: ShowOptions): Promise<void>;
        hide(id: string, fade?: number): Promise<void>;
        hideAll(fade?: number): Promise<void>;
        setExpression(id: string, expression: string): void;

        focus(id: string | null): void;
        private applyFocus;
        private slotOf;
        private placeActor;
        update(dt: number): void;

        get isBusy(): boolean;
    }

### `importTwee` (function)

    export declare function importTwee(source: string): TwineStory;

### `StageScript` (class)

    export declare class StageScript {
        private options;
        readonly state: ScriptState;
        private cancelled;
        private historyLog;
        private seenLines;

        skipSeen: boolean;
        constructor(options: ScriptOptions);
        cancel(): void;

        get history(): readonly HistoryEntry[];

        showLast(): Promise<boolean>;
        run(commands: readonly StageCommand[]): Promise<ScriptState>;

        runStory(story: StoryScript, start: string): Promise<ScriptState>;

        private step;
        private recordHistory;

        protected speak(text: string, as: string | undefined, speaker?: string, choices?: Choice[]): Promise<unknown>;
    }

## `./two-d/ui`

### `advanceReveal` (function)

    export declare function advanceReveal(state: RevealState, dt: number): boolean;

### `Bar` (class)

    export declare class Bar extends Container {
        private track;
        private fill;
        private width_;
        private height_;
        private explicitColor;
        private fillColor;
        private fraction;
        private readonly fillTexture?;
        private readonly backgroundTexture?;
        private readonly background_?;
        private readonly roundUpToPixel;
        private readonly themeListener;
        constructor(options: BarOptions);

        get value(): number;
        setValue(value: number, max?: number): void;

        get color(): number;

        setColor(color: number): void;

        get background(): number;
        resize(width: number, height: number): void;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `BitmapLabel` (class)

    export declare class BitmapLabel extends BitmapText {
        private readonly opts;
        private readonly themeListener;
        constructor(options?: BitmapLabelOptions | string);

        setText(value: string): void;

        private restyle;
        destroy(options?: Parameters<BitmapText['destroy']>[0]): void;
    }

### `bitmapLabelStyle` (function)

    export declare function bitmapLabelStyle(opts: BitmapLabelOptions, t: Theme): TextStyleOptions;

### `Button` (class)

    export declare class Button extends Container {
        readonly onClick: Signal<void>;
        readonly onPress: Signal<void>;
        readonly onRelease: Signal<void>;
        private readonly skin?;
        private readonly labelOptions;
        private background;
        private labelText;
        private icon;
        private width_;
        private height_;
        private state;
        private disabled_;
        private readonly themeListener;
        constructor(options: ButtonOptions);

        private static createBackground;

        resize(width: number, height: number): void;
        setText(text: string | undefined): void;
        get disabled(): boolean;
        setDisabled(disabled: boolean): void;
        private setState;

        private layoutContent;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `completeReveal` (function)

    export declare function completeReveal(state: RevealState): void;

### `contrastRatio` (function)

    export declare function contrastRatio(a: number, b: number): number;

### `defaultTheme` (const)

    export declare const defaultTheme: Theme;

### `escapeHtml` (function)

    export declare function escapeHtml(text: string): string;

### `FLOATING_TEXT_STACK_GAP` (const)

    export declare const FLOATING_TEXT_STACK_GAP = 4;

### `FloatingText` (class)

    export declare class FloatingText extends Container {
        private readonly duration;
        private readonly rise;
        private readonly hold;

        private readonly rising;
        private elapsed;
        private done;
        constructor(options: FloatingTextOptions);

        get finished(): boolean;

        get riseOffset(): number;

        ageAtLeast(seconds: number): void;

        update(dt: number): void;
    }

### `floatingTextAgeAtLeast` (function)

    export declare function floatingTextAgeAtLeast(elapsed: number, duration: number, atLeast: number): number;

### `floatingTextAlpha` (function)

    export declare function floatingTextAlpha(t: number, hold: number): number;

### `floatingTextRise` (function)

    export declare function floatingTextRise(t: number, rise: number, reduce?: boolean): number;

### `FloatingTextStack` (class)

    export declare class FloatingTextStack extends Container {
        private readonly live;

        push(options: FloatingTextPush): FloatingText;

        update(dt: number): void;

        get count(): number;

        clear(): void;
    }

### `floatingTextStackLifePenalty` (function)

    export declare function floatingTextStackLifePenalty(linesBelow: number): number;

### `floatingTextStackLift` (function)

    export declare function floatingTextStackLift(older: FloatingTextStackEntry, below: FloatingTextStackEntry, gap?: number): number;

### `floatingTextStackMoves` (function)

    export declare function floatingTextStackMoves(live: readonly FloatingTextStackEntry[], incoming: FloatingTextStackEntry, gap?: number): FloatingTextStackMove[];

### `HelpScreen` (class)

    export declare class HelpScreen extends Container {
        private list;
        private body;
        private topics;
        constructor(options: HelpScreenOptions);
        private showBody;

        handleAction(action: Action): boolean;
    }

### `highContrastTheme` (const)

    export declare const highContrastTheme: Theme;

### `IconGrid` (class)

    export declare class IconGrid extends Container {
        private readonly selection;
        private cells;
        private cellsLayer;
        private highlight;
        private pickupHighlight;
        private mask_;
        private viewWidth;
        private viewHeight;
        private columns;
        private cellSize;
        private longPressDuration;
        private scrollRow;

        private pickedUp;
        private pressedIndex;
        private pressTimer;
        onSelect: ((item: IconGridItem, index: number) => void) | null;
        onHighlight: ((item: IconGridItem, index: number) => void) | null;
        onQuickslot: ((item: IconGridItem, index: number) => void) | null;
        onReorder: ((fromIndex: number, toIndex: number) => void) | null;

        private readonly themeListener;

        private columnX;
        constructor(options: IconGridOptions);
        destroy(options?: Parameters<Container['destroy']>[0]): void;
        private drawMask;
        get visibleRows(): number;
        get rows(): number;
        get selectedIndex(): number;
        get selected(): IconGridItem | null;
        get length(): number;
        setItems(items: IconGridItem[]): void;
        private releaseCell;
        resize(width: number, height: number): void;

        update(dt: number): void;

        tapCell(index: number): void;

        private swapCells;

        cancelPickup(): void;

        move(dx: number, dy: number): boolean;
        select(index: number): void;
        confirm(): boolean;

        handleAction(action: Action): boolean;

        private cellRect;
        private refresh;
    }

### `Label` (class)

    export declare class Label extends Text {
        private readonly opts;
        private readonly themeListener;
        private revealSource;
        private reveal;
        constructor(options?: LabelOptions | string);

        setColor(color: number): void;

        setText(value: string): void;

        showProgressive(value: string, speed?: number): void;

        updateReveal(dt: number): boolean;

        completeReveal(): void;
        private renderRevealed;

        private restyle;
        destroy(options?: Parameters<Text['destroy']>[0]): void;
    }

### `layoutVertical` (function)

    export declare function layoutVertical(text: string, options: VerticalLayoutOptions): GlyphLayout[];

### `ListView` (class)

    export declare class ListView extends Container {
        private readonly selection;
        private rows;
        private rowsLayer;
        private highlight;
        private mask_;
        private viewWidth;
        private viewHeight;
        private rowHeight;
        private readonly explicitRowHeight;
        private scroll;
        private readonly themeListener;
        onSelect: ((item: ListItem, index: number) => void) | null;
        onHighlight: ((item: ListItem, index: number) => void) | null;
        constructor(options: ListViewOptions);

        private restyle;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
        private drawMask;
        get visibleRows(): number;
        get selectedIndex(): number;
        get selected(): ListItem | null;
        get length(): number;
        setItems(items: ListItem[]): void;
        resize(width: number, height: number): void;

        move(delta: number): boolean;
        select(index: number): void;
        confirm(): boolean;

        handleAction(action: Action): boolean;
        private refresh;
    }

### `LoadingScreen` (class)

    export declare class LoadingScreen extends Container {
        private readonly backdrop;
        private readonly title;
        private readonly status;
        private readonly progress;
        private readonly onRetry?;
        private readonly onCancel?;
        private width_;
        private height_;
        constructor(options: LoadingScreenOptions);
        setSnapshot(snapshot: LoadSnapshot): void;

        bind(queue: LoadQueue): () => void;

        retry(): void;

        cancel(): void;
        resize(width: number, height: number): void;
        private layout;
    }

### `markupToHtml` (function)

    export declare function markupToHtml(spans: readonly MarkupSpan[]): string;

### `meetsContrast` (function)

    export declare function meetsContrast(foreground: number, background: number, level?: ContrastLevel, large?: boolean): boolean;

### `MessageBox` (class)

    export declare class MessageBox extends Window {
        private pages;
        private pageIndex;
        private speed;
        private reveal;
        private pageText;
        private pageCues;
        private nextCue;
        private mode;
        private body;
        private speakerLabel;
        private portrait;
        private portraitLayer;
        private prompt;
        private choices;
        private choiceList;
        private onDone;
        private onSound;
        private finished;
        private autoAdvance?;
        private autoAdvanceElapsed;
        private announce;
        private readonly messageThemeListener;
        constructor(options: MessageBoxOptions);

        private restyleMessage;
        destroy(options?: Parameters<Window['destroy']>[0]): void;
        private showPage;

        private renderBody;
        private formatLine;
        private playRevealedSounds;
        private get pageComplete();
        update(dt: number): void;
        handleAction(action: Action): boolean;

        private advance;
        private showChoices;

        private grow;
        private finish;
    }

### `messageBoxPresenter` (function)

    export declare function messageBoxPresenter(windows: WindowStack, options?: MessageBoxPresenterOptions): DialoguePresenter;

### `NinePatch` (class)

    export declare class NinePatch extends Container {
        private sprite;
        constructor(texture: Texture2D, options: NinePatchOptions);

        get border(): {
            left: number;
            top: number;
            right: number;
            bottom: number;
        };
        resize(width: number, height: number): void;
    }

### `parseMarkdown` (function)

    export declare function parseMarkdown(text: string): MarkdownSpan[];

### `parseMarkup` (function)

    export declare function parseMarkup(source: string, options?: MarkupOptions): MarkupSpan[];

### `RebindScreen` (class)

    export declare class RebindScreen extends Container {
        private list;
        private actions;
        private labelFor;
        private onConflict;
        private capturing;
        private onKeyCaptured;
        constructor(options: RebindScreenOptions);
        private rows;
        private rowText;
        private refresh;
        private startCapture;
        private cancelCapture;
        private finishCapture;

        get isCapturing(): boolean;

        handleAction(action: Action): boolean;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `relativeLuminance` (function)

    export declare function relativeLuminance(color: number): number;

### `revealComplete` (function)

    export declare function revealComplete(state: RevealState): boolean;

### `RichLabel` (class)

    export declare class RichLabel extends HTMLText {
        private readonly opts;
        private readonly themeListener;
        private revealSpans;
        private reveal;
        constructor(options?: RichLabelOptions | string);

        setText(value: string): void;

        showProgressive(value: string, speed?: number): void;

        updateReveal(dt: number): boolean;

        completeReveal(): void;
        private renderRevealed;

        private restyle;
        destroy(options?: Parameters<HTMLText['destroy']>[0]): void;
    }

### `screenReader` (const)

    export declare const screenReader: ScreenReader;

### `ScreenReader` (class)

    export declare class ScreenReader {
        private polite;
        private assertive;
        private region;

        announce(text: string, options?: {
            assertive?: boolean;
        }): void;

        clear(): void;

        destroy(): void;
    }

### `setTheme` (function)

    export declare function setTheme(next: Partial<Theme>): void;

### `sliceSpans` (function)

    export declare function sliceSpans(spans: readonly MarkdownSpan[], count: number): MarkdownSpan[];

### `startReveal` (function)

    export declare function startReveal(total: number, speed?: number): RevealState;

### `StatsScreen` (class)

    export declare class StatsScreen extends Container {
        private text;
        constructor(options: StatsScreenOptions);

        setStats(stats: readonly StatRow[], width?: number): void;
        private static format;
    }

### `stripMarkdown` (function)

    export declare function stripMarkdown(text: string): string;

### `stripMarkup` (function)

    export declare function stripMarkup(source: string, options?: MarkupOptions): string;

### `TabbedList` (class)

    export declare class TabbedList<T> {

        readonly onChange: Signal<void>;
        private readonly tabList;
        private readonly rowsFor;
        private readonly pageSize;
        private readonly labelOf;
        private readonly filterOf;
        private readonly disabledOf;
        private currentTabIndex;
        private currentQuery;
        private rows_;
        private currentSelectedIndex;
        private detail;
        constructor(options: TabbedListOptions<T>);

        get tabs(): readonly ListTab[];

        get tab(): ListTab;
        get query(): string;

        get rows(): readonly T[];

        get pageCount(): number;

        get page(): number;

        get pageRows(): readonly T[];

        get selectedIndex(): number;
        get selected(): T | null;

        get detailOpen(): boolean;

        selectTab(id: string): void;

        nextTab(delta?: number): void;

        setQuery(query: string): void;

        move(delta: number): void;

        setPage(page: number): void;

        nextPage(delta: number): void;

        openDetail(): boolean;
        closeDetail(): void;

        private firstSelectableOnPage;
        private firstSelectable;

        private recompute;
        private emit;
    }

### `theme` (function)

    export declare function theme(): Theme;

### `themeChanged` (const)

    export declare const themeChanged: Signal<Theme>;

### `Toast` (class)

    export declare class Toast extends Container {
        private readonly fadeIn;
        private readonly hold;
        private readonly fadeOut;
        private readonly scaleFrom;
        private queue;
        private current;
        private phase;
        private elapsed;
        constructor(options?: ToastOptions);

        show(content: Container2D): void;

        get isBusy(): boolean;
        private start;
        update(dt: number): void;
        private advance;
        private finish;
    }

### `Tooltip` (class)

    export declare class Tooltip extends Container {
        private readonly delay;
        private readonly maxWidth;
        private readonly offsetX;
        private readonly offsetY;
        private readonly margin;
        private readonly panel;
        private readonly body;
        private viewWidth;
        private viewHeight;

        private panelWidth;
        private panelHeight;
        private pending;
        private waited;
        constructor(options?: TooltipOptions);

        setViewport(width: number, height: number): void;

        hover(text: string, x: number, y: number): void;

        leave(): void;
        get isShowing(): boolean;

        get text(): string | null;

        get panelPosition(): {
            x: number;
            y: number;
        };
        get size(): {
            width: number;
            height: number;
        };

        update(dt: number): boolean;

        protected measureBody(): {
            width: number;
            height: number;
        };

        private place;
    }

### `VerticalLabel` (class)

    export declare class VerticalLabel extends Container {
        private readonly opts;
        private readonly themeListener;
        constructor(options: VerticalLabelOptions);

        private build;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `Window` (class)

    export declare class Window extends Container {
        readonly content: Container<import("pixi.js").ContainerChild>;
        readonly onClose: Signal<void>;
        readonly modal: boolean;
        readonly closable: boolean;
        readonly dims: boolean;
        readonly anchor: 'center' | 'bottom' | 'top';
        private background;
        private titleLabel;
        private innerWidth;
        private innerHeight;
        private currentWidth;
        private currentHeight;
        private readonly themeListener;
        constructor(options: WindowOptions);

        private restyle;
        resize(width: number, height: number): void;

        get contentWidth(): number;
        get contentHeight(): number;
        setTitle(text: string): void;

        delegate: {
            handleAction(action: Action): boolean;
        } | null;

        handleAction(action: Action): boolean;

        update(_dt: number): void;
        close(): void;

        place(viewportWidth: number, viewportHeight: number): void;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `WindowStack` (class)

    export declare class WindowStack extends Container {
        private windows;
        private overlay;
        private viewportWidth;
        private viewportHeight;
        private listener;
        private readonly themeListener;
        constructor();
        setViewport(width: number, height: number): void;
        get top(): Window | null;
        get isEmpty(): boolean;
        get depth(): number;

        push(window: Window): Window;

        pop(): void;
        closeAll(): void;
        private forget;
        private updateOverlay;
        private drawOverlay;

        private handleAction;

        get blocksWorld(): boolean;
        update(dt: number): void;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

## `./world`

### `alignmentBonus` (function)

    export declare function alignmentBonus(alignment: Alignment, lawfulBonus: number): number;

### `EnvironmentClock` (class)

    export declare class EnvironmentClock {
        readonly changed: Signal<EnvironmentSnapshot>;
        readonly dayLength: number;
        private seconds_;
        private weather_;
        private boundaries;
        constructor(options?: EnvironmentOptions);
        get day(): number;
        get seconds(): number;
        get weather(): string;
        get phase(): DayPhase;
        get night(): boolean;

        update(dt: number): EnvironmentSnapshot;
        setWeather(weather: string): EnvironmentSnapshot;

        toJSON(): EnvironmentSnapshot;
        static fromJSON(options: EnvironmentOptions, data: EnvironmentSnapshot): EnvironmentClock;
    }

### `Overworld` (class)

    export declare class Overworld {
        private locations;
        add(location: Location): void;
        remove(id: string): void;
        get(id: string): Location | undefined;

        at(x: number, y: number): Location | undefined;
        get all(): readonly Location[];
    }

### `rollEncounter` (function)

    export declare function rollEncounter<T>(table: EncounterTable<T>): T | null;

### `SideTurns` (class)

    export declare class SideTurns {
        readonly sides: readonly string[];
        readonly schedule: readonly TimeOfDay[];
        private readonly areas;
        private state;
        constructor(options: SideTurnsOptions);
        get round(): number;

        get side(): string;
        get timeIndex(): number;

        get timeOfDay(): TimeOfDay;
        get snapshot(): SideTurnState;

        timeOfDayAt(x: number, y: number): TimeOfDay;

        lawfulBonusAt(alignment: Alignment, x: number, y: number): number;

        advance(): SideTurn;
        toJSON(): SideTurnState;

        static fromJSON(options: SideTurnsOptions, state: SideTurnState): SideTurns;
    }

### `TurnClock` (class)

    export declare class TurnClock {
        turn: number;
        private effects;

        add(effect: TimedEffect): symbol;
        remove(id: symbol): void;
        has(id: symbol): boolean;

        advance(turns?: number): void;
    }

### `World` (class)

    export declare class World<M> {
        private factories;
        private loaded;
        private currentId;
        private lastSpawn;

        define(id: string, create: () => M, options?: {
            persistent?: boolean;
        }): void;

        enter(id: string, spawn?: string): M;
        get current(): M | null;
        get currentMapId(): string | null;

        get spawn(): string | undefined;

        isLoaded(id: string): boolean;

        isPersistent(id: string): boolean;

        unload(id: string): void;
    }

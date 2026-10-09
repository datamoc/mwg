# mwg API report

Generated from the built declarations by `npm run api:report`; verified by
`tests/api-surface.test.ts`. Do not edit by hand - run `npm run api:report` after a
build instead.

## root (`@datamoc/mw_games`)

### `AchievementCriterion` (interface)

    export interface AchievementCriterion {

        counter: string;

        target: number;
    }

### `AchievementDef` (interface)

    export interface AchievementDef {
        id: string;

        counter?: string;

        target?: number;

        criteria?: AchievementCriterion[];

        description?: string;
    }

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

        subProgress(id: string): readonly {
            counter: string;
            count: number;
            target: number;
            met: boolean;
        }[];

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

        replace(entries: readonly ActionJournalEntry<Action, Event>[]): void;
        static fromJSON<Action, Event>(entries: readonly ActionJournalEntry<Action, Event>[]): ActionJournal<Action, Event>;
    }

### `ActionJournalEntry` (interface)

    export interface ActionJournalEntry<Action, Event> {
        readonly sequence: number;
        readonly action: Action;
        readonly events: readonly Event[];
    }

### `ActorAnimationState` (type)

    export type ActorAnimationState = 'idle' | 'move' | 'action';

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

### `ActorAnimatorOptions` (interface)

    export interface ActorAnimatorOptions {

        animationName: (state: ActorAnimationState, variant: string) => string;

        variant?: string;
    }

### `Actors` (namespace)

    export * as Actors from './actors/index.ts'

### `advanceReveal` (function)

    export declare function advanceReveal(state: RevealState, dt: number): boolean;

### `AI` (namespace)

    export * as AI from './ai/index.ts'

### `Anchor` (type)

    export type Anchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'fill';

### `anchorAlign` (function)

    export declare function anchorAlign(anchor: Anchor): {
        x: number;

### `AnchorSpec` (interface)

    export interface AnchorSpec {

        anchor?: Anchor;

        offsetX?: number;
        offsetY?: number;

        alignX?: number;
        alignY?: number;

        width?: number;
        height?: number;

        margin?: number;
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

### `AnimationFrame` (interface)

    export interface AnimationFrame {
        readonly texture: Texture2D;

        readonly duration?: number;

        readonly offsetX?: number;
        readonly offsetY?: number;
    }

### `AnimationFrameInput` (type)

    export type AnimationFrameInput = Texture2D | AnimationFrame;

### `AnimationOptions` (interface)

    export interface AnimationOptions {

        fps?: number;

        loop?: boolean;

        startTime?: number;
    }

### `applyAllImageModifiers` (function)

    export declare function applyAllImageModifiers(sprite: Sprite, parsed: ParsedImagePath, probe?: ImageTextureProbe, scale?: number): void;

### `applyImageModifiers` (function)

    export declare function applyImageModifiers(sprite: Sprite, parsed: ParsedImagePath, scale?: number): void;

### `applyTextureModifiers` (function)

    export declare function applyTextureModifiers(texture: Texture, parsed: ParsedImagePath, probe?: ImageTextureProbe): Texture;

### `assertAutotileLayout` (function)

    export declare function assertAutotileLayout(layout: AutotileLayout): void;

### `AttachmentPoint` (interface)

    export interface AttachmentPoint {
        x: number;
        y: number;
    }

### `Audio` (namespace)

    export * as Audio from './audio/index.ts'

### `AudioSuspendRig` (interface)

    export interface AudioSuspendRig {
        suspend(): void;
        resume(): void;
    }

### `AutotileCell` (type)

    export type AutotileCell = number;

### `AutotileCellPart` (interface)

    export interface AutotileCellPart {
        sourceX: number;
        sourceY: number;
        sourceWidth: number;
        sourceHeight: number;
        destX: number;
        destY: number;
        destWidth: number;
        destHeight: number;
    }

### `autotileCellParts` (function)

    export declare function autotileCellParts(layout: AutotileLayout, tile: number, frame: number): AutotileCellPart[] | null;

### `AutotileFormat` (type)

    export type AutotileFormat = 'rpgm-mv' | 'rpgm-xp';

### `autotileFrames` (function)

    export declare function autotileFrames(width: number, height: number, sameTerrain: (x: number, y: number) => boolean, frames: readonly number[]): Int32Array;

### `AutotileLayout` (type)

    export type AutotileLayout = {
        format: 'rpgm-mv';

### `AutotileSet` (interface)

    export interface AutotileSet {

        sheet: SpriteSheet;

        format?: AutotileFormat;

        slot?: RpgmAutotileSlot;

        mode?: 'floor' | 'wall' | 'mixed';

        table?: RpgmAutotileShapeTable;

        index?: number;

        frames?: number;

        tableEdge?: boolean;

        animation?: ReadonlyArray<ReadonlyArray<number>>;

        animationFrame?: number;
    }

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

### `BarOptions` (interface)

    export interface BarOptions {
        width: number;
        height: number;

        color?: number;

        value?: number;
        max?: number;

        fillTexture?: Texture2D;

        background?: number;

        backgroundTexture?: Texture2D;

        roundUpToPixel?: boolean;
    }

### `Battle` (namespace)

    export * as Battle from './battle/index.ts'

### `Beam` (class)

    export declare class Beam extends Container {
        private from;
        private to;
        private readonly colour;
        private readonly texture?;
        private readonly stretch;
        private readonly textureAnchor;
        private readonly thickness;
        private readonly thin;
        private readonly duration;
        private readonly body;
        private elapsed;
        private expired;

        private lifeFraction;
        constructor(from: BeamPoint, to: BeamPoint, options?: BeamOptions);

        get progress(): number;
        get done(): boolean;

        retarget(from?: BeamPoint, to?: BeamPoint): void;

        update(dt: number): boolean;
        destroy(): void;
        private redraw;
    }

### `BeamOptions` (interface)

    export interface BeamOptions {

        colour?: number;

        texture?: Texture2D | BeamTextureOptions;

        duration?: number;

        width?: number;

        thin?: boolean;

        additive?: boolean;
    }

### `BeamPoint` (interface)

    export interface BeamPoint {
        x: number;
        y: number;
    }

### `Beams` (class)

    export declare class Beams extends Container {
        private readonly live;

        add(from: BeamPoint, to: BeamPoint, options?: BeamOptions): Beam;

        update(dt: number): void;

        get count(): number;

        clear(): void;
        destroy(): void;
    }

### `BeamTextureOptions` (interface)

    export interface BeamTextureOptions {

        source: Texture2D;

        stretch?: boolean;

        anchor?: number;
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

### `BitmapLabelOptions` (type)

    export type BitmapLabelOptions = ThemedTextOptions;

### `bitmapLabelStyle` (function)

    export declare function bitmapLabelStyle(opts: BitmapLabelOptions, t: Theme): TextStyleOptions;

### `blendMatrix` (function)

    export declare function blendMatrix(color: number, ratio: number): ColorMatrixFilter['matrix'];

### `blendPixels` (function)

    export declare function blendPixels(pixels: Uint8ClampedArray, color: number, ratio: number): Uint8ClampedArray;

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

### `ButtonOptions` (interface)

    export interface ButtonOptions {
        width: number;
        height: number;

        text?: string;

        icon?: Container2D;

        skin?: ButtonSkin;

        label?: Omit<LabelOptions, 'text'>;
        disabled?: boolean;
        onClick?: () => void;

        onPress?: () => void;

        onRelease?: () => void;
    }

### `ButtonSkin` (interface)

    export interface ButtonSkin {
        texture: Texture2D;
        border: NinePatchOptions['border'];

        tints?: Partial<Record<ButtonState, number>>;
    }

### `ButtonState` (type)

    export type ButtonState = 'idle' | 'hover' | 'pressed' | 'disabled';

### `Camera` (class)

    export declare class Camera {

        readonly world: Container<import("pixi.js").ContainerChild>;

        x: number;
        y: number;
        private requestedZoom;
        private readonly resolution;
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

        readonly stepsPerTurn: number;
        private step;
        private _angle;
        private targetAngle;
        private angleIntensity;
        constructor(options?: CameraOptions);

        get rotationSteps(): number;

        get rotation(): number;

        get uprightRotation(): number;

        setRotationStep(step: number): void;

        rotate(delta?: number): void;

        rotateTo(angle: number): void;

        animateRotationTo(angle: number, intensity?: number): void;

        private get spin();

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

        shakeScreen(intensity: number, duration?: number): void;
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
        private snapToDevice;
    }

### `CameraOptions` (interface)

    export interface CameraOptions {

        zoom?: number;

        grid?: 'square' | 'hex';

        deadzone?: number;

        pixelPerfectTileSize?: number;

        resolution?: () => number;
    }

### `CanonicalState` (class)

    export declare class CanonicalState<State extends StateValue> {
        private _state;
        private readonly version;
        private readonly migrations;
        readonly extensions: StateRegistry;
        constructor(initial: State, options?: {
            readonly version?: number;
            readonly migrations?: Readonly<Record<number, (state: StateValue) => State>>;
            readonly extensions?: StateRegistry;
        });
        get state(): State;
        set(next: State): void;
        update(transform: (current: State) => State): State;
        snapshot(): CanonicalStateSnapshot<State>;
        restore(snapshot: CanonicalStateSnapshot<State>, options?: Parameters<StateRegistry['restore']>[1]): readonly StateRestoreDiagnostic[];
        transaction<T>(work: (state: CanonicalState<State>) => T): T;
    }

### `CanonicalStateSnapshot` (interface)

    export interface CanonicalStateSnapshot<State extends StateValue = StateValue> {
        readonly version: number;
        readonly state: State;
        readonly extensions: Readonly<Record<string, StateValue>>;
        readonly extensionVersions?: Readonly<Record<string, number>>;
    }

### `cellFromKey` (function)

    export declare function cellFromKey(key: string): {
        x: number;

### `cellIndex` (function)

    export declare function cellIndex(width: number, x: number, y: number): number;

### `cellInside` (function)

    export declare function cellInside(width: number, height: number, x: number, y: number): boolean;

### `cellKey` (function)

    export declare function cellKey(x: number, y: number): string;

### `cellX` (function)

    export declare function cellX(width: number, index: number): number;

### `cellY` (function)

    export declare function cellY(width: number, index: number): number;

### `channelScaleMatrix` (function)

    export declare function channelScaleMatrix(scale: {
        red?: number;

### `ChannelSource` (type)

    export type ChannelSource = 'R' | 'G' | 'B' | 'A' | '0' | '1';

### `channelSwapMatrix` (function)

    export declare function channelSwapMatrix(sources: readonly ChannelSource[]): ColorMatrixFilter['matrix'];

### `CharacterDefinition` (interface)

    export interface CharacterDefinition {
        sheet: SpriteSheet;

        expressions: Record<string, number>;

        height?: number;

        baseline?: number;
    }

### `chebyshev` (function)

    export declare function chebyshev(a: {
        readonly x: number;

### `Checkbox` (class)

    export declare class Checkbox extends Container {
        readonly onChange: Signal<boolean>;
        private box;
        private size_;
        private checked_;
        private disabled_;
        private readonly themeListener;
        constructor(options?: CheckboxOptions);
        get checked(): boolean;
        get disabled(): boolean;
        setDisabled(disabled: boolean): void;

        setChecked(checked: boolean): void;
        toggle(): void;
        resize(size: number): void;
        private readonly handleTap;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `CheckboxOptions` (interface)

    export interface CheckboxOptions {

        size?: number;
        checked?: boolean;
        disabled?: boolean;

        color?: number;
    }

### `checkNoControlCharacters` (function)

    export declare function checkNoControlCharacters(text: string): void;

### `checkSize` (function)

    export declare function checkSize(data: string | Uint8Array, options?: SizeLimitOptions): void;

### `Choice` (interface)

    export interface Choice {
        text: string;
        value?: unknown;
        disabled?: boolean;
    }

### `CIRCLE8` (const)

    export declare const CIRCLE8: ReadonlyArray<readonly [number, number]>;

### `clamp` (function)

    export declare function clamp(value: number, min: number, max: number): number;

### `cloneData` (function)

    export declare function cloneData<T>(value: T, label: string): T;

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
        private parse;
    }

### `CollectionOptions` (interface)

    export interface CollectionOptions {

        namespace?: string;

        storage?: SaveStorage;
    }

### `COLOR_BLINDNESS_MATRICES` (const)

    export declare const COLOR_BLINDNESS_MATRICES: Record<ColorBlindnessType, ColorMatrix>;

### `ColorBlindnessType` (type)

    export type ColorBlindnessType = 'protanopia' | 'deuteranopia' | 'tritanopia';

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

### `ContrastLevel` (type)

    export type ContrastLevel = 'AA' | 'AAA';

### `contrastRatio` (function)

    export declare function contrastRatio(a: number, b: number): number;

### `createCamera` (function)

    export declare function createCamera(options?: CameraOptions): Camera;

### `createColorBlindnessFilter` (function)

    export declare function createColorBlindnessFilter(type: ColorBlindnessType): ColorMatrixFilter;

### `createHandles` (function)

    export declare function createHandles<T>(): Handles<T>;

### `createLayers` (function)

    export declare function createLayers(parent: Container, names: readonly string[]): Record<string, Node2D>;

### `croppedTexture` (function)

    export declare function croppedTexture(texture: Texture, parsed: ParsedImagePath): Texture;

### `CsvColumnType` (type)

    export type CsvColumnType = 'string' | 'number' | 'boolean' | 'list' | 'map';

### `CsvOptions` (interface)

    export interface CsvOptions {

        columns?: Record<string, CsvColumnType>;

        listDelimiter?: string;

        mapDelimiter?: string;
    }

### `CustomSettingValue` (type)

    export type CustomSettingValue = string | number | boolean;

### `DataTable` (class)

    export declare class DataTable<T> {
        readonly onChange: Signal<void>;
        private columns_;
        private rows_;
        private pageSize_;
        private current;
        private sortKey_;
        private ascending;
        private readonly disabledOf;
        constructor(options: DataTableOptions<T>);
        get columns(): readonly TableColumn<T>[];
        get rows(): readonly T[];
        get pageSize(): number;
        get sortKey(): string | null;
        get sortAscending(): boolean;
        get selectedIndex(): number;
        get selected(): T | null;

        get page(): number;

        get pageCount(): number;
        get pageRows(): readonly T[];
        setRows(rows: readonly T[]): void;
        setColumns(columns: readonly TableColumn<T>[]): void;
        setPageSize(size: number): void;

        sortBy(key: string): void;
        select(index: number): void;

        move(delta: number): void;

        setPage(page: number): void;
        nextPage(delta?: number): void;
        private firstEnabled;
    }

### `DataTableOptions` (interface)

    export interface DataTableOptions<T> {
        columns: readonly TableColumn<T>[];
        rows?: readonly T[];

        pageSize?: number;

        disabled?: (row: T) => boolean;
    }

### `DbRecord` (interface)

    export interface DbRecord {
        id: string;
        [field: string]: unknown;
    }

### `defaultSettings` (function)

    export declare function defaultSettings(): GameSettings;

### `defaultTheme` (const)

    export declare const defaultTheme: Theme;

### `deserializeReplay` (function)

    export declare function deserializeReplay(json: string): ReplayEvent[];

### `detectWebGpu` (function)

    export declare function detectWebGpu(): Promise<WebGpuDetection>;

### `DialogueLine` (interface)

    export interface DialogueLine {
        text: string;
        speaker?: string;
    }

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

### `distance` (function)

    export declare function distance(metric: DistanceMetric, a: {
        readonly x: number;

### `DistanceMetric` (type)

    export type DistanceMetric = 'euclidean' | 'manhattan' | 'chebyshev';

### `downloadReplayFile` (function)

    export declare function downloadReplayFile(json: string, filename: string): void;

### `Dropdown` (class)

    export declare class Dropdown {
        readonly onChange: Signal<{
            option: DropdownOption;
            index: number;
        }>;
        private options_;
        private current;
        private highlight_;
        private open_;
        private disabled_;
        constructor(options: DropdownOptions);
        get options(): readonly DropdownOption[];
        get selectedIndex(): number;

        get selected(): DropdownOption | null;
        get isOpen(): boolean;
        get disabled(): boolean;

        get highlight(): number;
        setDisabled(disabled: boolean): void;
        setOptions(options: readonly DropdownOption[]): void;

        open(): void;
        close(): void;
        toggleOpen(): void;

        move(delta: number): void;

        setHighlight(index: number): void;

        confirm(): boolean;

        cancel(): void;
        private firstEnabled;
    }

### `DropdownOption` (interface)

    export interface DropdownOption {

        id?: string;
        label: string;
        disabled?: boolean;
    }

### `DropdownOptions` (interface)

    export interface DropdownOptions {
        options: readonly DropdownOption[];

        selectedIndex?: number;
        disabled?: boolean;
    }

### `Easing` (const)

    export declare const Easing: Record<'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic', Easing>;

### `effectiveMusicVolume` (function)

    export declare function effectiveMusicVolume(settings: Pick<GameSettings, 'musicVolume' | 'muted'>): number;

### `effectiveSfxVolume` (function)

    export declare function effectiveSfxVolume(settings: Pick<GameSettings, 'sfxVolume' | 'muted'>): number;

### `EMPTY` (const)

    export declare const EMPTY = -1;

### `EntityId` (type)

    export type EntityId = string;

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

### `euclidean` (function)

    export declare function euclidean(a: {
        readonly x: number;

### `exportReplayFile` (function)

    export declare function exportReplayFile(events: readonly ReplayEvent[], meta: ReplayFileMeta): string;

### `extractDialogueCatalog` (function)

    export declare function extractDialogueCatalog(commands: readonly StageCommand[] | StoryScript, options?: {
        locale?: string;

### `FeedbackClient` (class)

    export declare class FeedbackClient extends HttpTransport {
        constructor(options: FeedbackOptions);
        submit(request: FeedbackRequest): Promise<FeedbackResponse>;
    }

### `FeedbackOptions` (type)

    export type FeedbackOptions = HttpTransportOptions;

### `FeedbackRequest` (interface)

    export interface FeedbackRequest {
        message: string;
        contact?: string;
        context?: Record<string, string | number | boolean>;
    }

### `FeedbackResponse` (interface)

    export interface FeedbackResponse {
        ok: boolean;
        status: number;
    }

### `fitWindowZoom` (function)

    export declare function fitWindowZoom(base: number, contentHeight: number, viewportHeight: number): number;

### `FlightHandle` (interface)

    export interface FlightHandle {

        readonly projectile: Projectile;

        readonly done: boolean;

        cancel(): void;
    }

### `FlightOptions` (interface)

    export interface FlightOptions extends ProjectileOptions {

        tint?: number;

        spin?: number;

        spinDegrees?: number;

        fadeIn?: number | boolean | 'progress';

        onArrive?: () => void;
    }

### `Flights` (class)

    export declare class Flights extends Container {
        private readonly live;
        add(sprite: FlightSprite, from: ProjectilePoint, to: ProjectilePoint, options?: FlightOptions): FlightHandle;
        add(texture: Texture2D, from: ProjectilePoint, to: ProjectilePoint, options?: FlightOptions): FlightHandle;

        update(dt: number): void;

        get count(): number;

        clear(): void;
        destroy(): void;
        private release;
    }

### `FlightSprite` (interface)

    export interface FlightSprite {
        x: number;
        y: number;
        rotation?: number;
        alpha?: number;
        tint?: number;
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

### `FloatingTextOptions` (interface)

    export interface FloatingTextOptions {
        text: string;
        color?: number;
        size?: number;

        duration?: number;

        rise?: number;

        hold?: number;
    }

### `FloatingTextPush` (interface)

    export interface FloatingTextPush extends FloatingTextOptions {

        x: number;
        y: number;

        key?: string | number;

        scale?: number;
    }

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

### `FloatingTextStackEntry` (interface)

    export interface FloatingTextStackEntry {

        key?: string | number;

        x: number;
        y: number;

        height: number;
    }

### `floatingTextStackLifePenalty` (function)

    export declare function floatingTextStackLifePenalty(linesBelow: number): number;

### `floatingTextStackLift` (function)

    export declare function floatingTextStackLift(older: FloatingTextStackEntry, below: FloatingTextStackEntry, gap?: number): number;

### `FloatingTextStackMove` (interface)

    export interface FloatingTextStackMove {

        readonly index: number;

        readonly y: number;

        readonly ageAtLeast: number;
    }

### `floatingTextStackMoves` (function)

    export declare function floatingTextStackMoves(live: readonly FloatingTextStackEntry[], incoming: FloatingTextStackEntry, gap?: number): FloatingTextStackMove[];

### `FloatSource` (interface)

    export interface FloatSource {

        float(): number;
    }

### `FogCell` (type)

    export type FogCell = number | ArrayLike<number>;

### `FogColor` (type)

    export type FogColor = readonly [number, number, number, number];

### `FogLayer` (class)

    export declare class FogLayer extends Sprite {
        private readonly context;
        private readonly image;
        private readonly columns;
        private readonly rows;
        private readonly cellResolution;
        private palette;
        constructor(options: FogLayerOptions);

        setPalette(palette: readonly FogColor[]): void;
        refresh(state: (x: number, y: number) => FogCell): void;

        destroy(): void;
    }

### `FogLayerOptions` (interface)

    export interface FogLayerOptions {

        width: number;
        height: number;

        tileSize?: number;

        resolution?: number;

        palette: readonly FogColor[];
    }

### `FollowOptions` (interface)

    export interface FollowOptions {

        offsetX?: number;
        offsetY?: number;

        enabled?: () => boolean;

        visible?: () => boolean;
    }

### `FollowTarget` (type)

    export type FollowTarget = Container | (() => {
        x: number;

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
        private stopWatchingVisibility;
        private suspended_;
        private timeScaleBeforeSuspend;
        private scaler;
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

        get suspended(): boolean;

        suspend(): void;

        resume(): void;

        private expose;

        private fitResolutionToDevice;
        private frame;
        private switchNow;

        private applySwitch;

        private applyPush;

        private applyPop;
        destroy(): void;
    }

### `GameOptions` (interface)

    export interface GameOptions {

        canvas?: HTMLCanvasElement;

        background?: number;

        maxDelta?: number;

        pixelArt?: boolean;

        resizeTo?: HTMLElement | Window;

        extensions?: readonly (() => void)[];

        autoPause?: boolean;

        audio?: AudioSuspendRig | null;

        qualityScaling?: Omit<QualityScalerOptions, 'ceiling'> | null;
    }

### `GameSettings` (interface)

    export interface GameSettings {

        musicVolume: number;

        sfxVolume: number;

        muted: boolean;

        zoom: number;

        bindings: Record<Action, string[]>;

        custom: Record<string, CustomSettingValue>;
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
        private rotl;
    }

### `GlyphLayout` (interface)

    export interface GlyphLayout {
        char: string;
        x: number;
        y: number;
        rotate: boolean;
    }

### `Gradient` (const)

    export declare const Gradient: typeof FillGradient;

### `GraphicsCapabilities` (interface)

    export interface GraphicsCapabilities {
        webgl1: boolean;
        webgl2: boolean;
        webgpu: boolean;

        wgsl: boolean;
    }

### `GraphicsProbe` (interface)

    export interface GraphicsProbe {
        createCanvas?(): {
            getContext(kind: string): unknown;
        } | null;
        webgpu?: boolean;

        wgsl?: boolean;
    }

### `GraphicsWorkload` (type)

    export type GraphicsWorkload = 'sprites' | 'ui' | 'custom-shaders' | 'particles' | 'instanced-terrain' | 'voxels' | 'animated-models' | 'large-3d-worlds';

### `Grid` (class)

    export declare class Grid {
        private spec;
        constructor(spec: GridSpec);
        get columns(): readonly GridTrack[];
        get rows(): readonly GridTrack[];

        columnSizes(totalWidth: number): number[];

        rowSizes(totalHeight: number): number[];

        rect(row: number, column: number, bounds: LayoutRect, options?: {
            rowSpan?: number;
            columnSpan?: number;
        }): LayoutRect;
        private get gap();
    }

### `GridSpec` (interface)

    export interface GridSpec {
        columns: readonly GridTrack[];
        rows: readonly GridTrack[];

        gap?: number;
    }

### `GridTrack` (interface)

    export interface GridTrack {

        size?: number;

        grow?: number;
    }

### `Halo` (class)

    export declare class Halo extends AnimatedSprite {
        private readonly offsetX;
        private readonly offsetY;
        constructor(options: HaloOptions);

        follow(x: number, y: number): this;
    }

### `HALO_ANIMATION` (const)

    export declare const HALO_ANIMATION = "halo";

### `HaloOptions` (interface)

    export interface HaloOptions {

        readonly frames: readonly AnimationFrameInput[];

        readonly animation?: AnimationOptions;

        readonly offsetX?: number;
        readonly offsetY?: number;

        readonly blendMode?: 'add' | 'normal' | 'multiply' | 'screen';
    }

### `Handles` (interface)

    export interface Handles<T> {

        readonly size: number;

        put(value: T): number;

        get(id: number): T;

        drop(id: number): void;

        clear(): void;

        with<R>(value: T, body: (id: number) => R): R;
    }

### `HasColorAdd` (interface)

    export interface HasColorAdd {

        colorAdd?: number;
    }

### `HelpScreen` (class)

    export declare class HelpScreen extends Container {
        private list;
        private body;
        private topics;
        constructor(options: HelpScreenOptions);
        private showBody;

        handleAction(action: Action): boolean;
    }

### `HelpScreenOptions` (interface)

    export interface HelpScreenOptions {
        width: number;
        height: number;
        topics: readonly HelpTopic[];

        listWidth?: number;
    }

### `HelpTopic` (interface)

    export interface HelpTopic {
        title: string;
        body: string;
    }

### `HexCoord` (interface)

    export interface HexCoord {
        x: number;
        y: number;
    }

### `hexDistance` (function)

    export declare function hexDistance(a: HexCoord, b: HexCoord): number;

### `hexLine` (function)

    export declare function hexLine(a: HexCoord, b: HexCoord): HexCoord[];

### `hexNeighbors` (function)

    export declare function hexNeighbors(x: number, y: number): HexCoord[];

### `HexOffset` (type)

    export type HexOffset = 'odd' | 'even';

### `HexOrientation` (type)

    export type HexOrientation = 'flat-top' | 'pointy-top';

### `hexRange` (function)

    export declare function hexRange(center: HexCoord, radius: number): HexCoord[];

### `hexRotate` (function)

    export declare function hexRotate(dx: number, dy: number, rotationIndex: number, rotations: number): {
        dx: number;

### `HexShape` (interface)

    export interface HexShape {
        readonly orientation?: HexOrientation;
        readonly offset?: HexOffset;
    }

### `hexToPixel` (function)

    export declare function hexToPixel(x: number, y: number, tileWidth: number, tileHeight: number, shape?: HexShape): {
        x: number;

### `highContrastTheme` (const)

    export declare const highContrastTheme: Theme;

### `HistoryEntry` (interface)

    export interface HistoryEntry {
        text: string;
        speaker?: string;

        chosen?: unknown;
    }

### `Hook` (interface)

    export interface Hook<TArgs extends unknown[]> {
        event: string;
        handler: (...args: TArgs) => void;

        source?: unknown;
    }

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

### `HttpTransport` (class)

    export declare abstract class HttpTransport {
        protected readonly endpoint: string;
        protected readonly timeoutMs: number;
        protected readonly fetchFn: typeof globalThis.fetch;
        protected readonly maxResponseBytes: number;
        private readonly label;
        constructor(options: HttpTransportOptions, label: string);
        protected withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T>;

        protected readText(response: Response): Promise<string>;

        protected readJson(response: Response, what: string): Promise<unknown>;
    }

### `HttpTransportOptions` (interface)

    export interface HttpTransportOptions {
        endpoint: string;
        timeoutMs?: number;
        fetch?: typeof globalThis.fetch;

        maxResponseBytes?: number;

        allowInsecure?: boolean;
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

### `IconGridItem` (interface)

    export interface IconGridItem {

        icon: Container2D;

        disabled?: boolean;

        value?: unknown;

        quantity?: number;
    }

### `IconGridOptions` (interface)

    export interface IconGridOptions {
        width: number;
        height: number;

        columns: number;
        items?: IconGridItem[];

        cellSize?: number;

        longPressDuration?: number;
        onSelect?: (item: IconGridItem, index: number) => void;
        onHighlight?: (item: IconGridItem, index: number) => void;

        onQuickslot?: (item: IconGridItem, index: number) => void;

        onReorder?: (fromIndex: number, toIndex: number) => void;
    }

### `imageModifier` (function)

    export declare function imageModifier(path: ParsedImagePath, name: string): ImageModifier | undefined;

### `ImageModifier` (interface)

    export interface ImageModifier {
        readonly name: string;
        readonly args: readonly string[];
    }

### `ImageTextureProbe` (interface)

    export interface ImageTextureProbe extends RecolorProbe {
        resolveTexture?(pathWithModifiers: string): Texture2D | undefined;
        resolveColor?(name: string): number | undefined;
    }

### `importReplayFile` (function)

    export declare function importReplayFile(json: string, expect: {
        framework: string;

### `importTwee` (function)

    export declare function importTwee(source: string): TwineStory;

### `Input` (namespace)

    export * as Input from './Input.ts'

### `inspectGraphicsCapabilities` (function)

    export declare function inspectGraphicsCapabilities(probe?: GraphicsProbe): GraphicsCapabilities;

### `isOnScreen` (function)

    export declare function isOnScreen(camera: Camera, x: number, y: number, margin?: number): boolean;

### `JavaRandom` (class)

    export declare class JavaRandom {
        private state;
        private readonly onDraw?;
        constructor(seed?: number | bigint, options?: JavaRandomOptions);

        setSeed(seed: number | bigint): void;

        next(bits: number): number;

        nextInt(bound?: number): number;

        nextLong(): bigint;

        nextDouble(): number;

        nextFloat(): number;
        nextBoolean(): boolean;
    }

### `JavaRandomDraw` (interface)

    export interface JavaRandomDraw {

        bits: number;

        value: number;
    }

### `JavaRandomOptions` (interface)

    export interface JavaRandomOptions {

        onDraw?: (draw: JavaRandomDraw) => void;
    }

### `KeyboardKey` (interface)

    export interface KeyboardKey {

        label: string;

        text?: string;

        action?: Action;

        span?: number;
    }

### `KeyboardLayout` (interface)

    export interface KeyboardLayout {

        rows: KeyboardKey[][];
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

### `LabelOptions` (interface)

    export interface LabelOptions extends ThemedTextOptions {

        stroke?: {
            color: number;
            width: number;
        };

        resolution?: number;
        roundPixels?: boolean;
    }

### `LastRun` (class)

    export declare class LastRun {
        private readonly store;
        private readonly maxEvents;
        constructor(options: LastRunOptions);

        keep(events: readonly ReplayEvent[], seed?: number): void;

        load(): LastRunData | null;

        clear(): void;
    }

### `LastRunData` (interface)

    export interface LastRunData {
        version: 1;
        seed?: number;
        events: readonly ReplayEvent[];
    }

### `LastRunOptions` (interface)

    export interface LastRunOptions {

        namespace: string;
        storage?: SaveStorage;

        maxEvents?: number;
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

### `layoutMarkupLines` (function)

    export declare function layoutMarkupLines(spans: readonly MarkupSpan[], measure: MarkupMeasure, maxWidth: number): MarkupLine[];

### `LayoutRect` (interface)

    export interface LayoutRect {
        x: number;
        y: number;
        width: number;
        height: number;
    }

### `layoutVertical` (function)

    export declare function layoutVertical(text: string, options: VerticalLayoutOptions): GlyphLayout[];

### `LightningArc` (class)

    export declare class LightningArc {
        private from;
        private to;
        private readonly segments;
        private readonly jitter;
        private readonly flickerInterval?;
        private readonly random;
        private readonly duration?;
        private elapsed;
        private sinceFlicker;
        private expired;
        private current;
        constructor(from: LightningArcPoint, to: LightningArcPoint, options?: LightningArcOptions);

        get points(): readonly LightningArcPoint[];
        get done(): boolean;

        retarget(from?: LightningArcPoint, to?: LightningArcPoint): void;

        update(dt: number): boolean;
        private reroll;
    }

### `LightningArcOptions` (interface)

    export interface LightningArcOptions {

        duration?: number;

        segments?: number;

        jitter?: number;

        flickerInterval?: number;

        random?: () => number;
    }

### `LightningArcPoint` (interface)

    export interface LightningArcPoint {
        x: number;
        y: number;
    }

### `linesToDrop` (function)

    export declare function linesToDrop(lineCounts: readonly number[], maxLines: number): number;

### `LiquidLayer` (class)

    export declare class LiquidLayer extends Container {
        private readonly cells;
        private readonly ripples;
        private readonly columns;
        private readonly tileSize;
        private readonly speed;
        private readonly rippleTexture?;
        private readonly rippleDuration;
        private offset;
        constructor(options: LiquidLayerOptions);

        setCellColor(x: number, y: number, tint: number): void;

        ripple(x: number, y: number): void;

        get rippleCount(): number;
        update(dt: number): void;
    }

### `LiquidLayerOptions` (interface)

    export interface LiquidLayerOptions {

        texture: Texture2D;

        width: number;
        height: number;

        tileSize?: number;

        isLiquid: (x: number, y: number) => boolean;

        speed?: number;

        rippleTexture?: Texture2D;

        rippleDuration?: number;
    }

### `ListItem` (interface)

    export interface ListItem {

        text: string;

        disabled?: boolean;

        value?: unknown;

        icon?: Container2D;
    }

### `ListTab` (interface)

    export interface ListTab {
        id: string;
        label: string;

        disabled?: boolean;
    }

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
        onToggle: ((item: ListItem, index: number, checked: boolean) => void) | null;
        private multiple;
        private checked;
        private ticks;
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

        tapRow(index: number): void;

        handleAction(action: Action): boolean;
        get checkedIndexes(): number[];
        isChecked(index: number): boolean;

        setChecked(index: number, checked: boolean): void;

        toggleChecked(index: number): boolean;

        clearChecked(): void;

        private checkAdvance;
        private checkBox;
        private rebuildTicks;
        private updateTicks;
        private refresh;
    }

### `ListViewOptions` (interface)

    export interface ListViewOptions {
        width: number;
        height: number;
        items?: ListItem[];

        rowHeight?: number;
        onSelect?: (item: ListItem, index: number) => void;
        onHighlight?: (item: ListItem, index: number) => void;

        multiple?: boolean;
        onToggle?: (item: ListItem, index: number, checked: boolean) => void;
    }

### `LoadedTiledMap` (interface)

    export interface LoadedTiledMap {
        map: TileMap;

        objects: Array<TiledObject & {
            tileX: number;
            tileY: number;
        }>;
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

### `LoadingScreenOptions` (interface)

    export interface LoadingScreenOptions {
        width: number;
        height: number;
        title?: string;
        onRetry?: () => void;
        onCancel?: () => void;
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

### `LoadSnapshot` (interface)

    export interface LoadSnapshot {
        status: LoadStatus;
        completed: number;
        total: number;
        current: string | null;
        error: unknown | null;
    }

### `LoadStatus` (type)

    export type LoadStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'cancelled';

### `LoadTask` (interface)

    export interface LoadTask {
        id: string;
        weight?: number;
        run(context: LoadTaskContext): Promise<void> | void;
    }

### `LoadTaskContext` (interface)

    export interface LoadTaskContext {

        report(fraction: number): void;

        readonly cancelled: boolean;
    }

### `loadTiledMap` (function)

    export declare function loadTiledMap(data: TiledMapData, sheets: SpriteSheet | TilesetSheet[]): LoadedTiledMap;

### `LockstepClient` (class)

    export declare class LockstepClient {
        readonly onWelcome: Signal<LockstepWelcome>;
        readonly onTick: Signal<TickEvent>;
        readonly onReject: Signal<{
            reason: string;
        }>;
        readonly onDesync: Signal<{
            tick: number;
            checksums: Record<string, number>;
        }>;
        readonly onClose: Signal<void>;

        readonly onProtocolError: Signal<{
            reason: string;
        }>;
        private socket;
        private readonly url;
        private readonly createSocket;
        private readonly validateInput?;
        private readonly maxMessageBytes;
        private _id;
        constructor(options: LockstepClientOptions);

        get id(): string | null;
        get connected(): boolean;
        connect(): void;

        submitInput(payload: unknown, checksum?: number): void;
        close(): void;
        private handleMessage;
    }

### `LockstepClientOptions` (interface)

    export interface LockstepClientOptions {
        url: string;

        create?: (url: string) => WebSocketLike;

        validateInput?: (payload: unknown) => boolean | string;

        maxMessageBytes?: number;

        allowInsecure?: boolean;
    }

### `LockstepWelcome` (interface)

    export interface LockstepWelcome {
        id: string;

        seed?: number;

        initialState?: unknown;
    }

### `LogEntry` (interface)

    export interface LogEntry {
        level: LogLevel;
        category: string;
        message: string;
        data?: unknown;
        time: number;
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

### `LoggerOptions` (interface)

    export interface LoggerOptions {

        level?: LogLevel;

        sink?: (entry: LogEntry) => void;
    }

### `LogLevel` (type)

    export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

### `manhattan` (function)

    export declare function manhattan(a: {
        readonly x: number;

### `MarkdownSpan` (interface)

    export interface MarkdownSpan {
        text: string;
        bold: boolean;
        italic: boolean;
    }

### `markupAccessibilityText` (function)

    export declare function markupAccessibilityText(spans: readonly MarkupSpan[], options?: {
        describeImage?: (path: string) => string;

### `MarkupAlign` (type)

    export type MarkupAlign = 'left' | 'center' | 'right';

### `MarkupDirection` (type)

    export type MarkupDirection = 'ltr' | 'rtl';

### `MarkupLayout` (interface)

    export interface MarkupLayout {

        readonly measure: MarkupMeasure;

        readonly maxWidth: number;

        readonly lineHeight: number;

        readonly direction?: MarkupDirection;

        readonly align?: MarkupAlign;
    }

### `MarkupLine` (interface)

    export interface MarkupLine {
        readonly spans: readonly MarkupSpan[];
        readonly width: number;
    }

### `MarkupMeasure` (type)

    export type MarkupMeasure = (piece: Pick<MarkupSpan, 'text' | 'bold' | 'italic' | 'size' | 'image' | 'tag'>) => number;

### `MarkupOptions` (interface)

    export interface MarkupOptions {

        readonly variables?: Readonly<Record<string, string>>;

        readonly tags?: ReadonlySet<string>;
    }

### `MarkupSpan` (interface)

    export interface MarkupSpan extends MarkdownSpan {

        color?: string;

        size?: number;

        image?: string;

        tag?: string;
    }

### `MarkupText` (class)

    export declare class MarkupText extends Container {
        private readonly opts;
        private readonly themeListener;
        constructor(options?: MarkupTextOptions);

        setText(value: string): void;

        private rebuild;
        private measurePiece;

        private tagStyle;

        private resolvedFont;
        private textFor;
        private spriteFor;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `MarkupTextOptions` (interface)

    export interface MarkupTextOptions {
        text?: string;

        maxWidth?: number;

        lineHeight?: number;
        align?: MarkupAlign;

        direction?: MarkupDirection;

        resolution?: number;

        resolveImage?: (path: string) => Texture2D;

        variables?: Readonly<Record<string, string>>;

        tagStyles?: Readonly<Record<string, TextStyleOptions>>;
    }

### `markupToHtml` (function)

    export declare function markupToHtml(spans: readonly MarkupSpan[]): string;

### `maskPixels` (function)

    export declare function maskPixels(base: Uint8ClampedArray, baseWidth: number, baseHeight: number, mask: Uint8ClampedArray, maskWidth: number, maskHeight: number, offsetX: number, offsetY: number): Uint8ClampedArray;

### `matchTerrainRule` (function)

    export declare function matchTerrainRule(rule: TerrainRule, x: number, y: number, flagsAt: TerrainFlagsAt, rotate?: TerrainRotate, rotationIndex?: number): boolean;

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

### `MersenneTwisterState` (interface)

    export interface MersenneTwisterState {

        seed: number;

        state: number[];

        index: number;

        discard: number;
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

### `MessageBoxOptions` (interface)

    export interface MessageBoxOptions {
        width: number;
        height: number;
        pages: Array<MessagePage | string>;

        speed?: number;

        choices?: Choice[];

        onDone?: (chosen: unknown) => void;

        onSound?: (path: string) => void;

        dims?: boolean;

        blocker?: boolean;

        anchor?: 'center' | 'bottom' | 'top';

        announce?: boolean;

        mode?: 'adv' | 'nvl';

        autoAdvance?: number;
    }

### `messageBoxPresenter` (function)

    export declare function messageBoxPresenter(windows: WindowStack, options?: MessageBoxPresenterOptions): DialoguePresenter;

### `MessageBoxPresenterOptions` (interface)

    export interface MessageBoxPresenterOptions {

        width?: number;
        height?: number;
        speed?: number;
        anchor?: 'center' | 'bottom' | 'top';
    }

### `MessageLevel` (type)

    export type MessageLevel = 'info' | 'positive' | 'negative' | 'warning' | 'highlight';

### `MessageLog` (class)

    export declare class MessageLog extends Container {
        private readonly blocks;
        private readonly options;
        private maxLines;
        constructor(options: MessageLogOptions);
        get entryCount(): number;

        get contentHeight(): number;

        lastEntries(count: number): MessageLogEntry[];
        add(text: string, level?: MessageLevel): void;
        setMaxLines(lines: number): void;
        setWrapWidth(width: number): void;
        clear(): void;
        private colorOf;
        private linesOf;
        private trim;
        private layout;
    }

### `MessageLogEntry` (interface)

    export interface MessageLogEntry {
        text: string;
        level: MessageLevel;
    }

### `MessageLogOptions` (interface)

    export interface MessageLogOptions {

        wrapWidth: number;

        maxLines?: number;

        size?: number;

        colors?: Partial<Record<MessageLevel, number>>;

        resolution?: number;
    }

### `MessagePage` (interface)

    export interface MessagePage {
        text: string;

        speaker?: string;

        portrait?: Texture2D;
    }

### `Meter` (class)

    export declare class Meter extends Container {
        private emptyLayer;
        private filledLayer;
        private maskShape;
        private count_;
        private size_;
        private gap_;
        private value_;
        private explicitColor;
        private fillColor;
        private emptyColor_?;
        private readonly filledTexture?;
        private readonly emptyTexture?;
        private readonly themeListener;
        constructor(options: MeterOptions);

        get value(): number;

        get count(): number;

        get color(): number;
        setValue(value: number, count?: number): void;

        setColor(color: number): void;
        resize(size: number, gap?: number): void;
        private get totalWidth();
        private iconX;
        private draw;
        private icon;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `MeterOptions` (interface)

    export interface MeterOptions {

        count: number;

        value?: number;

        size?: number;

        gap?: number;

        filledTexture?: Texture2D;

        emptyTexture?: Texture2D;

        color?: number;

        emptyColor?: number;
    }

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

### `MinimapMarker` (interface)

    export interface MinimapMarker {
        x: number;
        y: number;
        facing?: number;
        color?: number;
    }

### `MinimapOptions` (interface)

    export interface MinimapOptions {

        widthInCells: number;
        heightInCells: number;

        cellSize?: number;

        shape?: 'square' | 'hex';
    }

### `motionDuration` (function)

    export declare function motionDuration(duration: number, intent?: MotionIntent): number;

### `MotionHandle` (interface)

    export interface MotionHandle {
        readonly done: Promise<void>;
        cancel(): void;
    }

### `MotionIntent` (type)

    export type MotionIntent = 'decorative' | 'meaningful';

### `MotionTarget` (interface)

    export interface MotionTarget {
        x: number;
        y: number;
        rotation: number;
        scale: {
            x: number;
            y: number;
        };
        skew: {
            x: number;
            y: number;
        };
    }

### `Mwl` (namespace)

    export * as Mwl from './mwl/index.ts'

### `NeighborMask` (interface)

    export interface NeighborMask {
        n: boolean;
        e: boolean;
        s: boolean;
        w: boolean;
        ne: boolean;
        se: boolean;
        sw: boolean;
        nw: boolean;
    }

### `NEIGHBOURS4` (const)

    export declare const NEIGHBOURS4: ReadonlyArray<readonly [number, number]>;

### `NEIGHBOURS8` (const)

    export declare const NEIGHBOURS8: ReadonlyArray<readonly [number, number]>;

### `newlyRevealed` (function)

    export declare function newlyRevealed(explored: ReadonlySet<number>, alreadyDrawn: ReadonlySet<number>): number[];

### `NewsClient` (class)

    export declare class NewsClient extends HttpTransport {
        constructor(options: NewsOptions);

        fetchItems(): Promise<NewsItem[]>;
    }

### `NewsItem` (interface)

    export interface NewsItem {
        id: string;
        title: string;
        body: string;
        publishedAt?: number;
    }

### `NewsOptions` (type)

    export type NewsOptions = HttpTransportOptions;

### `NewsSeenOptions` (interface)

    export interface NewsSeenOptions {
        namespace: string;
        storage?: SaveStorage;
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

### `NinePatchOptions` (interface)

    export interface NinePatchOptions {

        border: number | {
            left: number;
            top: number;
            right: number;
            bottom: number;
        };
    }

### `NO_COLOR_ADD` (const)

    export declare const NO_COLOR_ADD = 0;

### `Node2D` (class)

    export declare class Node2D extends Container {
    }

### `OnScreenKeyboard` (class)

    export declare class OnScreenKeyboard extends Container {
        private readonly laidOutHeight;
        constructor(layout: KeyboardLayout, options: {
            width: number;
        });

        get contentHeight(): number;
    }

### `packColorAdd` (function)

    export declare function packColorAdd(r: number, g: number, b: number, a?: number): number;

### `packTintAdd` (function)

    export declare function packTintAdd(color: number, strength: number): number;

### `paintFogPixels` (function)

    export declare function paintFogPixels(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number, resolution: number, state: (x: number, y: number) => FogCell, palette: readonly FogColor[]): void;

### `PaletteMapping` (interface)

    export interface PaletteMapping {
        readonly from: readonly number[];
        readonly to: readonly number[];
    }

### `PaletteRange` (interface)

    export interface PaletteRange {
        readonly min: number;
        readonly mid: number;
        readonly max: number;
    }

### `paletteRangeMapping` (function)

    export declare function paletteRangeMapping(reference: readonly number[], range: PaletteRange): PaletteMapping;

### `PaletteRemapMode` (type)

    export type PaletteRemapMode = 'exact' | 'nearest';

### `parseColorPairs` (function)

    export declare function parseColorPairs(args: readonly string[], resolve?: (name: string) => number | undefined): PaletteMapping;

### `parseCSV` (function)

    export declare function parseCSV<T = Record<string, string>>(source: string, options?: CsvOptions): T[];

### `parseDialogueLines` (function)

    export declare function parseDialogueLines(source: string): DialogueLine[];

### `parseDialogueText` (function)

    export declare function parseDialogueText(source: string): StageCommand[];

### `ParsedImagePath` (interface)

    export interface ParsedImagePath {
        readonly path: string;
        readonly modifiers: readonly ImageModifier[];
    }

### `parseImagePath` (function)

    export declare function parseImagePath(value: string): ParsedImagePath;

### `parseInbound` (function)

    export declare function parseInbound(text: string, options?: SizeLimitOptions & {
        label?: string;

### `parseMarkdown` (function)

    export declare function parseMarkdown(text: string): MarkdownSpan[];

### `parseMarkup` (function)

    export declare function parseMarkup(source: string, options?: MarkupOptions): MarkupSpan[];

### `parsePaletteLists` (function)

    export declare function parsePaletteLists(args: readonly string[], resolve?: (name: string) => number | undefined): PaletteMapping;

### `parseReplayEvents` (function)

    export declare function parseReplayEvents(parsed: unknown): ReplayEvent[];

### `parseRotateMode` (function)

    export declare function parseRotateMode(argument: string | undefined): RotateMode;

### `parseTwee` (function)

    export declare function parseTwee(source: string): TweeStory;

### `Particle` (interface)

    export interface Particle {
        x: number;
        y: number;
        vx: number;
        vy: number;

        age: number;

        life: number;
        rotation: number;
        spin: number;

        scale: number;
        alpha: number;

        tint: number;

        frame: number;

        active: boolean;
    }

### `ParticleCurve` (type)

    export type ParticleCurve = (t: number) => number;

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
        private readonly scaleOf;
        private readonly alphaOf;
        private readonly flicker;
        private readonly spin;
        private readonly tintRange;

        private readonly frames?;

        private readonly spawnArea;
        private emitting;
        private followTarget;
        private followOffsetX;
        private followOffsetY;
        private followEnabled;
        private followVisible;

        private poolCursor;

        private debt;
        constructor(options?: ParticleEmitterOptions);

        start(): void;

        stop(): void;

        attach(target: FollowTarget, options?: FollowOptions): void;

        detach(): void;

        get attachedTo(): FollowTarget | null;
        private syncFollow;
        private followEmissionAllowed;
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

### `ParticleEmitterOptions` (interface)

    export interface ParticleEmitterOptions {

        texture?: Texture2D;

        frames?: readonly Texture2D[];

        max?: number;

        rate?: number;

        life?: ParticleRange;

        speed?: ParticleRange;

        angle?: ParticleRange;

        gravity?: {
            x: number;
            y: number;
        };

        scale?: readonly [number, number] | ParticleCurve;

        alpha?: readonly [number, number] | ParticleCurve;

        flicker?: number;

        spin?: ParticleRange;

        spawn?: ParticleSpawnArea;

        tint?: ParticleRange;
    }

### `ParticleRange` (type)

    export type ParticleRange = number | readonly [number, number];

### `ParticleSpawnArea` (interface)

    export interface ParticleSpawnArea {
        shape: 'rect' | 'ellipse';

        width: number;

        height?: number;
    }

### `pickReplayFile` (function)

    export declare function pickReplayFile(accept?: string): Promise<Blob | null>;

### `pixelToHex` (function)

    export declare function pixelToHex(px: number, py: number, tileWidth: number, tileHeight: number, shape?: HexShape): HexCoord;

### `Player` (class)

    export declare class Player {
        private frame;
        private index;
        private readonly fromFrame;
        private readonly events;
        private readonly dispatch;
        private readonly frames;
        private readonly onFrame;
        constructor(events: readonly ReplayEvent[], dispatch: (action: string) => void, frames: Signal<number>, options?: {
            fromFrame?: number;
        });

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

### `PlayerInputOptions` (interface)

    export interface PlayerInputOptions {

        padIndex?: number;
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

### `PlayerStatsOptions` (interface)

    export interface PlayerStatsOptions<T, S = T> {

        namespace: string;
        storage?: SaveStorage;

        initial: T;

        combine: (total: T, summary: S) => T;
    }

### `PositionedMarkupSpan` (interface)

    export interface PositionedMarkupSpan {

        readonly span: MarkupSpan;

        readonly x: number;

        readonly y: number;

        readonly width: number;
    }

### `positionMarkupLines` (function)

    export declare function positionMarkupLines(lines: readonly MarkupLine[], layout: MarkupLayout): PositionedMarkupSpan[];

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

### `PresentationQueueOptions` (interface)

    export interface PresentationQueueOptions<Event> {

        play: (event: Event) => number | void;
    }

### `Projectile` (class)

    export declare class Projectile {
        private sprite;
        private fromX;
        private fromY;
        private toX;
        private toY;
        private duration;
        private readonly animation?;
        private elapsed;
        private arrived;
        constructor(sprite: ProjectilePoint, from: ProjectilePoint, to: ProjectilePoint, options?: ProjectileOptions);
        get done(): boolean;

        get progress(): number;

        get frame(): AnimationFrame | undefined;

        get frameOffset(): ProjectilePoint;

        update(dt: number): boolean;
    }

### `ProjectileOptions` (interface)

    export interface ProjectileOptions {

        speed?: number;

        duration?: number;

        animation?: Animation;
    }

### `ProjectilePoint` (interface)

    export interface ProjectilePoint {
        x: number;
        y: number;
    }

### `QualityScaler` (class)

    export declare class QualityScaler {
        private ceiling;
        private readonly floor;
        private readonly budget;
        private readonly downAfter;
        private readonly upAfter;
        private readonly step;
        private ratio_;
        private over;
        private under;
        constructor(options: QualityScalerOptions);

        get ratio(): number;

        setCeiling(ceiling: number): number;

        observe(frameSeconds: number): number;

        reset(): void;
    }

### `QualityScalerOptions` (interface)

    export interface QualityScalerOptions {

        ceiling: number;

        minRatio?: number;

        targetFps?: number;

        overBudgetFrames?: number;

        underBudgetFrames?: number;

        step?: number;
    }

### `RadioGroup` (class)

    export declare class RadioGroup extends Container {
        readonly onChange: Signal<number>;
        private options_;
        private rows;
        private circles;
        private size_;
        private gap_;
        private selected_;
        private readonly themeListener;
        constructor(options?: RadioGroupOptions);
        get selected(): number;
        get selectedOption(): RadioOption | null;
        get length(): number;
        get rowHeight(): number;
        setOptions(options: RadioOption[], selected?: number): void;

        select(index: number): void;

        move(delta: number): boolean;

        handleAction(action: Action): boolean;

        tapRow(index: number): void;
        private defaultSelection;
        private buildRows;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `RadioGroupOptions` (interface)

    export interface RadioGroupOptions {
        options?: RadioOption[];

        selected?: number;

        size?: number;

        gap?: number;
    }

### `RadioOption` (interface)

    export interface RadioOption {

        text: string;

        disabled?: boolean;

        value?: unknown;
    }

### `Random` (namespace)

    export * as Random from './Random.ts'

### `RandomSource` (interface)

    export interface RandomSource extends FloatSource {

        int(bound: number): number;
    }

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

### `ReactionRule` (interface)

    export interface ReactionRule<TState> {
        id: string;
        when: (state: Readonly<TState>) => boolean;
        action: (state: Readonly<TState>) => void;

        once?: boolean;
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

### `readReplayFile` (function)

    export declare function readReplayFile(file: Blob): Promise<string>;

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

### `RebindScreenOptions` (interface)

    export interface RebindScreenOptions {
        width: number;
        height: number;

        actions: readonly Action[];

        label?: (action: Action) => string;
        rowHeight?: number;

        onConflict?: (key: string, action: Action, previousOwners: readonly Action[]) => boolean;
    }

### `RecolorProbe` (interface)

    export interface RecolorProbe {
        createCanvas?(width: number, height: number): RemapCanvas | null;
    }

### `recolorTexture` (function)

    export declare function recolorTexture(texture: Texture, mapping: PaletteMapping, probe?: RecolorProbe, mode?: PaletteRemapMode): Texture;

### `Recorder` (class)

    export declare class Recorder {
        private frameStamp;
        private readonly fromFrame;
        private readonly recorded;
        private readonly actions;
        private readonly frames;
        private readonly onAction;
        private readonly onFrame;
        constructor(actions: Signal<string>, frames: Signal<number>, options?: {
            fromFrame?: number;
        });
        get events(): readonly ReplayEvent[];

        get frame(): number;

        toJSON(): ReplayEvent[];

        stop(): void;
    }

### `Rect` (interface)

    export interface Rect {
        x: number;
        y: number;
        width: number;
        height: number;
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

### `RemapCanvas` (interface)

    export interface RemapCanvas {
        width: number;
        height: number;
        getContext(kind: '2d'): RemapCanvasContext | null;
    }

### `RemapCanvasContext` (interface)

    export interface RemapCanvasContext {
        drawImage(image: unknown, dx: number, dy: number): void;
        getImageData(sx: number, sy: number, sw: number, sh: number): {
            data: Uint8ClampedArray;
        };
        putImageData(imageData: {
            data: Uint8ClampedArray;
            width: number;
            height: number;
        }, dx: number, dy: number): void;
    }

### `remapPixels` (function)

    export declare function remapPixels(pixels: Uint8ClampedArray, mapping: PaletteMapping, mode?: PaletteRemapMode): Uint8ClampedArray;

### `RENDERING_DECISIONS` (const)

    export declare const RENDERING_DECISIONS: readonly RenderingDecision[];

### `RenderingDecision` (interface)

    export interface RenderingDecision {
        workload: GraphicsWorkload;
        preferred: string;
        fallback: string;
        reason: string;
    }

### `ReplayEvent` (interface)

    export interface ReplayEvent {
        frame: number;
        action: string;
    }

### `ReplayFile` (interface)

    export interface ReplayFile {
        format: 'mwg-replay';
        version: 1;

        framework: string;

        game: string;

        seed?: number;

        recordedAt?: number;
        events: readonly ReplayEvent[];
    }

### `ReplayFileMeta` (interface)

    export interface ReplayFileMeta {
        framework: string;
        game: string;
        seed?: number;
        recordedAt?: number;
    }

### `resolveAnchor` (function)

    export declare function resolveAnchor(spec: AnchorSpec, bounds: LayoutRect, size?: {
        width: number;

### `resolveTerrainGraphics` (function)

    export declare function resolveTerrainGraphics(width: number, height: number, rules: readonly TerrainRule[], flagsAt: TerrainFlagsAt, options?: ResolveTerrainGraphicsOptions): TerrainPlacement[];

### `ResolveTerrainGraphicsOptions` (interface)

    export interface ResolveTerrainGraphicsOptions {
        rotate?: TerrainRotate;

        random?: Generator;
    }

### `Resources` (namespace)

    export * as Resources from './assets/index.ts'

### `resumeRunPlayer` (function)

    export declare function resumeRunPlayer<T>(checkpoint: RunCheckpoint<T>, dispatch: (action: string) => void, frames: Signal<number>): Player;

### `revealComplete` (function)

    export declare function revealComplete(state: RevealState): boolean;

### `RevealState` (interface)

    export interface RevealState {

        total: number;

        speed: number;

        revealed: number;
    }

### `RichLabel` (class)

    export declare class RichLabel extends HTMLText {
        private readonly opts;
        private readonly tags;
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

### `RichLabelOptions` (interface)

    export interface RichLabelOptions extends ThemedTextOptions {

        resolution?: number;

        tagStyles?: Record<string, HTMLTextStyleOptions>;
    }

### `Roguelike` (namespace)

    export * as Roguelike from './roguelike/index.ts'

### `RotatedPixels` (interface)

    export interface RotatedPixels {
        readonly data: Uint8ClampedArray;
        readonly width: number;
        readonly height: number;
    }

### `RotateMode` (type)

    export type RotateMode = 'nearest' | 'linear';

### `rotatePixels` (function)

    export declare function rotatePixels(pixels: Uint8ClampedArray, width: number, height: number, degrees: number, mode?: RotateMode): RotatedPixels;

### `Rpg` (namespace)

    export * as Rpg from './rpg/index.ts'

### `RPGM_AUTOTILE_SLOT_BASES` (const)

    export declare const RPGM_AUTOTILE_SLOT_BASES: readonly [2048, 2816, 4352, 5888];

### `RPGM_AUTOTILE_SLOT_COUNTS` (const)

    export declare const RPGM_AUTOTILE_SLOT_COUNTS: readonly [768, 1536, 1536, 2304];

### `RPGM_FLOOR_AUTOTILE_TABLE` (const)

    export declare const RPGM_FLOOR_AUTOTILE_TABLE: RpgmAutotileShapeTable;

### `RPGM_WALL_AUTOTILE_TABLE` (const)

    export declare const RPGM_WALL_AUTOTILE_TABLE: RpgmAutotileShapeTable;

### `RpgmAutotileAtlas` (class)

    export declare class RpgmAutotileAtlas {
        private readonly cache;
        private readonly table;
        constructor(table: RpgmAutotileShapeTable);
        get(tileId: number, slot: RpgmAutotileSlot, shape: number): RpgmAutotileFrame;
        clear(): void;
    }

### `rpgmAutotileFrame` (function)

    export declare function rpgmAutotileFrame(tileId: number, slot: RpgmAutotileSlot, shape: number, table: RpgmAutotileShapeTable): RpgmAutotileFrame;

### `RpgmAutotileFrame` (interface)

    export interface RpgmAutotileFrame {
        tileId: number;
        slot: RpgmAutotileSlot;
        shape: number;
        destinationX: number;
        destinationY: number;
        quadrants: readonly [RpgmAutotileQuadrant, RpgmAutotileQuadrant, RpgmAutotileQuadrant, RpgmAutotileQuadrant];
    }

### `RpgmAutotileQuadrant` (interface)

    export interface RpgmAutotileQuadrant {
        sourceX: number;
        sourceY: number;
        destinationX: number;
        destinationY: number;
    }

### `RpgmAutotileShape` (type)

    export type RpgmAutotileShape = readonly [
        readonly [number, number],
        readonly [number, number],
        readonly [number, number],
        readonly [number, number]
    ];

### `RpgmAutotileShapeTable` (type)

    export type RpgmAutotileShapeTable = readonly RpgmAutotileShape[];

### `rpgmAutotileSlot` (function)

    export declare function rpgmAutotileSlot(tile: number): RpgmAutotileSlot | null;

### `RpgmAutotileSlot` (type)

    export type RpgmAutotileSlot = 0 | 1 | 2 | 3;

### `rpgmTableEdgeCells` (function)

    export declare function rpgmTableEdgeCells(map: RpgmTableEdgeMap): Int32Array;

### `RpgmTableEdgeMap` (interface)

    export interface RpgmTableEdgeMap {
        width: number;
        height: number;

        ground: ArrayLike<number>;

        objects: ArrayLike<number>;

        flags: {
            readonly [tile: number]: number | undefined;
        };
    }

### `runCheckpoint` (function)

    export declare function runCheckpoint<T>(recorder: Recorder, state: T): RunCheckpoint<T>;

### `RunCheckpoint` (interface)

    export interface RunCheckpoint<T> {
        version: 1;

        frame: number;
        events: readonly ReplayEvent[];
        state: T;
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

### `RunHistoryEntry` (interface)

    export interface RunHistoryEntry<T> {
        id: string;
        endedAt: number;
        summary: T;
    }

### `RunHistoryOptions` (interface)

    export interface RunHistoryOptions {

        namespace: string;
        storage?: SaveStorage;

        limit?: number;
    }

### `sanitizeInboundText` (function)

    export declare function sanitizeInboundText(text: string, options?: SizeLimitOptions): string;

### `SaveData` (interface)

    export interface SaveData<T> {
        meta: SaveMeta;
        state: T;
    }

### `SaveMeta` (interface)

    export interface SaveMeta {
        version: number;
        savedAt: number;

        preview?: unknown;
    }

### `SaveStorage` (interface)

    export interface SaveStorage {
        read(key: string): string | null;
        write(key: string, value: string): void;
        remove(key: string): void;
        keys(): string[];
    }

### `SaveSyncClient` (class)

    export declare class SaveSyncClient extends HttpTransport {
        constructor(options: SaveSyncOptions);

        upload(slot: string, payload: string): Promise<SaveSyncResponse>;

        download(slot: string): Promise<string>;

        list(): Promise<string[]>;
        private slotUrl;
    }

### `SaveSyncOptions` (type)

    export type SaveSyncOptions = HttpTransportOptions;

### `SaveSyncResponse` (interface)

    export interface SaveSyncResponse {
        ok: boolean;
        status: number;
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

### `SaveSystemOptions` (interface)

    export interface SaveSystemOptions {

        namespace: string;
        version: number;

        migrations?: Record<number, (state: unknown) => unknown>;
        storage?: SaveStorage;
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

### `Scene2DClass` (type)

    export type Scene2DClass = new () => Scene2D;

### `SceneClass` (type)

    export type SceneClass<T extends Scene = Scene> = new () => T;

### `SceneComponent` (interface)

    export interface SceneComponent<TScene extends Scene = Scene> {
        readonly name: string;
        create?(scene: TScene): void;
        update?(scene: TScene, dt: number): void;
        resize?(scene: TScene, width: number, height: number): void;
        onSuspend?(scene: TScene): void;
        onResume?(scene: TScene, result: unknown): void;
        destroy?(scene: TScene): void;
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

### `Schema` (type)

    export type Schema = {
        type: 'string';

### `scramble` (function)

    export declare function scramble(text: string, key: string): string;

### `ScreenEffectPhase` (type)

    export type ScreenEffectPhase = 'idle' | 'fadeOut' | 'fadeIn' | 'flash' | 'hold';

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

        private queue;
        constructor(options?: ScreenEffectsOptions);

        setViewport(width: number, height: number): void;
        private redraw;

        get isBusy(): boolean;

        get washAlpha(): number;

        fadeOut(duration: number, color?: number): void;

        fadeIn(duration: number, color?: number): void;

        flash(duration: number, color?: number, peak?: number): void;

        sequence(steps: readonly ScreenEffectStep[]): void;

        setTint(color: number, alpha: number): void;

        clear(): void;

        private beginStep;

        private advance;

        private begin;

        update(dt: number): boolean;
    }

### `ScreenEffectsOptions` (interface)

    export interface ScreenEffectsOptions {
        width?: number;
        height?: number;

        color?: number;
    }

### `ScreenEffectStep` (interface)

    export interface ScreenEffectStep {
        kind: 'fadeOut' | 'fadeIn' | 'flash' | 'hold';
        duration: number;

        color?: number;

        peak?: number;
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

### `ScriptOptions` (interface)

    export interface ScriptOptions {
        stage: DialogueStage;
        windows: WindowStack;

        backdrop: (name: string) => Texture;

        displayName?: (id: string) => string;

        boxWidth?: number;
        boxHeight?: number;

        speed?: number;

        mode?: 'adv' | 'nvl';
    }

### `ScriptState` (interface)

    export interface ScriptState {

        answers: Record<string, unknown>;
    }

### `ScrollBox` (class)

    export declare class ScrollBox extends Container {
        readonly onChange: Signal<number>;

        readonly content: Container<import("pixi.js").ContainerChild>;
        private maskShape;
        private track;
        private thumb;
        private width_;
        private height_;
        private contentHeight_;
        private offset_;
        private readonly themeListener;
        constructor(options: ScrollBoxOptions);
        get offset(): number;
        get contentHeight(): number;
        get viewportHeight(): number;

        get maxOffset(): number;
        get scrollable(): boolean;
        setContentHeight(height: number): void;
        resize(width: number, height: number): void;
        scrollBy(delta: number): void;
        scrollTo(offset: number): void;

        scrollIntoView(top: number, height: number): void;
        private setOffset;
        private readonly handleWheel;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `ScrollBoxOptions` (interface)

    export interface ScrollBoxOptions {
        width: number;
        height: number;

        contentHeight?: number;
        offset?: number;
    }

### `scrollOffset` (function)

    export declare function scrollOffset(offset: number, contentSize: number, viewportSize: number): number;

### `serializeReplay` (function)

    export declare function serializeReplay(events: readonly ReplayEvent[]): string;

### `Session` (class)

    export declare class Session {

        readonly launches: number;
        constructor(options?: SessionOptions);
    }

### `SessionOptions` (interface)

    export interface SessionOptions {

        namespace?: string;
        storage?: SaveStorage;
    }

### `setReducedMotion` (function)

    export declare function setReducedMotion(value: boolean | null): void;

### `setTheme` (function)

    export declare function setTheme(next: Partial<Theme>): void;

### `Settings` (class)

    export declare class Settings {
        private readonly storage;
        private readonly key;
        private value;
        constructor(options?: SettingsOptions);

        get current(): GameSettings;

        getCustom(key: string, fallback: CustomSettingValue): CustomSettingValue;

        setCustom(key: string, value: CustomSettingValue): void;
        setMusicVolume(volume: number): void;
        setSfxVolume(volume: number): void;
        setMuted(muted: boolean): void;
        setZoom(zoom: number): void;
        setBindings(bindings: Readonly<Record<Action, readonly string[]>>): void;
        update(patch: {
            musicVolume?: number;
            sfxVolume?: number;
            muted?: boolean;
            zoom?: number;
            bindings?: Readonly<Record<Action, readonly string[]>>;
            custom?: Readonly<Record<string, CustomSettingValue>>;
        }): void;

        applyBindings(): void;

        reset(): void;
    }

### `SettingsCustomRow` (type)

    export type SettingsCustomRow = {
        kind: 'boolean';

### `SettingsOptions` (interface)

    export interface SettingsOptions {

        namespace?: string;
        storage?: SaveStorage;
    }

### `SettingsScreen` (class)

    export declare class SettingsScreen extends Container {
        private readonly settings;
        private readonly width_;
        private readonly rowHeight;
        private readonly labels;
        private readonly zoomMin;
        private readonly zoomMax;
        private readonly zoomStep;
        private readonly customRows;
        private readonly actionsOption;
        private readonly onConflict;
        private readonly highlight;
        private readonly main;
        private readonly rebindLayer;
        private rows;
        private selected;
        private rebind;
        private readonly themeListener;
        constructor(options: SettingsScreenOptions);

        get selectedRow(): string;

        get isRebinding(): boolean;

        handleAction(action: Action): boolean;

        refresh(): void;
        private select;
        private drawHighlight;
        private buildMain;
        private addSliderRow;
        private readSlider;
        private addToggleRow;
        private readToggle;
        private addCustomRow;
        private addActionRow;
        private openRebind;
        private closeRebind;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `SettingsScreenOptions` (interface)

    export interface SettingsScreenOptions {
        settings: Settings;
        width?: number;
        rowHeight?: number;

        labels?: {
            music?: string;
            sfx?: string;
            muted?: string;
            zoom?: string;
            controls?: string;
            reset?: string;
            rebindHint?: string;
        };
        zoomMin?: number;
        zoomMax?: number;
        zoomStep?: number;

        custom?: readonly SettingsCustomRow[];

        actions?: readonly Action[];

        onConflict?: (key: string, action: Action, previousOwners: readonly Action[]) => boolean;
    }

### `ShadowLayerOptions` (interface)

    export interface ShadowLayerOptions {

        color?: number;

        alpha?: number;
    }

### `Shape2D` (class)

    export declare class Shape2D extends Graphics {
    }

### `sharpenText` (function)

    export declare function sharpenText(root: Container, devicePixelRatio: number): void;

### `ShowOptions` (interface)

    export interface ShowOptions {
        at?: SlotName | number;
        expression?: string;

        fade?: number;
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

### `SignalListener` (type)

    export type SignalListener<T> = (value: T) => boolean | void;

### `Simulation` (namespace)

    export * as Simulation from './simulation/index.ts'

### `SizeLimitOptions` (interface)

    export interface SizeLimitOptions {

        maxBytes?: number;
    }

### `Skin` (interface)

    export interface Skin {
        background?: number;
        border?: number;
        borderWidth?: number;
        text?: number;
        padding?: number;
        texture?: Texture2D;

        borderInset?: number;
    }

### `SkinData` (type)

    export type SkinData = Skin | SkinStates;

### `Skins` (class)

    export declare class Skins {
        private readonly map;

        static readonly ANY = "*";
        define(widget: string, state: WidgetState, skin: Skin): void;
        has(widget: string): boolean;
        widgets(): string[];

        resolve(widget: string, state?: WidgetState): Skin;

        statesOf(widget: string): WidgetState[];

        static from(data: Readonly<Record<string, SkinData>>): Skins;
    }

### `SkinStates` (type)

    export type SkinStates = Partial<Record<WidgetState, Skin>>;

### `sliceSpans` (function)

    export declare function sliceSpans(spans: readonly MarkdownSpan[], count: number): MarkdownSpan[];

### `Slider` (class)

    export declare class Slider extends Container {
        readonly onChange: Signal<number>;
        private track;
        private fill;
        private knob;
        private width_;
        private height_;
        private knobSize;
        private min;
        private max;
        private step;
        private value_;
        private disabled_;
        private dragging;
        private readonly themeListener;
        constructor(options: SliderOptions);

        get value(): number;

        get fraction(): number;
        get disabled(): boolean;
        setDisabled(disabled: boolean): void;
        setValue(value: number): void;

        setFraction(fraction: number): void;
        resize(width: number, height: number): void;
        private get trackLength();
        private snap;
        private fractionAt;
        private readonly handleDown;
        private readonly handleMove;
        private readonly handleUp;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `sliderFraction` (function)

    export declare function sliderFraction(value: number, min?: number, max?: number): number;

### `SliderOptions` (interface)

    export interface SliderOptions {
        width: number;
        height?: number;
        min?: number;
        max?: number;

        step?: number;
        value?: number;

        knobSize?: number;
        disabled?: boolean;
    }

### `sliderValueAt` (function)

    export declare function sliderValueAt(fraction: number, min?: number, max?: number, step?: number): number;

### `SlotName` (type)

    export type SlotName = 'left' | 'center' | 'right' | 'farLeft' | 'farRight';

### `snapZoom` (function)

    export declare function snapZoom(zoom: number, tileSize: number, resolution?: number): number;

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

### `SpawnerOptions` (interface)

    export interface SpawnerOptions<T> {
        waves: readonly Wave<T>[];
        onSpawn: (kind: T) => void;

        onWaveStart?: (waveIndex: number) => void;

        onComplete?: () => void;
    }

### `Spinner` (class)

    export declare class Spinner extends Container {
        readonly onChange: Signal<number>;
        private face;
        private width_;
        private height_;
        private min;
        private max;
        private step;
        private value_;
        private wrap;
        private disabled_;
        private readonly themeListener;
        constructor(options?: SpinnerOptions);
        get value(): number;
        get disabled(): boolean;
        setDisabled(disabled: boolean): void;
        setValue(value: number): void;
        increment(): void;
        decrement(): void;
        resize(width: number, height: number): void;
        private commit;
        private readonly handleTap;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `SpinnerOptions` (interface)

    export interface SpinnerOptions {
        width?: number;
        height?: number;
        min?: number;
        max?: number;
        step?: number;
        value?: number;

        wrap?: boolean;
        disabled?: boolean;
    }

### `spinValue` (function)

    export declare function spinValue(value: number, delta: number, min: number, max: number, step?: number, wrap?: boolean): number;

### `splitScreenHalves` (function)

    export declare function splitScreenHalves(width: number, height: number): [{
        x: number;

### `Sprite2D` (class)

    export declare class Sprite2D extends Sprite {
    }

### `SpriteAttachment` (class)

    export declare class SpriteAttachment {
        private readonly child;
        private readonly offsetX;
        private readonly offsetY;
        private readonly duration?;
        private elapsed;
        private expired;
        constructor(child: AttachmentPoint, options?: SpriteAttachmentOptions);
        get done(): boolean;

        follow(ownerX: number, ownerY: number): this;

        update(dt: number): boolean;
    }

### `SpriteAttachmentOptions` (interface)

    export interface SpriteAttachmentOptions {

        offsetX?: number;
        offsetY?: number;

        duration?: number;
    }

### `spriteColorMatrix` (function)

    export declare function spriteColorMatrix(sprite: Sprite, matrix: ColorMatrixFilter['matrix']): void;

### `SpriteGroup` (class)

    export declare class SpriteGroup {
        private members;

        get size(): number;

        add(member: SpriteGroupMember): this;

        remove(member: SpriteGroupMember): boolean;

        clear(): void;

        update(camera: Camera, dt: number, margin?: number): void;
    }

### `SpriteGroupMember` (interface)

    export interface SpriteGroupMember {
        x: number;
        y: number;
        update(dt: number): void;
    }

### `SpriteMotion` (class)

    export declare class SpriteMotion {
        private readonly target;
        private readonly tweener;
        private readonly ownsTweener;
        private readonly intent;
        private readonly rest;
        private readonly contributions;
        private readonly loops;
        private nextId;
        private flipX;
        private flipY;
        private destroyed;
        constructor(target: MotionTarget, options?: SpriteMotionOptions);

        squash(options: {
            amount: number;
            duration: number;
        }): MotionHandle;

        hop(options: {
            height: number;
            duration: number;
        }): MotionHandle;

        bob(options: {
            amplitude: number;
            period: number;
            cycles?: number;
        }): MotionHandle;

        wobble(options: {
            angle: number;
            duration: number;
        }): MotionHandle;

        spin(options: {
            turns: number;
            duration: number;
        }): MotionHandle;

        shear(options: {
            amount: number;
            duration: number;
        }): MotionHandle;

        flip(axis: 'x' | 'y', mirrored?: boolean): boolean;

        update(dt: number): void;

        get isBusy(): boolean;

        destroy(): void;
        private run;
        private loop;
        private write;
    }

### `SpriteMotionOptions` (interface)

    export interface SpriteMotionOptions {

        tweener?: Tweener;

        intent?: MotionIntent;
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

        static grid(path: string, frameWidth?: number, frameHeight?: number): SpriteSheet;
        static fromTexture(texture: Texture2D, frameWidth?: number, frameHeight?: number): SpriteSheet;
        get count(): number;

        name(name: string, index: number): this;

        nameAll(names: Readonly<Record<string, number>>): this;
        indexOf(name: string): number;
        get(frame: number | string): Texture2D;

        rect(index: number, x: number, y: number, width: number, height: number): this;

        region(frame: number | string): TextureRegion;

        range(from: number, to: number): Texture2D[];

        pick(...frames: Array<number | string>): Texture2D[];
    }

### `squareRotate` (function)

    export declare function squareRotate(dx: number, dy: number, rotationIndex: number, rotations: number): {
        dx: number;

### `StageChoice` (type)

    export type StageChoice = Choice & {

        goto?: string;

### `StageCommand` (type)

    export type StageCommand = {
        backdrop: string;

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

### `stateChecksum` (function)

    export declare function stateChecksum(value: unknown): number;

### `StateExtension` (interface)

    export interface StateExtension<T extends StateValue = StateValue> {

        readonly id: string;

        readonly capture: () => T;

        readonly restore: (state: T) => void;

        readonly version?: number;

        readonly migrations?: Readonly<Record<number, (state: StateValue) => T>>;

        readonly reset?: () => void;

        readonly remove?: () => void;
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

### `StateRestoreDiagnostic` (interface)

    export interface StateRestoreDiagnostic {
        readonly extension: string;
        readonly from: number;
        readonly to: number;
        readonly status: 'migrated' | 'unchanged' | 'reset' | 'removed';
    }

### `StateSnapshot` (interface)

    export interface StateSnapshot {
        readonly extensions: Readonly<Record<string, StateValue>>;
        readonly versions?: Readonly<Record<string, number>>;
    }

### `StateValue` (type)

    export type StateValue = null | boolean | number | string | StateValue[] | {
        readonly [key: string]: StateValue;

### `StatRow` (interface)

    export interface StatRow {
        label: string;
        value: string;
    }

### `StatsScreen` (class)

    export declare class StatsScreen extends Container {
        private text;
        constructor(options: StatsScreenOptions);

        setStats(stats: readonly StatRow[], width?: number): void;
        private static format;
    }

### `StatsScreenOptions` (interface)

    export interface StatsScreenOptions {
        width: number;
        stats: readonly StatRow[];
    }

### `StatusVisuals` (class)

    export declare class StatusVisuals {
        private target;
        private styles;
        private active;
        private elapsed;
        private flashColor;
        private flashStrength;
        private flashDuration;
        private flashRemaining;
        constructor(target: TintTarget, options: StatusVisualsOptions);

        set(kind: string, active: boolean): void;
        has(kind: string): boolean;

        flash(color: number, strength: number, duration: number): void;

        update(dt: number): void;
    }

### `StatusVisualsOptions` (interface)

    export interface StatusVisualsOptions {

        styles: Record<string, StatusVisualStyle>;
    }

### `StatusVisualStyle` (interface)

    export interface StatusVisualStyle {

        color: number;

        strength?: number;

        pulseRate?: number;
    }

### `StoryBeat` (interface)

    export interface StoryBeat {
        text: string;
        title?: string;

        image?: string;

        music?: string;
    }

### `StoryScreen` (class)

    export declare class StoryScreen extends Container {
        readonly sequence: StorySequence;
        private readonly backdrop;
        private readonly titleLabel;
        private readonly textLabel;
        private readonly textureFor;
        private readonly playMusic;
        private width_;
        private height_;
        constructor(options: StoryScreenOptions);

        get current(): StoryBeat | null;

        advance(): boolean;

        skip(): void;
        resize(width: number, height: number): void;
        private readonly handleAdvance;
        private readonly handleBeat;
        private applyBeat;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `StoryScreenOptions` (interface)

    export interface StoryScreenOptions {
        sequence: StorySequence;
        width: number;
        height: number;

        textureFor?: (path: string) => Texture | null;

        playMusic?: (track: string | null) => void;
    }

### `StoryScript` (type)

    export type StoryScript = Record<string, readonly StageCommand[]>;

### `StorySequence` (class)

    export declare class StorySequence {
        readonly onChange: Signal<StoryBeat>;
        readonly onMusic: Signal<string | null>;
        private readonly beats;
        private index;
        constructor(beats: readonly StoryBeat[]);
        get length(): number;

        get position(): number;

        get current(): StoryBeat | null;

        get done(): boolean;

        get music(): string | null;

        goTo(index: number): void;

        advance(): boolean;

        back(): boolean;

        skip(): void;
        restart(): void;
        private report;
    }

### `stripMarkdown` (function)

    export declare function stripMarkdown(text: string): string;

### `stripMarkup` (function)

    export declare function stripMarkup(source: string, options?: MarkupOptions): string;

### `SyncGuard` (class)

    export declare class SyncGuard {
        private readonly reference;
        private desyncTick;

        observe(tick: number, checksum: number): boolean;

        get divergent(): boolean;

        get atTick(): number | null;

        reset(): void;
    }

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

### `TabbedListOptions` (interface)

    export interface TabbedListOptions<T> {

        tabs: readonly ListTab[];

        rowsFor: (tabId: string) => readonly T[];

        pageSize?: number;

        label?: (row: T) => string;

        filter?: (row: T, query: string) => boolean;

        disabled?: (row: T) => boolean;
    }

### `TableColumn` (interface)

    export interface TableColumn<T> {

        key: string;

        label?: string;
        width?: number;
        align?: 'left' | 'right' | 'center';

        compare?: (a: T, b: T) => number;
    }

### `takeLastEntries` (function)

    export declare function takeLastEntries<T>(entries: readonly T[], count: number): T[];

### `TelemetryClient` (class)

    export declare class TelemetryClient extends HttpTransport {
        private consented;
        private readonly maxStringLength;
        private readonly maxProperties;
        private readonly allowed;
        constructor(options: TelemetryOptions);

        get hasConsent(): boolean;

        setConsent(granted: boolean): void;

        send(event: TelemetryEvent): Promise<TelemetryResponse | null>;

        private bounded;
    }

### `TelemetryEvent` (interface)

    export interface TelemetryEvent {
        name: string;
        properties?: Record<string, string | number | boolean | null>;
    }

### `TelemetryOptions` (interface)

    export interface TelemetryOptions extends HttpTransportOptions {

        maxStringLength?: number;

        maxProperties?: number;

        allowedProperties?: readonly string[];
    }

### `TelemetryResponse` (interface)

    export interface TelemetryResponse {
        ok: boolean;
        status: number;
    }

### `TerrainCondition` (interface)

    export interface TerrainCondition {
        readonly dx: number;
        readonly dy: number;
        readonly hasAll?: readonly string[];
        readonly hasAny?: readonly string[];
        readonly hasNone?: readonly string[];
    }

### `TerrainFlagsAt` (type)

    export type TerrainFlagsAt = (x: number, y: number) => ReadonlySet<string> | undefined;

### `TerrainGraphicsLayer` (class)

    export declare class TerrainGraphicsLayer extends Node2D {
        private placements;
        private readonly project;
        private readonly resolveImage;
        constructor(options: TerrainGraphicsLayerOptions);

        setPlacements(placements: readonly TerrainPlacement[]): void;
        private rebuild;
    }

### `TerrainGraphicsLayerOptions` (interface)

    export interface TerrainGraphicsLayerOptions {

        readonly placements: readonly TerrainPlacement[];

        readonly project: (x: number, y: number, dx: number, dy: number) => {
            x: number;
            y: number;
        };

        readonly resolveImage?: (path: string) => Texture2D;
    }

### `TerrainImage` (interface)

    export interface TerrainImage {
        readonly image: string;

        readonly dx?: number;
        readonly dy?: number;

        readonly layer?: number;
    }

### `TerrainPlacement` (interface)

    export interface TerrainPlacement {
        readonly x: number;
        readonly y: number;
        readonly ruleId: string;
        readonly image: string;
        readonly dx: number;
        readonly dy: number;
        readonly layer: number;
    }

### `TerrainRotate` (type)

    export type TerrainRotate = (dx: number, dy: number, rotationIndex: number, rotations: number) => {
        dx: number;

### `TerrainRule` (interface)

    export interface TerrainRule {
        readonly id: string;
        readonly conditions: readonly TerrainCondition[];
        readonly images: readonly TerrainImage[];

        readonly probability?: number;

        readonly rotations?: number;
    }

### `Text2D` (class)

    export declare class Text2D extends Text {
    }

### `TextModel` (class)

    export declare class TextModel {
        private text;
        private caretIndex;
        private anchor;
        private readonly maxLength?;
        private readonly mask;
        private readonly maskCharacter;
        private readonly multiline;
        private goalColumn;
        constructor(options?: TextModelOptions);
        get value(): string;

        get maskedValue(): string;
        get length(): number;
        get caret(): number;
        get selectionStart(): number;
        get selectionEnd(): number;
        get hasSelection(): boolean;
        get selectedText(): string;

        setValue(value: string): void;
        setCaret(index: number, extend?: boolean): void;

        insert(text: string): void;

        backspace(): void;

        deleteForward(): void;

        moveCaret(delta: number, extend?: boolean): void;
        moveToStart(extend?: boolean): void;
        moveToEnd(extend?: boolean): void;
        selectAll(): void;
        clearSelection(): void;

        replaceSelection(text: string): void;

        private shape;

        get lineCount(): number;

        get caretLine(): number;

        lineRange(line: number): readonly [number, number];

        moveCaretLine(delta: number, extend?: boolean): void;
        private limit;
    }

### `TextModelOptions` (interface)

    export interface TextModelOptions {
        value?: string;

        maxLength?: number;

        mask?: boolean;

        maskCharacter?: string;

        multiline?: boolean;
    }

### `TextPrompt` (class)

    export declare class TextPrompt extends Window {
        private readonly model;
        private readonly validate?;
        private readonly onConfirm;
        private readonly onCancel?;
        private readonly announce;
        private readonly announcer;
        private preview;
        private promptError;
        private readonly keyboard;
        private messageLabel;
        private valueLabel;
        private previewLabel;
        private errorLabel;
        private caretBar;
        private readonly measurer;
        private readonly lineHeight;
        private readonly valueY;
        private canMeasureCaret;
        private blinkOn;
        private blinkElapsed;
        private readonly promptThemeListener;
        private readonly textListener;
        private readonly compositionListener;
        constructor(options: TextPromptOptions);

        get value(): string;

        get caretIndex(): number;

        get error(): string | null;
        handleAction(action: Action): boolean;
        update(dt: number): void;
        destroy(options?: Parameters<Window['destroy']>[0]): void;

        private edit;
        private confirm;
        private restylePrompt;
        private render;
    }

### `TextPromptOptions` (interface)

    export interface TextPromptOptions {
        width: number;
        height: number;

        title?: string;

        message?: string;

        initialValue?: string;

        maxLength?: number;

        keyboard?: KeyboardLayout;

        validate?: (value: string) => string | null;

        onConfirm: (value: string) => void;

        onCancel?: () => void;

        dims?: boolean;

        blocker?: boolean;

        anchor?: 'center' | 'bottom' | 'top';

        announce?: boolean;

        announcer?: Pick<ScreenReader, 'announce'>;
    }

### `Texture2D` (export)

    export { Texture2D }

### `TextureRegion` (interface)

    export interface TextureRegion {
        texture: Texture;
        frame: Rect;
    }

### `theme` (function)

    export declare function theme(): Theme;

### `Theme` (interface)

    export interface Theme {

        panel?: Texture2D;

        panelBorder: number;

        padding: number;

        spacing: number;
        font: {
            family: string;
            size: number;

            lineHeight: number;
        };
        color: {
            text: number;
            textDim: number;
            textHighlight: number;

            panelFill: number;
            panelBorder: number;
            selection: number;

            overlay: number;
        };

        overlayAlpha: number;

        direction: Direction;
    }

### `themeChanged` (const)

    export declare const themeChanged: Signal<Theme>;

### `TickEvent` (interface)

    export interface TickEvent {
        tick: number;

        inputs: Record<string, unknown>;

        checksums?: Record<string, number>;
    }

### `TiledLayer` (interface)

    export interface TiledLayer {
        type: string;
        name: string;
        data?: number[];
        encoding?: string;
        objects?: TiledObject[];
    }

### `TiledMapData` (interface)

    export interface TiledMapData {
        width: number;
        height: number;
        tilewidth: number;
        tileheight: number;
        orientation?: string;

        staggeraxis?: string;
        staggerindex?: string;
        tilesets: Array<{
            firstgid: number;
            source?: string;
        }>;
        layers: TiledLayer[];
    }

### `TiledObject` (interface)

    export interface TiledObject {
        id: number;
        name?: string;
        type?: string;
        x: number;
        y: number;
        gid?: number;
        properties?: Array<{
            name: string;
            value: unknown;
        }>;
    }

### `TiledSprite` (class)

    export declare class TiledSprite extends TilingSprite {
    }

### `TiledTilesetData` (interface)

    export interface TiledTilesetData {
        tilewidth: number;
        tileheight: number;
        image: string;
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
        private beginLayer;

        addAutotileLayer(name: string, cells: ArrayLike<number>, set: AutotileSet | readonly AutotileSet[]): this;

        setAutotileFrame(layer: string | number, frame: number): void;

        addShadowLayer(name: string, bits: ArrayLike<number>, options?: ShadowLayerOptions): this;
        private buildShadowSprites;
        private setShadowCell;

        getAutotileFrame(layer: string | number): number;
        private resolveAutotileSet;
        private resolveRpgmSet;
        private resolveXpSet;
        private claimAutotileSets;
        private autotilePieces;
        private makeAutotileSprites;
        private setAutotileCell;
        private eachCellSprite;
        private firstCellSprite;
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

        stampRect(layer: string | number, x: number, y: number, width: number, height: number, frames: ArrayLike<number>): void;

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

### `TileMapOptions` (interface)

    export interface TileMapOptions {

        width: number;
        height: number;

        sheet: SpriteSheet | readonly SpriteSheet[];

        tileWidth?: number;
        tileHeight?: number;

        shape?: 'square' | 'hex' | 'isometric' | 'staggered';

        chunkSize?: number;

        heightStep?: number;
    }

### `TilesetSheet` (interface)

    export interface TilesetSheet {
        firstgid: number;
        sheet: SpriteSheet;
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

### `TintTarget` (interface)

    export interface TintTarget {

        colorAdd: number;
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

### `ToastOptions` (interface)

    export interface ToastOptions {

        fadeIn?: number;

        hold?: number;

        fadeOut?: number;

        scaleFrom?: number;
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

### `TooltipOptions` (interface)

    export interface TooltipOptions {

        delay?: number;

        maxWidth?: number;

        offset?: {
            x: number;
            y: number;
        };

        margin?: number;
    }

### `TreeNode` (interface)

    export interface TreeNode<T = unknown> {

        id: string;
        label: string;
        children?: readonly TreeNode<T>[];
        disabled?: boolean;
        data?: T;
    }

### `TreeRow` (interface)

    export interface TreeRow<T> {
        node: TreeNode<T>;
        depth: number;
        expanded: boolean;
        hasChildren: boolean;
    }

### `TreeView` (class)

    export declare class TreeView<T = unknown> {
        readonly onChange: Signal<void>;
        private roots_;
        private expanded;
        private current;
        private readonly disabledOf;
        constructor(options: TreeViewOptions<T>);
        get roots(): readonly TreeNode<T>[];

        get rows(): readonly TreeRow<T>[];
        get selectedIndex(): number;
        get selected(): TreeNode<T> | null;
        isExpanded(id: string): boolean;
        expand(id: string): void;
        collapse(id: string): void;
        toggle(id: string): void;
        expandAll(): void;
        collapseAll(): void;
        select(index: number): void;

        move(delta: number): void;
        private firstEnabled;
    }

### `TreeViewOptions` (interface)

    export interface TreeViewOptions<T> {
        roots: readonly TreeNode<T>[];

        expanded?: readonly string[];

        disabled?: (node: TreeNode<T>) => boolean;
    }

### `TweeChoice` (interface)

    export interface TweeChoice {
        text: string;
        goto?: string;
    }

### `TweeCommand` (type)

    export type TweeCommand = {
        say: string;

### `Tweener` (class)

    export declare class Tweener {
        private tweens;

        tween(duration: number, apply: (t: number) => void, options?: Easing | TweenOptions): Promise<void>;
        update(dt: number): void;

        get isBusy(): boolean;

        clear(): void;
    }

### `TweenOptions` (interface)

    export interface TweenOptions {

        ease?: Easing;

        intent?: MotionIntent;

        alternate?: (t: number) => void;
    }

### `TweeStory` (interface)

    export interface TweeStory {
        story: Record<string, TweeCommand[]>;

        start: string;

        title?: string;
    }

### `TwineStory` (interface)

    export interface TwineStory {
        story: StoryScript;

        start: string;

        title?: string;
    }

### `uncloneablePath` (function)

    export declare function uncloneablePath(value: unknown, root?: string): string | null;

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

### `UndoHistoryOptions` (interface)

    export interface UndoHistoryOptions {

        limit?: number;
    }

### `unscramble` (function)

    export declare function unscramble(payload: string, key: string): string;

### `UPPERCASE_KEYBOARD` (const)

    export declare const UPPERCASE_KEYBOARD: KeyboardLayout;

### `validateSchema` (function)

    export declare function validateSchema(value: unknown, schema: Schema, path?: string): void;

### `version` (const)

    export declare const version = "0.31.0";

### `VerticalLabel` (class)

    export declare class VerticalLabel extends Container {
        private readonly opts;
        private readonly themeListener;
        constructor(options: VerticalLabelOptions);

        private build;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `VerticalLabelOptions` (interface)

    export interface VerticalLabelOptions {
        text: string;
        color?: number;
        size?: number;
        columnHeight: number;
        rotate?: RegExp;
    }

### `VerticalLayoutOptions` (interface)

    export interface VerticalLayoutOptions {
        lineHeight: number;

        columnHeight: number;

        rotate?: RegExp;
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

### `ViewportOptions` (interface)

    export interface ViewportOptions extends CameraOptions {

        x: number;
        y: number;
        width: number;
        height: number;
    }

### `watchReducedMotion` (function)

    export declare function watchReducedMotion(listener: (reduced: boolean) => void): () => void;

### `Wave` (interface)

    export interface Wave<T> {
        delay: number;
        entries: readonly {
            kind: T;
            count: number;
        }[];

        duration?: number;
    }

### `WebGpuDetection` (interface)

    export interface WebGpuDetection {
        webgpu: boolean;
        wgsl: boolean;
    }

### `WebSocketLike` (interface)

    export interface WebSocketLike {
        readyState: number;
        send(data: string): void;
        close(): void;
        onopen: ((event: unknown) => void) | null;
        onclose: ((event: unknown) => void) | null;
        onerror: ((event: unknown) => void) | null;
        onmessage: ((event: {
            data: string;
        }) => void) | null;
    }

### `WeightedCell` (interface)

    export interface WeightedCell<T> {
        readonly cell: T;
        readonly cost: number;
    }

### `weightedFlood` (function)

    export declare function weightedFlood<T, K>(start: T, options: WeightedFloodOptions<T, K>): Map<K, WeightedCell<T>>;

### `WeightedFloodOptions` (interface)

    export interface WeightedFloodOptions<T, K> {

        key: (cell: T) => K;

        neighbors: (cell: T) => Iterable<T>;

        cost: (from: T, to: T) => number;

        maxCost: number;

        canEnter?: (cell: T, from: T, cost: number) => boolean;

        stop?: (cell: T, cost: number) => boolean;
    }

### `WidgetState` (type)

    export type WidgetState = 'idle' | 'hover' | 'pressed' | 'disabled' | 'selected' | 'focused';

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

        private blocker;
        private readonly themeListener;
        private isClosed;
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

        get closed(): boolean;

        update(_dt: number): void;

        close(): void;

        place(viewportWidth: number, viewportHeight: number): void;

        private fitBlocker;
        private readonly onBlockerDown;

        handleOutsideClick(x: number, y: number): boolean;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `WindowOptions` (interface)

    export interface WindowOptions {
        width: number;
        height: number;
        title?: string;

        modal?: boolean;

        closable?: boolean;

        dims?: boolean;

        anchor?: 'center' | 'bottom' | 'top';

        blocker?: boolean;
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

        handleAction(action: Action): boolean;

        get blocksWorld(): boolean;
        update(dt: number): void;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `withTextureCanvas` (function)

    export declare function withTextureCanvas(texture: Texture, probe: RecolorProbe, paint: (context: RemapCanvasContext, width: number, height: number) => void): Texture;

### `World` (namespace)

    export * as World from './world/index.ts'

### `XP_AUTOTILE_PATTERNS` (const)

    export declare const XP_AUTOTILE_PATTERNS: readonly XpAutotilePattern[];

### `XP_NEIGHBORS_TO_PATTERN` (const)

    export declare const XP_NEIGHBORS_TO_PATTERN: readonly number[];

### `xpAutotilePattern` (function)

    export declare function xpAutotilePattern(sameTerrain: (dx: number, dy: number) => boolean): number;

### `XpAutotilePattern` (type)

    export type XpAutotilePattern = readonly [number, number, number, number];

### `xpAutotileRef` (function)

    export declare function xpAutotileRef(tile: number): XpAutotileRef | null;

### `XpAutotileRef` (interface)

    export interface XpAutotileRef {

        index: number;

        pattern: number;
    }

## `./3d`

### `Billboard3DOptions` (interface)

    export interface Billboard3DOptions {

        texture: string;
        width?: number;
        height?: number;
    }

### `buildHeightIndex` (function)

    export declare function buildHeightIndex(cells: readonly GridCell3D[]): Map<string, number>;

### `CapsuleGridMoveOptions` (interface)

    export interface CapsuleGridMoveOptions {
        shape: GridShape3D;

        heights: ReadonlyMap<string, number>;
        tileSize?: number;

        maxStepUp?: number;

        steps?: number;
    }

### `CapsuleGridMoveResult` (interface)

    export interface CapsuleGridMoveResult {
        x: number;
        z: number;

        blocked: boolean;
    }

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

### `CollideXZ` (type)

    export type CollideXZ = (from: {
        x: number;

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

### `Engine3DOptions` (interface)

    export interface Engine3DOptions {
        canvas: HTMLCanvasElement;
        antialias?: boolean;
        clearColor?: readonly [number, number, number, number?];
    }

### `Frame3D` (type)

    export type Frame3D = (deltaSeconds: number) => void;

### `GridCell3D` (interface)

    export interface GridCell3D {
        x: number;
        y: number;
        height?: number;
    }

### `gridPoint3D` (function)

    export declare function gridPoint3D(shape: GridShape3D, x: number, y: number, tileSize?: number, height?: number, heightStep?: number): Point3D;

### `GridShape3D` (type)

    export type GridShape3D = 'square' | 'hex';

### `heightAt` (function)

    export declare function heightAt(index: ReadonlyMap<string, number>, shape: GridShape3D, x: number, z: number, tileSize?: number): number | null;

### `HeightmapSource` (interface)

    export interface HeightmapSource {
        data: Uint8Array;
        width: number;
        height: number;
    }

### `HeightmapTerrain3DOptions` (interface)

    export interface HeightmapTerrain3DOptions {

        width?: number;

        depth?: number;

        subdivisions?: number;
        minHeight?: number;
        maxHeight?: number;
    }

### `parseVox` (function)

    export declare function parseVox(data: ArrayBuffer | ArrayBufferView): VoxModel;

### `Point3D` (interface)

    export interface Point3D {
        x: number;
        y: number;
        z: number;
    }

### `resolveCapsuleAgainstGrid` (function)

    export declare function resolveCapsuleAgainstGrid(from: {
        x: number;

### `TileGrid3DMeshes` (interface)

    export interface TileGrid3DMeshes {
        tiles: Mesh;
        columns: Mesh | null;
        dispose(): void;
    }

### `TileGrid3DOptions` (interface)

    export interface TileGrid3DOptions {
        shape: GridShape3D;
        tileSize?: number;
        heightStep?: number;
        tileThickness?: number;
        tileColor?: number;
        columnColor?: number;
        origin?: readonly [number, number, number];
    }

### `Voxel` (interface)

    export interface Voxel {
        x: number;
        y: number;
        z: number;
        color: number;
    }

### `VoxModel` (interface)

    export interface VoxModel {
        size: VoxSize;
        voxels: readonly Voxel[];
        palette: Uint32Array;
    }

### `VoxSize` (interface)

    export interface VoxSize {
        x: number;
        y: number;
        z: number;
    }

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

### `AdvancementOption` (interface)

    export interface AdvancementOption {
        id: string;

        description?: string;
    }

### `AdvancementTier` (interface)

    export interface AdvancementTier {

        threshold: number;
        kind: AdvancementTierKind;

        points?: number;

        options?: readonly AdvancementOption[];
    }

### `AdvancementTierKind` (type)

    export type AdvancementTierKind = 'points' | 'branch' | 'capstone';

### `AdvancementTrack` (interface)

    export interface AdvancementTrack {
        tiers: readonly AdvancementTier[];
    }

### `AffixContext` (interface)

    export interface AffixContext {
        trigger: AffixTrigger;
        kind?: AttackKind;
    }

### `AffixDef` (interface)

    export interface AffixDef {
        id: string;
        trigger: AffixTrigger;

        kinds?: readonly AttackKind[];

        weight: number;

        curse?: boolean;

        description?: string;
    }

### `affixOf` (function)

    export declare function affixOf(item: InventoryItem): string | undefined;

### `AffixTable` (interface)

    export interface AffixTable {
        entries: readonly AffixDef[];
    }

### `AffixTrigger` (type)

    export type AffixTrigger = 'strike' | 'defend' | 'passive';

### `AffixUpgradePolicy` (type)

    export type AffixUpgradePolicy = 'keep' | 'remove';

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

### `AppearanceTable` (interface)

    export interface AppearanceTable {

        kinds: readonly string[];

        labels: readonly string[];
    }

### `applyAffix` (function)

    export declare function applyAffix(item: InventoryItem, affix: AffixDef): void;

### `applyItemStatusEffect` (function)

    export declare function applyItemStatusEffect<T extends object>(item: T, clock: EffectClock, options: ItemStatusEffectOptions<T>): ItemStatusEffectHandle;

### `applyStatusEffect` (function)

    export declare function applyStatusEffect(stats: StatBlock, clock: EffectClock, options: StatusEffectOptions): StatusEffectHandle;

### `assignAppearances` (function)

    export declare function assignAppearances(table: AppearanceTable): Map<string, string>;

### `AssignedTrait` (interface)

    export interface AssignedTrait {
        trait: TraitDef;
        source: symbol;
    }

### `assignTraits` (function)

    export declare function assignTraits(stats: StatBlock, pool: readonly TraitDef[], count: number): AssignedTrait[];

### `AttackKind` (type)

    export type AttackKind = 'melee' | 'thrown' | 'bow' | 'ability' | string;

### `AuraDef` (interface)

    export interface AuraDef {
        name: string;
        modifiers: readonly Omit<Modifier, 'source'>[];
    }

### `AuraField` (class)

    export declare class AuraField {
        private affected;
        update(participants: readonly AuraParticipant[], isAdjacent: (a: AuraParticipant, b: AuraParticipant) => boolean): void;
    }

### `AuraParticipant` (interface)

    export interface AuraParticipant {
        stats: StatBlock;
        aura?: AuraDef | null;
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

### `BarrierLayer` (interface)

    export interface BarrierLayer {
        amount: number;

        decayPerTick?: number;
    }

### `buildEntities` (function)

    export declare function buildEntities(rows: readonly EntityTemplateRow[], catalog?: EntityTemplateCatalog, onLowHp?: (entity: BuiltEntity) => void): BuiltEntity[];

### `buildEntity` (function)

    export declare function buildEntity(row: EntityTemplateRow, catalog?: EntityTemplateCatalog, onLowHp?: (entity: BuiltEntity) => void): BuiltEntity;

### `BuiltEntity` (interface)

    export interface BuiltEntity {
        id: string;
        stats: StatBlock;
        progression?: Progression;
        item?: InventoryItem;
        reactions: ReactionTable<{
            hp: number;
            maxHp: number;
        }>;
    }

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

### `ChargesOptions` (interface)

    export interface ChargesOptions {

        max: number;

        current?: number;

        regenRate: number;
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

### `DerivedStat` (interface)

    export interface DerivedStat {
        name: string;

        from: (stats: Readonly<Stats>) => number;
    }

### `EffectClock` (interface)

    export interface EffectClock {
        add(effect: {
            tick: (turn: number) => void;
            duration?: number;
            onExpire?: () => void;
        }): symbol;
        remove(id: symbol): void;
    }

### `enchant` (function)

    export declare function enchant(item: InventoryItem, delta: number, affixPolicy?: AffixUpgradePolicy): number;

### `EntitySaveState` (interface)

    export interface EntitySaveState {
        stats: {
            base: Stats;
        };
        progression?: {
            level: number;
            experience: number;
        };
        item?: InventoryItem;
    }

### `EntityTemplateCatalog` (interface)

    export interface EntityTemplateCatalog {
        growthCurves?: Record<string, GrowthCurve>;
        affixes?: Record<string, AffixDef>;

        items?: Record<string, () => InventoryItem>;
    }

### `EntityTemplateRow` (interface)

    export interface EntityTemplateRow {
        id: string;
        growth?: string;
        level?: number;
        startingAffix?: string;
        startingItem?: string;
        lowHpReaction?: number;

        [stat: string]: unknown;
    }

### `EquipmentOptions` (interface)

    export interface EquipmentOptions<Slot extends string, Item extends EquippableItem> {

        locked?: (slot: Slot, item: Item) => boolean;
    }

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

### `EquippableItem` (interface)

    export interface EquippableItem {

        modifiers?: Modifier[];
    }

### `fromEntitySaveState` (function)

    export declare function fromEntitySaveState(row: EntityTemplateRow, catalog: EntityTemplateCatalog, data: EntitySaveState, onLowHp?: (entity: BuiltEntity) => void): BuiltEntity;

### `GrowthCurve` (interface)

    export interface GrowthCurve {

        experienceFor(level: number): number;

        maxLevel: number;
    }

### `identify` (function)

    export declare function identify(item: InventoryItem): void;

### `Ingredient` (interface)

    export interface Ingredient {

        readonly id?: string | readonly string[];

        readonly category?: string;

        readonly matches?: (item: InventoryItem) => boolean;

        readonly quantity: number;
    }

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

### `InventoryItem` (interface)

    export interface InventoryItem {

        id: string;
        quantity: number;
        stackable?: boolean;
        weight?: number;

        category?: string;

        instanceId?: string;

        identified?: boolean;
        cursed?: boolean;
        blessed?: boolean;

        level?: number;

        affix?: string;

        durability?: number;
        maxDurability?: number;

        contents?: Inventory;
    }

### `InventoryOptions` (interface)

    export interface InventoryOptions {

        capacity?: number;
    }

### `ItemDefinition` (type)

    export type ItemDefinition = Pick<InventoryItem, 'stackable' | 'weight' | 'category'>;

### `ItemStatusEffectHandle` (interface)

    export interface ItemStatusEffectHandle {
        cancel(): void;
    }

### `ItemStatusEffectOptions` (interface)

    export interface ItemStatusEffectOptions<T> {

        fields: Partial<T>;

        duration: number;

        tick?: (turn: number) => void;
    }

### `LevelScale` (interface)

    export interface LevelScale {
        stat: string;
        op: ModifierOp;

        base: number;

        perLevel: number;
    }

### `LootEntry` (interface)

    export interface LootEntry {
        id: string;
        weight: number;

        quantity?: number;
    }

### `LootTable` (interface)

    export interface LootTable {
        entries: readonly LootEntry[];

        chance?: number;
    }

### `matchesContext` (function)

    export declare function matchesContext(affix: AffixDef, context: AffixContext): boolean;

### `Modifier` (interface)

    export interface Modifier {
        stat: string;
        op: ModifierOp;
        value: number;

        order?: number;

        source?: unknown;
    }

### `ModifierOp` (type)

    export type ModifierOp = 'add' | 'multiply' | 'set';

### `powerCurve` (function)

    export declare function powerCurve(base: number, power: number, maxLevel: number): GrowthCurve;

### `Price` (interface)

    export interface Price {

        buy: number;

        sell: number;
    }

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

### `Recipe` (interface)

    export interface Recipe {

        ingredients: Ingredient[];

        result: InventoryItem;
    }

### `refund` (function)

    export declare function refund(stats: StatBlock, cost: ResourceCost | readonly ResourceCost[], fraction?: number): void;

### `removeAffix` (function)

    export declare function removeAffix(item: InventoryItem): void;

### `repairItem` (function)

    export declare function repairItem(item: InventoryItem, amount: number): void;

### `ResourceCost` (interface)

    export interface ResourceCost {
        stat: string;
        amount: number;
    }

### `rollAffix` (function)

    export declare function rollAffix(table: AffixTable, options?: RollAffixOptions): AffixDef | null;

### `RollAffixOptions` (interface)

    export interface RollAffixOptions {

        readonly curse?: boolean;

        readonly predicate?: (entry: AffixDef) => boolean;
    }

### `rollLoot` (function)

    export declare function rollLoot(table: LootTable): {
        id: string;

### `SavedEquipment` (interface)

    export interface SavedEquipment<Slot extends string> {
        worn: [Slot, string][];
    }

### `SavedInventory` (interface)

    export interface SavedInventory {
        capacity?: number;
        slots: SavedInventoryItem[];
    }

### `SavedInventoryItem` (interface)

    export interface SavedInventoryItem {
        id: string;
        quantity: number;
        instanceId?: string;
        identified?: boolean;
        cursed?: boolean;
        blessed?: boolean;
        level?: number;
        affix?: string;
        durability?: number;
        maxDurability?: number;
        contents?: SavedInventory;
    }

### `scaledModifiers` (function)

    export declare function scaledModifiers(level: number, scales: readonly LevelScale[]): Modifier[];

### `sell` (function)

    export declare function sell(wallet: StatBlock, stock: Inventory, bag: Inventory, id: string, quantity: number, options: ShopOptions): boolean;

### `ShopOptions` (interface)

    export interface ShopOptions {

        currency: string;
        prices: ReadonlyMap<string, Price>;
    }

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

### `SkillPointsOptions` (interface)

    export interface SkillPointsOptions {

        cap?: (stat: string) => number;

        cost?: (stat: string, rank: number) => number;
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

### `StatBlockOptions` (interface)

    export interface StatBlockOptions {
        base: Stats;
        derived?: DerivedStat[];
    }

### `Stats` (type)

    export type Stats = Record<string, number>;

### `StatusEffectHandle` (interface)

    export interface StatusEffectHandle {
        cancel(): void;
    }

### `StatusEffectOptions` (interface)

    export interface StatusEffectOptions {

        modifiers: readonly Omit<Modifier, 'source'>[];

        duration: number;

        tick?: (turn: number) => void;
    }

### `SupportChange` (interface)

    export interface SupportChange {
        a: string;
        b: string;
        points: number;
        previousLevel: SupportLevel | null;
        level: SupportLevel | null;
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

### `SupportLevel` (interface)

    export interface SupportLevel {
        id: string;
        threshold: number;

        bonus?: string;
    }

### `SupportSave` (interface)

    export interface SupportSave {
        pairs: Array<[string, string, number]>;
    }

### `toEntitySaveState` (function)

    export declare function toEntitySaveState(entity: BuiltEntity): EntitySaveState;

### `TraitDef` (interface)

    export interface TraitDef {
        name: string;
        modifiers: readonly Omit<Modifier, 'source'>[];

        description?: string;
    }

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

### `AlphaBetaGame` (interface)

    export interface AlphaBetaGame<State, Move> {

        readonly currentPlayer: (state: State) => number;

        readonly moves: (state: State) => readonly Move[];

        readonly apply: (state: State, move: Move) => State;
        readonly isTerminal: (state: State) => boolean;

        readonly evaluate: (state: State, rootPlayer: number) => number;
    }

### `AlphaBetaOptions` (interface)

    export interface AlphaBetaOptions {
        readonly depth: number;
        readonly maxNodes?: number;
        readonly signal?: AbortSignal;
        readonly onNode?: (depth: number, maximizing: boolean) => void;
    }

### `AlphaBetaResult` (interface)

    export interface AlphaBetaResult<State, Move> {
        readonly move: Move | null;
        readonly score: number;
        readonly depth: number;
        readonly nodes: number;
        readonly cutoffs: number;
        readonly status: 'complete' | 'cancelled' | 'budget-exceeded';
        readonly state: State;
    }

### `alphaBetaSearch` (function)

    export declare function alphaBetaSearch<State, Move>(game: AlphaBetaGame<State, Move>, state: State, options: AlphaBetaOptions): AlphaBetaResult<State, Move>;

### `Aspects` (class)

    export declare class Aspects {
        private values;
        constructor(defaults?: AspectValues);
        has(name: string): boolean;
        get(name: string): AspectValue | undefined;
        set(name: string, value: AspectValue): void;

        number(name: string, fallback?: number): number;
        flag(name: string, fallback?: boolean): boolean;

        list(name: string): readonly string[];
        names(): string[];

        with(overrides: AspectValues): Aspects;
        toJSON(): Record<string, AspectValue>;
        static fromJSON(values: Readonly<Record<string, AspectValue>>): Aspects;
    }

### `AspectValue` (type)

    export type AspectValue = number | string | boolean | readonly string[];

### `AspectValues` (interface)

    export interface AspectValues {
        readonly [name: string]: AspectValue | undefined;
    }

### `defaultWeigh` (function)

    export declare function defaultWeigh<A>(candidate: HeuristicCandidate<A>, context: HeuristicContext): number;

### `DenseLayer` (interface)

    export interface DenseLayer {
        inputSize: number;
        outputSize: number;
        weights: readonly number[];
        biases: readonly number[];
    }

### `Difficulty` (class)

    export declare class Difficulty {
        private readonly levels;
        private readonly base;
        constructor(levels?: readonly DifficultyLevel[], base?: AspectValues);
        get ids(): string[];
        get(id: string): DifficultyLevel | undefined;

        aspectsFor(id: string): Aspects;
    }

### `DifficultyLevel` (interface)

    export interface DifficultyLevel {
        id: string;
        name?: string;

        aspects?: AspectValues;
    }

### `firstWins` (function)

    export declare function firstWins<Move>(scored: readonly {
        readonly move: Move;

### `Goal` (interface)

    export interface Goal {
        unit: string;
        kind: GoalKind;

        target?: string;

        priority?: number;
    }

### `GoalKind` (type)

    export type GoalKind = 'attack' | 'defend' | 'retreat' | 'capture' | 'scout';

### `Goals` (class)

    export declare class Goals {
        private readonly byUnit;
        set(goal: Goal): void;
        clear(unit: string): void;
        get(unit: string): Goal | undefined;
        all(): readonly Goal[];
        get isEmpty(): boolean;
    }

### `goalScore` (function)

    export declare function goalScore(goal: Goal | undefined): number;

### `HeuristicAI` (class)

    export declare class HeuristicAI<A = unknown> {
        private readonly stages;
        constructor(options: {
            stages: readonly HeuristicStage<A>[];
        });

        decide(candidates: readonly HeuristicCandidate<A>[], context: HeuristicContext): HeuristicDecision<A> | null;
    }

### `HeuristicCandidate` (interface)

    export interface HeuristicCandidate<A = unknown> {

        id: string;
        action: A;

        unit?: string;

        factors?: Readonly<Record<string, number>>;

        type?: string;

        role?: string;

        can_recruit?: boolean;

        name?: string;
    }

### `HeuristicContext` (interface)

    export interface HeuristicContext {
        aspects: Aspects;
        goals?: Goals;
        turn?: number;
    }

### `HeuristicDecision` (interface)

    export interface HeuristicDecision<A = unknown> {
        candidate: HeuristicCandidate<A>;
        stage: string;
        score: number;
    }

### `HeuristicStage` (interface)

    export interface HeuristicStage<A = unknown> {
        id: string;

        when?: (context: HeuristicContext) => boolean;

        weigh?: (candidate: HeuristicCandidate<A>, context: HeuristicContext) => number;
    }

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

### `keepAwayScore` (function)

    export declare function keepAwayScore(distance: number, keepAway: number): number;

### `LuaAlphaBetaFunctions` (interface)

    export interface LuaAlphaBetaFunctions {
        readonly player?: string;
        readonly moves?: string;
        readonly apply?: string;
        readonly terminal?: string;
        readonly evaluate?: string;
    }

### `LuaSearchValueAdapter` (interface)

    export interface LuaSearchValueAdapter {
        readonly toMoves: (value: AIValue) => readonly AIValue[];
        readonly toBoolean: (value: AIValue) => boolean;
        readonly toNumber: (value: AIValue) => number;
        readonly toPlayer: (value: AIValue) => number;
    }

### `NeuralModel` (interface)

    export interface NeuralModel {
        version: 1;
        observationVersion: string;
        layers: readonly DenseLayer[];
    }

### `NeuralObservation` (interface)

    export interface NeuralObservation {
        input: readonly number[];

        mask?: readonly boolean[];
    }

### `NeuralPolicy` (class)

    export declare class NeuralPolicy {
        private readonly model;
        private readonly evaluator;
        constructor(model: NeuralModel);
        predict(input: readonly number[], output?: Float64Array): Float64Array;
        selectAction(observation: NeuralObservation, random?: () => number): number | null;
        exportModel(): NeuralModel;
        behavior(id: string, actions: readonly AIAction[], observe: (perception: AIValue) => NeuralObservation, sample?: boolean): AIBehavior;

        predictBatchAsync(inputs: readonly (readonly number[])[], options?: {
            signal?: AbortSignal;
            timeout?: number;
        }): Promise<Float64Array[]>;
    }

### `personalScoreView` (function)

    export declare function personalScoreView<T>(subject: ScoreSubject<T>, world: readonly ScoreSubject<T>[], scoreOf: (id: T) => number, sees: (x: number, y: number) => boolean): ScoreView;

### `RecruitmentPattern` (class)

    export declare class RecruitmentPattern {
        private readonly order;
        private readonly fallback;
        constructor(order: readonly string[], fallback?: string | null);
        get length(): number;

        at(index: number): string | null;

        next(after: string | null): string | null;
    }

### `RootSplit` (interface)

    export interface RootSplit<State, Move> {
        readonly move: Move;
        readonly child: State;
    }

### `rootSplits` (function)

    export declare function rootSplits<State, Move>(game: AlphaBetaGame<State, Move>, state: State): RootSplit<State, Move>[];

### `ScorePersonality` (interface)

    export interface ScorePersonality {
        readonly own: number;
        readonly allies: number;
        readonly enemies: number;
    }

### `ScoreSubject` (interface)

    export interface ScoreSubject<T> {
        readonly id: T;

        readonly side: string;
        readonly x: number;
        readonly y: number;

        readonly type?: string;

        readonly role?: string;

        readonly can_recruit?: boolean;

        readonly name?: string;
    }

### `ScoreSubjectFilter` (interface)

    export interface ScoreSubjectFilter {
        readonly side?: string;
        readonly type?: string;
        readonly role?: string;
        readonly can_recruit?: boolean;
        readonly name?: string;
    }

### `ScoreView` (interface)

    export interface ScoreView {

        readonly own: number;

        readonly allies: number;

        readonly enemies: number;

        readonly seen: number;
    }

### `scoreWith` (function)

    export declare function scoreWith(view: ScoreView, personality: ScorePersonality): number;

### `sideScoreView` (function)

    export declare function sideScoreView<T>(side: string, world: readonly ScoreSubject<T>[], scoreOf: (id: T) => number, sees: (x: number, y: number) => boolean): ScoreView;

### `subjectsWhere` (function)

    export declare function subjectsWhere<T>(world: readonly ScoreSubject<T>[], filter: ScoreSubjectFilter): ScoreSubject<T>[];

### `Suggester` (class)

    export declare class Suggester {
        private readonly decide;
        private readonly every;
        private since;
        private latestDecision;
        constructor(decide: (input: AIDecisionInput) => AIDecision, options?: SuggesterOptions);

        update(input: AIDecisionInput): AIDecision | null;

        get latest(): AIDecision | null;

        clear(): void;
    }

### `SuggesterOptions` (interface)

    export interface SuggesterOptions {

        every?: number;
    }

## `./ai/lua`

### `AIAgentDefinition` (interface)

    export interface AIAgentDefinition {
        readonly id: string;
        readonly behaviors: readonly AIBehavior[];
        readonly scope?: 'actor' | 'controller';
        readonly algorithm?: 'rules' | 'alpha_beta';
        readonly depth?: number;
        readonly maxNodes?: number;
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

### `AIDecisionInput` (interface)

    export interface AIDecisionInput {
        readonly perception: AIValue;
        readonly state?: AIState;
        readonly signal?: AbortSignal;
        readonly seed?: number;
        readonly maxSteps?: number;
        readonly maxMilliseconds?: number;
    }

### `AIStateEnvelope` (interface)

    export interface AIStateEnvelope {
        readonly version: 1;
        readonly agents: Readonly<Record<string, AIState>>;
    }

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

### `AssetBundle` (interface)

    export interface AssetBundle {
        id: string;
        paths: readonly string[];
        priority?: number;

        estimatedBytes?: number;
    }

### `AssetProgress` (type)

    export type AssetProgress = (fraction: number) => void;

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

### `AssetStreamOptions` (interface)

    export interface AssetStreamOptions {
        budgetBytes?: number;
        load?: (paths: string[], onProgress?: AssetProgress) => Promise<void>;
        release?: (paths: string[]) => Promise<void>;
    }

### `ByteProgress` (interface)

    export interface ByteProgress {
        loaded: number;

        total: number | null;
    }

### `fetchWithByteProgress` (function)

    export declare function fetchWithByteProgress(url: string, onProgress?: OnByteProgress, fetchFn?: typeof fetch): Promise<Blob>;

### `get` (function)

    export declare function get<T>(path: string, fallback?: T): T;

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

### `LoadAssetsOptions` (interface)

    export interface LoadAssetsOptions {

        onProgress?: AssetProgress;

        resolution?: number;

        optional?: readonly string[];

        onMissing?: (path: string, error: unknown) => void;
    }

### `loadBinary` (function)

    export declare function loadBinary(paths: string[], onProgress?: AssetProgress, options?: LoadBinaryOptions): Promise<void>;

### `LoadBinaryOptions` (interface)

    export interface LoadBinaryOptions {

        fetch?: typeof globalThis.fetch;
    }

### `OnByteProgress` (type)

    export type OnByteProgress = (progress: ByteProgress) => void;

### `paths` (function)

    export declare function paths(): string[];

### `release` (function)

    export declare function release(paths: string[]): Promise<void>;

### `releaseBinary` (function)

    export declare function releaseBinary(paths: string[]): void;

### `resolve` (function)

    export declare function resolve(path: string): string;

### `setAssetMap` (function)

    export declare function setAssetMap(map: Record<string, string> | undefined): void;

### `setBase` (function)

    export declare function setBase(path: string): void;

### `texture` (function)

    export declare function texture(path: string, fallback?: Texture): Texture;

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

### `setAssetMap` (function)

    export declare function setAssetMap(map: Record<string, string> | undefined): void;

### `setBase` (function)

    export declare function setBase(path: string): void;

## `./audio`

### `assertGrooveTemplate` (function)

    export declare function assertGrooveTemplate(template: GrooveTemplate): void;

### `AudioBus` (class)

    export declare class AudioBus {
        private readonly context;
        private readonly destination;
        private readonly load;
        private readonly bgmChannel;
        private readonly bgsChannel;
        private readonly tracks;
        private readonly saved;
        private readonly requests;
        private me;
        private meToken;
        private suspendedBgm;
        private readonly seNodes;
        private readonly mixerLevels;
        private readonly kindGains;
        constructor(context: AudioContext, options?: AudioBusOptions);

        setMixer(kind: BusKind, level: {
            volume?: number;
            muted?: boolean;
        }): void;

        mixer(kind: BusKind): BusMixerLevel;

        playBgm(track: BusTrack): Promise<void>;

        playBgs(track: BusTrack): Promise<void>;
        stopBgm(): void;
        stopBgs(): void;
        fadeOutBgm(seconds?: number): void;
        fadeOutBgs(seconds?: number): void;

        currentTrack(kind: 'bgm' | 'bgs'): SavedBusTrack | null;

        saveBgm(): SavedBusTrack | null;

        saveBgs(): SavedBusTrack | null;
        replayBgm(): Promise<void>;
        replayBgs(): Promise<void>;

        playMe(track: BusTrack): Promise<void>;

        stopMe(resume?: boolean): void;

        playSe(track: BusTrack): Promise<void>;
        stopSe(): void;
        stopAll(): void;

        snapshot(): BusSnapshot;

        restore(state: BusSnapshot | null | undefined): void;
        private static normalize;
        private playLoop;
        private stopMeNodes;
        private finishMe;
    }

### `AudioBusOptions` (interface)

    export interface AudioBusOptions {
        destination?: AudioNode;
        load?: BusLoader;
    }

### `AudioFalloff` (interface)

    export interface AudioFalloff {

        refDistance?: number;

        maxDistance?: number;

        rolloff?: number;
    }

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

### `AudioPoint` (interface)

    export interface AudioPoint {
        x: number;
        y: number;
    }

### `BusKind` (type)

    export type BusKind = 'bgm' | 'bgs' | 'me' | 'se';

### `BusLoader` (type)

    export type BusLoader = (kind: BusKind, name: string) => Promise<LoadedTrack | null>;

### `BusMixerLevel` (interface)

    export interface BusMixerLevel {

        volume: number;
        muted: boolean;
    }

### `BusSnapshot` (interface)

    export interface BusSnapshot {
        bgm: SavedBusTrack | null;
        bgs: SavedBusTrack | null;
        savedBgm: SavedBusTrack | null;
        savedBgs: SavedBusTrack | null;
    }

### `BusTrack` (interface)

    export interface BusTrack {
        name: string;
        volume?: number;
        pitch?: number;
        pan?: number;
        pos?: number;
    }

### `CaptionEvent` (interface)

    export interface CaptionEvent {

        text: string;
    }

### `Channel` (class)

    export declare class Channel {
        private readonly context;
        private readonly destination;
        private source;
        private gainNode;
        private pannerNode;
        private buffer;
        private params;
        private loopRegion;
        private repeat;
        private startedAt;
        private offset;
        constructor(context: AudioContext, destination?: AudioNode);
        get isPlaying(): boolean;
        get duration(): number;

        play(buffer: AudioBuffer, options?: ChannelPlayOptions): void;

        update(params: {
            volume?: number;
            pitch?: number;
            pan?: number;
        }): void;

        stop(fadeSeconds?: number): void;

        position(): number;

        seek(pos: number): void;

        state(): ChannelState;

        restore(state: ChannelState): void;
        private clearNodes;
    }

### `ChannelPlayOptions` (interface)

    export interface ChannelPlayOptions {

        volume?: number;

        pitch?: number;

        pan?: number;

        pos?: number;

        loop?: LoopRegion | null;

        repeat?: boolean;
    }

### `ChannelState` (interface)

    export interface ChannelState {
        volume: number;
        pitch: number;
        pan: number;
        pos: number;
    }

### `collectSoundFontUsage` (function)

    export declare function collectSoundFontUsage(files: readonly MidiFile[]): SoundFontProgram[];

### `createAudio` (function)

    export declare function createAudio(path: string): Playable;

### `GridSubdivision` (type)

    export type GridSubdivision = '8n' | '16n' | '32n';

### `GrooveConverter` (class)

    export declare class GrooveConverter implements GrooveConverterEngine {
        exportFormat(template: GrooveTemplate, format: GrooveFormat): Promise<Uint8Array | string>;
        importFormat(data: Uint8Array | string, format: GrooveFormat): Promise<GrooveTemplate>;
    }

### `GrooveConverterEngine` (interface)

    export interface GrooveConverterEngine {

        exportFormat(template: GrooveTemplate, format: GrooveFormat): Promise<Uint8Array | string>;
        importFormat(data: Uint8Array | string, format: GrooveFormat): Promise<GrooveTemplate>;
    }

### `GrooveExtractor` (class)

    export declare class GrooveExtractor implements GrooveExtractorEngine {
        extractFromMidiPair(quantizedMidi: MidiFile, recordedMidi: MidiFile, gridSubdivision?: GridSubdivision): Promise<GrooveTemplate>;
        extractFromSingleMidi(recordedMidi: MidiFile, gridSubdivision?: GridSubdivision): Promise<GrooveTemplate>;
        extractFromAudioBuffer(audioBuffer: AudioBuffer, gridSubdivision?: '8n' | '16n', tempoBpm?: number): Promise<GrooveTemplate>;
    }

### `GrooveExtractorEngine` (interface)

    export interface GrooveExtractorEngine {

        extractFromMidiPair(quantizedMidi: MidiFile, recordedMidi: MidiFile, gridSubdivision?: GridSubdivision): Promise<GrooveTemplate>;

        extractFromSingleMidi(recordedMidi: MidiFile, gridSubdivision?: GridSubdivision): Promise<GrooveTemplate>;

        extractFromAudioBuffer(audioBuffer: AudioBuffer, gridSubdivision?: '8n' | '16n', tempoBpm?: number): Promise<GrooveTemplate>;
    }

### `GrooveFormat` (type)

    export type GrooveFormat = 'json' | 'midi' | 'ableton-agr' | 'reaper-groove';

### `GrooveHumanizer` (class)

    export declare class GrooveHumanizer implements MidiHumanizerEngine {
        readonly tierName = "groove";
        readonly approximateSizeMb = 0.5;
        initialize(): Promise<void>;
        process(midi: MidiFile, options: HumanizationOptions): Promise<MidiFile>;
    }

### `GrooveOffset` (interface)

    export interface GrooveOffset {

        subdivisionIndex: number;

        timeOffsetTicks: number;

        velocityFactor: number;
    }

### `GrooveTemplate` (interface)

    export interface GrooveTemplate {

        name: string;

        timeSignature: [number, number];

        ppq: number;

        tempoBpm: number;
        subdivision: GridSubdivision;

        offsets: GrooveOffset[];
    }

### `HumanizationOptions` (interface)

    export interface HumanizationOptions {

        intensity: number;

        timingVarianceMs?: number;

        velocityVariance?: number;

        grooveTemplate?: GrooveTemplate;

        style?: HumanizeStyle;

        seed?: number;

        onWarn?: (message: string) => void;
    }

### `humanizeMidi` (function)

    export declare function humanizeMidi(midi: MidiFile, request: HumanizeRequest): Promise<MidiFile>;

### `HumanizeRequest` (interface)

    export interface HumanizeRequest extends HumanizationOptions {

        tier?: HumanizerTier;
    }

### `HumanizerFactory` (class)

    export declare class HumanizerFactory {

        static create(tier: HumanizerTier): Promise<MidiHumanizerEngine>;
        private static load;
    }

### `HumanizerTier` (type)

    export type HumanizerTier = 'lite' | 'groove' | 'magenta';

### `HumanizeStyle` (type)

    export type HumanizeStyle = 'jazz' | 'rock' | 'classical' | 'funk';

### `LiteHumanizer` (class)

    export declare class LiteHumanizer implements MidiHumanizerEngine {
        readonly tierName = "lite";
        readonly approximateSizeMb = 0.05;

        initialize(): Promise<void>;
        process(midi: MidiFile, options: HumanizationOptions): Promise<MidiFile>;
    }

### `LoadedTrack` (interface)

    export interface LoadedTrack {
        buffer: AudioBuffer;
        loop?: LoopRegion | null;
    }

### `LoopRegion` (interface)

    export interface LoopRegion {
        start: number;
        end: number;
    }

### `loopRegionFromTags` (function)

    export declare function loopRegionFromTags(tags: VorbisLoopTags | null, sampleRate: number, duration: number): LoopRegion | null;

### `MidiControlEvent` (interface)

    export interface MidiControlEvent {
        tick: number;
        type: 'control';
        channel: number;

        controller: number;

        value: number;
    }

### `MidiEvent` (type)

    export type MidiEvent = MidiNoteEvent | MidiTempoEvent | MidiProgramEvent | MidiControlEvent | MidiPitchBendEvent;

### `MidiFile` (interface)

    export interface MidiFile {
        ticksPerQuarter: number;

        events: readonly MidiEvent[];

        loopStartTick: number | null;
    }

### `MidiHumanizerEngine` (interface)

    export interface MidiHumanizerEngine {

        readonly tierName: string;

        readonly approximateSizeMb: number;

        initialize(): Promise<void>;

        process(midi: MidiFile, options: HumanizationOptions): Promise<MidiFile>;
    }

### `midiLoopStart` (function)

    export declare function midiLoopStart(file: MidiFile): number | null;

### `MidiNoteEvent` (interface)

    export interface MidiNoteEvent {
        tick: number;
        type: 'noteOn' | 'noteOff';
        note: number;
        velocity: number;
        channel: number;
    }

### `MidiPitchBendEvent` (interface)

    export interface MidiPitchBendEvent {
        tick: number;
        type: 'pitchBend';
        channel: number;

        value: number;
    }

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

        static create(file: MidiFile, options?: MidiPlayerOptions): Promise<MidiPlayer>;
        play(): void;
        pause(): void;

        stop(): void;
        update(dt: number): void;
        get isPlaying(): boolean;

        get duration(): number;
    }

### `MidiPlayerOptions` (interface)

    export interface MidiPlayerOptions {
        waveform?: Waveform;

        volume?: number;

        play?: (options: ToneOptions) => Playable;

        humanize?: HumanizeRequest;
    }

### `MidiProgramEvent` (interface)

    export interface MidiProgramEvent {
        tick: number;
        type: 'program';
        channel: number;

        program: number;
    }

### `MidiTempoEvent` (interface)

    export interface MidiTempoEvent {
        tick: number;
        type: 'tempo';

        microsecondsPerQuarter: number;
    }

### `MidiVoice` (interface)

    export interface MidiVoice {

        program: number;

        bank: number;

        gain: number;

        pan: number;

        bend?: number;
    }

### `Music` (class)

    export declare class Music {
        private current;
        private fades;
        private create;
        private trackQueue;
        private playlistFade;
        volume: number;
        private suspended_;
        private duckLevel_;
        constructor(options?: MusicOptions);

        play(path: string, fadeDuration?: number): void;

        playTracks(paths: readonly string[], fadeDuration?: number): void;
        private startNextTrack;
        private start;
        stop(fadeDuration?: number): void;

        suspend(): void;

        resume(): void;

        duck(level?: number, fadeDuration?: number): void;

        unduck(fadeDuration?: number): void;

        get duckLevel(): number;
        get isSuspended(): boolean;
        update(dt: number): void;
    }

### `MusicOptions` (interface)

    export interface MusicOptions {
        volume?: number;
        create?: (path: string) => Playable;
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

        suspend(): void;

        resume(): void;
    }

### `OrchestratorState` (interface)

    export interface OrchestratorState {
        track: string;
        fadeDuration?: number;
    }

### `parseMidi` (function)

    export declare function parseMidi(data: ArrayBuffer | ArrayBufferView): MidiFile;

### `parseSoundFont` (function)

    export declare function parseSoundFont(data: ArrayBuffer | ArrayBufferView): SoundFont;

### `parseVorbisLoopTags` (function)

    export declare function parseVorbisLoopTags(bytes: Uint8Array): VorbisLoopTags | null;

### `Playable` (interface)

    export interface Playable {
        play(): void | Promise<void>;
        pause(): void;
        currentTime: number;
        volume: number;
        loop: boolean;

        playbackRate?: number;

        onended?: ((event: Event) => unknown) | null;
    }

### `playTone` (function)

    export declare function playTone(options?: ToneOptions, create?: (dataUri: string) => Playable): Playable;

### `RenderedMidi` (interface)

    export interface RenderedMidi {
        sampleRate: number;
        left: Float32Array;
        right: Float32Array;

        loopStart: number;

        loopEnd: number;

        duration: number;
    }

### `RenderMidiAsyncOptions` (interface)

    export interface RenderMidiAsyncOptions {

        soundFontBytes?: ArrayBuffer | ArrayBufferView;

        sampleRate?: number;

        gain?: number;

        maxDuration?: number;
    }

### `RenderMidiOptions` (interface)

    export interface RenderMidiOptions {

        soundfont?: SoundFont | null;

        sampleRate?: number;

        gain?: number;

        maxDuration?: number;
    }

### `renderMidiToBuffer` (function)

    export declare function renderMidiToBuffer(file: MidiFile, options?: RenderMidiOptions): RenderedMidi;

### `renderMidiToBufferAsync` (function)

    export declare function renderMidiToBufferAsync(midi: ArrayBuffer | ArrayBufferView, options?: RenderMidiAsyncOptions): Promise<RenderedMidi>;

### `SavedBusTrack` (interface)

    export interface SavedBusTrack {
        name: string;
        volume: number;
        pitch: number;
        pan: number;
        pos: number;
    }

### `ScheduledNote` (interface)

    export interface ScheduledNote extends MidiVoice {

        time: number;
        duration: number;
        note: number;
        velocity: number;
        channel: number;
    }

### `scheduleMidi` (function)

    export declare function scheduleMidi(file: MidiFile): ScheduledNote[];

### `Sound` (class)

    export declare class Sound {
        private pool;
        private next;
        private caption?;
        private suspended_;
        volume: number;
        constructor(path: string, options?: SoundOptions);

        play(gain?: number, pitch?: number): void;
        stopAll(): void;

        suspend(): void;

        resume(): void;
        get isSuspended(): boolean;
    }

### `SoundFont` (interface)

    export interface SoundFont {
        voices(bank: number, program: number, key: number, velocity: number): SoundFontVoice[];
        hasPreset(bank: number, program: number): boolean;
        readonly presetCount: number;
    }

### `SoundFontProgram` (interface)

    export interface SoundFontProgram {
        bank: number;
        program: number;
    }

### `SoundFontSample` (interface)

    export interface SoundFontSample {
        data: Float32Array;
        rate: number;
        loopStart: number;
        loopEnd: number;
    }

### `SoundFontVoice` (interface)

    export interface SoundFontVoice {
        sample: SoundFontSample;
        rootKey: number;

        cents: number;
        loop: boolean;

        gain: number;

        pan: number;

        attack: number;
        hold: number;
        decay: number;
        sustain: number;
        release: number;
    }

### `SoundOptions` (interface)

    export interface SoundOptions {

        poolSize?: number;
        volume?: number;

        create?: (path: string) => Playable;

        caption?: string;
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

### `SoundSourceOptions` (interface)

    export interface SoundSourceOptions extends AudioFalloff {
        x?: number;
        y?: number;
    }

### `subdivisionCount` (function)

    export declare function subdivisionCount(timeSignature: [number, number], subdivision: GridSubdivision): number;

### `subsetSoundFont` (function)

    export declare function subsetSoundFont(data: ArrayBuffer | ArrayBufferView, usage: readonly SoundFontProgram[]): ArrayBuffer;

### `synthesizeTone` (function)

    export declare function synthesizeTone(options?: ToneOptions): string;

### `ToneOptions` (interface)

    export interface ToneOptions {
        waveform?: Waveform;

        frequency?: number;

        duration?: number;

        volume?: number;

        decay?: number;
        sampleRate?: number;

        seed?: number;
    }

### `VorbisLoopTags` (interface)

    export interface VorbisLoopTags {
        loopStart: number;

        loopLength: number | null;
    }

### `Waveform` (type)

    export type Waveform = 'square' | 'triangle' | 'sine' | 'noise';

## `./battle`

### `AttackDialog` (class)

    export declare class AttackDialog {
        readonly onChange: Signal<void>;
        readonly selector: UnitSelector;
        private readonly damageFor;
        private readonly strikeDuration;
        private built;
        private elapsed_;
        constructor(options: AttackDialogOptions);
        get stage(): SelectorStage;
        get attacker(): SelectableUnit | null;
        get target(): SelectableUnit | null;

        get preview(): AttackPreview | null;

        get elapsed(): number;

        get finished(): boolean;

        get frame(): AttackFrame | null;
        move(delta: number): void;
        select(): boolean;
        back(): void;

        update(dt: number): AttackFrame | null;

        finish(): void;
        reset(): void;
        private readonly handleSelectorChange;
    }

### `AttackDialogOptions` (interface)

    export interface AttackDialogOptions {
        units: readonly SelectableUnit[];
        side?: string;
        disabled?: (unit: SelectableUnit) => boolean;
        canTarget?: (attacker: SelectableUnit, target: SelectableUnit) => boolean;

        damageFor: (attacker: SelectableUnit, target: SelectableUnit) => StrikeNumbers;

        strikeDuration?: number;
    }

### `AttackFrame` (interface)

    export interface AttackFrame {
        strike: number;
        time: number;
        attackerHp: number;
        defenderHp: number;

        defenderDamage: number;
    }

### `AttackPreview` (class)

    export declare class AttackPreview {
        readonly frames: readonly AttackFrame[];
        readonly totalDamage: number;
        readonly expectedDamage: number;
        readonly chanceToHit: number;
        private readonly strikeDuration;
        private readonly defenderHp0;
        constructor(options: AttackPreviewOptions);

        get duration(): number;

        get defenderKilled(): boolean;

        sampleAt(time: number): AttackFrame;
    }

### `AttackPreviewOptions` (interface)

    export interface AttackPreviewOptions {
        attacker: PreviewCombatant;
        defender: PreviewCombatant;

        damage: number;
        strikes: number;

        chanceToHit?: number;

        hits?: readonly boolean[];

        strikeDuration?: number;
    }

### `BattleAction` (interface)

    export interface BattleAction<C = unknown> {
        actor: C;
        speed: number;

        priority?: number;
    }

### `BattleHook` (interface)

    export interface Hook<TArgs extends unknown[]> {
        event: string;
        handler: (...args: TArgs) => void;

        source?: unknown;
    }

### `BattleHooks` (class)

    export declare class BattleHooks<C> extends HookRegistry<[creature: C, context?: unknown]> {
    }

### `battleOrder` (function)

    export declare function battleOrder<A extends {
        speed: number;

### `BattleStatCategory` (type)

    export type BattleStatCategory = 'recruits' | 'recalls' | 'advances' | 'kills' | 'deaths' | 'damageDealt' | 'damageTaken';

### `BattleStats` (class)

    export declare class BattleStats {
        private counts;

        record(category: BattleStatCategory, unitType: string, amount?: number): void;

        forType(category: BattleStatCategory, unitType: string): number;

        total(category: BattleStatCategory): number;

        breakdown(category: BattleStatCategory): readonly {
            unitType: string;
            count: number;
        }[];
        toJSON(): {
            counts: [BattleStatCategory, [string, number][]][];
        };
        static fromJSON(data: {
            counts: [BattleStatCategory, [string, number][]][];
        }): BattleStats;
    }

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

### `CreatureOptions` (interface)

    export interface CreatureOptions {
        species: Species;
        level?: number;

        deriveStats?: (base: Readonly<Record<string, number>>, level: number) => Record<string, number>;
    }

### `EvolutionRule` (interface)

    export interface EvolutionRule<S> {
        at: (level: number) => boolean;
        into: S;
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

### `FieldCondition` (interface)

    export interface FieldCondition {
        id: string;

        duration?: number;
    }

### `Move` (interface)

    export interface Move<TEffect = unknown> {
        id: string;
        type: string;

        cost?: number;

        target: string;
        effects?: TEffect;
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

### `PreviewCombatant` (interface)

    export interface PreviewCombatant {
        hp: number;
        maxHp?: number;
        name?: string;
    }

### `SelectableUnit` (interface)

    export interface SelectableUnit {
        id: string;
        side?: string;

        hp?: number;
        disabled?: boolean;
    }

### `SelectorStage` (type)

    export type SelectorStage = 'attacker' | 'target';

### `Species` (interface)

    export interface Species {
        id: string;
        types: readonly string[];

        baseStats: Record<string, number>;
        growth?: GrowthCurve;
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

### `StatStagesOptions` (interface)

    export interface StatStagesOptions {

        max: number;

        multiplier: (stage: number) => number;
    }

### `StrikeNumbers` (interface)

    export interface StrikeNumbers {
        damage: number;
        strikes: number;
        chanceToHit?: number;
        hits?: readonly boolean[];
    }

### `TypeMatrix` (class)

    export declare class TypeMatrix {
        private multipliers;
        private key;
        set(attacking: string, defending: string, multiplier: number): void;
        get(attacking: string, defending: string): number;

        multiplierFor(attacking: string, defendingTypes: readonly string[]): number;
    }

### `UnitSelector` (class)

    export declare class UnitSelector {
        readonly onChange: Signal<void>;
        private readonly units;
        private readonly side?;
        private readonly disabledOf;
        private readonly canTarget;
        private stage_;
        private charge;
        private victim;
        private highlight_;
        constructor(options: UnitSelectorOptions);
        get stage(): SelectorStage;
        get attacker(): SelectableUnit | null;
        get target(): SelectableUnit | null;

        get done(): boolean;

        get candidates(): readonly SelectableUnit[];

        get targets(): readonly SelectableUnit[];

        get highlight(): number;
        get highlighted(): SelectableUnit | null;

        move(delta: number): void;

        select(): boolean;

        back(): void;
        reset(): void;
        private active;
    }

### `UnitSelectorOptions` (interface)

    export interface UnitSelectorOptions {
        units: readonly SelectableUnit[];

        side?: string;

        disabled?: (unit: SelectableUnit) => boolean;

        canTarget?: (attacker: SelectableUnit, target: SelectableUnit) => boolean;
    }

### `Whiteboard` (class)

    export declare class Whiteboard<T extends WhiteboardEntry = WhiteboardEntry> {
        readonly onChange: Signal<void>;
        private planned;
        private undone;
        get plans(): readonly T[];
        get isEmpty(): boolean;
        get canUndo(): boolean;
        get canRedo(): boolean;

        plannedFor(unit: string): T | undefined;

        plan(action: T): void;

        undo(): T | null;

        redo(): T | null;

        clear(): void;

        commit(): T[];
    }

### `WhiteboardEntry` (interface)

    export interface WhiteboardEntry {

        unit: string;
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

### `ArmyState` (interface)

    export interface ArmyState {
        currency: number;
        pool: UnitTemplate[];
    }

### `BackgammonMove` (interface)

    export interface BackgammonMove {
        from: number | 'bar';
        to: number | 'off';
        die: number;
    }

### `backgammonMoves` (function)

    export declare function backgammonMoves(state: BackgammonState, dice: readonly number[]): BackgammonMove[];

### `BackgammonState` (interface)

    export interface BackgammonState {
        points: number[];
        bar: {
            white: number;
            black: number;
        };
        off: {
            white: number;
            black: number;
        };
        turn: 'white' | 'black';
    }

### `bankUnit` (function)

    export declare function bankUnit(army: ArmyState, board: TacticalState, unitId: string): boolean;

### `bitboardFromChess` (function)

    export declare function bitboardFromChess(state: ChessState): BitboardState;

### `BitboardMove` (interface)

    export interface BitboardMove {
        from: number;
        to: number;
        promotion?: PromotionKind;
    }

### `bitboardMoves` (function)

    export declare function bitboardMoves(board: BitboardState): BitboardMove[];

### `BitboardState` (interface)

    export interface BitboardState {

        pieces: bigint[];
        turn: ChessSide;

        castling: number;

        enPassant: number | null;
        halfmove: number;

        kings: [number, number];
    }

### `BitboardUndo` (interface)

    export interface BitboardUndo {
        captured: {
            color: 0 | 1;
            kind: number;
        } | null;
        castling: number;
        enPassant: number | null;
        halfmove: number;
        kingSquare: number;
    }

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

### `BoardOwner` (type)

    export type BoardOwner = string;

### `BoardPiece` (interface)

    export interface BoardPiece<K = string> {
        id: string;
        owner: BoardOwner;
        kind: K;
        count?: number;
    }

### `canPlaceSkirmishUnit` (function)

    export declare function canPlaceSkirmishUnit(state: SkirmishState, x: number, y: number): boolean;

### `canPlaceTacticalUnit` (function)

    export declare function canPlaceTacticalUnit(state: TacticalState, x: number, y: number): boolean;

### `Card` (interface)

    export interface Card {
        suit: CardSuit;
        rank: CardRank;
    }

### `CardRank` (type)

    export type CardRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

### `CardSuit` (type)

    export type CardSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

### `CheckersMove` (interface)

    export interface CheckersMove {
        from: number;
        to: number;
        captures: number[];
    }

### `checkersMoves` (function)

    export declare function checkersMoves(state: CheckersState): CheckersMove[];

### `CheckersPiece` (interface)

    export interface CheckersPiece {
        side: CheckersSide;
        king: boolean;
    }

### `CheckersSide` (type)

    export type CheckersSide = 'red' | 'black';

### `CheckersState` (interface)

    export interface CheckersState {
        board: Array<CheckersPiece | null>;
        turn: CheckersSide;
        forcedFrom: number | null;
    }

### `ChessCastling` (interface)

    export interface ChessCastling {
        whiteKingside: boolean;
        whiteQueenside: boolean;
        blackKingside: boolean;
        blackQueenside: boolean;
    }

### `ChessEngineAsyncOptions` (interface)

    export interface ChessEngineAsyncOptions {

        depth?: number;

        maxNodes?: number;

        signal?: AbortSignal;

        jobs?: number;
    }

### `ChessEngineOptions` (interface)

    export interface ChessEngineOptions {

        depth?: number;

        maxNodes?: number;
    }

### `chessGame` (const)

    export declare const chessGame: AlphaBetaGame<ChessState, ChessMove>;

### `ChessKind` (type)

    export type ChessKind = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

### `ChessMove` (interface)

    export interface ChessMove {
        from: ChessSquare;
        to: ChessSquare;
        promotion?: PromotionKind;
    }

### `ChessPiece` (interface)

    export interface ChessPiece {
        side: ChessSide;
        kind: ChessKind;
    }

### `ChessResult` (type)

    export type ChessResult = 'ongoing' | 'white-wins' | 'black-wins' | 'stalemate';

### `ChessSearchResult` (interface)

    export interface ChessSearchResult {
        move: ChessMove | null;
        score: number;
        nodes: number;
    }

### `ChessSide` (type)

    export type ChessSide = 'white' | 'black';

### `ChessSquare` (type)

    export type ChessSquare = number;

### `ChessState` (interface)

    export interface ChessState {
        board: Array<ChessPiece | null>;
        turn: ChessSide;
        castling: ChessCastling;

        enPassant: ChessSquare | null;
    }

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

### `DiceCategory` (type)

    export type DiceCategory = 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes' | 'threeKind' | 'fourKind' | 'fullHouse' | 'smallStraight' | 'largeStraight' | 'yahtzee' | 'chance';

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

### `GoState` (interface)

    export interface GoState {
        size: number;
        board: Array<GoStone | null>;
        turn: GoStone;
        ko: number | null;
        passes: number;
    }

### `GoStone` (type)

    export type GoStone = 'black' | 'white';

### `huffDecode` (function)

    export declare function huffDecode(code: string): Uint8Array;

### `huffEncode` (function)

    export declare function huffEncode(raw: Uint8Array): string;

### `inCheck` (function)

    export declare function inCheck(state: ChessState, side: ChessSide): boolean;

### `legalMoves` (function)

    export declare function legalMoves(state: ChessState): ChessMove[];

### `LoadedEnding` (interface)

    export interface LoadedEnding {
        id: string;

        extras: number[];
        positions: number;
        wdl: Uint8Array;
        dtm: Uint16Array;
    }

### `loadTablebaseEnding` (function)

    export declare function loadTablebaseEnding(file: TablebaseEnding): LoadedEnding;

### `makeMove` (function)

    export declare function makeMove(board: BitboardState, move: BitboardMove): BitboardUndo;

### `moveSkirmishUnit` (function)

    export declare function moveSkirmishUnit(state: SkirmishState, move: SkirmishMove): void;

### `moveSolitaireTableau` (function)

    export declare function moveSolitaireTableau(state: SolitaireState, from: number, to: number, count?: number): void;

### `moveSolitaireToFoundation` (function)

    export declare function moveSolitaireToFoundation(state: SolitaireState, source: 'waste' | number): void;

### `moveTacticalUnit` (function)

    export declare function moveTacticalUnit(state: TacticalState, move: TacticalMove): void;

### `OpeningBook` (interface)

    export interface OpeningBook {
        readonly version: 1;
        readonly positions: Record<string, OpeningBookEntry>;
    }

### `OpeningBookEntry` (interface)

    export interface OpeningBookEntry {

        readonly eco?: string;

        readonly name?: string;
        readonly moves: readonly string[];
    }

### `parseFen` (function)

    export declare function parseFen(fen: string): ChessState;

### `parseUciMove` (function)

    export declare function parseUciMove(uci: string): ChessMove;

### `passGo` (function)

    export declare function passGo(state: GoState): void;

### `perft` (function)

    export declare function perft(board: BitboardState, depth: number): number;

### `playGo` (function)

    export declare function playGo(state: GoState, x: number, y: number): void;

### `positionKey` (function)

    export declare function positionKey(state: ChessState): string;

### `probeBook` (function)

    export declare function probeBook(book: OpeningBook, state: ChessState): OpeningBookEntry | null;

### `probeTablebase` (function)

    export declare function probeTablebase(loaded: Record<string, LoadedEnding>, state: ChessState | BitboardState, halfmove?: number): TablebaseProbe | null;

### `PromotionKind` (type)

    export type PromotionKind = 'knight' | 'bishop' | 'rook' | 'queen';

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

### `searchAsync` (function)

    export declare function searchAsync(state: ChessState, options?: ChessEngineAsyncOptions): Promise<ChessSearchResult>;

### `searchTourney` (function)

    export declare function searchTourney(state: ChessState | BitboardState, options?: TourneyOptions): TourneyResult;

### `searchTourneyAsync` (function)

    export declare function searchTourneyAsync(state: ChessState | BitboardState, options?: TourneyAsyncOptions): Promise<TourneyResult>;

### `setSkirmishTerrain` (function)

    export declare function setSkirmishTerrain(state: SkirmishState, x: number, y: number, terrain: string, village?: boolean): void;

### `setTacticalOverwatch` (function)

    export declare function setTacticalOverwatch(state: TacticalState, unitId: string): void;

### `shuffleDeck` (function)

    export declare function shuffleDeck(deck: Card[]): Card[];

### `skirmishAttack` (function)

    export declare function skirmishAttack(state: SkirmishState, attackerId: string, defenderId: string): SkirmishExchange;

### `SkirmishCell` (interface)

    export interface SkirmishCell {
        terrain: string;

        village?: boolean;
        owner?: string;
    }

### `SkirmishExchange` (interface)

    export interface SkirmishExchange {
        strikes: SkirmishStrike[];
    }

### `skirmishIncome` (function)

    export declare function skirmishIncome(state: SkirmishState, owner: string, baseIncome: number, perVillage: number): number;

### `SkirmishMove` (interface)

    export interface SkirmishMove {
        unit: string;
        x: number;
        y: number;
        cost: number;
    }

### `skirmishMoves` (function)

    export declare function skirmishMoves(state: SkirmishState, unitId: string): SkirmishMove[];

### `SkirmishState` (interface)

    export interface SkirmishState {
        width: number;
        height: number;
        terrainTable: Record<string, SkirmishTerrain>;
        cells: SkirmishCell[];
        units: SkirmishUnit[];
        turn: string;
        round: number;
    }

### `SkirmishStrike` (interface)

    export interface SkirmishStrike {
        attacker: string;
        defender: string;
        hit: boolean;
        damage: number;
        killed: boolean;
    }

### `SkirmishTerrain` (interface)

    export interface SkirmishTerrain {

        moveCost: number;

        defense: number;
    }

### `SkirmishUnit` (interface)

    export interface SkirmishUnit {
        id: string;
        owner: string;
        x: number;
        y: number;
        hp: number;
        maxHp: number;

        moves: number;
        remainingMoves?: number;
        attack: number;

        hitChance: number;
    }

### `SolitaireState` (interface)

    export interface SolitaireState {
        stock: Card[];
        waste: Card[];
        tableau: Array<{
            down: Card[];
            up: Card[];
        }>;
        foundations: Card[][];
    }

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

### `startingBitboard` (function)

    export declare function startingBitboard(): BitboardState;

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

### `TablebaseEnding` (interface)

    export interface TablebaseEnding {
        version: 1;

        id: string;
        white: TablebaseExtra[];

        positions: number;

        wdl: string;

        dtm: string;
    }

### `TablebaseExtra` (type)

    export type TablebaseExtra = 'queen' | 'rook' | 'bishop' | 'knight';

### `tablebaseId` (function)

    export declare function tablebaseId(white: TablebaseExtra[]): string;

### `TablebaseProbe` (interface)

    export interface TablebaseProbe {
        outcome: 'win' | 'loss' | 'draw';

        dtm: number;
    }

### `tacticalAttack` (function)

    export declare function tacticalAttack(state: TacticalState, attackerId: string, defenderId: string, damage: number): TacticalAttack;

### `TacticalAttack` (interface)

    export interface TacticalAttack {
        attacker: string;
        defender: string;
        damage: number;
        cover: number;
        killed: boolean;
    }

### `TacticalCell` (interface)

    export interface TacticalCell {
        passable: boolean;
        cover?: number;
    }

### `TacticalMove` (interface)

    export interface TacticalMove {
        unit: string;
        x: number;
        y: number;
        cost: number;
    }

### `tacticalMoves` (function)

    export declare function tacticalMoves(state: TacticalState, unitId: string): TacticalMove[];

### `TacticalShape` (type)

    export type TacticalShape = 'square' | 'hex';

### `TacticalState` (interface)

    export interface TacticalState {
        width: number;
        height: number;
        shape: TacticalShape;
        cells: TacticalCell[];
        units: TacticalUnit[];
        turn: string;
        round: number;
    }

### `TacticalUnit` (interface)

    export interface TacticalUnit {
        id: string;
        owner: string;
        x: number;
        y: number;
        hp: number;
        maxHp: number;

        actions: number;

        maxActions?: number;
        overwatch?: boolean;
    }

### `TourneyAsyncOptions` (interface)

    export interface TourneyAsyncOptions extends TourneyOptions {

        jobs?: number;
    }

### `TourneyOptions` (interface)

    export interface TourneyOptions {

        depth?: number;

        maxNodes?: number;

        timeMs?: number;

        signal?: AbortSignal;
    }

### `TourneyResult` (interface)

    export interface TourneyResult {

        move: BitboardMove | null;

        score: number;

        nodes: number;

        depth: number;

        rootScores?: Array<{
            move: BitboardMove;
            score: number;
        }>;
    }

### `tourneyThink` (function)

    export declare function tourneyThink(position: BitboardState, options?: {
        depth?: number;

### `TrickPlay` (interface)

    export interface TrickPlay<O = string> {
        owner: O;
        card: Card;
    }

### `trickWinner` (function)

    export declare function trickWinner<O = string>(plays: TrickPlay<O>[], trumpSuit?: CardSuit): O;

### `triggerTacticalOverwatch` (function)

    export declare function triggerTacticalOverwatch(state: TacticalState, movingUnitId: string, damage: number): TacticalAttack[];

### `UnitTemplate` (type)

    export type UnitTemplate = Omit<TacticalUnit, 'x' | 'y'>;

### `unmakeMove` (function)

    export declare function unmakeMove(board: BitboardState, move: BitboardMove, undo: BitboardUndo): void;

### `UpkeepRates` (interface)

    export interface UpkeepRates {
        incomePerUnit: number;
        upkeepPerUnit: number;
    }

### `VisionCell` (interface)

    export interface VisionCell {
        x: number;
        y: number;
    }

## `./core`

### `AchievementCriterion` (interface)

    export interface AchievementCriterion {

        counter: string;

        target: number;
    }

### `AchievementDef` (interface)

    export interface AchievementDef {
        id: string;

        counter?: string;

        target?: number;

        criteria?: AchievementCriterion[];

        description?: string;
    }

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

        subProgress(id: string): readonly {
            counter: string;
            count: number;
            target: number;
            met: boolean;
        }[];

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

        replace(entries: readonly ActionJournalEntry<Action, Event>[]): void;
        static fromJSON<Action, Event>(entries: readonly ActionJournalEntry<Action, Event>[]): ActionJournal<Action, Event>;
    }

### `ActionJournalEntry` (interface)

    export interface ActionJournalEntry<Action, Event> {
        readonly sequence: number;
        readonly action: Action;
        readonly events: readonly Event[];
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

### `CanonicalState` (class)

    export declare class CanonicalState<State extends StateValue> {
        private _state;
        private readonly version;
        private readonly migrations;
        readonly extensions: StateRegistry;
        constructor(initial: State, options?: {
            readonly version?: number;
            readonly migrations?: Readonly<Record<number, (state: StateValue) => State>>;
            readonly extensions?: StateRegistry;
        });
        get state(): State;
        set(next: State): void;
        update(transform: (current: State) => State): State;
        snapshot(): CanonicalStateSnapshot<State>;
        restore(snapshot: CanonicalStateSnapshot<State>, options?: Parameters<StateRegistry['restore']>[1]): readonly StateRestoreDiagnostic[];
        transaction<T>(work: (state: CanonicalState<State>) => T): T;
    }

### `CanonicalStateSnapshot` (interface)

    export interface CanonicalStateSnapshot<State extends StateValue = StateValue> {
        readonly version: number;
        readonly state: State;
        readonly extensions: Readonly<Record<string, StateValue>>;
        readonly extensionVersions?: Readonly<Record<string, number>>;
    }

### `cellFromKey` (function)

    export declare function cellFromKey(key: string): {
        x: number;

### `cellIndex` (function)

    export declare function cellIndex(width: number, x: number, y: number): number;

### `cellInside` (function)

    export declare function cellInside(width: number, height: number, x: number, y: number): boolean;

### `cellKey` (function)

    export declare function cellKey(x: number, y: number): string;

### `cellX` (function)

    export declare function cellX(width: number, index: number): number;

### `cellY` (function)

    export declare function cellY(width: number, index: number): number;

### `chebyshev` (function)

    export declare function chebyshev(a: {
        readonly x: number;

### `checkNoControlCharacters` (function)

    export declare function checkNoControlCharacters(text: string): void;

### `checkSize` (function)

    export declare function checkSize(data: string | Uint8Array, options?: SizeLimitOptions): void;

### `CIRCLE8` (const)

    export declare const CIRCLE8: ReadonlyArray<readonly [number, number]>;

### `clamp` (function)

    export declare function clamp(value: number, min: number, max: number): number;

### `cloneData` (function)

    export declare function cloneData<T>(value: T, label: string): T;

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
        private parse;
    }

### `CollectionOptions` (interface)

    export interface CollectionOptions {

        namespace?: string;

        storage?: SaveStorage;
    }

### `createHandles` (function)

    export declare function createHandles<T>(): Handles<T>;

### `CsvColumnType` (type)

    export type CsvColumnType = 'string' | 'number' | 'boolean' | 'list' | 'map';

### `CsvOptions` (interface)

    export interface CsvOptions {

        columns?: Record<string, CsvColumnType>;

        listDelimiter?: string;

        mapDelimiter?: string;
    }

### `CustomSettingValue` (type)

    export type CustomSettingValue = string | number | boolean;

### `DbRecord` (interface)

    export interface DbRecord {
        id: string;
        [field: string]: unknown;
    }

### `defaultSettings` (function)

    export declare function defaultSettings(): GameSettings;

### `deserializeReplay` (function)

    export declare function deserializeReplay(json: string): ReplayEvent[];

### `DialogueLine` (interface)

    export interface DialogueLine {
        text: string;
        speaker?: string;
    }

### `distance` (function)

    export declare function distance(metric: DistanceMetric, a: {
        readonly x: number;

### `DistanceMetric` (type)

    export type DistanceMetric = 'euclidean' | 'manhattan' | 'chebyshev';

### `downloadReplayFile` (function)

    export declare function downloadReplayFile(json: string, filename: string): void;

### `Easing` (const)

    export declare const Easing: Record<'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic', Easing>;

### `effectiveMusicVolume` (function)

    export declare function effectiveMusicVolume(settings: Pick<GameSettings, 'musicVolume' | 'muted'>): number;

### `effectiveSfxVolume` (function)

    export declare function effectiveSfxVolume(settings: Pick<GameSettings, 'sfxVolume' | 'muted'>): number;

### `EntityId` (type)

    export type EntityId = string;

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

### `euclidean` (function)

    export declare function euclidean(a: {
        readonly x: number;

### `exportReplayFile` (function)

    export declare function exportReplayFile(events: readonly ReplayEvent[], meta: ReplayFileMeta): string;

### `FeedbackClient` (class)

    export declare class FeedbackClient extends HttpTransport {
        constructor(options: FeedbackOptions);
        submit(request: FeedbackRequest): Promise<FeedbackResponse>;
    }

### `FeedbackOptions` (type)

    export type FeedbackOptions = HttpTransportOptions;

### `FeedbackRequest` (interface)

    export interface FeedbackRequest {
        message: string;
        contact?: string;
        context?: Record<string, string | number | boolean>;
    }

### `FeedbackResponse` (interface)

    export interface FeedbackResponse {
        ok: boolean;
        status: number;
    }

### `FloatSource` (interface)

    export interface FloatSource {

        float(): number;
    }

### `GameSettings` (interface)

    export interface GameSettings {

        musicVolume: number;

        sfxVolume: number;

        muted: boolean;

        zoom: number;

        bindings: Record<Action, string[]>;

        custom: Record<string, CustomSettingValue>;
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
        private rotl;
    }

### `Handles` (interface)

    export interface Handles<T> {

        readonly size: number;

        put(value: T): number;

        get(id: number): T;

        drop(id: number): void;

        clear(): void;

        with<R>(value: T, body: (id: number) => R): R;
    }

### `HexCoord` (interface)

    export interface HexCoord {
        x: number;
        y: number;
    }

### `hexDistance` (function)

    export declare function hexDistance(a: HexCoord, b: HexCoord): number;

### `hexLine` (function)

    export declare function hexLine(a: HexCoord, b: HexCoord): HexCoord[];

### `hexNeighbors` (function)

    export declare function hexNeighbors(x: number, y: number): HexCoord[];

### `HexOffset` (type)

    export type HexOffset = 'odd' | 'even';

### `HexOrientation` (type)

    export type HexOrientation = 'flat-top' | 'pointy-top';

### `hexRange` (function)

    export declare function hexRange(center: HexCoord, radius: number): HexCoord[];

### `HexShape` (interface)

    export interface HexShape {
        readonly orientation?: HexOrientation;
        readonly offset?: HexOffset;
    }

### `hexToPixel` (function)

    export declare function hexToPixel(x: number, y: number, tileWidth: number, tileHeight: number, shape?: HexShape): {
        x: number;

### `Hook` (interface)

    export interface Hook<TArgs extends unknown[]> {
        event: string;
        handler: (...args: TArgs) => void;

        source?: unknown;
    }

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

### `HttpTransport` (class)

    export declare abstract class HttpTransport {
        protected readonly endpoint: string;
        protected readonly timeoutMs: number;
        protected readonly fetchFn: typeof globalThis.fetch;
        protected readonly maxResponseBytes: number;
        private readonly label;
        constructor(options: HttpTransportOptions, label: string);
        protected withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T>;

        protected readText(response: Response): Promise<string>;

        protected readJson(response: Response, what: string): Promise<unknown>;
    }

### `HttpTransportOptions` (interface)

    export interface HttpTransportOptions {
        endpoint: string;
        timeoutMs?: number;
        fetch?: typeof globalThis.fetch;

        maxResponseBytes?: number;

        allowInsecure?: boolean;
    }

### `importReplayFile` (function)

    export declare function importReplayFile(json: string, expect: {
        framework: string;

### `Input` (namespace)

    export * as Input from './Input.ts'

### `JavaRandom` (class)

    export declare class JavaRandom {
        private state;
        private readonly onDraw?;
        constructor(seed?: number | bigint, options?: JavaRandomOptions);

        setSeed(seed: number | bigint): void;

        next(bits: number): number;

        nextInt(bound?: number): number;

        nextLong(): bigint;

        nextDouble(): number;

        nextFloat(): number;
        nextBoolean(): boolean;
    }

### `JavaRandomDraw` (interface)

    export interface JavaRandomDraw {

        bits: number;

        value: number;
    }

### `JavaRandomOptions` (interface)

    export interface JavaRandomOptions {

        onDraw?: (draw: JavaRandomDraw) => void;
    }

### `LastRun` (class)

    export declare class LastRun {
        private readonly store;
        private readonly maxEvents;
        constructor(options: LastRunOptions);

        keep(events: readonly ReplayEvent[], seed?: number): void;

        load(): LastRunData | null;

        clear(): void;
    }

### `LastRunData` (interface)

    export interface LastRunData {
        version: 1;
        seed?: number;
        events: readonly ReplayEvent[];
    }

### `LastRunOptions` (interface)

    export interface LastRunOptions {

        namespace: string;
        storage?: SaveStorage;

        maxEvents?: number;
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

### `LoadSnapshot` (interface)

    export interface LoadSnapshot {
        status: LoadStatus;
        completed: number;
        total: number;
        current: string | null;
        error: unknown | null;
    }

### `LoadStatus` (type)

    export type LoadStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'cancelled';

### `LoadTask` (interface)

    export interface LoadTask {
        id: string;
        weight?: number;
        run(context: LoadTaskContext): Promise<void> | void;
    }

### `LoadTaskContext` (interface)

    export interface LoadTaskContext {

        report(fraction: number): void;

        readonly cancelled: boolean;
    }

### `LockstepClient` (class)

    export declare class LockstepClient {
        readonly onWelcome: Signal<LockstepWelcome>;
        readonly onTick: Signal<TickEvent>;
        readonly onReject: Signal<{
            reason: string;
        }>;
        readonly onDesync: Signal<{
            tick: number;
            checksums: Record<string, number>;
        }>;
        readonly onClose: Signal<void>;

        readonly onProtocolError: Signal<{
            reason: string;
        }>;
        private socket;
        private readonly url;
        private readonly createSocket;
        private readonly validateInput?;
        private readonly maxMessageBytes;
        private _id;
        constructor(options: LockstepClientOptions);

        get id(): string | null;
        get connected(): boolean;
        connect(): void;

        submitInput(payload: unknown, checksum?: number): void;
        close(): void;
        private handleMessage;
    }

### `LockstepClientOptions` (interface)

    export interface LockstepClientOptions {
        url: string;

        create?: (url: string) => WebSocketLike;

        validateInput?: (payload: unknown) => boolean | string;

        maxMessageBytes?: number;

        allowInsecure?: boolean;
    }

### `LockstepWelcome` (interface)

    export interface LockstepWelcome {
        id: string;

        seed?: number;

        initialState?: unknown;
    }

### `LogEntry` (interface)

    export interface LogEntry {
        level: LogLevel;
        category: string;
        message: string;
        data?: unknown;
        time: number;
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

### `LoggerOptions` (interface)

    export interface LoggerOptions {

        level?: LogLevel;

        sink?: (entry: LogEntry) => void;
    }

### `LogLevel` (type)

    export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

### `manhattan` (function)

    export declare function manhattan(a: {
        readonly x: number;

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

### `MersenneTwisterState` (interface)

    export interface MersenneTwisterState {

        seed: number;

        state: number[];

        index: number;

        discard: number;
    }

### `motionDuration` (function)

    export declare function motionDuration(duration: number, intent?: MotionIntent): number;

### `MotionIntent` (type)

    export type MotionIntent = 'decorative' | 'meaningful';

### `NEIGHBOURS4` (const)

    export declare const NEIGHBOURS4: ReadonlyArray<readonly [number, number]>;

### `NEIGHBOURS8` (const)

    export declare const NEIGHBOURS8: ReadonlyArray<readonly [number, number]>;

### `NewsClient` (class)

    export declare class NewsClient extends HttpTransport {
        constructor(options: NewsOptions);

        fetchItems(): Promise<NewsItem[]>;
    }

### `NewsItem` (interface)

    export interface NewsItem {
        id: string;
        title: string;
        body: string;
        publishedAt?: number;
    }

### `NewsOptions` (type)

    export type NewsOptions = HttpTransportOptions;

### `NewsSeenOptions` (interface)

    export interface NewsSeenOptions {
        namespace: string;
        storage?: SaveStorage;
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

### `parseDialogueLines` (function)

    export declare function parseDialogueLines(source: string): DialogueLine[];

### `parseInbound` (function)

    export declare function parseInbound(text: string, options?: SizeLimitOptions & {
        label?: string;

### `parseReplayEvents` (function)

    export declare function parseReplayEvents(parsed: unknown): ReplayEvent[];

### `parseTwee` (function)

    export declare function parseTwee(source: string): TweeStory;

### `pickReplayFile` (function)

    export declare function pickReplayFile(accept?: string): Promise<Blob | null>;

### `pixelToHex` (function)

    export declare function pixelToHex(px: number, py: number, tileWidth: number, tileHeight: number, shape?: HexShape): HexCoord;

### `Player` (class)

    export declare class Player {
        private frame;
        private index;
        private readonly fromFrame;
        private readonly events;
        private readonly dispatch;
        private readonly frames;
        private readonly onFrame;
        constructor(events: readonly ReplayEvent[], dispatch: (action: string) => void, frames: Signal<number>, options?: {
            fromFrame?: number;
        });

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

### `PlayerInputOptions` (interface)

    export interface PlayerInputOptions {

        padIndex?: number;
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

### `PlayerStatsOptions` (interface)

    export interface PlayerStatsOptions<T, S = T> {

        namespace: string;
        storage?: SaveStorage;

        initial: T;

        combine: (total: T, summary: S) => T;
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

### `PresentationQueueOptions` (interface)

    export interface PresentationQueueOptions<Event> {

        play: (event: Event) => number | void;
    }

### `Random` (namespace)

    export * as Random from './Random.ts'

### `RandomSource` (interface)

    export interface RandomSource extends FloatSource {

        int(bound: number): number;
    }

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

### `ReactionRule` (interface)

    export interface ReactionRule<TState> {
        id: string;
        when: (state: Readonly<TState>) => boolean;
        action: (state: Readonly<TState>) => void;

        once?: boolean;
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

### `readReplayFile` (function)

    export declare function readReplayFile(file: Blob): Promise<string>;

### `Recorder` (class)

    export declare class Recorder {
        private frameStamp;
        private readonly fromFrame;
        private readonly recorded;
        private readonly actions;
        private readonly frames;
        private readonly onAction;
        private readonly onFrame;
        constructor(actions: Signal<string>, frames: Signal<number>, options?: {
            fromFrame?: number;
        });
        get events(): readonly ReplayEvent[];

        get frame(): number;

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

### `ReplayEvent` (interface)

    export interface ReplayEvent {
        frame: number;
        action: string;
    }

### `ReplayFile` (interface)

    export interface ReplayFile {
        format: 'mwg-replay';
        version: 1;

        framework: string;

        game: string;

        seed?: number;

        recordedAt?: number;
        events: readonly ReplayEvent[];
    }

### `ReplayFileMeta` (interface)

    export interface ReplayFileMeta {
        framework: string;
        game: string;
        seed?: number;
        recordedAt?: number;
    }

### `resumeRunPlayer` (function)

    export declare function resumeRunPlayer<T>(checkpoint: RunCheckpoint<T>, dispatch: (action: string) => void, frames: Signal<number>): Player;

### `runCheckpoint` (function)

    export declare function runCheckpoint<T>(recorder: Recorder, state: T): RunCheckpoint<T>;

### `RunCheckpoint` (interface)

    export interface RunCheckpoint<T> {
        version: 1;

        frame: number;
        events: readonly ReplayEvent[];
        state: T;
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

### `RunHistoryEntry` (interface)

    export interface RunHistoryEntry<T> {
        id: string;
        endedAt: number;
        summary: T;
    }

### `RunHistoryOptions` (interface)

    export interface RunHistoryOptions {

        namespace: string;
        storage?: SaveStorage;

        limit?: number;
    }

### `sanitizeInboundText` (function)

    export declare function sanitizeInboundText(text: string, options?: SizeLimitOptions): string;

### `SaveData` (interface)

    export interface SaveData<T> {
        meta: SaveMeta;
        state: T;
    }

### `SaveMeta` (interface)

    export interface SaveMeta {
        version: number;
        savedAt: number;

        preview?: unknown;
    }

### `SaveStorage` (interface)

    export interface SaveStorage {
        read(key: string): string | null;
        write(key: string, value: string): void;
        remove(key: string): void;
        keys(): string[];
    }

### `SaveSyncClient` (class)

    export declare class SaveSyncClient extends HttpTransport {
        constructor(options: SaveSyncOptions);

        upload(slot: string, payload: string): Promise<SaveSyncResponse>;

        download(slot: string): Promise<string>;

        list(): Promise<string[]>;
        private slotUrl;
    }

### `SaveSyncOptions` (type)

    export type SaveSyncOptions = HttpTransportOptions;

### `SaveSyncResponse` (interface)

    export interface SaveSyncResponse {
        ok: boolean;
        status: number;
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

### `SaveSystemOptions` (interface)

    export interface SaveSystemOptions {

        namespace: string;
        version: number;

        migrations?: Record<number, (state: unknown) => unknown>;
        storage?: SaveStorage;
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

### `SceneClass` (type)

    export type SceneClass<T extends Scene = Scene> = new () => T;

### `SceneComponent` (interface)

    export interface SceneComponent<TScene extends Scene = Scene> {
        readonly name: string;
        create?(scene: TScene): void;
        update?(scene: TScene, dt: number): void;
        resize?(scene: TScene, width: number, height: number): void;
        onSuspend?(scene: TScene): void;
        onResume?(scene: TScene, result: unknown): void;
        destroy?(scene: TScene): void;
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

### `Schema` (type)

    export type Schema = {
        type: 'string';

### `scramble` (function)

    export declare function scramble(text: string, key: string): string;

### `serializeReplay` (function)

    export declare function serializeReplay(events: readonly ReplayEvent[]): string;

### `Session` (class)

    export declare class Session {

        readonly launches: number;
        constructor(options?: SessionOptions);
    }

### `SessionOptions` (interface)

    export interface SessionOptions {

        namespace?: string;
        storage?: SaveStorage;
    }

### `setReducedMotion` (function)

    export declare function setReducedMotion(value: boolean | null): void;

### `Settings` (class)

    export declare class Settings {
        private readonly storage;
        private readonly key;
        private value;
        constructor(options?: SettingsOptions);

        get current(): GameSettings;

        getCustom(key: string, fallback: CustomSettingValue): CustomSettingValue;

        setCustom(key: string, value: CustomSettingValue): void;
        setMusicVolume(volume: number): void;
        setSfxVolume(volume: number): void;
        setMuted(muted: boolean): void;
        setZoom(zoom: number): void;
        setBindings(bindings: Readonly<Record<Action, readonly string[]>>): void;
        update(patch: {
            musicVolume?: number;
            sfxVolume?: number;
            muted?: boolean;
            zoom?: number;
            bindings?: Readonly<Record<Action, readonly string[]>>;
            custom?: Readonly<Record<string, CustomSettingValue>>;
        }): void;

        applyBindings(): void;

        reset(): void;
    }

### `SettingsOptions` (interface)

    export interface SettingsOptions {

        namespace?: string;
        storage?: SaveStorage;
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

### `SignalListener` (type)

    export type SignalListener<T> = (value: T) => boolean | void;

### `SizeLimitOptions` (interface)

    export interface SizeLimitOptions {

        maxBytes?: number;
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

### `SpawnerOptions` (interface)

    export interface SpawnerOptions<T> {
        waves: readonly Wave<T>[];
        onSpawn: (kind: T) => void;

        onWaveStart?: (waveIndex: number) => void;

        onComplete?: () => void;
    }

### `stateChecksum` (function)

    export declare function stateChecksum(value: unknown): number;

### `StateExtension` (interface)

    export interface StateExtension<T extends StateValue = StateValue> {

        readonly id: string;

        readonly capture: () => T;

        readonly restore: (state: T) => void;

        readonly version?: number;

        readonly migrations?: Readonly<Record<number, (state: StateValue) => T>>;

        readonly reset?: () => void;

        readonly remove?: () => void;
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

### `StateRestoreDiagnostic` (interface)

    export interface StateRestoreDiagnostic {
        readonly extension: string;
        readonly from: number;
        readonly to: number;
        readonly status: 'migrated' | 'unchanged' | 'reset' | 'removed';
    }

### `StateSnapshot` (interface)

    export interface StateSnapshot {
        readonly extensions: Readonly<Record<string, StateValue>>;
        readonly versions?: Readonly<Record<string, number>>;
    }

### `StateValue` (type)

    export type StateValue = null | boolean | number | string | StateValue[] | {
        readonly [key: string]: StateValue;

### `SyncGuard` (class)

    export declare class SyncGuard {
        private readonly reference;
        private desyncTick;

        observe(tick: number, checksum: number): boolean;

        get divergent(): boolean;

        get atTick(): number | null;

        reset(): void;
    }

### `TelemetryClient` (class)

    export declare class TelemetryClient extends HttpTransport {
        private consented;
        private readonly maxStringLength;
        private readonly maxProperties;
        private readonly allowed;
        constructor(options: TelemetryOptions);

        get hasConsent(): boolean;

        setConsent(granted: boolean): void;

        send(event: TelemetryEvent): Promise<TelemetryResponse | null>;

        private bounded;
    }

### `TelemetryEvent` (interface)

    export interface TelemetryEvent {
        name: string;
        properties?: Record<string, string | number | boolean | null>;
    }

### `TelemetryOptions` (interface)

    export interface TelemetryOptions extends HttpTransportOptions {

        maxStringLength?: number;

        maxProperties?: number;

        allowedProperties?: readonly string[];
    }

### `TelemetryResponse` (interface)

    export interface TelemetryResponse {
        ok: boolean;
        status: number;
    }

### `TickEvent` (interface)

    export interface TickEvent {
        tick: number;

        inputs: Record<string, unknown>;

        checksums?: Record<string, number>;
    }

### `TweeChoice` (interface)

    export interface TweeChoice {
        text: string;
        goto?: string;
    }

### `TweeCommand` (type)

    export type TweeCommand = {
        say: string;

### `Tweener` (class)

    export declare class Tweener {
        private tweens;

        tween(duration: number, apply: (t: number) => void, options?: Easing | TweenOptions): Promise<void>;
        update(dt: number): void;

        get isBusy(): boolean;

        clear(): void;
    }

### `TweenOptions` (interface)

    export interface TweenOptions {

        ease?: Easing;

        intent?: MotionIntent;

        alternate?: (t: number) => void;
    }

### `TweeStory` (interface)

    export interface TweeStory {
        story: Record<string, TweeCommand[]>;

        start: string;

        title?: string;
    }

### `uncloneablePath` (function)

    export declare function uncloneablePath(value: unknown, root?: string): string | null;

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

### `UndoHistoryOptions` (interface)

    export interface UndoHistoryOptions {

        limit?: number;
    }

### `unscramble` (function)

    export declare function unscramble(payload: string, key: string): string;

### `validateSchema` (function)

    export declare function validateSchema(value: unknown, schema: Schema, path?: string): void;

### `watchReducedMotion` (function)

    export declare function watchReducedMotion(listener: (reduced: boolean) => void): () => void;

### `Wave` (interface)

    export interface Wave<T> {
        delay: number;
        entries: readonly {
            kind: T;
            count: number;
        }[];

        duration?: number;
    }

### `WebSocketLike` (interface)

    export interface WebSocketLike {
        readyState: number;
        send(data: string): void;
        close(): void;
        onopen: ((event: unknown) => void) | null;
        onclose: ((event: unknown) => void) | null;
        onerror: ((event: unknown) => void) | null;
        onmessage: ((event: {
            data: string;
        }) => void) | null;
    }

### `WeightedCell` (interface)

    export interface WeightedCell<T> {
        readonly cell: T;
        readonly cost: number;
    }

### `weightedFlood` (function)

    export declare function weightedFlood<T, K>(start: T, options: WeightedFloodOptions<T, K>): Map<K, WeightedCell<T>>;

### `WeightedFloodOptions` (interface)

    export interface WeightedFloodOptions<T, K> {

        key: (cell: T) => K;

        neighbors: (cell: T) => Iterable<T>;

        cost: (from: T, to: T) => number;

        maxCost: number;

        canEnter?: (cell: T, from: T, cost: number) => boolean;

        stop?: (cell: T, cost: number) => boolean;
    }

## `./headless`

### `actors` (namespace)

    export * as actors from '../actors/index.ts'

### `ai` (namespace)

    export * as ai from '../ai/index.ts'

### `assetBinary` (namespace)

    export * as assetBinary from '../assets/binary.ts'

### `assetPaths` (namespace)

    export * as assetPaths from '../assets/paths.ts'

### `audio` (namespace)

    export * as audio from '../audio/index.ts'

### `battle` (namespace)

    export * as battle from '../battle/index.ts'

### `board` (namespace)

    export * as board from '../board/index.ts'

### `core` (namespace)

    export * as core from '../core/index.ts'

### `i18n` (namespace)

    export * as i18n from '../i18n/index.ts'

### `mwl` (namespace)

    export * as mwl from '../mwl/index.ts'

### `roguelike` (namespace)

    export * as roguelike from '../roguelike/index.ts'

### `rpg` (namespace)

    export * as rpg from '../rpg/index.ts'

### `simulation` (namespace)

    export * as simulation from '../simulation/index.ts'

### `testing` (namespace)

    export * as testing from '../testing/index.ts'

### `world` (namespace)

    export * as world from '../world/index.ts'

## `./i18n`

### `AUDIO_SUFFIX` (const)

    export declare const AUDIO_SUFFIX = ".audio";

### `AudioIssue` (interface)

    export interface AudioIssue {

        key: string;
        kind: 'empty-audio-path' | 'audio-not-a-path';
        detail: string;
    }

### `Catalog` (interface)

    export interface Catalog {

        locale: string;
        direction: Direction;
        messages: Record<string, MessageValue>;

        typography?: boolean;
    }

### `catalogCompleteness` (function)

    export declare function catalogCompleteness(reference: Catalog, other: Catalog): number;

### `CatalogIssue` (interface)

    export interface CatalogIssue {
        key: string;
        kind: 'empty-message' | 'plural-missing-other';
        detail: string;
    }

### `CatalogKeyDiff` (interface)

    export interface CatalogKeyDiff {

        missing: readonly string[];

        extra: readonly string[];
    }

### `catalogUsage` (function)

    export declare function catalogUsage(catalog: Catalog, referencedKeys: Iterable<string>): CatalogUsageStats;

### `CatalogUsageStats` (interface)

    export interface CatalogUsageStats {
        totalKeys: number;
        usedKeys: number;

        unusedKeys: readonly string[];
    }

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

### `EditRow` (interface)

    export interface EditRow {
        key: string;
        baseText: string;

        targetText: string;
        status: 'ok' | 'missing' | 'extra';

        sound?: string;

        soundKey?: string;

        soundInherited: boolean;
    }

### `EditSession` (interface)

    export interface EditSession {
        base: Catalog;
        target: Catalog;
    }

### `EntityTextResolver` (type)

    export type EntityTextResolver<Id = string> = (id: Id) => string;

### `findSimilarMessages` (function)

    export declare function findSimilarMessages(catalog: Catalog, minSimilarity?: number): SimilarMessagePair[];

### `FluentMessage` (interface)

    export interface FluentMessage {
        format(params?: MessageParams): string;
    }

### `FluentOptions` (interface)

    export interface FluentOptions {
        direction?: Direction;
    }

### `formatDate` (function)

    export declare function formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string;

### `formatList` (function)

    export declare function formatList(items: readonly string[], options?: Intl.ListFormatOptions): string;

### `formatNumber` (function)

    export declare function formatNumber(value: number, options?: Intl.NumberFormatOptions): string;

### `formatSpec` (function)

    export declare function formatSpec(value: string | number, spec: string, language?: string): string | undefined;

### `GrammaticalEntity` (interface)

    export interface GrammaticalEntity {
        gender?: 'masculine' | 'feminine' | 'neuter' | 'common';
        plural?: boolean;
        properNoun?: boolean;

        forms?: Record<string, string>;
    }

### `has` (function)

    export declare function has(key: string): boolean;

### `InlineSoundCue` (interface)

    export interface InlineSoundCue {

        path: string;

        index: number;
    }

### `isAudioKey` (function)

    export declare function isAudioKey(key: string): boolean;

### `levenshteinDistance` (function)

    export declare function levenshteinDistance(a: string, b: string): number;

### `locale` (function)

    export declare function locale(): string;

### `mergeCatalogKeys` (function)

    export declare function mergeCatalogKeys(catalog: Catalog, survivingKey: string, mergedKey: string): Catalog;

### `MessageChannel` (type)

    export type MessageChannel = 'log' | 'compact' | 'accessibility' | 'debug' | 'audio';

### `MessageFormatter` (interface)

    export interface MessageFormatter {
        format(message: SemanticMessage, channel: MessageChannel): string;
    }

### `MessageParams` (interface)

    export interface MessageParams {

        count?: number;

        [token: string]: string | number | MessageParams | undefined;
    }

### `MessagePart` (type)

    export type MessagePart = string | Placeholder;

### `messageText` (function)

    export declare function messageText(value: MessageValue): string;

### `MessageValue` (type)

    export type MessageValue = string | PluralForms | FluentMessage;

### `nonBreakingUnit` (function)

    export declare function nonBreakingUnit(value: string | number, unit: string, language?: string): string;

### `ParsedSoundText` (interface)

    export interface ParsedSoundText {
        text: string;
        cues: InlineSoundCue[];
    }

### `parseFTL` (function)

    export declare function parseFTL(locale: string, source: string, options?: FluentOptions): Catalog;

### `parsePo` (function)

    export declare function parsePo(locale: string, source: string, options?: PoOptions): Catalog;

### `parseSoundMarkers` (function)

    export declare function parseSoundMarkers(source: string): ParsedSoundText;

### `Placeholder` (interface)

    export interface Placeholder {

        raw: string;
        token: string;
        debug: boolean;
        conv: string | undefined;
        spec: string | undefined;
    }

### `PlaceholderDiff` (interface)

    export interface PlaceholderDiff {

        missing: string[];

        extra: string[];

        changed: Array<{
            token: string;
            base: string;
            target: string;
        }>;
    }

### `PluralCoverage` (interface)

    export interface PluralCoverage {

        pluralKeys: number;

        formsPresent: Partial<Record<Intl.LDMLPluralRule, number>>;
    }

### `pluralFormCoverage` (function)

    export declare function pluralFormCoverage(catalog: Catalog): PluralCoverage;

### `PluralForms` (type)

    export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;

### `PoOptions` (interface)

    export interface PoOptions {

        direction?: Direction;

        domain?: string;
    }

### `reset` (function)

    export declare function reset(): void;

### `RowFilter` (interface)

    export interface RowFilter {

        missingOnly?: boolean;

        query?: string;
    }

### `SemanticMessage` (interface)

    export interface SemanticMessage<TType extends string = string, TParams extends Record<string, unknown> = Record<string, unknown>> {
        type: TType;
        params: TParams;
    }

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

### `SimilarMessagePair` (interface)

    export interface SimilarMessagePair {
        a: string;
        b: string;
        distance: number;

        similarity: number;
    }

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

### `AiHook` (type)

    export type AiHook = (world: HookWorld, emit: Emit, context: HookContext) => void;

### `attributeTypeDescription` (function)

    export declare function attributeTypeDescription(type: MwlAttributeType): string;

### `BuiltinHookType` (type)

    export type BuiltinHookType = 'predicate' | 'modifier' | 'generator' | 'command' | 'ai' | 'migration';

### `campaignChain` (function)

    export declare function campaignChain<State extends StateValue, Result extends StateValue = StateValue>(definition: MwlCampaignDefinition, options: {
        readonly run: MwlScenarioRunner<State, Result>;

### `carryoverIntoScenario` (function)

    export declare function carryoverIntoScenario(carryover: MwlCarryover, declaredGold: number): number;

### `coerceTableValue` (function)

    export declare function coerceTableValue(raw: string, type: CsvColumnType, column: string, listDelimiter?: string, mapDelimiter?: string): unknown;

### `collectHookReferences` (function)

    export declare function collectHookReferences(game: MwlCompiledGame, hookAttributeNames?: readonly string[]): HookReference[];

### `CommandHook` (type)

    export type CommandHook = (world: HookWorld, emit: Emit, context: HookContext) => void;

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

### `decodeSaveEnvelope` (function)

    export declare function decodeSaveEnvelope(snapshot: string, options: MwlPersistenceOptions): MwlSaveEnvelope;

### `effectToModifier` (function)

    export declare function effectToModifier(effect: MwlEffectDefinition, context?: MwlExpressionContext): Modifier;

### `Emit` (interface)

    export interface Emit {
        move(unit: string, x: number, y: number): void;
        attack(attacker: string, defender: string, weapon?: string): void;
        spawn(type: string, side: string, x: number, y: number): void;
        kill(unit: string): void;
        gold(side: string, delta: number): void;

        setVariable(name: string, value: MwlValue): void;
        message(speaker: string, text: string): void;
        endTurn(): void;
        win(side: string): void;
        lose(side: string): void;
    }

### `emitArtifacts` (function)

    export declare function emitArtifacts(game: MwlCompiledGame, options?: MwlEmitOptions): readonly MwlArtifact[];

### `emitHooksDeclaration` (function)

    export declare function emitHooksDeclaration(references: readonly HookReference[]): string;

### `emitModule` (function)

    export declare function emitModule(game: MwlCompiledGame, variable?: string): string;

### `emitTableTypes` (function)

    export declare function emitTableTypes(tables: readonly MwlTableDefinition[], options?: EmitTableTypesOptions): string;

### `EmitTableTypesOptions` (interface)

    export interface EmitTableTypesOptions {

        readonly header?: string;
    }

### `encodeSave` (function)

    export declare function encodeSave(world: MwlWorld, options: MwlPersistenceOptions, hookState?: Readonly<Record<string, unknown>>, journal?: readonly ActionJournalEntry<unknown, unknown>[]): string;

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

### `GeneratorHook` (type)

    export type GeneratorHook = (world: HookWorld, context: HookContext) => unknown;

### `HookContext` (type)

    export type HookContext = Readonly<Record<string, string>>;

### `HookRandom` (interface)

    export interface HookRandom {

        float(): number;

        int(bound: number): number;
    }

### `HookReference` (interface)

    export interface HookReference {
        readonly type: HookType;
        readonly name: string;
        readonly location?: MwlLocation;
    }

### `HookType` (type)

    export type HookType = BuiltinHookType | (string & {});

### `HookTypeMap` (interface)

    export interface HookTypeMap {
        predicate: PredicateHook;
        modifier: ModifierHook;
        generator: GeneratorHook;
        command: CommandHook;
        ai: AiHook;
        migration: MigrationHook;
    }

### `hookTypes` (const)

    export declare const hookTypes: readonly HookType[];

### `HookWorld` (interface)

    export interface HookWorld {
        readonly variables: Readonly<Record<string, MwlValue>>;

        variableAt(path: string): MwlValue | undefined;
        readonly units: Readonly<Record<string, {
            readonly hp: number;
            readonly x: number;
            readonly y: number;
            readonly alive: boolean;
            readonly type?: string;

            readonly side?: string;
        }>>;
        readonly sides: Readonly<Record<string, {
            readonly gold: number;
            readonly income: number;
        }>>;
        readonly turn: number;

        readonly random: HookRandom;
    }

### `inventoryItem` (function)

    export declare function inventoryItem(item: MwlActorItem, quantity?: number): InventoryItem;

### `isGettext` (function)

    export declare function isGettext(raw: string): boolean;

### `isMwlId` (function)

    export declare function isMwlId(value: string): boolean;

### `itemDefinition` (function)

    export declare function itemDefinition(item: MwlItemDefinition, context?: MwlExpressionContext): MwlActorItem;

### `loadContent` (function)

    export declare function loadContent(files: readonly MwlSourceFile[], options?: MwlCompileOptions): MwlContentLoadReport;

### `MigrationHook` (type)

    export type MigrationHook = (saved: unknown, context: HookContext) => unknown;

### `ModifierHook` (type)

    export type ModifierHook = (value: number, world: HookWorld, context: HookContext) => number;

### `MWL_DEFAULT_CARRYOVER_PERCENTAGE` (const)

    export declare const MWL_DEFAULT_CARRYOVER_PERCENTAGE = 80;

### `MWL_SCHEMA_01` (const)

    export declare const MWL_SCHEMA_01 = "0.1";

### `MWL_SCHEMA_10` (const)

    export declare const MWL_SCHEMA_10 = "1.0";

### `MwlActorItem` (interface)

    export interface MwlActorItem extends ItemDefinition {
        readonly id: string;
        readonly slot?: string;
        readonly modifiers?: Modifier[];
    }

### `MwlAiDefinition` (interface)

    export interface MwlAiDefinition {
        readonly id: string;
        readonly strategy?: string;
        readonly target?: string;
        readonly difficulty?: number;
        readonly scope?: 'actor' | 'controller';
        readonly provider?: 'javascript' | 'lua';
        readonly algorithm?: 'rules' | 'alpha_beta';
        readonly depth?: number;
        readonly maxNodes?: number;
        readonly player?: string;
        readonly moves?: string;
        readonly apply?: string;
        readonly terminal?: string;
        readonly evaluate?: string;
        readonly behaviors: readonly MwlBehaviorDefinition[];
    }

### `MwlArtifact` (interface)

    export interface MwlArtifact {
        readonly name: string;
        readonly content: string;
    }

### `MwlAttributeType` (type)

    export type MwlAttributeType = MwlValueType | readonly string[];

### `MwlBehaviorDefinition` (interface)

    export interface MwlBehaviorDefinition {
        readonly id: string;
        readonly when?: string;
        readonly action?: string;
        readonly hook?: string;
    }

### `MwlCampaignChain` (interface)

    export interface MwlCampaignChain<State extends StateValue, Result extends StateValue = StateValue> {
        readonly start: string;
        readonly levels: readonly CampaignLevel<State, Result>[];
    }

### `MwlCampaignDefinition` (interface)

    export interface MwlCampaignDefinition {
        readonly id: string;
        readonly name?: string;
        readonly title?: string;
        readonly description?: string;
        readonly startScene?: string;

        readonly firstScenario?: string;

        readonly scenarios: readonly MwlScenarioLink[];
    }

### `MwlCarryover` (interface)

    export interface MwlCarryover {
        readonly result: 'victory' | 'defeat';

        readonly gold: number;

        readonly add: boolean;

        readonly recall: readonly string[];

        readonly nextScenario: string | null;
    }

### `MwlCatalog` (interface)

    export interface MwlCatalog {
        readonly locale: string;
        readonly direction: 'ltr' | 'rtl';
        readonly messages: Record<string, string>;
    }

### `MwlCatalogOptions` (interface)

    export interface MwlCatalogOptions {

        readonly locale?: string;
        readonly direction?: 'ltr' | 'rtl';
    }

### `MwlColumnValueType` (type)

    export type MwlColumnValueType<Type extends CsvColumnType> = Type extends 'number' ? number : Type extends 'boolean' ? boolean : Type extends 'list' ? string[] : Type extends 'map' ? Record<string, string> : string;

### `MwlCommand` (type)

    export type MwlCommand = {
        readonly name: 'set_variable';

### `MwlCompiledGame` (interface)

    export interface MwlCompiledGame {
        readonly schema: string;
        readonly roots: readonly MwlCompiledNode[];
        readonly assets: readonly string[];
        readonly messages: readonly string[];
    }

### `MwlCompiledNode` (interface)

    export interface MwlCompiledNode {
        readonly tag: string;
        readonly attributes: Readonly<Record<string, string>>;
        readonly children: readonly MwlCompiledNode[];

        readonly location?: MwlLocation;

        readonly attributeLocations?: Readonly<Record<string, MwlLocation>>;
        readonly valueLocations?: Readonly<Record<string, MwlLocation>>;

        readonly gettext?: readonly string[];
    }

### `MwlCompileOptions` (interface)

    export interface MwlCompileOptions extends MwlPreprocessOptions {
        readonly schemas?: Readonly<Record<string, MwlTagSchema>>;
    }

### `MwlConditionContext` (type)

    export type MwlConditionContext = Readonly<Record<string, MwlConditionValue>>;

### `MwlConditionHelper` (type)

    export type MwlConditionHelper = (...args: readonly MwlConditionValue[]) => MwlConditionValue;

### `MwlConditionOptions` (interface)

    export interface MwlConditionOptions {
        readonly helpers?: Readonly<Record<string, MwlConditionHelper>>;
    }

### `MwlConditionValue` (type)

    export type MwlConditionValue = string | number | boolean;

### `MwlContentCatalog` (interface)

    export interface MwlContentCatalog {
        readonly campaigns: readonly MwlCampaignDefinition[];
        readonly items: readonly MwlItemDefinition[];
        readonly monsters: readonly MwlMonsterDefinition[];
        readonly statuses: readonly MwlStatusDefinition[];
        readonly loot: readonly MwlLootDefinition[];
        readonly turnClocks: readonly MwlTurnClockDefinition[];
        readonly ai: readonly MwlAiDefinition[];
        readonly moves: readonly MwlMoveDefinition[];
        readonly typeMatchups: readonly MwlTypeMatchupDefinition[];
        readonly evolutions: readonly MwlEvolutionDefinition[];
        readonly tables: readonly MwlTableDefinition[];
    }

### `MwlContentDiagnostic` (interface)

    export interface MwlContentDiagnostic {
        readonly severity: 'error' | 'warning';
        readonly code: 'compile' | 'dangling-reference' | 'opaque-tag';
        readonly message: string;
        readonly file?: string;
    }

### `MwlContentLoadReport` (interface)

    export interface MwlContentLoadReport {
        readonly game?: MwlCompiledGame;
        readonly resources: readonly string[];
        readonly dependencies: readonly string[];
        readonly ignored: readonly string[];
        readonly diagnostics: readonly MwlContentDiagnostic[];
    }

### `MwlContentReport` (interface)

    export interface MwlContentReport {
        readonly tags: Readonly<Record<string, number>>;
        readonly opaqueTags: readonly string[];
        readonly references: readonly string[];
        readonly danglingReferences: readonly string[];
    }

### `MwlDiagnostic` (interface)

    export interface MwlDiagnostic {
        readonly code: string;
        readonly message: string;
        readonly location: MwlLocation;
        readonly lineText?: string;
    }

### `MwlDialogueChoice` (interface)

    export interface MwlDialogueChoice {
        readonly text: string;
        readonly event?: string;

        readonly branch?: readonly MwlCompiledNode[];
    }

### `MwlDomainHook` (type)

    export type MwlDomainHook<Context = unknown, Input = unknown, Output = unknown> = (context: Context, input: Input) => Output;

### `MwlDomainHookDeclaration` (interface)

    export interface MwlDomainHookDeclaration<Context = unknown, Input = unknown, Output = unknown> {
        readonly id: `${string}:${string}`;
        readonly run: MwlDomainHook<Context, Input, Output>;
    }

### `MwlDomainHookRegistry` (type)

    export type MwlDomainHookRegistry<Context = unknown, Input = unknown, Output = unknown> = Readonly<Record<string, MwlDomainHook<Context, Input, Output>>>;

### `MwlEffectDefinition` (interface)

    export interface MwlEffectDefinition {
        readonly applyTo: string;
        readonly operation?: string;
        readonly value?: string;
        readonly range?: string;
    }

### `MwlEmitOptions` (interface)

    export interface MwlEmitOptions {
        readonly variable?: string;

        readonly artifacts?: Readonly<Record<string, string>>;
        readonly onEmit?: (artifact: MwlArtifact) => void;
    }

### `MwlEndLevel` (interface)

    export interface MwlEndLevel {
        readonly result: 'victory' | 'defeat';

        readonly bonus?: number;

        readonly carryoverPercentage?: number;

        readonly carryoverAdd?: boolean;

        readonly nextScenario?: string | null;
    }

### `MwlEquipment` (type)

    export type MwlEquipment<Slot extends string> = EquipmentSlots<Slot, MwlActorItem>;

### `MwlEvolutionDefinition` (interface)

    export interface MwlEvolutionDefinition {
        readonly from: string;
        readonly into: string;
        readonly level: number;
    }

### `MwlExpression` (type)

    export type MwlExpression = {
        readonly kind: 'number';

### `MwlExpressionContext` (type)

    export type MwlExpressionContext = Readonly<Record<string, number>>;

### `MwlFieldSpec` (interface)

    export interface MwlFieldSpec {
        readonly type: MwlReaderType;
        readonly source?: string;
        readonly required?: boolean;
        readonly default?: unknown;
    }

### `MwlHookDeclaration` (interface)

    export interface MwlHookDeclaration {

        readonly id: string;

        readonly attributes?: Readonly<Record<string, MwlAttributeType>>;

        readonly openAttributes?: MwlValueType;
    }

### `MwlHookRegistry` (interface)

    export interface MwlHookRegistry {
        readonly predicate?: Readonly<Record<string, PredicateHook>>;
        readonly modifier?: Readonly<Record<string, ModifierHook>>;
        readonly generator?: Readonly<Record<string, GeneratorHook>>;
        readonly command?: Readonly<Record<string, CommandHook>>;
        readonly ai?: Readonly<Record<string, AiHook>>;
        readonly migration?: Readonly<Record<string, MigrationHook>>;

        readonly saveable?: Readonly<Record<string, MwlSaveableHookState>>;
    }

### `MwlItemDefinition` (interface)

    export interface MwlItemDefinition {
        readonly id: string;
        readonly name: string;
        readonly slot?: string;
        readonly stackable?: boolean;
        readonly weight?: number;

        readonly image?: string;

        readonly icon?: string;
        readonly effects: readonly MwlEffectDefinition[];
    }

### `MwlLocation` (interface)

    export interface MwlLocation {
        readonly file: string;
        readonly line: number;
        readonly column: number;
    }

### `MwlLootDefinition` (interface)

    export interface MwlLootDefinition {
        readonly item: string;
        readonly chance?: number;
        readonly quantity?: number;
        readonly weight?: number;
    }

### `MwlMap` (interface)

    export interface MwlMap {
        readonly id: string;
        readonly width: number;
        readonly height: number;

        readonly codes: readonly string[];

        readonly starts: Readonly<Record<string, readonly MwlMapStart[]>>;
    }

### `MwlMapFile` (interface)

    export interface MwlMapFile {

        readonly header: Readonly<Record<string, string>>;
        readonly width: number;
        readonly height: number;

        readonly codes: string[];

        readonly starts: Record<number, {
            x: number;
            y: number;
        }[]>;
    }

### `MwlMapStart` (interface)

    export interface MwlMapStart {
        readonly x: number;
        readonly y: number;
    }

### `MwlMessage` (interface)

    export interface MwlMessage {
        readonly text: string;
        readonly speaker?: string;
        readonly portrait?: string;
        readonly side?: string;

        readonly choices?: readonly MwlDialogueChoice[];

        readonly dialogueId?: string;
    }

### `MwlMigration` (type)

    export type MwlMigration = (world: MwlWorld) => MwlWorld;

### `MwlMonsterDefinition` (interface)

    export interface MwlMonsterDefinition {
        readonly id: string;
        readonly name?: string;
        readonly hp: number;
        readonly accuracy?: number;
        readonly evasion?: number;
        readonly damage?: readonly [number, number];
        readonly armor?: readonly [number, number];
        readonly experience?: number;
        readonly maxLevel?: number;
        readonly image?: string;
        readonly types?: readonly string[];
        readonly baseStats?: Readonly<Record<string, number>>;
    }

### `MwlMoveDefinition` (interface)

    export interface MwlMoveDefinition {
        readonly id: string;
        readonly type: string;
        readonly target: string;
        readonly power?: number;
        readonly cost?: number;
    }

### `MwlNode` (interface)

    export interface MwlNode {
        readonly tag: string;
        readonly attributes: Readonly<Record<string, string>>;
        readonly children: readonly MwlNode[];
        readonly location: MwlLocation;

        readonly attributeLocations?: Readonly<Record<string, MwlLocation>>;

        readonly valueLocations?: Readonly<Record<string, MwlLocation>>;

        readonly gettext?: readonly string[];
    }

### `MwlPersistenceOptions` (interface)

    export interface MwlPersistenceOptions {
        readonly version: number;
        readonly migrations?: Readonly<Record<number, MwlMigration>>;
    }

### `MwlPreprocessOptions` (interface)

    export interface MwlPreprocessOptions {
        readonly file?: string;
        readonly defines?: readonly string[];
        readonly includes?: Readonly<Record<string, string>>;

        readonly macroPolicy?: 'error' | 'ignore';
    }

### `MwlReaderType` (type)

    export type MwlReaderType = 'string' | 'id' | 'number' | 'integer' | 'boolean' | 'id-list' | 'number-list';

### `MwlReadResult` (interface)

    export interface MwlReadResult<T> {
        readonly value: T;
        readonly diagnostics: readonly MwlDiagnostic[];
    }

### `MwlRuntime` (class)

    export declare class MwlRuntime {
        readonly game: MwlCompiledGame;
        readonly world: MwlWorld;
        readonly journal: ActionJournal<MwlRuntimeAction, MwlTraceEvent>;
        private readonly onMessage?;
        private readonly resolveMap?;
        private readonly hooks?;
        private readonly onTrace?;
        private readonly persistence;
        private readonly random;
        private readonly unitTypes;
        private schedule;
        private pendingDialogue;
        private dialogueCounter;
        private traceBatch;
        constructor(game: MwlCompiledGame, options?: MwlRuntimeOptions);
        run(trigger: string): void;
        private runInternal;

        fireEvent(id: string): boolean;
        private fireEventInternal;

        fireMoveto(id: string): void;
        private fireMovetoInternal;

        private claimEvent;
        private eventFiltersMatch;
        private executeEvent;

        private runBlock;

        private isConsumedElse;
        private executeTracedEvent;

        private showDialogue;
        private showSay;

        answerDialogue(dialogueId: string, choiceIndex: number): boolean;
        private answerDialogueInternal;

        evaluate(): MwlWorld['status'];
        save(): string;
        snapshot(): string;
        restore(snapshot: string): void;
        private recordAction;
        private trace;
        private loadUnitTypes;
        private loadSchedule;
        private loadInitialContent;

        private topLevelNodes;

        private loadScenarioExtras;
        private buildMap;
        private loadInitialUnits;
        private loadLeaders;
        private unitAt;

        private static readonly commandHandlers;
        private executeNode;
        private cmdSpawn;
        private cmdMove;
        private cmdKill;
        private cmdFireEvent;
        private cmdStoreUnit;
        private cmdUnstoreUnit;
        private cmdRecall;
        private cmdModifyUnit;
        private cmdHealUnit;
        private cmdCaptureVillage;
        private cmdClearShroud;
        private cmdRole;
        private cmdSetVariable;
        private cmdWhile;
        private cmdForeach;
        private cmdSwitch;
        private cmdWin;
        private cmdLose;
        private cmdEndlevel;
        private cmdIf;

        private commandChildren;
        private runHook;
        private applyMove;

        private showMessage;

        private interpolate;

        private expandPath;
        private setVariable;

        private numericVariables;
        private variableAt;
        private setVariableAt;
        private spawnUnit;
        private killUnit;

        private matchingUnits;

        private storedUnits;

        private restoreUnit;

        private setTerrain;
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

        private markSideResult;
        private worldView;

        private drawRandom;
        private emit;
        private attack;
        private nodes;
    }

### `MwlRuntimeAction` (type)

    export type MwlRuntimeAction = {
        readonly type: 'run';

### `MwlRuntimeOptions` (interface)

    export interface MwlRuntimeOptions {
        readonly world?: MwlWorld;

        readonly onMessage?: (message: MwlMessage) => void;

        readonly resolveMap?: (file: string) => string;
        readonly hooks?: MwlHookRegistry;

        readonly onTrace?: (event: MwlTraceEvent) => void;

        readonly persistence?: MwlPersistenceOptions;

        readonly random?: Generator;
    }

### `MwlSaveableHookState` (interface)

    export interface MwlSaveableHookState {
        readonly save: () => unknown;
        readonly restore: (state: unknown) => void;
    }

### `MwlSaveEnvelope` (interface)

    export interface MwlSaveEnvelope {
        readonly format: 'mwl-save';
        readonly version: number;
        readonly world: MwlWorld;

        readonly hookState?: Readonly<Record<string, unknown>>;

        readonly journal?: readonly ActionJournalEntry<unknown, unknown>[];
    }

### `MwlScenarioLink` (interface)

    export interface MwlScenarioLink {
        readonly id: string;

        readonly nextScenario?: string;
    }

### `MwlScenarioRunner` (type)

    export type MwlScenarioRunner<State extends StateValue, Result extends StateValue = StateValue> = (scenario: MwlScenarioLink, state: State, context: {
        readonly levelId: string;

### `MwlSideRef` (interface)

    export interface MwlSideRef {

        readonly id: string;
    }

### `MwlSourceFile` (interface)

    export interface MwlSourceFile {
        readonly file: string;
        readonly source: string;
    }

### `MwlStatusDefinition` (interface)

    export interface MwlStatusDefinition {
        readonly id: string;
        readonly name?: string;
        readonly duration?: number;
        readonly tick?: string;
        readonly modifiers?: string;
    }

### `MwlSyntaxError` (class)

    export declare class MwlSyntaxError extends Error {
        readonly diagnostic: MwlDiagnostic;
        constructor(diagnostic: MwlDiagnostic);
    }

### `MwlTableColumn` (interface)

    export interface MwlTableColumn {
        readonly name: string;
        readonly type: CsvColumnType;
    }

### `MwlTableDefinition` (interface)

    export interface MwlTableDefinition {
        readonly id: string;
        readonly columns: readonly MwlTableColumn[];
        readonly rows: readonly Readonly<Record<string, unknown>>[];
    }

### `MwlTableKey` (type)

    export type MwlTableKey<Row extends Record<string, unknown>> = keyof Row | readonly (keyof Row)[] | ((row: Row) => MwlTableKeyPart | readonly MwlTableKeyPart[]);

### `MwlTableKeyPart` (type)

    export type MwlTableKeyPart = string | number | boolean | null;

### `MwlTableMapOptions` (interface)

    export interface MwlTableMapOptions<Row extends Record<string, unknown>, Value = Row> {

        readonly key: MwlTableKey<Row>;

        readonly value?: (row: Row) => Value;

        readonly duplicate?: 'error' | 'last';
    }

### `MwlTableReference` (type)

    export type MwlTableReference = {

        readonly table: string;

### `MwlTagSchema` (interface)

    export interface MwlTagSchema {

        readonly attributes?: Readonly<Record<string, MwlAttributeType>>;

        readonly required?: readonly string[];

        readonly openAttributes?: MwlValueType;

        readonly children?: readonly string[];

        readonly cardinality?: Readonly<Record<string, {
            readonly min?: number;
            readonly max?: number;
        }>>;

        readonly openChildren?: boolean;

        readonly refTargets?: Readonly<Record<string, string>>;

        readonly acyclicRefs?: readonly string[];
    }

### `MwlTraceEvent` (type)

    export type MwlTraceEvent = {
        readonly type: 'event';

### `MwlTurnClockDefinition` (interface)

    export interface MwlTurnClockDefinition {
        readonly id: string;
        readonly tick?: number;
        readonly hunger?: number;
    }

### `MwlTypedRow` (type)

    export type MwlTypedRow<Columns extends readonly MwlTableColumn[]> = {
        [Column in Columns[number] as Column['name']]?: MwlColumnValueType<Column['type']>;

### `MwlTypeMatchupDefinition` (interface)

    export interface MwlTypeMatchupDefinition {
        readonly attacker: string;
        readonly defender: string;
        readonly multiplier: number;
    }

### `MwlValidationOptions` (interface)

    export interface MwlValidationOptions {

        readonly slots?: readonly string[];

        readonly hooks?: readonly (string | MwlHookDeclaration)[];

        readonly hookAttributes?: readonly string[];

        readonly mapBounds?: {
            readonly width: number;
            readonly height: number;
        };

        readonly tableReferences?: readonly MwlTableReference[];

        readonly rowIdScope?: 'global' | 'file';
    }

### `MwlValue` (type)

    export type MwlValue = string | number | boolean | MwlValue[] | {
        [key: string]: MwlValue;

### `MwlValueType` (type)

    export type MwlValueType = 'string' | 'id' | 'number' | 'integer' | 'boolean' | 'ref' | 'coordinate';

### `MwlWorld` (interface)

    export interface MwlWorld {
        readonly variables: Record<string, MwlValue>;
        readonly units: Record<string, {
            hp: number;
            x: number;
            y: number;
            alive: boolean;
            type?: string;
            side?: string;
            moves?: number;

            name?: string;

            role?: string;

            can_recruit?: boolean;

            leader?: boolean;
        }>;
        readonly sides: Record<string, {
            gold: number;
            income: number;
            leader?: string;
            controller?: string;
            recruit?: string;

            teamName?: string;

            shareVision?: string;
            villageGold?: number;
            heal?: boolean;
            fog?: boolean;
            shroud?: boolean;
            hidden?: boolean;
            flag?: string;
            userTeamName?: string;
        }>;
        readonly maps: Record<string, {
            terrain: string;
            file?: string;
        }>;
        gold: Record<string, number>;
        turn: number;
        status: 'playing' | 'won' | 'lost';

        sideStatus?: Record<string, 'playing' | 'won' | 'lost'>;

        carryover?: MwlCarryover;

        map?: MwlMap | null;

        timeOfDay?: string;
        scheduleIndex?: number;

        firedEvents?: string[];
        pendingDialogue?: {
            id: string;
            choices: readonly MwlDialogueChoice[];
        };

        villages?: Record<string, {
            x: number;
            y: number;
            side: string;
            name?: string;
        }>;

        clearedShroud?: Record<string, string[]>;

        roles?: Record<string, string[]>;

        objects?: Array<{
            x: number;
            y: number;
            id?: string;
            name?: string;
            image?: string;
            side?: string;
        }>;

        story?: Array<{
            text: string;
            title?: string;
            image?: string;
            music?: string;
        }>;

        random?: readonly [number, number, number, number];
    }

### `parse` (function)

    export declare function parse(source: string, file?: string): MwlNode[];

### `parseExpression` (function)

    export declare function parseExpression(source: string): MwlExpression;

### `parseHookReference` (function)

    export declare function parseHookReference(value: string): {
        type: HookType;

### `parseMapFile` (function)

    export declare function parseMapFile(text: string): MwlMapFile;

### `parseTableColumns` (function)

    export declare function parseTableColumns(value: string): MwlTableColumn[];

### `parseTerrain` (function)

    export declare function parseTerrain(text: string): {
        width: number;

### `parseValue` (function)

    export declare function parseValue(raw: string, location: MwlLocation, lineText?: string): string;

### `PredicateHook` (type)

    export type PredicateHook = (world: HookWorld, context: HookContext) => boolean;

### `preprocess` (function)

    export declare function preprocess(source: string, options?: MwlPreprocessOptions): string;

### `readAttributes` (function)

    export declare function readAttributes<T extends Record<string, unknown>>(node: MwlCompiledNode, fields: Readonly<Record<keyof T & string, MwlFieldSpec>>): MwlReadResult<T>;

### `readChildren` (function)

    export declare function readChildren<T>(node: MwlCompiledNode, tag: string, read: (child: MwlCompiledNode) => MwlReadResult<T>): MwlReadResult<readonly T[]>;

### `readTableIndex` (function)

    export declare function readTableIndex<Row extends Record<string, unknown>>(rows: readonly Row[], options: Pick<MwlTableMapOptions<Row>, 'key'>): Map<string, Row[]>;

### `readTableMap` (function)

    export declare function readTableMap<Row extends Record<string, unknown>, Value = Row>(rows: readonly Row[], options: MwlTableMapOptions<Row, Value>): Map<string, Value>;

### `schema01` (const)

    export declare const schema01: Readonly<Record<string, MwlTagSchema>>;

### `schema10` (const)

    export declare const schema10: Readonly<Record<string, MwlTagSchema>>;

### `ScriptContext` (type)

    export type ScriptContext = Readonly<Record<string, ScriptValue>>;

### `ScriptEmit` (type)

    export type ScriptEmit = (name: string, payload?: ScriptValue) => void;

### `ScriptHost` (interface)

    export interface ScriptHost {
        evaluate(source: string, context?: ScriptContext): ScriptValue;
        execute(source: string, context?: ScriptContext, emit?: ScriptEmit): void;
        call(name: string, args?: readonly ScriptValue[], context?: ScriptContext, emit?: ScriptEmit): ScriptValue;
        dispose(): void;
    }

### `ScriptValue` (type)

    export type ScriptValue = null | boolean | number | string | ScriptValue[] | {
        readonly [key: string]: ScriptValue;

### `sideVisionGroups` (function)

    export declare function sideVisionGroups(world: MwlWorld): readonly (readonly string[])[];

### `tableKey` (function)

    export declare function tableKey(...parts: MwlTableKeyPart[]): string;

### `typedRows` (function)

    export declare function typedRows<const Columns extends readonly MwlTableColumn[]>(table: {
        readonly columns: Columns;

### `validate` (function)

    export declare function validate(nodes: readonly MwlNode[], schemas?: Readonly<Record<string, MwlTagSchema>>): MwlDiagnostic[];

### `validateCatalog` (function)

    export declare function validateCatalog(game: MwlCompiledGame, options?: MwlValidationOptions): MwlDiagnostic[];

### `validateCatalogNodes` (function)

    export declare function validateCatalogNodes(nodes: readonly MwlNode[], options?: MwlValidationOptions): MwlDiagnostic[];

### `validateHookAttributes` (function)

    export declare function validateHookAttributes(node: MwlCompiledNode, declaration: MwlHookDeclaration): MwlDiagnostic[];

### `validateHookReferences` (function)

    export declare function validateHookReferences(references: readonly HookReference[], available: Iterable<string>): MwlDiagnostic[];

### `validateWorld` (function)

    export declare function validateWorld(value: unknown): MwlWorld;

### `validAttributeValue` (function)

    export declare function validAttributeValue(value: string, type: MwlAttributeType): boolean;

## `./mwl/fengari`

### `createFengariScriptHost` (function)

    export declare function createFengariScriptHost(options?: FengariScriptHostOptions): ScriptHost;

### `FengariScriptHostOptions` (interface)

    export interface FengariScriptHostOptions {
        readonly instructionLimit?: number;

        readonly memoryLimit?: number;
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

### `AbilityStage` (interface)

    export interface AbilityStage {
        name: string;

        duration: number;
    }

### `Actor` (interface)

    export interface Actor {

        speed?: number;

        priority?: number;
    }

### `AIDecision` (interface)

    export interface AIDecision {
        state: AIState;

        step: Step | null;
    }

### `AIState` (type)

    export type AIState = 'wander' | 'hunt' | 'flee';

### `areaFalloffMultiplier` (function)

    export declare function areaFalloffMultiplier(index: number, steps: readonly number[]): number;

### `AreaShape` (type)

    export type AreaShape = {
        kind: 'single';

### `ballistica` (function)

    export declare function ballistica(level: Level, from: Step, to: Step, options?: BallisticaOptions): BallisticaResult;

### `BallisticaOptions` (interface)

    export interface BallisticaOptions {

        stop?: BallisticaStop;
    }

### `BallisticaResult` (interface)

    export interface BallisticaResult {

        cells: Step[];

        stop: Step | null;
    }

### `BallisticaStop` (type)

    export type BallisticaStop = 'opaque' | 'impassable' | 'outside' | 'none';

### `BeamBlocker` (type)

    export type BeamBlocker = 'terrain' | 'none' | ((cell: Step, context: BeamDamageContext) => boolean);

### `BeamDamageContext` (interface)

    export interface BeamDamageContext {
        cell: Step;
        step: number;

        remaining: number;
    }

### `BeamStep` (interface)

    export interface BeamStep<T> {
        status: 'idle' | 'active' | 'done' | 'blocked' | 'cancelled';

        cell: Step | null;

        cells: readonly Step[];
        step: number;
        remaining: number;
        targets: readonly T[];
        damage: number;
    }

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

### `CellFeatureDef` (interface)

    export interface CellFeatureDef<TContext = unknown> {

        inspect?(cell: number, ctx: TContext): void;

        interact?(cell: number, ctx: TContext): boolean | void;

        consequence?(cell: number, ctx: TContext): void;

        persistent?: boolean;
    }

### `cellsNear` (function)

    export declare function cellsNear(level: Level, center: number, radius: number): number[];

### `chainTargets` (function)

    export declare function chainTargets(candidates: readonly Step[], origin: Step, jumps: number, range: number): Step[];

### `chebyshevDistance` (function)

    export declare function chebyshevDistance(a: Step, b: Step): number;

### `checkDeterminism` (function)

    export declare function checkDeterminism(generate: () => DungeonArtifacts, runs?: number): DungeonMismatch[];

### `CombatEvent` (type)

    export type CombatEvent = 'beforeAttack' | 'beforeDamage' | 'afterDamage' | 'onKill' | string;

### `CombatHook` (interface)

    export interface Hook<TArgs extends unknown[]> {
        event: string;
        handler: (...args: TArgs) => void;

        source?: unknown;
    }

### `CombatHooks` (class)

    export declare class CombatHooks<C> extends HookRegistry<[context: DamageContext<C>]> {

        modifyDamage(attacker: C, defender: C, amount: number): DamageContext<C>;
    }

### `compareDungeonArtifacts` (function)

    export declare function compareDungeonArtifacts(expected: DungeonArtifacts, actual: DungeonArtifacts): DungeonMismatch[];

### `coneCells` (function)

    export declare function coneCells(origin: Step, target: Step, width: number): Step[];

### `coneSector` (function)

    export declare function coneSector(level: Level, from: Step, to: Step, options: ConeSectorOptions): Step[];

### `ConeSectorOptions` (interface)

    export interface ConeSectorOptions {

        degrees: number;

        range: number;

        stop?: BallisticaStop;
    }

### `ContentRollResult` (interface)

    export interface ContentRollResult<T> {
        roster: T[];
        trace: RollTraceEntry[];
    }

### `DamageContext` (interface)

    export interface DamageContext<C> {
        attacker: C;
        defender: C;
        amount: number;
        prevented: boolean;
        [kind: string]: unknown;
    }

### `decideMonsterAI` (function)

    export declare function decideMonsterAI(level: Level, pathfinder: Pathfinder, self: Step, hpFraction: number, target: Step, options?: MonsterAIOptions): AIDecision;

### `Disposition` (type)

    export type Disposition = 'hostile' | 'neutral' | 'peaceful';

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

### `DungeonArtifacts` (interface)

    export interface DungeonArtifacts {
        graph: readonly RoomEdge[];
        retries: number;

        roomBuilders: readonly string[];
        width: number;
        height: number;
        terrain: ArrayLike<number>;
        features: readonly [number, string][];
        content: readonly unknown[];
        rngDraws: number;
    }

### `DungeonGenerationHooks` (interface)

    export interface DungeonGenerationHooks {

        onRoomPlaced?(room: Rect, index: number): void;

        onCorridorCarved?(edge: RoomEdge, from: Rect, to: Rect): void;
    }

### `DungeonMismatch` (interface)

    export interface DungeonMismatch {
        stage: DungeonParityStage;
        field: string;
        expected: unknown;
        actual: unknown;
    }

### `DungeonOptions` (interface)

    export interface DungeonOptions {
        width: number;
        height: number;

        rooms?: number;
        minRoomSize?: number;
        maxRoomSize?: number;

        extraCorridors?: number;

        wall?: number;
        floor?: number;

        kinds?: TerrainKind[];

        hooks?: DungeonGenerationHooks;

        builders?: readonly RoomBuilder[];
    }

### `DungeonParityStage` (type)

    export type DungeonParityStage = 'graph' | 'paint';

### `DungeonResult` (interface)

    export interface DungeonResult {
        level: Level;

        graph: RoomEdge[];

        retries: number;

        roomBuilders: string[];
    }

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

### `HeightSight` (interface)

    export interface HeightSight {
        heights: Elevation;
        height?: number;
    }

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

### `LevelShape` (type)

    export type LevelShape = 'square' | 'hex';

### `MonsterAIOptions` (interface)

    export interface MonsterAIOptions extends PathOptions {

        sightRadius?: number;

        fleeBelow?: number;

        disposition?: Disposition;

        provoked?: boolean;
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
        private fronts;
        private index;
        private state;
        private shape;
        constructor(options: MultiTurnBeamOptions<T>);
        get active(): boolean;
        get done(): boolean;

        get beamShape(): string;

        get currentPath(): readonly Step[];
        start(): boolean;

        advance(): BeamStep<T>;
        cancel(): void;
        toJSON(): MultiTurnBeamSave;
        static fromJSON<T>(options: Omit<MultiTurnBeamOptions<T>, 'from' | 'target'>, data: MultiTurnBeamSave): MultiTurnBeam<T>;
        private blocked;
        private inactiveStep;
    }

### `MultiTurnBeamOptions` (interface)

    export interface MultiTurnBeamOptions<T> {
        level: Level;
        from: Step;
        target: Step;
        damage: number | ((target: T, context: BeamDamageContext) => number);

        targetsAt?: (cell: Step) => readonly T[];

        applyDamage?: (target: T, amount: number, context: BeamDamageContext) => void;

        isBlocked?: (cell: Step, context: BeamDamageContext) => boolean;

        blocker?: BeamBlocker;

        stopAtOpaque?: boolean;

        fronts?: (previous: readonly Step[], turn: number) => readonly Step[];

        shape?: string;

        onCell?: (cell: Step, context: BeamDamageContext) => void;
    }

### `MultiTurnBeamSave` (interface)

    export interface MultiTurnBeamSave {
        state: 'idle' | 'active' | 'done' | 'blocked' | 'cancelled';

        fronts: Step[][];
        index: number;

        shape: string;

        path?: Step[];
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

### `PathOptions` (interface)

    export interface PathOptions {

        topology?: 4 | 8;

        blocked?: ReadonlySet<number>;

        heights?: Elevation;

        climb?: number;
    }

### `pickBuilder` (function)

    export declare function pickBuilder(builders: readonly RoomBuilder[], room: Rect): RoomBuilder | null;

### `PlacementFilter` (interface)

    export interface PlacementFilter {

        terrain?: ReadonlySet<number>;

        occupied?: ReadonlySet<number>;

        within?: Iterable<number>;
    }

### `PlacementResult` (interface)

    export interface PlacementResult {
        cells: number[];
        trace: PlacementTraceEntry;
    }

### `PlacementTraceEntry` (interface)

    export interface PlacementTraceEntry {
        requested: number;
        available: number;
        selected: number[];
    }

### `RangeBand` (interface)

    export interface RangeBand {

        max: number;
        multiplier: number;
    }

### `rangeMultiplier` (function)

    export declare function rangeMultiplier(distance: number, bands: readonly RangeBand[], beyond?: number): number;

### `RareEntry` (interface)

    export interface RareEntry<T> {
        value: T;
        chance: number;

        enabled?: boolean;
    }

### `Rect` (interface)

    export interface Rect {
        left: number;
        top: number;
        right: number;
        bottom: number;
    }

### `rectCenter` (function)

    export declare function rectCenter(rect: Rect): {
        x: number;

### `rectsOverlap` (function)

    export declare function rectsOverlap(a: Rect, b: Rect, margin?: number): boolean;

### `resolveArea` (function)

    export declare function resolveArea(origin: Step, target: Step, shape: AreaShape): Step[];

### `resolveAreaOnLevel` (function)

    export declare function resolveAreaOnLevel(level: Level, origin: Step, target: Step, shape: AreaShape): Step[];

### `RollOutcome` (type)

    export type RollOutcome = 'added' | 'skipped' | 'deferred' | 'swapped' | 'kept' | 'shuffled';

### `rollRoster` (function)

    export declare function rollRoster<T>(regular: readonly RosterEntry<T>[], rare?: readonly RareEntry<T>[], shuffleResult?: boolean): ContentRollResult<T>;

### `RollTraceEntry` (interface)

    export interface RollTraceEntry {
        step: 'rare' | 'alternative' | 'shuffle';
        index: number;
        outcome: RollOutcome;
    }

### `RoomBuilder` (interface)

    export interface RoomBuilder {

        id: string;

        weight?: number;

        minSize?: number;

        maxSize?: number;

        paint(level: Level, room: Rect, floor: number): void;
    }

### `RoomEdge` (interface)

    export interface RoomEdge {
        a: number;
        b: number;

        extra: boolean;
    }

### `RosterEntry` (interface)

    export interface RosterEntry<T> {
        value: T;

        alternative?: {
            value: T;
            chance: number;
        };
    }

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

### `SchedulerSnapshot` (interface)

    export interface SchedulerSnapshot {
        now: number;
        sequence: number;
        entries: Array<{
            id: string;
            time: number;
            sequence: number;
            priority?: number;
        }>;
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

### `StealthOptions` (interface)

    export interface StealthOptions {

        radius: number;
    }

### `Step` (interface)

    export interface Step {
        x: number;
        y: number;
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

### `TargetingControllerOptions` (interface)

    export interface TargetingControllerOptions {

        origin: Step;

        range: number;

        requireLineOfSight?: boolean;

        shape?: AreaShape;

        cursor?: Step;

        validate?: (target: Step) => boolean;
    }

### `TargetingOptions` (interface)

    export interface TargetingOptions {

        range: number;

        requireLineOfSight?: boolean;
    }

### `TargetResult` (interface)

    export interface TargetResult {
        readonly origin: Step;
        readonly target: Step;
        readonly shape: AreaShape;

        readonly cells: readonly Step[];
    }

### `TerrainKind` (interface)

    export interface TerrainKind {

        passable: boolean;

        transparent: boolean;

        flags?: number;

        extras?: Readonly<Record<string, boolean>>;
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

### `AABB` (interface)

    export interface AABB {
        x: number;
        y: number;
        width: number;
        height: number;
    }

### `aabbOverlap` (function)

    export declare function aabbOverlap(a: AABB, b: AABB): boolean;

### `activePage` (function)

    export declare function activePage(event: MapEvent, state: GameState): EventPage | undefined;

### `automap` (function)

    export declare function automap(map: AutomapTarget, rules: readonly AutomapRule[], options?: AutomapOptions): number;

### `AUTOMAP_EMPTY` (const)

    export declare const EMPTY = -1;

### `AutomapOptions` (interface)

    export interface AutomapOptions {

        pick?: (variants: number) => number;
    }

### `AutomapRule` (interface)

    export interface AutomapRule {

        name?: string;

        topology?: 'square' | 'hex';

        width: number;
        height: number;

        input: Record<string, ArrayLike<number>>;

        outputs: Array<Record<string, ArrayLike<number>>>;
    }

### `AutomapTarget` (interface)

    export interface AutomapTarget {
        readonly widthInTiles: number;
        readonly heightInTiles: number;

        readonly shape?: 'square' | 'hex' | 'isometric' | 'staggered';
        getTile(layer: string | number, x: number, y: number): number;
        setTile(layer: string | number, x: number, y: number, value: number): void;
    }

### `Circle` (interface)

    export interface Circle {
        x: number;
        y: number;
        radius: number;
    }

### `circleAabbOverlap` (function)

    export declare function circleAabbOverlap(circle: Circle, box: AABB): boolean;

### `circleOverlap` (function)

    export declare function circleOverlap(a: Circle, b: Circle): boolean;

### `conditionHolds` (function)

    export declare function conditionHolds(condition: EventCondition, state: GameState): boolean;

### `decodeMarshal` (function)

    export declare function decodeMarshal(bytes: Uint8Array): unknown;

### `DialoguePresenter` (type)

    export type DialoguePresenter = (request: DialogueRequest) => Promise<unknown>;

### `DialogueRequest` (interface)

    export interface DialogueRequest {
        text: string;
        speaker?: string;

        portrait?: unknown;

        choices?: EventChoice[];
    }

### `Direction4` (type)

    export type Direction4 = 'up' | 'down' | 'left' | 'right';

### `encodeMarshal` (function)

    export declare function encodeMarshal(value: unknown): Uint8Array;

### `EventChoice` (interface)

    export interface EventChoice {
        text: string;
        value?: unknown;
        disabled?: boolean;

        goto?: string;
    }

### `EventCommand` (type)

    export type EventCommand = {
        say: string;

### `EventCondition` (type)

    export type EventCondition = {
        switch: string;

### `EventPage` (interface)

    export interface EventPage {

        conditions?: EventCondition[];
        trigger: EventTrigger;
        commands: EventCommand[];

        frame?: number | string;
    }

### `EventRunner` (class)

    export declare class EventRunner {
        private options;
        readonly state: EventRunnerState;
        private cancelled;
        constructor(options: EventRunnerOptions);
        cancel(): void;
        run(commands: readonly EventCommand[]): Promise<EventRunnerState>;

        runStory(story: EventStoryScript, start: string): Promise<EventRunnerState>;

        private runList;

        private step;
        private speak;
    }

### `EventRunnerOptions` (interface)

    export interface EventRunnerOptions {

        present: DialoguePresenter;
        game: GameState;

        move?: (target: string, steps: readonly MoveStep[]) => Promise<void>;

        onUnknownCommand?: (command: EventCommand) => void;
    }

### `EventRunnerState` (interface)

    export interface EventRunnerState {
        game: GameState;

        answers: Record<string, unknown>;
    }

### `EventStoryScript` (type)

    export type EventStoryScript = Record<string, readonly EventCommand[]>;

### `EventTrigger` (type)

    export type EventTrigger = 'action' | 'touch' | 'autorun' | 'parallel';

### `EventTwineStory` (interface)

    export interface EventTwineStory {
        story: EventStoryScript;

        start: string;

        title?: string;
    }

### `extractDialogueCatalog` (function)

    export declare function extractDialogueCatalog(commands: readonly EventCommand[], options?: {
        locale?: string;

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

### `FreeMoverOptions` (interface)

    export interface FreeMoverOptions {

        speed?: number;

        walkAnimation?: (facing: number) => string;

        idleAnimation?: (facing: number) => string;
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

        jumpBy(dx: number, dy: number): boolean;
        update(dt: number): void;
        private place;
        private playWalk;
        private playIdle;
    }

### `GridMoverOptions` (interface)

    export interface GridMoverOptions {
        tileWidth: number;
        tileHeight: number;

        speed?: number;

        walkAnimation?: (direction: Direction4) => string;

        idleAnimation?: (direction: Direction4) => string;
    }

### `hashDefaultOf` (function)

    export declare function hashDefaultOf(hash: Map<unknown, unknown>): unknown;

### `importTwee` (function)

    export declare function importTwee(source: string): EventTwineStory;

### `MapEvent` (interface)

    export interface MapEvent {
        id: string;
        x: number;
        y: number;
        pages: EventPage[];
    }

### `MovableSprite` (interface)

    export interface MovableSprite {
        x: number;
        y: number;

        update?(dt: number): void;

        has?(animation: string): boolean;

        play?(animation: string): void;
    }

### `MoveRoute` (interface)

    export interface MoveRoute {
        steps: readonly MoveRouteStep[];

        repeat?: boolean;

        skippable?: boolean;
    }

### `MoveRouteOptions` (interface)

    export interface MoveRouteOptions {

        canMove?: (dx: number, dy: number) => boolean;

        random?: () => number;
    }

### `MoveRouteRunner` (class)

    export declare class MoveRouteRunner {
        private mover;
        private route;
        private options;
        private index;
        private waiting;
        constructor(mover: GridMover, route: MoveRoute, options?: MoveRouteOptions);

        get done(): boolean;
        update(dt: number): void;

        private runStep;
        private resolveDirection;
        private resolveTurn;

        private resolveAim;
        private attempt;
        private pickDirection;
    }

### `MoveRouteStep` (type)

    export type MoveRouteStep = {
        dir: Direction4;

### `MoveStep` (interface)

    export interface MoveStep {
        dx: number;
        dy: number;
    }

### `parseDialogueText` (function)

    export declare function parseDialogueText(source: string): EventCommand[];

### `QuestDefinition` (interface)

    export interface QuestDefinition {
        id: string;
        stages: QuestStage[];

        requires?: string[];
    }

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

### `QuestMarker` (type)

    export type QuestMarker = 'offer' | 'turnIn' | 'none';

### `questsFromRows` (function)

    export declare function questsFromRows(rows: readonly QuestStageRow[]): QuestDefinition[];

### `QuestStage` (interface)

    export interface QuestStage {
        condition?: EventCondition;
        counter?: {
            variable: string;
            target: number;
        };

        description?: string;

        location?: {
            map?: string;
            x: number;
            y: number;
        };
    }

### `QuestStageRow` (interface)

    export interface QuestStageRow {
        questId: string;

        requires?: string[];
        conditionSwitch?: string;
        conditionEquals?: boolean;
        conditionVariable?: string;
        conditionAtLeast?: number;
        counterVariable?: string;
        counterTarget?: number;
        description?: string;
        locationMap?: string;
        locationX?: number;
        locationY?: number;
    }

### `QuestStatus` (type)

    export type QuestStatus = 'unavailable' | 'available' | 'active' | 'complete';

### `resolveAabbAgainstTiles` (function)

    export declare function resolveAabbAgainstTiles(box: AABB, dx: number, dy: number, options: ResolveTileMoveOptions): {
        x: number;

### `ResolveTileMoveOptions` (interface)

    export interface ResolveTileMoveOptions {
        tileSize: number;
        isSolid: SolidTile;
    }

### `RouteTarget` (type)

    export type RouteTarget = {
        x: number;

### `RubyObject` (interface)

    export interface RubyObject {
        class: string;
        ivars: Record<string, unknown>;
    }

### `RubySymbol` (class)

    export declare class RubySymbol {
        readonly name: string;
        constructor(name: string);
    }

### `RubyUserDefined` (interface)

    export interface RubyUserDefined {
        class: string;
        raw: Uint8Array;
    }

### `SolidTile` (type)

    export type SolidTile = (tileX: number, tileY: number) => boolean;

### `withHashDefault` (function)

    export declare function withHashDefault(hash: Map<unknown, unknown>, defaultValue: unknown): Map<unknown, unknown>;

## `./simulation`

### `Actor` (interface)

    export interface Actor {

        speed?: number;

        priority?: number;
    }

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

### `CampaignLevel` (interface)

    export interface CampaignLevel<State extends StateValue, Result extends StateValue = StateValue> {
        readonly id: string;
        readonly run: (state: State, context: {
            readonly levelId: string;
        }) => CampaignLevelResult<State, Result>;
    }

### `CampaignLevelResult` (interface)

    export interface CampaignLevelResult<State extends StateValue, Result extends StateValue = StateValue> {
        readonly outcome: CampaignOutcome;
        readonly state: State;
        readonly result?: Result;
        readonly next?: string | null;
        readonly reminders?: readonly string[];
    }

### `CampaignOutcome` (type)

    export type CampaignOutcome = 'completed' | 'failed' | 'abandoned';

### `CampaignSave` (class)

    export declare class CampaignSave<CampaignState extends StateValue, Result extends StateValue, World, TurnState> {
        private readonly saves;
        constructor(options: SaveSystemOptions);

        save(slot: string, parts: CampaignSaveParts<CampaignState, Result, World, TurnState>, preview?: unknown): void;

        load(slot: string): CampaignSaveState<CampaignState, Result, World, TurnState> | null;

        list(): Array<{
            slot: string;
            meta: SaveMeta;
        }>;
        delete(slot: string): void;
    }

### `CampaignSaveParts` (interface)

    export interface CampaignSaveParts<CampaignState extends StateValue, Result extends StateValue, World, TurnState> {
        readonly campaign: {
            snapshot(): CampaignSnapshot<CampaignState, Result>;
        };
        readonly world: World;
        readonly simulation?: {
            snapshot(): SimulationSnapshot<TurnState>;
        } | null;
    }

### `CampaignSaveState` (interface)

    export interface CampaignSaveState<CampaignState extends StateValue, Result extends StateValue, World, TurnState> {
        readonly campaign: CampaignSnapshot<CampaignState, Result>;
        readonly world: World;
        readonly simulation: SimulationSnapshot<TurnState> | null;
    }

### `CampaignSnapshot` (interface)

    export interface CampaignSnapshot<State extends StateValue, Result extends StateValue = StateValue> {
        readonly currentLevel: string | null;
        readonly state: State;
        readonly reminders: readonly string[];
        readonly results: Readonly<Record<string, Result>>;
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

### `EventPresentationOptions` (interface)

    export interface EventPresentationOptions<State, Command, Event, A extends Actor> {

        runtime: SimulationRuntime<State, Command, Event, A>;

        play: (event: Event) => number | void;

        followUp?: (outcome: SimulationOutcome<State, Event>) => readonly Command[];
    }

### `HeadlessScenario` (interface)

    export interface HeadlessScenario<State, Command, Event> {
        readonly seed: number;
        readonly initialState: State;
        readonly commands: readonly Command[];
        readonly step: Scenario<State, Command, Event, Generator>['step'];
        readonly status?: Scenario<State, Command, Event, Generator>['status'];
    }

### `HeadlessScenarioResult` (interface)

    export interface HeadlessScenarioResult<State, Event> extends ScenarioResult<State, Event> {
        readonly seed: number;
        readonly random: readonly [number, number, number, number];
    }

### `imitationFromReplay` (function)

    export declare function imitationFromReplay<State, Command, Event>(environment: TrainingEnvironment<State, Command, Event>, options: {
        actions: readonly string[];

### `ImitationResult` (interface)

    export interface ImitationResult {
        samples: readonly ImitationSample[];

        steps: number;
        terminated: boolean;
        truncated: boolean;
    }

### `ImitationSample` (interface)

    export interface ImitationSample {

        observation: NeuralObservation;

        action: number;

        frame: number;
    }

### `RolloutEpisode` (interface)

    export interface RolloutEpisode {
        seed: number;
        steps: number;
        rewards: number[];
        terminated: boolean;
        truncated: boolean;
        trajectory: TrainingTransition[];
    }

### `RolloutOptions` (interface)

    export interface RolloutOptions {
        seeds: readonly number[];

        sample?: boolean;

        trajectoryLimit?: number;
        signal?: AbortSignal;
    }

### `runHeadlessScenario` (function)

    export declare function runHeadlessScenario<State, Command, Event>(scenario: HeadlessScenario<State, Command, Event>): HeadlessScenarioResult<State, Event>;

### `runRollouts` (function)

    export declare function runRollouts<State, Command, Event>(environment: TrainingEnvironment<State, Command, Event>, model: NeuralModel, options: RolloutOptions): RolloutEpisode[];

### `runRolloutsAsync` (function)

    export declare function runRolloutsAsync<Config, State, Command, Event>(factory: TrainingFactory<Config, State, Command, Event>, config: Config, model: NeuralModel, options: RolloutOptions & {
        jobs?: number;

### `runScenario` (function)

    export declare function runScenario<State, Command, Event, Random>(scenario: Scenario<State, Command, Event, Random>): ScenarioResult<State, Event>;

### `runSeededEpisode` (function)

    export declare function runSeededEpisode<State, Command, Event>(environment: TrainingEnvironment<State, Command, Event>, choose: (observations: readonly NeuralObservation[]) => readonly (number | null)[], options: {
        seed: number;

### `Scenario` (interface)

    export interface Scenario<State, Command, Event, Random> {
        state: State;

        commands: readonly Command[];
        random: Random;
        step: SimulationRule<State, Command, Event, Random>;

        status?: SimulationStatus;
    }

### `ScenarioResult` (interface)

    export interface ScenarioResult<State, Event> extends SimulationStep<State, Event> {
        processedCommands: number;
    }

### `ScheduledTurns` (interface)

    export interface ScheduledTurns<Actor> {
        peek(): Actor | null;
        spend(cost: number): void;
    }

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

### `SchedulerSnapshot` (interface)

    export interface SchedulerSnapshot {
        now: number;
        sequence: number;
        entries: Array<{
            id: string;
            time: number;
            sequence: number;
            priority?: number;
        }>;
    }

### `SeededRun` (interface)

    export interface SeededRun {
        seed: number;
        steps: number;

        actions: readonly (readonly (number | null)[])[];

        rewards: readonly number[];
        terminated: boolean;
        truncated: boolean;
    }

### `SimulationContext` (interface)

    export interface SimulationContext<A extends Actor> {
        readonly random: Generator;
        readonly scheduler: Scheduler<A>;
    }

### `SimulationOutcome` (interface)

    export interface SimulationOutcome<State, Event> {
        state: State;
        events: readonly Event[];
        status: SimulationStatus;

        cost?: number | null;
    }

### `SimulationReplayMismatch` (interface)

    export interface SimulationReplayMismatch<Command, Event> {
        readonly index: number;
        readonly action: Command;
        readonly expectedEvents: readonly Event[];
        readonly actualEvents: readonly Event[];
        readonly reason: 'sequence' | 'events' | 'execution' | 'final-state';
        readonly error?: string;
    }

### `SimulationReplayResult` (interface)

    export interface SimulationReplayResult<State, Command, Event> {
        readonly valid: boolean;
        readonly checked: number;
        readonly state: State;
        readonly journal: readonly ActionJournalEntry<Command, Event>[];
        readonly mismatch?: SimulationReplayMismatch<Command, Event>;
    }

### `SimulationRule` (type)

    export type SimulationRule<State, Command, Event, Random> = (state: State, command: Command, random: Random) => SimulationStep<State, Event>;

### `SimulationRuntime` (class)

    export declare class SimulationRuntime<State, Command, Event, A extends Actor> {
        private _state;
        private _scheduler;
        readonly random: Generator;
        readonly journal: ActionJournal<Command, Event>;
        private readonly recordJournal;
        private readonly rule;
        private readonly actorId;
        private readonly history;
        private readonly actorOf;
        constructor(options: {
            state: State;
            scheduler: Scheduler<A>;
            random: Generator;
            rule: SimulationRuntimeRule<State, Command, Event, A>;
            actorId: (actor: A) => string;

            journal?: ActionJournal<Command, Event> | null;
            history?: SimulationRuntimeHistoryOptions<A>;
        });
        get scheduler(): Scheduler<A>;
        get state(): State;

        dispatch(command: Command): SimulationOutcome<State, Event>;
        get canUndo(): boolean;
        get canRedo(): boolean;

        undo(): SimulationSnapshot<State> | null;

        redo(): SimulationSnapshot<State> | null;
        snapshot(version?: number): SimulationSnapshot<State>;

        static restore<State, Command, Event, A extends Actor>(snapshot: SimulationSnapshot<State>, options: {
            rule: SimulationRuntimeRule<State, Command, Event, A>;
            actorOf: (id: string) => A;
            actorId: (actor: A) => string;

            random?: Generator;
        }): SimulationRuntime<State, Command, Event, A>;

        private historySnapshot;
        private restoreCheckpoint;
    }

### `SimulationRuntimeHistoryOptions` (interface)

    export interface SimulationRuntimeHistoryOptions<A extends Actor = Actor> extends UndoHistoryOptions {

        readonly actorOf: (id: string) => A;
    }

### `SimulationRuntimeRule` (type)

    export type SimulationRuntimeRule<State, Command, Event, A extends Actor> = (state: State, command: Command, context: SimulationContext<A>) => SimulationOutcome<State, Event>;

### `SimulationSnapshot` (interface)

    export interface SimulationSnapshot<State> {
        version: number;
        state: State;
        scheduler: SchedulerSnapshot;
        random: readonly [number, number, number, number];

        readonly journal?: readonly ActionJournalEntry<unknown, unknown>[];
    }

### `SimulationStatus` (type)

    export type SimulationStatus = 'ready' | 'finished';

### `SimulationStep` (interface)

    export interface SimulationStep<State, Event> {
        state: State;
        events: readonly Event[];
        status: SimulationStatus;
    }

### `TrainingCheckpoint` (interface)

    export interface TrainingCheckpoint<State, TrainerState> {
        version: 1;
        model: NeuralModel;
        environment: TrainingSnapshot<State>;
        trainerState: TrainerState;
    }

### `TrainingEnvironment` (class)

    export declare class TrainingEnvironment<State, Command, Event> {
        private state;
        private random;
        private steps;
        private terminated;
        private ready;
        private agentCount;
        readonly maxSteps: number;
        readonly observationVersion: string;
        private readonly rules;
        private readonly Random;
        private get truncated();
        constructor(rules: TrainingRules<State, Command, Event>, options: {
            maxSteps: number;
        }, Random?: typeof Generator);
        reset(seed: number): TrainingFrame;
        step(actions: readonly (number | null)[]): TrainingFrame;
        snapshot(): TrainingSnapshot<State>;
        restore(snapshot: TrainingSnapshot<State>): TrainingFrame;
        private observations;
    }

### `TrainingFactory` (type)

    export type TrainingFactory<Config, State, Command, Event> = (tools: {
        TrainingEnvironment: typeof TrainingEnvironment;

### `TrainingFrame` (interface)

    export interface TrainingFrame {
        observations: readonly NeuralObservation[];
        rewards: readonly number[];
        terminated: boolean;
        truncated: boolean;
    }

### `TrainingRules` (interface)

    export interface TrainingRules<State, Command, Event> {
        observationVersion: string;
        initial(random: Generator): State;

        rule: SimulationRule<State, Command, Event, Generator>;
        observe(state: State): readonly NeuralObservation[];
        command(state: State, actions: readonly (number | null)[]): Command;

        rewards(before: State, command: Command, outcome: SimulationStep<State, Event>): readonly number[];

        finished?(state: State): boolean;
    }

### `TrainingSnapshot` (interface)

    export interface TrainingSnapshot<State> {
        version: 1;
        observationVersion: string;
        state: State;
        seed: number;
        random: readonly [number, number, number, number];
        steps: number;
        maxSteps: number;
        terminated: boolean;
        truncated: boolean;
    }

### `TrainingTransition` (interface)

    export interface TrainingTransition {
        before: TrainingFrame;
        actions: readonly (number | null)[];
        after: TrainingFrame;
    }

### `TurnResult` (type)

    export type TurnResult<Actor> = {
        status: 'input';

### `TurnRules` (interface)

    export interface TurnRules<Actor> {
        scheduler: ScheduledTurns<Actor>;
        finished(): boolean;
        needsInput(actor: Actor): boolean;

        act(actor: Actor): number | null;
    }

### `validateSimulationReplay` (function)

    export declare function validateSimulationReplay<State, Command, Event, A extends Actor>(initial: SimulationSnapshot<State>, entries: readonly ActionJournalEntry<Command, Event>[], options: {
        rule: SimulationRuntimeRule<State, Command, Event, A>;

## `./testing`

### `fakeAudio` (function)

    export declare function fakeAudio(): FakePlayable;

### `fakeAudioWithEnded` (function)

    export declare function fakeAudioWithEnded(): FakePlayable;

### `fakeFetch` (function)

    export declare function fakeFetch(respond: (url: string, init?: RequestInit) => unknown): typeof globalThis.fetch & {
        calls: FakeFetchCall[];

### `FakeFetchCall` (interface)

    export interface FakeFetchCall {
        url: string;
        init?: RequestInit;
    }

### `fakeGamepad` (function)

    export declare function fakeGamepad(index: number, buttons?: number[], axes?: number[]): Gamepad;

### `FakePlayable` (interface)

    export interface FakePlayable extends Playable {
        playCount: number;
        paused: boolean;
    }

### `FakeSocket` (class)

    export declare class FakeSocket implements WebSocketLike {
        readyState: number;
        readonly sent: string[];
        onopen: ((event: unknown) => void) | null;
        onclose: ((event: unknown) => void) | null;
        onerror: ((event: unknown) => void) | null;
        onmessage: ((event: {
            data: string;
        }) => void) | null;
        send(data: string): void;
        close(): void;
        receive(message: unknown): void;
        receiveRaw(data: string): void;
    }

### `memoryStorage` (function)

    export declare function memoryStorage(): SaveStorage;

## `./threads`

### `spawn` (function)

    export declare function spawn<Args extends readonly unknown[], Result>(fn: (...args: Args) => Result, args?: Args, options?: SpawnOptions): Promise<Awaited<Result>>;

### `SpawnOptions` (interface)

    export interface SpawnOptions {

        transfer?: Transferable[];

        timeout?: number;

        signal?: AbortSignal;
    }

## `./two-d`

### `ActorAnimationState` (type)

    export type ActorAnimationState = 'idle' | 'move' | 'action';

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

### `ActorAnimatorOptions` (interface)

    export interface ActorAnimatorOptions {

        animationName: (state: ActorAnimationState, variant: string) => string;

        variant?: string;
    }

### `advanceReveal` (function)

    export declare function advanceReveal(state: RevealState, dt: number): boolean;

### `Anchor` (type)

    export type Anchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'fill';

### `anchorAlign` (function)

    export declare function anchorAlign(anchor: Anchor): {
        x: number;

### `AnchorSpec` (interface)

    export interface AnchorSpec {

        anchor?: Anchor;

        offsetX?: number;
        offsetY?: number;

        alignX?: number;
        alignY?: number;

        width?: number;
        height?: number;

        margin?: number;
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

### `AnimationFrame` (interface)

    export interface AnimationFrame {
        readonly texture: Texture2D;

        readonly duration?: number;

        readonly offsetX?: number;
        readonly offsetY?: number;
    }

### `AnimationFrameInput` (type)

    export type AnimationFrameInput = Texture2D | AnimationFrame;

### `AnimationOptions` (interface)

    export interface AnimationOptions {

        fps?: number;

        loop?: boolean;

        startTime?: number;
    }

### `applyAllImageModifiers` (function)

    export declare function applyAllImageModifiers(sprite: Sprite, parsed: ParsedImagePath, probe?: ImageTextureProbe, scale?: number): void;

### `applyImageModifiers` (function)

    export declare function applyImageModifiers(sprite: Sprite, parsed: ParsedImagePath, scale?: number): void;

### `applyTextureModifiers` (function)

    export declare function applyTextureModifiers(texture: Texture, parsed: ParsedImagePath, probe?: ImageTextureProbe): Texture;

### `assertAutotileLayout` (function)

    export declare function assertAutotileLayout(layout: AutotileLayout): void;

### `AttachmentPoint` (interface)

    export interface AttachmentPoint {
        x: number;
        y: number;
    }

### `AudioSuspendRig` (interface)

    export interface AudioSuspendRig {
        suspend(): void;
        resume(): void;
    }

### `AutotileCell` (type)

    export type AutotileCell = number;

### `AutotileCellPart` (interface)

    export interface AutotileCellPart {
        sourceX: number;
        sourceY: number;
        sourceWidth: number;
        sourceHeight: number;
        destX: number;
        destY: number;
        destWidth: number;
        destHeight: number;
    }

### `autotileCellParts` (function)

    export declare function autotileCellParts(layout: AutotileLayout, tile: number, frame: number): AutotileCellPart[] | null;

### `AutotileFormat` (type)

    export type AutotileFormat = 'rpgm-mv' | 'rpgm-xp';

### `autotileFrames` (function)

    export declare function autotileFrames(width: number, height: number, sameTerrain: (x: number, y: number) => boolean, frames: readonly number[]): Int32Array;

### `AutotileLayout` (type)

    export type AutotileLayout = {
        format: 'rpgm-mv';

### `AutotileSet` (interface)

    export interface AutotileSet {

        sheet: SpriteSheet;

        format?: AutotileFormat;

        slot?: RpgmAutotileSlot;

        mode?: 'floor' | 'wall' | 'mixed';

        table?: RpgmAutotileShapeTable;

        index?: number;

        frames?: number;

        tableEdge?: boolean;

        animation?: ReadonlyArray<ReadonlyArray<number>>;

        animationFrame?: number;
    }

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

### `BarOptions` (interface)

    export interface BarOptions {
        width: number;
        height: number;

        color?: number;

        value?: number;
        max?: number;

        fillTexture?: Texture2D;

        background?: number;

        backgroundTexture?: Texture2D;

        roundUpToPixel?: boolean;
    }

### `Beam` (class)

    export declare class Beam extends Container {
        private from;
        private to;
        private readonly colour;
        private readonly texture?;
        private readonly stretch;
        private readonly textureAnchor;
        private readonly thickness;
        private readonly thin;
        private readonly duration;
        private readonly body;
        private elapsed;
        private expired;

        private lifeFraction;
        constructor(from: BeamPoint, to: BeamPoint, options?: BeamOptions);

        get progress(): number;
        get done(): boolean;

        retarget(from?: BeamPoint, to?: BeamPoint): void;

        update(dt: number): boolean;
        destroy(): void;
        private redraw;
    }

### `BeamOptions` (interface)

    export interface BeamOptions {

        colour?: number;

        texture?: Texture2D | BeamTextureOptions;

        duration?: number;

        width?: number;

        thin?: boolean;

        additive?: boolean;
    }

### `BeamPoint` (interface)

    export interface BeamPoint {
        x: number;
        y: number;
    }

### `Beams` (class)

    export declare class Beams extends Container {
        private readonly live;

        add(from: BeamPoint, to: BeamPoint, options?: BeamOptions): Beam;

        update(dt: number): void;

        get count(): number;

        clear(): void;
        destroy(): void;
    }

### `BeamTextureOptions` (interface)

    export interface BeamTextureOptions {

        source: Texture2D;

        stretch?: boolean;

        anchor?: number;
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

### `BitmapLabelOptions` (type)

    export type BitmapLabelOptions = ThemedTextOptions;

### `bitmapLabelStyle` (function)

    export declare function bitmapLabelStyle(opts: BitmapLabelOptions, t: Theme): TextStyleOptions;

### `blendMatrix` (function)

    export declare function blendMatrix(color: number, ratio: number): ColorMatrixFilter['matrix'];

### `blendPixels` (function)

    export declare function blendPixels(pixels: Uint8ClampedArray, color: number, ratio: number): Uint8ClampedArray;

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

### `ButtonOptions` (interface)

    export interface ButtonOptions {
        width: number;
        height: number;

        text?: string;

        icon?: Container2D;

        skin?: ButtonSkin;

        label?: Omit<LabelOptions, 'text'>;
        disabled?: boolean;
        onClick?: () => void;

        onPress?: () => void;

        onRelease?: () => void;
    }

### `ButtonSkin` (interface)

    export interface ButtonSkin {
        texture: Texture2D;
        border: NinePatchOptions['border'];

        tints?: Partial<Record<ButtonState, number>>;
    }

### `ButtonState` (type)

    export type ButtonState = 'idle' | 'hover' | 'pressed' | 'disabled';

### `Camera` (class)

    export declare class Camera {

        readonly world: Container<import("pixi.js").ContainerChild>;

        x: number;
        y: number;
        private requestedZoom;
        private readonly resolution;
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

        readonly stepsPerTurn: number;
        private step;
        private _angle;
        private targetAngle;
        private angleIntensity;
        constructor(options?: CameraOptions);

        get rotationSteps(): number;

        get rotation(): number;

        get uprightRotation(): number;

        setRotationStep(step: number): void;

        rotate(delta?: number): void;

        rotateTo(angle: number): void;

        animateRotationTo(angle: number, intensity?: number): void;

        private get spin();

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

        shakeScreen(intensity: number, duration?: number): void;
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
        private snapToDevice;
    }

### `CameraOptions` (interface)

    export interface CameraOptions {

        zoom?: number;

        grid?: 'square' | 'hex';

        deadzone?: number;

        pixelPerfectTileSize?: number;

        resolution?: () => number;
    }

### `channelScaleMatrix` (function)

    export declare function channelScaleMatrix(scale: {
        red?: number;

### `ChannelSource` (type)

    export type ChannelSource = 'R' | 'G' | 'B' | 'A' | '0' | '1';

### `channelSwapMatrix` (function)

    export declare function channelSwapMatrix(sources: readonly ChannelSource[]): ColorMatrixFilter['matrix'];

### `CharacterDefinition` (interface)

    export interface CharacterDefinition {
        sheet: SpriteSheet;

        expressions: Record<string, number>;

        height?: number;

        baseline?: number;
    }

### `Checkbox` (class)

    export declare class Checkbox extends Container {
        readonly onChange: Signal<boolean>;
        private box;
        private size_;
        private checked_;
        private disabled_;
        private readonly themeListener;
        constructor(options?: CheckboxOptions);
        get checked(): boolean;
        get disabled(): boolean;
        setDisabled(disabled: boolean): void;

        setChecked(checked: boolean): void;
        toggle(): void;
        resize(size: number): void;
        private readonly handleTap;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `CheckboxOptions` (interface)

    export interface CheckboxOptions {

        size?: number;
        checked?: boolean;
        disabled?: boolean;

        color?: number;
    }

### `Choice` (interface)

    export interface Choice {
        text: string;
        value?: unknown;
        disabled?: boolean;
    }

### `COLOR_BLINDNESS_MATRICES` (const)

    export declare const COLOR_BLINDNESS_MATRICES: Record<ColorBlindnessType, ColorMatrix>;

### `ColorBlindnessType` (type)

    export type ColorBlindnessType = 'protanopia' | 'deuteranopia' | 'tritanopia';

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

### `ContrastLevel` (type)

    export type ContrastLevel = 'AA' | 'AAA';

### `contrastRatio` (function)

    export declare function contrastRatio(a: number, b: number): number;

### `createCamera` (function)

    export declare function createCamera(options?: CameraOptions): Camera;

### `createColorBlindnessFilter` (function)

    export declare function createColorBlindnessFilter(type: ColorBlindnessType): ColorMatrixFilter;

### `createLayers` (function)

    export declare function createLayers(parent: Container, names: readonly string[]): Record<string, Node2D>;

### `croppedTexture` (function)

    export declare function croppedTexture(texture: Texture, parsed: ParsedImagePath): Texture;

### `DataTable` (class)

    export declare class DataTable<T> {
        readonly onChange: Signal<void>;
        private columns_;
        private rows_;
        private pageSize_;
        private current;
        private sortKey_;
        private ascending;
        private readonly disabledOf;
        constructor(options: DataTableOptions<T>);
        get columns(): readonly TableColumn<T>[];
        get rows(): readonly T[];
        get pageSize(): number;
        get sortKey(): string | null;
        get sortAscending(): boolean;
        get selectedIndex(): number;
        get selected(): T | null;

        get page(): number;

        get pageCount(): number;
        get pageRows(): readonly T[];
        setRows(rows: readonly T[]): void;
        setColumns(columns: readonly TableColumn<T>[]): void;
        setPageSize(size: number): void;

        sortBy(key: string): void;
        select(index: number): void;

        move(delta: number): void;

        setPage(page: number): void;
        nextPage(delta?: number): void;
        private firstEnabled;
    }

### `DataTableOptions` (interface)

    export interface DataTableOptions<T> {
        columns: readonly TableColumn<T>[];
        rows?: readonly T[];

        pageSize?: number;

        disabled?: (row: T) => boolean;
    }

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

### `Dropdown` (class)

    export declare class Dropdown {
        readonly onChange: Signal<{
            option: DropdownOption;
            index: number;
        }>;
        private options_;
        private current;
        private highlight_;
        private open_;
        private disabled_;
        constructor(options: DropdownOptions);
        get options(): readonly DropdownOption[];
        get selectedIndex(): number;

        get selected(): DropdownOption | null;
        get isOpen(): boolean;
        get disabled(): boolean;

        get highlight(): number;
        setDisabled(disabled: boolean): void;
        setOptions(options: readonly DropdownOption[]): void;

        open(): void;
        close(): void;
        toggleOpen(): void;

        move(delta: number): void;

        setHighlight(index: number): void;

        confirm(): boolean;

        cancel(): void;
        private firstEnabled;
    }

### `DropdownOption` (interface)

    export interface DropdownOption {

        id?: string;
        label: string;
        disabled?: boolean;
    }

### `DropdownOptions` (interface)

    export interface DropdownOptions {
        options: readonly DropdownOption[];

        selectedIndex?: number;
        disabled?: boolean;
    }

### `EMPTY` (const)

    export declare const EMPTY = -1;

### `escapeHtml` (function)

    export declare function escapeHtml(text: string): string;

### `extractDialogueCatalog` (function)

    export declare function extractDialogueCatalog(commands: readonly StageCommand[] | StoryScript, options?: {
        locale?: string;

### `fitWindowZoom` (function)

    export declare function fitWindowZoom(base: number, contentHeight: number, viewportHeight: number): number;

### `FlightHandle` (interface)

    export interface FlightHandle {

        readonly projectile: Projectile;

        readonly done: boolean;

        cancel(): void;
    }

### `FlightOptions` (interface)

    export interface FlightOptions extends ProjectileOptions {

        tint?: number;

        spin?: number;

        spinDegrees?: number;

        fadeIn?: number | boolean | 'progress';

        onArrive?: () => void;
    }

### `Flights` (class)

    export declare class Flights extends Container {
        private readonly live;
        add(sprite: FlightSprite, from: ProjectilePoint, to: ProjectilePoint, options?: FlightOptions): FlightHandle;
        add(texture: Texture2D, from: ProjectilePoint, to: ProjectilePoint, options?: FlightOptions): FlightHandle;

        update(dt: number): void;

        get count(): number;

        clear(): void;
        destroy(): void;
        private release;
    }

### `FlightSprite` (interface)

    export interface FlightSprite {
        x: number;
        y: number;
        rotation?: number;
        alpha?: number;
        tint?: number;
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

### `FloatingTextOptions` (interface)

    export interface FloatingTextOptions {
        text: string;
        color?: number;
        size?: number;

        duration?: number;

        rise?: number;

        hold?: number;
    }

### `FloatingTextPush` (interface)

    export interface FloatingTextPush extends FloatingTextOptions {

        x: number;
        y: number;

        key?: string | number;

        scale?: number;
    }

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

### `FloatingTextStackEntry` (interface)

    export interface FloatingTextStackEntry {

        key?: string | number;

        x: number;
        y: number;

        height: number;
    }

### `floatingTextStackLifePenalty` (function)

    export declare function floatingTextStackLifePenalty(linesBelow: number): number;

### `floatingTextStackLift` (function)

    export declare function floatingTextStackLift(older: FloatingTextStackEntry, below: FloatingTextStackEntry, gap?: number): number;

### `FloatingTextStackMove` (interface)

    export interface FloatingTextStackMove {

        readonly index: number;

        readonly y: number;

        readonly ageAtLeast: number;
    }

### `floatingTextStackMoves` (function)

    export declare function floatingTextStackMoves(live: readonly FloatingTextStackEntry[], incoming: FloatingTextStackEntry, gap?: number): FloatingTextStackMove[];

### `FogCell` (type)

    export type FogCell = number | ArrayLike<number>;

### `FogColor` (type)

    export type FogColor = readonly [number, number, number, number];

### `FogLayer` (class)

    export declare class FogLayer extends Sprite {
        private readonly context;
        private readonly image;
        private readonly columns;
        private readonly rows;
        private readonly cellResolution;
        private palette;
        constructor(options: FogLayerOptions);

        setPalette(palette: readonly FogColor[]): void;
        refresh(state: (x: number, y: number) => FogCell): void;

        destroy(): void;
    }

### `FogLayerOptions` (interface)

    export interface FogLayerOptions {

        width: number;
        height: number;

        tileSize?: number;

        resolution?: number;

        palette: readonly FogColor[];
    }

### `FollowOptions` (interface)

    export interface FollowOptions {

        offsetX?: number;
        offsetY?: number;

        enabled?: () => boolean;

        visible?: () => boolean;
    }

### `FollowTarget` (type)

    export type FollowTarget = Container | (() => {
        x: number;

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
        private stopWatchingVisibility;
        private suspended_;
        private timeScaleBeforeSuspend;
        private scaler;
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

        get suspended(): boolean;

        suspend(): void;

        resume(): void;

        private expose;

        private fitResolutionToDevice;
        private frame;
        private switchNow;

        private applySwitch;

        private applyPush;

        private applyPop;
        destroy(): void;
    }

### `GameOptions` (interface)

    export interface GameOptions {

        canvas?: HTMLCanvasElement;

        background?: number;

        maxDelta?: number;

        pixelArt?: boolean;

        resizeTo?: HTMLElement | Window;

        extensions?: readonly (() => void)[];

        autoPause?: boolean;

        audio?: AudioSuspendRig | null;

        qualityScaling?: Omit<QualityScalerOptions, 'ceiling'> | null;
    }

### `GlyphLayout` (interface)

    export interface GlyphLayout {
        char: string;
        x: number;
        y: number;
        rotate: boolean;
    }

### `Gradient` (const)

    export declare const Gradient: typeof FillGradient;

### `GraphicsCapabilities` (interface)

    export interface GraphicsCapabilities {
        webgl1: boolean;
        webgl2: boolean;
        webgpu: boolean;

        wgsl: boolean;
    }

### `GraphicsProbe` (interface)

    export interface GraphicsProbe {
        createCanvas?(): {
            getContext(kind: string): unknown;
        } | null;
        webgpu?: boolean;

        wgsl?: boolean;
    }

### `GraphicsWorkload` (type)

    export type GraphicsWorkload = 'sprites' | 'ui' | 'custom-shaders' | 'particles' | 'instanced-terrain' | 'voxels' | 'animated-models' | 'large-3d-worlds';

### `Grid` (class)

    export declare class Grid {
        private spec;
        constructor(spec: GridSpec);
        get columns(): readonly GridTrack[];
        get rows(): readonly GridTrack[];

        columnSizes(totalWidth: number): number[];

        rowSizes(totalHeight: number): number[];

        rect(row: number, column: number, bounds: LayoutRect, options?: {
            rowSpan?: number;
            columnSpan?: number;
        }): LayoutRect;
        private get gap();
    }

### `GridSpec` (interface)

    export interface GridSpec {
        columns: readonly GridTrack[];
        rows: readonly GridTrack[];

        gap?: number;
    }

### `GridTrack` (interface)

    export interface GridTrack {

        size?: number;

        grow?: number;
    }

### `Halo` (class)

    export declare class Halo extends AnimatedSprite {
        private readonly offsetX;
        private readonly offsetY;
        constructor(options: HaloOptions);

        follow(x: number, y: number): this;
    }

### `HALO_ANIMATION` (const)

    export declare const HALO_ANIMATION = "halo";

### `HaloOptions` (interface)

    export interface HaloOptions {

        readonly frames: readonly AnimationFrameInput[];

        readonly animation?: AnimationOptions;

        readonly offsetX?: number;
        readonly offsetY?: number;

        readonly blendMode?: 'add' | 'normal' | 'multiply' | 'screen';
    }

### `HasColorAdd` (interface)

    export interface HasColorAdd {

        colorAdd?: number;
    }

### `HelpScreen` (class)

    export declare class HelpScreen extends Container {
        private list;
        private body;
        private topics;
        constructor(options: HelpScreenOptions);
        private showBody;

        handleAction(action: Action): boolean;
    }

### `HelpScreenOptions` (interface)

    export interface HelpScreenOptions {
        width: number;
        height: number;
        topics: readonly HelpTopic[];

        listWidth?: number;
    }

### `HelpTopic` (interface)

    export interface HelpTopic {
        title: string;
        body: string;
    }

### `hexRotate` (function)

    export declare function hexRotate(dx: number, dy: number, rotationIndex: number, rotations: number): {
        dx: number;

### `highContrastTheme` (const)

    export declare const highContrastTheme: Theme;

### `HistoryEntry` (interface)

    export interface HistoryEntry {
        text: string;
        speaker?: string;

        chosen?: unknown;
    }

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

### `IconGridItem` (interface)

    export interface IconGridItem {

        icon: Container2D;

        disabled?: boolean;

        value?: unknown;

        quantity?: number;
    }

### `IconGridOptions` (interface)

    export interface IconGridOptions {
        width: number;
        height: number;

        columns: number;
        items?: IconGridItem[];

        cellSize?: number;

        longPressDuration?: number;
        onSelect?: (item: IconGridItem, index: number) => void;
        onHighlight?: (item: IconGridItem, index: number) => void;

        onQuickslot?: (item: IconGridItem, index: number) => void;

        onReorder?: (fromIndex: number, toIndex: number) => void;
    }

### `imageModifier` (function)

    export declare function imageModifier(path: ParsedImagePath, name: string): ImageModifier | undefined;

### `ImageModifier` (interface)

    export interface ImageModifier {
        readonly name: string;
        readonly args: readonly string[];
    }

### `ImageTextureProbe` (interface)

    export interface ImageTextureProbe extends RecolorProbe {
        resolveTexture?(pathWithModifiers: string): Texture2D | undefined;
        resolveColor?(name: string): number | undefined;
    }

### `importTwee` (function)

    export declare function importTwee(source: string): TwineStory;

### `inspectGraphicsCapabilities` (function)

    export declare function inspectGraphicsCapabilities(probe?: GraphicsProbe): GraphicsCapabilities;

### `isOnScreen` (function)

    export declare function isOnScreen(camera: Camera, x: number, y: number, margin?: number): boolean;

### `KeyboardKey` (interface)

    export interface KeyboardKey {

        label: string;

        text?: string;

        action?: Action;

        span?: number;
    }

### `KeyboardLayout` (interface)

    export interface KeyboardLayout {

        rows: KeyboardKey[][];
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

### `LabelOptions` (interface)

    export interface LabelOptions extends ThemedTextOptions {

        stroke?: {
            color: number;
            width: number;
        };

        resolution?: number;
        roundPixels?: boolean;
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

### `layoutMarkupLines` (function)

    export declare function layoutMarkupLines(spans: readonly MarkupSpan[], measure: MarkupMeasure, maxWidth: number): MarkupLine[];

### `LayoutRect` (interface)

    export interface LayoutRect {
        x: number;
        y: number;
        width: number;
        height: number;
    }

### `layoutVertical` (function)

    export declare function layoutVertical(text: string, options: VerticalLayoutOptions): GlyphLayout[];

### `LightningArc` (class)

    export declare class LightningArc {
        private from;
        private to;
        private readonly segments;
        private readonly jitter;
        private readonly flickerInterval?;
        private readonly random;
        private readonly duration?;
        private elapsed;
        private sinceFlicker;
        private expired;
        private current;
        constructor(from: LightningArcPoint, to: LightningArcPoint, options?: LightningArcOptions);

        get points(): readonly LightningArcPoint[];
        get done(): boolean;

        retarget(from?: LightningArcPoint, to?: LightningArcPoint): void;

        update(dt: number): boolean;
        private reroll;
    }

### `LightningArcOptions` (interface)

    export interface LightningArcOptions {

        duration?: number;

        segments?: number;

        jitter?: number;

        flickerInterval?: number;

        random?: () => number;
    }

### `LightningArcPoint` (interface)

    export interface LightningArcPoint {
        x: number;
        y: number;
    }

### `linesToDrop` (function)

    export declare function linesToDrop(lineCounts: readonly number[], maxLines: number): number;

### `LiquidLayer` (class)

    export declare class LiquidLayer extends Container {
        private readonly cells;
        private readonly ripples;
        private readonly columns;
        private readonly tileSize;
        private readonly speed;
        private readonly rippleTexture?;
        private readonly rippleDuration;
        private offset;
        constructor(options: LiquidLayerOptions);

        setCellColor(x: number, y: number, tint: number): void;

        ripple(x: number, y: number): void;

        get rippleCount(): number;
        update(dt: number): void;
    }

### `LiquidLayerOptions` (interface)

    export interface LiquidLayerOptions {

        texture: Texture2D;

        width: number;
        height: number;

        tileSize?: number;

        isLiquid: (x: number, y: number) => boolean;

        speed?: number;

        rippleTexture?: Texture2D;

        rippleDuration?: number;
    }

### `ListItem` (interface)

    export interface ListItem {

        text: string;

        disabled?: boolean;

        value?: unknown;

        icon?: Container2D;
    }

### `ListTab` (interface)

    export interface ListTab {
        id: string;
        label: string;

        disabled?: boolean;
    }

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
        onToggle: ((item: ListItem, index: number, checked: boolean) => void) | null;
        private multiple;
        private checked;
        private ticks;
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

        tapRow(index: number): void;

        handleAction(action: Action): boolean;
        get checkedIndexes(): number[];
        isChecked(index: number): boolean;

        setChecked(index: number, checked: boolean): void;

        toggleChecked(index: number): boolean;

        clearChecked(): void;

        private checkAdvance;
        private checkBox;
        private rebuildTicks;
        private updateTicks;
        private refresh;
    }

### `ListViewOptions` (interface)

    export interface ListViewOptions {
        width: number;
        height: number;
        items?: ListItem[];

        rowHeight?: number;
        onSelect?: (item: ListItem, index: number) => void;
        onHighlight?: (item: ListItem, index: number) => void;

        multiple?: boolean;
        onToggle?: (item: ListItem, index: number, checked: boolean) => void;
    }

### `LoadedTiledMap` (interface)

    export interface LoadedTiledMap {
        map: TileMap;

        objects: Array<TiledObject & {
            tileX: number;
            tileY: number;
        }>;
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

### `LoadingScreenOptions` (interface)

    export interface LoadingScreenOptions {
        width: number;
        height: number;
        title?: string;
        onRetry?: () => void;
        onCancel?: () => void;
    }

### `loadTiledMap` (function)

    export declare function loadTiledMap(data: TiledMapData, sheets: SpriteSheet | TilesetSheet[]): LoadedTiledMap;

### `MarkdownSpan` (interface)

    export interface MarkdownSpan {
        text: string;
        bold: boolean;
        italic: boolean;
    }

### `markupAccessibilityText` (function)

    export declare function markupAccessibilityText(spans: readonly MarkupSpan[], options?: {
        describeImage?: (path: string) => string;

### `MarkupAlign` (type)

    export type MarkupAlign = 'left' | 'center' | 'right';

### `MarkupDirection` (type)

    export type MarkupDirection = 'ltr' | 'rtl';

### `MarkupLayout` (interface)

    export interface MarkupLayout {

        readonly measure: MarkupMeasure;

        readonly maxWidth: number;

        readonly lineHeight: number;

        readonly direction?: MarkupDirection;

        readonly align?: MarkupAlign;
    }

### `MarkupLine` (interface)

    export interface MarkupLine {
        readonly spans: readonly MarkupSpan[];
        readonly width: number;
    }

### `MarkupMeasure` (type)

    export type MarkupMeasure = (piece: Pick<MarkupSpan, 'text' | 'bold' | 'italic' | 'size' | 'image' | 'tag'>) => number;

### `MarkupOptions` (interface)

    export interface MarkupOptions {

        readonly variables?: Readonly<Record<string, string>>;

        readonly tags?: ReadonlySet<string>;
    }

### `MarkupSpan` (interface)

    export interface MarkupSpan extends MarkdownSpan {

        color?: string;

        size?: number;

        image?: string;

        tag?: string;
    }

### `MarkupText` (class)

    export declare class MarkupText extends Container {
        private readonly opts;
        private readonly themeListener;
        constructor(options?: MarkupTextOptions);

        setText(value: string): void;

        private rebuild;
        private measurePiece;

        private tagStyle;

        private resolvedFont;
        private textFor;
        private spriteFor;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `MarkupTextOptions` (interface)

    export interface MarkupTextOptions {
        text?: string;

        maxWidth?: number;

        lineHeight?: number;
        align?: MarkupAlign;

        direction?: MarkupDirection;

        resolution?: number;

        resolveImage?: (path: string) => Texture2D;

        variables?: Readonly<Record<string, string>>;

        tagStyles?: Readonly<Record<string, TextStyleOptions>>;
    }

### `markupToHtml` (function)

    export declare function markupToHtml(spans: readonly MarkupSpan[]): string;

### `maskPixels` (function)

    export declare function maskPixels(base: Uint8ClampedArray, baseWidth: number, baseHeight: number, mask: Uint8ClampedArray, maskWidth: number, maskHeight: number, offsetX: number, offsetY: number): Uint8ClampedArray;

### `matchTerrainRule` (function)

    export declare function matchTerrainRule(rule: TerrainRule, x: number, y: number, flagsAt: TerrainFlagsAt, rotate?: TerrainRotate, rotationIndex?: number): boolean;

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

### `MessageBoxOptions` (interface)

    export interface MessageBoxOptions {
        width: number;
        height: number;
        pages: Array<MessagePage | string>;

        speed?: number;

        choices?: Choice[];

        onDone?: (chosen: unknown) => void;

        onSound?: (path: string) => void;

        dims?: boolean;

        blocker?: boolean;

        anchor?: 'center' | 'bottom' | 'top';

        announce?: boolean;

        mode?: 'adv' | 'nvl';

        autoAdvance?: number;
    }

### `messageBoxPresenter` (function)

    export declare function messageBoxPresenter(windows: WindowStack, options?: MessageBoxPresenterOptions): DialoguePresenter;

### `MessageBoxPresenterOptions` (interface)

    export interface MessageBoxPresenterOptions {

        width?: number;
        height?: number;
        speed?: number;
        anchor?: 'center' | 'bottom' | 'top';
    }

### `MessageLevel` (type)

    export type MessageLevel = 'info' | 'positive' | 'negative' | 'warning' | 'highlight';

### `MessageLog` (class)

    export declare class MessageLog extends Container {
        private readonly blocks;
        private readonly options;
        private maxLines;
        constructor(options: MessageLogOptions);
        get entryCount(): number;

        get contentHeight(): number;

        lastEntries(count: number): MessageLogEntry[];
        add(text: string, level?: MessageLevel): void;
        setMaxLines(lines: number): void;
        setWrapWidth(width: number): void;
        clear(): void;
        private colorOf;
        private linesOf;
        private trim;
        private layout;
    }

### `MessageLogEntry` (interface)

    export interface MessageLogEntry {
        text: string;
        level: MessageLevel;
    }

### `MessageLogOptions` (interface)

    export interface MessageLogOptions {

        wrapWidth: number;

        maxLines?: number;

        size?: number;

        colors?: Partial<Record<MessageLevel, number>>;

        resolution?: number;
    }

### `MessagePage` (interface)

    export interface MessagePage {
        text: string;

        speaker?: string;

        portrait?: Texture2D;
    }

### `Meter` (class)

    export declare class Meter extends Container {
        private emptyLayer;
        private filledLayer;
        private maskShape;
        private count_;
        private size_;
        private gap_;
        private value_;
        private explicitColor;
        private fillColor;
        private emptyColor_?;
        private readonly filledTexture?;
        private readonly emptyTexture?;
        private readonly themeListener;
        constructor(options: MeterOptions);

        get value(): number;

        get count(): number;

        get color(): number;
        setValue(value: number, count?: number): void;

        setColor(color: number): void;
        resize(size: number, gap?: number): void;
        private get totalWidth();
        private iconX;
        private draw;
        private icon;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `MeterOptions` (interface)

    export interface MeterOptions {

        count: number;

        value?: number;

        size?: number;

        gap?: number;

        filledTexture?: Texture2D;

        emptyTexture?: Texture2D;

        color?: number;

        emptyColor?: number;
    }

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

### `MinimapMarker` (interface)

    export interface MinimapMarker {
        x: number;
        y: number;
        facing?: number;
        color?: number;
    }

### `MinimapOptions` (interface)

    export interface MinimapOptions {

        widthInCells: number;
        heightInCells: number;

        cellSize?: number;

        shape?: 'square' | 'hex';
    }

### `MotionHandle` (interface)

    export interface MotionHandle {
        readonly done: Promise<void>;
        cancel(): void;
    }

### `MotionTarget` (interface)

    export interface MotionTarget {
        x: number;
        y: number;
        rotation: number;
        scale: {
            x: number;
            y: number;
        };
        skew: {
            x: number;
            y: number;
        };
    }

### `NeighborMask` (interface)

    export interface NeighborMask {
        n: boolean;
        e: boolean;
        s: boolean;
        w: boolean;
        ne: boolean;
        se: boolean;
        sw: boolean;
        nw: boolean;
    }

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

### `NinePatchOptions` (interface)

    export interface NinePatchOptions {

        border: number | {
            left: number;
            top: number;
            right: number;
            bottom: number;
        };
    }

### `NO_COLOR_ADD` (const)

    export declare const NO_COLOR_ADD = 0;

### `Node2D` (class)

    export declare class Node2D extends Container {
    }

### `OnScreenKeyboard` (class)

    export declare class OnScreenKeyboard extends Container {
        private readonly laidOutHeight;
        constructor(layout: KeyboardLayout, options: {
            width: number;
        });

        get contentHeight(): number;
    }

### `packColorAdd` (function)

    export declare function packColorAdd(r: number, g: number, b: number, a?: number): number;

### `packTintAdd` (function)

    export declare function packTintAdd(color: number, strength: number): number;

### `paintFogPixels` (function)

    export declare function paintFogPixels(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number, resolution: number, state: (x: number, y: number) => FogCell, palette: readonly FogColor[]): void;

### `PaletteMapping` (interface)

    export interface PaletteMapping {
        readonly from: readonly number[];
        readonly to: readonly number[];
    }

### `PaletteRange` (interface)

    export interface PaletteRange {
        readonly min: number;
        readonly mid: number;
        readonly max: number;
    }

### `paletteRangeMapping` (function)

    export declare function paletteRangeMapping(reference: readonly number[], range: PaletteRange): PaletteMapping;

### `PaletteRemapMode` (type)

    export type PaletteRemapMode = 'exact' | 'nearest';

### `parseColorPairs` (function)

    export declare function parseColorPairs(args: readonly string[], resolve?: (name: string) => number | undefined): PaletteMapping;

### `parseDialogueText` (function)

    export declare function parseDialogueText(source: string): StageCommand[];

### `ParsedImagePath` (interface)

    export interface ParsedImagePath {
        readonly path: string;
        readonly modifiers: readonly ImageModifier[];
    }

### `parseImagePath` (function)

    export declare function parseImagePath(value: string): ParsedImagePath;

### `parseMarkdown` (function)

    export declare function parseMarkdown(text: string): MarkdownSpan[];

### `parseMarkup` (function)

    export declare function parseMarkup(source: string, options?: MarkupOptions): MarkupSpan[];

### `parsePaletteLists` (function)

    export declare function parsePaletteLists(args: readonly string[], resolve?: (name: string) => number | undefined): PaletteMapping;

### `parseRotateMode` (function)

    export declare function parseRotateMode(argument: string | undefined): RotateMode;

### `Particle` (interface)

    export interface Particle {
        x: number;
        y: number;
        vx: number;
        vy: number;

        age: number;

        life: number;
        rotation: number;
        spin: number;

        scale: number;
        alpha: number;

        tint: number;

        frame: number;

        active: boolean;
    }

### `ParticleCurve` (type)

    export type ParticleCurve = (t: number) => number;

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
        private readonly scaleOf;
        private readonly alphaOf;
        private readonly flicker;
        private readonly spin;
        private readonly tintRange;

        private readonly frames?;

        private readonly spawnArea;
        private emitting;
        private followTarget;
        private followOffsetX;
        private followOffsetY;
        private followEnabled;
        private followVisible;

        private poolCursor;

        private debt;
        constructor(options?: ParticleEmitterOptions);

        start(): void;

        stop(): void;

        attach(target: FollowTarget, options?: FollowOptions): void;

        detach(): void;

        get attachedTo(): FollowTarget | null;
        private syncFollow;
        private followEmissionAllowed;
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

### `ParticleEmitterOptions` (interface)

    export interface ParticleEmitterOptions {

        texture?: Texture2D;

        frames?: readonly Texture2D[];

        max?: number;

        rate?: number;

        life?: ParticleRange;

        speed?: ParticleRange;

        angle?: ParticleRange;

        gravity?: {
            x: number;
            y: number;
        };

        scale?: readonly [number, number] | ParticleCurve;

        alpha?: readonly [number, number] | ParticleCurve;

        flicker?: number;

        spin?: ParticleRange;

        spawn?: ParticleSpawnArea;

        tint?: ParticleRange;
    }

### `ParticleRange` (type)

    export type ParticleRange = number | readonly [number, number];

### `ParticleSpawnArea` (interface)

    export interface ParticleSpawnArea {
        shape: 'rect' | 'ellipse';

        width: number;

        height?: number;
    }

### `PositionedMarkupSpan` (interface)

    export interface PositionedMarkupSpan {

        readonly span: MarkupSpan;

        readonly x: number;

        readonly y: number;

        readonly width: number;
    }

### `positionMarkupLines` (function)

    export declare function positionMarkupLines(lines: readonly MarkupLine[], layout: MarkupLayout): PositionedMarkupSpan[];

### `Projectile` (class)

    export declare class Projectile {
        private sprite;
        private fromX;
        private fromY;
        private toX;
        private toY;
        private duration;
        private readonly animation?;
        private elapsed;
        private arrived;
        constructor(sprite: ProjectilePoint, from: ProjectilePoint, to: ProjectilePoint, options?: ProjectileOptions);
        get done(): boolean;

        get progress(): number;

        get frame(): AnimationFrame | undefined;

        get frameOffset(): ProjectilePoint;

        update(dt: number): boolean;
    }

### `ProjectileOptions` (interface)

    export interface ProjectileOptions {

        speed?: number;

        duration?: number;

        animation?: Animation;
    }

### `ProjectilePoint` (interface)

    export interface ProjectilePoint {
        x: number;
        y: number;
    }

### `QualityScaler` (class)

    export declare class QualityScaler {
        private ceiling;
        private readonly floor;
        private readonly budget;
        private readonly downAfter;
        private readonly upAfter;
        private readonly step;
        private ratio_;
        private over;
        private under;
        constructor(options: QualityScalerOptions);

        get ratio(): number;

        setCeiling(ceiling: number): number;

        observe(frameSeconds: number): number;

        reset(): void;
    }

### `QualityScalerOptions` (interface)

    export interface QualityScalerOptions {

        ceiling: number;

        minRatio?: number;

        targetFps?: number;

        overBudgetFrames?: number;

        underBudgetFrames?: number;

        step?: number;
    }

### `RadioGroup` (class)

    export declare class RadioGroup extends Container {
        readonly onChange: Signal<number>;
        private options_;
        private rows;
        private circles;
        private size_;
        private gap_;
        private selected_;
        private readonly themeListener;
        constructor(options?: RadioGroupOptions);
        get selected(): number;
        get selectedOption(): RadioOption | null;
        get length(): number;
        get rowHeight(): number;
        setOptions(options: RadioOption[], selected?: number): void;

        select(index: number): void;

        move(delta: number): boolean;

        handleAction(action: Action): boolean;

        tapRow(index: number): void;
        private defaultSelection;
        private buildRows;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `RadioGroupOptions` (interface)

    export interface RadioGroupOptions {
        options?: RadioOption[];

        selected?: number;

        size?: number;

        gap?: number;
    }

### `RadioOption` (interface)

    export interface RadioOption {

        text: string;

        disabled?: boolean;

        value?: unknown;
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

### `RebindScreenOptions` (interface)

    export interface RebindScreenOptions {
        width: number;
        height: number;

        actions: readonly Action[];

        label?: (action: Action) => string;
        rowHeight?: number;

        onConflict?: (key: string, action: Action, previousOwners: readonly Action[]) => boolean;
    }

### `RecolorProbe` (interface)

    export interface RecolorProbe {
        createCanvas?(width: number, height: number): RemapCanvas | null;
    }

### `recolorTexture` (function)

    export declare function recolorTexture(texture: Texture, mapping: PaletteMapping, probe?: RecolorProbe, mode?: PaletteRemapMode): Texture;

### `Rect` (interface)

    export interface Rect {
        x: number;
        y: number;
        width: number;
        height: number;
    }

### `Rectangle2D` (export)

    export { Rectangle2D }

### `rectOf` (function)

    export declare function rectOf(rectangle: Rectangle): Rect;

### `registerColorTransform` (function)

    export declare function registerColorTransform(): void;

### `relativeLuminance` (function)

    export declare function relativeLuminance(color: number): number;

### `RemapCanvas` (interface)

    export interface RemapCanvas {
        width: number;
        height: number;
        getContext(kind: '2d'): RemapCanvasContext | null;
    }

### `RemapCanvasContext` (interface)

    export interface RemapCanvasContext {
        drawImage(image: unknown, dx: number, dy: number): void;
        getImageData(sx: number, sy: number, sw: number, sh: number): {
            data: Uint8ClampedArray;
        };
        putImageData(imageData: {
            data: Uint8ClampedArray;
            width: number;
            height: number;
        }, dx: number, dy: number): void;
    }

### `remapPixels` (function)

    export declare function remapPixels(pixels: Uint8ClampedArray, mapping: PaletteMapping, mode?: PaletteRemapMode): Uint8ClampedArray;

### `RENDERING_DECISIONS` (const)

    export declare const RENDERING_DECISIONS: readonly RenderingDecision[];

### `RenderingDecision` (interface)

    export interface RenderingDecision {
        workload: GraphicsWorkload;
        preferred: string;
        fallback: string;
        reason: string;
    }

### `resolveAnchor` (function)

    export declare function resolveAnchor(spec: AnchorSpec, bounds: LayoutRect, size?: {
        width: number;

### `resolveTerrainGraphics` (function)

    export declare function resolveTerrainGraphics(width: number, height: number, rules: readonly TerrainRule[], flagsAt: TerrainFlagsAt, options?: ResolveTerrainGraphicsOptions): TerrainPlacement[];

### `ResolveTerrainGraphicsOptions` (interface)

    export interface ResolveTerrainGraphicsOptions {
        rotate?: TerrainRotate;

        random?: Generator;
    }

### `revealComplete` (function)

    export declare function revealComplete(state: RevealState): boolean;

### `RevealState` (interface)

    export interface RevealState {

        total: number;

        speed: number;

        revealed: number;
    }

### `RichLabel` (class)

    export declare class RichLabel extends HTMLText {
        private readonly opts;
        private readonly tags;
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

### `RichLabelOptions` (interface)

    export interface RichLabelOptions extends ThemedTextOptions {

        resolution?: number;

        tagStyles?: Record<string, HTMLTextStyleOptions>;
    }

### `RotatedPixels` (interface)

    export interface RotatedPixels {
        readonly data: Uint8ClampedArray;
        readonly width: number;
        readonly height: number;
    }

### `RotateMode` (type)

    export type RotateMode = 'nearest' | 'linear';

### `rotatePixels` (function)

    export declare function rotatePixels(pixels: Uint8ClampedArray, width: number, height: number, degrees: number, mode?: RotateMode): RotatedPixels;

### `RPGM_AUTOTILE_SLOT_BASES` (const)

    export declare const RPGM_AUTOTILE_SLOT_BASES: readonly [2048, 2816, 4352, 5888];

### `RPGM_AUTOTILE_SLOT_COUNTS` (const)

    export declare const RPGM_AUTOTILE_SLOT_COUNTS: readonly [768, 1536, 1536, 2304];

### `RPGM_FLOOR_AUTOTILE_TABLE` (const)

    export declare const RPGM_FLOOR_AUTOTILE_TABLE: RpgmAutotileShapeTable;

### `RPGM_WALL_AUTOTILE_TABLE` (const)

    export declare const RPGM_WALL_AUTOTILE_TABLE: RpgmAutotileShapeTable;

### `RpgmAutotileAtlas` (class)

    export declare class RpgmAutotileAtlas {
        private readonly cache;
        private readonly table;
        constructor(table: RpgmAutotileShapeTable);
        get(tileId: number, slot: RpgmAutotileSlot, shape: number): RpgmAutotileFrame;
        clear(): void;
    }

### `rpgmAutotileFrame` (function)

    export declare function rpgmAutotileFrame(tileId: number, slot: RpgmAutotileSlot, shape: number, table: RpgmAutotileShapeTable): RpgmAutotileFrame;

### `RpgmAutotileFrame` (interface)

    export interface RpgmAutotileFrame {
        tileId: number;
        slot: RpgmAutotileSlot;
        shape: number;
        destinationX: number;
        destinationY: number;
        quadrants: readonly [RpgmAutotileQuadrant, RpgmAutotileQuadrant, RpgmAutotileQuadrant, RpgmAutotileQuadrant];
    }

### `RpgmAutotileQuadrant` (interface)

    export interface RpgmAutotileQuadrant {
        sourceX: number;
        sourceY: number;
        destinationX: number;
        destinationY: number;
    }

### `RpgmAutotileShape` (type)

    export type RpgmAutotileShape = readonly [
        readonly [number, number],
        readonly [number, number],
        readonly [number, number],
        readonly [number, number]
    ];

### `RpgmAutotileShapeTable` (type)

    export type RpgmAutotileShapeTable = readonly RpgmAutotileShape[];

### `rpgmAutotileSlot` (function)

    export declare function rpgmAutotileSlot(tile: number): RpgmAutotileSlot | null;

### `RpgmAutotileSlot` (type)

    export type RpgmAutotileSlot = 0 | 1 | 2 | 3;

### `rpgmTableEdgeCells` (function)

    export declare function rpgmTableEdgeCells(map: RpgmTableEdgeMap): Int32Array;

### `RpgmTableEdgeMap` (interface)

    export interface RpgmTableEdgeMap {
        width: number;
        height: number;

        ground: ArrayLike<number>;

        objects: ArrayLike<number>;

        flags: {
            readonly [tile: number]: number | undefined;
        };
    }

### `Scene2D` (class)

    export declare abstract class Scene2D extends Scene {

        readonly stage: Container2D;
        protected teardown(): void;
    }

### `Scene2DClass` (type)

    export type Scene2DClass = new () => Scene2D;

### `ScreenEffectPhase` (type)

    export type ScreenEffectPhase = 'idle' | 'fadeOut' | 'fadeIn' | 'flash' | 'hold';

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

        private queue;
        constructor(options?: ScreenEffectsOptions);

        setViewport(width: number, height: number): void;
        private redraw;

        get isBusy(): boolean;

        get washAlpha(): number;

        fadeOut(duration: number, color?: number): void;

        fadeIn(duration: number, color?: number): void;

        flash(duration: number, color?: number, peak?: number): void;

        sequence(steps: readonly ScreenEffectStep[]): void;

        setTint(color: number, alpha: number): void;

        clear(): void;

        private beginStep;

        private advance;

        private begin;

        update(dt: number): boolean;
    }

### `ScreenEffectsOptions` (interface)

    export interface ScreenEffectsOptions {
        width?: number;
        height?: number;

        color?: number;
    }

### `ScreenEffectStep` (interface)

    export interface ScreenEffectStep {
        kind: 'fadeOut' | 'fadeIn' | 'flash' | 'hold';
        duration: number;

        color?: number;

        peak?: number;
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

### `ScriptOptions` (interface)

    export interface ScriptOptions {
        stage: DialogueStage;
        windows: WindowStack;

        backdrop: (name: string) => Texture;

        displayName?: (id: string) => string;

        boxWidth?: number;
        boxHeight?: number;

        speed?: number;

        mode?: 'adv' | 'nvl';
    }

### `ScriptState` (interface)

    export interface ScriptState {

        answers: Record<string, unknown>;
    }

### `ScrollBox` (class)

    export declare class ScrollBox extends Container {
        readonly onChange: Signal<number>;

        readonly content: Container<import("pixi.js").ContainerChild>;
        private maskShape;
        private track;
        private thumb;
        private width_;
        private height_;
        private contentHeight_;
        private offset_;
        private readonly themeListener;
        constructor(options: ScrollBoxOptions);
        get offset(): number;
        get contentHeight(): number;
        get viewportHeight(): number;

        get maxOffset(): number;
        get scrollable(): boolean;
        setContentHeight(height: number): void;
        resize(width: number, height: number): void;
        scrollBy(delta: number): void;
        scrollTo(offset: number): void;

        scrollIntoView(top: number, height: number): void;
        private setOffset;
        private readonly handleWheel;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `ScrollBoxOptions` (interface)

    export interface ScrollBoxOptions {
        width: number;
        height: number;

        contentHeight?: number;
        offset?: number;
    }

### `scrollOffset` (function)

    export declare function scrollOffset(offset: number, contentSize: number, viewportSize: number): number;

### `setTheme` (function)

    export declare function setTheme(next: Partial<Theme>): void;

### `SettingsCustomRow` (type)

    export type SettingsCustomRow = {
        kind: 'boolean';

### `SettingsScreen` (class)

    export declare class SettingsScreen extends Container {
        private readonly settings;
        private readonly width_;
        private readonly rowHeight;
        private readonly labels;
        private readonly zoomMin;
        private readonly zoomMax;
        private readonly zoomStep;
        private readonly customRows;
        private readonly actionsOption;
        private readonly onConflict;
        private readonly highlight;
        private readonly main;
        private readonly rebindLayer;
        private rows;
        private selected;
        private rebind;
        private readonly themeListener;
        constructor(options: SettingsScreenOptions);

        get selectedRow(): string;

        get isRebinding(): boolean;

        handleAction(action: Action): boolean;

        refresh(): void;
        private select;
        private drawHighlight;
        private buildMain;
        private addSliderRow;
        private readSlider;
        private addToggleRow;
        private readToggle;
        private addCustomRow;
        private addActionRow;
        private openRebind;
        private closeRebind;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `SettingsScreenOptions` (interface)

    export interface SettingsScreenOptions {
        settings: Settings;
        width?: number;
        rowHeight?: number;

        labels?: {
            music?: string;
            sfx?: string;
            muted?: string;
            zoom?: string;
            controls?: string;
            reset?: string;
            rebindHint?: string;
        };
        zoomMin?: number;
        zoomMax?: number;
        zoomStep?: number;

        custom?: readonly SettingsCustomRow[];

        actions?: readonly Action[];

        onConflict?: (key: string, action: Action, previousOwners: readonly Action[]) => boolean;
    }

### `ShadowLayerOptions` (interface)

    export interface ShadowLayerOptions {

        color?: number;

        alpha?: number;
    }

### `Shape2D` (class)

    export declare class Shape2D extends Graphics {
    }

### `sharpenText` (function)

    export declare function sharpenText(root: Container, devicePixelRatio: number): void;

### `ShowOptions` (interface)

    export interface ShowOptions {
        at?: SlotName | number;
        expression?: string;

        fade?: number;
    }

### `Skin` (interface)

    export interface Skin {
        background?: number;
        border?: number;
        borderWidth?: number;
        text?: number;
        padding?: number;
        texture?: Texture2D;

        borderInset?: number;
    }

### `SkinData` (type)

    export type SkinData = Skin | SkinStates;

### `Skins` (class)

    export declare class Skins {
        private readonly map;

        static readonly ANY = "*";
        define(widget: string, state: WidgetState, skin: Skin): void;
        has(widget: string): boolean;
        widgets(): string[];

        resolve(widget: string, state?: WidgetState): Skin;

        statesOf(widget: string): WidgetState[];

        static from(data: Readonly<Record<string, SkinData>>): Skins;
    }

### `SkinStates` (type)

    export type SkinStates = Partial<Record<WidgetState, Skin>>;

### `sliceSpans` (function)

    export declare function sliceSpans(spans: readonly MarkdownSpan[], count: number): MarkdownSpan[];

### `Slider` (class)

    export declare class Slider extends Container {
        readonly onChange: Signal<number>;
        private track;
        private fill;
        private knob;
        private width_;
        private height_;
        private knobSize;
        private min;
        private max;
        private step;
        private value_;
        private disabled_;
        private dragging;
        private readonly themeListener;
        constructor(options: SliderOptions);

        get value(): number;

        get fraction(): number;
        get disabled(): boolean;
        setDisabled(disabled: boolean): void;
        setValue(value: number): void;

        setFraction(fraction: number): void;
        resize(width: number, height: number): void;
        private get trackLength();
        private snap;
        private fractionAt;
        private readonly handleDown;
        private readonly handleMove;
        private readonly handleUp;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `sliderFraction` (function)

    export declare function sliderFraction(value: number, min?: number, max?: number): number;

### `SliderOptions` (interface)

    export interface SliderOptions {
        width: number;
        height?: number;
        min?: number;
        max?: number;

        step?: number;
        value?: number;

        knobSize?: number;
        disabled?: boolean;
    }

### `sliderValueAt` (function)

    export declare function sliderValueAt(fraction: number, min?: number, max?: number, step?: number): number;

### `SlotName` (type)

    export type SlotName = 'left' | 'center' | 'right' | 'farLeft' | 'farRight';

### `snapZoom` (function)

    export declare function snapZoom(zoom: number, tileSize: number, resolution?: number): number;

### `Spinner` (class)

    export declare class Spinner extends Container {
        readonly onChange: Signal<number>;
        private face;
        private width_;
        private height_;
        private min;
        private max;
        private step;
        private value_;
        private wrap;
        private disabled_;
        private readonly themeListener;
        constructor(options?: SpinnerOptions);
        get value(): number;
        get disabled(): boolean;
        setDisabled(disabled: boolean): void;
        setValue(value: number): void;
        increment(): void;
        decrement(): void;
        resize(width: number, height: number): void;
        private commit;
        private readonly handleTap;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `SpinnerOptions` (interface)

    export interface SpinnerOptions {
        width?: number;
        height?: number;
        min?: number;
        max?: number;
        step?: number;
        value?: number;

        wrap?: boolean;
        disabled?: boolean;
    }

### `spinValue` (function)

    export declare function spinValue(value: number, delta: number, min: number, max: number, step?: number, wrap?: boolean): number;

### `splitScreenHalves` (function)

    export declare function splitScreenHalves(width: number, height: number): [{
        x: number;

### `Sprite2D` (class)

    export declare class Sprite2D extends Sprite {
    }

### `SpriteAttachment` (class)

    export declare class SpriteAttachment {
        private readonly child;
        private readonly offsetX;
        private readonly offsetY;
        private readonly duration?;
        private elapsed;
        private expired;
        constructor(child: AttachmentPoint, options?: SpriteAttachmentOptions);
        get done(): boolean;

        follow(ownerX: number, ownerY: number): this;

        update(dt: number): boolean;
    }

### `SpriteAttachmentOptions` (interface)

    export interface SpriteAttachmentOptions {

        offsetX?: number;
        offsetY?: number;

        duration?: number;
    }

### `spriteColorMatrix` (function)

    export declare function spriteColorMatrix(sprite: Sprite, matrix: ColorMatrixFilter['matrix']): void;

### `SpriteGroup` (class)

    export declare class SpriteGroup {
        private members;

        get size(): number;

        add(member: SpriteGroupMember): this;

        remove(member: SpriteGroupMember): boolean;

        clear(): void;

        update(camera: Camera, dt: number, margin?: number): void;
    }

### `SpriteGroupMember` (interface)

    export interface SpriteGroupMember {
        x: number;
        y: number;
        update(dt: number): void;
    }

### `SpriteMotion` (class)

    export declare class SpriteMotion {
        private readonly target;
        private readonly tweener;
        private readonly ownsTweener;
        private readonly intent;
        private readonly rest;
        private readonly contributions;
        private readonly loops;
        private nextId;
        private flipX;
        private flipY;
        private destroyed;
        constructor(target: MotionTarget, options?: SpriteMotionOptions);

        squash(options: {
            amount: number;
            duration: number;
        }): MotionHandle;

        hop(options: {
            height: number;
            duration: number;
        }): MotionHandle;

        bob(options: {
            amplitude: number;
            period: number;
            cycles?: number;
        }): MotionHandle;

        wobble(options: {
            angle: number;
            duration: number;
        }): MotionHandle;

        spin(options: {
            turns: number;
            duration: number;
        }): MotionHandle;

        shear(options: {
            amount: number;
            duration: number;
        }): MotionHandle;

        flip(axis: 'x' | 'y', mirrored?: boolean): boolean;

        update(dt: number): void;

        get isBusy(): boolean;

        destroy(): void;
        private run;
        private loop;
        private write;
    }

### `SpriteMotionOptions` (interface)

    export interface SpriteMotionOptions {

        tweener?: Tweener;

        intent?: MotionIntent;
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

        static grid(path: string, frameWidth?: number, frameHeight?: number): SpriteSheet;
        static fromTexture(texture: Texture2D, frameWidth?: number, frameHeight?: number): SpriteSheet;
        get count(): number;

        name(name: string, index: number): this;

        nameAll(names: Readonly<Record<string, number>>): this;
        indexOf(name: string): number;
        get(frame: number | string): Texture2D;

        rect(index: number, x: number, y: number, width: number, height: number): this;

        region(frame: number | string): TextureRegion;

        range(from: number, to: number): Texture2D[];

        pick(...frames: Array<number | string>): Texture2D[];
    }

### `squareRotate` (function)

    export declare function squareRotate(dx: number, dy: number, rotationIndex: number, rotations: number): {
        dx: number;

### `StageChoice` (type)

    export type StageChoice = Choice & {

        goto?: string;

### `StageCommand` (type)

    export type StageCommand = {
        backdrop: string;

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

### `StatRow` (interface)

    export interface StatRow {
        label: string;
        value: string;
    }

### `StatsScreen` (class)

    export declare class StatsScreen extends Container {
        private text;
        constructor(options: StatsScreenOptions);

        setStats(stats: readonly StatRow[], width?: number): void;
        private static format;
    }

### `StatsScreenOptions` (interface)

    export interface StatsScreenOptions {
        width: number;
        stats: readonly StatRow[];
    }

### `StatusVisuals` (class)

    export declare class StatusVisuals {
        private target;
        private styles;
        private active;
        private elapsed;
        private flashColor;
        private flashStrength;
        private flashDuration;
        private flashRemaining;
        constructor(target: TintTarget, options: StatusVisualsOptions);

        set(kind: string, active: boolean): void;
        has(kind: string): boolean;

        flash(color: number, strength: number, duration: number): void;

        update(dt: number): void;
    }

### `StatusVisualsOptions` (interface)

    export interface StatusVisualsOptions {

        styles: Record<string, StatusVisualStyle>;
    }

### `StatusVisualStyle` (interface)

    export interface StatusVisualStyle {

        color: number;

        strength?: number;

        pulseRate?: number;
    }

### `StoryBeat` (interface)

    export interface StoryBeat {
        text: string;
        title?: string;

        image?: string;

        music?: string;
    }

### `StoryScreen` (class)

    export declare class StoryScreen extends Container {
        readonly sequence: StorySequence;
        private readonly backdrop;
        private readonly titleLabel;
        private readonly textLabel;
        private readonly textureFor;
        private readonly playMusic;
        private width_;
        private height_;
        constructor(options: StoryScreenOptions);

        get current(): StoryBeat | null;

        advance(): boolean;

        skip(): void;
        resize(width: number, height: number): void;
        private readonly handleAdvance;
        private readonly handleBeat;
        private applyBeat;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `StoryScreenOptions` (interface)

    export interface StoryScreenOptions {
        sequence: StorySequence;
        width: number;
        height: number;

        textureFor?: (path: string) => Texture | null;

        playMusic?: (track: string | null) => void;
    }

### `StoryScript` (type)

    export type StoryScript = Record<string, readonly StageCommand[]>;

### `StorySequence` (class)

    export declare class StorySequence {
        readonly onChange: Signal<StoryBeat>;
        readonly onMusic: Signal<string | null>;
        private readonly beats;
        private index;
        constructor(beats: readonly StoryBeat[]);
        get length(): number;

        get position(): number;

        get current(): StoryBeat | null;

        get done(): boolean;

        get music(): string | null;

        goTo(index: number): void;

        advance(): boolean;

        back(): boolean;

        skip(): void;
        restart(): void;
        private report;
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

### `TabbedListOptions` (interface)

    export interface TabbedListOptions<T> {

        tabs: readonly ListTab[];

        rowsFor: (tabId: string) => readonly T[];

        pageSize?: number;

        label?: (row: T) => string;

        filter?: (row: T, query: string) => boolean;

        disabled?: (row: T) => boolean;
    }

### `TableColumn` (interface)

    export interface TableColumn<T> {

        key: string;

        label?: string;
        width?: number;
        align?: 'left' | 'right' | 'center';

        compare?: (a: T, b: T) => number;
    }

### `takeLastEntries` (function)

    export declare function takeLastEntries<T>(entries: readonly T[], count: number): T[];

### `TerrainCondition` (interface)

    export interface TerrainCondition {
        readonly dx: number;
        readonly dy: number;
        readonly hasAll?: readonly string[];
        readonly hasAny?: readonly string[];
        readonly hasNone?: readonly string[];
    }

### `TerrainFlagsAt` (type)

    export type TerrainFlagsAt = (x: number, y: number) => ReadonlySet<string> | undefined;

### `TerrainGraphicsLayer` (class)

    export declare class TerrainGraphicsLayer extends Node2D {
        private placements;
        private readonly project;
        private readonly resolveImage;
        constructor(options: TerrainGraphicsLayerOptions);

        setPlacements(placements: readonly TerrainPlacement[]): void;
        private rebuild;
    }

### `TerrainGraphicsLayerOptions` (interface)

    export interface TerrainGraphicsLayerOptions {

        readonly placements: readonly TerrainPlacement[];

        readonly project: (x: number, y: number, dx: number, dy: number) => {
            x: number;
            y: number;
        };

        readonly resolveImage?: (path: string) => Texture2D;
    }

### `TerrainImage` (interface)

    export interface TerrainImage {
        readonly image: string;

        readonly dx?: number;
        readonly dy?: number;

        readonly layer?: number;
    }

### `TerrainPlacement` (interface)

    export interface TerrainPlacement {
        readonly x: number;
        readonly y: number;
        readonly ruleId: string;
        readonly image: string;
        readonly dx: number;
        readonly dy: number;
        readonly layer: number;
    }

### `TerrainRotate` (type)

    export type TerrainRotate = (dx: number, dy: number, rotationIndex: number, rotations: number) => {
        dx: number;

### `TerrainRule` (interface)

    export interface TerrainRule {
        readonly id: string;
        readonly conditions: readonly TerrainCondition[];
        readonly images: readonly TerrainImage[];

        readonly probability?: number;

        readonly rotations?: number;
    }

### `Text2D` (class)

    export declare class Text2D extends Text {
    }

### `TextModel` (class)

    export declare class TextModel {
        private text;
        private caretIndex;
        private anchor;
        private readonly maxLength?;
        private readonly mask;
        private readonly maskCharacter;
        private readonly multiline;
        private goalColumn;
        constructor(options?: TextModelOptions);
        get value(): string;

        get maskedValue(): string;
        get length(): number;
        get caret(): number;
        get selectionStart(): number;
        get selectionEnd(): number;
        get hasSelection(): boolean;
        get selectedText(): string;

        setValue(value: string): void;
        setCaret(index: number, extend?: boolean): void;

        insert(text: string): void;

        backspace(): void;

        deleteForward(): void;

        moveCaret(delta: number, extend?: boolean): void;
        moveToStart(extend?: boolean): void;
        moveToEnd(extend?: boolean): void;
        selectAll(): void;
        clearSelection(): void;

        replaceSelection(text: string): void;

        private shape;

        get lineCount(): number;

        get caretLine(): number;

        lineRange(line: number): readonly [number, number];

        moveCaretLine(delta: number, extend?: boolean): void;
        private limit;
    }

### `TextModelOptions` (interface)

    export interface TextModelOptions {
        value?: string;

        maxLength?: number;

        mask?: boolean;

        maskCharacter?: string;

        multiline?: boolean;
    }

### `TextPrompt` (class)

    export declare class TextPrompt extends Window {
        private readonly model;
        private readonly validate?;
        private readonly onConfirm;
        private readonly onCancel?;
        private readonly announce;
        private readonly announcer;
        private preview;
        private promptError;
        private readonly keyboard;
        private messageLabel;
        private valueLabel;
        private previewLabel;
        private errorLabel;
        private caretBar;
        private readonly measurer;
        private readonly lineHeight;
        private readonly valueY;
        private canMeasureCaret;
        private blinkOn;
        private blinkElapsed;
        private readonly promptThemeListener;
        private readonly textListener;
        private readonly compositionListener;
        constructor(options: TextPromptOptions);

        get value(): string;

        get caretIndex(): number;

        get error(): string | null;
        handleAction(action: Action): boolean;
        update(dt: number): void;
        destroy(options?: Parameters<Window['destroy']>[0]): void;

        private edit;
        private confirm;
        private restylePrompt;
        private render;
    }

### `TextPromptOptions` (interface)

    export interface TextPromptOptions {
        width: number;
        height: number;

        title?: string;

        message?: string;

        initialValue?: string;

        maxLength?: number;

        keyboard?: KeyboardLayout;

        validate?: (value: string) => string | null;

        onConfirm: (value: string) => void;

        onCancel?: () => void;

        dims?: boolean;

        blocker?: boolean;

        anchor?: 'center' | 'bottom' | 'top';

        announce?: boolean;

        announcer?: Pick<ScreenReader, 'announce'>;
    }

### `Texture2D` (export)

    export { Texture2D }

### `TextureRegion` (interface)

    export interface TextureRegion {
        texture: Texture;
        frame: Rect;
    }

### `theme` (function)

    export declare function theme(): Theme;

### `Theme` (interface)

    export interface Theme {

        panel?: Texture2D;

        panelBorder: number;

        padding: number;

        spacing: number;
        font: {
            family: string;
            size: number;

            lineHeight: number;
        };
        color: {
            text: number;
            textDim: number;
            textHighlight: number;

            panelFill: number;
            panelBorder: number;
            selection: number;

            overlay: number;
        };

        overlayAlpha: number;

        direction: Direction;
    }

### `themeChanged` (const)

    export declare const themeChanged: Signal<Theme>;

### `TiledLayer` (interface)

    export interface TiledLayer {
        type: string;
        name: string;
        data?: number[];
        encoding?: string;
        objects?: TiledObject[];
    }

### `TiledMapData` (interface)

    export interface TiledMapData {
        width: number;
        height: number;
        tilewidth: number;
        tileheight: number;
        orientation?: string;

        staggeraxis?: string;
        staggerindex?: string;
        tilesets: Array<{
            firstgid: number;
            source?: string;
        }>;
        layers: TiledLayer[];
    }

### `TiledObject` (interface)

    export interface TiledObject {
        id: number;
        name?: string;
        type?: string;
        x: number;
        y: number;
        gid?: number;
        properties?: Array<{
            name: string;
            value: unknown;
        }>;
    }

### `TiledSprite` (class)

    export declare class TiledSprite extends TilingSprite {
    }

### `TiledTilesetData` (interface)

    export interface TiledTilesetData {
        tilewidth: number;
        tileheight: number;
        image: string;
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
        private beginLayer;

        addAutotileLayer(name: string, cells: ArrayLike<number>, set: AutotileSet | readonly AutotileSet[]): this;

        setAutotileFrame(layer: string | number, frame: number): void;

        addShadowLayer(name: string, bits: ArrayLike<number>, options?: ShadowLayerOptions): this;
        private buildShadowSprites;
        private setShadowCell;

        getAutotileFrame(layer: string | number): number;
        private resolveAutotileSet;
        private resolveRpgmSet;
        private resolveXpSet;
        private claimAutotileSets;
        private autotilePieces;
        private makeAutotileSprites;
        private setAutotileCell;
        private eachCellSprite;
        private firstCellSprite;
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

        stampRect(layer: string | number, x: number, y: number, width: number, height: number, frames: ArrayLike<number>): void;

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

### `TileMapOptions` (interface)

    export interface TileMapOptions {

        width: number;
        height: number;

        sheet: SpriteSheet | readonly SpriteSheet[];

        tileWidth?: number;
        tileHeight?: number;

        shape?: 'square' | 'hex' | 'isometric' | 'staggered';

        chunkSize?: number;

        heightStep?: number;
    }

### `TilesetSheet` (interface)

    export interface TilesetSheet {
        firstgid: number;
        sheet: SpriteSheet;
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

### `TintTarget` (interface)

    export interface TintTarget {

        colorAdd: number;
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

### `ToastOptions` (interface)

    export interface ToastOptions {

        fadeIn?: number;

        hold?: number;

        fadeOut?: number;

        scaleFrom?: number;
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

### `TooltipOptions` (interface)

    export interface TooltipOptions {

        delay?: number;

        maxWidth?: number;

        offset?: {
            x: number;
            y: number;
        };

        margin?: number;
    }

### `TreeNode` (interface)

    export interface TreeNode<T = unknown> {

        id: string;
        label: string;
        children?: readonly TreeNode<T>[];
        disabled?: boolean;
        data?: T;
    }

### `TreeRow` (interface)

    export interface TreeRow<T> {
        node: TreeNode<T>;
        depth: number;
        expanded: boolean;
        hasChildren: boolean;
    }

### `TreeView` (class)

    export declare class TreeView<T = unknown> {
        readonly onChange: Signal<void>;
        private roots_;
        private expanded;
        private current;
        private readonly disabledOf;
        constructor(options: TreeViewOptions<T>);
        get roots(): readonly TreeNode<T>[];

        get rows(): readonly TreeRow<T>[];
        get selectedIndex(): number;
        get selected(): TreeNode<T> | null;
        isExpanded(id: string): boolean;
        expand(id: string): void;
        collapse(id: string): void;
        toggle(id: string): void;
        expandAll(): void;
        collapseAll(): void;
        select(index: number): void;

        move(delta: number): void;
        private firstEnabled;
    }

### `TreeViewOptions` (interface)

    export interface TreeViewOptions<T> {
        roots: readonly TreeNode<T>[];

        expanded?: readonly string[];

        disabled?: (node: TreeNode<T>) => boolean;
    }

### `TwineStory` (interface)

    export interface TwineStory {
        story: StoryScript;

        start: string;

        title?: string;
    }

### `UPPERCASE_KEYBOARD` (const)

    export declare const UPPERCASE_KEYBOARD: KeyboardLayout;

### `VerticalLabel` (class)

    export declare class VerticalLabel extends Container {
        private readonly opts;
        private readonly themeListener;
        constructor(options: VerticalLabelOptions);

        private build;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `VerticalLabelOptions` (interface)

    export interface VerticalLabelOptions {
        text: string;
        color?: number;
        size?: number;
        columnHeight: number;
        rotate?: RegExp;
    }

### `VerticalLayoutOptions` (interface)

    export interface VerticalLayoutOptions {
        lineHeight: number;

        columnHeight: number;

        rotate?: RegExp;
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

### `ViewportOptions` (interface)

    export interface ViewportOptions extends CameraOptions {

        x: number;
        y: number;
        width: number;
        height: number;
    }

### `WebGpuDetection` (interface)

    export interface WebGpuDetection {
        webgpu: boolean;
        wgsl: boolean;
    }

### `WidgetState` (type)

    export type WidgetState = 'idle' | 'hover' | 'pressed' | 'disabled' | 'selected' | 'focused';

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

        private blocker;
        private readonly themeListener;
        private isClosed;
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

        get closed(): boolean;

        update(_dt: number): void;

        close(): void;

        place(viewportWidth: number, viewportHeight: number): void;

        private fitBlocker;
        private readonly onBlockerDown;

        handleOutsideClick(x: number, y: number): boolean;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `WindowOptions` (interface)

    export interface WindowOptions {
        width: number;
        height: number;
        title?: string;

        modal?: boolean;

        closable?: boolean;

        dims?: boolean;

        anchor?: 'center' | 'bottom' | 'top';

        blocker?: boolean;
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

        handleAction(action: Action): boolean;

        get blocksWorld(): boolean;
        update(dt: number): void;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `withTextureCanvas` (function)

    export declare function withTextureCanvas(texture: Texture, probe: RecolorProbe, paint: (context: RemapCanvasContext, width: number, height: number) => void): Texture;

### `XP_AUTOTILE_PATTERNS` (const)

    export declare const XP_AUTOTILE_PATTERNS: readonly XpAutotilePattern[];

### `XP_NEIGHBORS_TO_PATTERN` (const)

    export declare const XP_NEIGHBORS_TO_PATTERN: readonly number[];

### `xpAutotilePattern` (function)

    export declare function xpAutotilePattern(sameTerrain: (dx: number, dy: number) => boolean): number;

### `XpAutotilePattern` (type)

    export type XpAutotilePattern = readonly [number, number, number, number];

### `xpAutotileRef` (function)

    export declare function xpAutotileRef(tile: number): XpAutotileRef | null;

### `XpAutotileRef` (interface)

    export interface XpAutotileRef {

        index: number;

        pattern: number;
    }

## `./two-d/pixi-interop`

### `Container` (re-export)

    export { Container } from 'pixi.js'

### `FillGradient` (re-export)

    export { FillGradient } from 'pixi.js'

### `Graphics` (re-export)

    export { Graphics } from 'pixi.js'

### `NineSliceSpritePipe` (re-export)

    export { NineSliceSpritePipe } from 'pixi.js'

### `Rectangle` (re-export)

    export { Rectangle } from 'pixi.js'

### `registerBuiltinPipes` (function)

    export declare function registerBuiltinPipes(): void;

### `Sprite` (re-export)

    export { Sprite } from 'pixi.js'

### `SpriteOptions` (type)

    export type { SpriteOptions } from 'pixi.js'

### `Text` (re-export)

    export { Text } from 'pixi.js'

### `Texture` (re-export)

    export { Texture } from 'pixi.js'

### `TilingSprite` (re-export)

    export { TilingSprite } from 'pixi.js'

### `TilingSpritePipe` (re-export)

    export { TilingSpritePipe } from 'pixi.js'

## `./two-d/render`

### `ActorAnimationState` (type)

    export type ActorAnimationState = 'idle' | 'move' | 'action';

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

### `ActorAnimatorOptions` (interface)

    export interface ActorAnimatorOptions {

        animationName: (state: ActorAnimationState, variant: string) => string;

        variant?: string;
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

### `AnimationFrame` (interface)

    export interface AnimationFrame {
        readonly texture: Texture2D;

        readonly duration?: number;

        readonly offsetX?: number;
        readonly offsetY?: number;
    }

### `AnimationFrameInput` (type)

    export type AnimationFrameInput = Texture2D | AnimationFrame;

### `AnimationOptions` (interface)

    export interface AnimationOptions {

        fps?: number;

        loop?: boolean;

        startTime?: number;
    }

### `applyAllImageModifiers` (function)

    export declare function applyAllImageModifiers(sprite: Sprite, parsed: ParsedImagePath, probe?: ImageTextureProbe, scale?: number): void;

### `applyImageModifiers` (function)

    export declare function applyImageModifiers(sprite: Sprite, parsed: ParsedImagePath, scale?: number): void;

### `applyTextureModifiers` (function)

    export declare function applyTextureModifiers(texture: Texture, parsed: ParsedImagePath, probe?: ImageTextureProbe): Texture;

### `assertAutotileLayout` (function)

    export declare function assertAutotileLayout(layout: AutotileLayout): void;

### `AttachmentPoint` (interface)

    export interface AttachmentPoint {
        x: number;
        y: number;
    }

### `AutotileCell` (type)

    export type AutotileCell = number;

### `AutotileCellPart` (interface)

    export interface AutotileCellPart {
        sourceX: number;
        sourceY: number;
        sourceWidth: number;
        sourceHeight: number;
        destX: number;
        destY: number;
        destWidth: number;
        destHeight: number;
    }

### `autotileCellParts` (function)

    export declare function autotileCellParts(layout: AutotileLayout, tile: number, frame: number): AutotileCellPart[] | null;

### `AutotileFormat` (type)

    export type AutotileFormat = 'rpgm-mv' | 'rpgm-xp';

### `autotileFrames` (function)

    export declare function autotileFrames(width: number, height: number, sameTerrain: (x: number, y: number) => boolean, frames: readonly number[]): Int32Array;

### `AutotileLayout` (type)

    export type AutotileLayout = {
        format: 'rpgm-mv';

### `AutotileSet` (interface)

    export interface AutotileSet {

        sheet: SpriteSheet;

        format?: AutotileFormat;

        slot?: RpgmAutotileSlot;

        mode?: 'floor' | 'wall' | 'mixed';

        table?: RpgmAutotileShapeTable;

        index?: number;

        frames?: number;

        tableEdge?: boolean;

        animation?: ReadonlyArray<ReadonlyArray<number>>;

        animationFrame?: number;
    }

### `Beam` (class)

    export declare class Beam extends Container {
        private from;
        private to;
        private readonly colour;
        private readonly texture?;
        private readonly stretch;
        private readonly textureAnchor;
        private readonly thickness;
        private readonly thin;
        private readonly duration;
        private readonly body;
        private elapsed;
        private expired;

        private lifeFraction;
        constructor(from: BeamPoint, to: BeamPoint, options?: BeamOptions);

        get progress(): number;
        get done(): boolean;

        retarget(from?: BeamPoint, to?: BeamPoint): void;

        update(dt: number): boolean;
        destroy(): void;
        private redraw;
    }

### `BeamOptions` (interface)

    export interface BeamOptions {

        colour?: number;

        texture?: Texture2D | BeamTextureOptions;

        duration?: number;

        width?: number;

        thin?: boolean;

        additive?: boolean;
    }

### `BeamPoint` (interface)

    export interface BeamPoint {
        x: number;
        y: number;
    }

### `Beams` (class)

    export declare class Beams extends Container {
        private readonly live;

        add(from: BeamPoint, to: BeamPoint, options?: BeamOptions): Beam;

        update(dt: number): void;

        get count(): number;

        clear(): void;
        destroy(): void;
    }

### `BeamTextureOptions` (interface)

    export interface BeamTextureOptions {

        source: Texture2D;

        stretch?: boolean;

        anchor?: number;
    }

### `blendMatrix` (function)

    export declare function blendMatrix(color: number, ratio: number): ColorMatrixFilter['matrix'];

### `blendPixels` (function)

    export declare function blendPixels(pixels: Uint8ClampedArray, color: number, ratio: number): Uint8ClampedArray;

### `BLOB_SHAPES` (const)

    export declare const BLOB_SHAPES: readonly NeighborMask[];

### `blobIndex` (function)

    export declare function blobIndex(neighbors: NeighborMask): number;

### `Camera` (class)

    export declare class Camera {

        readonly world: Container<import("pixi.js").ContainerChild>;

        x: number;
        y: number;
        private requestedZoom;
        private readonly resolution;
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

        readonly stepsPerTurn: number;
        private step;
        private _angle;
        private targetAngle;
        private angleIntensity;
        constructor(options?: CameraOptions);

        get rotationSteps(): number;

        get rotation(): number;

        get uprightRotation(): number;

        setRotationStep(step: number): void;

        rotate(delta?: number): void;

        rotateTo(angle: number): void;

        animateRotationTo(angle: number, intensity?: number): void;

        private get spin();

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

        shakeScreen(intensity: number, duration?: number): void;
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
        private snapToDevice;
    }

### `CameraOptions` (interface)

    export interface CameraOptions {

        zoom?: number;

        grid?: 'square' | 'hex';

        deadzone?: number;

        pixelPerfectTileSize?: number;

        resolution?: () => number;
    }

### `channelScaleMatrix` (function)

    export declare function channelScaleMatrix(scale: {
        red?: number;

### `ChannelSource` (type)

    export type ChannelSource = 'R' | 'G' | 'B' | 'A' | '0' | '1';

### `channelSwapMatrix` (function)

    export declare function channelSwapMatrix(sources: readonly ChannelSource[]): ColorMatrixFilter['matrix'];

### `COLOR_BLINDNESS_MATRICES` (const)

    export declare const COLOR_BLINDNESS_MATRICES: Record<ColorBlindnessType, ColorMatrix>;

### `ColorBlindnessType` (type)

    export type ColorBlindnessType = 'protanopia' | 'deuteranopia' | 'tritanopia';

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

### `createLayers` (function)

    export declare function createLayers(parent: Container, names: readonly string[]): Record<string, Node2D>;

### `croppedTexture` (function)

    export declare function croppedTexture(texture: Texture, parsed: ParsedImagePath): Texture;

### `detectWebGpu` (function)

    export declare function detectWebGpu(): Promise<WebGpuDetection>;

### `EMPTY` (const)

    export declare const EMPTY = -1;

### `FlightHandle` (interface)

    export interface FlightHandle {

        readonly projectile: Projectile;

        readonly done: boolean;

        cancel(): void;
    }

### `FlightOptions` (interface)

    export interface FlightOptions extends ProjectileOptions {

        tint?: number;

        spin?: number;

        spinDegrees?: number;

        fadeIn?: number | boolean | 'progress';

        onArrive?: () => void;
    }

### `Flights` (class)

    export declare class Flights extends Container {
        private readonly live;
        add(sprite: FlightSprite, from: ProjectilePoint, to: ProjectilePoint, options?: FlightOptions): FlightHandle;
        add(texture: Texture2D, from: ProjectilePoint, to: ProjectilePoint, options?: FlightOptions): FlightHandle;

        update(dt: number): void;

        get count(): number;

        clear(): void;
        destroy(): void;
        private release;
    }

### `FlightSprite` (interface)

    export interface FlightSprite {
        x: number;
        y: number;
        rotation?: number;
        alpha?: number;
        tint?: number;
    }

### `FogCell` (type)

    export type FogCell = number | ArrayLike<number>;

### `FogColor` (type)

    export type FogColor = readonly [number, number, number, number];

### `FogLayer` (class)

    export declare class FogLayer extends Sprite {
        private readonly context;
        private readonly image;
        private readonly columns;
        private readonly rows;
        private readonly cellResolution;
        private palette;
        constructor(options: FogLayerOptions);

        setPalette(palette: readonly FogColor[]): void;
        refresh(state: (x: number, y: number) => FogCell): void;

        destroy(): void;
    }

### `FogLayerOptions` (interface)

    export interface FogLayerOptions {

        width: number;
        height: number;

        tileSize?: number;

        resolution?: number;

        palette: readonly FogColor[];
    }

### `FollowOptions` (interface)

    export interface FollowOptions {

        offsetX?: number;
        offsetY?: number;

        enabled?: () => boolean;

        visible?: () => boolean;
    }

### `FollowTarget` (type)

    export type FollowTarget = Container | (() => {
        x: number;

### `Gradient` (const)

    export declare const Gradient: typeof FillGradient;

### `GraphicsCapabilities` (interface)

    export interface GraphicsCapabilities {
        webgl1: boolean;
        webgl2: boolean;
        webgpu: boolean;

        wgsl: boolean;
    }

### `GraphicsProbe` (interface)

    export interface GraphicsProbe {
        createCanvas?(): {
            getContext(kind: string): unknown;
        } | null;
        webgpu?: boolean;

        wgsl?: boolean;
    }

### `GraphicsWorkload` (type)

    export type GraphicsWorkload = 'sprites' | 'ui' | 'custom-shaders' | 'particles' | 'instanced-terrain' | 'voxels' | 'animated-models' | 'large-3d-worlds';

### `Halo` (class)

    export declare class Halo extends AnimatedSprite {
        private readonly offsetX;
        private readonly offsetY;
        constructor(options: HaloOptions);

        follow(x: number, y: number): this;
    }

### `HALO_ANIMATION` (const)

    export declare const HALO_ANIMATION = "halo";

### `HaloOptions` (interface)

    export interface HaloOptions {

        readonly frames: readonly AnimationFrameInput[];

        readonly animation?: AnimationOptions;

        readonly offsetX?: number;
        readonly offsetY?: number;

        readonly blendMode?: 'add' | 'normal' | 'multiply' | 'screen';
    }

### `HasColorAdd` (interface)

    export interface HasColorAdd {

        colorAdd?: number;
    }

### `hexRotate` (function)

    export declare function hexRotate(dx: number, dy: number, rotationIndex: number, rotations: number): {
        dx: number;

### `imageModifier` (function)

    export declare function imageModifier(path: ParsedImagePath, name: string): ImageModifier | undefined;

### `ImageModifier` (interface)

    export interface ImageModifier {
        readonly name: string;
        readonly args: readonly string[];
    }

### `ImageTextureProbe` (interface)

    export interface ImageTextureProbe extends RecolorProbe {
        resolveTexture?(pathWithModifiers: string): Texture2D | undefined;
        resolveColor?(name: string): number | undefined;
    }

### `inspectGraphicsCapabilities` (function)

    export declare function inspectGraphicsCapabilities(probe?: GraphicsProbe): GraphicsCapabilities;

### `isOnScreen` (function)

    export declare function isOnScreen(camera: Camera, x: number, y: number, margin?: number): boolean;

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

### `LightningArc` (class)

    export declare class LightningArc {
        private from;
        private to;
        private readonly segments;
        private readonly jitter;
        private readonly flickerInterval?;
        private readonly random;
        private readonly duration?;
        private elapsed;
        private sinceFlicker;
        private expired;
        private current;
        constructor(from: LightningArcPoint, to: LightningArcPoint, options?: LightningArcOptions);

        get points(): readonly LightningArcPoint[];
        get done(): boolean;

        retarget(from?: LightningArcPoint, to?: LightningArcPoint): void;

        update(dt: number): boolean;
        private reroll;
    }

### `LightningArcOptions` (interface)

    export interface LightningArcOptions {

        duration?: number;

        segments?: number;

        jitter?: number;

        flickerInterval?: number;

        random?: () => number;
    }

### `LightningArcPoint` (interface)

    export interface LightningArcPoint {
        x: number;
        y: number;
    }

### `LiquidLayer` (class)

    export declare class LiquidLayer extends Container {
        private readonly cells;
        private readonly ripples;
        private readonly columns;
        private readonly tileSize;
        private readonly speed;
        private readonly rippleTexture?;
        private readonly rippleDuration;
        private offset;
        constructor(options: LiquidLayerOptions);

        setCellColor(x: number, y: number, tint: number): void;

        ripple(x: number, y: number): void;

        get rippleCount(): number;
        update(dt: number): void;
    }

### `LiquidLayerOptions` (interface)

    export interface LiquidLayerOptions {

        texture: Texture2D;

        width: number;
        height: number;

        tileSize?: number;

        isLiquid: (x: number, y: number) => boolean;

        speed?: number;

        rippleTexture?: Texture2D;

        rippleDuration?: number;
    }

### `LoadedTiledMap` (interface)

    export interface LoadedTiledMap {
        map: TileMap;

        objects: Array<TiledObject & {
            tileX: number;
            tileY: number;
        }>;
    }

### `loadTiledMap` (function)

    export declare function loadTiledMap(data: TiledMapData, sheets: SpriteSheet | TilesetSheet[]): LoadedTiledMap;

### `maskPixels` (function)

    export declare function maskPixels(base: Uint8ClampedArray, baseWidth: number, baseHeight: number, mask: Uint8ClampedArray, maskWidth: number, maskHeight: number, offsetX: number, offsetY: number): Uint8ClampedArray;

### `matchTerrainRule` (function)

    export declare function matchTerrainRule(rule: TerrainRule, x: number, y: number, flagsAt: TerrainFlagsAt, rotate?: TerrainRotate, rotationIndex?: number): boolean;

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

### `MinimapMarker` (interface)

    export interface MinimapMarker {
        x: number;
        y: number;
        facing?: number;
        color?: number;
    }

### `MinimapOptions` (interface)

    export interface MinimapOptions {

        widthInCells: number;
        heightInCells: number;

        cellSize?: number;

        shape?: 'square' | 'hex';
    }

### `MotionHandle` (interface)

    export interface MotionHandle {
        readonly done: Promise<void>;
        cancel(): void;
    }

### `MotionTarget` (interface)

    export interface MotionTarget {
        x: number;
        y: number;
        rotation: number;
        scale: {
            x: number;
            y: number;
        };
        skew: {
            x: number;
            y: number;
        };
    }

### `NeighborMask` (interface)

    export interface NeighborMask {
        n: boolean;
        e: boolean;
        s: boolean;
        w: boolean;
        ne: boolean;
        se: boolean;
        sw: boolean;
        nw: boolean;
    }

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

### `paintFogPixels` (function)

    export declare function paintFogPixels(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number, resolution: number, state: (x: number, y: number) => FogCell, palette: readonly FogColor[]): void;

### `PaletteMapping` (interface)

    export interface PaletteMapping {
        readonly from: readonly number[];
        readonly to: readonly number[];
    }

### `PaletteRange` (interface)

    export interface PaletteRange {
        readonly min: number;
        readonly mid: number;
        readonly max: number;
    }

### `paletteRangeMapping` (function)

    export declare function paletteRangeMapping(reference: readonly number[], range: PaletteRange): PaletteMapping;

### `PaletteRemapMode` (type)

    export type PaletteRemapMode = 'exact' | 'nearest';

### `parseColorPairs` (function)

    export declare function parseColorPairs(args: readonly string[], resolve?: (name: string) => number | undefined): PaletteMapping;

### `ParsedImagePath` (interface)

    export interface ParsedImagePath {
        readonly path: string;
        readonly modifiers: readonly ImageModifier[];
    }

### `parseImagePath` (function)

    export declare function parseImagePath(value: string): ParsedImagePath;

### `parsePaletteLists` (function)

    export declare function parsePaletteLists(args: readonly string[], resolve?: (name: string) => number | undefined): PaletteMapping;

### `parseRotateMode` (function)

    export declare function parseRotateMode(argument: string | undefined): RotateMode;

### `Particle` (interface)

    export interface Particle {
        x: number;
        y: number;
        vx: number;
        vy: number;

        age: number;

        life: number;
        rotation: number;
        spin: number;

        scale: number;
        alpha: number;

        tint: number;

        frame: number;

        active: boolean;
    }

### `ParticleCurve` (type)

    export type ParticleCurve = (t: number) => number;

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
        private readonly scaleOf;
        private readonly alphaOf;
        private readonly flicker;
        private readonly spin;
        private readonly tintRange;

        private readonly frames?;

        private readonly spawnArea;
        private emitting;
        private followTarget;
        private followOffsetX;
        private followOffsetY;
        private followEnabled;
        private followVisible;

        private poolCursor;

        private debt;
        constructor(options?: ParticleEmitterOptions);

        start(): void;

        stop(): void;

        attach(target: FollowTarget, options?: FollowOptions): void;

        detach(): void;

        get attachedTo(): FollowTarget | null;
        private syncFollow;
        private followEmissionAllowed;
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

### `ParticleEmitterOptions` (interface)

    export interface ParticleEmitterOptions {

        texture?: Texture2D;

        frames?: readonly Texture2D[];

        max?: number;

        rate?: number;

        life?: ParticleRange;

        speed?: ParticleRange;

        angle?: ParticleRange;

        gravity?: {
            x: number;
            y: number;
        };

        scale?: readonly [number, number] | ParticleCurve;

        alpha?: readonly [number, number] | ParticleCurve;

        flicker?: number;

        spin?: ParticleRange;

        spawn?: ParticleSpawnArea;

        tint?: ParticleRange;
    }

### `ParticleRange` (type)

    export type ParticleRange = number | readonly [number, number];

### `ParticleSpawnArea` (interface)

    export interface ParticleSpawnArea {
        shape: 'rect' | 'ellipse';

        width: number;

        height?: number;
    }

### `Projectile` (class)

    export declare class Projectile {
        private sprite;
        private fromX;
        private fromY;
        private toX;
        private toY;
        private duration;
        private readonly animation?;
        private elapsed;
        private arrived;
        constructor(sprite: ProjectilePoint, from: ProjectilePoint, to: ProjectilePoint, options?: ProjectileOptions);
        get done(): boolean;

        get progress(): number;

        get frame(): AnimationFrame | undefined;

        get frameOffset(): ProjectilePoint;

        update(dt: number): boolean;
    }

### `ProjectileOptions` (interface)

    export interface ProjectileOptions {

        speed?: number;

        duration?: number;

        animation?: Animation;
    }

### `ProjectilePoint` (interface)

    export interface ProjectilePoint {
        x: number;
        y: number;
    }

### `RecolorProbe` (interface)

    export interface RecolorProbe {
        createCanvas?(width: number, height: number): RemapCanvas | null;
    }

### `recolorTexture` (function)

    export declare function recolorTexture(texture: Texture, mapping: PaletteMapping, probe?: RecolorProbe, mode?: PaletteRemapMode): Texture;

### `Rect` (interface)

    export interface Rect {
        x: number;
        y: number;
        width: number;
        height: number;
    }

### `Rectangle2D` (export)

    export { Rectangle2D }

### `rectOf` (function)

    export declare function rectOf(rectangle: Rectangle): Rect;

### `registerColorTransform` (function)

    export declare function registerColorTransform(): void;

### `RemapCanvas` (interface)

    export interface RemapCanvas {
        width: number;
        height: number;
        getContext(kind: '2d'): RemapCanvasContext | null;
    }

### `RemapCanvasContext` (interface)

    export interface RemapCanvasContext {
        drawImage(image: unknown, dx: number, dy: number): void;
        getImageData(sx: number, sy: number, sw: number, sh: number): {
            data: Uint8ClampedArray;
        };
        putImageData(imageData: {
            data: Uint8ClampedArray;
            width: number;
            height: number;
        }, dx: number, dy: number): void;
    }

### `remapPixels` (function)

    export declare function remapPixels(pixels: Uint8ClampedArray, mapping: PaletteMapping, mode?: PaletteRemapMode): Uint8ClampedArray;

### `RENDERING_DECISIONS` (const)

    export declare const RENDERING_DECISIONS: readonly RenderingDecision[];

### `RenderingDecision` (interface)

    export interface RenderingDecision {
        workload: GraphicsWorkload;
        preferred: string;
        fallback: string;
        reason: string;
    }

### `resolveTerrainGraphics` (function)

    export declare function resolveTerrainGraphics(width: number, height: number, rules: readonly TerrainRule[], flagsAt: TerrainFlagsAt, options?: ResolveTerrainGraphicsOptions): TerrainPlacement[];

### `ResolveTerrainGraphicsOptions` (interface)

    export interface ResolveTerrainGraphicsOptions {
        rotate?: TerrainRotate;

        random?: Generator;
    }

### `RotatedPixels` (interface)

    export interface RotatedPixels {
        readonly data: Uint8ClampedArray;
        readonly width: number;
        readonly height: number;
    }

### `RotateMode` (type)

    export type RotateMode = 'nearest' | 'linear';

### `rotatePixels` (function)

    export declare function rotatePixels(pixels: Uint8ClampedArray, width: number, height: number, degrees: number, mode?: RotateMode): RotatedPixels;

### `RPGM_AUTOTILE_SLOT_BASES` (const)

    export declare const RPGM_AUTOTILE_SLOT_BASES: readonly [2048, 2816, 4352, 5888];

### `RPGM_AUTOTILE_SLOT_COUNTS` (const)

    export declare const RPGM_AUTOTILE_SLOT_COUNTS: readonly [768, 1536, 1536, 2304];

### `RPGM_FLOOR_AUTOTILE_TABLE` (const)

    export declare const RPGM_FLOOR_AUTOTILE_TABLE: RpgmAutotileShapeTable;

### `RPGM_WALL_AUTOTILE_TABLE` (const)

    export declare const RPGM_WALL_AUTOTILE_TABLE: RpgmAutotileShapeTable;

### `RpgmAutotileAtlas` (class)

    export declare class RpgmAutotileAtlas {
        private readonly cache;
        private readonly table;
        constructor(table: RpgmAutotileShapeTable);
        get(tileId: number, slot: RpgmAutotileSlot, shape: number): RpgmAutotileFrame;
        clear(): void;
    }

### `rpgmAutotileFrame` (function)

    export declare function rpgmAutotileFrame(tileId: number, slot: RpgmAutotileSlot, shape: number, table: RpgmAutotileShapeTable): RpgmAutotileFrame;

### `RpgmAutotileFrame` (interface)

    export interface RpgmAutotileFrame {
        tileId: number;
        slot: RpgmAutotileSlot;
        shape: number;
        destinationX: number;
        destinationY: number;
        quadrants: readonly [RpgmAutotileQuadrant, RpgmAutotileQuadrant, RpgmAutotileQuadrant, RpgmAutotileQuadrant];
    }

### `RpgmAutotileQuadrant` (interface)

    export interface RpgmAutotileQuadrant {
        sourceX: number;
        sourceY: number;
        destinationX: number;
        destinationY: number;
    }

### `RpgmAutotileShape` (type)

    export type RpgmAutotileShape = readonly [
        readonly [number, number],
        readonly [number, number],
        readonly [number, number],
        readonly [number, number]
    ];

### `RpgmAutotileShapeTable` (type)

    export type RpgmAutotileShapeTable = readonly RpgmAutotileShape[];

### `rpgmAutotileSlot` (function)

    export declare function rpgmAutotileSlot(tile: number): RpgmAutotileSlot | null;

### `RpgmAutotileSlot` (type)

    export type RpgmAutotileSlot = 0 | 1 | 2 | 3;

### `rpgmTableEdgeCells` (function)

    export declare function rpgmTableEdgeCells(map: RpgmTableEdgeMap): Int32Array;

### `RpgmTableEdgeMap` (interface)

    export interface RpgmTableEdgeMap {
        width: number;
        height: number;

        ground: ArrayLike<number>;

        objects: ArrayLike<number>;

        flags: {
            readonly [tile: number]: number | undefined;
        };
    }

### `ScreenEffectPhase` (type)

    export type ScreenEffectPhase = 'idle' | 'fadeOut' | 'fadeIn' | 'flash' | 'hold';

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

        private queue;
        constructor(options?: ScreenEffectsOptions);

        setViewport(width: number, height: number): void;
        private redraw;

        get isBusy(): boolean;

        get washAlpha(): number;

        fadeOut(duration: number, color?: number): void;

        fadeIn(duration: number, color?: number): void;

        flash(duration: number, color?: number, peak?: number): void;

        sequence(steps: readonly ScreenEffectStep[]): void;

        setTint(color: number, alpha: number): void;

        clear(): void;

        private beginStep;

        private advance;

        private begin;

        update(dt: number): boolean;
    }

### `ScreenEffectsOptions` (interface)

    export interface ScreenEffectsOptions {
        width?: number;
        height?: number;

        color?: number;
    }

### `ScreenEffectStep` (interface)

    export interface ScreenEffectStep {
        kind: 'fadeOut' | 'fadeIn' | 'flash' | 'hold';
        duration: number;

        color?: number;

        peak?: number;
    }

### `ShadowLayerOptions` (interface)

    export interface ShadowLayerOptions {

        color?: number;

        alpha?: number;
    }

### `Shape2D` (class)

    export declare class Shape2D extends Graphics {
    }

### `snapZoom` (function)

    export declare function snapZoom(zoom: number, tileSize: number, resolution?: number): number;

### `splitScreenHalves` (function)

    export declare function splitScreenHalves(width: number, height: number): [{
        x: number;

### `Sprite2D` (class)

    export declare class Sprite2D extends Sprite {
    }

### `SpriteAttachment` (class)

    export declare class SpriteAttachment {
        private readonly child;
        private readonly offsetX;
        private readonly offsetY;
        private readonly duration?;
        private elapsed;
        private expired;
        constructor(child: AttachmentPoint, options?: SpriteAttachmentOptions);
        get done(): boolean;

        follow(ownerX: number, ownerY: number): this;

        update(dt: number): boolean;
    }

### `SpriteAttachmentOptions` (interface)

    export interface SpriteAttachmentOptions {

        offsetX?: number;
        offsetY?: number;

        duration?: number;
    }

### `spriteColorMatrix` (function)

    export declare function spriteColorMatrix(sprite: Sprite, matrix: ColorMatrixFilter['matrix']): void;

### `SpriteGroup` (class)

    export declare class SpriteGroup {
        private members;

        get size(): number;

        add(member: SpriteGroupMember): this;

        remove(member: SpriteGroupMember): boolean;

        clear(): void;

        update(camera: Camera, dt: number, margin?: number): void;
    }

### `SpriteGroupMember` (interface)

    export interface SpriteGroupMember {
        x: number;
        y: number;
        update(dt: number): void;
    }

### `SpriteMotion` (class)

    export declare class SpriteMotion {
        private readonly target;
        private readonly tweener;
        private readonly ownsTweener;
        private readonly intent;
        private readonly rest;
        private readonly contributions;
        private readonly loops;
        private nextId;
        private flipX;
        private flipY;
        private destroyed;
        constructor(target: MotionTarget, options?: SpriteMotionOptions);

        squash(options: {
            amount: number;
            duration: number;
        }): MotionHandle;

        hop(options: {
            height: number;
            duration: number;
        }): MotionHandle;

        bob(options: {
            amplitude: number;
            period: number;
            cycles?: number;
        }): MotionHandle;

        wobble(options: {
            angle: number;
            duration: number;
        }): MotionHandle;

        spin(options: {
            turns: number;
            duration: number;
        }): MotionHandle;

        shear(options: {
            amount: number;
            duration: number;
        }): MotionHandle;

        flip(axis: 'x' | 'y', mirrored?: boolean): boolean;

        update(dt: number): void;

        get isBusy(): boolean;

        destroy(): void;
        private run;
        private loop;
        private write;
    }

### `SpriteMotionOptions` (interface)

    export interface SpriteMotionOptions {

        tweener?: Tweener;

        intent?: MotionIntent;
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

        static grid(path: string, frameWidth?: number, frameHeight?: number): SpriteSheet;
        static fromTexture(texture: Texture2D, frameWidth?: number, frameHeight?: number): SpriteSheet;
        get count(): number;

        name(name: string, index: number): this;

        nameAll(names: Readonly<Record<string, number>>): this;
        indexOf(name: string): number;
        get(frame: number | string): Texture2D;

        rect(index: number, x: number, y: number, width: number, height: number): this;

        region(frame: number | string): TextureRegion;

        range(from: number, to: number): Texture2D[];

        pick(...frames: Array<number | string>): Texture2D[];
    }

### `squareRotate` (function)

    export declare function squareRotate(dx: number, dy: number, rotationIndex: number, rotations: number): {
        dx: number;

### `StatusVisuals` (class)

    export declare class StatusVisuals {
        private target;
        private styles;
        private active;
        private elapsed;
        private flashColor;
        private flashStrength;
        private flashDuration;
        private flashRemaining;
        constructor(target: TintTarget, options: StatusVisualsOptions);

        set(kind: string, active: boolean): void;
        has(kind: string): boolean;

        flash(color: number, strength: number, duration: number): void;

        update(dt: number): void;
    }

### `StatusVisualsOptions` (interface)

    export interface StatusVisualsOptions {

        styles: Record<string, StatusVisualStyle>;
    }

### `StatusVisualStyle` (interface)

    export interface StatusVisualStyle {

        color: number;

        strength?: number;

        pulseRate?: number;
    }

### `TerrainCondition` (interface)

    export interface TerrainCondition {
        readonly dx: number;
        readonly dy: number;
        readonly hasAll?: readonly string[];
        readonly hasAny?: readonly string[];
        readonly hasNone?: readonly string[];
    }

### `TerrainFlagsAt` (type)

    export type TerrainFlagsAt = (x: number, y: number) => ReadonlySet<string> | undefined;

### `TerrainGraphicsLayer` (class)

    export declare class TerrainGraphicsLayer extends Node2D {
        private placements;
        private readonly project;
        private readonly resolveImage;
        constructor(options: TerrainGraphicsLayerOptions);

        setPlacements(placements: readonly TerrainPlacement[]): void;
        private rebuild;
    }

### `TerrainGraphicsLayerOptions` (interface)

    export interface TerrainGraphicsLayerOptions {

        readonly placements: readonly TerrainPlacement[];

        readonly project: (x: number, y: number, dx: number, dy: number) => {
            x: number;
            y: number;
        };

        readonly resolveImage?: (path: string) => Texture2D;
    }

### `TerrainImage` (interface)

    export interface TerrainImage {
        readonly image: string;

        readonly dx?: number;
        readonly dy?: number;

        readonly layer?: number;
    }

### `TerrainPlacement` (interface)

    export interface TerrainPlacement {
        readonly x: number;
        readonly y: number;
        readonly ruleId: string;
        readonly image: string;
        readonly dx: number;
        readonly dy: number;
        readonly layer: number;
    }

### `TerrainRotate` (type)

    export type TerrainRotate = (dx: number, dy: number, rotationIndex: number, rotations: number) => {
        dx: number;

### `TerrainRule` (interface)

    export interface TerrainRule {
        readonly id: string;
        readonly conditions: readonly TerrainCondition[];
        readonly images: readonly TerrainImage[];

        readonly probability?: number;

        readonly rotations?: number;
    }

### `Text2D` (class)

    export declare class Text2D extends Text {
    }

### `Texture2D` (export)

    export { Texture2D }

### `TextureRegion` (interface)

    export interface TextureRegion {
        texture: Texture;
        frame: Rect;
    }

### `TiledLayer` (interface)

    export interface TiledLayer {
        type: string;
        name: string;
        data?: number[];
        encoding?: string;
        objects?: TiledObject[];
    }

### `TiledMapData` (interface)

    export interface TiledMapData {
        width: number;
        height: number;
        tilewidth: number;
        tileheight: number;
        orientation?: string;

        staggeraxis?: string;
        staggerindex?: string;
        tilesets: Array<{
            firstgid: number;
            source?: string;
        }>;
        layers: TiledLayer[];
    }

### `TiledObject` (interface)

    export interface TiledObject {
        id: number;
        name?: string;
        type?: string;
        x: number;
        y: number;
        gid?: number;
        properties?: Array<{
            name: string;
            value: unknown;
        }>;
    }

### `TiledSprite` (class)

    export declare class TiledSprite extends TilingSprite {
    }

### `TiledTilesetData` (interface)

    export interface TiledTilesetData {
        tilewidth: number;
        tileheight: number;
        image: string;
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
        private beginLayer;

        addAutotileLayer(name: string, cells: ArrayLike<number>, set: AutotileSet | readonly AutotileSet[]): this;

        setAutotileFrame(layer: string | number, frame: number): void;

        addShadowLayer(name: string, bits: ArrayLike<number>, options?: ShadowLayerOptions): this;
        private buildShadowSprites;
        private setShadowCell;

        getAutotileFrame(layer: string | number): number;
        private resolveAutotileSet;
        private resolveRpgmSet;
        private resolveXpSet;
        private claimAutotileSets;
        private autotilePieces;
        private makeAutotileSprites;
        private setAutotileCell;
        private eachCellSprite;
        private firstCellSprite;
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

        stampRect(layer: string | number, x: number, y: number, width: number, height: number, frames: ArrayLike<number>): void;

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

### `TileMapOptions` (interface)

    export interface TileMapOptions {

        width: number;
        height: number;

        sheet: SpriteSheet | readonly SpriteSheet[];

        tileWidth?: number;
        tileHeight?: number;

        shape?: 'square' | 'hex' | 'isometric' | 'staggered';

        chunkSize?: number;

        heightStep?: number;
    }

### `TilesetSheet` (interface)

    export interface TilesetSheet {
        firstgid: number;
        sheet: SpriteSheet;
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

### `TintTarget` (interface)

    export interface TintTarget {

        colorAdd: number;
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

### `ViewportOptions` (interface)

    export interface ViewportOptions extends CameraOptions {

        x: number;
        y: number;
        width: number;
        height: number;
    }

### `WebGpuDetection` (interface)

    export interface WebGpuDetection {
        webgpu: boolean;
        wgsl: boolean;
    }

### `withTextureCanvas` (function)

    export declare function withTextureCanvas(texture: Texture, probe: RecolorProbe, paint: (context: RemapCanvasContext, width: number, height: number) => void): Texture;

### `XP_AUTOTILE_PATTERNS` (const)

    export declare const XP_AUTOTILE_PATTERNS: readonly XpAutotilePattern[];

### `XP_NEIGHBORS_TO_PATTERN` (const)

    export declare const XP_NEIGHBORS_TO_PATTERN: readonly number[];

### `xpAutotilePattern` (function)

    export declare function xpAutotilePattern(sameTerrain: (dx: number, dy: number) => boolean): number;

### `XpAutotilePattern` (type)

    export type XpAutotilePattern = readonly [number, number, number, number];

### `xpAutotileRef` (function)

    export declare function xpAutotileRef(tile: number): XpAutotileRef | null;

### `XpAutotileRef` (interface)

    export interface XpAutotileRef {

        index: number;

        pattern: number;
    }

## `./two-d/stage`

### `CharacterDefinition` (interface)

    export interface CharacterDefinition {
        sheet: SpriteSheet;

        expressions: Record<string, number>;

        height?: number;

        baseline?: number;
    }

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

### `extractDialogueCatalog` (function)

    export declare function extractDialogueCatalog(commands: readonly StageCommand[] | StoryScript, options?: {
        locale?: string;

### `HistoryEntry` (interface)

    export interface HistoryEntry {
        text: string;
        speaker?: string;

        chosen?: unknown;
    }

### `importTwee` (function)

    export declare function importTwee(source: string): TwineStory;

### `parseDialogueText` (function)

    export declare function parseDialogueText(source: string): StageCommand[];

### `ScriptOptions` (interface)

    export interface ScriptOptions {
        stage: DialogueStage;
        windows: WindowStack;

        backdrop: (name: string) => Texture;

        displayName?: (id: string) => string;

        boxWidth?: number;
        boxHeight?: number;

        speed?: number;

        mode?: 'adv' | 'nvl';
    }

### `ScriptState` (interface)

    export interface ScriptState {

        answers: Record<string, unknown>;
    }

### `ShowOptions` (interface)

    export interface ShowOptions {
        at?: SlotName | number;
        expression?: string;

        fade?: number;
    }

### `SlotName` (type)

    export type SlotName = 'left' | 'center' | 'right' | 'farLeft' | 'farRight';

### `StageChoice` (type)

    export type StageChoice = Choice & {

        goto?: string;

### `StageCommand` (type)

    export type StageCommand = {
        backdrop: string;

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

### `StoryBeat` (interface)

    export interface StoryBeat {
        text: string;
        title?: string;

        image?: string;

        music?: string;
    }

### `StoryScreen` (class)

    export declare class StoryScreen extends Container {
        readonly sequence: StorySequence;
        private readonly backdrop;
        private readonly titleLabel;
        private readonly textLabel;
        private readonly textureFor;
        private readonly playMusic;
        private width_;
        private height_;
        constructor(options: StoryScreenOptions);

        get current(): StoryBeat | null;

        advance(): boolean;

        skip(): void;
        resize(width: number, height: number): void;
        private readonly handleAdvance;
        private readonly handleBeat;
        private applyBeat;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `StoryScreenOptions` (interface)

    export interface StoryScreenOptions {
        sequence: StorySequence;
        width: number;
        height: number;

        textureFor?: (path: string) => Texture | null;

        playMusic?: (track: string | null) => void;
    }

### `StoryScript` (type)

    export type StoryScript = Record<string, readonly StageCommand[]>;

### `StorySequence` (class)

    export declare class StorySequence {
        readonly onChange: Signal<StoryBeat>;
        readonly onMusic: Signal<string | null>;
        private readonly beats;
        private index;
        constructor(beats: readonly StoryBeat[]);
        get length(): number;

        get position(): number;

        get current(): StoryBeat | null;

        get done(): boolean;

        get music(): string | null;

        goTo(index: number): void;

        advance(): boolean;

        back(): boolean;

        skip(): void;
        restart(): void;
        private report;
    }

### `TwineStory` (interface)

    export interface TwineStory {
        story: StoryScript;

        start: string;

        title?: string;
    }

## `./two-d/ui`

### `advanceReveal` (function)

    export declare function advanceReveal(state: RevealState, dt: number): boolean;

### `Anchor` (type)

    export type Anchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'fill';

### `anchorAlign` (function)

    export declare function anchorAlign(anchor: Anchor): {
        x: number;

### `AnchorSpec` (interface)

    export interface AnchorSpec {

        anchor?: Anchor;

        offsetX?: number;
        offsetY?: number;

        alignX?: number;
        alignY?: number;

        width?: number;
        height?: number;

        margin?: number;
    }

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

### `BarOptions` (interface)

    export interface BarOptions {
        width: number;
        height: number;

        color?: number;

        value?: number;
        max?: number;

        fillTexture?: Texture2D;

        background?: number;

        backgroundTexture?: Texture2D;

        roundUpToPixel?: boolean;
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

### `BitmapLabelOptions` (type)

    export type BitmapLabelOptions = ThemedTextOptions;

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

### `ButtonOptions` (interface)

    export interface ButtonOptions {
        width: number;
        height: number;

        text?: string;

        icon?: Container2D;

        skin?: ButtonSkin;

        label?: Omit<LabelOptions, 'text'>;
        disabled?: boolean;
        onClick?: () => void;

        onPress?: () => void;

        onRelease?: () => void;
    }

### `ButtonSkin` (interface)

    export interface ButtonSkin {
        texture: Texture2D;
        border: NinePatchOptions['border'];

        tints?: Partial<Record<ButtonState, number>>;
    }

### `ButtonState` (type)

    export type ButtonState = 'idle' | 'hover' | 'pressed' | 'disabled';

### `Checkbox` (class)

    export declare class Checkbox extends Container {
        readonly onChange: Signal<boolean>;
        private box;
        private size_;
        private checked_;
        private disabled_;
        private readonly themeListener;
        constructor(options?: CheckboxOptions);
        get checked(): boolean;
        get disabled(): boolean;
        setDisabled(disabled: boolean): void;

        setChecked(checked: boolean): void;
        toggle(): void;
        resize(size: number): void;
        private readonly handleTap;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `CheckboxOptions` (interface)

    export interface CheckboxOptions {

        size?: number;
        checked?: boolean;
        disabled?: boolean;

        color?: number;
    }

### `Choice` (interface)

    export interface Choice {
        text: string;
        value?: unknown;
        disabled?: boolean;
    }

### `completeReveal` (function)

    export declare function completeReveal(state: RevealState): void;

### `ContrastLevel` (type)

    export type ContrastLevel = 'AA' | 'AAA';

### `contrastRatio` (function)

    export declare function contrastRatio(a: number, b: number): number;

### `DataTable` (class)

    export declare class DataTable<T> {
        readonly onChange: Signal<void>;
        private columns_;
        private rows_;
        private pageSize_;
        private current;
        private sortKey_;
        private ascending;
        private readonly disabledOf;
        constructor(options: DataTableOptions<T>);
        get columns(): readonly TableColumn<T>[];
        get rows(): readonly T[];
        get pageSize(): number;
        get sortKey(): string | null;
        get sortAscending(): boolean;
        get selectedIndex(): number;
        get selected(): T | null;

        get page(): number;

        get pageCount(): number;
        get pageRows(): readonly T[];
        setRows(rows: readonly T[]): void;
        setColumns(columns: readonly TableColumn<T>[]): void;
        setPageSize(size: number): void;

        sortBy(key: string): void;
        select(index: number): void;

        move(delta: number): void;

        setPage(page: number): void;
        nextPage(delta?: number): void;
        private firstEnabled;
    }

### `DataTableOptions` (interface)

    export interface DataTableOptions<T> {
        columns: readonly TableColumn<T>[];
        rows?: readonly T[];

        pageSize?: number;

        disabled?: (row: T) => boolean;
    }

### `defaultTheme` (const)

    export declare const defaultTheme: Theme;

### `Dropdown` (class)

    export declare class Dropdown {
        readonly onChange: Signal<{
            option: DropdownOption;
            index: number;
        }>;
        private options_;
        private current;
        private highlight_;
        private open_;
        private disabled_;
        constructor(options: DropdownOptions);
        get options(): readonly DropdownOption[];
        get selectedIndex(): number;

        get selected(): DropdownOption | null;
        get isOpen(): boolean;
        get disabled(): boolean;

        get highlight(): number;
        setDisabled(disabled: boolean): void;
        setOptions(options: readonly DropdownOption[]): void;

        open(): void;
        close(): void;
        toggleOpen(): void;

        move(delta: number): void;

        setHighlight(index: number): void;

        confirm(): boolean;

        cancel(): void;
        private firstEnabled;
    }

### `DropdownOption` (interface)

    export interface DropdownOption {

        id?: string;
        label: string;
        disabled?: boolean;
    }

### `DropdownOptions` (interface)

    export interface DropdownOptions {
        options: readonly DropdownOption[];

        selectedIndex?: number;
        disabled?: boolean;
    }

### `escapeHtml` (function)

    export declare function escapeHtml(text: string): string;

### `fitWindowZoom` (function)

    export declare function fitWindowZoom(base: number, contentHeight: number, viewportHeight: number): number;

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

### `FloatingTextOptions` (interface)

    export interface FloatingTextOptions {
        text: string;
        color?: number;
        size?: number;

        duration?: number;

        rise?: number;

        hold?: number;
    }

### `FloatingTextPush` (interface)

    export interface FloatingTextPush extends FloatingTextOptions {

        x: number;
        y: number;

        key?: string | number;

        scale?: number;
    }

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

### `FloatingTextStackEntry` (interface)

    export interface FloatingTextStackEntry {

        key?: string | number;

        x: number;
        y: number;

        height: number;
    }

### `floatingTextStackLifePenalty` (function)

    export declare function floatingTextStackLifePenalty(linesBelow: number): number;

### `floatingTextStackLift` (function)

    export declare function floatingTextStackLift(older: FloatingTextStackEntry, below: FloatingTextStackEntry, gap?: number): number;

### `FloatingTextStackMove` (interface)

    export interface FloatingTextStackMove {

        readonly index: number;

        readonly y: number;

        readonly ageAtLeast: number;
    }

### `floatingTextStackMoves` (function)

    export declare function floatingTextStackMoves(live: readonly FloatingTextStackEntry[], incoming: FloatingTextStackEntry, gap?: number): FloatingTextStackMove[];

### `GlyphLayout` (interface)

    export interface GlyphLayout {
        char: string;
        x: number;
        y: number;
        rotate: boolean;
    }

### `Grid` (class)

    export declare class Grid {
        private spec;
        constructor(spec: GridSpec);
        get columns(): readonly GridTrack[];
        get rows(): readonly GridTrack[];

        columnSizes(totalWidth: number): number[];

        rowSizes(totalHeight: number): number[];

        rect(row: number, column: number, bounds: LayoutRect, options?: {
            rowSpan?: number;
            columnSpan?: number;
        }): LayoutRect;
        private get gap();
    }

### `GridSpec` (interface)

    export interface GridSpec {
        columns: readonly GridTrack[];
        rows: readonly GridTrack[];

        gap?: number;
    }

### `GridTrack` (interface)

    export interface GridTrack {

        size?: number;

        grow?: number;
    }

### `HelpScreen` (class)

    export declare class HelpScreen extends Container {
        private list;
        private body;
        private topics;
        constructor(options: HelpScreenOptions);
        private showBody;

        handleAction(action: Action): boolean;
    }

### `HelpScreenOptions` (interface)

    export interface HelpScreenOptions {
        width: number;
        height: number;
        topics: readonly HelpTopic[];

        listWidth?: number;
    }

### `HelpTopic` (interface)

    export interface HelpTopic {
        title: string;
        body: string;
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

### `IconGridItem` (interface)

    export interface IconGridItem {

        icon: Container2D;

        disabled?: boolean;

        value?: unknown;

        quantity?: number;
    }

### `IconGridOptions` (interface)

    export interface IconGridOptions {
        width: number;
        height: number;

        columns: number;
        items?: IconGridItem[];

        cellSize?: number;

        longPressDuration?: number;
        onSelect?: (item: IconGridItem, index: number) => void;
        onHighlight?: (item: IconGridItem, index: number) => void;

        onQuickslot?: (item: IconGridItem, index: number) => void;

        onReorder?: (fromIndex: number, toIndex: number) => void;
    }

### `KeyboardKey` (interface)

    export interface KeyboardKey {

        label: string;

        text?: string;

        action?: Action;

        span?: number;
    }

### `KeyboardLayout` (interface)

    export interface KeyboardLayout {

        rows: KeyboardKey[][];
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

### `LabelOptions` (interface)

    export interface LabelOptions extends ThemedTextOptions {

        stroke?: {
            color: number;
            width: number;
        };

        resolution?: number;
        roundPixels?: boolean;
    }

### `layoutMarkupLines` (function)

    export declare function layoutMarkupLines(spans: readonly MarkupSpan[], measure: MarkupMeasure, maxWidth: number): MarkupLine[];

### `LayoutRect` (interface)

    export interface LayoutRect {
        x: number;
        y: number;
        width: number;
        height: number;
    }

### `layoutVertical` (function)

    export declare function layoutVertical(text: string, options: VerticalLayoutOptions): GlyphLayout[];

### `linesToDrop` (function)

    export declare function linesToDrop(lineCounts: readonly number[], maxLines: number): number;

### `ListItem` (interface)

    export interface ListItem {

        text: string;

        disabled?: boolean;

        value?: unknown;

        icon?: Container2D;
    }

### `ListTab` (interface)

    export interface ListTab {
        id: string;
        label: string;

        disabled?: boolean;
    }

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
        onToggle: ((item: ListItem, index: number, checked: boolean) => void) | null;
        private multiple;
        private checked;
        private ticks;
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

        tapRow(index: number): void;

        handleAction(action: Action): boolean;
        get checkedIndexes(): number[];
        isChecked(index: number): boolean;

        setChecked(index: number, checked: boolean): void;

        toggleChecked(index: number): boolean;

        clearChecked(): void;

        private checkAdvance;
        private checkBox;
        private rebuildTicks;
        private updateTicks;
        private refresh;
    }

### `ListViewOptions` (interface)

    export interface ListViewOptions {
        width: number;
        height: number;
        items?: ListItem[];

        rowHeight?: number;
        onSelect?: (item: ListItem, index: number) => void;
        onHighlight?: (item: ListItem, index: number) => void;

        multiple?: boolean;
        onToggle?: (item: ListItem, index: number, checked: boolean) => void;
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

### `LoadingScreenOptions` (interface)

    export interface LoadingScreenOptions {
        width: number;
        height: number;
        title?: string;
        onRetry?: () => void;
        onCancel?: () => void;
    }

### `MarkdownSpan` (interface)

    export interface MarkdownSpan {
        text: string;
        bold: boolean;
        italic: boolean;
    }

### `markupAccessibilityText` (function)

    export declare function markupAccessibilityText(spans: readonly MarkupSpan[], options?: {
        describeImage?: (path: string) => string;

### `MarkupAlign` (type)

    export type MarkupAlign = 'left' | 'center' | 'right';

### `MarkupDirection` (type)

    export type MarkupDirection = 'ltr' | 'rtl';

### `MarkupLayout` (interface)

    export interface MarkupLayout {

        readonly measure: MarkupMeasure;

        readonly maxWidth: number;

        readonly lineHeight: number;

        readonly direction?: MarkupDirection;

        readonly align?: MarkupAlign;
    }

### `MarkupLine` (interface)

    export interface MarkupLine {
        readonly spans: readonly MarkupSpan[];
        readonly width: number;
    }

### `MarkupMeasure` (type)

    export type MarkupMeasure = (piece: Pick<MarkupSpan, 'text' | 'bold' | 'italic' | 'size' | 'image' | 'tag'>) => number;

### `MarkupOptions` (interface)

    export interface MarkupOptions {

        readonly variables?: Readonly<Record<string, string>>;

        readonly tags?: ReadonlySet<string>;
    }

### `MarkupSpan` (interface)

    export interface MarkupSpan extends MarkdownSpan {

        color?: string;

        size?: number;

        image?: string;

        tag?: string;
    }

### `MarkupText` (class)

    export declare class MarkupText extends Container {
        private readonly opts;
        private readonly themeListener;
        constructor(options?: MarkupTextOptions);

        setText(value: string): void;

        private rebuild;
        private measurePiece;

        private tagStyle;

        private resolvedFont;
        private textFor;
        private spriteFor;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `MarkupTextOptions` (interface)

    export interface MarkupTextOptions {
        text?: string;

        maxWidth?: number;

        lineHeight?: number;
        align?: MarkupAlign;

        direction?: MarkupDirection;

        resolution?: number;

        resolveImage?: (path: string) => Texture2D;

        variables?: Readonly<Record<string, string>>;

        tagStyles?: Readonly<Record<string, TextStyleOptions>>;
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

### `MessageBoxOptions` (interface)

    export interface MessageBoxOptions {
        width: number;
        height: number;
        pages: Array<MessagePage | string>;

        speed?: number;

        choices?: Choice[];

        onDone?: (chosen: unknown) => void;

        onSound?: (path: string) => void;

        dims?: boolean;

        blocker?: boolean;

        anchor?: 'center' | 'bottom' | 'top';

        announce?: boolean;

        mode?: 'adv' | 'nvl';

        autoAdvance?: number;
    }

### `messageBoxPresenter` (function)

    export declare function messageBoxPresenter(windows: WindowStack, options?: MessageBoxPresenterOptions): DialoguePresenter;

### `MessageBoxPresenterOptions` (interface)

    export interface MessageBoxPresenterOptions {

        width?: number;
        height?: number;
        speed?: number;
        anchor?: 'center' | 'bottom' | 'top';
    }

### `MessageLevel` (type)

    export type MessageLevel = 'info' | 'positive' | 'negative' | 'warning' | 'highlight';

### `MessageLog` (class)

    export declare class MessageLog extends Container {
        private readonly blocks;
        private readonly options;
        private maxLines;
        constructor(options: MessageLogOptions);
        get entryCount(): number;

        get contentHeight(): number;

        lastEntries(count: number): MessageLogEntry[];
        add(text: string, level?: MessageLevel): void;
        setMaxLines(lines: number): void;
        setWrapWidth(width: number): void;
        clear(): void;
        private colorOf;
        private linesOf;
        private trim;
        private layout;
    }

### `MessageLogEntry` (interface)

    export interface MessageLogEntry {
        text: string;
        level: MessageLevel;
    }

### `MessageLogOptions` (interface)

    export interface MessageLogOptions {

        wrapWidth: number;

        maxLines?: number;

        size?: number;

        colors?: Partial<Record<MessageLevel, number>>;

        resolution?: number;
    }

### `MessagePage` (interface)

    export interface MessagePage {
        text: string;

        speaker?: string;

        portrait?: Texture2D;
    }

### `Meter` (class)

    export declare class Meter extends Container {
        private emptyLayer;
        private filledLayer;
        private maskShape;
        private count_;
        private size_;
        private gap_;
        private value_;
        private explicitColor;
        private fillColor;
        private emptyColor_?;
        private readonly filledTexture?;
        private readonly emptyTexture?;
        private readonly themeListener;
        constructor(options: MeterOptions);

        get value(): number;

        get count(): number;

        get color(): number;
        setValue(value: number, count?: number): void;

        setColor(color: number): void;
        resize(size: number, gap?: number): void;
        private get totalWidth();
        private iconX;
        private draw;
        private icon;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `MeterOptions` (interface)

    export interface MeterOptions {

        count: number;

        value?: number;

        size?: number;

        gap?: number;

        filledTexture?: Texture2D;

        emptyTexture?: Texture2D;

        color?: number;

        emptyColor?: number;
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

### `NinePatchOptions` (interface)

    export interface NinePatchOptions {

        border: number | {
            left: number;
            top: number;
            right: number;
            bottom: number;
        };
    }

### `OnScreenKeyboard` (class)

    export declare class OnScreenKeyboard extends Container {
        private readonly laidOutHeight;
        constructor(layout: KeyboardLayout, options: {
            width: number;
        });

        get contentHeight(): number;
    }

### `parseMarkdown` (function)

    export declare function parseMarkdown(text: string): MarkdownSpan[];

### `parseMarkup` (function)

    export declare function parseMarkup(source: string, options?: MarkupOptions): MarkupSpan[];

### `PositionedMarkupSpan` (interface)

    export interface PositionedMarkupSpan {

        readonly span: MarkupSpan;

        readonly x: number;

        readonly y: number;

        readonly width: number;
    }

### `positionMarkupLines` (function)

    export declare function positionMarkupLines(lines: readonly MarkupLine[], layout: MarkupLayout): PositionedMarkupSpan[];

### `RadioGroup` (class)

    export declare class RadioGroup extends Container {
        readonly onChange: Signal<number>;
        private options_;
        private rows;
        private circles;
        private size_;
        private gap_;
        private selected_;
        private readonly themeListener;
        constructor(options?: RadioGroupOptions);
        get selected(): number;
        get selectedOption(): RadioOption | null;
        get length(): number;
        get rowHeight(): number;
        setOptions(options: RadioOption[], selected?: number): void;

        select(index: number): void;

        move(delta: number): boolean;

        handleAction(action: Action): boolean;

        tapRow(index: number): void;
        private defaultSelection;
        private buildRows;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `RadioGroupOptions` (interface)

    export interface RadioGroupOptions {
        options?: RadioOption[];

        selected?: number;

        size?: number;

        gap?: number;
    }

### `RadioOption` (interface)

    export interface RadioOption {

        text: string;

        disabled?: boolean;

        value?: unknown;
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

### `RebindScreenOptions` (interface)

    export interface RebindScreenOptions {
        width: number;
        height: number;

        actions: readonly Action[];

        label?: (action: Action) => string;
        rowHeight?: number;

        onConflict?: (key: string, action: Action, previousOwners: readonly Action[]) => boolean;
    }

### `relativeLuminance` (function)

    export declare function relativeLuminance(color: number): number;

### `resolveAnchor` (function)

    export declare function resolveAnchor(spec: AnchorSpec, bounds: LayoutRect, size?: {
        width: number;

### `revealComplete` (function)

    export declare function revealComplete(state: RevealState): boolean;

### `RevealState` (interface)

    export interface RevealState {

        total: number;

        speed: number;

        revealed: number;
    }

### `RichLabel` (class)

    export declare class RichLabel extends HTMLText {
        private readonly opts;
        private readonly tags;
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

### `RichLabelOptions` (interface)

    export interface RichLabelOptions extends ThemedTextOptions {

        resolution?: number;

        tagStyles?: Record<string, HTMLTextStyleOptions>;
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

### `ScrollBox` (class)

    export declare class ScrollBox extends Container {
        readonly onChange: Signal<number>;

        readonly content: Container<import("pixi.js").ContainerChild>;
        private maskShape;
        private track;
        private thumb;
        private width_;
        private height_;
        private contentHeight_;
        private offset_;
        private readonly themeListener;
        constructor(options: ScrollBoxOptions);
        get offset(): number;
        get contentHeight(): number;
        get viewportHeight(): number;

        get maxOffset(): number;
        get scrollable(): boolean;
        setContentHeight(height: number): void;
        resize(width: number, height: number): void;
        scrollBy(delta: number): void;
        scrollTo(offset: number): void;

        scrollIntoView(top: number, height: number): void;
        private setOffset;
        private readonly handleWheel;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `ScrollBoxOptions` (interface)

    export interface ScrollBoxOptions {
        width: number;
        height: number;

        contentHeight?: number;
        offset?: number;
    }

### `scrollOffset` (function)

    export declare function scrollOffset(offset: number, contentSize: number, viewportSize: number): number;

### `setTheme` (function)

    export declare function setTheme(next: Partial<Theme>): void;

### `SettingsCustomRow` (type)

    export type SettingsCustomRow = {
        kind: 'boolean';

### `SettingsScreen` (class)

    export declare class SettingsScreen extends Container {
        private readonly settings;
        private readonly width_;
        private readonly rowHeight;
        private readonly labels;
        private readonly zoomMin;
        private readonly zoomMax;
        private readonly zoomStep;
        private readonly customRows;
        private readonly actionsOption;
        private readonly onConflict;
        private readonly highlight;
        private readonly main;
        private readonly rebindLayer;
        private rows;
        private selected;
        private rebind;
        private readonly themeListener;
        constructor(options: SettingsScreenOptions);

        get selectedRow(): string;

        get isRebinding(): boolean;

        handleAction(action: Action): boolean;

        refresh(): void;
        private select;
        private drawHighlight;
        private buildMain;
        private addSliderRow;
        private readSlider;
        private addToggleRow;
        private readToggle;
        private addCustomRow;
        private addActionRow;
        private openRebind;
        private closeRebind;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `SettingsScreenOptions` (interface)

    export interface SettingsScreenOptions {
        settings: Settings;
        width?: number;
        rowHeight?: number;

        labels?: {
            music?: string;
            sfx?: string;
            muted?: string;
            zoom?: string;
            controls?: string;
            reset?: string;
            rebindHint?: string;
        };
        zoomMin?: number;
        zoomMax?: number;
        zoomStep?: number;

        custom?: readonly SettingsCustomRow[];

        actions?: readonly Action[];

        onConflict?: (key: string, action: Action, previousOwners: readonly Action[]) => boolean;
    }

### `sharpenText` (function)

    export declare function sharpenText(root: Container, devicePixelRatio: number): void;

### `Skin` (interface)

    export interface Skin {
        background?: number;
        border?: number;
        borderWidth?: number;
        text?: number;
        padding?: number;
        texture?: Texture2D;

        borderInset?: number;
    }

### `SkinData` (type)

    export type SkinData = Skin | SkinStates;

### `Skins` (class)

    export declare class Skins {
        private readonly map;

        static readonly ANY = "*";
        define(widget: string, state: WidgetState, skin: Skin): void;
        has(widget: string): boolean;
        widgets(): string[];

        resolve(widget: string, state?: WidgetState): Skin;

        statesOf(widget: string): WidgetState[];

        static from(data: Readonly<Record<string, SkinData>>): Skins;
    }

### `SkinStates` (type)

    export type SkinStates = Partial<Record<WidgetState, Skin>>;

### `sliceSpans` (function)

    export declare function sliceSpans(spans: readonly MarkdownSpan[], count: number): MarkdownSpan[];

### `Slider` (class)

    export declare class Slider extends Container {
        readonly onChange: Signal<number>;
        private track;
        private fill;
        private knob;
        private width_;
        private height_;
        private knobSize;
        private min;
        private max;
        private step;
        private value_;
        private disabled_;
        private dragging;
        private readonly themeListener;
        constructor(options: SliderOptions);

        get value(): number;

        get fraction(): number;
        get disabled(): boolean;
        setDisabled(disabled: boolean): void;
        setValue(value: number): void;

        setFraction(fraction: number): void;
        resize(width: number, height: number): void;
        private get trackLength();
        private snap;
        private fractionAt;
        private readonly handleDown;
        private readonly handleMove;
        private readonly handleUp;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `sliderFraction` (function)

    export declare function sliderFraction(value: number, min?: number, max?: number): number;

### `SliderOptions` (interface)

    export interface SliderOptions {
        width: number;
        height?: number;
        min?: number;
        max?: number;

        step?: number;
        value?: number;

        knobSize?: number;
        disabled?: boolean;
    }

### `sliderValueAt` (function)

    export declare function sliderValueAt(fraction: number, min?: number, max?: number, step?: number): number;

### `Spinner` (class)

    export declare class Spinner extends Container {
        readonly onChange: Signal<number>;
        private face;
        private width_;
        private height_;
        private min;
        private max;
        private step;
        private value_;
        private wrap;
        private disabled_;
        private readonly themeListener;
        constructor(options?: SpinnerOptions);
        get value(): number;
        get disabled(): boolean;
        setDisabled(disabled: boolean): void;
        setValue(value: number): void;
        increment(): void;
        decrement(): void;
        resize(width: number, height: number): void;
        private commit;
        private readonly handleTap;
        private draw;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `SpinnerOptions` (interface)

    export interface SpinnerOptions {
        width?: number;
        height?: number;
        min?: number;
        max?: number;
        step?: number;
        value?: number;

        wrap?: boolean;
        disabled?: boolean;
    }

### `spinValue` (function)

    export declare function spinValue(value: number, delta: number, min: number, max: number, step?: number, wrap?: boolean): number;

### `startReveal` (function)

    export declare function startReveal(total: number, speed?: number): RevealState;

### `StatRow` (interface)

    export interface StatRow {
        label: string;
        value: string;
    }

### `StatsScreen` (class)

    export declare class StatsScreen extends Container {
        private text;
        constructor(options: StatsScreenOptions);

        setStats(stats: readonly StatRow[], width?: number): void;
        private static format;
    }

### `StatsScreenOptions` (interface)

    export interface StatsScreenOptions {
        width: number;
        stats: readonly StatRow[];
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

### `TabbedListOptions` (interface)

    export interface TabbedListOptions<T> {

        tabs: readonly ListTab[];

        rowsFor: (tabId: string) => readonly T[];

        pageSize?: number;

        label?: (row: T) => string;

        filter?: (row: T, query: string) => boolean;

        disabled?: (row: T) => boolean;
    }

### `TableColumn` (interface)

    export interface TableColumn<T> {

        key: string;

        label?: string;
        width?: number;
        align?: 'left' | 'right' | 'center';

        compare?: (a: T, b: T) => number;
    }

### `takeLastEntries` (function)

    export declare function takeLastEntries<T>(entries: readonly T[], count: number): T[];

### `TextModel` (class)

    export declare class TextModel {
        private text;
        private caretIndex;
        private anchor;
        private readonly maxLength?;
        private readonly mask;
        private readonly maskCharacter;
        private readonly multiline;
        private goalColumn;
        constructor(options?: TextModelOptions);
        get value(): string;

        get maskedValue(): string;
        get length(): number;
        get caret(): number;
        get selectionStart(): number;
        get selectionEnd(): number;
        get hasSelection(): boolean;
        get selectedText(): string;

        setValue(value: string): void;
        setCaret(index: number, extend?: boolean): void;

        insert(text: string): void;

        backspace(): void;

        deleteForward(): void;

        moveCaret(delta: number, extend?: boolean): void;
        moveToStart(extend?: boolean): void;
        moveToEnd(extend?: boolean): void;
        selectAll(): void;
        clearSelection(): void;

        replaceSelection(text: string): void;

        private shape;

        get lineCount(): number;

        get caretLine(): number;

        lineRange(line: number): readonly [number, number];

        moveCaretLine(delta: number, extend?: boolean): void;
        private limit;
    }

### `TextModelOptions` (interface)

    export interface TextModelOptions {
        value?: string;

        maxLength?: number;

        mask?: boolean;

        maskCharacter?: string;

        multiline?: boolean;
    }

### `TextPrompt` (class)

    export declare class TextPrompt extends Window {
        private readonly model;
        private readonly validate?;
        private readonly onConfirm;
        private readonly onCancel?;
        private readonly announce;
        private readonly announcer;
        private preview;
        private promptError;
        private readonly keyboard;
        private messageLabel;
        private valueLabel;
        private previewLabel;
        private errorLabel;
        private caretBar;
        private readonly measurer;
        private readonly lineHeight;
        private readonly valueY;
        private canMeasureCaret;
        private blinkOn;
        private blinkElapsed;
        private readonly promptThemeListener;
        private readonly textListener;
        private readonly compositionListener;
        constructor(options: TextPromptOptions);

        get value(): string;

        get caretIndex(): number;

        get error(): string | null;
        handleAction(action: Action): boolean;
        update(dt: number): void;
        destroy(options?: Parameters<Window['destroy']>[0]): void;

        private edit;
        private confirm;
        private restylePrompt;
        private render;
    }

### `TextPromptOptions` (interface)

    export interface TextPromptOptions {
        width: number;
        height: number;

        title?: string;

        message?: string;

        initialValue?: string;

        maxLength?: number;

        keyboard?: KeyboardLayout;

        validate?: (value: string) => string | null;

        onConfirm: (value: string) => void;

        onCancel?: () => void;

        dims?: boolean;

        blocker?: boolean;

        anchor?: 'center' | 'bottom' | 'top';

        announce?: boolean;

        announcer?: Pick<ScreenReader, 'announce'>;
    }

### `theme` (function)

    export declare function theme(): Theme;

### `Theme` (interface)

    export interface Theme {

        panel?: Texture2D;

        panelBorder: number;

        padding: number;

        spacing: number;
        font: {
            family: string;
            size: number;

            lineHeight: number;
        };
        color: {
            text: number;
            textDim: number;
            textHighlight: number;

            panelFill: number;
            panelBorder: number;
            selection: number;

            overlay: number;
        };

        overlayAlpha: number;

        direction: Direction;
    }

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

### `ToastOptions` (interface)

    export interface ToastOptions {

        fadeIn?: number;

        hold?: number;

        fadeOut?: number;

        scaleFrom?: number;
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

### `TooltipOptions` (interface)

    export interface TooltipOptions {

        delay?: number;

        maxWidth?: number;

        offset?: {
            x: number;
            y: number;
        };

        margin?: number;
    }

### `TreeNode` (interface)

    export interface TreeNode<T = unknown> {

        id: string;
        label: string;
        children?: readonly TreeNode<T>[];
        disabled?: boolean;
        data?: T;
    }

### `TreeRow` (interface)

    export interface TreeRow<T> {
        node: TreeNode<T>;
        depth: number;
        expanded: boolean;
        hasChildren: boolean;
    }

### `TreeView` (class)

    export declare class TreeView<T = unknown> {
        readonly onChange: Signal<void>;
        private roots_;
        private expanded;
        private current;
        private readonly disabledOf;
        constructor(options: TreeViewOptions<T>);
        get roots(): readonly TreeNode<T>[];

        get rows(): readonly TreeRow<T>[];
        get selectedIndex(): number;
        get selected(): TreeNode<T> | null;
        isExpanded(id: string): boolean;
        expand(id: string): void;
        collapse(id: string): void;
        toggle(id: string): void;
        expandAll(): void;
        collapseAll(): void;
        select(index: number): void;

        move(delta: number): void;
        private firstEnabled;
    }

### `TreeViewOptions` (interface)

    export interface TreeViewOptions<T> {
        roots: readonly TreeNode<T>[];

        expanded?: readonly string[];

        disabled?: (node: TreeNode<T>) => boolean;
    }

### `UPPERCASE_KEYBOARD` (const)

    export declare const UPPERCASE_KEYBOARD: KeyboardLayout;

### `VerticalLabel` (class)

    export declare class VerticalLabel extends Container {
        private readonly opts;
        private readonly themeListener;
        constructor(options: VerticalLabelOptions);

        private build;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `VerticalLabelOptions` (interface)

    export interface VerticalLabelOptions {
        text: string;
        color?: number;
        size?: number;
        columnHeight: number;
        rotate?: RegExp;
    }

### `VerticalLayoutOptions` (interface)

    export interface VerticalLayoutOptions {
        lineHeight: number;

        columnHeight: number;

        rotate?: RegExp;
    }

### `WidgetState` (type)

    export type WidgetState = 'idle' | 'hover' | 'pressed' | 'disabled' | 'selected' | 'focused';

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

        private blocker;
        private readonly themeListener;
        private isClosed;
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

        get closed(): boolean;

        update(_dt: number): void;

        close(): void;

        place(viewportWidth: number, viewportHeight: number): void;

        private fitBlocker;
        private readonly onBlockerDown;

        handleOutsideClick(x: number, y: number): boolean;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

### `WindowOptions` (interface)

    export interface WindowOptions {
        width: number;
        height: number;
        title?: string;

        modal?: boolean;

        closable?: boolean;

        dims?: boolean;

        anchor?: 'center' | 'bottom' | 'top';

        blocker?: boolean;
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

        handleAction(action: Action): boolean;

        get blocksWorld(): boolean;
        update(dt: number): void;
        destroy(options?: Parameters<Container['destroy']>[0]): void;
    }

## `./world`

### `Alignment` (type)

    export type Alignment = 'lawful' | 'neutral' | 'chaotic' | 'liminal';

### `alignmentBonus` (function)

    export declare function alignmentBonus(alignment: Alignment, lawfulBonus: number): number;

### `DayPhase` (type)

    export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

### `EncounterEntry` (interface)

    export interface EncounterEntry<T> {
        value: T;
        weight: number;
    }

### `EncounterTable` (interface)

    export interface EncounterTable<T> {
        entries: readonly EncounterEntry<T>[];

        rate: number;
    }

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

### `EnvironmentOptions` (interface)

    export interface EnvironmentOptions {

        dayLength?: number;
        startSeconds?: number;
        startWeather?: string;

        phaseBoundaries?: readonly [number, number, number];
    }

### `EnvironmentSnapshot` (interface)

    export interface EnvironmentSnapshot {
        day: number;
        seconds: number;
        phase: DayPhase;
        weather: string;
    }

### `Location` (interface)

    export interface Location {
        id: string;
        x: number;
        y: number;

        leadsTo: string;

        spawn?: string;
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

### `SideTurn` (interface)

    export interface SideTurn {
        side: string;
        round: number;

        newRound: boolean;
    }

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

### `SideTurnsOptions` (interface)

    export interface SideTurnsOptions {

        sides: readonly string[];

        schedule: readonly TimeOfDay[];

        sideIndex?: number;

        round?: number;

        timeIndex?: number;

        areas?: readonly TimeArea[];
    }

### `SideTurnState` (interface)

    export interface SideTurnState {
        round: number;
        sideIndex: number;
        timeIndex: number;
    }

### `TimeArea` (interface)

    export interface TimeArea {

        times: readonly TimeOfDay[];
        contains(x: number, y: number): boolean;
    }

### `TimedEffect` (interface)

    export interface TimedEffect {

        tick: (turn: number) => void;

        duration?: number;

        onExpire?: () => void;
    }

### `TimeOfDay` (interface)

    export interface TimeOfDay {

        id: string;

        lawfulBonus: number;
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

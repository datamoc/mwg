import { Game, Scene2D } from '../../src/two-d/index.ts';
import { Shape2D } from '../../src/two-d/render/Shape2D.ts';
import { MwlPresentation, type PresentationState } from '../../src/two-d/presentation/index.ts';
import { Signal } from '../../src/core/Signal.ts';
import * as Input from '../../src/core/Input.ts';
import { themeChanged } from '../../src/two-d/ui/theme.ts';
import { presentationData, type PresentationId } from './generated/presentation.ts';
import type { PresentationItem } from '../../src/mwl/presentation.ts';
import { load } from '../../src/assets/loader.ts';

declare global {
	interface Window {
		__MWG_PRESENTATION__?: PresentationDemo;
	}
}
interface PresentationDemo {
	ui: MwlPresentation<PresentationId>;
	add(): void;
	reorder(): void;
	setRows(ids: string[]): void;
	open(): void;
	close(): void;
	context(name: string): void;
	remove(): void;
	snapshot(): {
		beams: number;
		material: string;
		showWindow: boolean;
		created: number;
		destroyed: number;
		changes: number;
		input: number;
		themes: number;
		baselineInput: number;
		baselineThemes: number;
		actions: number;
		caption: string;
	};
}

class BridgeEditor extends Scene2D {
	private ui!: MwlPresentation<PresentationId>;
	private readonly changes = new Signal<void>();
	private beams = 3;
	private material = 'wood';
	private materials = ['wood', 'steel'];
	private showWindow = false;
	private created = 0;
	private destroyedAdapters = 0;
	private actionCount = 0;
	private state: PresentationState = {};

	create(): void {
		Input.bind('confirm', ['Enter', 'Space']);
		Input.bind('cancel', ['Escape']);
		Input.bind('next', ['Tab']);
		Input.bind('down', ['ArrowDown']);
		Input.bind('up', ['ArrowUp']);
		const baselineInput = Input.onAction.size,
			baselineThemes = themeChanged.size;
		const add = () => {
			this.beams++;
			this.actionCount++;
			this.notify();
		};
		const reorder = () => {
			this.materials.reverse();
			this.notify();
		};
		const open = () => {
			this.showWindow = true;
			this.notify();
		};
		const close = () => {
			this.showWindow = false;
			this.notify();
		};
		this.notify();
		this.ui = new MwlPresentation(presentationData, 'bridge', {
			parent: this.stage,
			state: () => this.state,
			actions: {
				add,
				reorder,
				open,
				close,
				choose: (item?: PresentationItem) => {
					this.material = String(item?.id);
					this.actionCount++;
					this.notify();
				},
				biome: () => this.ui.setContext(this.ui.activeContext ? '' : 'alpine'),
			},
			subscribe: (refresh) => {
				this.changes.add(refresh);
				return () => this.changes.remove(refresh);
			},
			adapters: {
				bridgeWorld: () => {
					this.created++;
					const view = new Shape2D();
					let tokens: Readonly<Record<string, number>> = {};
					let drawnBeams = -1;
					const draw = () => {
						view.clear().rect(0, 0, 640, 360).fill(tokens.sky);
						view.moveTo(0, 230)
							.lineTo(70, 100)
							.lineTo(160, 200)
							.lineTo(190, 240)
							.lineTo(190, 360)
							.lineTo(0, 360)
							.closePath()
							.fill(tokens.rock);
						view.moveTo(440, 240)
							.lineTo(530, 100)
							.lineTo(640, 220)
							.lineTo(640, 360)
							.lineTo(440, 360)
							.closePath()
							.fill(tokens.rock);
						view.rect(190, 290, 250, 70).fill(tokens.water);
						for (let i = 0; i < this.beams; i++) {
							const x = 190 + i * 35;
							view.moveTo(x, 230)
								.lineTo(x + 35, 230)
								.lineTo(x + 17, 200)
								.closePath()
								.stroke({ color: tokens.warning, width: 4 });
						}
						drawnBeams = this.beams;
					};
					return {
						view,
						restyle: (context) => {
							tokens = context.tokens;
							draw();
						},
						update: () => {
							if (drawnBeams !== this.beams) draw();
						},
						destroy: () => {
							this.destroyedAdapters++;
						},
					};
				},
			},
		});
		this.ui.resize(Game.current.width, Game.current.height);
		this.onDestroy.add(() => this.ui.destroy());
		window.__MWG_PRESENTATION__ = {
			ui: this.ui,
			add,
			reorder,
			open,
			close,
			setRows: (ids) => {
				this.materials = ids;
				this.notify();
			},
			context: (name) => this.ui.setContext(name),
			remove: () => this.ui.destroy(),
			snapshot: () => ({
				beams: this.beams,
				material: this.material,
				showWindow: this.showWindow,
				created: this.created,
				destroyed: this.destroyedAdapters,
				changes: this.changes.size,
				input: Input.onAction.size,
				themes: themeChanged.size,
				baselineInput,
				baselineThemes,
				actions: this.actionCount,
				caption: String(this.state.caption),
			}),
		};
	}
	private notify(): void {
		this.state = {
			caption: `BRIDGE EDITOR   ${this.beams} beams / ${this.material}`,
			cost: this.beams * 12,
			budget: 240,
			showWindow: this.showWindow,
			materials: this.materials.map((id) => ({
				id,
				text: id === 'wood' ? 'Wood' : 'Steel',
				selected: id === this.material,
				disabled: false,
			})),
		};
		this.changes.dispatch();
	}
	override update(dt: number): void {
		this.ui.update(dt);
	}
	override resize(width: number, height: number): void {
		this.ui?.resize(width, height);
	}
}

async function main(): Promise<void> {
	await load([...presentationData.assets]);
	await new Game({ background: 0x111827 }).start(BridgeEditor);
}
void main().catch((error) => console.error(error));

import { Random } from '../../src/core/index.ts';
import { Game, Scene2D } from '../../src/two-d/index.ts';
import { SpriteSheet, TintedSprite } from '../../src/two-d/render/index.ts';
import { Label, theme, Window, WindowStack, ListView, MessageBox } from '../../src/two-d/ui/index.ts';
import {
	Creature,
	TypeMatrix,
	Party,
	battleOrder,
	checkEvolution,
	type Species,
	type Move,
	type EvolutionRule,
} from '../../src/battle/index.ts';
import * as Resources from '../../src/assets/index.ts';
import { contentCatalog } from '../../src/mwl/index.ts';
import { gameData } from './generated/game-data.ts';
import tileset from '../assets/tiles.json' with { type: 'json' };

/**
 * A creature battle: one slime against one wolf, exercising `mwg/battle` end to end -
 * `Creature` (itself built on `mwg/actors`' `StatBlock`/`Progression`), `TypeMatrix`,
 * `Party`, `battleOrder`, and `checkEvolution` on a win. As with the other examples, the
 * damage formula here is this example's own invention, not something `mwg` prescribes. The
 * species, moves, type matchups, and evolution are authored in `content/battle.mwl` and
 * compiled before this module is bundled.
 */

const TILES = 'tiles.png';
const { tiles, tileSize } = tileset;

interface DamageEffect {
	power: number;
}

const CONTENT = contentCatalog(gameData);
const speciesById = new Map<string, Species>(
	CONTENT.monsters.map((monster) => [
		monster.id,
		{
			id: monster.id,
			types: monster.types ?? [],
			baseStats: { ...(monster.baseStats ?? {}), maxHp: monster.hp },
		},
	]),
);
const moveById = new Map<string, Move<DamageEffect>>(
	CONTENT.moves.map((move) => [
		move.id,
		{
			id: move.id,
			type: move.type,
			target: move.target,
			effects: { power: move.power ?? 5 },
		},
	]),
);
const species = (id: string): Species =>
	speciesById.get(id) ??
	(() => {
		throw new Error(`unknown battle species: ${id}`);
	})();
const move = (id: string): Move<DamageEffect> =>
	moveById.get(id) ??
	(() => {
		throw new Error(`unknown battle move: ${id}`);
	})();
const SLIME = species('slime');
const WOLF = species('wolf');
const TACKLE = move('tackle');
const OOZE_SLAM = move('ooze_slam');
const PLAYER_MOVES: Move<DamageEffect>[] = [TACKLE, OOZE_SLAM];
const BITE = move('bite');
const HOWL = move('howl');
const ENEMY_MOVES: Move<DamageEffect>[] = [BITE, HOWL];

const TYPES = new TypeMatrix();
for (const matchup of CONTENT.typeMatchups) TYPES.set(matchup.attacker, matchup.defender, matchup.multiplier);

const EVOLUTION: EvolutionRule<Species>[] = CONTENT.evolutions
	.filter((rule) => speciesById.has(rule.from) && speciesById.has(rule.into))
	.map((rule) => ({ at: (level) => level >= rule.level, into: species(rule.into) }));

/** a modest 15%-per-level growth, applied to every base stat alike */
function growthRule(base: Readonly<Record<string, number>>, level: number): Record<string, number> {
	const factor = 1 + (level - 1) * 0.15;
	const out: Record<string, number> = {};
	for (const [name, value] of Object.entries(base)) out[name] = Math.round(value * factor);
	return out;
}

function damage(attacker: Creature, defender: Creature, move: Move<DamageEffect>): number {
	const power = move.effects?.power ?? 5;
	const base = Math.max(1, power + attacker.stats.get('attack') - defender.stats.get('defense'));
	const multiplier = TYPES.multiplierFor(move.type, defender.species.types);
	return Math.max(1, Math.round(base * multiplier));
}

class BattleScene extends Scene2D {
	private windows = new WindowStack();

	private player!: Creature;
	private enemy!: Creature;
	private playerHp = 0;
	private enemyHp = 0;
	private party!: Party<Creature>;

	private playerLabel!: Label;
	private enemyLabel!: Label;
	private logLabel!: Label;
	private log: string[] = [];

	override create(): void {
		const sheet = SpriteSheet.grid(TILES, tileSize);

		this.player = new Creature({ species: SLIME, level: 1, deriveStats: growthRule });
		this.enemy = new Creature({ species: WOLF, level: 2, deriveStats: growthRule });
		this.playerHp = this.player.stats.get('maxHp');
		this.enemyHp = this.enemy.stats.get('maxHp');

		this.party = new Party<Creature>(1);
		this.party.add(this.player);

		const enemySprite = new TintedSprite(sheet.get(tiles.BLOB));
		enemySprite.scale.set(4);
		enemySprite.x = 260;
		enemySprite.y = 30;
		this.stage.addChild(enemySprite);

		const playerSprite = new TintedSprite(sheet.get(tiles.RAT));
		playerSprite.scale.set(4);
		playerSprite.x = 60;
		playerSprite.y = 150;
		this.stage.addChild(playerSprite);

		this.enemyLabel = new Label({ color: theme().color.text });
		this.enemyLabel.x = 220;
		this.enemyLabel.y = 10;
		this.stage.addChild(this.enemyLabel);

		this.playerLabel = new Label({ color: theme().color.text });
		this.playerLabel.x = 20;
		this.playerLabel.y = 230;
		this.stage.addChild(this.playerLabel);

		this.logLabel = new Label({ color: theme().color.textDim, size: 12, wrapWidth: 380 });
		this.logLabel.x = 20;
		this.logLabel.y = 270;
		this.stage.addChild(this.logLabel);

		this.stage.addChild(this.windows);
		this.refreshLabels();
		this.say(`A wild ${WOLF.id} appears!`);
		this.openMoveMenu();
	}

	private openMoveMenu(): void {
		const window = new Window({
			width: 220,
			height: 110,
			title: 'Choose a move',
			modal: true,
			closable: false,
			anchor: 'bottom',
		});

		const list = new ListView({
			width: window.contentWidth,
			height: window.contentHeight,
			items: PLAYER_MOVES.map((move) => ({ text: `${move.id} (${move.type})`, value: move })),
			onSelect: (item) => {
				this.windows.pop();
				void this.resolveRound(item.value as Move<DamageEffect>);
			},
		});

		window.content.addChild(list);
		//the list is offered actions first, and only while its window is on top of the stack
		window.delegate = list;
		this.windows.push(window);
	}

	private async resolveRound(playerMove: Move<DamageEffect>): Promise<void> {
		const enemyMove = Random.element(ENEMY_MOVES) ?? BITE;

		//one round's worth of ordering - priority then speed - not mwg/roguelike's Scheduler,
		//which is continuous dungeon time rather than a single simultaneous-selection round
		const order = battleOrder([
			{ who: 'player' as const, speed: this.player.stats.get('speed') },
			{ who: 'enemy' as const, speed: this.enemy.stats.get('speed') },
		]);

		for (const turn of order) {
			if (this.playerHp <= 0 || this.enemyHp <= 0) break;

			if (turn.who === 'player') {
				const amount = damage(this.player, this.enemy, playerMove);
				this.enemyHp -= amount;
				this.say(`${SLIME.id} uses ${playerMove.id} for ${amount}.`);
			} else {
				const amount = damage(this.enemy, this.player, enemyMove);
				this.playerHp -= amount;
				this.say(`${WOLF.id} uses ${enemyMove.id} for ${amount}.`);
			}
			this.refreshLabels();
		}

		if (this.enemyHp <= 0) {
			await this.onVictory();
		} else if (this.playerHp <= 0) {
			await this.onDefeat();
		} else {
			this.openMoveMenu();
		}
	}

	private async onVictory(): Promise<void> {
		this.say(`${WOLF.id} was defeated!`);

		this.player.progression.addExperience(40);
		this.player.refreshStats();
		this.playerHp = Math.min(this.playerHp, this.player.stats.get('maxHp'));
		this.refreshLabels();

		const evolvesInto = checkEvolution(EVOLUTION, this.player.progression.level);
		let text = `You win! ${SLIME.id} is now level ${this.player.progression.level}.`;
		if (evolvesInto) text += ` It's ready to evolve into a ${evolvesInto.id}!`;

		await this.showMessage(text);
	}

	private async onDefeat(): Promise<void> {
		this.say(`${SLIME.id} fainted...`);
		await this.showMessage('You have no more moves. The wolf pads away, uninterested in a fight it already won.');
	}

	private showMessage(text: string): Promise<void> {
		return new Promise((resolve) => {
			this.windows.push(
				new MessageBox({ width: 380, height: 100, pages: [{ text }], anchor: 'top', onDone: () => resolve() }),
			);
		});
	}

	private refreshLabels(): void {
		this.playerLabel.setText(
			`${SLIME.id}  Lv.${this.player.progression.level}  HP ${Math.max(0, this.playerHp)}/${this.player.stats.get('maxHp')}`,
		);
		this.enemyLabel.setText(`${WOLF.id}  HP ${Math.max(0, this.enemyHp)}/${this.enemy.stats.get('maxHp')}`);
	}

	private say(line: string): void {
		this.log.push(line);
		if (this.log.length > 4) this.log.shift();
		this.logLabel.setText(this.log.join('\n'));
	}

	override resize(width: number, height: number): void {
		this.windows.setViewport(width, height);
	}

	override update(dt: number): void {
		this.windows.update(dt);
	}
}

async function main(): Promise<void> {
	const game = new Game({
		canvas: document.getElementById('game') as HTMLCanvasElement,
		background: 0x1a1420,
	});

	await Resources.load([TILES]);
	await game.start(BattleScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`,
	);
});

import { Container } from 'pixi.js';
import { Game, Scene, Input, Random, SaveSystem } from '../../src/core/index.ts';
import { TintedSprite, SpriteSheet, TileMap, Camera } from '../../src/render/index.ts';
import { Label, theme, Window, WindowStack, ListView, type ListItem } from '../../src/ui/index.ts';
import {
	StatBlock,
	Inventory,
	EquipmentSlots,
	type EquippableItem,
} from '../../src/actors/index.ts';
import {
	generateDungeon,
	FieldOfView,
	Pathfinder,
	Scheduler,
	rectCenter,
	furthestRoom,
	type Level,
	type Step,
} from '../../src/roguelike/index.ts';
import * as Resources from '../../src/assets/index.ts';
import tileset from '../assets/tiles.json' with { type: 'json' };

/**
 * A small dungeon crawl, to exercise the roguelike module against the rest of the
 * framework - and, on top of that, an SPD-shaped mockup: the hero's attack, defense and
 * max HP are a `StatBlock` (base strength/vitality/armor, with attack/maxHp/defense as
 * derived stats), items on the floor go into an `Inventory`, and equipping a weapon or
 * armor from it applies `Modifier`s through `EquipmentSlots` - the same machinery
 * `mwg/actors` gives any game, not something built specially for this example. Permadeath
 * was already true here before any of this: `kill()` on the hero ends the run, no continue.
 *
 * Monsters stay on the older, simpler `damage: [min, max]` shape rather than a full
 * StatBlock each - the point being made is that equipment changes the *hero's* numbers,
 * not that every creature needs the heavier machinery.
 */

const TILES = 'tiles.png';
const { tiles, tileSize } = tileset;

const VIEW_RADIUS = 7;

/** how a cell looks in each of the three states a roguelike map has */
const LIGHT = {
	visible: 0xffffff,
	/** seen before, not now: dark and drained of colour, so it reads as memory */
	remembered: 0x35354a,
	unseen: 0x000000,
};

interface Creature extends Step {
	name: string;
	sprite: TintedSprite;
	hp: number;
	maxHp: number;
	damage: [number, number];
	/** subtracted from incoming damage before it lands; monsters simply have none */
	defense?: number;
	speed: number;
	isHero?: boolean;
}

/** an item definition - what a game keeps once it decides what its own items do */
interface Item extends EquippableItem {
	id: string;
	name: string;
	slot?: 'weapon' | 'armor';
	/** HP restored when used, for a consumable rather than something worn */
	heal?: number;
}

const ITEMS: Record<string, Item> = {
	dagger: {
		id: 'dagger',
		name: 'a rusty dagger',
		slot: 'weapon',
		modifiers: [{ stat: 'strength', op: 'add', value: 1 }],
	},
	sword: {
		id: 'sword',
		name: 'an iron sword',
		slot: 'weapon',
		modifiers: [{ stat: 'strength', op: 'add', value: 6 }],
	},
	armor: {
		id: 'armor',
		name: 'leather armor',
		slot: 'armor',
		modifiers: [{ stat: 'armor', op: 'add', value: 3 }],
	},
	potion: { id: 'potion', name: 'a healing potion', heal: 8 },
};

/** the tint a ground item's sprite gets, so items read apart from the gold coin they borrow */
const ITEM_TINT: Record<string, number> = {
	sword: 0x9fb8e0,
	armor: 0x7fbf7f,
	potion: 0xff8080,
};

interface GroundItem extends Step {
	item: Item;
	sprite: TintedSprite;
}

/**
 * The permadeath pattern: one named slot, autosaved on every descend, deleted on death so
 * there is nothing left to continue - `mwg/core`'s `SaveSystem` doing exactly that, wired
 * into a real game loop rather than left as an unused primitive.
 */
interface DungeonSave {
	depth: number;
	heroHp: number;
	strength: number;
	vitality: number;
	armor: number;
	weaponId: string | null;
	armorId: string | null;
	bag: Array<{ id: string; quantity: number }>;
}

const SAVE_SLOT = 'run';
const saves = new SaveSystem<DungeonSave>({ namespace: 'mwg-dungeon-demo', version: 1 });

/** set from `main()` before the scene starts, and consumed once in `create()` */
let pendingSave: DungeonSave | null = null;

class DungeonScene extends Scene {
	private sheet!: SpriteSheet;
	private camera!: Camera;
	private map!: TileMap;
	private level!: Level;
	private fov!: FieldOfView;
	private pathfinder!: Pathfinder;
	private scheduler = new Scheduler<Creature>();
	private windows = new WindowStack();

	private creatures: Creature[] = [];
	private hero!: Creature;
	private stairs: Step = { x: 0, y: 0 };
	private stairsSprite!: TintedSprite;
	private creatureLayer = new Container();
	private groundItems: GroundItem[] = [];

	private heroStats!: StatBlock;
	private heroBag!: Inventory;
	private heroEquipment!: EquipmentSlots<'weapon' | 'armor', Item>;

	private depth = 1;
	private heroHp = 0;
	private log: string[] = [];
	private logLabel!: Label;
	private statusLabel!: Label;

	private awaitingInput = false;
	private gameOver = false;

	override create(): void {
		this.sheet = SpriteSheet.grid(TILES, tileSize);

		this.camera = new Camera({ zoom: 3, deadzone: 0.25 });
		this.stage.addChild(this.camera.world);

		this.heroStats = new StatBlock({
			base: { strength: 10, vitality: 5, armor: 0 },
			derived: [
				{ name: 'attack', from: (s) => Math.max(1, Math.floor(s.strength / 3)) },
				{ name: 'maxHp', from: (s) => 10 + s.vitality * 2 },
				{ name: 'defense', from: (s) => s.armor },
			],
		});
		this.heroBag = new Inventory({ capacity: 30 });
		this.heroBag.add({ id: 'dagger', quantity: 1, weight: 2 });
		this.heroBag.add({ id: 'potion', quantity: 2, stackable: true, weight: 0.5 });
		this.heroEquipment = new EquipmentSlots<'weapon' | 'armor', Item>(['weapon', 'armor'], this.heroStats);
		this.heroHp = this.heroStats.get('maxHp');

		this.buildInterface();
		this.stage.addChild(this.windows);

		const continuing = pendingSave !== null;
		if (pendingSave) {
			this.applySave(pendingSave);
			pendingSave = null;
		}

		this.enterLevel();
		this.say(
			continuing
				? 'Continuing your run.'
				: 'A new run begins. There is no continuing after you die.'
		);

		Input.onAction.add((action) => this.onAction(action));
	}

	// -------------------------------------------------------------- save/load

	private toSaveData(): DungeonSave {
		return {
			depth: this.depth,
			heroHp: this.heroHp,
			strength: this.heroStats.base('strength'),
			vitality: this.heroStats.base('vitality'),
			armor: this.heroStats.base('armor'),
			weaponId: this.heroEquipment.get('weapon')?.id ?? null,
			armorId: this.heroEquipment.get('armor')?.id ?? null,
			bag: this.heroBag.items.map((entry) => ({ id: entry.id, quantity: entry.quantity })),
		};
	}

	private applySave(data: DungeonSave): void {
		this.depth = data.depth;
		this.heroHp = data.heroHp;
		this.heroStats.setBase('strength', data.strength);
		this.heroStats.setBase('vitality', data.vitality);
		this.heroStats.setBase('armor', data.armor);

		this.heroBag = new Inventory({ capacity: 30 });
		for (const entry of data.bag) {
			this.heroBag.add({ id: entry.id, quantity: entry.quantity, stackable: entry.id === 'potion', weight: 1 });
		}

		if (data.weaponId) this.heroEquipment.equip('weapon', ITEMS[data.weaponId]);
		if (data.armorId) this.heroEquipment.equip('armor', ITEMS[data.armorId]);
	}

	/** called on every descend - autosave, not a single "save game" button */
	private saveRun(): void {
		saves.save(
			SAVE_SLOT,
			this.toSaveData(),
			`Floor ${this.depth}, HP ${Math.max(0, this.hero.hp)}/${this.hero.maxHp}`
		);
	}

	// ------------------------------------------------------------- the level

	private enterLevel(): void {
		this.gameOver = false;
		this.camera.world.removeChildren();
		this.creatures = [];
		this.groundItems = [];
		this.scheduler.clear();

		//seeded per depth, so the same run replays identically and a floor can be regenerated
		this.level = Random.withSeed(this.depth * 7919 + 13, () =>
			generateDungeon({ width: 64, height: 40, rooms: 12 })
		);

		this.map = new TileMap({
			width: this.level.width,
			height: this.level.height,
			sheet: this.sheet,
		});
		this.map.addLayer('terrain', this.terrainFrames());
		this.camera.world.addChild(this.map);
		this.camera.world.addChild(this.creatureLayer);
		this.creatureLayer.removeChildren();

		this.fov = new FieldOfView(this.level);
		this.pathfinder = new Pathfinder(this.level);

		//the hero carries across floors: descending is not a fresh start, and arriving
		//wounded on a harder floor is most of what makes going down a decision
		const start = rectCenter(this.level.rooms[0]);
		this.hero = this.spawn({
			name: 'you',
			frame: tiles.HERO,
			at: start,
			hp: this.heroHp,
			damage: [1, 1],
			speed: 1,
			isHero: true,
		});
		this.syncHeroCombatFields();
		this.hero.hp = Math.min(this.hero.hp, this.hero.maxHp);

		this.placeStairs(start);
		this.populate();
		this.placeItems();

		this.camera.setBounds({ minX: 0, minY: 0, maxX: this.map.worldWidth, maxY: this.map.worldHeight });
		this.camera.snapTo(...this.worldOf(this.hero));
		this.camera.follow(this.heroPoint());

		this.say(`You descend to floor ${this.depth}.`);
		this.refresh();
		this.runTurns();
	}

	/** the level's terrain, as frame indices for the tile map */
	private terrainFrames(): number[] {
		const frames: number[] = [];
		for (let y = 0; y < this.level.height; y++) {
			for (let x = 0; x < this.level.width; x++) {
				if (this.level.passable(x, y)) {
					//two floor variants, so a room does not read as graph paper
					frames.push(Random.chance(0.15) ? tiles.FLOOR_WORN : tiles.FLOOR);
				} else {
					//walls with a floor below them show their top face, as in a dungeon crawler
					frames.push(this.level.passable(x, y + 1) ? tiles.WALL : tiles.WALL_TOP);
				}
			}
		}
		return frames;
	}

	private placeStairs(from: Step): void {
		const room = furthestRoom(this.level, from) ?? this.level.rooms[0];
		this.stairs = rectCenter(room);

		this.stairsSprite = new TintedSprite(this.sheet.get(tiles.DOOR));
		this.stairsSprite.x = this.stairs.x * tileSize;
		this.stairsSprite.y = this.stairs.y * tileSize;
		this.creatureLayer.addChild(this.stairsSprite);
	}

	private populate(): void {
		//more, and slightly tougher, the deeper you go
		const count = 3 + this.depth;

		for (let i = 0; i < count; i++) {
			const room = this.level.rooms[Random.int(1, this.level.rooms.length)];
			const at = {
				x: Random.range(room.left, room.right),
				y: Random.range(room.top, room.bottom),
			};
			if (this.creatureAt(at.x, at.y)) continue;

			const tough = Random.chance(Math.min(0.5, this.depth * 0.12));
			this.spawn(
				tough
					? { name: 'a blob', frame: tiles.BLOB, at, hp: 8 + this.depth, damage: [2, 4], speed: 0.6 }
					: { name: 'a rat', frame: tiles.RAT, at, hp: 4 + this.depth, damage: [1, 3], speed: 1 }
			);
		}
	}

	/** a couple of items on the floor each level - a weapon or armor upgrade, or a potion */
	private placeItems(): void {
		const pool = ['sword', 'armor', 'potion', 'potion'];

		for (let i = 0; i < 2; i++) {
			const room = this.level.rooms[Random.int(1, this.level.rooms.length)];
			const at = {
				x: Random.range(room.left, room.right),
				y: Random.range(room.top, room.bottom),
			};
			if (this.creatureAt(at.x, at.y) || this.groundItemAt(at.x, at.y)) continue;

			const item = ITEMS[Random.element(pool)!];
			const sprite = new TintedSprite(this.sheet.get(tiles.COIN));
			sprite.x = at.x * tileSize;
			sprite.y = at.y * tileSize;
			sprite.tint = ITEM_TINT[item.id] ?? 0xffffff;
			this.creatureLayer.addChild(sprite);

			this.groundItems.push({ x: at.x, y: at.y, item, sprite });
		}
	}

	private spawn(options: {
		name: string;
		frame: number;
		at: Step;
		hp: number;
		damage: [number, number];
		speed: number;
		isHero?: boolean;
	}): Creature {
		const sprite = new TintedSprite(this.sheet.get(options.frame));
		sprite.x = options.at.x * tileSize;
		sprite.y = options.at.y * tileSize;
		this.creatureLayer.addChild(sprite);

		const creature: Creature = {
			name: options.name,
			sprite,
			x: options.at.x,
			y: options.at.y,
			hp: options.hp,
			maxHp: options.hp,
			damage: options.damage,
			speed: options.speed,
			isHero: options.isHero,
		};

		this.creatures.push(creature);
		//a small random delay, so a room of monsters does not act in lockstep
		this.scheduler.add(creature, options.isHero ? 0 : Random.float(0.1, 0.9));
		return creature;
	}

	// -------------------------------------------------------------- the loop

	/**
	 * Runs turns until it is the hero's again.
	 *
	 * The whole game is driven from here: monsters act one after another with no waiting,
	 * then the loop parks on the hero and returns to the browser. That is what makes a
	 * turn-based game feel instant — nothing is animated between two monster moves.
	 */
	private runTurns(): void {
		for (let guard = 0; guard < 1000; guard++) {
			//the hero leaves the scheduler on death, so without this the loop would run on
			//with no player turn to stop at, and the monsters would beat a corpse
			if (this.gameOver) return;

			const actor = this.scheduler.peek();
			if (!actor) return;

			if (actor.isHero) {
				this.awaitingInput = true;
				this.refresh();
				return;
			}

			this.takeMonsterTurn(actor);
			this.scheduler.spend(1);
		}
	}

	private onAction(action: string): boolean {
		//a window (the inventory) takes input first; the map only sees what it lets through
		if (this.windows.blocksWorld) return false;
		if (this.gameOver || !this.awaitingInput) return false;

		if (action === 'menu') {
			this.openInventory();
			return true;
		}

		if (action === 'descend' && this.hero.x === this.stairs.x && this.hero.y === this.stairs.y) {
			//a little is recovered on the way down, so descending is a real choice rather
			//than a slow slide into an unwinnable state
			this.heroHp = Math.min(this.heroStats.get('maxHp'), this.hero.hp + 3);
			this.depth++;
			this.enterLevel();
			this.saveRun();
			return true;
		}

		const move = MOVES[action];
		if (!move) return false;

		this.awaitingInput = false;
		this.takeHeroTurn(move);

		if (this.hero.hp > 0) {
			this.scheduler.spend(1);
			this.runTurns();
		}
		return true;
	}

	private takeHeroTurn(move: Step): void {
		if (move.x === 0 && move.y === 0) {
			this.say('You wait.');
			return;
		}

		const target = { x: this.hero.x + move.x, y: this.hero.y + move.y };
		const occupant = this.creatureAt(target.x, target.y);

		if (occupant) {
			this.attack(this.hero, occupant);
		} else if (this.level.passable(target.x, target.y)) {
			this.moveTo(this.hero, target);
			this.pickUpAt(target.x, target.y);
			if (target.x === this.stairs.x && target.y === this.stairs.y) {
				this.say('Stairs down. Press > to descend.');
			}
		} else {
			this.say('A wall.');
		}
	}

	private takeMonsterTurn(monster: Creature): void {
		//monsters only act on what they can see, which is also what stops the whole level
		//converging on the hero from the moment the floor loads
		if (!this.fov.isVisible(monster.x, monster.y)) return;

		const distance = Math.max(Math.abs(monster.x - this.hero.x), Math.abs(monster.y - this.hero.y));
		if (distance === 1) {
			this.attack(monster, this.hero);
			return;
		}

		const blocked = new Set(
			this.creatures
				.filter((c) => c !== monster && c !== this.hero)
				.map((c) => this.level.index(c.x, c.y))
		);

		const step = this.pathfinder.step(monster, this.hero, { blocked });
		if (step) this.moveTo(monster, step);
	}

	private moveTo(creature: Creature, to: Step): void {
		creature.x = to.x;
		creature.y = to.y;
		creature.sprite.x = to.x * tileSize;
		creature.sprite.y = to.y * tileSize;
	}

	private attack(attacker: Creature, defender: Creature): void {
		const raw = Random.range(attacker.damage[0], attacker.damage[1]);
		const damage = Math.max(1, raw - (defender.defense ?? 0));
		defender.hp -= damage;

		//a white flash on the one that was hit: the additive colour term, used for what it
		//is for. a multiply tint could only darken, which reads as nothing happening
		defender.sprite.lerpTint(0xffffff, 0.85);

		const subject = attacker.isHero ? 'You hit' : `${capitalise(attacker.name)} hits`;
		const object = defender.isHero ? 'you' : defender.name;
		this.say(`${subject} ${object} for ${damage}.`);

		if (defender.hp <= 0) this.kill(defender);
	}

	private kill(creature: Creature): void {
		this.scheduler.remove(creature);
		this.creatures.splice(this.creatures.indexOf(creature), 1);
		creature.sprite.destroy();

		if (creature.isHero) {
			this.say(`You die here, on floor ${this.depth}.`);
			saves.delete(SAVE_SLOT);
			this.say('Your save is gone. No continuing.');
			this.awaitingInput = false;
			this.gameOver = true;
		} else {
			this.say(`${capitalise(creature.name)} dies.`);
		}
	}

	private creatureAt(x: number, y: number): Creature | null {
		return this.creatures.find((c) => c.x === x && c.y === y) ?? null;
	}

	private groundItemAt(x: number, y: number): GroundItem | null {
		return this.groundItems.find((g) => g.x === x && g.y === y) ?? null;
	}

	// ------------------------------------------------------------ inventory

	private pickUpAt(x: number, y: number): void {
		const index = this.groundItems.findIndex((g) => g.x === x && g.y === y);
		if (index === -1) return;

		const { item, sprite } = this.groundItems[index];
		this.groundItems.splice(index, 1);
		sprite.destroy();

		this.heroBag.add({ id: item.id, quantity: 1, stackable: item.id === 'potion', weight: 1 });
		this.say(`You pick up ${item.name}.`);
	}

	/** recomputes the hero's combat numbers from heroStats - called once, and after equipping */
	private syncHeroCombatFields(): void {
		const attack = this.heroStats.get('attack');
		this.hero.damage = [attack, attack + 3];
		this.hero.defense = this.heroStats.get('defense');
		this.hero.maxHp = this.heroStats.get('maxHp');
	}

	private openInventory(): void {
		const window = new Window({ width: 260, height: 200, title: 'Inventory' });

		const items: ListItem[] = this.heroBag.items.map((entry) => {
			const def = ITEMS[entry.id];
			const worn = def.slot && this.heroEquipment.get(def.slot) === def;
			const count = entry.quantity > 1 ? ` x${entry.quantity}` : '';
			return { text: `${def.name}${count}${worn ? ' (worn)' : ''}`, value: entry.id };
		});
		if (items.length === 0) items.push({ text: '(nothing carried)', disabled: true });

		const list = new ListView({
			width: window.contentWidth,
			height: window.contentHeight,
			items,
			onSelect: (item) => this.useItem(item.value as string),
		});

		window.content.addChild(list);
		//the list is offered actions first, and only while its window is on top of the stack
		window.delegate = list;
		this.windows.push(window);
		window.onClose.add(() => {
			this.refresh();
			return false;
		});
	}

	private useItem(id: string): void {
		const def = ITEMS[id];

		if (def.slot) {
			this.heroEquipment.equip(def.slot, def);
			this.heroBag.remove(id, 1);
			this.syncHeroCombatFields();
			this.hero.hp = Math.min(this.hero.hp, this.hero.maxHp);
			this.say(`You equip ${def.name}.`);
		} else if (def.heal) {
			this.heroBag.remove(id, 1);
			this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + def.heal);
			this.say(`You drink ${def.name} and recover ${def.heal} HP.`);
		}

		this.windows.pop();
	}

	// -------------------------------------------------------------- drawing

	/**
	 * Pushes the field of view onto the map's colours.
	 *
	 * Three states, three treatments: lit where you stand, dim and cold where you have been,
	 * black where you have not. The tile map applies a cell's colour across every layer at
	 * once, which is why a wall and the floor under it dim together.
	 */
	private refresh(): void {
		this.fov.update(this.hero.x, this.hero.y, VIEW_RADIUS);

		for (let y = 0; y < this.level.height; y++) {
			for (let x = 0; x < this.level.width; x++) {
				if (this.fov.isVisible(x, y)) {
					//falls off with distance, so the edge of sight is a gradient not a circle
					const light = 0.45 + 0.55 * this.fov.lightAt(x, y);
					const value = Math.round(0xff * light);
					this.map.setCellColor(x, y, (value << 16) | (value << 8) | value);
				} else if (this.fov.isExplored(x, y)) {
					this.map.setCellColor(x, y, LIGHT.remembered);
				} else {
					this.map.setCellColor(x, y, LIGHT.unseen);
				}
			}
		}

		//creatures are only drawn where you can actually see them
		for (const creature of this.creatures) {
			creature.sprite.visible = creature.isHero === true || this.fov.isVisible(creature.x, creature.y);
			if (!creature.isHero) creature.sprite.resetColor();
		}
		this.stairsSprite.visible = this.fov.isExplored(this.stairs.x, this.stairs.y);
		this.stairsSprite.tint = this.fov.isVisible(this.stairs.x, this.stairs.y)
			? LIGHT.visible
			: LIGHT.remembered;

		for (const ground of this.groundItems) {
			ground.sprite.visible = this.fov.isVisible(ground.x, ground.y) || this.fov.isExplored(ground.x, ground.y);
		}

		const weapon = this.heroEquipment.get('weapon')?.name ?? 'bare hands';
		const armor = this.heroEquipment.get('armor')?.name ?? 'no armor';
		this.statusLabel.setText(
			`Floor ${this.depth}    HP ${Math.max(0, this.hero.hp)}/${this.hero.maxHp}    ` +
				`ATK ${this.heroStats.get('attack')}  DEF ${this.heroStats.get('defense')}    ` +
				`${weapon}, ${armor}    (Tab for inventory)`
		);
	}

	private buildInterface(): void {
		this.statusLabel = new Label({ color: theme().color.textHighlight, size: 12 });
		this.statusLabel.x = 12;
		this.statusLabel.y = 10;
		this.stage.addChild(this.statusLabel);

		this.logLabel = new Label({ color: theme().color.textDim, size: 12 });
		this.logLabel.x = 12;
		this.stage.addChild(this.logLabel);
	}

	private say(line: string): void {
		this.log.push(line);
		//only the last few lines, so the log never grows without bound
		if (this.log.length > 5) this.log.shift();
		this.logLabel.setText(this.log.join('\n'));
	}

	private worldOf(creature: Creature): [number, number] {
		return [(creature.x + 0.5) * tileSize, (creature.y + 0.5) * tileSize];
	}

	/** a live point the camera can follow, rather than a copy taken once */
	private heroPoint(): { x: number; y: number } {
		const hero = this.hero;
		return {
			get x() {
				return (hero.x + 0.5) * tileSize;
			},
			get y() {
				return (hero.y + 0.5) * tileSize;
			},
		};
	}

	override resize(_width: number, height: number): void {
		this.camera.setViewport(_width, height);
		this.windows.setViewport(_width, height);
		if (this.logLabel) this.logLabel.y = height - 90;
	}

	override update(dt: number): void {
		this.camera.update(dt);
		this.map?.cull(this.camera);
		this.windows.update(dt);

		//the hit flash fades out over a moment rather than snapping back
		for (const creature of this.creatures) {
			if (!creature.isHero && creature.sprite.colorAdd !== 0) creature.sprite.resetColor();
		}
	}
}

const MOVES: Record<string, Step> = {
	up: { x: 0, y: -1 },
	down: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
	upLeft: { x: -1, y: -1 },
	upRight: { x: 1, y: -1 },
	downLeft: { x: -1, y: 1 },
	downRight: { x: 1, y: 1 },
	wait: { x: 0, y: 0 },
};

function capitalise(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

async function main(): Promise<void> {
	const game = new Game({
		canvas: document.getElementById('game') as HTMLCanvasElement,
		background: 0x08080c,
	});

	//descending is its own action, so it can be rebound like everything else
	Input.bind('descend', ['Period', 'NumpadDecimal']);

	//a save from a previous visit continues that run; there is none once you have died
	pendingSave = saves.load(SAVE_SLOT)?.state ?? null;

	await Resources.load([TILES]);
	await game.start(DungeonScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`
	);
});

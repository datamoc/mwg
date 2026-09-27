import { Rectangle } from '../../src/two-d/pixi-interop.ts';
import { Node2D, Shape2D, Text2D } from '../../src/two-d/render/index.ts';
import { Board, Game, Input, Scene2D, Button, Checkbox, Label, Slider } from '../../src/index.ts';
import kbk from '../../data/tablebases/KBK.json' with { type: 'json' };
import knk from '../../data/tablebases/KNK.json' with { type: 'json' };
import kqk from '../../data/tablebases/KQK.json' with { type: 'json' };
import krk from '../../data/tablebases/KRK.json' with { type: 'json' };

const LIGHT = 0xd8c6a1;
const DARK = 0x765b49;
const HIGHLIGHT = 0xe3b85b;
const CHECK = 0xc65b4e;
const PIECES: Record<string, string> = {
	whiteKing: '♔',
	whiteQueen: '♕',
	whiteRook: '♖',
	whiteBishop: '♗',
	whiteKnight: '♘',
	whitePawn: '♙',
	blackKing: '♚',
	blackQueen: '♛',
	blackRook: '♜',
	blackBishop: '♝',
	blackKnight: '♞',
	blackPawn: '♟',
};

//holding a direction repeats it, after an initial pause, at a steady cadence
const REPEAT_DELAY = 0.4;
const REPEAT_RATE = 0.12;

//engine settings the player cycles at the keyboard: depth caps the search, time is
//the real control (see moveBudgetMs), and the engine always answers (see think)
const DEPTHS = [2, 3, 4, 6, 8];
const TIME_MS = [2000, 5000, 15000];
const PROMOTIONS: Board.PromotionKind[] = ['queen', 'rook', 'bishop', 'knight'];

//blitz presets on the slider, FIDE-style base+increment; the slider position is an
//index into this list, so its own labels stay honest about what each stop means
const BLITZ: Array<{ name: string; base: number; inc: number }> = [
	{ name: '1+0', base: 60000, inc: 0 },
	{ name: '2+1', base: 120000, inc: 1000 },
	{ name: '3+0', base: 180000, inc: 0 },
	{ name: '3+2', base: 180000, inc: 2000 },
	{ name: '5+0', base: 300000, inc: 0 },
	{ name: '5+3', base: 300000, inc: 3000 },
	{ name: '10+0', base: 600000, inc: 0 },
	{ name: '15+10', base: 900000, inc: 10000 },
];

//a few main lines as UCI, public-domain opening facts; the book is compiled from
//them at startup by walking each line, so no position key is ever written by hand.
//Names sit on the line ends the way `OpeningBookEntry` documents: mid-line
//transpositions carry moves but no name.
const LINES: Array<{ name: string; moves: string[] }> = [
	{ name: 'Ruy Lopez', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'] },
	{ name: 'Italian Game', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'] },
	{ name: "Petrov's Defence", moves: ['e2e4', 'e7e5', 'g1f3', 'g8f6'] },
	{ name: 'Sicilian Defence', moves: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4'] },
	{ name: 'French Defence', moves: ['e2e4', 'e7e6', 'd2d4', 'd7d5'] },
	{ name: 'Caro-Kann Defence', moves: ['e2e4', 'c7c6', 'd2d4', 'd7d5'] },
	{ name: "Queen's Gambit Declined", moves: ['d2d4', 'd7d5', 'c2c4'] },
	{ name: 'Indian Defence', moves: ['d2d4', 'g8f6', 'c2c4', 'e7e6'] },
];

function buildBook(): Board.OpeningBook {
	const positions: Record<string, { moves: string[]; name?: string }> = {};
	for (const line of LINES) {
		const state = Board.startingChess();
		for (const uci of line.moves) {
			const key = Board.positionKey(state);
			const entry = (positions[key] ??= { moves: [] });
			if (!entry.moves.includes(uci)) entry.moves.push(uci);
			Board.applyMove(state, Board.parseUciMove(uci));
		}
		const end = (positions[Board.positionKey(state)] ??= { moves: [] });
		end.name ??= line.name;
	}
	return { version: 1, positions };
}

const BOOK = buildBook();

//the tables ship bundled because `file://` cannot fetch them later; the WDL
//checkbox gates their use, not their presence, and each file validates on load
const TABLES: Record<string, Board.LoadedEnding> = {
	KBK: Board.loadTablebaseEnding(kbk as Board.TablebaseEnding),
	KNK: Board.loadTablebaseEnding(knk as Board.TablebaseEnding),
	KQK: Board.loadTablebaseEnding(kqk as Board.TablebaseEnding),
	KRK: Board.loadTablebaseEnding(krk as Board.TablebaseEnding),
};

const PROMO_LETTER: Record<Board.PromotionKind, string> = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };

function uci(move: { from: number; to: number; promotion?: Board.PromotionKind }): string {
	const square = (sq: number): string => 'abcdefgh'[sq & 7] + String((sq >> 3) + 1);
	return square(move.from) + square(move.to) + (move.promotion ? PROMO_LETTER[move.promotion] : '');
}

/**
 * Worker lanes for the example: half the detected cores, rounded down, so the UI
 * thread keeps breathing room (a quarter of the machine stays out of the search).
 * Unknown hardware falls back to two lanes rather than the library default.
 */
function workerSpecs(): { cores: number | null; jobs: number } {
	const cores =
		typeof globalThis.navigator?.hardwareConcurrency === 'number' &&
		Number.isInteger(globalThis.navigator.hardwareConcurrency) &&
		globalThis.navigator.hardwareConcurrency > 0
			? globalThis.navigator.hardwareConcurrency
			: null;
	return { cores, jobs: cores === null ? 2 : Math.max(1, Math.floor(cores / 2)) };
}

/** heap megabytes where the browser reports them (Chromium), otherwise null */
function heapMB(): number | null {
	const memory = (globalThis.performance as { memory?: { usedJSHeapSize?: unknown } } | undefined)?.memory;
	return typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize / 1048576 : null;
}

/** centipawns for a quiet edge, `#` once the score is really a mate */
function fmtScore(score: number): string {
	if (score > 90000 || score < -90000) return '#';
	return (score >= 0 ? '+' : '') + String(score);
}

function fmtClock(ms: number): string {
	const total = Math.max(0, Math.ceil(ms / 1000));
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

class ChessScene extends Scene2D {
	private state = Board.startingChess();
	private cursor = Board.sq('e2');
	private selected: Board.ChessSquare | null = null;
	private board = new Node2D();
	private status!: Text2D;
	private panel = new Node2D();
	private info!: Label;
	private blitzValue!: Label;
	private blitzHelp!: Label;
	private newGameBtn!: Button;
	private cores: number | null = null;
	private jobs = 2;
	private lastTechLine = '';
	private blackBox!: Checkbox;
	private fuzzyBox!: Checkbox;
	private bookBox!: Checkbox;
	private wdlBox!: Checkbox;
	private boardSize = 0;
	private heldFor: Record<string, number> = { up: 0, down: 0, left: 0, right: 0 };
	private humanSide: Board.ChessSide = 'white';
	private depthIndex = 1;
	private timeIndex = 1;
	private promotionIndex = 0;
	private thinking = false;
	private thinkId = 0;
	private thinkAbort: AbortController | null = null;
	private useFuzzy = false;
	private usePonder = false;
	private useBlitz = false;
	private useBook = false;
	private useWdl = false;
	private blitzIndex = 3;
	private clocks: { white: number; black: number } | null = null;
	private lastClockLine = '';
	private halfmove = 0;
	private resigned: Board.ChessSide | null = null;
	private resignReason: 'resigned' | 'flagged' | null = null;
	private ponderAbort: AbortController | null = null;
	private ponderId = 0;
	private ponderKey = '';
	private ponderReport: string[] | null = null;
	private lastReport: string[] | null = null;
	private reachedDepth: number | null = null;
	private openingName: string | null = null;

	override create(): void {
		Input.bind('side', ['KeyB']);
		Input.bind('depth', ['KeyE']);
		Input.bind('time', ['KeyT']);
		Input.bind('promote', ['KeyP']);
		Input.bind('fuzzy', ['KeyF']);
		Input.bind('book', ['KeyO']);
		Input.bind('tables', ['KeyW']);
		this.stage.addChild(this.board);
		this.status = new Text2D({
			text: '',
			style: { fill: 0xd0cedb, fontFamily: 'monospace', fontSize: 15, align: 'center' },
		});
		this.status.anchor.set(0.5, 0);
		this.stage.addChild(this.status);
		const specs = workerSpecs();
		this.cores = specs.cores;
		this.jobs = specs.jobs;
		this.buildPanel();
		this.stage.addChild(this.panel);
		this.resize(Game.current.width, Game.current.height);
		this.refresh();
		this.maybeThink();
		this.maybePonder();
	}

	private option(y: number, caption: string, checked: boolean, onChange: (on: boolean) => void): Checkbox {
		const box = new Checkbox({ checked, size: 20 });
		box.position.set(0, y);
		const label = new Label({ text: caption, size: 14, color: 0xd0cedb });
		label.position.set(28, y - 1);
		box.onChange.add(onChange);
		this.panel.addChild(box, label);
		return box;
	}

	private buildPanel(): void {
		let y = 0;
		this.blackBox = this.option(0, 'Play black (B)', false, (on) => {
			this.reset(on ? 'black' : 'white');
		});
		y += 28;
		this.fuzzyBox = this.option(y, 'Fuzzy moves (F)', false, (on) => {
			this.useFuzzy = on;
			this.refresh();
		});
		y += 28;
		this.option(y, 'Ponder on your time', false, (on) => {
			this.usePonder = on;
			if (!on) this.stopPonder();
			else this.maybePonder();
			this.refresh();
		});
		y += 28;
		this.option(y, 'Blitz clock', false, (on) => {
			this.useBlitz = on;
			this.clocks = on ? this.freshClocks() : null;
			this.refresh();
		});
		y += 28;
		this.bookBox = this.option(y, 'Opening book (O)', false, (on) => {
			this.useBook = on;
			this.refresh();
		});
		y += 28;
		this.wdlBox = this.option(y, 'WDL tables (W)', false, (on) => {
			this.useWdl = on;
			this.refresh();
		});
		y += 32;
		const slider = new Slider({ width: 190, min: 0, max: BLITZ.length - 1, step: 1, value: this.blitzIndex });
		slider.position.set(0, y);
		this.blitzValue = new Label({ text: BLITZ[this.blitzIndex].name, size: 14, color: 0xd0cedb });
		this.blitzValue.position.set(198, y - 3);
		slider.onChange.add((value) => {
			this.blitzIndex = Math.max(0, Math.min(BLITZ.length - 1, Math.round(value)));
			this.describeBlitz();
			//a new control starts both clocks over; the position stands
			if (this.useBlitz) this.clocks = this.freshClocks();
			this.refresh();
		});
		this.panel.addChild(slider, this.blitzValue);
		y += 26;
		//what the slider stop means: base minutes each plus increment seconds a move
		this.blitzHelp = new Label({ text: '', size: 12, color: 0x8f8ca3 });
		this.blitzHelp.position.set(0, y);
		this.panel.addChild(this.blitzHelp);
		this.describeBlitz();
		y += 26;
		const concede = new Button({ width: 140, height: 34, text: 'Concede' });
		concede.position.set(0, y);
		concede.onClick.add(() => this.concede());
		this.panel.addChild(concede);
		y += 42;
		//the rematch offer: hidden while a game is live, the visible affordance once it ends
		this.newGameBtn = new Button({ width: 140, height: 34, text: 'New game' });
		this.newGameBtn.position.set(0, y);
		this.newGameBtn.visible = false;
		this.newGameBtn.onClick.add(() => this.reset(this.humanSide));
		this.panel.addChild(this.newGameBtn);
		y += 46;
		this.info = new Label({ text: '', size: 13, color: 0xd0cedb, wrapWidth: 292 });
		this.info.position.set(0, y);
		this.panel.addChild(this.info);
	}

	private freshClocks(): { white: number; black: number } {
		const base = BLITZ[this.blitzIndex].base;
		return { white: base, black: base };
	}

	private describeBlitz(): void {
		const control = BLITZ[this.blitzIndex];
		this.blitzValue.setText(control.name);
		this.blitzHelp.setText(`${control.base / 60000} min each + ${control.inc / 1000}s a move`);
	}

	private budgetLabel(): string {
		return this.useBlitz ? `blitz ${BLITZ[this.blitzIndex].name}` : `${TIME_MS[this.timeIndex] / 1000}s/move`;
	}

	/**
	 * The engine's time management: the depth setting is only a ceiling, the clock
	 * decides. Off the blitz clock it is the per-move allowance; on it, a twentieth
	 * of the remaining time plus half the increment, so the flag stays distant and
	 * a 3+2 game still searches deep in a rich middlegame.
	 */
	private moveBudgetMs(): number {
		if (this.useBlitz && this.clocks) {
			const remaining = this.clocks[this.state.turn];
			return Math.max(500, Math.min(30000, remaining / 20 + BLITZ[this.blitzIndex].inc / 2));
		}
		return TIME_MS[this.timeIndex];
	}

	override resize(width: number, height: number): void {
		const panelW = 300;
		const wide = width >= 980;
		if (wide) {
			this.boardSize = Math.min(width - panelW - 80, height - 140, 560);
			const boardX = (width - panelW - this.boardSize) / 2;
			const boardY = Math.max(40, (height - this.boardSize) / 2);
			this.board.position.set(boardX, boardY);
			this.status?.position.set(boardX + this.boardSize / 2, boardY + this.boardSize + 16);
			this.panel.position.set(boardX + this.boardSize + 28, boardY);
		} else {
			this.boardSize = Math.max(220, Math.min(width - 40, height - 660, 560));
			const boardX = (width - this.boardSize) / 2;
			this.board.position.set(boardX, 24);
			this.status?.position.set(width / 2, 24 + this.boardSize + 12);
			this.panel.position.set(Math.max(8, (width - panelW) / 2), 24 + this.boardSize + 100);
		}
		this.refresh();
	}

	override update(dt: number): void {
		const directions: Record<string, [number, number]> = {
			up: [0, 1],
			down: [0, -1],
			left: [-1, 0],
			right: [1, 0],
		};
		for (const [action, [dx, dy]] of Object.entries(directions)) {
			if (Input.justPressed(action)) {
				this.heldFor[action] = 0;
				this.moveCursor(dx, dy);
			} else if (Input.isDown(action)) {
				this.heldFor[action] += dt;
				if (this.heldFor[action] >= REPEAT_DELAY) {
					this.heldFor[action] -= REPEAT_RATE;
					this.moveCursor(dx, dy);
				}
			} else {
				this.heldFor[action] = 0;
			}
		}
		if (Input.justPressed('confirm')) this.confirm();
		if (Input.justPressed('cancel')) this.reset(this.humanSide);
		//the checkbox owns the side swap; toggling it runs the same onChange reset
		if (Input.justPressed('side')) this.blackBox.toggle();
		if (Input.justPressed('depth')) {
			this.depthIndex = (this.depthIndex + 1) % DEPTHS.length;
			this.refresh();
		}
		if (Input.justPressed('time')) {
			this.timeIndex = (this.timeIndex + 1) % TIME_MS.length;
			this.refresh();
		}
		if (Input.justPressed('promote')) {
			this.promotionIndex = (this.promotionIndex + 1) % PROMOTIONS.length;
			this.refresh();
		}
		if (Input.justPressed('fuzzy')) this.toggleBox('fuzzy');
		if (Input.justPressed('book')) this.toggleBox('book');
		if (Input.justPressed('tables')) this.toggleBox('wdl');
		this.tickClock(dt);
		//memory drifts while clocks do not run: refresh the tech line when it moves
		const tech = this.techLine();
		if (tech !== this.lastTechLine) {
			this.lastTechLine = tech;
			this.refresh();
		}
	}

	private toggleBox(which: 'fuzzy' | 'book' | 'wdl'): void {
		if (which === 'fuzzy') this.fuzzyBox.toggle();
		else if (which === 'book') this.bookBox.toggle();
		else this.wdlBox.toggle();
	}

	private tickClock(dt: number): void {
		if (!this.useBlitz || !this.clocks || this.isOver() || Board.gameResult(this.state) !== 'ongoing') return;
		const side = this.state.turn;
		this.clocks[side] -= dt * 1000;
		if (this.clocks[side] <= 0) {
			this.clocks[side] = 0;
			this.thinkId++;
			this.thinkAbort?.abort();
			this.thinkAbort = null;
			this.thinking = false;
			this.stopPonder();
			this.resigned = side;
			this.resignReason = 'flagged';
			this.refresh();
			return;
		}
		const line = this.clockLine();
		if (line !== this.lastClockLine) {
			this.lastClockLine = line;
			this.refresh();
		}
	}

	private clockLine(): string {
		if (!this.useBlitz || !this.clocks) return '';
		return `clock W ${fmtClock(this.clocks.white)} · B ${fmtClock(this.clocks.black)} (${BLITZ[this.blitzIndex].name})`;
	}

	private isOver(): boolean {
		return this.resigned !== null || Board.gameResult(this.state) !== 'ongoing';
	}

	private moveCursor(dx: number, dy: number): void {
		const file = (this.cursor & 7) + dx;
		const rank = (this.cursor >> 3) + dy;
		if (file >= 0 && file < 8 && rank >= 0 && rank < 8) this.cursor = rank * 8 + file;
		this.refresh();
	}

	private clickSquare(square: Board.ChessSquare): void {
		if (this.isOver()) return;
		this.cursor = square;
		this.confirm();
	}

	/** a fresh position, optionally swapping which side the human plays */
	private depthText(): string {
		return `depth ${this.reachedDepth ?? '–'}/${DEPTHS[this.depthIndex]}`;
	}

	private reset(side: Board.ChessSide): void {
		this.thinkId++;
		this.thinkAbort?.abort();
		this.thinkAbort = null;
		this.thinking = false;
		this.stopPonder();
		this.humanSide = side;
		this.state = Board.startingChess();
		this.selected = null;
		this.cursor = side === 'white' ? Board.sq('e2') : Board.sq('e7');
		this.halfmove = 0;
		this.resigned = null;
		this.resignReason = null;
		this.clocks = this.useBlitz ? this.freshClocks() : null;
		this.lastReport = null;
		this.ponderReport = null;
		this.reachedDepth = null;
		this.openingName = null;
		this.refresh();
		this.maybeThink();
		this.maybePonder();
	}

	private concede(): void {
		if (this.isOver()) return;
		this.thinkId++;
		this.thinkAbort?.abort();
		this.thinkAbort = null;
		this.thinking = false;
		this.stopPonder();
		this.resigned = this.humanSide;
		this.resignReason = 'resigned';
		this.refresh();
	}

	/** one move with the clocks and the fifty-move counter kept alongside */
	private applyTracked(move: Board.ChessMove): void {
		const mover = this.state.turn;
		const piece = this.state.board[move.from];
		const capture =
			move.to === this.state.enPassant && piece?.kind === 'pawn' ? true : this.state.board[move.to] !== null;
		const reset = piece?.kind === 'pawn' || capture || move.promotion !== undefined;
		Board.applyMove(this.state, move);
		this.halfmove = reset ? 0 : this.halfmove + 1;
		if (this.clocks) this.clocks[mover] += BLITZ[this.blitzIndex].inc;
		//the name sticks once a known line ends: the middlegame keeps saying
		//which opening it came from, the way a GUI's opening label does
		const entry = Board.probeBook(BOOK, this.state);
		if (entry?.name) this.openingName = entry.name;
	}

	private confirm(): void {
		if (this.thinking || this.isOver()) return;
		const piece = this.state.board[this.cursor];
		const moves = Board.legalMoves(this.state);
		if (this.selected === null) {
			if (piece?.side === this.state.turn && moves.some((move) => move.from === this.cursor))
				this.selected = this.cursor;
		} else {
			const candidates = moves.filter(
				(candidate) => candidate.from === this.selected && candidate.to === this.cursor,
			);
			//a promotion square offers one candidate per piece; the P key picks which
			const wanted = PROMOTIONS[this.promotionIndex];
			const move = candidates.find((candidate) => candidate.promotion === wanted) ?? candidates[0];
			if (move) {
				this.stopPonder();
				this.ponderReport = null;
				this.applyTracked(move);
				this.selected = null;
				this.maybeThink();
			} else if (piece?.side === this.state.turn && moves.some((candidate) => candidate.from === this.cursor)) {
				this.selected = this.cursor;
			} else {
				this.selected = null;
			}
		}
		this.refresh();
	}

	/** starts the engine reply when it is the engine's turn and nothing is thinking yet */
	private maybeThink(): void {
		if (this.thinking || this.isOver()) return;
		if (Board.gameResult(this.state) !== 'ongoing') return;
		if (this.state.turn === this.humanSide) return;
		void this.think();
	}

	/**
	 * The table move the way `tools/play-uci.mjs` picks it: every successor probed,
	 * a forced mate beating any unprobed capture line, otherwise all successors
	 * probing or the search takes the move instead. The halfmove count is the
	 * position's own, the way the adapter passes it.
	 */
	private tablebest(): { move: Board.ChessMove; score: number; dtm: number; outcome: string } | null {
		let best: { move: Board.ChessMove; score: number; dtm: number; outcome: string } | null = null;
		let complete = true;
		for (const move of Board.legalMoves(this.state)) {
			const next = Board.cloneChess(this.state);
			Board.applyMove(next, move);
			const probe = Board.probeTablebase(TABLES, next, this.halfmove);
			if (!probe) {
				complete = false;
				continue;
			}
			const score =
				probe.outcome === 'loss' ? 100000 - probe.dtm : probe.outcome === 'draw' ? 0 : -(100000 - probe.dtm);
			if (best === null || score > best.score) best = { move, score, dtm: probe.dtm, outcome: probe.outcome };
		}
		if (best !== null && (best.score > 90000 || complete)) return best;
		return null;
	}

	/**
	 * Fuzziness as agreed: score every root move with a capped search one ply
	 * shallower, then draw uniformly among the moves within 25cp of the best, so
	 * two games rarely walk the same line. The top five make the info zone.
	 */
	private fuzzyPick(
		depth: number,
		signal: AbortSignal,
	): { move: Board.ChessMove; top: string[]; reached: number } | null {
		const moves = Board.legalMoves(this.state);
		if (!moves.length) return null;
		const scored: Array<{ move: Board.ChessMove; score: number }> = [];
		let reached = 0;
		for (const move of moves) {
			if (signal.aborted) break;
			const child = Board.cloneChess(this.state);
			Board.applyMove(child, move);
			const result = Board.searchTourney(child, { depth: Math.max(1, depth - 1), maxNodes: 12000, signal });
			reached = Math.max(reached, result.depth);
			scored.push({ move, score: -result.score });
		}
		if (!scored.length) {
			const result = Board.searchTourney(this.state, { depth: 1 });
			return result.move ? { move: result.move, top: [], reached: result.depth } : null;
		}
		const best = Math.max(...scored.map((entry) => entry.score));
		const near = scored.filter((entry) => entry.score >= best - 25);
		const pick = near[Math.floor(Math.random() * near.length)];
		const top = [...scored]
			.sort((a, b) => b.score - a.score)
			.slice(0, 5)
			.map((entry) => `${uci(entry.move)} ${fmtScore(entry.score)}`);
		return { move: pick.move, top, reached };
	}

	/**
	 * The engine reply, off the main thread: `searchTourneyAsync` scores root moves on
	 * workers, so the frames between the human's move and the answer keep rendering and
	 * the status line can say the engine is thinking. The clock aborts the search when
	 * time runs out; anything that invalidates the position (reset, side swap) aborts it
	 * sooner, and the generation check drops the stale answer if it ever arrives anyway.
	 * Book and tablebase answer first when their boxes are ticked, the way the UCI
	 * adapter orders them; fuzziness replaces the single best move with a near-best draw.
	 */
	private async think(): Promise<void> {
		const id = ++this.thinkId;
		this.thinking = true;
		this.refresh();
		const abort = new AbortController();
		this.thinkAbort = abort;
		const budget = this.moveBudgetMs();
		const timer = setTimeout(() => abort.abort(new Error('engine time ran out')), budget);
		try {
			const depth = DEPTHS[this.depthIndex];
			if (this.useBook) {
				const entry = Board.probeBook(BOOK, this.state);
				if (entry?.moves.length) {
					const played = entry.moves[Math.floor(Math.random() * entry.moves.length)];
					if (id !== this.thinkId) return;
					this.lastReport = [`book ${played}`];
					this.applyTracked(Board.parseUciMove(played));
					return;
				}
			}
			if (this.useWdl) {
				const tabled = this.tablebest();
				if (tabled) {
					if (id !== this.thinkId) return;
					this.lastReport = [`tablebase ${tabled.outcome} dtm ${tabled.dtm} ${uci(tabled.move)}`];
					this.applyTracked(tabled.move);
					return;
				}
			}
			if (this.useFuzzy) {
				const fuzzy = this.fuzzyPick(depth, abort.signal);
				if (id !== this.thinkId) return;
				if (fuzzy) {
					this.reachedDepth = fuzzy.reached;
					this.lastReport = [`fuzzy d${depth} ${uci(fuzzy.move)}`, ...fuzzy.top];
					this.applyTracked(fuzzy.move);
					return;
				}
			}
			const result = await Board.searchTourneyAsync(this.state, {
				depth,
				signal: abort.signal,
				jobs: this.jobs,
				timeMs: budget,
			});
			if (id !== this.thinkId) return;
			if (result.move) {
				this.reachedDepth = result.depth;
				this.lastReport = [
					`search d${result.depth} ${fmtScore(result.score)} n${result.nodes} ${uci(result.move)}`,
				];
				this.applyTracked(result.move);
			} else this.fallbackMove();
		} catch {
			//aborted by the clock or by a reset: a reset already moved on (see the id
			//check), so only the clock path falls back to a bounded synchronous reply
			if (id !== this.thinkId) return;
			this.fallbackMove();
		} finally {
			clearTimeout(timer);
			if (id === this.thinkId) {
				this.thinking = false;
				this.thinkAbort = null;
				this.refresh();
				this.maybePonder();
			}
		}
	}

	/**
	 * The answer of last resort: a shallow synchronous search, so a timed-out or
	 * over-budget engine still moves and the game can never soft-lock on its turn.
	 */
	private fallbackMove(): void {
		if (Board.gameResult(this.state) !== 'ongoing') return;
		const result = Board.searchTourney(this.state, { depth: 2 });
		if (result.move) {
			this.reachedDepth = result.depth;
			this.lastReport = [
				`search d${result.depth} ${fmtScore(result.score)} n${result.nodes} ${uci(result.move)}`,
			];
			this.applyTracked(result.move);
		}
	}

	/**
	 * Pondering: analyse the human's position on their time and show the verdict in
	 * the info zone. Display-only by design, the searches share no transposition
	 * table across calls, so nothing carries over; the first human move aborts it.
	 */
	private maybePonder(): void {
		if (!this.usePonder || this.thinking || this.isOver()) return;
		if (this.state.turn !== this.humanSide) return;
		const key = Board.positionKey(this.state);
		if (this.ponderKey === key) return;
		this.ponderId++;
		this.ponderAbort?.abort();
		const id = this.ponderId;
		const abort = new AbortController();
		this.ponderAbort = abort;
		this.ponderKey = key;
		void Board.searchTourneyAsync(this.state, {
			depth: DEPTHS[this.depthIndex],
			signal: abort.signal,
			jobs: this.jobs,
		})
			.then((result) => {
				if (id !== this.ponderId || !result.move) return;
				this.reachedDepth = result.depth;
				this.ponderReport = [`ponder d${result.depth} ${fmtScore(result.score)} ${uci(result.move)}`];
				this.refresh();
			})
			.catch(() => {
				//aborted by the human moving first: the move itself already refreshed
			});
	}

	private stopPonder(): void {
		this.ponderId++;
		this.ponderAbort?.abort();
		this.ponderAbort = null;
		this.ponderKey = '';
	}

	private headText(): string {
		if (this.resigned !== null) {
			const winner = this.resigned === 'white' ? 'Black' : 'White';
			const why = this.resignReason === 'flagged' ? 'on time' : 'by resignation';
			return `${winner.toUpperCase()} WINS ${why.toUpperCase()}`;
		}
		const result = Board.gameResult(this.state);
		if (result !== 'ongoing') return result.replace('-', ' ').toUpperCase();
		if (this.thinking) return `${this.state.turn === 'white' ? 'White' : 'Black'} is thinking…`;
		return `${this.state.turn === 'white' ? 'White' : 'Black'} to move`;
	}

	private techLine(): string {
		const heap = heapMB();
		return `workers ${this.jobs}${this.cores === null ? '' : `/${this.cores}`} · mem ${heap === null ? 'n/a' : `${heap.toFixed(0)}MB`}`;
	}

	private infoText(): string {
		const lines: string[] = [this.techLine()];
		const clock = this.clockLine();
		if (clock) lines.push(clock);
		if (this.openingName) lines.push(`opening ${this.openingName}`);
		lines.push(
			`engine ${this.depthText()} · ${this.budgetLabel()} · promote ${PROMOTIONS[this.promotionIndex][0].toUpperCase()}`,
		);
		if (this.lastReport) lines.push(...this.lastReport);
		else if (this.ponderReport) lines.push(...this.ponderReport);
		else lines.push(this.usePonder && this.state.turn === this.humanSide ? 'pondering…' : 'no search yet');
		if (this.ponderReport && this.lastReport) lines.push(...this.ponderReport);
		return lines.join('\n');
	}

	private refresh(): void {
		if (!this.board || !this.status || !this.boardSize) return;
		this.board.removeChildren().forEach((child) => child.destroy());
		const cell = this.boardSize / 8;
		const legal = Board.legalMoves(this.state);
		const targets = new Set(legal.filter((move) => move.from === this.selected).map((move) => move.to));
		const checkedKing = Board.inCheck(this.state, this.state.turn)
			? this.state.board.findIndex((piece) => piece?.kind === 'king' && piece.side === this.state.turn)
			: -1;
		for (let square = 0; square < 64; square++) {
			const file = square & 7;
			const rank = square >> 3;
			const color =
				square === this.cursor || square === this.selected
					? HIGHLIGHT
					: square === checkedKing
						? CHECK
						: (file + rank) % 2 === 0
							? LIGHT
							: DARK;
			const tileSquare = new Node2D();
			tileSquare.position.set(file * cell, (7 - rank) * cell);
			//an explicit hitArea makes the whole cell one hit target, so a dot or
			//piece glyph drawn on top of it never steals the click
			tileSquare.hitArea = new Rectangle(0, 0, cell, cell);
			tileSquare.eventMode = 'static';
			tileSquare.cursor = 'pointer';
			tileSquare.on('pointertap', () => this.clickSquare(square));
			tileSquare.addChild(new Shape2D().rect(0, 0, cell, cell).fill(color));
			if (targets.has(square))
				tileSquare.addChild(new Shape2D().circle(cell / 2, cell / 2, cell * 0.13).fill(0x49362f));
			const piece = this.state.board[square];
			if (piece) {
				const glyph = new Text2D({
					text: PIECES[`${piece.side}${piece.kind[0].toUpperCase()}${piece.kind.slice(1)}`] ?? '?',
					style: {
						fill: piece.side === 'white' ? 0xf8f1df : 0x17151c,
						fontFamily: 'serif',
						fontSize: cell * 0.72,
					},
				});
				glyph.anchor.set(0.5);
				glyph.position.set(cell / 2, cell / 2);
				tileSquare.addChild(glyph);
			}
			this.board.addChild(tileSquare);
		}
		this.status.text = this.statusText();
		this.info?.setText(this.infoText());
		if (this.newGameBtn) this.newGameBtn.visible = this.isOver();
	}

	private statusText(): string {
		const you = this.humanSide === 'white' ? 'White' : 'Black';
		return (
			`${this.headText()}\n` +
			`You play ${you} · engine ${this.depthText()} · ${this.budgetLabel()} · promote ${PROMOTIONS[this.promotionIndex][0].toUpperCase()}\n` +
			`click or arrows+Enter to move · B side · E depth · T time · P piece · F fuzzy · O book · W tables · Esc reset`
		);
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });
	await game.start(ChessScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`,
	);
});

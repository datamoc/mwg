import { Container, Graphics, Text } from 'pixi.js';
import { Board, Game, Input, Scene } from '../../src/index.ts';

const LIGHT = 0xd8c6a1;
const DARK = 0x765b49;
const HIGHLIGHT = 0xe3b85b;
const PIECES: Record<string, string> = {
	whiteKing: '♔', whiteQueen: '♕', whiteRook: '♖', whiteBishop: '♗', whiteKnight: '♘', whitePawn: '♙',
	blackKing: '♚', blackQueen: '♛', blackRook: '♜', blackBishop: '♝', blackKnight: '♞', blackPawn: '♟',
};

class ChessScene extends Scene {
	private state = Board.startingChess();
	private cursor = Board.sq('e2');
	private selected: Board.ChessSquare | null = null;
	private board = new Container();
	private status!: Text;
	private boardSize = 0;

	override create(): void {
		this.stage.addChild(this.board);
		this.status = new Text({ text: '', style: { fill: 0xd0cedb, fontFamily: 'monospace', fontSize: 15, align: 'center' } });
		this.status.anchor.set(0.5);
		this.stage.addChild(this.status);
		this.resize(Game.current.width, Game.current.height);
		this.refresh();
	}

	override resize(width: number, height: number): void {
		this.boardSize = Math.min(width - 40, height - 110, 560);
		this.board.position.set((width - this.boardSize) / 2, Math.max(48, (height - this.boardSize) / 2));
		this.status?.position.set(width / 2, this.board.position.y + this.boardSize + 24);
		this.refresh();
	}

	override update(): void {
		const directions: Record<string, [number, number]> = {
			up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
		};
		for (const [action, [dx, dy]] of Object.entries(directions)) {
			if (Input.justPressed(action)) {
				const file = (this.cursor & 7) + dx;
				const rank = (this.cursor >> 3) + dy;
				if (file >= 0 && file < 8 && rank >= 0 && rank < 8) this.cursor = rank * 8 + file;
				this.refresh();
			}
		}
		if (Input.justPressed('confirm')) this.confirm();
		if (Input.justPressed('cancel')) {
			this.state = Board.startingChess();
			this.selected = null;
			this.cursor = Board.sq('e2');
			this.refresh();
		}
	}

	private confirm(): void {
		const piece = this.state.board[this.cursor];
		const moves = Board.legalMoves(this.state);
		if (this.selected === null) {
			if (piece?.side === this.state.turn && moves.some((move) => move.from === this.cursor)) this.selected = this.cursor;
		} else {
			const move = moves.find((candidate) => candidate.from === this.selected && candidate.to === this.cursor);
			if (move) {
				Board.applyMove(this.state, { ...move, promotion: move.promotion ?? (this.state.board[this.selected]?.kind === 'pawn' ? 'queen' : undefined) });
				this.selected = null;
				if (this.state.turn === 'black' && Board.gameResult(this.state) === 'ongoing') {
					const reply = Board.chooseMove(this.state, { depth: 3 });
					if (reply) Board.applyMove(this.state, reply);
				}
			} else if (piece?.side === this.state.turn && moves.some((candidate) => candidate.from === this.cursor)) {
				this.selected = this.cursor;
			} else {
				this.selected = null;
			}
		}
		this.refresh();
	}

	private refresh(): void {
		if (!this.board || !this.status || !this.boardSize) return;
		this.board.removeChildren().forEach((child) => child.destroy());
		const cell = this.boardSize / 8;
		const legal = Board.legalMoves(this.state);
		const targets = new Set(legal.filter((move) => move.from === this.selected).map((move) => move.to));
		for (let square = 0; square < 64; square++) {
			const file = square & 7;
			const rank = square >> 3;
			const color = square === this.cursor || square === this.selected ? HIGHLIGHT : (file + rank) % 2 === 0 ? LIGHT : DARK;
			const tile = new Graphics().rect(file * cell, (7 - rank) * cell, cell, cell).fill(color);
			this.board.addChild(tile);
			if (targets.has(square)) this.board.addChild(new Graphics().circle(file * cell + cell / 2, (7 - rank) * cell + cell / 2, cell * 0.13).fill(0x49362f));
			const piece = this.state.board[square];
			if (piece) {
				const glyph = new Text({ text: PIECES[`${piece.side}${piece.kind[0].toUpperCase()}${piece.kind.slice(1)}`] ?? '?', style: { fill: piece.side === 'white' ? 0xf8f1df : 0x17151c, fontFamily: 'serif', fontSize: cell * 0.72 } });
				glyph.anchor.set(0.5);
				glyph.position.set(file * cell + cell / 2, (7 - rank) * cell + cell / 2);
				this.board.addChild(glyph);
			}
		}
		const result = Board.gameResult(this.state);
		this.status.text = result === 'ongoing' ? `${this.state.turn === 'white' ? 'White' : 'Black'} to move    arrows: cursor    Enter: select/move    Esc: reset` : `${result.replace('-', ' ').toUpperCase()}    Esc: reset`;
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });
	await game.start(ChessScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`);
});

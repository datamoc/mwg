export {
	startingChess,
	parseFen,
	cloneChess,
	legalMoves,
	applyMove,
	inCheck,
	gameResult,
	sq,
	squareName,
} from './chess.ts';
export type {
	ChessSide,
	ChessKind,
	ChessPiece,
	ChessSquare,
	PromotionKind,
	ChessMove,
	ChessCastling,
	ChessState,
	ChessResult,
} from './chess.ts';
export { chooseMove, search } from './Engine.ts';
export type { ChessEngineOptions, ChessSearchResult } from './Engine.ts';
export {
	BoardGrid,
	startingCheckers,
	checkersMoves,
	applyCheckersMove,
	startingGo,
	playGo,
	passGo,
	goResult,
	goScore,
	startingBackgammon,
	rollBackgammonDice,
	backgammonMoves,
	applyBackgammonMove,
	createDeck,
	shuffleDeck,
	deal,
	trickWinner,
	dealSolitaire,
	drawSolitaire,
	moveSolitaireTableau,
	moveSolitaireToFoundation,
	solitaireWon,
	rollDice,
	rollExpression,
	DiceCup,
	scoreDice,
} from './Classics.ts';
export type {
	BoardOwner,
	BoardPiece,
	CheckersSide,
	CheckersPiece,
	CheckersMove,
	CheckersState,
	GoStone,
	GoState,
	DiceCategory,
	TrickPlay,
	BackgammonState,
	BackgammonMove,
	CardSuit,
	CardRank,
	Card,
	SolitaireState,
} from './Classics.ts';
export { startingTactics, addTacticalUnit, canPlaceTacticalUnit, tacticalMoves, moveTacticalUnit, setTacticalOverwatch, triggerTacticalOverwatch, tacticalAttack, endTacticalTurn } from './Tactics.ts';
export type { TacticalShape, TacticalCell, TacticalUnit, TacticalState, TacticalMove, TacticalAttack } from './Tactics.ts';
export { startingArmy, recruit, recall, bankUnit, armyIncome, applyUpkeep } from './Army.ts';
export type { UnitTemplate, ArmyState, UpkeepRates } from './Army.ts';

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Value = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type CardColor = 'red' | 'black';

export interface Card {
  suit: Suit;
  value: Value;
  color: CardColor;
  numericValue: number;
}

export interface Player {
  id: string;
  hand: Card[];
  captures: Card[];
  score: number;
  isTurn: boolean;
}

export interface RoundScoreResult {
  player1Id: string;
  player1Points: number;
  player1Details: {
    mostClubs: boolean;
    moreCards: boolean;
    hasTenDiamonds: boolean;
    hasTwoClubs: boolean;
  };
  player2Id: string;
  player2Points: number;
  player2Details: {
    mostClubs: boolean;
    moreCards: boolean;
    hasTenDiamonds: boolean;
    hasTwoClubs: boolean;
  };
}

export interface GameState {
  roomId: string;
  tableCards: Card[];
  deck: Card[];
  players: {
    [playerId: string]: Player;
  };
  currentPlayerId: string;
  lastMove: Move | null;
  gameStatus: 'waiting' | 'active' | 'finished';
  lastRoundScore?: RoundScoreResult | null;
  lastCapturePlayerId?: string | null; // Track who made the last capture in the round
  forfeitedBy?: string | null; // Track which player forfeited (their player ID)
  currentHand?: number; // Track which hand number we're on (1-6)
  consecutiveTimeouts?: { [playerId: string]: number }; // Track consecutive timeouts per player for AFK detection
}

export interface Move {
  playerId: string;
  playedCard: Card;
  capturedCards: Card[];
  timestamp: number;
}

export interface Room {
  id: string;
  players: string[];
  gameState: GameState;
  createdAt: number;
  isMatchmaking?: boolean; // True if created via matchmaking (online game), false/null for custom lobbies
  coinsPaid?: { [playerId: string]: boolean }; // Track if each player has paid entry fee
  entryFee?: number; // Entry fee for matchmaking games
  reward?: number; // Reward for matchmaking games
  winCondition?: number; // Win condition (16 or 21 points) for matchmaking games
}

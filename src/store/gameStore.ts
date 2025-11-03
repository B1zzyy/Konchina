import { create } from 'zustand';
import { GameState, Card, Move, Player } from '@/lib/types';

interface GameStore {
  gameState: GameState | null;
  currentPlayerId: string | null;
  selectedCard: Card | null;
  selectedTableCards: Card[];
  isAnimating: boolean;

  // Actions
  setGameState: (state: GameState) => void;
  setCurrentPlayerId: (id: string) => void;
  setSelectedCard: (card: Card | null) => void;
  setSelectedTableCards: (cards: Card[]) => void;
  toggleTableCardSelection: (card: Card) => void;
  setIsAnimating: (animating: boolean) => void;
  resetSelections: () => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,
  currentPlayerId: null,
  selectedCard: null,
  selectedTableCards: [],
  isAnimating: false,

  setGameState: (state) => {
    console.log('[Store] Setting game state from Firebase:', state?.roomId);
    console.log('[Store] Table cards:', state?.tableCards?.map(c => `${c.value}${c.suit}`).join(', ') || 'none');
    console.log('[Store] Players in state:', state?.players ? Object.keys(state.players) : 'none');
    console.log('[Store] Deck size:', state?.deck?.length || 0);
    set({ gameState: state });
  },
  setCurrentPlayerId: (id) => set({ currentPlayerId: id }),
  setSelectedCard: (card) => {
    console.log('[Store] Setting selectedCard:', card ? `${card.value}${card.suit}` : 'null');
    set({ selectedCard: card });
  },
  setSelectedTableCards: (cards) => set({ selectedTableCards: cards }),
  toggleTableCardSelection: (card) =>
    set((state) => {
      const index = state.selectedTableCards.findIndex(
        (c) => c.suit === card.suit && c.value === card.value
      );
      if (index >= 0) {
        return {
          selectedTableCards: state.selectedTableCards.filter((_, i) => i !== index),
        };
      } else {
        return {
          selectedTableCards: [...state.selectedTableCards, card],
        };
      }
    }),
  setIsAnimating: (animating) => set({ isAnimating: animating }),
  resetSelections: () => {
    console.log('[Store] resetSelections called - clearing selectedCard and table cards');
    set({ selectedCard: null, selectedTableCards: [] });
  },
  resetGame: () => set({ 
    gameState: null, 
    currentPlayerId: null, 
    selectedCard: null, 
    selectedTableCards: [], 
    isAnimating: false 
  }),
}));

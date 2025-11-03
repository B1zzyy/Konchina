'use client';

import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Card } from '@/lib/types';
import { getCapturableCombinations } from '@/lib/gameLogic';

export function useGameLogic() {
  const { gameState, selectedCard, selectedTableCards, setSelectedTableCards } = useGameStore();

  // DISABLED: Auto-suggest removed - let players manually choose captures
  // useEffect(() => {
  //   if (!selectedCard || !gameState) return;
  //   const combinations = getCapturableCombinations(selectedCard, gameState.tableCards);
  //   // Player should always manually choose what to capture
  // }, [selectedCard, gameState, setSelectedTableCards]);

  const validateMove = (playedCard: Card, capturedCards: Card[]): boolean => {
    if (!gameState) return false;

    // Jack can capture all or nothing (but must capture all if capturing)
    if (playedCard.value === 'J') {
      return capturedCards.length === 0 || capturedCards.length === gameState.tableCards.length;
    }

    // Check if capture is valid
    if (capturedCards.length === 0) {
      return true; // Can always play without capturing
    }

    // Single match
    if (capturedCards.length === 1) {
      return capturedCards[0].value === playedCard.value;
    }

    // Summation
    const sum = capturedCards.reduce((acc, card) => acc + card.numericValue, 0);
    return sum === playedCard.numericValue;
  };

  return {
    validateMove,
  };
}

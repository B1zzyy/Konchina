'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Hand from './Hand';
import Table from './Table';
import Card from './Card';
import { Card as CardType, Move } from '@/lib/types';
import { useGameStore } from '@/store/gameStore';
import { getCapturableCombinations, canCapture } from '@/lib/gameLogic';
import CaptureAnimation from './CaptureAnimation';
import RoundScorePopup from './RoundScorePopup';
import GameEndPopup from './GameEndPopup';

interface GameBoardProps {
  onMakeMove: (playedCard: CardType, capturedCards: CardType[]) => void;
  onClearRoundScore?: () => void;
  isMyTurn: boolean;
}

export default function GameBoard({ onMakeMove, onClearRoundScore, isMyTurn }: GameBoardProps) {
  const {
    gameState,
    currentPlayerId,
    selectedCard,
    selectedTableCards,
    setSelectedCard,
    setSelectedTableCards,
    toggleTableCardSelection,
    resetSelections,
    setIsAnimating,
    isAnimating,
  } = useGameStore();

  const [animatingCards, setAnimatingCards] = useState<Set<string>>(new Set());
  const [animationMove, setAnimationMove] = useState<{ playedCard: CardType; capturedCards: CardType[]; playerId: string } | null>(null);
  const [showRoundScore, setShowRoundScore] = useState(false);
  const [showGameEnd, setShowGameEnd] = useState(false);

  const currentPlayer = gameState?.players[currentPlayerId || ''];
  const allPlayerIds = gameState ? Object.keys(gameState.players) : [];
  const opponentId = allPlayerIds.find((id) => id !== currentPlayerId) || null;
  const opponent = opponentId && gameState ? gameState.players[opponentId] : null;
  
  // A player can ALWAYS play a card if they have one selected
  // The card will be placed on the table if no capture is possible
  const canPlay = !!selectedCard;
  
  // Debug logging - check turn status
  useEffect(() => {
    console.log('[GameBoard] Player detection:', {
      currentPlayerId,
      allPlayerIds: allPlayerIds,
      hasCurrentPlayer: !!currentPlayer,
      opponentId,
      hasOpponent: !!opponent,
      playerCount: allPlayerIds.length,
      gameStateCurrentPlayer: gameState?.currentPlayerId,
      isMyTurn,
      isMyTurnFromProp: isMyTurn,
      isMyTurnCalculated: gameState?.currentPlayerId === currentPlayerId,
      selectedCard: selectedCard ? `${selectedCard.value}${selectedCard.suit}` : null,
      buttonShouldShow: isMyTurn && !!selectedCard,
      canPlay,
      isAnimating
    });
  }, [currentPlayerId, allPlayerIds, currentPlayer, opponentId, opponent, gameState?.currentPlayerId, isMyTurn, selectedCard, canPlay, isAnimating]);

  // Debug: Log table cards to verify sync
  useEffect(() => {
    if (gameState?.tableCards) {
      console.log(`[GameBoard] Player ${currentPlayerId} sees table cards:`, 
        gameState.tableCards.map(c => `${c.value}${c.suit}`).join(', '));
      console.log(`[GameBoard] Full gameState players:`, Object.keys(gameState.players));
      console.log(`[GameBoard] Current player ID: ${currentPlayerId}, Opponent ID: ${opponentId}`);
    }
  }, [gameState?.tableCards, currentPlayerId, gameState?.players, opponentId]);

  // Handle card selection from hand (single click)
  const handleCardClick = (card: CardType) => {
    console.log('[GameBoard] Card clicked:', {
      card: `${card.value}${card.suit}`,
      isMyTurn,
      isAnimating,
      willSelect: isMyTurn && !isAnimating,
      gameStateCurrentPlayer: gameState?.currentPlayerId,
      currentPlayerId
    });
    
    if (!isMyTurn) {
      console.log('[GameBoard] Card click ignored - not your turn. Current turn:', gameState?.currentPlayerId, 'Your ID:', currentPlayerId);
      return;
    }
    
    // Check if this card is already selected - if so, click again = lay it
    if (selectedCard && 
        selectedCard.suit === card.suit && 
        selectedCard.value === card.value) {
      // Same card clicked again - lay it without capture
      console.log('[GameBoard] Same card clicked again - laying without capture');
      handlePlayCardWithoutCapture(card);
      return;
    }
    
    // Special case: Jack automatically captures all cards on table
    if (card.value === 'J' && gameState && gameState.tableCards.length > 0) {
      console.log('[GameBoard] Jack clicked - auto-capturing all table cards');
      onMakeMove(card, gameState.tableCards);
      resetSelections();
      return;
    }
    
    // Single click - check if there are any valid capture options
    if (gameState && gameState.tableCards.length > 0) {
      const combinations = getCapturableCombinations(card, gameState.tableCards);
      const hasValidCaptures = combinations.length > 0;
      
      console.log('[GameBoard] Card click analysis:', {
        card: `${card.value}${card.suit}`,
        tableCardsCount: gameState.tableCards.length,
        validCombinations: combinations.length,
        hasValidCaptures
      });
      
      // If no valid captures exist, automatically lay the card
      if (!hasValidCaptures) {
        console.log('[GameBoard] No valid captures - auto-laying card');
        handlePlayCardWithoutCapture(card);
        return;
      }
    } else if (gameState && gameState.tableCards.length === 0) {
      // No cards on table - can't capture anything, auto-lay
      console.log('[GameBoard] No cards on table - auto-laying card');
      handlePlayCardWithoutCapture(card);
      return;
    }
    
    // There are valid captures - select the card for user to choose
    console.log('[GameBoard] Selecting card (valid captures available):', `${card.value}${card.suit}`);
    setSelectedCard(card);
    setSelectedTableCards([]); // Clear table selections
    
    if (gameState) {
      const combinations = getCapturableCombinations(card, gameState.tableCards);
      console.log('[GameBoard] Available capture combinations:', combinations);
    }
  };

  // Play card without any captures (for double-click)
  const handlePlayCardWithoutCapture = (card: CardType) => {
    if (!gameState || isAnimating || !isMyTurn) return;
    
    console.log('[GameBoard] Playing card without capture:', `${card.value}${card.suit}`);
    onMakeMove(card, []);
    resetSelections();
  };

  // Handle table card selection - auto-capture when valid
  const handleTableCardClick = (card: CardType) => {
    if (!isMyTurn || !selectedCard || !gameState) return;
    
    console.log('[GameBoard] Table card clicked:', `${card.value}${card.suit}`, {
      selectedCard: `${selectedCard.value}${selectedCard.suit}`,
      currentlySelected: selectedTableCards.map(c => `${c.value}${c.suit}`).join(', ')
    });
    
    // If card is already selected, deselect it (but don't auto-capture on deselect)
    if (selectedTableCards.some(c => c.suit === card.suit && c.value === card.value)) {
      console.log('[GameBoard] Deselecting card');
      toggleTableCardSelection(card);
      return;
    }

    // Check if adding this card could be part of a valid capture
    const newSelection = [...selectedTableCards, card];
    
    // Check if this selection could be valid
    const currentSum = newSelection.reduce((sum, c) => sum + c.numericValue, 0);
    const targetValue = selectedCard.numericValue;
    
    // Check if this forms a complete valid capture
    const isValidCompleteCapture = canCapture(selectedCard, newSelection, gameState.tableCards);
    
    // If it's a valid complete capture, auto-execute it
    if (isValidCompleteCapture) {
      console.log('[GameBoard] Valid capture detected - auto-executing:', {
        playedCard: `${selectedCard.value}${selectedCard.suit}`,
        capturedCards: newSelection.map(c => `${c.value}${c.suit}`).join(', ')
      });
      onMakeMove(selectedCard, newSelection);
      resetSelections();
      return;
    }
    
    // Special case: Jack captures all
    if (selectedCard.value === 'J' && gameState.tableCards.length > 0) {
      console.log('[GameBoard] Jack detected - auto-capturing all cards');
      onMakeMove(selectedCard, gameState.tableCards);
      resetSelections();
      return;
    }
    
    // Allow selection if it could be part of a valid capture:
    // 1. It's a single card that matches the played card value (single match)
    // 2. It's a single card that could start a summation (numeric value > 0 and <= target)
    // 3. It's multiple cards building a summation (sum <= target)
    
    const isSingleMatch = card.value === selectedCard.value;
    const isStartingSummation = newSelection.length === 1 && card.numericValue > 0 && card.numericValue <= targetValue;
    const isBuildingSummation = newSelection.length > 1 && currentSum <= targetValue;
    
    console.log('[GameBoard] Selection check:', {
      card: `${card.value}${card.suit}`,
      currentSum,
      targetValue,
      isSingleMatch,
      isStartingSummation,
      isBuildingSummation,
      isValidCompleteCapture,
      selectionLength: newSelection.length,
      selectedCards: newSelection.map(c => `${c.value}${c.suit}`).join(', ')
    });
    
    if (isValidCompleteCapture || isSingleMatch || isStartingSummation || isBuildingSummation) {
      console.log('[GameBoard] Adding card to selection');
      toggleTableCardSelection(card);
    } else {
      console.log('[GameBoard] Selection rejected - not a valid capture possibility');
    }
  };

  // Play the move
  const handlePlayCard = () => {
    console.log('[GameBoard] handlePlayCard called:', {
      hasSelectedCard: !!selectedCard,
      hasGameState: !!gameState,
      isAnimating,
      isMyTurn,
      tableCardsLength: gameState?.tableCards?.length || 0,
      selectedTableCardsLength: selectedTableCards.length
    });

    if (!selectedCard || !gameState || isAnimating) {
      console.log('[GameBoard] Early return - missing requirements');
      return;
    }

    if (!isMyTurn) {
      console.log('[GameBoard] Not your turn! Current turn:', gameState.currentPlayerId, 'Your ID:', currentPlayerId);
      return;
    }

    // Validate capture
    let capturedCards: CardType[] = [];
    if (selectedTableCards.length > 0) {
      if (canCapture(selectedCard, selectedTableCards, gameState.tableCards)) {
        capturedCards = selectedTableCards;
        console.log('[GameBoard] Capturing cards:', capturedCards.map(c => `${c.value}${c.suit}`).join(', '));
      } else {
        console.log('[GameBoard] Invalid capture attempt, playing without capture');
      }
    } else if (selectedCard.value === 'J' && gameState.tableCards.length > 0) {
      // Jack captures all (only if table has cards)
      capturedCards = gameState.tableCards;
      console.log('[GameBoard] Jack capturing all cards');
    } else {
      console.log('[GameBoard] No capture, playing card to table');
    }

    console.log('[GameBoard] Making move with:', {
      playedCard: `${selectedCard.value}${selectedCard.suit}`,
      capturedCards: capturedCards.length
    });

    // Don't set isAnimating here - let the lastMove animation handle it
    // This allows the move to go through immediately
    onMakeMove(selectedCard, capturedCards);
    resetSelections();
  };

  // Handle last move animation - track which move we've already animated
  const [lastAnimatedMove, setLastAnimatedMove] = useState<string | null>(null);
  
  useEffect(() => {
    if (!gameState?.lastMove) {
      // No move to animate - clear animation state
      if (isAnimating) {
        setIsAnimating(false);
      }
      return;
    }
    
    // Create unique key for this move
    const moveKey = `${gameState.lastMove.playerId}-${gameState.lastMove.timestamp}`;
    
    // If we've already animated this move, skip it and ensure animation is cleared
    if (lastAnimatedMove === moveKey) {
      if (isAnimating) {
        console.log('[GameBoard] Move already animated, clearing animation state');
        setIsAnimating(false);
        setAnimatingCards(new Set());
      }
      return;
    }
    
    // If already animating, wait for it to finish
    if (isAnimating) {
      return;
    }

    console.log('[GameBoard] Starting animation for move:', moveKey);
    const move = gameState.lastMove;
    const cardIds = [
      `${move.playedCard.suit}-${move.playedCard.value}`,
      ...move.capturedCards.map((c) => `${c.suit}-${c.value}`),
    ];

    // Set up animation data
    setAnimationMove({
      playedCard: move.playedCard,
      capturedCards: move.capturedCards,
      playerId: move.playerId,
    });
    setAnimatingCards(new Set(cardIds));
    setIsAnimating(true);
    setLastAnimatedMove(moveKey); // Mark this move as animated

    // Reset animation state after animation completes
    const timeoutId = setTimeout(() => {
      console.log('[GameBoard] Animation completed, clearing state');
      setAnimatingCards(new Set());
      setAnimationMove(null);
      setIsAnimating(false);
    }, 2500); // Increased duration for exit animation
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [gameState?.lastMove, isAnimating, lastAnimatedMove, setIsAnimating]);

  // Show round score popup when a round ends
  useEffect(() => {
    if (gameState?.lastRoundScore && !showRoundScore) {
      setShowRoundScore(true);
    }
  }, [gameState?.lastRoundScore, showRoundScore]);

  // Show game end popup when game is finished
  useEffect(() => {
    if (gameState?.gameStatus === 'finished' && !showGameEnd) {
      setShowGameEnd(true);
    }
  }, [gameState?.gameStatus, showGameEnd]);

  // Show loading only if gameState or currentPlayer is missing
  // Allow rendering even if opponent is null (waiting for second player)
  if (!gameState || !currentPlayer) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-white text-xl">Loading game...</div>
      </div>
    );
  }

  // If no opponent yet, show waiting message
  if (!opponent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-b from-green-900 to-green-700">
        <div className="text-white text-2xl mb-4">Waiting for opponent...</div>
        <div className="text-green-200 text-sm">Share your room code to invite a friend!</div>
        <div className="mt-8 flex gap-4">
          {/* Show your hand while waiting */}
          <div className="flex flex-col items-center">
            <div className="text-white text-sm mb-2">Your Cards</div>
            <div className="flex gap-2">
              {currentPlayer.hand.map((card, index) => (
                <Card
                  key={`waiting-${card.suit}-${card.value}-${index}`}
                  card={card}
                  isFaceUp={true}
                  size="md"
                />
              ))}
            </div>
          </div>
          {/* Show table cards */}
          {gameState.tableCards.length > 0 && (
            <div className="flex flex-col items-center">
              <div className="text-white text-sm mb-2">Table</div>
              <div className="flex gap-2">
                {gameState.tableCards.map((card, index) => (
                  <Card
                    key={`table-waiting-${card.suit}-${card.value}-${index}`}
                    card={card}
                    isFaceUp={true}
                    size="md"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-green-900 to-green-700 p-4">
      {/* Opponent Hand (Top) */}
      <div className="flex-1 flex items-center justify-center">
        <Hand
          cards={opponent.hand}
          isPlayer={false}
          isTurn={gameState.currentPlayerId !== currentPlayerId}
        />
      </div>

      {/* Table (Middle) */}
      <div className="flex-1 flex items-center justify-center my-4">
        <Table
          cards={gameState.tableCards}
          onCardClick={handleTableCardClick}
          selectedCards={selectedTableCards}
          canSelectMultiple={selectedCard?.value !== 'J'}
          animatingCardIds={animatingCards}
        />
      </div>

      {/* Player Hand (Bottom) */}
      <div className="flex-1 flex items-center justify-center flex-col gap-4">
        <Hand
          cards={currentPlayer.hand}
          isPlayer={true}
          onCardClick={handleCardClick}
          selectedCard={selectedCard}
          isTurn={isMyTurn}
        />

      </div>


      {/* Capture Animation Overlay */}
      {animationMove && animationMove.capturedCards.length > 0 && gameState && (
        <CaptureAnimation
          playedCard={animationMove.playedCard}
          capturedCards={animationMove.capturedCards}
          tableCards={gameState.tableCards}
          isCurrentPlayer={animationMove.playerId === currentPlayerId}
          onComplete={() => setAnimationMove(null)}
        />
      )}

      {/* Round Score Popup */}
      {showRoundScore && gameState?.lastRoundScore && (
        <RoundScorePopup
          roundScore={gameState.lastRoundScore}
          onClose={() => {
            setShowRoundScore(false);
            // Clear the round score from Firebase
            if (onClearRoundScore) {
              onClearRoundScore();
            }
          }}
        />
      )}

      {/* Game End Popup */}
      {showGameEnd && gameState?.gameStatus === 'finished' && (
        <GameEndPopup
          onClose={() => {
            setShowGameEnd(false);
          }}
        />
      )}
    </div>
  );
}

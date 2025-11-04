'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Hand from './Hand';
import Table from './Table';
import Card from './Card';
import { Card as CardType, Move, RoundScoreResult } from '@/lib/types';
import { useGameStore } from '@/store/gameStore';
import { getCapturableCombinations, canCapture } from '@/lib/gameLogic';
import CaptureAnimation from './CaptureAnimation';
import RoundScorePopup from './RoundScorePopup';
import GameEndPopup from './GameEndPopup';

interface GameBoardProps {
  onMakeMove: (playedCard: CardType, capturedCards: CardType[], isTimeoutMove?: boolean) => void;
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
  const [hasTenDiamonds, setHasTenDiamonds] = useState(false);
  const [hasTwoClubs, setHasTwoClubs] = useState(false);
  const lastRoundScoreRef = useRef<RoundScoreResult | null>(null);
  const capturesAtRoundStart = useRef<{ player: number; opponent: number }>({ player: 0, opponent: 0 });
  
  // Turn timer state
  const TURN_TIME_LIMIT = 15; // seconds
  const [timeRemaining, setTimeRemaining] = useState(TURN_TIME_LIMIT);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTurnRef = useRef<string | null>(null);

  const currentPlayer = gameState?.players[currentPlayerId || ''];
  const allPlayerIds = gameState ? Object.keys(gameState.players) : [];
  const opponentId = allPlayerIds.find((id) => id !== currentPlayerId) || null;
  const opponent = opponentId && gameState ? gameState.players[opponentId] : null;

  // Track special cards (10♦ and 2♣) - reset when new round starts
  useEffect(() => {
    if (!gameState || !currentPlayer || !opponent) return;

    const currentPlayerCaptures = currentPlayer.captures || [];
    const opponentCaptures = opponent.captures || [];

    // Detect when round score is cleared (new round started)
    const roundScoreWasCleared = lastRoundScoreRef.current !== null && gameState.lastRoundScore === null;
    
    if (roundScoreWasCleared) {
      // New round started - reset tracking and capture baseline
      setHasTenDiamonds(false);
      setHasTwoClubs(false);
      capturesAtRoundStart.current = {
        player: currentPlayerCaptures.length,
        opponent: opponentCaptures.length,
      };
    }

    // Update ref to track round score state
    lastRoundScoreRef.current = gameState.lastRoundScore;

    // Check captures made in current round (after baseline)
    const currentRoundPlayerCaptures = currentPlayerCaptures.slice(capturesAtRoundStart.current.player);
    const currentRoundOpponentCaptures = opponentCaptures.slice(capturesAtRoundStart.current.opponent);
    const currentRoundCaptures = [...currentRoundPlayerCaptures, ...currentRoundOpponentCaptures];
    
    const has10Diamonds = currentRoundCaptures.some((c) => c.value === '10' && c.suit === '♦');
    const has2Clubs = currentRoundCaptures.some((c) => c.value === '2' && c.suit === '♣');

    // Update tracking
    setHasTenDiamonds(has10Diamonds);
    setHasTwoClubs(has2Clubs);
  }, [gameState, currentPlayer, opponent]);
  
  // A player can ALWAYS play a card if they have one selected
  // The card will be placed on the table if no capture is possible
  const canPlay = !!selectedCard;

  // Turn timer logic - start/stop timer based on turn
  useEffect(() => {
    // Check if it's a new turn
    const currentTurnId = gameState?.currentPlayerId;
    const isNewTurn = currentTurnId && currentTurnId !== lastTurnRef.current;
    
    if (isNewTurn) {
      lastTurnRef.current = currentTurnId;
      // Clear any existing timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    
    // Start timer if it's my turn and timer isn't already active
    if (isMyTurn && gameState && !isAnimating && gameState.gameStatus === 'active') {
      if (!isTimerActive || isNewTurn) {
        setIsTimerActive(true);
        setTimeRemaining(TURN_TIME_LIMIT);
      }
    } else {
      // Stop timer if it's not my turn, animating, or game is not active
      if (isTimerActive) {
        setIsTimerActive(false);
        setTimeRemaining(TURN_TIME_LIMIT);
        // Clear interval immediately
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
      }
    }

    // Cleanup on unmount
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isMyTurn, gameState?.currentPlayerId, gameState?.gameStatus, isAnimating, isTimerActive]);

  // Countdown timer
  useEffect(() => {
    if (!isTimerActive || !isMyTurn || !gameState || isAnimating) {
      return;
    }

    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Time's up! Auto-play a random card
          if (currentPlayer && currentPlayer.hand.length > 0 && isMyTurn) {
            const randomCard = currentPlayer.hand[Math.floor(Math.random() * currentPlayer.hand.length)];
            
            // Try to find a valid capture first
            let capturedCards: CardType[] = [];
            
            // Check if Jack can capture all
            if (randomCard.value === 'J' && gameState.tableCards.length > 0) {
              capturedCards = gameState.tableCards;
            } else if (gameState.tableCards.length > 0) {
              // Try to find any valid capture
              const combinations = getCapturableCombinations(randomCard, gameState.tableCards);
              if (combinations.length > 0) {
                // Use a random valid combination (for variety)
                const randomCombination = combinations[Math.floor(Math.random() * combinations.length)];
                capturedCards = randomCombination;
              }
            }
            
            // Auto-play the card
            console.log('[GameBoard] Auto-playing card due to timeout:', `${randomCard.value}${randomCard.suit}`, 'with', capturedCards.length, 'captured cards');
            onMakeMove(randomCard, capturedCards, true); // Pass true to indicate this is a timeout move
            resetSelections();
          }
          
          setIsTimerActive(false);
          return TURN_TIME_LIMIT;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isTimerActive, isMyTurn, gameState, currentPlayer, isAnimating, onMakeMove, resetSelections]);

  // Reset timer when a move is made
  useEffect(() => {
    if (gameState?.lastMove && gameState.lastMove.playerId === currentPlayerId) {
      // Move was made by current player - reset timer
      setIsTimerActive(false);
      setTimeRemaining(TURN_TIME_LIMIT);
    }
  }, [gameState?.lastMove, currentPlayerId]);
  
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
    <div className="flex flex-col h-screen bg-gradient-to-b from-green-900 to-green-700 p-2 sm:p-3 md:p-4 overflow-hidden">
      {/* Opponent Hand (Top) */}
      <div className="flex-shrink-0 min-h-0 flex items-center justify-center py-1 sm:py-2">
        <Hand
          cards={opponent.hand}
          isPlayer={false}
          isTurn={gameState.currentPlayerId !== currentPlayerId}
          selectedCard={null}
        />
      </div>

      {/* Table (Middle) with Special Cards Tracker */}
      <div className="flex-1 min-h-0 flex items-center justify-center py-1 sm:py-2">
        <div className="relative inline-flex items-center">
          <Table
            cards={gameState.tableCards}
            onCardClick={handleTableCardClick}
            selectedCards={selectedTableCards}
            canSelectMultiple={selectedCard?.value !== 'J'}
            animatingCardIds={animatingCards}
          />
          
          {/* Subtle Special Cards Tracker - Right side of table */}
          <div className="absolute left-full ml-1 sm:ml-2 md:ml-3 lg:ml-4 top-1/2 transform -translate-y-1/2 flex flex-col gap-2 sm:gap-3 md:gap-4">
            {/* 10♦ Tracker */}
            <div className={`flex items-center gap-1.5 sm:gap-2 md:gap-2.5 text-sm sm:text-base md:text-lg lg:text-xl transition-all duration-300 ${
              hasTenDiamonds 
                ? 'text-gray-500/60' 
                : 'text-green-400/70'
            }`}>
              <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3.5 md:h-3.5 rounded-full transition-all duration-300 ${
                hasTenDiamonds 
                  ? 'bg-gray-500/40 border border-gray-600/40' 
                  : 'bg-green-500/80 shadow-sm shadow-green-500/50'
              }`} />
              <span className="font-medium">10♦</span>
            </div>
            
            {/* 2♣ Tracker */}
            <div className={`flex items-center gap-1.5 sm:gap-2 md:gap-2.5 text-sm sm:text-base md:text-lg lg:text-xl transition-all duration-300 ${
              hasTwoClubs 
                ? 'text-gray-500/60' 
                : 'text-green-400/70'
            }`}>
              <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-3.5 md:h-3.5 rounded-full transition-all duration-300 ${
                hasTwoClubs 
                  ? 'bg-gray-500/40 border border-gray-600/40' 
                  : 'bg-green-500/80 shadow-sm shadow-green-500/50'
              }`} />
              <span className="font-medium">2♣</span>
            </div>
          </div>
        </div>
      </div>

      {/* Player Hand (Bottom) */}
      <div className="flex-shrink-0 min-h-0 flex items-center justify-center flex-col gap-2 sm:gap-3 md:gap-4 pb-2 sm:pb-3">
        <Hand
          cards={currentPlayer.hand}
          isPlayer={true}
          onCardClick={handleCardClick}
          selectedCard={selectedCard}
          isTurn={isMyTurn}
        />
        
        {/* Turn Timer Progress Bar - Always reserve space, show only when it's my turn */}
        <div className="w-full max-w-[180px] sm:max-w-[200px] px-2 sm:px-4 mt-2 sm:mt-4 md:mt-6" style={{ minHeight: isMyTurn && isTimerActive ? 'auto' : '6px' }}>
          {isMyTurn && isTimerActive ? (
            <motion.div 
              className="relative h-1.5 bg-gray-700/50 rounded-full overflow-hidden"
              animate={{
                scale: timeRemaining <= TURN_TIME_LIMIT * 0.25 ? [1, 1.15, 1] : 1
              }}
              transition={{
                scale: timeRemaining <= TURN_TIME_LIMIT * 0.25 
                  ? { duration: 0.5, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 0.2 }
              }}
            >
              <motion.div
                className="absolute top-0 left-0 h-full rounded-full transition-colors duration-300"
                style={{
                  width: `${(timeRemaining / TURN_TIME_LIMIT) * 100}%`,
                  backgroundColor: timeRemaining > TURN_TIME_LIMIT * 0.5 
                    ? '#22c55e' // Green
                    : timeRemaining > TURN_TIME_LIMIT * 0.25
                    ? '#eab308' // Yellow
                    : '#ef4444' // Red
                }}
                initial={{ width: '100%' }}
                animate={{ width: `${(timeRemaining / TURN_TIME_LIMIT) * 100}%` }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </motion.div>
          ) : (
            // Invisible placeholder to maintain space
            <div className="h-1.5" />
          )}
        </div>

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

      {/* AFK Warning Message - Bottom Left */}
      {isMyTurn && gameState?.consecutiveTimeouts && gameState.consecutiveTimeouts[currentPlayerId || ''] && gameState.consecutiveTimeouts[currentPlayerId || ''] >= 3 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="absolute bottom-2 sm:bottom-3 md:bottom-4 left-2 sm:left-3 md:left-4 bg-red-500/20 border border-red-500/40 rounded-lg sm:rounded-xl px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 backdrop-blur-sm max-w-[calc(100vw-1rem)] sm:max-w-md z-40"
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-red-200 text-xs sm:text-sm font-medium">
              {gameState.consecutiveTimeouts[currentPlayerId || ''] === 4 
                ? 'Final warning: You will be kicked out if you don\'t make a move this turn.'
                : 'You will be kicked out for inactivity shortly if you don\'t make a move.'}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

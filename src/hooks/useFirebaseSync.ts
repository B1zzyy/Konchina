'use client';

import { useEffect, useState } from 'react';
import { collection, doc, setDoc, getDoc, onSnapshot, query, where, getDocs, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GameState, Card, Move, Player } from '@/lib/types';
import { createDeck, shuffleDeck, dealTableCards } from '@/lib/gameLogic';
import { calculateRoundScores } from '@/lib/scoring';
import { useGameStore } from '@/store/gameStore';

export function useFirebaseSync(roomId: string | null, currentPlayerId: string | null) {
  const { setGameState, setCurrentPlayerId } = useGameStore();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  console.log('[useFirebaseSync] Hook called with:', { roomId, currentPlayerId });

  // Initialize or join room
  const initializeRoom = async (roomId: string, playerId: string) => {
    try {
      if (!db) {
        setError('Firebase not initialized. Check your configuration.');
        console.error('Firebase db is undefined');
        return;
      }

      // Normalize room ID to lowercase (Firestore document IDs are case-sensitive)
      const normalizedRoomId = roomId.toLowerCase();
      console.log('[InitializeRoom] Starting for room:', normalizedRoomId, 'player:', playerId);
      const roomRef = doc(db, 'rooms', normalizedRoomId);
      
      // Use transaction to atomically create or join room
      try {
        await runTransaction(db, async (transaction) => {
          const roomSnap = await transaction.get(roomRef);
          
          if (!roomSnap.exists()) {
            // Create new room - deal initial cards
            console.log('[InitializeRoom] Creating new room (transaction)...');
            const fullDeck = createDeck();
            // Deal 4 cards to player
            const playerHand = fullDeck.splice(0, 4);
            // Deal 4 cards to table, ensuring no Jacks
            const { tableCards, remainingDeck: deckAfterTable } = dealTableCards(fullDeck);
            const deck = deckAfterTable; // Remaining cards in deck

            const newGameState: GameState = {
              roomId: normalizedRoomId,
              tableCards,
              deck,
              players: {
                [playerId]: {
                  id: playerId,
                  hand: playerHand,
                  captures: [],
                  score: 0,
                  isTurn: true,
                },
              },
              currentPlayerId: playerId,
              lastMove: null,
              gameStatus: 'waiting',
              lastCapturePlayerId: null,
              currentHand: 1, // Start at hand 1
            };

            transaction.set(roomRef, {
              gameState: newGameState,
              createdAt: serverTimestamp(),
              players: [playerId],
            });
            console.log('[InitializeRoom] Transaction: Room created with table cards:', tableCards.map(c => `${c.value}${c.suit}`).join(', '));
          } else {
            // Room exists - try to join
            const roomData = roomSnap.data();
            const existingGameState = roomData.gameState as GameState;
            
            if (existingGameState.players[playerId]) {
              // Player already in game
              console.log('[InitializeRoom] Transaction: Player already in game');
            } else if (Object.keys(existingGameState.players).length < 2) {
              // Add second player
              console.log('[InitializeRoom] Transaction: Adding second player...');
              const deckCopy = [...existingGameState.deck];
              const hand = deckCopy.splice(0, 4);
              
              const updatedGameState: GameState = {
                ...existingGameState,
                deck: deckCopy,
                players: {
                  ...existingGameState.players,
                  [playerId]: {
                    id: playerId,
                    hand,
                    captures: [],
                    score: 0,
                    isTurn: false,
                  },
                },
                gameStatus: 'active',
              };
              
              transaction.update(roomRef, {
                gameState: updatedGameState,
                players: [...((roomData.players || []) as string[]), playerId],
              });
              console.log('[InitializeRoom] Transaction: Second player added');
            } else {
              console.log('[InitializeRoom] Transaction: Room is full');
              throw new Error('Room is full');
            }
          }
        });
        
        setCurrentPlayerId(playerId);
        // onSnapshot will handle updating the state
      } catch (err: any) {
        console.error('[InitializeRoom] Transaction error:', err);
        if (err.message === 'Room is full') {
          setError('Room is full');
        } else {
          setError(err.message || 'Failed to initialize room');
        }
        return;
      }
      
      // Transaction completed successfully - onSnapshot will update state
    } catch (err) {
      console.error('Error initializing room:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize room';
      setError(errorMessage);
      console.error('Full error details:', err);
    }
  };

  // Listen to room updates - THIS MUST BE SET UP FIRST
  useEffect(() => {
    if (!roomId || !db) {
      console.log('Waiting for roomId or db:', { roomId, hasDb: !!db });
      return;
    }

    // Normalize room ID to lowercase (Firestore document IDs are case-sensitive)
    const normalizedRoomId = roomId.toLowerCase();
    console.log('Setting up room listener for:', normalizedRoomId);
    const roomRef = doc(db, 'rooms', normalizedRoomId);
    
    // Set up listener IMMEDIATELY
    const unsubscribe = onSnapshot(
      roomRef,
      (snapshot) => {
        console.log('Room snapshot received:', snapshot.exists());
        if (snapshot.exists()) {
          const roomData = snapshot.data();
          const gameState = roomData.gameState as GameState;
          
          // Log table cards to verify they're the same
          console.log('[Firebase Sync] Updating game state - Room:', gameState.roomId);
          console.log('[Firebase Sync] Table cards:', gameState.tableCards.map(c => `${c.value}${c.suit}`).join(', '));
          console.log('[Firebase Sync] Deck remaining:', gameState.deck.length);
          console.log('[Firebase Sync] Players:', Object.keys(gameState.players));
          console.log('[Firebase Sync] Player objects:', Object.keys(gameState.players).map(p => ({
            id: p,
            handSize: gameState.players[p]?.hand?.length || 0
          })));
          
          // CRITICAL: Always use Firebase state, never local state
          // Deep clone to ensure no mutations and preserve all card data
          const clonedState: GameState = {
            ...gameState,
            tableCards: gameState.tableCards.map(c => ({ ...c })),
            deck: gameState.deck.map(c => ({ ...c })),
            players: Object.keys(gameState.players).reduce((acc, key) => {
              acc[key] = {
                ...gameState.players[key],
                hand: gameState.players[key].hand.map(c => ({ ...c })),
                captures: gameState.players[key].captures.map(c => ({ ...c }))
              };
              return acc;
            }, {} as { [key: string]: Player })
          };
          
          console.log('[Firebase Sync] Cloned state players:', Object.keys(clonedState.players));
          console.log('[Firebase Sync] Cloned state table cards:', clonedState.tableCards.map(c => `${c.value}${c.suit}`).join(', '));
          setGameState(clonedState);
          
          // Only set connected if we have a valid game state with players
          if (gameState && Object.keys(gameState.players).length > 0) {
            setIsConnected(true);
            setError(null);
          }
        } else {
          console.log('Room does not exist yet');
        }
      },
      (err) => {
        console.error('Error listening to room:', err);
        setError(`Connection error: ${err.message}`);
        setIsConnected(false);
      }
    );

    return () => {
      console.log('Unsubscribing from room updates');
      unsubscribe();
    };
  }, [roomId, setGameState, db]);

  // Make a move
  const makeMove = async (playedCard: Card, capturedCards: Card[]) => {
    if (!roomId || !currentPlayerId) return;

    try {
      // Normalize room ID to lowercase (Firestore document IDs are case-sensitive)
      const normalizedRoomId = roomId.toLowerCase();
      const roomRef = doc(db, 'rooms', normalizedRoomId);
      const roomSnap = await getDoc(roomRef);
      
      if (!roomSnap.exists()) {
        setError('Room not found');
        return;
      }

      const roomData = roomSnap.data();
      const gameState = roomData.gameState as GameState;
      const currentPlayer = gameState.players[currentPlayerId];
      const opponentId = Object.keys(gameState.players).find(id => id !== currentPlayerId);
      
      if (!currentPlayer || !opponentId) {
        setError('Player not found in game');
        return;
      }

      // Update player hand (remove played card)
      const newPlayerHand = currentPlayer.hand.filter(
        (c) => !(c.suit === playedCard.suit && c.value === playedCard.value)
      );

      // Update table (remove captured cards, add played card if not captured)
      let newTableCards = [...gameState.tableCards];
      if (capturedCards.length > 0) {
        // Remove captured cards from table
        capturedCards.forEach((captured) => {
          newTableCards = newTableCards.filter(
            (c) => !(c.suit === captured.suit && c.value === captured.value)
          );
        });
      } else {
        // Add played card to table if nothing was captured
        newTableCards.push(playedCard);
      }

      // Update player captures (captured cards + the played card if capture happened)
      const newPlayerCaptures = capturedCards.length > 0
        ? [...currentPlayer.captures, ...capturedCards, playedCard]
        : currentPlayer.captures;

      // Score is calculated at end of round, not during play
      // Keep existing score for now
      let newScore = currentPlayer.score;

      // Switch turns
      let newCurrentPlayerId = opponentId;
      const updatedPlayers: { [key: string]: Player } = {
        ...gameState.players,
        [currentPlayerId]: {
          ...currentPlayer,
          hand: newPlayerHand,
          captures: newPlayerCaptures,
          score: newScore,
          isTurn: false,
        },
        [opponentId]: {
          ...gameState.players[opponentId],
          isTurn: true,
        },
      };

      // Create move record
      const move: Move = {
        playerId: currentPlayerId,
        playedCard,
        capturedCards,
        timestamp: Date.now(),
      };

      // Track last player who captured (for end-of-round rule: remaining cards go to last capturer)
      let lastCapturePlayerId = gameState.lastCapturePlayerId || null;
      if (capturedCards.length > 0) {
        lastCapturePlayerId = currentPlayerId;
      }

      // Check if both players need new cards (new round)
      let finalDeck = [...gameState.deck]; // Copy to avoid mutations
      let finalPlayers = { ...updatedPlayers };

      if (newPlayerHand.length === 0 && gameState.players[opponentId].hand.length === 0 && finalDeck.length >= 8) {
        // Mid-round deal: deal 4 cards to each player (don't calculate scores yet)
        console.log('Mid-round deal: dealing cards from remaining deck');
        const playerNewHand = finalDeck.splice(0, 4);
        const opponentNewHand = finalDeck.splice(0, 4);
        
        // Increment hand number
        const currentHandNumber = (gameState.currentHand || 1) + 1;

        finalPlayers = {
          ...updatedPlayers,
          [currentPlayerId]: {
            ...updatedPlayers[currentPlayerId],
            hand: playerNewHand,
          },
          [opponentId]: {
            ...updatedPlayers[opponentId],
            hand: opponentNewHand,
          },
        };
        
        // Update hand number in game state (will be set in updatedGameState)
        gameState.currentHand = currentHandNumber;
      }

      // Check if deck is exhausted and both players are out of cards (END OF ROUND)
      let roundScoreResult = null;
      const deckExhausted =
        finalDeck.length === 0 &&
        finalPlayers[currentPlayerId].hand.length === 0 &&
        finalPlayers[opponentId].hand.length === 0;

      let gameEnded = false;

      if (deckExhausted) {
        // End of round: calculate scores when deck is exhausted
        console.log('End of round: deck exhausted, calculating scores');
        
        // Rule: Any remaining cards on the table go to the last player who made a capture
        const remainingTableCards = [...newTableCards];
        if (remainingTableCards.length > 0) {
          const lastCapturePlayer = lastCapturePlayerId || gameState.lastCapturePlayerId;
          if (lastCapturePlayer && finalPlayers[lastCapturePlayer]) {
            console.log(`End of round: ${remainingTableCards.length} remaining table cards go to last capturer: ${lastCapturePlayer}`);
            // Add remaining cards to the last capturer's captures
            finalPlayers[lastCapturePlayer] = {
              ...finalPlayers[lastCapturePlayer],
              captures: [...(finalPlayers[lastCapturePlayer].captures || []), ...remainingTableCards],
            };
            // Clear the table
            newTableCards = [];
          } else {
            // If no one has captured yet, give cards to the current player (last to play)
            console.log(`End of round: No captures made yet, ${remainingTableCards.length} remaining table cards go to current player: ${currentPlayerId}`);
            finalPlayers[currentPlayerId] = {
              ...finalPlayers[currentPlayerId],
              captures: [...(finalPlayers[currentPlayerId].captures || []), ...remainingTableCards],
            };
            newTableCards = [];
          }
        }
        
        // Calculate round scores based on captures (now including any remaining table cards)
        const roundScore = calculateRoundScores(
          finalPlayers[currentPlayerId],
          finalPlayers[opponentId]
        );
        
        roundScoreResult = roundScore;
        
        // Update player scores AFTER round completion
        finalPlayers = {
          ...finalPlayers,
          [currentPlayerId]: {
            ...finalPlayers[currentPlayerId],
            score: finalPlayers[currentPlayerId].score + roundScore.player1Points,
          },
          [opponentId]: {
            ...finalPlayers[opponentId],
            score: finalPlayers[opponentId].score + roundScore.player2Points,
          },
        };

        // Clear captures after scoring
        finalPlayers[currentPlayerId].captures = [];
        finalPlayers[opponentId].captures = [];

        // Check if any player has reached 16 or more points AFTER round scores are added
        // The game only ends after a complete round, not during play
        const player1Score = finalPlayers[currentPlayerId].score;
        const player2Score = finalPlayers[opponentId].score;
        gameEnded = player1Score >= 16 || player2Score >= 16;
        
        if (gameEnded) {
          console.log('Game ended after round completion! Final scores:', {
            [currentPlayerId]: player1Score,
            [opponentId]: player2Score,
            winner: player1Score >= player2Score ? currentPlayerId : opponentId
          });
        } else {
          // Game continues - start a new round with a fresh deck
          console.log('Starting new round - creating fresh deck and dealing cards');
          const freshDeck = createDeck(); // createDeck() already returns a shuffled deck
          
          // Deal 4 cards to each player
          const firstPlayerNewHand = freshDeck.splice(0, 4);
          const secondPlayerNewHand = freshDeck.splice(0, 4);
          
          // Deal 4 cards to the table, ensuring no Jacks
          const { tableCards: newRoundTableCards, remainingDeck: deckAfterTable } = dealTableCards(freshDeck);
          
          // Update players with new hands and reset turn to first player
          const allPlayerIds = Object.keys(finalPlayers);
          const firstPlayerId = allPlayerIds[0];
          const secondPlayerId = allPlayerIds[1] || firstPlayerId;
          
          finalPlayers = {
            [firstPlayerId]: {
              ...finalPlayers[firstPlayerId],
              hand: firstPlayerNewHand,
              isTurn: true,
            },
            [secondPlayerId]: {
              ...finalPlayers[secondPlayerId],
              hand: secondPlayerNewHand,
              isTurn: false,
            },
          };
          
          // Reset hand number to 1 for new round
          gameState.currentHand = 1;
          
          // Update state for new round
          finalDeck = deckAfterTable;
          newTableCards = newRoundTableCards; // Update the table cards variable
          newCurrentPlayerId = firstPlayerId; // Reset to first player
          lastCapturePlayerId = null; // Reset last capturer for new round
          
          console.log('New round started:', {
            tableCards: newRoundTableCards.map(c => `${c.value}${c.suit}`).join(', '),
            deckRemaining: freshDeck.length,
            firstPlayer: firstPlayerId,
            firstPlayerHand: firstPlayerNewHand.length,
            secondPlayerHand: secondPlayerNewHand.length
          });
        }
      }

      const updatedGameState: GameState = {
        ...gameState,
        tableCards: newTableCards,
        deck: finalDeck,
        players: finalPlayers,
        currentPlayerId: newCurrentPlayerId,
        lastMove: move,
        gameStatus: gameEnded ? 'finished' : 'active',
        lastRoundScore: roundScoreResult || null,
        lastCapturePlayerId: lastCapturePlayerId || null, // Track last capturer (null if no captures yet)
        currentHand: gameState.currentHand || 1, // Preserve current hand number (incremented during mid-round deals, reset to 1 for new rounds)
      };

      await setDoc(roomRef, {
        ...roomData,
        gameState: updatedGameState,
      });
    } catch (err) {
      console.error('Error making move:', err);
      setError(err instanceof Error ? err.message : 'Failed to make move');
    }
  };

  // Clear round score after popup is dismissed
  const clearRoundScore = async () => {
    if (!roomId || !db) return;
    
    try {
      const normalizedRoomId = roomId.toLowerCase();
      const roomRef = doc(db, 'rooms', normalizedRoomId);
      const roomSnap = await getDoc(roomRef);
      
      if (roomSnap.exists()) {
        const roomData = roomSnap.data();
        const gameState = roomData.gameState as GameState;
        
        await setDoc(roomRef, {
          ...roomData,
          gameState: {
            ...gameState,
            lastRoundScore: null,
          },
        }, { merge: false });
      }
    } catch (err) {
      console.error('Error clearing round score:', err);
    }
  };

  return {
    isConnected,
    error,
    initializeRoom,
    makeMove,
    clearRoundScore,
  };
}

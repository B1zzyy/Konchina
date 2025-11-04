'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import GameBoard from '@/components/GameBoard';
import { useFirebaseSync } from '@/hooks/useFirebaseSync';
import { useGameStore } from '@/store/gameStore';
import { useAuth, UserProfile } from '@/hooks/useAuth';
import { Card, Move } from '@/lib/types';
import { doc, getDoc, updateDoc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  // Normalize room ID to lowercase (Firestore document IDs are case-sensitive)
  const roomId = (params.id as string).toLowerCase();
  
  const { user, userProfile, loading: authLoading, refreshUserProfile } = useAuth();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const { gameState, currentPlayerId, setCurrentPlayerId, resetGame } = useGameStore();
  const { isConnected, error, initializeRoom, makeMove, clearRoundScore } = useFirebaseSync(roomId, playerId);
  const [showForfeitConfirm, setShowForfeitConfirm] = useState(false);
  const [opponentProfile, setOpponentProfile] = useState<UserProfile | null>(null);
  const hasPaidEntryFee = useRef(false); // Track if we've already paid entry fee
  const hasProcessedPayout = useRef(false); // Track if we've already processed game end payout

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  // Initialize player ID using authenticated user ID
  useEffect(() => {
    if (!user?.uid || playerId) return; // Already initialized or not authenticated
    
    // Use authenticated user ID
    const id = user.uid;
    console.log('Using authenticated user ID:', id, 'for room:', roomId);
    
    setPlayerId(id);
    setCurrentPlayerId(id); // Set it in the store immediately
    // Don't reset game state here - let Firebase sync handle it
    initializeRoom(roomId, id);
    
    // DON'T clean up matchmaking document immediately
    // Let it persist until both players are confirmed in the room
    // The document will be cleaned up by individual player actions or timeout
    // This prevents one player's cleanup from affecting the other player's navigation
  }, [roomId, user?.uid, playerId, initializeRoom, setCurrentPlayerId]);

  // Handle coin transactions for matchmaking games
  useEffect(() => {
    if (!gameState || !user?.uid || !db || !playerId) {
      console.log('[Coins] Effect skipped:', { hasGameState: !!gameState, hasUser: !!user?.uid, hasDb: !!db, hasPlayerId: !!playerId });
      return;
    }

    const effectivePlayerId = playerId || currentPlayerId;
    if (!effectivePlayerId) {
      console.log('[Coins] No effective player ID');
      return;
    }

    // Check if this is a matchmaking game
    const checkRoomAndHandleCoins = async () => {
      console.log('[Coins] checkRoomAndHandleCoins called, gameStatus:', gameState.gameStatus);
      try {
        const roomRef = doc(db, 'rooms', roomId);
        const roomSnap = await getDoc(roomRef);
        
        if (!roomSnap.exists()) return;
        
        const roomData = roomSnap.data();
        const isMatchmaking = roomData.isMatchmaking === true;
        
        if (!isMatchmaking) return; // Only handle coins for matchmaking games

        // Entry fee is now charged when match is found (in Home page), not here
        // Just verify entry fee was paid for tracking purposes
        if (gameState.gameStatus === 'active' && !hasPaidEntryFee.current) {
          const coinsPaid = roomData.coinsPaid || {};
          
          // Check if we've already paid (entry fee charged when match was found)
          if (coinsPaid[effectivePlayerId]) {
            console.log('[Coins] Entry fee already paid (verified from room data)');
            hasPaidEntryFee.current = true;
          } else {
            console.log('[Coins] ⚠️ Entry fee not yet paid - should have been charged when match was found');
          }
        }

        // Handle game end payouts - only process once per game end
        if (gameState.gameStatus === 'finished' && !hasProcessedPayout.current) {
          console.log('[Coins] ===== GAME END PAYOUT TRIGGERED =====');
          console.log('[Coins] Room ID:', roomId);
          console.log('[Coins] Player ID:', effectivePlayerId);
          console.log('[Coins] Game status:', gameState.gameStatus);
          console.log('[Coins] hasProcessedPayout.current:', hasProcessedPayout.current);
          
          // Use room + player ID as key to prevent duplicate processing
          const payoutStorageKey = `payout-processed-${roomId}-${effectivePlayerId}`;
          const alreadyProcessed = sessionStorage.getItem(payoutStorageKey);
          
          if (alreadyProcessed) {
            console.log('[Coins] ⚠️ Payout already processed (sessionStorage check), skipping');
            hasProcessedPayout.current = true;
            return;
          }

          console.log('[Coins] ✅ Proceeding with payout processing...');
          
          // Mark as processing immediately to prevent race conditions
          sessionStorage.setItem(payoutStorageKey, 'true');
          hasProcessedPayout.current = true;
          
          const allPlayerIds = Object.keys(gameState.players);
          const myPlayer = gameState.players[effectivePlayerId];
          const opponentId = allPlayerIds.find((id) => id !== effectivePlayerId);
          const opponentPlayer = opponentId ? gameState.players[opponentId] : null;

          if (!myPlayer || !opponentPlayer) {
            console.error('[Coins] ❌ Missing player data - cannot process payout');
            console.log('[Coins] My player:', !!myPlayer, ', Opponent player:', !!opponentPlayer);
            hasProcessedPayout.current = false; // Reset so it can retry
            sessionStorage.removeItem(payoutStorageKey);
            return;
          }

          const myScore = myPlayer.score;
          const opponentScore = opponentPlayer.score;
          const wasForfeit = !!gameState.forfeitedBy;
          const iForfeited = gameState.forfeitedBy === effectivePlayerId;
          const opponentForfeited = gameState.forfeitedBy === opponentId;
          
          // Determine winner
          // CRITICAL: If forfeit, the person who did NOT forfeit wins
          // If no forfeit, player with score >= 16 and higher/equal score wins
          const iWon = wasForfeit ? opponentForfeited : (myScore >= 16 && myScore >= opponentScore);

          console.log('[Coins] ===== PAYOUT CALCULATION =====');
          console.log('[Coins] My score:', myScore, ', Opponent score:', opponentScore);
          console.log('[Coins] wasForfeit:', wasForfeit);
          console.log('[Coins] iForfeited:', iForfeited, ', opponentForfeited:', opponentForfeited);
          console.log('[Coins] iWon:', iWon);
          console.log('[Coins] 💰💰💰 COIN RULES:');
          console.log('[Coins]   - Entry fee: -500 (already deducted when match found)');
          console.log('[Coins]   - If I WIN: +1000 coins (500 back + 500 prize) = NET +500');
          console.log('[Coins]   - If I LOSE: Just lose entry fee (no additional penalty) = NET -500 total');

          // Get current coins BEFORE transaction (for animation comparison)
          const myUserRef = doc(db, 'users', effectivePlayerId);
          const myUserSnapBefore = await getDoc(myUserRef);
          const coinsBeforePayout = myUserSnapBefore.exists() ? ((myUserSnapBefore.data() as any).coins || 0) : 0;
          
          console.log('[Coins] 💾 Coins BEFORE payout transaction:', coinsBeforePayout);
          
          // Process payouts using transaction
          // CRITICAL: Each player can only update their own coins due to Firestore security rules
          // So we only update OUR coins, and the opponent will update theirs separately
          console.log('[Coins] 🔄 Starting payout transaction (updating only my coins)...');
          let payoutSuccess = false;
          let myNewCoins = coinsBeforePayout;
          
          try {
            await runTransaction(db, async (transaction) => {
              console.log('[Coins] Transaction callback started');
              
              // Get room data first to check coinsPaid status
              const roomSnap = await transaction.get(roomRef);
              if (!roomSnap.exists()) {
                console.error('[Coins] ❌ Room not found in transaction');
                throw new Error('Room not found');
              }
              
              const myUserSnap = await transaction.get(myUserRef);
              
              if (!myUserSnap.exists()) {
                console.error('[Coins] ❌ My user profile not found in transaction');
                throw new Error('My user profile not found');
              }
              
              const myCurrentCoins = (myUserSnap.data() as any).coins || 0;
              
              console.log('[Coins] ===== PAYOUT TRANSACTION START =====');
              console.log('[Coins] My current coins in transaction:', myCurrentCoins);
              console.log('[Coins] I won:', iWon);
              console.log('[Coins] wasForfeit:', wasForfeit, ', iForfeited:', iForfeited, ', opponentForfeited:', opponentForfeited);
              
                    // CRITICAL: Winner gets +1000 (500 back + 500 prize), Loser just loses entry fee (no additional penalty)
                    if (iWon) {
                      // Winner: +1000 coins (500 back + 500 prize)
                      // Current balance already has -500 from entry fee, so we add 1000
                      myNewCoins = myCurrentCoins + 1000;
                      console.log('[Coins] 🔄 Updating MY coins: ', myCurrentCoins, ' -> ', myNewCoins, ' (+1000 winner payout)');
                    } else {
                      // Loser: No additional coins change (entry fee already deducted when match found)
                      // Total loss: -500 (entry fee, already deducted)
                      myNewCoins = myCurrentCoins; // No change, entry fee was already deducted
                      console.log('[Coins] 🔄 Loser - no coin change (entry fee already deducted): ', myCurrentCoins, ' (NET -500 from entry fee)');
                    }
              
              // Only update MY coins - opponent will update theirs separately
              transaction.update(myUserRef, {
                coins: myNewCoins,
              });
              
              console.log('[Coins] ✅ My coin update queued in transaction');
              console.log('[Coins] Note: Opponent will update their coins separately (security rules)');
              console.log('[Coins] ===== PAYOUT TRANSACTION COMMITTING =====');
            });
            
            // Transaction completed successfully
            payoutSuccess = true;
            console.log('[Coins] ✅✅✅ Payout transaction completed successfully - MY coins updated in database!');
            
            // Verify the update by reading back from database
            const verifyMyUser = await getDoc(myUserRef);
            if (verifyMyUser.exists()) {
              const myVerifiedCoins = (verifyMyUser.data() as any).coins || 0;
              console.log('[Coins] ✅ VERIFIED: My coins in database:', myVerifiedCoins);
            }
            
          } catch (payoutError: any) {
            console.error('[Coins] ❌❌❌ Payout transaction FAILED:', payoutError);
            console.error('[Coins] Error name:', payoutError?.name);
            console.error('[Coins] Error code:', payoutError?.code);
            console.error('[Coins] Error message:', payoutError?.message);
            if (payoutError?.stack) {
              console.error('[Coins] Error stack:', payoutError.stack);
            }
            
            // Check if it's a permission error
            if (payoutError?.code === 'permission-denied' || payoutError?.code === 'PERMISSION_DENIED') {
              console.error('[Coins] ⚠️ Permission denied - check Firestore security rules!');
            }
            
            // Reset the flags so it can retry
            hasProcessedPayout.current = false;
            const payoutStorageKey = `payout-processed-${roomId}-${effectivePlayerId}`;
            sessionStorage.removeItem(payoutStorageKey);
            
            // Error logged to console - animation will happen on home page when user returns
            console.error('[Coins] Payout failed - user will see updated balance when returning to lobby');
            
            // IMPORTANT: Don't continue if transaction failed
            return; // Exit early - don't show success toast if transaction failed
          }
          
          // Only proceed if transaction succeeded
          if (!payoutSuccess) {
            console.error('[Coins] Transaction did not succeed, aborting payout flow');
            return;
          }

          // Store the coins BEFORE payout in sessionStorage for animation on return to lobby
          sessionStorage.setItem('coins-before-payout', coinsBeforePayout.toString());
          console.log('[Coins] 💾 Stored coins BEFORE payout in sessionStorage:', coinsBeforePayout);
          console.log('[Coins] New balance after payout:', myNewCoins);
          console.log('[Coins] Difference:', myNewCoins - coinsBeforePayout);
          
          // After transaction completes, refresh the user profile to update local state
          if (refreshUserProfile) {
            await refreshUserProfile();
          }
              
          console.log('[Coins] ===== PAYOUT COMPLETE =====');
          console.log('[Coins] Transaction executed - winner gets +1000, loser keeps current balance (entry fee already deducted)');
          
          console.log('[Coins] ✅ Payout processing complete for player:', effectivePlayerId);
          // Note: Coin animation will be handled when user returns to lobby and sees updated balance
        } else {
          console.log('[Coins] Payout not triggered - gameStatus:', gameState.gameStatus, ', hasProcessedPayout:', hasProcessedPayout.current);
        }
      } catch (err) {
        console.error('[Coins] ❌ CRITICAL ERROR in checkRoomAndHandleCoins:', err);
        console.error('[Coins] Error details:', err instanceof Error ? err.message : String(err));
        console.error('[Coins] Error stack:', err instanceof Error ? err.stack : 'No stack trace');
      }
    };

    checkRoomAndHandleCoins();
  }, [gameState?.gameStatus, gameState?.players, gameState?.forfeitedBy, user?.uid, playerId, currentPlayerId, roomId, db, refreshUserProfile]);

  // Get effective player ID once (before any conditional returns)
  const effectivePlayerId = playerId || currentPlayerId;
  const allPlayerIds = gameState?.players ? Object.keys(gameState.players) : [];
  const opponentId = allPlayerIds.find((id) => id !== effectivePlayerId) || null;

  // Fetch opponent's profile
  useEffect(() => {
    if (!opponentId || !db) return;

    const fetchOpponentProfile = async () => {
      try {
        const opponentDoc = await getDoc(doc(db, 'users', opponentId));
        if (opponentDoc.exists()) {
          const profile = opponentDoc.data() as UserProfile;
          setOpponentProfile(profile);
        }
      } catch (error) {
        console.error('Error fetching opponent profile:', error);
      }
    };

    fetchOpponentProfile();
  }, [opponentId, db]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Loading...</div>
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-400"></div>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated (double check)
  if (!user) {
    return null; // useEffect will redirect
  }

  const handleMakeMove = (playedCard: Card, capturedCards: Card[]) => {
    if (!effectivePlayerId) return;
    makeMove(playedCard, capturedCards);
  };

  const handleForfeit = async () => {
    if (!effectivePlayerId || !gameState) return;

    try {
      // Close the confirmation modal immediately
      setShowForfeitConfirm(false);

      const roomRef = doc(db, 'rooms', roomId);
      const roomDoc = await getDoc(roomRef);
      
      if (!roomDoc.exists()) return;

      const roomData = roomDoc.data();
      const currentGameState = roomData.gameState;
      const allPlayerIds = Object.keys(currentGameState.players);
      const opponentId = allPlayerIds.find((id) => id !== effectivePlayerId);

      if (!opponentId) return;

      // Give the opponent the win by setting their score to 16
      const updatedPlayers = {
        ...currentGameState.players,
        [opponentId]: {
          ...currentGameState.players[opponentId],
          score: 16,
        },
      };

      await updateDoc(roomRef, {
        'gameState.gameStatus': 'finished',
        'gameState.players': updatedPlayers,
        'gameState.currentPlayerId': opponentId,
        'gameState.forfeitedBy': effectivePlayerId, // Mark who forfeited
      });

      // Don't redirect immediately - let the game end popup show first
      // The forfeiting player will see "You Lost" and can return to lobby
      // The opponent will see "You Won" and can return to lobby
      // Both will be handled by the GameEndPopup component
    } catch (err) {
      console.error('Error forfeiting game:', err);
      // Reopen the modal if there was an error
      setShowForfeitConfirm(true);
    }
  };

  // Handle error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 to-red-700 flex items-center justify-center">
        <div className="bg-black bg-opacity-50 rounded-lg p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Error</h2>
          <p className="text-red-200 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-4 rounded-lg"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // Direct check: Does the player exist in gameState.players?
  const playerInGame = gameState?.players?.[effectivePlayerId || ''];
  const playerCount = gameState?.players ? Object.keys(gameState.players).length : 0;
  const waitingForSecond = playerCount < 2;

  // Debug: Log what we're checking
  console.log('[RoomPage] Loading check:', {
    hasGameState: !!gameState,
    hasEffectivePlayerId: !!effectivePlayerId,
    effectivePlayerId,
    playerInGame: !!playerInGame,
    willShowGame: !!(gameState && effectivePlayerId && playerInGame)
  });

  // Show loading only if: no gameState, no effectivePlayerId, OR player not in game
  if (!gameState || !effectivePlayerId || !playerInGame) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">
            {gameState && waitingForSecond ? 'Waiting for second player...' : 'Connecting to room...'}
          </div>
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-400"></div>
          {gameState && waitingForSecond && (
            <div className="mt-4 text-yellow-300 text-sm">
              Share room code: <span className="font-mono font-bold">{roomId.toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Player is in game - show the game board!
  // Even if game is finished, we need to render GameBoard so it can show GameEndPopup
  const isMyTurn = gameState.currentPlayerId === effectivePlayerId;
  const currentPlayer = gameState.players[effectivePlayerId];
  const opponent = opponentId ? gameState.players[opponentId] : null;

  return (
    <div className="h-screen overflow-hidden">
      <GameBoard 
        onMakeMove={handleMakeMove} 
        onClearRoundScore={clearRoundScore}
        isMyTurn={isMyTurn} 
      />
      
      {/* Score Display - Top Left (replaces room code) */}
      {currentPlayer && opponent && (
        <div className="absolute top-4 left-4 bg-black bg-opacity-80 rounded-2xl px-4 sm:px-5 pt-4 sm:pt-5 pb-4 sm:pb-5 shadow-2xl border border-gray-700/50 backdrop-blur-sm w-[280px] sm:w-[300px] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700/50 flex-shrink-0">
            <div className="text-xs sm:text-sm text-gray-400 font-medium uppercase tracking-wider">Match</div>
            <div className="text-xs sm:text-sm text-gray-500">
              Hand {gameState.currentHand || 1}/6
            </div>
          </div>

          {/* Players vs Scores - Compact vertical layout */}
          <div className="flex flex-col gap-2 pt-1">
            {/* Current Player (Me) */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 sm:w-12 sm:h-12 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold text-base sm:text-lg flex-shrink-0 shadow-lg">
                {(userProfile?.displayName || userProfile?.email || 'M').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base sm:text-lg font-semibold text-white">Me</div>
              </div>
              <div className="text-3xl sm:text-4xl font-bold text-yellow-400 flex-shrink-0">
                {currentPlayer.score}
              </div>
            </div>

            {/* VS Divider */}
            <div className="flex items-center gap-2 my-1">
              <div className="flex-1 h-px bg-gray-700/50"></div>
              <div className="text-gray-500 font-bold text-xs sm:text-sm">VS</div>
              <div className="flex-1 h-px bg-gray-700/50"></div>
            </div>

            {/* Opponent */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 sm:w-12 sm:h-12 bg-gradient-to-br from-gray-600 to-gray-700 rounded-full flex items-center justify-center text-white font-bold text-base sm:text-lg flex-shrink-0 shadow-lg">
                {(opponentProfile?.displayName || opponentProfile?.email || 'O').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base sm:text-lg font-semibold text-white truncate">
                  {opponentProfile?.displayName || opponentProfile?.email?.split('@')[0] || 'Opponent'}
                </div>
              </div>
              <div className="text-3xl sm:text-4xl font-bold text-white flex-shrink-0">
                {opponent.score}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leave Button - Top Right */}
      <div className="absolute top-4 right-4">
        <button
          onClick={() => setShowForfeitConfirm(true)}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-xl transition-colors duration-200 shadow-lg flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
          </svg>
          Leave
        </button>
      </div>

      {/* Forfeit Confirmation Modal */}
      <AnimatePresence>
        {showForfeitConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-900/95 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-gray-700/50 max-w-md w-full mx-4"
            >
              <div className="text-center mb-6">
                <div className="text-5xl mb-4">⚠️</div>
                <h2 className="text-2xl font-bold text-white mb-2">Forfeit Game?</h2>
                <p className="text-gray-300 text-sm">
                  Are you sure you want to leave? This will automatically give your opponent the win.
                </p>
              </div>

              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
                <p className="text-red-200 text-sm">
                  ⚠️ Your opponent will be declared the winner and you will lose this game.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleForfeit}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200"
                >
                  Yes, Forfeit
                </button>
                <button
                  onClick={() => setShowForfeitConfirm(false)}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
          </AnimatePresence>
        </div>
      );
    }

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, setDoc, getDoc, onSnapshot, query, where, getDocs, deleteDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';
import { useRouter } from 'next/navigation';

interface MatchmakingQueueEntry {
  playerId: string;
  joinedAt: any;
  status: 'waiting' | 'matched';
  roomId?: string;
}

export function useMatchmaking() {
  const [isInQueue, setIsInQueue] = useState(false);
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [isMatched, setIsMatched] = useState(false);
  const [matchedRoomId, setMatchedRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  // Use refs to persist values across listener calls
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasNavigatedRef = useRef(false);
  const currentRoomIdRef = useRef<string | null>(null);
  const matchedStateLockRef = useRef(false); // Lock matched state to prevent clearing
  const matchedStateLockTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Listen for matchmaking updates
  useEffect(() => {
    if (!user?.uid || !db) return;

    const queueRef = doc(db, 'matchmaking', user.uid);
    
    const unsubscribe = onSnapshot(queueRef, async (docSnap) => {
      console.log('[Matchmaking] onSnapshot fired:', {
        exists: docSnap.exists(),
        isMatched,
        matchedRoomId,
        lockActive: matchedStateLockRef.current,
        navigationPending: !!navigationTimeoutRef.current,
        hasNavigated: hasNavigatedRef.current,
        currentPath: window.location.pathname
      });
      
      if (!docSnap.exists()) {
        // Document doesn't exist - but NEVER reset matched state if it's locked
        // The lock ensures matched state stays visible for the minimum display time
        if (matchedStateLockRef.current) {
          console.log('[Matchmaking] ⚠️ Document deleted but matched state is LOCKED - preserving state (lock expires in 3.5s)');
          // Keep matched state - don't touch it
          return;
        }
        
        // Document doesn't exist and state is not locked
        if (!hasNavigatedRef.current && !navigationTimeoutRef.current && !matchedStateLockRef.current) {
          // Only reset if truly cancelled (no navigation pending) AND not locked
          console.log('[Matchmaking] ❌ Clearing matched state - document deleted, no navigation, no lock');
          setIsInQueue(false);
          setIsMatchmaking(false);
          setIsMatched(false);
          setMatchedRoomId(null);
        } else if (navigationTimeoutRef.current || matchedStateLockRef.current) {
          // Document deleted but we have navigation pending OR state is locked
          // Keep matched state visible - navigation will happen and then cleanup
          // Don't clear state here - let navigation complete first
          console.log('[Matchmaking] 🔒 Document deleted but navigation pending OR locked - preserving matched state', {
            navigationPending: !!navigationTimeoutRef.current,
            lockActive: matchedStateLockRef.current,
            isMatched,
            matchedRoomId
          });
          // CRITICAL: Force matched state to stay true - use functional updates to avoid stale closures
          setIsMatched(true);
          if (matchedRoomId) {
            setMatchedRoomId((prev) => prev || matchedRoomId);
          } else {
            // If we lost matchedRoomId but have navigation, try to preserve it
            setMatchedRoomId((prev) => prev);
          }
        }
        // If we have a pending navigation, let it complete even if document is deleted
        return;
      }

      const queueData = docSnap.data() as MatchmakingQueueEntry;
      console.log('[Matchmaking] Queue data:', {
        status: queueData.status,
        roomId: queueData.roomId,
        playerId: queueData.playerId
      });
      
      // Process matched status FIRST - highest priority
      if (queueData.status === 'matched' && queueData.roomId) {
        const currentPath = window.location.pathname;
        console.log('[Matchmaking] ✅ MATCHED STATUS DETECTED!', {
          roomId: queueData.roomId,
          currentPath,
          isMatched,
          matchedRoomId,
          lockActive: matchedStateLockRef.current,
          navigationPending: !!navigationTimeoutRef.current
        });
        
        // If we're already in the room, we're done
        if (currentPath.includes(`/room/${queueData.roomId}`)) {
          hasNavigatedRef.current = true;
          if (navigationTimeoutRef.current) {
            clearTimeout(navigationTimeoutRef.current);
            navigationTimeoutRef.current = null;
          }
          // Don't clear matched state immediately - let it persist until navigation completes
          // This ensures the modal stays visible during navigation transition
          // Wait for lock to expire before clearing (if locked)
          const clearState = () => {
            if (!matchedStateLockRef.current) {
              setIsInQueue(false);
              setIsMatchmaking(false);
              setIsMatched(false);
              setMatchedRoomId(null);
            } else {
              // Still locked, try again in 500ms
              setTimeout(clearState, 500);
            }
          };
          setTimeout(clearState, 2000); // 2 second delay ensures modal is visible during navigation
          // Clean up document after a delay
          setTimeout(() => {
            deleteDoc(queueRef).catch(() => {});
          }, 10000);
          return;
        }
        
        // If we're on home page, ALWAYS set up navigation (even if already set up)
        // This ensures the first player also navigates when their status changes
        if (currentPath === '/') {
          // CRITICAL: Lock matched state for minimum display time
          // This prevents ANY other logic from clearing it for 3.5 seconds
          console.log('[Matchmaking] 🔒 LOCKING matched state for 3.5 seconds');
          matchedStateLockRef.current = true;
          
          // Clear any existing lock timeout
          if (matchedStateLockTimeoutRef.current) {
            console.log('[Matchmaking] Clearing existing lock timeout');
            clearTimeout(matchedStateLockTimeoutRef.current);
          }
          
          // Unlock after 3.5 seconds (matches navigation delay)
          matchedStateLockTimeoutRef.current = setTimeout(() => {
            console.log('[Matchmaking] 🔓 UNLOCKING matched state (3.5s elapsed)');
            matchedStateLockRef.current = false;
          }, 3500);
          
          // CRITICAL: Always update matched state IMMEDIATELY - this triggers the "Opponent Found" UI
          // Set this first before any other logic to ensure UI updates
          // Force update even if already matched to ensure UI refreshes
          // Use functional updates to ensure we get the latest state
          console.log('[Matchmaking] 🎯 SETTING matched state to TRUE', {
            roomId: queueData.roomId,
            wasAlreadyMatched: isMatched
          });
          setIsInQueue(false);
          setIsMatchmaking(false);
          setIsMatched(true);
          setMatchedRoomId(queueData.roomId);
          
          // CRITICAL: Schedule a check to ensure state persists even if React batches updates
          // This prevents React from clearing state during batched renders
          setTimeout(() => {
            // Double-check matched state is still set after a tick
            setIsMatched((prev) => {
              if (!prev) {
                console.log('[Matchmaking] ⚠️ Matched state was cleared, restoring it!');
                return true;
              }
              return prev;
            });
            setMatchedRoomId((prev) => {
              if (!prev || prev !== queueData.roomId) {
                console.log('[Matchmaking] ⚠️ MatchedRoomId was cleared, restoring it!', queueData.roomId);
                return queueData.roomId;
              }
              return prev;
            });
          }, 0);
          
          // CRITICAL: Always set up navigation if we don't have one OR if room ID changed
          // This is especially important for the first player whose status just changed to matched
          // Even if navigation is already set up, ensure matched state is visible
          if (!navigationTimeoutRef.current || currentRoomIdRef.current !== queueData.roomId) {
            // Clear any existing timeout
            if (navigationTimeoutRef.current) {
              clearTimeout(navigationTimeoutRef.current);
            }
            
            // Update room ID ref
            currentRoomIdRef.current = queueData.roomId;
            
            // Reset hasNavigated if room ID changed
            if (currentRoomIdRef.current !== queueData.roomId) {
              hasNavigatedRef.current = false;
            }
            
            // Show "Opponent Found" message for 3.5 seconds, then navigate
            // Extended delay ensures both players (especially first player) see the full animation
            console.log('[Matchmaking] ⏰ Setting up navigation timeout (3.5s) for room:', queueData.roomId);
            navigationTimeoutRef.current = setTimeout(() => {
              const checkPath = window.location.pathname;
              const currentRoomId = currentRoomIdRef.current;
              console.log('[Matchmaking] ⏰ Navigation timeout fired', {
                checkPath,
                currentRoomId,
                expectedRoomId: queueData.roomId,
                hasNavigated: hasNavigatedRef.current
              });
              // Navigate if we're still on home page and room ID matches
              if (checkPath === '/' && currentRoomId === queueData.roomId && !hasNavigatedRef.current) {
                hasNavigatedRef.current = true;
                console.log('[Matchmaking] 🚀 NAVIGATING to room:', queueData.roomId);
                // Keep matched state visible during navigation - don't clear it yet
                router.push(`/room/${queueData.roomId}`);
              } else {
                console.log('[Matchmaking] ⚠️ Navigation skipped - conditions not met');
              }
            }, 3500); // 3.5 seconds - gives first player more time to see the message
          } else {
            // Navigation already set up, but ensure matched state is visible
            // This handles the case where first player's listener fires multiple times
            console.log('[Matchmaking] ⚠️ Navigation already set up, but ensuring matched state visible', {
              existingTimeout: !!navigationTimeoutRef.current,
              currentRoomId: currentRoomIdRef.current,
              newRoomId: queueData.roomId
            });
            setIsMatched(true);
            setMatchedRoomId(queueData.roomId);
          }
        }
      } else if (queueData.status === 'waiting') {
        // Waiting for match
        console.log('[Matchmaking] ⏳ WAITING status detected', {
          isMatched,
          matchedRoomId,
          lockActive: matchedStateLockRef.current,
          navigationPending: !!navigationTimeoutRef.current
        });
        
        // CRITICAL: NEVER clear matched state if it's locked or if we're matched/have navigation
        // The lock prevents ANY clearing during the minimum display time
        if (matchedStateLockRef.current) {
          console.log('[Matchmaking] 🔒 Waiting status but matched state is LOCKED - preserving');
          setIsInQueue(true);
          setIsMatchmaking(false);
          // Keep matched state - don't touch it
          return;
        }
        
        // Not locked - check if we should preserve matched state
        if (isMatched || navigationTimeoutRef.current || matchedRoomId) {
          // We're matched or about to navigate - preserve matched state
          // Just update queue state but keep isMatched true
          console.log('[Matchmaking] 🔄 Preserving matched state during waiting status', {
            reason: isMatched ? 'isMatched=true' : navigationTimeoutRef.current ? 'navigationPending' : 'hasMatchedRoomId'
          });
          setIsInQueue(true);
          setIsMatchmaking(false);
          // DO NOT clear isMatched or matchedRoomId - navigation is in progress!
          // Force matched state to stay true
          setIsMatched(true);
          if (matchedRoomId) {
            setMatchedRoomId(matchedRoomId);
          }
          return; // Exit early to preserve matched state
        }
        
        // Only reset if we're truly just waiting (not matched, no navigation, and NOT locked)
        if (!matchedStateLockRef.current) {
          console.log('[Matchmaking] ❌ Clearing matched state - truly waiting, no lock');
          hasNavigatedRef.current = false;
          currentRoomIdRef.current = null;
          setIsInQueue(true);
          setIsMatchmaking(false);
          setIsMatched(false);
          setMatchedRoomId(null);
        }
      }
    });

    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
      if (matchedStateLockTimeoutRef.current) {
        clearTimeout(matchedStateLockTimeoutRef.current);
        matchedStateLockTimeoutRef.current = null;
      }
      unsubscribe();
    };
  }, [user?.uid, router]);

  const joinQueue = useCallback(async () => {
    if (!user?.uid || !db) {
      setError('User not authenticated');
      return { success: false, error: 'User not authenticated' };
    }

    try {
      setIsMatchmaking(true);
      setError(null);

      const queueRef = doc(db, 'matchmaking', user.uid);
      
      // Check if already in queue
      const existing = await getDoc(queueRef);
      if (existing.exists()) {
        const existingData = existing.data() as MatchmakingQueueEntry;
        if (existingData.status === 'waiting') {
          setIsInQueue(true);
          setIsMatchmaking(false);
          return { success: true, inQueue: true };
        }
        // If status is matched, listener will handle navigation automatically
        if (existingData.status === 'matched' && existingData.roomId) {
          return { success: true, matched: true, roomId: existingData.roomId };
        }
      }

      // Use transaction to atomically find a match or add to queue
      let matched = false;
      let matchedRoomId: string | null = null;

      // First, try to find a waiting player outside the transaction (we'll verify in transaction)
      const queueCollection = collection(db, 'matchmaking');
      const waitingQuery = query(
        queueCollection,
        where('status', '==', 'waiting')
      );
      const waitingSnapshot = await getDocs(waitingQuery);
      
      let matchedPlayerId: string | null = null;
      let matchedPlayerData: MatchmakingQueueEntry | null = null;
      
      // Find a player that's not us
      if (!waitingSnapshot.empty) {
        for (const doc of waitingSnapshot.docs) {
          if (doc.id !== user.uid) {
            matchedPlayerId = doc.id;
            matchedPlayerData = doc.data() as MatchmakingQueueEntry;
            break;
          }
        }
      }

      await runTransaction(db, async (transaction) => {
        // Verify the matched player is still waiting and we're not already in queue
        if (matchedPlayerId) {
          const matchedPlayerRef = doc(db, 'matchmaking', matchedPlayerId);
          const matchedPlayerSnap = await transaction.get(matchedPlayerRef);
          
          if (!matchedPlayerSnap.exists()) {
            // Player left queue, no match
            matchedPlayerId = null;
            matchedPlayerData = null;
          } else {
            const data = matchedPlayerSnap.data() as MatchmakingQueueEntry;
            if (data.status !== 'waiting') {
              // Player is no longer waiting
              matchedPlayerId = null;
              matchedPlayerData = null;
            }
          }
        }

        if (matchedPlayerId && matchedPlayerData) {
          // Found a match!

          // Create a new room
          const roomId = Math.random().toString(36).substring(2, 9).toLowerCase();
          const roomRef = doc(db, 'rooms', roomId);

          // Check if room exists (shouldn't, but just in case)
          const roomSnap = await transaction.get(roomRef);
          if (roomSnap.exists()) {
            // Room exists, try again later (retry mechanism would go here)
            throw new Error('Room collision');
          }

          // Create room with initial game state
          const { createDeck, dealTableCards } = await import('@/lib/gameLogic');
          const fullDeck = createDeck();
          const player1Hand = fullDeck.splice(0, 4);
          const player2Hand = fullDeck.splice(0, 4);
          // Deal 4 cards to table, ensuring no Jacks
          const { tableCards, remainingDeck } = dealTableCards(fullDeck);
          const deck = remainingDeck;

          const gameState = {
            roomId,
            tableCards,
            deck,
            players: {
              [matchedPlayerId]: {
                id: matchedPlayerId,
                hand: player1Hand,
                captures: [],
                score: 0,
                isTurn: true,
              },
              [user.uid]: {
                id: user.uid,
                hand: player2Hand,
                captures: [],
                score: 0,
                isTurn: false,
              },
            },
            currentPlayerId: matchedPlayerId,
            lastMove: null,
            gameStatus: 'active',
            lastRoundScore: null,
            lastCapturePlayerId: null,
            currentHand: 1, // Start at hand 1
          };

          transaction.set(roomRef, {
            gameState,
            players: [matchedPlayerId, user.uid],
            createdAt: serverTimestamp(),
            isMatchmaking: true, // Mark as matchmaking game
            coinsPaid: {}, // Will be set when players pay entry fee
          });

          // Mark both players as matched
          // Note: We can only update our own document in the transaction, so we'll set both
          // and the matched player will be updated via the listener/onSnapshot
          const matchedPlayerQueueRef = doc(db, 'matchmaking', matchedPlayerId);
          transaction.set(matchedPlayerQueueRef, {
            playerId: matchedPlayerId,
            joinedAt: matchedPlayerData.joinedAt,
            status: 'matched',
            roomId,
          });

          transaction.set(queueRef, {
            playerId: user.uid,
            joinedAt: serverTimestamp(),
            status: 'matched',
            roomId,
          });

          matched = true;
          matchedRoomId = roomId;
        } else {
          // No match found - add current player to queue
          transaction.set(queueRef, {
            playerId: user.uid,
            joinedAt: serverTimestamp(),
            status: 'waiting',
          });
          setIsInQueue(true);
        }
      });

      if (matched && matchedRoomId) {
        // Match found - listener will handle navigation automatically
        return { success: true, matched: true, roomId: matchedRoomId };
      } else {
        // Added to queue - waiting for match
        return { success: true, inQueue: true };
      }
    } catch (err) {
      console.error('Matchmaking error:', err);
      setError(err instanceof Error ? err.message : 'Failed to join queue');
      setIsMatchmaking(false);
      setIsInQueue(false);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to join queue' };
    }
  }, [user?.uid, router]);

  const leaveQueue = useCallback(async () => {
    if (!user?.uid || !db) return;

    try {
      console.log('[Matchmaking] 🚪 leaveQueue called', {
        lockActive: matchedStateLockRef.current,
        isMatched,
        matchedRoomId
      });
      
      // NEVER clear matched state if it's locked - this prevents premature clearing
      if (matchedStateLockRef.current) {
        console.log('[Matchmaking] ⚠️ leaveQueue blocked - matched state is LOCKED');
        // Only delete the document, don't clear local state if locked
        const queueRef = doc(db, 'matchmaking', user.uid);
        await deleteDoc(queueRef);
        return;
      }
      
      const queueRef = doc(db, 'matchmaking', user.uid);
      await deleteDoc(queueRef);
      console.log('[Matchmaking] ✅ Clearing matchmaking state (not locked)');
      setIsInQueue(false);
      setIsMatchmaking(false);
      setIsMatched(false);
      setMatchedRoomId(null);
      setError(null);
    } catch (err) {
      console.error('Error leaving queue:', err);
      setError(err instanceof Error ? err.message : 'Failed to leave queue');
    }
  }, [user?.uid, isMatched, matchedRoomId]);

  // DON'T clear matchmaking state when navigating - let the room page handle it
  // Removing this cleanup as it was interfering with navigation

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (user?.uid && db && (isInQueue || isMatched)) {
        leaveQueue();
      }
    };
  }, [user?.uid, isInQueue, isMatched, leaveQueue]);

  return {
    isInQueue,
    isMatchmaking,
    isMatched,
    matchedRoomId,
    error,
    joinQueue,
    leaveQueue,
  };
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useAuth, UserProfile } from '@/hooks/useAuth';
import { useMatchmaking } from '@/hooks/useMatchmaking';
import { usePayment } from '@/hooks/usePayment';
import AuthForm from '@/components/AuthForm';
import CoinIcon from '@/components/CoinIcon';
import GameSelectionModal from '@/components/GameSelectionModal';
import { BackgroundTheme } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, getDoc, runTransaction, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [roomId, setRoomId] = useState('');
  const router = useRouter();
  const { user, userProfile, loading, logout, refreshUserProfile } = useAuth();
  const { isInQueue, isMatchmaking, isMatched, matchedRoomId, joinQueue, leaveQueue } = useMatchmaking();
  const { handlePurchase } = usePayment();
  const [loadingPackage, setLoadingPackage] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showMatchmakingModal, setShowMatchmakingModal] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [matchedOpponentProfile, setMatchedOpponentProfile] = useState<UserProfile | null>(null);
  const [showPopAnimation, setShowPopAnimation] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasChargedEntryFee = useRef(false); // Track if entry fee was charged when match found
  const [coinAnimation, setCoinAnimation] = useState<{ amount: number; type: 'deduct' | 'win' | 'loss' } | null>(null);
  const [displayedCoins, setDisplayedCoins] = useState<number | null>(null);
  const prevCoinsRef = useRef<number | null>(null);
  const [flyingCoins, setFlyingCoins] = useState<number[]>([]);
  const coinBalanceRef = useRef<HTMLDivElement | null>(null);
  const [showBuyCoinsModal, setShowBuyCoinsModal] = useState(false);
  const [buyCoinsModalTab, setBuyCoinsModalTab] = useState<'coins' | 'backgrounds'>('coins');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState<string | null>(null);
  const [showGameSelectionModal, setShowGameSelectionModal] = useState(false);
  const [reconnectionGame, setReconnectionGame] = useState<{ roomId: string; opponentName: string; opponentId: string } | null>(null);
  const [reconnectionTimer, setReconnectionTimer] = useState<number>(180); // 3 minutes in seconds
  const reconnectionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Available background themes
  const BACKGROUND_THEMES: BackgroundTheme[] = [
    {
      id: 'xmas-wallpaper',
      name: 'Christmas Wallpaper',
      imagePath: '/backgrounds/xmas wallpaper.png',
      price: 5000, // Price in coins
    },
    // Add more backgrounds here as you add them to public/backgrounds/
  ];
  const [settingsUsername, setSettingsUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Show auth form if user is not authenticated
    if (!loading && !user) {
      setShowAuth(true);
    }
  }, [user, loading]);

  // Check for active games on page load (reconnection feature)
  useEffect(() => {
    if (!user?.uid || !db || loading) return;

    const checkForActiveGame = async () => {
      try {
        // Query rooms where user is a player
        const roomsRef = collection(db, 'rooms');
        const q = query(roomsRef, where('players', 'array-contains', user.uid));
        const querySnapshot = await getDocs(q);

        // Find active games
        for (const roomDoc of querySnapshot.docs) {
          const roomData = roomDoc.data();
          const gameState = roomData.gameState;

          // Strict checks: game must be active, have exactly 2 players, and user must be one of them
          if (
            gameState?.gameStatus === 'active' && 
            gameState?.players?.[user.uid] &&
            Object.keys(gameState.players || {}).length === 2 && // Must have exactly 2 players
            !gameState.forfeitedBy && // Game must not be forfeited
            gameState.deck && gameState.deck.length >= 0 // Game must have started (deck exists)
          ) {
            // Get opponent ID
            const allPlayerIds = Object.keys(gameState.players || {});
            const opponentId = allPlayerIds.find((id) => id !== user.uid);

            if (opponentId) {
              // Double-check the game is still active by fetching fresh data
              try {
                const freshRoomDoc = await getDoc(doc(db, 'rooms', roomDoc.id));
                if (!freshRoomDoc.exists()) continue;
                
                const freshRoomData = freshRoomDoc.data();
                const freshGameState = freshRoomData.gameState;
                
                // Verify game is still active with fresh data
                if (
                  freshGameState?.gameStatus === 'active' &&
                  freshGameState?.players?.[user.uid] &&
                  Object.keys(freshGameState.players || {}).length === 2 &&
                  !freshGameState.forfeitedBy
                ) {
                  // Check if user was disconnected and calculate remaining time
                  const disconnectedAt = freshRoomData.disconnectedAt || {};
                  const userDisconnectedAt = disconnectedAt[user.uid];
                  
                  let remainingTime = 180; // Default 3 minutes
                  
                  if (userDisconnectedAt) {
                    // User was disconnected - calculate remaining time
                    const now = Date.now();
                    const disconnectTime = userDisconnectedAt.toMillis ? userDisconnectedAt.toMillis() : now;
                    const elapsed = Math.floor((now - disconnectTime) / 1000);
                    remainingTime = Math.max(0, 180 - elapsed);
                    
                    // If time already expired, don't show reconnection modal
                    if (remainingTime <= 0) {
                      continue; // Skip this game, time expired
                    }
                  }
                  
                  // Fetch opponent's profile to get their name
                  const opponentDoc = await getDoc(doc(db, 'users', opponentId));
                  const opponentProfile = opponentDoc.exists() ? (opponentDoc.data() as UserProfile) : null;
                  const opponentName = opponentProfile?.displayName || opponentProfile?.email?.split('@')[0] || 'Opponent';

                  setReconnectionGame({
                    roomId: roomDoc.id,
                    opponentName,
                    opponentId,
                  });
                  setReconnectionTimer(remainingTime); // Set based on when they disconnected
                  break; // Only show one reconnection modal
                }
              } catch (error) {
                console.error('Error fetching opponent profile or verifying game:', error);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error checking for active games:', error);
      }
    };

    checkForActiveGame();
  }, [user?.uid, db, loading]);

  // Auto-forfeit when timer expires
  const handleAutoForfeit = async () => {
    if (!reconnectionGame || !user?.uid || !db) return;

    try {
      const roomRef = doc(db, 'rooms', reconnectionGame.roomId);
      const roomDoc = await getDoc(roomRef);

      if (!roomDoc.exists()) {
        setReconnectionGame(null);
        return;
      }

      const roomData = roomDoc.data();
      const currentGameState = roomData.gameState;
      const allPlayerIds = Object.keys(currentGameState.players);
      const opponentId = allPlayerIds.find((id) => id !== user.uid);

      if (!opponentId) {
        setReconnectionGame(null);
        return;
      }

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
        'gameState.forfeitedBy': user.uid, // Mark who forfeited
      });

      // Clear reconnection state
      setReconnectionGame(null);
      setReconnectionTimer(180);
    } catch (error) {
      console.error('Error auto-forfeiting game:', error);
      setReconnectionGame(null);
    }
  };

  // Handle join back
  const handleJoinBack = () => {
    if (!reconnectionGame) return;

    // Store coins before navigating (for animation on return)
    if (userProfile?.coins !== undefined) {
      sessionStorage.setItem('coins-before-navigation', userProfile.coins.toString());
    }

    // Clear reconnection state
    setReconnectionGame(null);
    setReconnectionTimer(300);

    // Navigate to room
    router.push(`/room/${reconnectionGame.roomId}`);
  };

  // Timer countdown for reconnection - updates based on actual disconnect time
  useEffect(() => {
    if (!reconnectionGame || !user?.uid || !db) {
      // Clear timer if no reconnection game
      if (reconnectionTimerRef.current) {
        clearInterval(reconnectionTimerRef.current);
        reconnectionTimerRef.current = null;
      }
      return;
    }

    // Update timer based on actual disconnect time from Firestore
    const updateTimer = async () => {
      try {
        const roomRef = doc(db, 'rooms', reconnectionGame.roomId);
        const roomSnap = await getDoc(roomRef);
        if (!roomSnap.exists()) {
          setReconnectionGame(null);
          return;
        }

        const roomData = roomSnap.data();
        const gameState = roomData.gameState;
        
        // Check if game is still active
        if (gameState?.gameStatus !== 'active' || gameState?.forfeitedBy) {
          setReconnectionGame(null);
          return;
        }

        const disconnectedAt = roomData.disconnectedAt || {};
        const userDisconnectedAt = disconnectedAt[user.uid];

        if (userDisconnectedAt) {
          const now = Date.now();
          const disconnectTime = userDisconnectedAt.toMillis ? userDisconnectedAt.toMillis() : now;
          const elapsed = Math.floor((now - disconnectTime) / 1000);
          const remaining = Math.max(0, 180 - elapsed);
          
          setReconnectionTimer(remaining);
          
          // If time expired, trigger auto-forfeit
          if (remaining <= 0) {
            handleAutoForfeit();
          }
        } else {
          // No disconnect timestamp - user is active, clear reconnection
          setReconnectionGame(null);
        }
      } catch (error) {
        console.error('Error updating reconnection timer:', error);
      }
    };

    // Update immediately
    updateTimer();

    // Update every second
    reconnectionTimerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (reconnectionTimerRef.current) {
        clearInterval(reconnectionTimerRef.current);
        reconnectionTimerRef.current = null;
      }
    };
  }, [reconnectionGame, user?.uid, db]);

  // Check for coin changes when returning to home page (e.g., after game ends)
  // This detects payout changes and triggers animations
  useEffect(() => {
    if (user && refreshUserProfile && !loading && userProfile) {
      const checkForCoinChanges = async () => {
        // Check if we've already processed this payout (prevent duplicate animations)
        const payoutProcessed = sessionStorage.getItem('payout-animation-processed');
        if (payoutProcessed === 'true') {
          return;
        }
        
        // Check for payout coins (stored inside transaction before payout)
        const payoutCoinsStr = sessionStorage.getItem('coins-before-payout');
        const payoutCoins = payoutCoinsStr ? parseInt(payoutCoinsStr, 10) : null;
        
        // Skip if we just animated the entry fee (prevent double animation)
        const entryFeeAnimated = sessionStorage.getItem('entry-fee-animated');
        if (entryFeeAnimated === 'true') {
          return;
        }
        
        // Refresh profile from database to get latest coins
        const refreshed = await refreshUserProfile();
        
        if (!refreshed) {
          return;
        }
        
        const newCoins = refreshed.coins;
        
        // If no payout coins stored, this means no payout happened (loser case)
        // Losers should have NO animation - entry fee was already animated when match was found
        if (payoutCoins === null) {
          setDisplayedCoins(newCoins);
          prevCoinsRef.current = newCoins;
          // Clear all stored values - no animation needed
          sessionStorage.removeItem('coins-before-entry-fee');
          sessionStorage.removeItem('coins-after-entry-fee');
          sessionStorage.removeItem('coins-before-payout');
          return; // Exit early - no animation for losers
        }
        
        // We have payout coins - this is a winner case
        // Use coins-after-entry-fee as the source of truth (most reliable)
        const afterEntryFeeStr = sessionStorage.getItem('coins-after-entry-fee');
        const afterEntryFee = afterEntryFeeStr ? parseInt(afterEntryFeeStr, 10) : null;
        
        // Use afterEntryFee if available (most reliable), otherwise use payoutCoins
        const oldCoins = afterEntryFee !== null ? afterEntryFee : payoutCoins;
        const difference = newCoins - oldCoins;
        
        // Get reward from sessionStorage (stored when game was created)
        const rewardStr = sessionStorage.getItem('game-reward');
        const reward = rewardStr ? parseInt(rewardStr, 10) : 1000; // Default to 1000 for backwards compatibility
        
        // Validate: winner should have +reward coins
        if (difference !== reward) {
          setDisplayedCoins(newCoins);
          prevCoinsRef.current = newCoins;
          // Clear all stored values
          sessionStorage.removeItem('coins-before-entry-fee');
          sessionStorage.removeItem('coins-after-entry-fee');
          sessionStorage.removeItem('coins-before-payout');
          sessionStorage.removeItem('payout-animation-processed');
          sessionStorage.removeItem('game-reward');
          return; // Exit early - don't animate invalid data
        }
        
        // Mark that we're processing this payout (prevent duplicate runs)
        sessionStorage.setItem('payout-animation-processed', 'true');
        
        // Ensure displayed coins is set to old value
        setDisplayedCoins(oldCoins);
        prevCoinsRef.current = oldCoins;
        
        // Small delay to ensure state is set, then trigger animation
        setTimeout(() => {
          setCoinAnimation({ amount: reward, type: 'win' });
          animateCoinCountdown(oldCoins, newCoins);
          
          // Trigger flying coins animation (wave effect)
          // Scale number of coins based on reward (more coins for higher rewards)
          const coinCount = Math.min(45, Math.max(20, Math.floor(reward / 50)));
          const coinIds = Array.from({ length: coinCount }, (_, i) => i);
          setFlyingCoins(coinIds);
          
          // Clear flying coins after animation completes
          setTimeout(() => {
            setFlyingCoins([]);
          }, 2500);
          
          setTimeout(() => {
            setCoinAnimation(null);
            prevCoinsRef.current = newCoins;
            setDisplayedCoins(newCoins);
            // Clear stored values AFTER animation completes
            sessionStorage.removeItem('coins-before-entry-fee');
            sessionStorage.removeItem('coins-after-entry-fee');
            sessionStorage.removeItem('coins-before-payout');
            sessionStorage.removeItem('payout-animation-processed');
            sessionStorage.removeItem('game-reward');
          }, 2800);
        }, 300);
      };
      
      // Delay to ensure page is fully loaded and profile is ready
      const timeout = setTimeout(checkForCoinChanges, 1200);
      
      return () => clearTimeout(timeout);
    }
  }, [user, refreshUserProfile, loading]);

  // Close matchmaking modal when no longer in queue and not matched (cancelled)
  // Keep modal open when matched to show "opponent found" message
  // Also keep it open if we have a matchedRoomId to prevent closing during navigation
  useEffect(() => {
    const currentPath = window.location.pathname;
    console.log('[Home] Modal visibility check', {
      currentPath,
      isInQueue,
      isMatchmaking,
      isMatched,
      matchedRoomId,
      showMatchmakingModal,
      shouldClose: !isInQueue && !isMatchmaking && !isMatched && !matchedRoomId && showMatchmakingModal && currentPath === '/',
      shouldOpen: (isMatched || matchedRoomId) && !showMatchmakingModal
    });
    
    // Only process modal visibility if we're on the home page
    if (currentPath !== '/') {
      return;
    }
    
    // Only close if truly cancelled (not matched and not navigating) AND we're on home page
    // NEVER close if we're matched - the modal should stay open until navigation happens
    // CRITICAL: Add a minimum display time check - if matchedRoomId was set recently, keep modal open
    if (!isInQueue && !isMatchmaking && !isMatched && !matchedRoomId && showMatchmakingModal) {
      // Add a delay before closing to prevent premature closure
      // This gives time for navigation to happen
      const closeTimeout = setTimeout(() => {
        // Double-check we're still on home and state is still cleared
        if (window.location.pathname === '/' && !isMatched && !matchedRoomId) {
          console.log('[Home] ❌ CLOSING modal - truly cancelled (after delay)');
          setShowMatchmakingModal(false);
        }
      }, 500); // Small delay to prevent race conditions
      
      return () => clearTimeout(closeTimeout);
    }
    
    // If we become matched, ensure modal is open IMMEDIATELY
    // Also check matchedRoomId as fallback - this is critical for preventing closure
    if ((isMatched || matchedRoomId) && !showMatchmakingModal) {
      console.log('[Home] ✅ OPENING modal - matched state detected');
      setShowMatchmakingModal(true);
    }
  }, [isInQueue, isMatchmaking, isMatched, matchedRoomId, showMatchmakingModal]);

  // Trigger pop animation when match is found
  useEffect(() => {
    if (isMatched || matchedRoomId) {
      setShowPopAnimation(true);
      const timer = setTimeout(() => setShowPopAnimation(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isMatched, matchedRoomId]);

  // Fetch opponent profile when matched
  useEffect(() => {
    if (!matchedRoomId || !user?.uid || !db) return;

    const fetchOpponentProfile = async () => {
      try {
        const roomRef = doc(db, 'rooms', matchedRoomId);
        const roomSnap = await getDoc(roomRef);
        
        if (roomSnap.exists()) {
          const roomData = roomSnap.data();
          const players = roomData.players || [];
          const opponentId = players.find((id: string) => id !== user.uid);
          
          if (opponentId) {
            const opponentDoc = await getDoc(doc(db, 'users', opponentId));
            if (opponentDoc.exists()) {
              const profile = opponentDoc.data() as UserProfile;
              setMatchedOpponentProfile(profile);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching opponent profile:', error);
      }
    };

    fetchOpponentProfile();
  }, [matchedRoomId, user?.uid, db]);

  // Charge entry fee IMMEDIATELY when match is found (when "Opponent Found!" appears)
  useEffect(() => {
    if (!isMatched || !matchedRoomId || !user?.uid || !db) return;
    
    // MULTIPLE PROTECTION LAYERS to prevent double charging
    const entryFeeStorageKey = `entry-paid-${matchedRoomId}-${user.uid}`;
    
    // Check 1: sessionStorage
    if (sessionStorage.getItem(entryFeeStorageKey)) {
      console.log('[Coins] ⏭️ Entry fee already paid (sessionStorage check) - skipping');
      hasChargedEntryFee.current = true;
      return;
    }
    
    // Check 2: ref flag
    if (hasChargedEntryFee.current) {
      console.log('[Coins] ⏭️ Entry fee already charged (ref check) - skipping');
      return;
    }
    
    // Set flag IMMEDIATELY to prevent re-entry
    hasChargedEntryFee.current = true;
    
    const chargeEntryFee = async () => {
      try {
        console.log('[Coins] 💳 Charging entry fee - match found! Room:', matchedRoomId);
        
        // Check 3: room data
        const roomRef = doc(db, 'rooms', matchedRoomId);
        const roomSnap = await getDoc(roomRef);
        
        if (!roomSnap.exists()) {
          console.error('[Coins] Room not found when charging entry fee');
          hasChargedEntryFee.current = false; // Reset flag on error
          return;
        }

        const roomData = roomSnap.data();
        const coinsPaid = roomData.coinsPaid || {};
        const entryFee = roomData.entryFee || 500; // Get entry fee from room, default to 500 for backwards compatibility
        
        // Check if we've already paid (in case of reconnection)
        if (coinsPaid[user.uid]) {
          console.log('[Coins] Entry fee already paid according to room data');
          sessionStorage.setItem(entryFeeStorageKey, 'true');
          return;
        }

        let entryFeeCharged = false;

        // Charge entry fee using transaction to prevent double charging
        await runTransaction(db, async (transaction) => {
          // Check 4: Inside transaction - verify coinsPaid again
          const roomSnapInTx = await transaction.get(roomRef);
          if (!roomSnapInTx.exists()) return;
          
          const roomDataInTx = roomSnapInTx.data();
          const coinsPaidInTx = roomDataInTx?.coinsPaid || {};
          const entryFeeInTx = roomDataInTx?.entryFee || 500;
          
          if (coinsPaidInTx[user.uid]) {
            console.log('[Coins] Entry fee already paid (transaction check) - skipping');
            return;
          }
          
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await transaction.get(userRef);
          
          if (!userSnap.exists()) return;
          
          const currentCoins = (userSnap.data() as any).coins || 0;
          
          if (currentCoins >= entryFeeInTx) {
            // Store coins BEFORE entry fee (for loser animation comparison later)
            sessionStorage.setItem('coins-before-entry-fee', currentCoins.toString());
            console.log('[Coins] 💾 Stored coins BEFORE entry fee:', currentCoins);
            
            // Deduct entry fee
            const newCoins = currentCoins - entryFeeInTx;
            transaction.update(userRef, {
              coins: newCoins,
            });
            
            // Mark as paid in room
            const updatedCoinsPaid = { ...coinsPaidInTx, [user.uid]: true };
            transaction.update(roomRef, {
              coinsPaid: updatedCoinsPaid,
            });
            
            entryFeeCharged = true;
            console.log('[Coins] ✅ Entry fee charged: -' + entryFeeInTx + ' coins');
            console.log('[Coins] Balance: ', currentCoins, ' -> ', newCoins);
          } else {
            console.error('[Coins] Insufficient coins to enter matchmaking game. Required:', entryFeeInTx, ', Have:', currentCoins);
          }
        });

        // After transaction completes, refresh the user profile to update local state
        if (entryFeeCharged) {
          // Mark as paid in sessionStorage
          sessionStorage.setItem(entryFeeStorageKey, 'true');
          
          // Mark that we've animated the entry fee to prevent double animation
          sessionStorage.setItem('entry-fee-animated', 'true');
          
          // Get the actual balance from database (after transaction committed)
          // Wait a bit for transaction to fully commit
          setTimeout(async () => {
            if (refreshUserProfile) {
              const refreshed = await refreshUserProfile();
              if (refreshed) {
                const actualCoinsAfterEntry = refreshed.coins;
                console.log('[Coins] 💾 Actual coins after entry fee (from database):', actualCoinsAfterEntry);
                
                // Store the ACTUAL balance from database (most reliable)
                sessionStorage.setItem('coins-after-entry-fee', actualCoinsAfterEntry.toString());
                console.log('[Coins] 💾 Stored coins-after-entry-fee (from database):', actualCoinsAfterEntry);
                
                // Start coin animation with actual values
                if (userProfile) {
                  const startCoins = userProfile.coins;
                  const endCoins = actualCoinsAfterEntry;
                  
                  console.log('[Coins] 🎬 Starting entry fee animation:', startCoins, '->', endCoins);
                  
                  // Set displayed coins to start value
                  setDisplayedCoins(startCoins);
                  prevCoinsRef.current = startCoins;
                  
                  // Show animation (use entryFee from room, but we need to get it from room data)
                  // For now, calculate the amount from the difference
                  const animationAmount = startCoins - endCoins;
                  setCoinAnimation({ amount: animationAmount, type: 'deduct' });
                  
                  // Animate countdown
                  animateCoinCountdown(startCoins, endCoins);
                  
                  // Clear animation after 2.5 seconds
                  setTimeout(() => {
                    setCoinAnimation(null);
                    setDisplayedCoins(endCoins);
                    prevCoinsRef.current = endCoins;
                    // Clear the flag after animation completes
                    sessionStorage.removeItem('entry-fee-animated');
                  }, 2800);
                }
              }
            }
          }, 500); // Small delay to ensure transaction is committed
          
          console.log('[Coins] 💰 Entry fee of', entryFee, 'coins deducted and profile refresh scheduled');
        } else {
          // Reset flag if entry fee wasn't charged
          hasChargedEntryFee.current = false;
        }
      } catch (err) {
        console.error('[Coins] Error charging entry fee:', err);
        hasChargedEntryFee.current = false; // Reset flag on error
      }
    };

    chargeEntryFee();
  }, [isMatched, matchedRoomId, user?.uid, db, refreshUserProfile, userProfile]);

  // Animate coin countdown
  const animateCoinCountdown = (start: number, end: number) => {
    const duration = 800; // 800ms animation
    const steps = 20;
    const stepValue = (end - start) / steps;
    const stepDuration = duration / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayedCoins(end);
        clearInterval(interval);
      } else {
        const currentValue = Math.round(start + (stepValue * currentStep));
        setDisplayedCoins(currentValue);
      }
    }, stepDuration);
  };

  // Initialize displayed coins - prioritize stored old balance to prevent flash
  useEffect(() => {
    if (userProfile && displayedCoins === null) {
      // Check for payout coins (winner case - need to animate from after-entry-fee to after-payout)
      const payoutCoinsStr = sessionStorage.getItem('coins-before-payout');
      const payoutCoins = payoutCoinsStr ? parseInt(payoutCoinsStr, 10) : null;
      
      // Also check coins-after-entry-fee as a fallback/verification
      const afterEntryFeeStr = sessionStorage.getItem('coins-after-entry-fee');
      const afterEntryFee = afterEntryFeeStr ? parseInt(afterEntryFeeStr, 10) : null;
      
      console.log('[Coins] Initializing displayed coins...');
      console.log('[Coins]   - Current userProfile.coins:', userProfile.coins);
      console.log('[Coins]   - coins-before-payout (from payout):', payoutCoins);
      console.log('[Coins]   - coins-after-entry-fee (from entry):', afterEntryFee);
      
      let initialCoins = userProfile.coins; // Default to current balance
      
      if (payoutCoins !== null) {
        // Winner case - use payout coins (balance after entry fee) for animation
        initialCoins = payoutCoins;
        console.log('[Coins] ✅ Initialized to coins-before-payout (winner case):', initialCoins);
        
        // Verify: payoutCoins should match afterEntryFee (if available)
        if (afterEntryFee !== null && payoutCoins !== afterEntryFee) {
          console.error('[Coins] ⚠️⚠️⚠️ MISMATCH! coins-before-payout (', payoutCoins, ') != coins-after-entry-fee (', afterEntryFee, ')');
          console.error('[Coins] ⚠️ Using payoutCoins for animation, but this might be wrong!');
        }
      } else {
        // Loser case - use current balance (entry fee already deducted and animated)
        initialCoins = userProfile.coins;
        console.log('[Coins] ✅ Initialized to current balance (loser case):', initialCoins);
      }
      
      setDisplayedCoins(initialCoins);
      prevCoinsRef.current = initialCoins;
    }
  }, [userProfile, displayedCoins]);

  // Reset entry fee flag when leaving matchmaking
  useEffect(() => {
    if (!isMatched && !matchedRoomId) {
      hasChargedEntryFee.current = false;
    }
  }, [isMatched, matchedRoomId]);

  // Reset matchmaking states when component mounts (returning to home)
  // BUT only if we're not currently navigating to a room
  useEffect(() => {
    // Only reset if we're on home page and matchmaking states are stale
    const currentPath = window.location.pathname;
    console.log('[Home] Reset check', {
      currentPath,
      isMatched,
      matchedRoomId
    });
    
    if (currentPath === '/') {
      // If matched but we're back on home, something went wrong - reset
      // BUT give it much more time - navigation might be in progress (3s delay + router time)
      // DO NOT reset if we're matched - let the navigation complete naturally
      if (isMatched && matchedRoomId) {
        console.log('[Home] ⏳ Matched state detected on home - waiting before reset');
        // Don't reset at all while matched - navigation will happen
        // Only reset if we're still on home after a very long delay (something went wrong)
        const timeout = setTimeout(() => {
          const stillOnHome = window.location.pathname === '/';
          // Only reset if we're still on home after navigation should have completed (3s + 5s buffer)
          if (stillOnHome && isMatched) {
            console.log('[Home] ⚠️ Resetting stale matched state after long delay');
            leaveQueue();
          }
        }, 9000); // 9 seconds total - 3s for message + 6s buffer
        return () => clearTimeout(timeout);
      }
    }
  }, [isMatched, matchedRoomId, leaveQueue]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
    };

    if (showProfileDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileDropdown]);

  const handleSignOut = async () => {
    setShowProfileDropdown(false);
    await logout();
  };

  // Initialize settings username when modal opens (only on open, not on userProfile changes)
  useEffect(() => {
    if (showSettingsModal && userProfile) {
      setSettingsUsername(userProfile.displayName || '');
      setUsernameError('');
    }
    // Only run when modal opens, not when userProfile changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettingsModal]);

  const handleUpdateUsername = async () => {
    if (!user || !userProfile || !db) return;

    const trimmedUsername = settingsUsername.trim();
    
    // Validate username
    if (!trimmedUsername) {
      setUsernameError('Username cannot be empty');
      return;
    }

    if (trimmedUsername.length < 3) {
      setUsernameError('Username must be at least 3 characters');
      return;
    }

    if (trimmedUsername.length > 20) {
      setUsernameError('Username must be less than 20 characters');
      return;
    }

    // Check if username is the same as current
    if (trimmedUsername === userProfile.displayName) {
      setUsernameError(''); // Clear error if it's the same
      return;
    }

    setUsernameLoading(true);
    setUsernameError('');

    try {
      // Check if username is already taken by another user
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('displayName', '==', trimmedUsername));
      const querySnapshot = await getDocs(q);

      // Check if any other user has this username
      const isTaken = querySnapshot.docs.some(doc => doc.id !== user.uid);
      
      if (isTaken) {
        setUsernameError('This username is already taken');
        setUsernameLoading(false);
        return;
      }

      // Update username
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: trimmedUsername,
      });

      // Refresh user profile
      if (refreshUserProfile) {
        await refreshUserProfile();
      }

      setUsernameError('');
      setUsernameLoading(false);
    } catch (error: any) {
      console.error('Error updating username:', error);
      setUsernameError(error.message || 'Failed to update username');
      setUsernameLoading(false);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !supabase) return;

    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Image must be less than 2MB');
      return;
    }

    setPhotoUploading(true);
    setPhotoError('');

    try {
      // Create file path: profile-pictures/{userId}/{timestamp}_{filename}
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `profile-pictures/${user.uid}/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(filePath);
      
      // Update Firebase Auth profile with Supabase URL
      await updateProfile(user, {
        photoURL: publicUrl
      });

      // Also save photoURL to Firestore so opponents can see it
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        photoURL: publicUrl
      });

      // Reload user to get updated photoURL
      await user.reload();
      
      // Refresh user profile
      if (refreshUserProfile) {
        await refreshUserProfile();
      }

      setPhotoError('');
      setPhotoUploading(false);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      setPhotoError(error.message || 'Failed to upload photo. Please try again.');
      setPhotoUploading(false);
    }
  };

  const handleCreateRoom = () => {
    if (!user || !userProfile) {
      setShowAuth(true);
      return;
    }

    // Store coins before navigating (for animation on return)
    if (userProfile.coins !== undefined) {
      sessionStorage.setItem('coins-before-navigation', userProfile.coins.toString());
      console.log('[Coins] Stored coins before creating room:', userProfile.coins);
    }

    // Normalize to lowercase for Firestore (case-sensitive document IDs)
    const newRoomId = Math.random().toString(36).substring(2, 9).toLowerCase();
    setCreatedRoomId(newRoomId.toUpperCase()); // Store uppercase version for display
  };

  const handleNavigateToRoom = (roomId: string) => {
    router.push(`/room/${roomId.toLowerCase()}`);
    setShowRoomModal(false);
    setCreatedRoomId(null);
  };

  const handleJoinRoom = () => {
    if (!user || !userProfile) {
      setShowAuth(true);
      return;
    }

    if (!roomId.trim()) {
      alert('Please enter a room code');
      return;
    }

    // Store coins before navigating (for animation on return)
    if (userProfile.coins !== undefined) {
      sessionStorage.setItem('coins-before-navigation', userProfile.coins.toString());
      console.log('[Coins] Stored coins before joining room:', userProfile.coins);
    }

    // Normalize to lowercase for Firestore (case-sensitive document IDs)
    const normalizedRoomId = roomId.trim().toLowerCase();
    router.push(`/room/${normalizedRoomId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (showAuth || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 flex items-center justify-center p-4">
        <AuthForm onSuccess={() => setShowAuth(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 flex items-center justify-center p-4">
      {/* Fixed Header Bar - Top of page, centered */}
      {userProfile && (
        <div className="fixed top-0 left-1/2 transform -translate-x-1/2 w-full max-w-4xl px-4 pt-3 sm:pt-4 z-[60]">
          <div className="flex items-center gap-3">
            <div className="bg-black bg-opacity-70 rounded-xl p-3 shadow-xl border border-gray-700/50 w-full">
              <div className="flex items-center justify-between gap-4">
                {/* Profile Section - Left side (clickable) */}
                <div className="relative flex-shrink-0" ref={dropdownRef}>
                  <button
                    onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    {user?.photoURL ? (
                      <Image
                        src={user.photoURL}
                        alt="Profile"
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                        {(userProfile.displayName || userProfile.email || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="text-left">
                      <p className="text-white font-semibold text-sm whitespace-nowrap">
                        {userProfile.displayName || userProfile.email?.split('@')[0]}
                      </p>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${showProfileDropdown ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  <AnimatePresence>
                    {showProfileDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-full left-0 mt-2 w-auto min-w-[140px] bg-black bg-opacity-90 rounded-xl shadow-2xl border border-gray-700/50 overflow-hidden z-20"
                      >
                        <button
                          onClick={() => {
                            setShowProfileDropdown(false);
                            setShowSettingsModal(true);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-gray-700/50 transition-colors duration-200 flex items-center gap-3 text-gray-200 hover:text-white"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                          </svg>
                          <span className="font-medium">Settings</span>
                        </button>
                        <button
                          onClick={handleSignOut}
                          className="w-full px-4 py-3 text-left hover:bg-red-500/20 transition-colors duration-200 flex items-center gap-3 text-red-300 hover:text-red-200 border-t border-gray-700/50"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                          </svg>
                          <span className="font-medium">Sign Out</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Coins Section - Right side (clickable) */}
                <div 
                  ref={coinBalanceRef}
                  className="flex items-center gap-1 flex-shrink-0"
                >
                  <button
                    onClick={() => setShowBuyCoinsModal(true)}
                    className="text-yellow-400 font-bold text-xl flex items-center gap-1 hover:text-yellow-300 transition-colors cursor-pointer"
                  >
                    <CoinIcon className="text-yellow-400" size={20} />
                    {displayedCoins !== null ? displayedCoins.toLocaleString() : userProfile.coins.toLocaleString()}
                  </button>
                </div>
              </div>
              {user && !user.emailVerified && (
                <div className="mt-2 bg-yellow-500/20 border border-yellow-500/50 text-yellow-200 px-2 py-1 rounded-lg text-xs text-center">
                  ⚠️ Verify email
                </div>
              )}
            </div>
            {/* Coin Change Animation - Outside the box to the right */}
            <AnimatePresence>
              {coinAnimation && (
                <motion.span
                  initial={{ opacity: 0, x: -20, scale: 0.8 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 10, scale: 0.8 }}
                  transition={{ duration: 0.3 }}
                  className={`text-lg font-bold whitespace-nowrap ${
                    coinAnimation.type === 'win' 
                      ? 'text-green-400' 
                      : coinAnimation.type === 'loss'
                      ? 'text-red-400'
                      : 'text-red-400'
                  }`}
                >
                  {coinAnimation.type === 'win' ? '+' : '-'}{coinAnimation.amount}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Bento Grid - Centered */}
      <div className="w-full max-w-4xl px-4 pt-24 sm:pt-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <div className="flex justify-center mb-3">
            <Image 
              src="/logo.png" 
              alt="Konchina Logo" 
              width={96} 
              height={96} 
              className="w-24 h-24 object-contain"
            />
          </div>
          <h2 className="text-4xl font-bold text-white mb-2">Konchina</h2>

        </motion.div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Play with Friends Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-3xl p-6 shadow-2xl border-2 border-gray-700/50 hover:border-yellow-500/50 transition-all duration-300 relative overflow-hidden"
          >
            {/* Decorative background pattern */}
            <div className="absolute inset-0 opacity-5">
              <div className="absolute top-4 right-4 w-16 h-16">
                <Image 
                  src="/logo.png" 
                  alt="" 
                  width={64} 
                  height={64} 
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="absolute bottom-4 left-4 text-4xl">♠</div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-5xl">♥</div>
            </div>

            <div className="relative z-10 flex flex-col h-full min-h-[320px]">
              {/* Icon and Title */}
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">👥</div>
                <h3 className="text-2xl font-bold text-white mb-1">Play with Friends</h3>
                <div className="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent my-3"></div>
              </div>

              {/* Play Button */}
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowRoomModal(true)}
                className="w-full bg-gradient-to-b from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-bold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 mt-auto"
              >
                <span>Play Now</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </motion.button>
            </div>
          </motion.div>

          {/* Play Online Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-3xl p-6 shadow-2xl border-2 border-gray-700/50 hover:border-green-500/50 transition-all duration-300 relative overflow-hidden"
          >
            {/* Decorative background pattern */}
            <div className="absolute inset-0 opacity-5">
              <div className="absolute top-4 right-4 text-6xl">🌐</div>
              <div className="absolute bottom-4 left-4 text-4xl">⚔️</div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-5xl">🏆</div>
            </div>

            <div className="relative z-10 flex flex-col h-full min-h-[320px]">
              {/* Icon and Title */}
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">🌐</div>
                <h3 className="text-2xl font-bold text-white mb-1">Play Online</h3>
                <div className="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent my-3"></div>
              </div>

              {/* Info Text */}
              <div className="mb-6 flex-1 flex flex-col items-center justify-center gap-4">
                <div className="text-gray-300 text-center text-sm">
                  Choose from different game modes with varying entry fees and rewards
                </div>
              </div>

              {/* Play Button */}
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (!user || !userProfile) {
                    setShowAuth(true);
                    return;
                  }
                  setShowGameSelectionModal(true);
                }}
                className="w-full bg-gradient-to-b from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 mt-auto"
              >
                <span>Play Now</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Matchmaking Modal */}
      {/* Keep modal open if matched OR if we have matchedRoomId (prevents premature closing) */}
      <AnimatePresence>
        {(showMatchmakingModal || isMatched || matchedRoomId) && (
          <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ 
                opacity: 1, 
                scale: showPopAnimation ? [1, 1.1, 1] : 1, 
                y: 0 
              }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ 
                duration: showPopAnimation ? 0.6 : 0.3,
                ease: showPopAnimation ? 'easeOut' : 'easeInOut',
                times: showPopAnimation ? [0, 0.5, 1] : undefined
              }}
              className="bg-gray-900/95 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-gray-700/50 max-w-md w-full mx-4"
            >
              {!isMatched && !matchedRoomId ? (
                // Searching Screen
                <>
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-white mb-4">Finding Opponent...</h2>
                    <div className="flex items-center justify-center gap-8 mb-6">
                      {/* Your Profile */}
                      <div className="flex flex-col items-center">
                        {user?.photoURL ? (
                          <Image
                            src={user.photoURL}
                            alt="Your Profile"
                            width={80}
                            height={80}
                            className="w-20 h-20 rounded-full object-cover mb-2 shadow-lg"
                          />
                        ) : (
                          <div className="w-20 h-20 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-2 shadow-lg">
                            {(userProfile?.displayName || userProfile?.email || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <p className="text-white font-semibold text-sm">
                          {userProfile?.displayName || userProfile?.email?.split('@')[0] || 'You'}
                        </p>
                      </div>

                      {/* VS Text */}
                      <div className="text-gray-500 text-xl font-bold">VS</div>

                      {/* Opponent Placeholder with Carousel */}
                      <div className="flex flex-col items-center">
                        <div className="w-20 h-20 rounded-full overflow-hidden shadow-lg relative">
                          {/* Carousel of profile pictures */}
                          <motion.div
                            className="flex flex-col"
                            animate={{ y: [0, -2080] }}
                            transition={{ 
                              duration: 8, 
                              repeat: Infinity, 
                              ease: 'linear' 
                            }}
                          >
                            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].map((letter, index) => {
                              const colors = [
                                'from-blue-500 to-blue-600',
                                'from-purple-500 to-purple-600',
                                'from-pink-500 to-pink-600',
                                'from-red-500 to-red-600',
                                'from-orange-500 to-orange-600',
                                'from-green-500 to-green-600',
                                'from-teal-500 to-teal-600',
                                'from-cyan-500 to-cyan-600',
                                'from-indigo-500 to-indigo-600',
                                'from-violet-500 to-violet-600',
                                'from-yellow-500 to-yellow-600',
                                'from-emerald-500 to-emerald-600',
                                'from-rose-500 to-rose-600',
                                'from-amber-500 to-amber-600',
                                'from-lime-500 to-lime-600',
                                'from-sky-500 to-sky-600',
                                'from-fuchsia-500 to-fuchsia-600',
                                'from-cyan-500 to-cyan-600',
                                'from-blue-500 to-blue-600',
                                'from-purple-500 to-purple-600',
                                'from-pink-500 to-pink-600',
                                'from-red-500 to-red-600',
                                'from-orange-500 to-orange-600',
                                'from-green-500 to-green-600',
                                'from-teal-500 to-teal-600',
                                'from-cyan-500 to-cyan-600',
                              ];
                              const colorClass = colors[index % colors.length];
                              
                              return (
                                <div
                                  key={index}
                                  className={`w-20 h-20 bg-gradient-to-br ${colorClass} flex items-center justify-center text-white font-bold text-2xl flex-shrink-0`}
                                >
                                  {letter}
                                </div>
                              );
                            })}
                            {/* Duplicate set for seamless loop */}
                            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].map((letter, index) => {
                              const colors = [
                                'from-blue-500 to-blue-600',
                                'from-purple-500 to-purple-600',
                                'from-pink-500 to-pink-600',
                                'from-red-500 to-red-600',
                                'from-orange-500 to-orange-600',
                                'from-green-500 to-green-600',
                                'from-teal-500 to-teal-600',
                                'from-cyan-500 to-cyan-600',
                                'from-indigo-500 to-indigo-600',
                                'from-violet-500 to-violet-600',
                                'from-yellow-500 to-yellow-600',
                                'from-emerald-500 to-emerald-600',
                                'from-rose-500 to-rose-600',
                                'from-amber-500 to-amber-600',
                                'from-lime-500 to-lime-600',
                                'from-sky-500 to-sky-600',
                                'from-fuchsia-500 to-fuchsia-600',
                                'from-cyan-500 to-cyan-600',
                                'from-blue-500 to-blue-600',
                                'from-purple-500 to-purple-600',
                                'from-pink-500 to-pink-600',
                                'from-red-500 to-red-600',
                                'from-orange-500 to-orange-600',
                                'from-green-500 to-green-600',
                                'from-teal-500 to-teal-600',
                                'from-cyan-500 to-cyan-600',
                              ];
                              const colorClass = colors[index % colors.length];
                              
                              return (
                                <div
                                  key={`dup-${index}`}
                                  className={`w-20 h-20 bg-gradient-to-br ${colorClass} flex items-center justify-center text-white font-bold text-2xl flex-shrink-0`}
                                >
                                  {letter}
                                </div>
                              );
                            })}
                          </motion.div>
                        </div>
                        <p className="text-gray-400 text-sm font-semibold mt-2">Searching...</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-green-400"></div>
                      <span className="text-green-400 text-sm font-semibold">Matching with players</span>
                    </div>
                  </div>

                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await leaveQueue();
                      setShowMatchmakingModal(false);
                    }}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200"
                  >
                    Cancel Search
                  </button>
                </>
              ) : (
                // Opponent Found - Same layout but updated
                <>
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-white mb-4">Opponent Found!</h2>
                    <div className="flex items-center justify-center gap-8 mb-6">
                      {/* Your Profile */}
                      <div className="flex flex-col items-center">
                        {user?.photoURL ? (
                          <Image
                            src={user.photoURL}
                            alt="Your Profile"
                            width={80}
                            height={80}
                            className="w-20 h-20 rounded-full object-cover mb-2 shadow-lg"
                          />
                        ) : (
                          <div className="w-20 h-20 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-2 shadow-lg">
                            {(userProfile?.displayName || userProfile?.email || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <p className="text-white font-semibold text-sm">
                          {userProfile?.displayName || userProfile?.email?.split('@')[0] || 'You'}
                        </p>
                      </div>

                      {/* VS Text */}
                      <div className="text-gray-500 text-xl font-bold">VS</div>

                      {/* Matched Opponent Profile */}
                      <div className="flex flex-col items-center">
                        {matchedOpponentProfile ? (
                          <>
                            {matchedOpponentProfile.photoURL ? (
                              <Image
                                src={matchedOpponentProfile.photoURL}
                                alt="Opponent Profile"
                                width={80}
                                height={80}
                                className="w-20 h-20 rounded-full object-cover mb-2 shadow-lg"
                              />
                            ) : (
                              <div className="w-20 h-20 bg-gradient-to-br from-gray-600 to-gray-700 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-2 shadow-lg">
                                {(matchedOpponentProfile.displayName || matchedOpponentProfile.email || 'O').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <p className="text-white font-semibold text-sm">
                              {matchedOpponentProfile.displayName || matchedOpponentProfile.email?.split('@')[0] || 'Opponent'}
                            </p>
                          </>
                        ) : (
                          <>
                            <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center text-gray-500 text-2xl mb-2 shadow-lg animate-pulse">
                              ?
                            </div>
                            <p className="text-gray-400 text-sm font-semibold">Loading...</p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-green-400"></div>
                      <span className="text-green-400 text-sm font-semibold">Starting match...</span>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Room Modal */}
      <AnimatePresence>
        {showRoomModal && (
          <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3 }}
              className="bg-black bg-opacity-90 rounded-2xl p-8 md:p-12 max-w-md w-full shadow-2xl border border-gray-700/50 relative"
            >
              {/* Close Button */}
              <button
                onClick={() => {
                  setShowRoomModal(false);
                  setCreatedRoomId(null); // Reset room creation state
                }}
                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              <div className="space-y-6">
                {/* Create Room Section */}
                {createdRoomId ? (
                  // Room Created - Show Room Code
                  <div className="space-y-4">
                    <div className="text-center">
                      <h3 className="text-xl font-bold text-white mb-2">Room Created!</h3>
                      <p className="text-gray-400 text-sm mb-4">Share this code with your friend:</p>
                      <div className="bg-white bg-opacity-10 border-2 border-yellow-500 rounded-xl p-6 mb-4">
                        <div className="text-4xl font-bold text-yellow-400 font-mono tracking-wider">
                          {createdRoomId}
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            navigator.clipboard.writeText(createdRoomId);
                            // Show brief feedback
                            const btn = document.activeElement as HTMLElement;
                            const originalText = btn.textContent;
                            if (btn) {
                              btn.textContent = 'Copied!';
                              setTimeout(() => {
                                if (btn) btn.textContent = originalText;
                              }, 2000);
                            }
                          }}
                          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200"
                        >
                          Copy Code
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleNavigateToRoom(createdRoomId)}
                          className="flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-bold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                        >
                          Start Game
                        </motion.button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Create Room Button
                  <div className="space-y-3">
                    <motion.button
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleCreateRoom}
                      className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-bold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      Create New Room
                    </motion.button>
                    <p className="text-gray-400 text-xs text-center">Start a new game and share the code</p>
                  </div>
                )}

                {/* Divider - Only show when no room has been created */}
                {!createdRoomId && (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-600"></div>
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-4 bg-black bg-opacity-90 text-gray-400 font-medium">OR</span>
                      </div>
                    </div>

                    {/* Join Room Section */}
                    <div className="space-y-3">
                  <div>
                    <label className="block text-white text-sm font-semibold mb-2.5">
                      Enter Room Code
                    </label>
                    <input
                      type="text"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                      placeholder="ABC1234"
                      maxLength={7}
                      className="w-full px-5 py-3.5 rounded-xl bg-white bg-opacity-10 border-2 border-white border-opacity-20 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 focus:bg-opacity-15 transition-all duration-200 uppercase font-mono text-lg tracking-wider text-center"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleJoinRoom();
                          setShowRoomModal(false);
                        }
                      }}
                    />
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      handleJoinRoom();
                      setShowRoomModal(false);
                    }}
                    disabled={!roomId.trim()}
                    className={`w-full font-bold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 ${
                      roomId.trim()
                        ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white'
                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                    </svg>
                    Join Room
                  </motion.button>
                  <p className="text-gray-400 text-xs text-center">Enter a 7-character room code</p>
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="mt-8 pt-6 border-t border-gray-700 text-center">
                <p className="text-green-200 text-xs">
                  Share the room code with a friend to play together!
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Flying Coins Animation - Only for winners */}
      {flyingCoins.length > 0 && coinBalanceRef.current && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {flyingCoins.map((coinId, index) => {
            const balanceRect = coinBalanceRef.current?.getBoundingClientRect();
            if (!balanceRect) return null;
            
            // Stagger the coins for wave effect (faster stagger for more coins)
            const delay = index * 0.03;
            // Start from top right corner with slight randomization
            const startX = window.innerWidth + 50;
            const startY = 50 + (Math.random() * 150); // Top right area (50-200px from top)
            const endX = balanceRect.left + balanceRect.width / 2;
            const endY = balanceRect.top + balanceRect.height / 2;
            
            return (
              <motion.div
                key={coinId}
                className="absolute"
                initial={{
                  x: startX,
                  y: startY,
                  opacity: 1,
                  scale: 0.8,
                  rotate: 0,
                }}
                animate={{
                  x: endX,
                  y: endY,
                  opacity: [1, 1, 1, 0.8, 0],
                  scale: [0.8, 1.1, 1, 0.6, 0.2],
                  rotate: [0, 180, 360, 540],
                }}
                transition={{
                  duration: 1.2,
                  delay: delay,
                  ease: [0.25, 0.46, 0.45, 0.94], // Smooth ease out
                }}
              >
                <CoinIcon className="text-yellow-400" size={32} />
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Buy Coins Modal */}
      <AnimatePresence>
        {showBuyCoinsModal && (
          <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => {
              setShowBuyCoinsModal(false);
              setBuyCoinsModalTab('coins'); // Reset to coins tab when closing
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900/95 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-gray-700/50 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto flex flex-col"
            >
              <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <h2 className="text-3xl font-bold text-white">
                  {buyCoinsModalTab === 'coins' ? 'Buy Coins' : 'Background Themes'}
                </h2>
                <button
                  onClick={() => {
                    setShowBuyCoinsModal(false);
                    setBuyCoinsModalTab('coins'); // Reset to coins tab when closing
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto pb-20">
                {buyCoinsModalTab === 'coins' ? (
                  <div className="space-y-3">
                {/* Coin Package 1 - 20,000 coins */}
                <motion.div
                  whileHover={{ scale: 1.01, x: 4 }}
                  className="bg-gradient-to-r from-gray-800/50 to-gray-700/50 border border-gray-600/50 rounded-xl p-4 flex items-center justify-between hover:border-gray-500 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <CoinIcon className="text-yellow-400" size={28} />
                    <div>
                      <div className="text-xl font-bold text-white">20,000</div>
                      <div className="text-xs text-gray-400">Coins</div>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handlePurchase('20000', setLoadingPackage)}
                    disabled={loadingPackage === '20000'}
                    className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
                  >
                    {loadingPackage === '20000' ? 'Loading...' : '€3.00'}
                  </motion.button>
                </motion.div>

                {/* Coin Package 3 - 38,000 coins */}
                <motion.div
                  whileHover={{ scale: 1.01, x: 4 }}
                  className="bg-gradient-to-r from-gray-800/50 to-gray-700/50 border border-gray-600/50 rounded-xl p-4 flex items-center justify-between hover:border-gray-500 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <CoinIcon className="text-yellow-400" size={28} />
                    <div>
                      <div className="text-xl font-bold text-white">38,000</div>
                      <div className="text-xs text-gray-400">Coins</div>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handlePurchase('38000', setLoadingPackage)}
                    disabled={loadingPackage === '38000'}
                    className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
                  >
                    {loadingPackage === '38000' ? 'Loading...' : '€5.50'}
                  </motion.button>
                </motion.div>

                {/* Coin Package 4 - 90,000 coins */}
                <motion.div
                  whileHover={{ scale: 1.01, x: 4 }}
                  className="bg-gradient-to-r from-gray-800/50 to-gray-700/50 border border-gray-600/50 rounded-xl p-4 flex items-center justify-between hover:border-gray-500 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <CoinIcon className="text-yellow-400" size={28} />
                    <div>
                      <div className="text-xl font-bold text-white">90,000</div>
                      <div className="text-xs text-gray-400">Coins</div>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handlePurchase('90000', setLoadingPackage)}
                    disabled={loadingPackage === '90000'}
                    className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
                  >
                    {loadingPackage === '90000' ? 'Loading...' : '€10.50'}
                  </motion.button>
                </motion.div>

                {/* Coin Package 5 - 175,000 coins */}
                <motion.div
                  whileHover={{ scale: 1.01, x: 4 }}
                  className="bg-gradient-to-r from-gray-800/50 to-gray-700/50 border border-gray-600/50 rounded-xl p-4 flex items-center justify-between hover:border-gray-500 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <CoinIcon className="text-yellow-400" size={28} />
                    <div>
                      <div className="text-xl font-bold text-white">175,000</div>
                      <div className="text-xs text-gray-400">Coins</div>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handlePurchase('175000', setLoadingPackage)}
                    disabled={loadingPackage === '175000'}
                    className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
                  >
                    {loadingPackage === '175000' ? 'Loading...' : '€20.50'}
                  </motion.button>
                </motion.div>

                {/* Coin Package 6 - 240,000 coins */}
                <motion.div
                  whileHover={{ scale: 1.01, x: 4 }}
                  className="bg-gradient-to-r from-gray-800/50 to-gray-700/50 border border-gray-600/50 rounded-xl p-4 flex items-center justify-between hover:border-gray-500 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <CoinIcon className="text-yellow-400" size={28} />
                    <div>
                      <div className="text-xl font-bold text-white">240,000</div>
                      <div className="text-xs text-gray-400">Coins</div>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handlePurchase('240000', setLoadingPackage)}
                    disabled={loadingPackage === '240000'}
                    className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
                  >
                    {loadingPackage === '240000' ? 'Loading...' : '€25.50'}
                  </motion.button>
                </motion.div>

                {/* Coin Package 7 - 680,000 coins */}
                <motion.div
                  whileHover={{ scale: 1.01, x: 4 }}
                  className="bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 border-2 border-yellow-500/50 rounded-xl p-4 flex items-center justify-between hover:border-yellow-500 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <CoinIcon className="text-yellow-400" size={28} />
                    <div>
                      <div className="text-xl font-bold text-white">680,000</div>
                      <div className="text-xs text-gray-400">Coins • Best Value</div>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handlePurchase('680000', setLoadingPackage)}
                    disabled={loadingPackage === '680000'}
                    className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
                  >
                    {loadingPackage === '680000' ? 'Loading...' : '€60.00'}
                  </motion.button>
                </motion.div>

                {/* Coin Package 8 - 1,400,000 coins */}
                <motion.div
                  whileHover={{ scale: 1.01, x: 4 }}
                  className="bg-gradient-to-r from-gray-800/50 to-gray-700/50 border border-gray-600/50 rounded-xl p-4 flex items-center justify-between hover:border-gray-500 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <CoinIcon className="text-yellow-400" size={28} />
                    <div>
                      <div className="text-xl font-bold text-white">1,400,000</div>
                      <div className="text-xs text-gray-400">Coins</div>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handlePurchase('1400000', setLoadingPackage)}
                    disabled={loadingPackage === '1400000'}
                    className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
                  >
                    {loadingPackage === '1400000' ? 'Loading...' : '€110.00'}
                  </motion.button>
                  </motion.div>
                  </div>
                ) : (
                  /* Backgrounds Tab Content */
                  <div className="space-y-4">
                    {BACKGROUND_THEMES.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-6xl mb-4">🎨</div>
                        <h3 className="text-xl font-semibold text-white mb-2">Background Themes</h3>
                        <p className="text-gray-400 text-sm">
                          No backgrounds available yet
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-2">
                        {BACKGROUND_THEMES.map((background) => {
                          const isOwned = userProfile?.purchasedBackgrounds?.includes(background.id) || false;
                          const isActive = userProfile?.activeBackground === background.id;
                          const canAfford = (userProfile?.coins || 0) >= background.price;
                          
                          return (
                            <div
                              key={background.id}
                              className="overflow-visible"
                            >
                              <motion.div
                                whileHover={{ scale: 1.02 }}
                                className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                                  isActive
                                    ? 'border-yellow-500 shadow-lg shadow-yellow-500/50'
                                    : isOwned
                                    ? 'border-green-500/50 hover:border-green-500'
                                    : 'border-gray-700/50 hover:border-gray-600'
                                }`}
                              >
                                {/* Background Preview */}
                                <div className="relative aspect-video bg-gray-800">
                                  <Image
                                    src={background.imagePath}
                                    alt={background.name}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 640px) 100vw, 50vw"
                                  />
                                {isActive && (
                                  <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded-full">
                                    Active
                                  </div>
                                )}
                                {isOwned && !isActive && (
                                  <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                    Owned
                                  </div>
                                )}
                              </div>
                              
                              {/* Background Info */}
                              <div className="p-4 bg-gray-800/90">
                                <h3 className="text-white font-semibold mb-2">{background.name}</h3>
                                
                                {isOwned ? (
                                  <div className="flex gap-2">
                                    {!isActive && (
                                      <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={async () => {
                                          if (!user || !userProfile || !db) return;
                                          
                                          try {
                                            const userRef = doc(db, 'users', user.uid);
                                            await updateDoc(userRef, {
                                              activeBackground: background.id,
                                            });
                                            
                                            if (refreshUserProfile) {
                                              await refreshUserProfile();
                                            }
                                          } catch (error) {
                                            console.error('Error setting active background:', error);
                                            alert('Failed to set background. Please try again.');
                                          }
                                        }}
                                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                                      >
                                        Select
                                      </motion.button>
                                    )}
                                    {isActive && (
                                      <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={async () => {
                                          if (!user || !userProfile || !db) return;
                                          
                                          try {
                                            const userRef = doc(db, 'users', user.uid);
                                            await updateDoc(userRef, {
                                              activeBackground: null,
                                            });
                                            
                                            if (refreshUserProfile) {
                                              await refreshUserProfile();
                                            }
                                          } catch (error) {
                                            console.error('Error removing active background:', error);
                                            alert('Failed to reset background. Please try again.');
                                          }
                                        }}
                                        className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                                      >
                                        Use Default
                                      </motion.button>
                                    )}
                                  </div>
                                ) : (
                                  <motion.button
                                    whileHover={canAfford ? { scale: 1.05 } : {}}
                                    whileTap={canAfford ? { scale: 0.95 } : {}}
                                    onClick={async () => {
                                      if (!user || !userProfile || !db) return;
                                      
                                      if (!canAfford) {
                                        alert(`Insufficient coins! You need ${background.price.toLocaleString()} coins to purchase this background.`);
                                        return;
                                      }
                                      
                                      setBackgroundLoading(background.id);
                                      
                                      try {
                                        await runTransaction(db, async (transaction) => {
                                          const userRef = doc(db, 'users', user.uid);
                                          const userSnap = await transaction.get(userRef);
                                          
                                          if (!userSnap.exists()) {
                                            throw new Error('User not found');
                                          }
                                          
                                          const currentCoins = (userSnap.data() as any).coins || 0;
                                          const purchasedBackgrounds = (userSnap.data() as any).purchasedBackgrounds || [];
                                          
                                          if (currentCoins < background.price) {
                                            throw new Error('Insufficient coins');
                                          }
                                          
                                          if (purchasedBackgrounds.includes(background.id)) {
                                            throw new Error('Already purchased');
                                          }
                                          
                                          const newCoins = currentCoins - background.price;
                                          const updatedBackgrounds = [...purchasedBackgrounds, background.id];
                                          
                                          transaction.update(userRef, {
                                            coins: newCoins,
                                            purchasedBackgrounds: updatedBackgrounds,
                                            activeBackground: background.id, // Auto-select after purchase
                                          });
                                        });
                                        
                                        if (refreshUserProfile) {
                                          await refreshUserProfile();
                                        }
                                      } catch (error: any) {
                                        console.error('Error purchasing background:', error);
                                        alert(error.message || 'Failed to purchase background. Please try again.');
                                      } finally {
                                        setBackgroundLoading(null);
                                      }
                                    }}
                                    disabled={!canAfford || backgroundLoading === background.id}
                                    className={`w-full font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                                      canAfford
                                        ? 'bg-yellow-500 hover:bg-yellow-600 text-black'
                                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                    }`}
                                  >
                                    {backgroundLoading === background.id ? (
                                      <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                                        <span>Processing...</span>
                                      </>
                                    ) : (
                                      <>
                                        <CoinIcon className={canAfford ? 'text-black' : 'text-gray-400'} size={16} />
                                        <span>{background.price.toLocaleString()} coins</span>
                                      </>
                                    )}
                                  </motion.button>
                                )}
                              </div>
                            </motion.div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tabs Navigation - Fixed at bottom */}
              <div className="absolute bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-700/50 rounded-b-3xl p-4 flex-shrink-0">
                <div className="flex gap-2">
                  {/* Coins Tab */}
                  <button
                    onClick={() => setBuyCoinsModalTab('coins')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold transition-all ${
                      buyCoinsModalTab === 'coins'
                        ? 'bg-yellow-500 text-black'
                        : 'bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <CoinIcon className={buyCoinsModalTab === 'coins' ? 'text-black' : 'text-yellow-400'} size={20} />
                    <span>Coins</span>
                  </button>

                  {/* Backgrounds Tab */}
                  <button
                    onClick={() => setBuyCoinsModalTab('backgrounds')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold transition-all ${
                      buyCoinsModalTab === 'backgrounds'
                        ? 'bg-yellow-500 text-black'
                        : 'bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${buyCoinsModalTab === 'backgrounds' ? 'text-black' : 'text-gray-400'}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                    </svg>
                    <span>Backgrounds</span>
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Game Selection Modal */}
      <GameSelectionModal
        isOpen={showGameSelectionModal}
        onClose={() => setShowGameSelectionModal(false)}
        onSelectGame={async (entryFee, reward, winCondition) => {
          if (!user || !userProfile) {
            setShowAuth(true);
            return;
          }
          
          // Check if user has enough coins
          if (userProfile.coins < entryFee) {
            alert(`Insufficient coins! You need ${entryFee.toLocaleString()} coins to play this game mode.`);
            return;
          }
          
          // Store coins before navigating to matchmaking (for animation on return)
          if (userProfile.coins !== undefined) {
            sessionStorage.setItem('coins-before-navigation', userProfile.coins.toString());
            console.log('[Coins] Stored coins before matchmaking:', userProfile.coins);
          }
          
          // Store reward for animation later
          sessionStorage.setItem('game-reward', reward.toString());
          
          // Only show modal if not already matched (matched state is handled by listener)
          if (!isMatched) {
            setShowMatchmakingModal(true);
          }
          const result = await joinQueue(entryFee, reward, winCondition);
          if (!result.success && !result.matched) {
            setShowMatchmakingModal(false);
          }
        }}
        userCoins={userProfile?.coins || 0}
      />

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && userProfile && user && (
          <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setShowSettingsModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900/95 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-gray-700/50 max-w-md w-full mx-4"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-white">Account Settings</h2>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6">
                {/* Profile Picture */}
                <div className="flex flex-col items-center">
                  <div className="relative group">
                    {user?.photoURL ? (
                      <Image
                        src={user.photoURL}
                        alt="Profile"
                        width={96}
                        height={96}
                        className="w-24 h-24 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-24 h-24 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold text-3xl">
                        {(userProfile.displayName || userProfile.email || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    {photoUploading && (
                      <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                      </div>
                    )}
                    {/* Edit Icon Button */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                      id="photo-upload"
                      disabled={photoUploading}
                    />
                    <motion.label
                      htmlFor="photo-upload"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className={`absolute bottom-0 right-0 w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center cursor-pointer shadow-lg border-2 border-gray-900 transition-all ${
                        photoUploading
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-yellow-400 hover:scale-110'
                      }`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-black"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </motion.label>
                  </div>
                  {photoError && (
                    <p className="text-red-400 text-sm mt-3">{photoError}</p>
                  )}
                  <p className="text-gray-500 text-xs mt-2">Max 2MB, JPG/PNG</p>
                </div>

                {/* Username */}
                <div>
                  <label className="block text-white text-sm font-semibold mb-2">
                    Username
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={settingsUsername}
                      onChange={(e) => {
                        setSettingsUsername(e.target.value);
                        setUsernameError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleUpdateUsername();
                        }
                      }}
                      placeholder="Enter username"
                      maxLength={20}
                      className="flex-1 px-4 py-3 rounded-xl bg-white bg-opacity-10 border-2 border-white border-opacity-20 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 focus:bg-opacity-15 transition-all duration-200"
                    />
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleUpdateUsername}
                      disabled={usernameLoading || settingsUsername.trim() === userProfile.displayName}
                      className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold px-6 py-3 rounded-xl transition-colors"
                    >
                      {usernameLoading ? 'Saving...' : 'Save'}
                    </motion.button>
                  </div>
                  {usernameError && (
                    <p className="text-red-400 text-sm mt-2">{usernameError}</p>
                  )}
                  {!usernameError && settingsUsername.trim() !== userProfile.displayName && settingsUsername.trim() && (
                    <p className="text-gray-400 text-xs mt-2">Press Enter or click Save to update</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-white text-sm font-semibold mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={userProfile.email || ''}
                    disabled
                    className="w-full px-4 py-3 rounded-xl bg-gray-800 border-2 border-gray-700 text-gray-400 cursor-not-allowed"
                  />
                  <p className="text-gray-500 text-xs mt-2">Email cannot be changed</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reconnection Modal */}
      <AnimatePresence>
        {reconnectionGame && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-900/95 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-gray-700/50 max-w-md w-full mx-4"
            >
              <div className="text-center mb-6">
                <div className="text-5xl mb-4">🎮</div>
                <h2 className="text-2xl font-bold text-white mb-2">Reconnect to Game</h2>
                <p className="text-gray-300 text-sm">
                  You were in a game against <span className="font-semibold text-yellow-400">{reconnectionGame.opponentName}</span>
                </p>
              </div>

              {/* Timer */}
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  <span className="text-yellow-400 font-semibold text-sm">Time Remaining</span>
                </div>
                <div className="text-3xl font-bold text-white text-center">
                  {Math.floor(reconnectionTimer / 60)}:{(reconnectionTimer % 60).toString().padStart(2, '0')}
                </div>
                <p className="text-yellow-200 text-xs text-center mt-2">
                  {reconnectionTimer <= 60 
                    ? 'Game will be forfeited automatically if you don\'t rejoin'
                    : 'Rejoin before time expires to continue playing'}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleJoinBack}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Join Back
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleAutoForfeit}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200"
                >
                  Forfeit Game
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

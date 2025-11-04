'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, UserProfile } from '@/hooks/useAuth';
import { useMatchmaking } from '@/hooks/useMatchmaking';
import AuthForm from '@/components/AuthForm';
import { db } from '@/lib/firebase';
import { doc, getDoc, runTransaction } from 'firebase/firestore';

export default function Home() {
  const [roomId, setRoomId] = useState('');
  const router = useRouter();
  const { user, userProfile, loading, logout, refreshUserProfile } = useAuth();
  const { isInQueue, isMatchmaking, isMatched, matchedRoomId, joinQueue, leaveQueue } = useMatchmaking();
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

  useEffect(() => {
    // Show auth form if user is not authenticated
    if (!loading && !user) {
      setShowAuth(true);
    }
  }, [user, loading]);

  // Check for coin changes when returning to home page (e.g., after game ends)
  // This detects payout changes and triggers animations
  useEffect(() => {
    if (user && refreshUserProfile && !loading && userProfile) {
      const checkForCoinChanges = async () => {
        // Check if we've already processed this payout (prevent duplicate animations)
        const payoutProcessed = sessionStorage.getItem('payout-animation-processed');
        if (payoutProcessed === 'true') {
          console.log('[Coins] ⏭️ Skipping - payout animation already processed');
          return;
        }
        
        // Check for payout coins (stored inside transaction before payout)
        const payoutCoinsStr = sessionStorage.getItem('coins-before-payout');
        const payoutCoins = payoutCoinsStr ? parseInt(payoutCoinsStr, 10) : null;
        
        console.log('[Coins] 🔄 Checking for coin changes on home page return...');
        console.log('[Coins] Coins before payout (from transaction):', payoutCoins);
        console.log('[Coins] Current displayed coins:', displayedCoins);
        
        // Skip if we just animated the entry fee (prevent double animation)
        const entryFeeAnimated = sessionStorage.getItem('entry-fee-animated');
        if (entryFeeAnimated === 'true') {
          console.log('[Coins] ⏭️ Skipping coin change check - entry fee animation just completed');
          return;
        }
        
        // Refresh profile from database to get latest coins
        const refreshed = await refreshUserProfile();
        
        if (!refreshed) {
          console.log('[Coins] ⏭️ Failed to refresh profile');
          return;
        }
        
        const newCoins = refreshed.coins;
        console.log('[Coins] New coins (from database after refresh):', newCoins);
        
        // If no payout coins stored, this means no payout happened (loser case)
        // Losers should have NO animation - entry fee was already animated when match was found
        if (payoutCoins === null) {
          console.log('[Coins] 🎯 NO PAYOUT COINS STORED - This is a loser case, entry fee already animated');
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
        
        console.log('[Coins] 🎯 WINNER CASE DETECTED!');
        console.log('[Coins] Coins after entry fee (from entry fee - SOURCE OF TRUTH):', afterEntryFee);
        console.log('[Coins] Coins before payout (from payout transaction):', payoutCoins);
        console.log('[Coins] Coins after payout (from database):', newCoins);
        console.log('[Coins] Using oldCoins for animation:', oldCoins);
        console.log('[Coins] Difference (newCoins - oldCoins):', difference);
        
        // Validate: winner should have +1000 coins
        if (difference !== 1000) {
          console.error('[Coins] ⚠️ WARNING: Expected +1000 coins for winner, but got:', difference);
          console.error('[Coins] ⚠️ This might be stale data - clearing and skipping animation');
          setDisplayedCoins(newCoins);
          prevCoinsRef.current = newCoins;
          // Clear all stored values
          sessionStorage.removeItem('coins-before-entry-fee');
          sessionStorage.removeItem('coins-after-entry-fee');
          sessionStorage.removeItem('coins-before-payout');
          sessionStorage.removeItem('payout-animation-processed');
          return; // Exit early - don't animate invalid data
        }
        
        // Mark that we're processing this payout (prevent duplicate runs)
        sessionStorage.setItem('payout-animation-processed', 'true');
        
        // Ensure displayed coins is set to old value
        setDisplayedCoins(oldCoins);
        prevCoinsRef.current = oldCoins;
        
        // Small delay to ensure state is set, then trigger animation
        setTimeout(() => {
          console.log('[Coins] 🎉 WIN! Animating +1000 coins (counting UP from', oldCoins, 'to', newCoins, ')');
          setCoinAnimation({ amount: 1000, type: 'win' });
          animateCoinCountdown(oldCoins, newCoins);
          
          setTimeout(() => {
            setCoinAnimation(null);
            prevCoinsRef.current = newCoins;
            setDisplayedCoins(newCoins);
            // Clear stored values AFTER animation completes
            sessionStorage.removeItem('coins-before-entry-fee');
            sessionStorage.removeItem('coins-after-entry-fee');
            sessionStorage.removeItem('coins-before-payout');
            sessionStorage.removeItem('payout-animation-processed');
            console.log('[Coins] ✅ Animation complete, coins updated to:', newCoins);
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
          
          if (coinsPaidInTx[user.uid]) {
            console.log('[Coins] Entry fee already paid (transaction check) - skipping');
            return;
          }
          
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await transaction.get(userRef);
          
          if (!userSnap.exists()) return;
          
          const currentCoins = (userSnap.data() as any).coins || 0;
          
          if (currentCoins >= 500) {
            // Store coins BEFORE entry fee (for loser animation comparison later)
            sessionStorage.setItem('coins-before-entry-fee', currentCoins.toString());
            console.log('[Coins] 💾 Stored coins BEFORE entry fee:', currentCoins);
            
            // Deduct entry fee
            const newCoins = currentCoins - 500;
            transaction.update(userRef, {
              coins: newCoins,
            });
            
            // Mark as paid in room
            const updatedCoinsPaid = { ...coinsPaidInTx, [user.uid]: true };
            transaction.update(roomRef, {
              coinsPaid: updatedCoinsPaid,
            });
            
            entryFeeCharged = true;
            console.log('[Coins] ✅ Entry fee charged: -500 coins');
            console.log('[Coins] Balance: ', currentCoins, ' -> ', newCoins);
          } else {
            console.error('[Coins] Insufficient coins to enter matchmaking game. Required: 500, Have:', currentCoins);
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
                  
                  // Show animation
                  setCoinAnimation({ amount: 500, type: 'deduct' });
                  
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
          
          console.log('[Coins] 💰 Entry fee of 500 coins deducted and profile refresh scheduled');
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
        <div className="fixed top-0 left-1/2 transform -translate-x-1/2 w-full max-w-4xl px-4 pt-4 z-[60]">
          <div className="flex items-center gap-3">
            <div className="bg-black bg-opacity-70 rounded-xl p-3 shadow-xl border border-gray-700/50 w-full">
              <div className="flex items-center justify-between gap-4">
                {/* Profile Section - Left side (clickable) */}
                <div className="relative flex-shrink-0" ref={dropdownRef}>
                  <button
                    onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                      {(userProfile.displayName || userProfile.email || 'U').charAt(0).toUpperCase()}
                    </div>
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
                          onClick={handleSignOut}
                          className="w-full px-4 py-3 text-left hover:bg-red-500/20 transition-colors duration-200 flex items-center gap-3 text-red-300 hover:text-red-200"
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

                {/* Coins Section - Right side */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-yellow-400 font-bold text-xl flex items-center gap-1">
                    💰 {displayedCoins !== null ? displayedCoins.toLocaleString() : userProfile.coins.toLocaleString()}
                  </span>
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
      <div className="w-full max-w-4xl px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <h1 className="text-6xl font-bold text-white mb-3">🎴</h1>
          <h2 className="text-4xl font-bold text-white mb-2">Konchina</h2>
          <p className="text-green-200 text-sm">Choose your game mode</p>
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
              <div className="absolute top-4 right-4 text-6xl">🎴</div>
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

              {/* Award and Entry - Clear and Centered */}
              <div className="mb-6 flex-1 flex flex-col items-center justify-center gap-8">
                {/* Potential Award - Most Prominent */}
                <div className="flex flex-col items-center gap-3">
                  <div className="text-gray-300 text-sm font-medium uppercase tracking-wider">Award</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-yellow-400 font-bold text-5xl">1,000</span>
                    <span className="text-yellow-400 text-2xl">💰</span>
                  </div>
                </div>

                {/* Entry Fee - Secondary but Clear */}
                <div className="flex flex-col items-center gap-3">
                  <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">Entry Fee</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-red-400 font-bold text-3xl">500</span>
                    <span className="text-red-400 text-xl">💰</span>
                  </div>
                </div>
              </div>

              {/* Play Button */}
              <motion.button
                whileHover={userProfile && userProfile.coins >= 500 ? { scale: 1.02, y: -2 } : {}}
                whileTap={userProfile && userProfile.coins >= 500 ? { scale: 0.98 } : {}}
                onClick={async () => {
                  if (!user || !userProfile) {
                    setShowAuth(true);
                    return;
                  }
                  
                  // Check if user has enough coins
                  if (userProfile.coins < 500) {
                    alert('Insufficient coins! You need 500 coins to play online.');
                    return;
                  }
                  
                  // Store coins before navigating to matchmaking (for animation on return)
                  if (userProfile.coins !== undefined) {
                    sessionStorage.setItem('coins-before-navigation', userProfile.coins.toString());
                    console.log('[Coins] Stored coins before matchmaking:', userProfile.coins);
                  }
                  
                  // Only show modal if not already matched (matched state is handled by listener)
                  if (!isMatched) {
                    setShowMatchmakingModal(true);
                  }
                  const result = await joinQueue();
                  if (!result.success && !result.matched) {
                    setShowMatchmakingModal(false);
                  }
                }}
                disabled={userProfile && userProfile.coins < 500}
                className={`w-full font-bold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 mt-auto ${
                  userProfile && userProfile.coins < 500
                    ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-gray-600/50'
                    : 'bg-gradient-to-b from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white'
                }`}
              >
                {userProfile && userProfile.coins < 500 ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    <span>Insufficient Coins</span>
                  </>
                ) : (
                  <>
                    <span>Play Now</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </>
                )}
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
                        <div className="w-20 h-20 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-2 shadow-lg">
                          {(userProfile?.displayName || userProfile?.email || 'U').charAt(0).toUpperCase()}
                        </div>
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
                        <div className="w-20 h-20 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-2 shadow-lg">
                          {(userProfile?.displayName || userProfile?.email || 'U').charAt(0).toUpperCase()}
                        </div>
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
                            <div className="w-20 h-20 bg-gradient-to-br from-gray-600 to-gray-700 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-2 shadow-lg">
                              {(matchedOpponentProfile.displayName || matchedOpponentProfile.email || 'O').charAt(0).toUpperCase()}
                            </div>
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
    </div>
  );
}

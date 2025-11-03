'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
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
        
        // First, check for payout coins (stored right before payout transaction)
        const payoutCoinsStr = sessionStorage.getItem('coins-before-payout');
        const payoutCoins = payoutCoinsStr ? parseInt(payoutCoinsStr, 10) : null;
        
        // Also check for coins stored before navigation (fallback)
        const navCoinsStr = sessionStorage.getItem('coins-before-navigation');
        const navCoins = navCoinsStr ? parseInt(navCoinsStr, 10) : null;
        
        console.log('[Coins] 🔄 Checking for coin changes on home page return...');
        console.log('[Coins] Coins before payout:', payoutCoins);
        console.log('[Coins] Coins before navigation:', navCoins);
        
        // Skip if we just animated the entry fee (prevent double animation)
        const entryFeeAnimated = sessionStorage.getItem('entry-fee-animated');
        if (entryFeeAnimated === 'true') {
          console.log('[Coins] ⏭️ Skipping coin change check - entry fee animation just completed');
          return;
        }
        
        // Refresh profile from database to get latest coins
        const refreshed = await refreshUserProfile();
        
        if (refreshed) {
          const newCoins = refreshed.coins;
          console.log('[Coins] New coins (from database after refresh):', newCoins);
          
          // Check if this is a loser case first (no payout, entry fee already deducted)
          // Losers should have NO animation - entry fee was already animated when match was found
          const entryFeeCoinsStr = sessionStorage.getItem('coins-before-entry-fee');
          const entryFeeCoins = entryFeeCoinsStr ? parseInt(entryFeeCoinsStr, 10) : null;
          
          // If current coins match entry-fee coins - 500, this is a loser (no payout happened)
          // AND there's no payout coins stored, then skip animation entirely
          if (entryFeeCoins !== null && payoutCoins === null) {
            const expectedLoserCoins = entryFeeCoins - 500;
            if (newCoins === expectedLoserCoins) {
              // This is a loser - entry fee already deducted, no payout, no animation needed
              console.log('[Coins] 🎯 LOSER DETECTED! No payout, entry fee already animated - skipping animation');
              setDisplayedCoins(newCoins);
              prevCoinsRef.current = newCoins;
              // Clear stored values - no animation needed
              sessionStorage.removeItem('coins-before-entry-fee');
              sessionStorage.removeItem('coins-before-payout');
              sessionStorage.removeItem('coins-before-navigation');
              return; // Exit early - no animation for losers
            }
          }
          
          // If no stored coins for payout animation, no animation needed
          if (payoutCoins === null && navCoins === null) {
            console.log('[Coins] ⏭️ No stored coin values for payout - no animation needed');
            return;
          }
          
          // Prioritize payout coins if available (most accurate), otherwise use navigation coins
          const oldCoins = payoutCoins !== null ? payoutCoins : (navCoins !== null ? navCoins : (displayedCoins !== null ? displayedCoins : userProfile.coins));
          
          const difference = newCoins - oldCoins;
          console.log('[Coins] Difference (new - old):', difference);
          console.log('[Coins] Old balance:', oldCoins, ', New balance:', newCoins);
          
          // If there's a significant coin change (>= 100), trigger animation
          if (Math.abs(difference) >= 100) {
            console.log('[Coins] 🎯 SIGNIFICANT CHANGE DETECTED! Difference:', difference);
            
            // Mark that we're processing this payout (prevent duplicate runs)
            sessionStorage.setItem('payout-animation-processed', 'true');
            
            // Ensure displayed coins is set to old value (might already be set from initialization, but ensure it)
            if (displayedCoins !== oldCoins) {
              setDisplayedCoins(oldCoins);
            }
            prevCoinsRef.current = oldCoins;
            
            // Small delay to ensure state is set, then trigger animation
            setTimeout(() => {
              if (difference > 0) {
                // Win: +1000 (count UP)
                console.log('[Coins] 🎉 WIN! Animating +1000 coins (counting UP from', oldCoins, 'to', newCoins, ')');
                setCoinAnimation({ amount: 1000, type: 'win' });
                animateCoinCountdown(oldCoins, newCoins);
                setTimeout(() => {
                  setCoinAnimation(null);
                  prevCoinsRef.current = newCoins;
                  setDisplayedCoins(newCoins);
                  // Clear stored values AFTER animation completes
                  if (payoutCoinsStr) sessionStorage.removeItem('coins-before-payout');
                  if (navCoinsStr) sessionStorage.removeItem('coins-before-navigation');
                  if (entryFeeCoinsStr) sessionStorage.removeItem('coins-before-entry-fee');
                  sessionStorage.removeItem('payout-animation-processed');
                }, 2800);
              } else {
                // This shouldn't happen for losers (handled above), but just in case
                const amount = Math.abs(difference);
                const animType = 'loss';
                console.log('[Coins] 💸 LOSS! Animating', amount, 'coins (counting DOWN from', oldCoins, 'to', newCoins, ')');
                setCoinAnimation({ amount: amount, type: animType });
                animateCoinCountdown(oldCoins, newCoins);
                setTimeout(() => {
                  setCoinAnimation(null);
                  prevCoinsRef.current = newCoins;
                  setDisplayedCoins(newCoins);
                  // Clear stored values AFTER animation completes
                  if (payoutCoinsStr) sessionStorage.removeItem('coins-before-payout');
                  if (navCoinsStr) sessionStorage.removeItem('coins-before-navigation');
                  if (entryFeeCoinsStr) sessionStorage.removeItem('coins-before-entry-fee');
                  sessionStorage.removeItem('payout-animation-processed');
                }, 2800);
              }
            }, 300);
          } else {
            // No significant change, just update
            console.log('[Coins] No significant change (difference:', difference, '), updating display');
            setDisplayedCoins(newCoins);
            prevCoinsRef.current = newCoins;
            // Clear stored values even if no animation
            if (payoutCoinsStr) sessionStorage.removeItem('coins-before-payout');
            if (navCoinsStr) sessionStorage.removeItem('coins-before-navigation');
          }
        }
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

  // Charge entry fee IMMEDIATELY when match is found (when "Opponent Found!" appears)
  useEffect(() => {
    if (!isMatched || !matchedRoomId || !user?.uid || !db || hasChargedEntryFee.current) return;
    
    const chargeEntryFee = async () => {
      try {
        console.log('[Coins] 💳 Charging entry fee - match found! Room:', matchedRoomId);
        
        // Check sessionStorage to prevent duplicate charging
        const entryFeeStorageKey = `entry-paid-${matchedRoomId}-${user.uid}`;
        if (sessionStorage.getItem(entryFeeStorageKey)) {
          console.log('[Coins] Entry fee already paid (sessionStorage check)');
          hasChargedEntryFee.current = true;
          return;
        }

        const roomRef = doc(db, 'rooms', matchedRoomId);
        const roomSnap = await getDoc(roomRef);
        
        if (!roomSnap.exists()) {
          console.error('[Coins] Room not found when charging entry fee');
          return;
        }

        const roomData = roomSnap.data();
        const coinsPaid = roomData.coinsPaid || {};
        
        // Check if we've already paid (in case of reconnection)
        if (coinsPaid[user.uid]) {
          console.log('[Coins] Entry fee already paid according to room data');
          hasChargedEntryFee.current = true;
          sessionStorage.setItem(entryFeeStorageKey, 'true');
          return;
        }

        let entryFeeCharged = false;

        // Charge entry fee using transaction to prevent double charging
        await runTransaction(db, async (transaction) => {
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
            const updatedCoinsPaid = { ...coinsPaid, [user.uid]: true };
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
          hasChargedEntryFee.current = true;
          sessionStorage.setItem(entryFeeStorageKey, 'true');
          
          // Mark that we've animated the entry fee to prevent double animation
          sessionStorage.setItem('entry-fee-animated', 'true');
          
          // Start coin animation immediately when entry fee is charged
          if (userProfile) {
            const startCoins = userProfile.coins;
            const endCoins = startCoins - 500;
            
            console.log('[Coins] 🎬 Starting entry fee animation:', startCoins, '->', endCoins);
            
            // Update stored coins for comparison when returning from game
            // This is AFTER entry fee, so payout comparison will be correct
            sessionStorage.setItem('coins-before-navigation', endCoins.toString());
            
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
              // Update the stored value to the new balance after entry fee
              setDisplayedCoins(endCoins);
              prevCoinsRef.current = endCoins;
            }, 2800);
          }
          
          // Refresh profile AFTER animation completes to prevent triggering double animation
          setTimeout(async () => {
            if (refreshUserProfile) {
              await refreshUserProfile();
              // Clear the flag after refresh completes
              sessionStorage.removeItem('entry-fee-animated');
            }
          }, 3000); // Wait for animation to complete (2800ms + buffer)
          
          console.log('[Coins] 💰 Entry fee of 500 coins deducted and profile refresh scheduled');
        }
      } catch (err) {
        console.error('[Coins] Error charging entry fee:', err);
      }
    };

    chargeEntryFee();
  }, [isMatched, matchedRoomId, user?.uid, db, refreshUserProfile]);

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
  // BUT don't use entry-fee coins if there's no payout (loser case - entry fee already animated)
  useEffect(() => {
    if (userProfile && displayedCoins === null) {
      // Check for stored old balances first (prevents showing new balance then flashing to old)
      const payoutCoinsStr = sessionStorage.getItem('coins-before-payout');
      const payoutCoins = payoutCoinsStr ? parseInt(payoutCoinsStr, 10) : null;
      
      const navCoinsStr = sessionStorage.getItem('coins-before-navigation');
      const navCoins = navCoinsStr ? parseInt(navCoinsStr, 10) : null;
      
      const entryFeeCoinsStr = sessionStorage.getItem('coins-before-entry-fee');
      const entryFeeCoins = entryFeeCoinsStr ? parseInt(entryFeeCoinsStr, 10) : null;
      
      // For losers: If there's a payout stored, use it. Otherwise, don't use entry-fee coins
      // (entry fee was already animated, so use current balance to avoid duplicate animation)
      // For winners: Use payout coins (they need to animate from payout to final)
      let initialCoins = userProfile.coins; // Default to current
      
      if (payoutCoins !== null) {
        // Winner case - use payout coins for animation
        initialCoins = payoutCoins;
      } else if (navCoins !== null) {
        // Fallback - use navigation coins
        initialCoins = navCoins;
      }
      // Don't use entryFeeCoins - it would cause duplicate animation for losers
      
      setDisplayedCoins(initialCoins);
      prevCoinsRef.current = initialCoins;
      console.log('[Coins] Initialized displayed coins:', initialCoins, '(from stored:', payoutCoins !== null || navCoins !== null, ')');
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
      <AnimatePresence mode="wait">
        {(showMatchmakingModal || isMatched || matchedRoomId) && (
          <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              key={isMatched || matchedRoomId ? 'matched' : 'searching'}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3 }}
              className="bg-gray-900/95 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-gray-700/50 max-w-md w-full mx-4"
            >
              {(isMatched || matchedRoomId) ? (
                // Opponent Found Screen - show this for the full delay before navigation
                <div className="text-center">
                  <div className="text-6xl mb-4">🎉</div>
                  <h2 className="text-3xl font-bold text-white mb-2">Opponent Found!</h2>
                  <p className="text-green-400 text-lg font-semibold mb-2">Starting match...</p>
                  {/* Entry Fee Notification */}
                  {userProfile && userProfile.coins >= 500 && (
                    <div className="bg-yellow-600/20 border border-yellow-500/30 rounded-lg p-3 mb-4">
                      <p className="text-yellow-300 text-sm font-semibold flex items-center justify-center gap-2">
                        <span>💳</span>
                        <span>Entry fee: -500 coins</span>
                      </p>
                    </div>
                  )}
                  {userProfile && userProfile.coins < 500 && (
                    <div className="bg-red-600/20 border border-red-500/30 rounded-lg p-3 mb-4">
                      <p className="text-red-300 text-sm font-semibold">
                        ⚠️ Insufficient coins! You need 500 coins to play.
                      </p>
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-2 mb-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-green-400"></div>
                  </div>
                </div>
              ) : (
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

                      {/* Opponent Placeholder */}
                      <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center text-gray-500 text-2xl mb-2 shadow-lg animate-pulse">
                          ?
                        </div>
                        <p className="text-gray-400 text-sm font-semibold">Searching...</p>
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

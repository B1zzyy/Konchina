'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { RoundScoreResult } from '@/lib/types';
import { useGameStore } from '@/store/gameStore';

interface RoundScorePopupProps {
  roundScore: RoundScoreResult;
  onClose: () => void;
}

export default function RoundScorePopup({
  roundScore,
  onClose,
}: RoundScorePopupProps) {
  const { currentPlayerId, gameState } = useGameStore();
  const [countdown, setCountdown] = useState(7);

  // Auto-close after 7 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 7000);

    return () => clearTimeout(timer);
  }, [onClose]);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const isPlayer1 = currentPlayerId === roundScore.player1Id;
  const myRoundScore = isPlayer1 ? roundScore.player1Points : roundScore.player2Points;
  const myDetails = isPlayer1
    ? roundScore.player1Details
    : roundScore.player2Details;
  const opponentRoundScore = isPlayer1
    ? roundScore.player2Points
    : roundScore.player1Points;
  const opponentDetails = isPlayer1
    ? roundScore.player2Details
    : roundScore.player1Details;

  // Get total scores from game state
  const myPlayerId = isPlayer1 ? roundScore.player1Id : roundScore.player2Id;
  const opponentPlayerId = isPlayer1 ? roundScore.player2Id : roundScore.player1Id;
  const myTotalScore = gameState?.players?.[myPlayerId]?.score || 0;
  const opponentTotalScore = gameState?.players?.[opponentPlayerId]?.score || 0;

  // Calculate progress percentages (toward 16 points = 50% of bar)
  // Each player's bar fills from their side toward center
  const myProgress = Math.min((myTotalScore / 16) * 50, 50); // 0-50% from left
  const opponentProgress = Math.min((opponentTotalScore / 16) * 50, 50); // 0-50% from right

  const getBonusItems = (details: typeof myDetails) => {
    const items = [];
    if (details.mostClubs) items.push({ icon: '♣', label: 'Most Clubs', points: 1, isSvg: false });
    if (details.moreCards) items.push({ icon: 'moreCards', label: 'More Cards', points: 2, isSvg: true });
    if (details.hasTenDiamonds) items.push({ icon: '♦', label: 'The Good 10', points: 1, isSvg: false });
    if (details.hasTwoClubs) items.push({ icon: '♣', label: 'The Good 2', points: 1, isSvg: false });
    return items;
  };

  const MoreCardsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" className="text-gray-300">
      <path d="M3 11C3 8.17157 3 6.75736 3.87868 5.87868C4.75736 5 6.17157 5 9 5H11C13.8284 5 15.2426 5 16.1213 5.87868C17 6.75736 17 8.17157 17 11V16C17 18.8284 17 20.2426 16.1213 21.1213C15.2426 22 13.8284 22 11 22H9C6.17157 22 4.75736 22 3.87868 21.1213C3 20.2426 3 18.8284 3 16V11Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16.9244 19C18.0202 18.3874 18.3929 17.0406 19.1383 14.3469L20.1925 10.5375C20.938 7.84378 21.3107 6.49694 20.678 5.4359C20.0453 4.37485 18.6543 4.01397 15.8724 3.2922L13.9052 2.78183C11.1232 2.06006 9.73225 1.69918 8.63642 2.31177C7.85623 2.74792 7.44258 3.55626 7 4.95786" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.76123 11.2762C8.56573 10.8192 9.26789 11.0034 9.68969 11.2967C9.86265 11.4169 9.94912 11.4771 10 11.4771C10.0509 11.4771 10.1374 11.4169 10.3103 11.2967C10.7321 11.0034 11.4343 10.8192 12.2388 11.2762C13.2946 11.8758 13.5335 13.8541 11.0981 15.5232C10.6343 15.8411 10.4024 16 10 16C9.59764 16 9.36572 15.8411 8.90186 15.5232C6.46652 13.8541 6.70542 11.8758 7.76123 11.2762Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="bg-gray-900/95 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-gray-700/50 max-w-md w-full mx-4 relative"
        >
          {/* Countdown Timer - Top Right */}
          <div className="absolute top-4 right-4 text-gray-500/70 text-xs font-medium">
            {countdown}
          </div>

          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">🎴</div>
            <h2 className="text-2xl font-semibold text-white">Round Complete</h2>
            <p className="text-sm text-gray-400 mt-1">Score summary</p>
          </div>

          {/* Total Score Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-300">You</span>
                <span className="text-lg font-bold text-yellow-400">{myTotalScore}</span>
              </div>
              <div className="text-xs text-gray-400 font-medium">16</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white">{opponentTotalScore}</span>
                <span className="text-xs font-medium text-gray-300">Opponent</span>
              </div>
            </div>
            <div className="relative h-3 bg-gray-700/50 rounded-full overflow-hidden">
              {/* Your progress bar (fills from left) */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${myProgress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full"
                style={{ maxWidth: '50%' }}
              />
              {/* Opponent progress bar (fills from right) */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${opponentProgress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute right-0 top-0 h-full bg-gradient-to-l from-blue-500 to-blue-400 rounded-full"
                style={{ maxWidth: '50%' }}
              />
              {/* Center divider at 16 points */}
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/30" style={{ transform: 'translateX(-50%)' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Your Score - Highlighted */}
            <div className="relative bg-gray-800/70 rounded-xl p-5 border-2 border-yellow-500/50 shadow-lg">
              <div className="flex flex-col items-center mb-3">
                <span className="text-xs font-medium text-gray-300 uppercase tracking-wide mb-2">Round Points</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold text-yellow-400">+{myRoundScore}</span>
                  <span className="text-lg text-yellow-300/70">pts</span>
                </div>
              </div>
              
              {myRoundScore > 0 ? (
                <div className="space-y-1.5">
                   {getBonusItems(myDetails).map((item, idx) => (
                     <div key={idx} className="flex items-center justify-between text-xs bg-gray-700/50 rounded-lg px-2.5 py-1.5">
                       <div className="flex items-center gap-1.5 text-gray-200">
                         {item.icon && (
                           item.isSvg && item.icon === 'moreCards' ? (
                             <MoreCardsIcon />
                           ) : (
                             <span className="text-sm">{item.icon}</span>
                           )
                         )}
                         <span>{item.label}</span>
                       </div>
                       <span className="text-yellow-400 font-semibold text-xs">+{item.points}</span>
                     </div>
                   ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 text-xs py-2">No points earned</div>
              )}
            </div>

            {/* Opponent Score */}
            <div className="relative bg-gray-800/70 rounded-xl p-5 border border-gray-700/50">
              <div className="flex flex-col items-center mb-3">
                <span className="text-xs font-medium text-gray-300 uppercase tracking-wide mb-2">Round Points</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-bold text-white">+{opponentRoundScore}</span>
                  <span className="text-lg text-gray-400">pts</span>
                </div>
              </div>
              
              {opponentRoundScore > 0 ? (
                <div className="space-y-1.5">
                   {getBonusItems(opponentDetails).map((item, idx) => (
                     <div key={idx} className="flex items-center justify-between text-xs bg-gray-700/50 rounded-lg px-2.5 py-1.5">
                       <div className="flex items-center gap-1.5 text-gray-300">
                         {item.icon && (
                           item.isSvg && item.icon === 'moreCards' ? (
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" className="text-gray-300">
                               <path d="M3 11C3 8.17157 3 6.75736 3.87868 5.87868C4.75736 5 6.17157 5 9 5H11C13.8284 5 15.2426 5 16.1213 5.87868C17 6.75736 17 8.17157 17 11V16C17 18.8284 17 20.2426 16.1213 21.1213C15.2426 22 13.8284 22 11 22H9C6.17157 22 4.75736 22 3.87868 21.1213C3 20.2426 3 18.8284 3 16V11Z" stroke="currentColor" strokeWidth="1.5" />
                               <path d="M16.9244 19C18.0202 18.3874 18.3929 17.0406 19.1383 14.3469L20.1925 10.5375C20.938 7.84378 21.3107 6.49694 20.678 5.4359C20.0453 4.37485 18.6543 4.01397 15.8724 3.2922L13.9052 2.78183C11.1232 2.06006 9.73225 1.69918 8.63642 2.31177C7.85623 2.74792 7.44258 3.55626 7 4.95786" stroke="currentColor" strokeWidth="1.5" />
                               <path d="M7.76123 11.2762C8.56573 10.8192 9.26789 11.0034 9.68969 11.2967C9.86265 11.4169 9.94912 11.4771 10 11.4771C10.0509 11.4771 10.1374 11.4169 10.3103 11.2967C10.7321 11.0034 11.4343 10.8192 12.2388 11.2762C13.2946 11.8758 13.5335 13.8541 11.0981 15.5232C10.6343 15.8411 10.4024 16 10 16C9.59764 16 9.36572 15.8411 8.90186 15.5232C6.46652 13.8541 6.70542 11.8758 7.76123 11.2762Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                             </svg>
                           ) : (
                             <span className="text-sm">{item.icon}</span>
                           )
                         )}
                         <span>{item.label}</span>
                       </div>
                       <span className="text-gray-400 font-semibold text-xs">+{item.points}</span>
                     </div>
                   ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 text-xs py-2">No points earned</div>
              )}
            </div>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}


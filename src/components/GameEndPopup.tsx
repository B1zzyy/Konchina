'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useRouter } from 'next/navigation';

interface GameEndPopupProps {
  onClose: () => void;
}

export default function GameEndPopup({ onClose }: GameEndPopupProps) {
  const { gameState, currentPlayerId } = useGameStore();
  const router = useRouter();

  if (!gameState || !currentPlayerId) return null;

  const allPlayerIds = Object.keys(gameState.players);
  const myPlayer = gameState.players[currentPlayerId];
  const opponentId = allPlayerIds.find((id) => id !== currentPlayerId);
  const opponentPlayer = opponentId ? gameState.players[opponentId] : null;

  if (!myPlayer || !opponentPlayer) return null;

  // Check if game ended due to forfeit
  const wasForfeit = !!gameState.forfeitedBy;
  const iForfeited = gameState.forfeitedBy === currentPlayerId;
  const opponentForfeited = gameState.forfeitedBy === opponentId;

  const myScore = myPlayer.score;
  const opponentScore = opponentPlayer.score;
  // Game ends when someone reaches 16+. Winner is the player with higher score
  // If both reach 16+ in same round, player with higher score wins
  const iWon = wasForfeit ? opponentForfeited : (myScore >= 16 && myScore >= opponentScore);

  const handleGoHome = () => {
    // Reset game state before navigating to prevent redirect loops
    const { resetGame } = useGameStore.getState();
    resetGame();
    
    // Use replace to prevent back button from going back to finished game
    // The home page will refresh the profile and detect coin changes for animation
    router.replace('/');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3 }}
          className="bg-gray-900/95 backdrop-blur-md rounded-3xl p-10 shadow-2xl border border-gray-700/50 max-w-md w-full mx-4"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">
              {iWon ? '🏆' : iForfeited ? '😔' : '🎉'}
            </div>
            <h2 className="text-3xl font-bold mb-2">
              <span className={iWon ? 'text-yellow-400' : iForfeited ? 'text-red-400' : 'text-green-400'}>
                {iForfeited ? 'You Forfeited' : opponentForfeited ? 'Your Opponent Forfeited!' : iWon ? 'You Won!' : 'You Lost'}
              </span>
            </h2>
            <p className="text-sm text-gray-400">
              {wasForfeit ? (iForfeited ? 'You left the game' : 'Your opponent left the game') : 'Game Complete'}
            </p>
          </div>

          {/* Final Scores - Only show if not a forfeit */}
          {!wasForfeit && (
            <div className="bg-gray-800/70 rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col items-center">
                  <span className="text-xs font-medium text-gray-300 uppercase tracking-wide mb-1">You</span>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-4xl font-bold ${iWon ? 'text-yellow-400' : 'text-gray-400'}`}>
                      {myScore}
                    </span>
                    <span className="text-lg text-gray-400">pts</span>
                  </div>
                </div>
                <div className="text-gray-500 text-lg font-medium">vs</div>
                <div className="flex flex-col items-center">
                  <span className="text-xs font-medium text-gray-300 uppercase tracking-wide mb-1">Opponent</span>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-4xl font-bold ${!iWon ? 'text-blue-400' : 'text-gray-400'}`}>
                      {opponentScore}
                    </span>
                    <span className="text-lg text-gray-400">pts</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Forfeit Message */}
          {wasForfeit && opponentForfeited && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 mb-6">
              <p className="text-green-200 text-center text-lg font-semibold">
                🎉 Your opponent forfeited. You win by default!
              </p>
            </div>
          )}
          
          {wasForfeit && iForfeited && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 mb-6">
              <p className="text-red-200 text-center text-lg font-semibold">
                You chose to forfeit the game.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleGoHome}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-xl transition-colors duration-200"
            >
              Return to Lobby
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}


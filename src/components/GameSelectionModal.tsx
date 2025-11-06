'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import Image from 'next/image';
import CoinIcon from './CoinIcon';

interface GameOption {
  id: string;
  entryFee: number;
  reward: number;
  label?: string;
}

interface GameSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGame: (entryFee: number, reward: number, winCondition: number) => void;
  userCoins: number;
}

const GAME_OPTIONS: GameOption[] = [
  {
    id: 'base',
    entryFee: 500,
    reward: 1000,
    label: 'Base Game',
  },
  {
    id: 'medium',
    entryFee: 9000,
    reward: 14000,
    label: 'Medium Stakes',
  },
  {
    id: 'high',
    entryFee: 25000,
    reward: 39000,
    label: 'High Stakes',
  },
];

// Color themes for each game option
const getCardTheme = (optionId: string) => {
  switch (optionId) {
    case 'base':
      return {
        bg: 'from-gray-800 via-gray-800 to-gray-900',
        border: 'border-gray-700/50',
        borderHover: 'hover:border-yellow-500/50',
      };
    case 'medium':
      return {
        bg: 'from-blue-900 via-blue-800 to-blue-900',
        border: 'border-blue-600/50',
        borderHover: 'hover:border-blue-400/70',
      };
    case 'high':
      return {
        bg: 'from-yellow-900 via-yellow-800 to-yellow-900',
        border: 'border-yellow-600/50',
        borderHover: 'hover:border-yellow-400/70',
      };
    default:
      return {
        bg: 'from-gray-800 via-gray-800 to-gray-900',
        border: 'border-gray-700/50',
        borderHover: 'hover:border-yellow-500/50',
      };
  }
};

export default function GameSelectionModal({
  isOpen,
  onClose,
  onSelectGame,
  userCoins,
}: GameSelectionModalProps) {
  const [winCondition, setWinCondition] = useState<16 | 21>(16);
  const canAfford = (entryFee: number) => userCoins >= entryFee;

  const handleSelect = (option: GameOption) => {
    if (canAfford(option.entryFee)) {
      onSelectGame(option.entryFee, option.reward, winCondition);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3 }}
          className="bg-gray-900/95 backdrop-blur-md rounded-3xl p-6 md:p-8 shadow-2xl border border-gray-700/50 max-w-5xl w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Select Game Mode</h2>
              <p className="text-gray-400 text-sm">Choose your entry fee and potential reward</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Win Condition Toggle */}
          <div className="mb-6 flex items-center justify-center">
            <div className="bg-gray-800/50 rounded-xl p-1 flex gap-1 border border-gray-700/50">
              <button
                onClick={() => setWinCondition(16)}
                className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                  winCondition === 16
                    ? 'bg-yellow-500 text-black shadow-lg'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                First to 16
              </button>
              <button
                onClick={() => setWinCondition(21)}
                className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                  winCondition === 21
                    ? 'bg-yellow-500 text-black shadow-lg'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                First to 21
              </button>
            </div>
          </div>

          {/* Cards Container */}
          <div className="relative">

            {/* Cards Grid - Show all cards at once */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-8">
              {GAME_OPTIONS.map((option) => {
                const affordable = canAfford(option.entryFee);
                const theme = getCardTheme(option.id);
                
                return (
                  <motion.div
                    key={option.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ 
                      opacity: 1,
                      scale: 1,
                    }}
                    transition={{ duration: 0.3 }}
                    className={`relative bg-gradient-to-br ${theme.bg} rounded-2xl p-6 border-2 transition-all ${
                      affordable 
                        ? `${theme.border} ${theme.borderHover} cursor-pointer` 
                        : `${theme.border} opacity-60`
                    }`}
                    onClick={() => affordable && handleSelect(option)}
                  >
                    {/* Decorative background pattern */}
                    <div className="absolute inset-0 opacity-5 rounded-2xl overflow-hidden">
                      <div className="absolute top-4 right-4 w-12 h-12">
                        <Image 
                          src="/logo.png" 
                          alt="" 
                          width={48} 
                          height={48} 
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>

                    <div className="relative z-10">
                      {/* Label */}
                      {option.label && (
                        <div className="text-center mb-4">
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            {option.label}
                          </span>
                        </div>
                      )}

                      {/* Reward - Most Prominent */}
                      <div className="flex flex-col items-center gap-3 mb-6">
                        <div className="text-gray-300 text-xs font-medium uppercase tracking-wider">Potential Reward</div>
                        <div className="flex items-baseline gap-2">
                          <CoinIcon className="text-yellow-400" size={28} />
                          <span className="text-yellow-400 font-bold text-3xl md:text-4xl">
                            {option.reward.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Entry Fee */}
                      <div className="flex flex-col items-center gap-2 mb-6">
                        <div className="text-gray-400 text-xs font-medium uppercase tracking-wider">Entry Fee</div>
                        <div className="flex items-baseline gap-2">
                          <CoinIcon className="text-red-400" size={20} />
                          <span className="text-red-400 font-bold text-xl md:text-2xl">
                            {option.entryFee.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Select Button */}
                      <motion.button
                        whileHover={affordable ? { scale: 1.02 } : {}}
                        whileTap={affordable ? { scale: 0.98 } : {}}
                        disabled={!affordable}
                        className={`w-full font-bold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg flex items-center justify-center gap-2 ${
                          affordable
                            ? 'bg-gradient-to-b from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white'
                            : 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-gray-600/50'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (affordable) handleSelect(option);
                        }}
                      >
                        {affordable ? (
                          <>
                            <span>Select</span>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                            <span>Insufficient Coins</span>
                          </>
                        )}
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}


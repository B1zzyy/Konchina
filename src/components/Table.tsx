'use client';

import { motion } from 'framer-motion';
import Card from './Card';
import { Card as CardType } from '@/lib/types';

interface TableProps {
  cards: CardType[];
  onCardClick?: (card: CardType) => void;
  selectedCards: CardType[];
  canSelectMultiple?: boolean;
  animatingCardIds?: Set<string>;
}

export default function Table({
  cards,
  onCardClick,
  selectedCards,
  canSelectMultiple = false,
  animatingCardIds = new Set(),
}: TableProps) {
  // Debug: Log what cards we're displaying (removed to avoid render issues)

  const isSelected = (card: CardType) => {
    return selectedCards.some(
      (c) => c.suit === card.suit && c.value === card.value
    );
  };

  const isAnimating = (card: CardType) => {
    const cardId = `${card.suit}-${card.value}`;
    return animatingCardIds.has(cardId);
  };

  // Create placeholder slots for empty table (always show 4 slots)
  const emptySlots = cards.length === 0 ? 4 : 0;
  const displayCards = cards.length > 0 ? cards : [];

  return (
    <div className="min-h-64 bg-green-800 rounded-3xl p-8 shadow-2xl border-8 border-green-900 relative overflow-hidden">
      {/* Semi-transparent card pattern background when empty */}
      {cards.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center opacity-40 pointer-events-none z-0">
          {/* Same SVG icon as used in round score popup for "More Cards" */}
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24" 
            width="120" 
            height="120" 
            fill="none" 
            className="text-green-900"
          >
            <path 
              d="M3 11C3 8.17157 3 6.75736 3.87868 5.87868C4.75736 5 6.17157 5 9 5H11C13.8284 5 15.2426 5 16.1213 5.87868C17 6.75736 17 8.17157 17 11V16C17 18.8284 17 20.2426 16.1213 21.1213C15.2426 22 13.8284 22 11 22H9C6.17157 22 4.75736 22 3.87868 21.1213C3 20.2426 3 18.8284 3 16V11Z" 
              stroke="currentColor" 
              strokeWidth="1.5" 
            />
            <path 
              d="M16.9244 19C18.0202 18.3874 18.3929 17.0406 19.1383 14.3469L20.1925 10.5375C20.938 7.84378 21.3107 6.49694 20.678 5.4359C20.0453 4.37485 18.6543 4.01397 15.8724 3.2922L13.9052 2.78183C11.1232 2.06006 9.73225 1.69918 8.63642 2.31177C7.85623 2.74792 7.44258 3.55626 7 4.95786" 
              stroke="currentColor" 
              strokeWidth="1.5" 
            />
            <path 
              d="M7.76123 11.2762C8.56573 10.8192 9.26789 11.0034 9.68969 11.2967C9.86265 11.4169 9.94912 11.4771 10 11.4771C10.0509 11.4771 10.1374 11.4169 10.3103 11.2967C10.7321 11.0034 11.4343 10.8192 12.2388 11.2762C13.2946 11.8758 13.5335 13.8541 11.0981 15.5232C10.6343 15.8411 10.4024 16 10 16C9.59764 16 9.36572 15.8411 8.90186 15.5232C6.46652 13.8541 6.70542 11.8758 7.76123 11.2762Z" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
            />
          </svg>
        </div>
      )}
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 justify-items-center relative z-10">
        {displayCards.map((card, index) => {
          const animating = isAnimating(card);
          return (
            <motion.div
              key={`table-${card.suit}-${card.value}-${index}`}
              initial={{ opacity: 1, scale: 1, rotate: 0 }}
              animate={{ 
                opacity: animating ? 0 : 1, 
                scale: animating ? 0 : 1, 
                rotate: 0 
              }}
              transition={{ duration: 0.2 }}
              style={{ visibility: animating ? 'hidden' : 'visible' }}
            >
              <Card
                card={card}
                isSelected={isSelected(card)}
                onClick={() => onCardClick?.(card)}
                size="md"
              />
            </motion.div>
          );
        })}
        {/* Placeholder divs to maintain grid size when empty */}
        {emptySlots > 0 && Array.from({ length: emptySlots }).map((_, i) => (
          <div key={`placeholder-${i}`} className="w-24 h-36" aria-hidden="true" />
        ))}
      </div>
    </div>
  );
}

'use client';

import { motion } from 'framer-motion';
import Card from './Card';
import { Card as CardType } from '@/lib/types';

interface HandProps {
  cards: CardType[];
  isPlayer?: boolean;
  onCardClick?: (card: CardType) => void;
  selectedCard: CardType | null;
  isTurn?: boolean;
}

export default function Hand({
  cards,
  isPlayer = true,
  onCardClick,
  selectedCard,
  isTurn = false,
}: HandProps) {
  return (
    <div 
      className="flex flex-col items-center gap-2"
      style={{
        opacity: isTurn ? 1 : 0.4, // Dim when not player's turn
        transition: 'opacity 0.3s ease-in-out',
      }}
    >
      <div className="flex justify-center items-center relative" style={{ minHeight: '200px', width: '100%' }}>
        {cards.map((card, index) => {
          // Calculate fan positioning
          const totalCards = cards.length;
          const maxRotation = 20; // Maximum rotation angle in degrees
          // Card spacing: slightly less than card width for nice overlap (lg cards are ~128px, sm are ~64px)
          // Increased slightly to improve clickability
          const cardSpacing = isPlayer ? 52 : 30; // Horizontal spacing between card centers
          const baseRotation = (index - (totalCards - 1) / 2) * (maxRotation / Math.max(1, totalCards - 1));
          const offsetX = (index - (totalCards - 1) / 2) * cardSpacing;
          
          // Compensate Y position so all cards sit at same bottom level despite rotation
          // With transformOrigin 'center bottom', rotated cards have their centers at different heights
          // Card height: lg = 192px (h-48), sm = 96px (h-24)
          const cardHeight = isPlayer ? 192 : 96;
          const rotationRad = Math.abs((baseRotation * Math.PI) / 180);
          // Calculate how much the center moves due to rotation, then compensate
          // The further from center, the more we need to adjust downward
          // Add a small extra adjustment to bring outer cards down a bit more
          const verticalCompensation = cardHeight * 0.5 * (1 - Math.cos(rotationRad));
          const offsetY = verticalCompensation + (Math.abs(baseRotation) * 0.8); // Extra downward adjustment for outer cards
          
          const zIndex = index; // Cards in front have higher z-index
          
          return (
            <motion.div
              key={`${card.suit}-${card.value}-${index}`}
              className="absolute"
              style={{
                transformOrigin: 'center bottom',
                zIndex: zIndex,
              }}
              initial={{ opacity: 0, rotateZ: 0, y: 20 }}
              animate={{ 
                opacity: 1, 
                rotateZ: baseRotation,
                x: offsetX,
                y: offsetY,
              }}
              transition={{ delay: index * 0.1, duration: 0.5, type: 'spring', stiffness: 100 }}
            >
              <div 
                onClick={(e: any) => e.stopPropagation()}
                style={{ 
                  padding: '8px', // Expand click area
                  margin: '-8px', // Compensate padding so card doesn't move
                  cursor: isPlayer && isTurn && onCardClick ? 'pointer' : 'default',
                  pointerEvents: 'auto',
                }}
              >
                <Card
                  card={card}
                  isFaceUp={isPlayer}
                  isSelected={selectedCard?.suit === card.suit && selectedCard?.value === card.value}
                  onClick={() => {
                    console.log('[Hand] Card clicked:', `${card.value}${card.suit}`, {
                      hasHandler: !!onCardClick,
                      isPlayer,
                      isTurn
                    });
                    if (onCardClick) {
                      onCardClick(card);
                    }
                  }}
                  size={isPlayer ? 'lg' : 'sm'}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
      {!isPlayer && (
        <div className="text-gray-400 text-sm">
          {cards.length} {cards.length === 1 ? 'card' : 'cards'}
        </div>
      )}
    </div>
  );
}

'use client';

import { motion } from 'framer-motion';
import { Card as CardType } from '@/lib/types';
import Card from './Card';
import { useEffect, useState } from 'react';

interface CaptureAnimationProps {
  playedCard: CardType;
  capturedCards: CardType[];
  tableCards: CardType[]; // Full table cards array to calculate positions
  isCurrentPlayer: boolean;
  onComplete?: () => void;
}

export default function CaptureAnimation({
  playedCard,
  capturedCards,
  tableCards,
  isCurrentPlayer,
  onComplete,
}: CaptureAnimationProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });

  useEffect(() => {
    // Get viewport dimensions
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    // Auto-complete after animation duration
    const timer = setTimeout(() => {
      setIsVisible(false);
      if (onComplete) {
        onComplete();
      }
    }, 2500); // Increased for exit animation

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateDimensions);
    };
  }, [onComplete]);

  if (!isVisible) return null;

  // Calculate animation paths
  // Played card: stays at hand location, just flips
  // Captured cards: from table to hand, then all exit screen together
  const playerHandY = isCurrentPlayer ? dimensions.height * 0.85 : dimensions.height * 0.15;
  const playerHandX = dimensions.width * 0.5;
  const tableCenterY = dimensions.height * 0.5;
  const tableContainerX = dimensions.width * 0.5; // Table container center
  
  // Exit direction: towards the side where the hand is
  // For current player (bottom): exit down-right or down-left
  // For opponent (top): exit up-right or up-left
  const exitX = isCurrentPlayer ? dimensions.width + 200 : -200;
  const exitY = isCurrentPlayer ? dimensions.height + 200 : -200;

  // Helper function to calculate actual table card position based on grid layout
  const getTableCardPosition = (card: CardType): { x: number; y: number } => {
    // Find the index of this card in the tableCards array
    const cardIndex = tableCards.findIndex(
      (c) => c.suit === card.suit && c.value === card.value
    );
    
    if (cardIndex === -1) {
      // Fallback to center if not found
      return { x: tableContainerX, y: tableCenterY };
    }

    // Grid layout: grid-cols-2 sm:grid-cols-3 md:grid-cols-4
    // Calculate which breakpoint we're at
    let colsPerRow = 2; // Default mobile
    if (dimensions.width >= 768) colsPerRow = 3; // md breakpoint
    if (dimensions.width >= 1024) colsPerRow = 4; // lg breakpoint

    // Card dimensions (md size)
    const cardWidth = 96; // w-24 = 96px
    const cardHeight = 144; // h-36 = 144px
    const gap = 16; // gap-4 = 16px
    const padding = 32; // p-8 = 32px

    // Calculate row and column
    const row = Math.floor(cardIndex / colsPerRow);
    const col = cardIndex % colsPerRow;

    // Calculate total width of grid
    const totalGridWidth = colsPerRow * cardWidth + (colsPerRow - 1) * gap;

    // Calculate position within grid
    const gridStartX = tableContainerX - totalGridWidth / 2;
    const cardX = gridStartX + col * (cardWidth + gap) + cardWidth / 2;
    const cardY = tableCenterY - (tableCards.length / colsPerRow / 2) * (cardHeight + gap) + row * (cardHeight + gap) + cardHeight / 2;

    return { x: cardX, y: cardY };
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {/* Played Card Animation - scales at hand location, then exits */}
      <motion.div
        key={`played-${playedCard.suit}-${playedCard.value}`}
        className="absolute"
        initial={{
          x: playerHandX - 120,
          y: playerHandY - 144,
          scale: 1,
          opacity: 1,
        }}
        animate={{
          // Phase 1: Slight scale up at hand location
          scale: [1, 1.1, 1.1, 1],
          opacity: [1, 1, 1, 1],
          // Phase 2: Exit with captured cards
          x: [playerHandX - 120, playerHandX - 120, exitX - 120],
          y: [playerHandY - 144, playerHandY - 144, exitY - 144],
        }}
        transition={{
          duration: 2.3,
          times: [0, 0.4, 0.5, 1], // 40% scale, 10% pause, 50% exit
          ease: [0.4, 0, 0.2, 1],
        }}
      >
        <Card card={playedCard} isFaceUp={true} size="lg" />
      </motion.div>

      {/* Captured Cards Animation - pull from table to hand, then exit together */}
      {capturedCards.map((card, index) => {
        // Stagger the captured cards slightly
        const delay = index * 0.06;
        
        // Get the actual position of this card on the table
        const tablePosition = getTableCardPosition(card);
        const startX = tablePosition.x;
        const startY = tablePosition.y;

        return (
          <motion.div
            key={`captured-${card.suit}-${card.value}-${index}`}
            className="absolute"
            initial={{
              x: startX - 96, // Center the card on its position (card width / 2)
              y: startY - 72, // Center the card on its position (card height / 2)
              scale: 1,
              opacity: 1,
              rotate: 0,
            }}
            animate={{
              // Phase 1: Pull to hand location (gather around the scaling card)
              x: [
                startX - 96,
                playerHandX - 96 + (index - capturedCards.length / 2) * 35,
                exitX - 96,
              ],
              y: [
                startY - 72,
                playerHandY - 72,
                exitY - 72,
              ],
              scale: [1, 1.1, 0.6, 0.4],
              opacity: [1, 1, 1, 0],
            }}
            transition={{
              duration: 2.3,
              delay: delay + 0.15, // Start slightly after flip begins
              times: [0, 0.5, 0.6, 1], // 50% pulling, 10% pause, 40% exit
              ease: [0.4, 0, 0.2, 1],
            }}
          >
            <Card card={card} isFaceUp={true} size="md" />
          </motion.div>
        );
      })}
    </div>
  );
}

'use client';

import { motion } from 'framer-motion';
import { Card as CardType } from '@/lib/types';
import { getCardImagePath } from '@/lib/gameLogic';
import Image from 'next/image';
import { useState } from 'react';

interface CardProps {
  card: CardType;
  isFaceUp?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  animateTo?: { x: number; y: number };
  onAnimationComplete?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function Card({
  card,
  isFaceUp = true,
  isSelected = false,
  onClick,
  className = '',
  animateTo,
  onAnimationComplete,
  size = 'md',
}: CardProps) {
  const [imageError, setImageError] = useState(false);

  const sizeClasses = {
    sm: 'w-16 h-24',    // Opponent cards (was w-12 h-16) - ~64px x 96px
    md: 'w-24 h-36',    // Table cards (was w-16 h-24) - ~96px x 144px
    lg: 'w-32 h-48',    // Player hand (was w-20 h-28) - ~128px x 192px
    xl: 'w-40 h-56',    // Extra large option - ~160px x 224px
  };

  const baseClasses = `
    ${sizeClasses[size]}
    ${onClick ? 'cursor-pointer' : ''}
    ${isSelected ? 'ring-4 ring-yellow-400 ring-offset-2' : ''}
    rounded-lg
    shadow-lg
    transition-transform
    hover:scale-105
    ${isSelected ? 'scale-110 z-50' : ''}
    ${className}
  `;

  if (animateTo) {
    return (
      <motion.div
        className={baseClasses}
        initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
        animate={{
          x: animateTo.x,
          y: animateTo.y,
          scale: 0.3,
          opacity: 0,
        }}
        transition={{
          duration: 0.8,
          ease: 'easeInOut',
        }}
        onAnimationComplete={onAnimationComplete}
      >
        {isFaceUp ? (
          <CardFace card={card} imageError={imageError} setImageError={setImageError} />
        ) : (
          <CardBack />
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={baseClasses}
      whileHover={onClick ? { scale: 1.02 } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      onClick={onClick}
      style={{ pointerEvents: 'auto' }}
    >
      {isFaceUp ? (
        <CardFace card={card} imageError={imageError} setImageError={setImageError} />
      ) : (
        <CardBack />
      )}
    </motion.div>
  );
}

function CardFace({ card, imageError, setImageError }: { card: CardType; imageError: boolean; setImageError: (err: boolean) => void }) {
  const imagePath = getCardImagePath(card);

  return (
    <div className="w-full h-full bg-white rounded-lg p-1 flex flex-col justify-between items-center border-2 border-gray-300 relative overflow-hidden">
      {!imageError ? (
        <Image
          src={imagePath}
          alt={`${card.value} of ${card.suit}`}
          width={200}
          height={300}
          className="w-full h-full object-contain"
          onError={() => setImageError(true)}
        />
      ) : (
        <CardFallback card={card} />
      )}
    </div>
  );
}

function CardFallback({ card }: { card: CardType }) {
  return (
    <>
      <div className={`text-4xl font-bold ${card.color === 'red' ? 'text-red-600' : 'text-black'}`}>
        {card.value}
      </div>
      <div className={`text-5xl ${card.color === 'red' ? 'text-red-600' : 'text-black'}`}>
        {card.suit}
      </div>
      <div className={`text-4xl font-bold rotate-180 ${card.color === 'red' ? 'text-red-600' : 'text-black'}`}>
        {card.value}
      </div>
    </>
  );
}

function CardBack() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-blue-900 to-blue-700 rounded-lg border-2 border-blue-800 flex items-center justify-center">
      <div className="text-white text-2xl font-bold opacity-50">K</div>
    </div>
  );
}

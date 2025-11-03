import { Card, Value } from './types';

// Card values mapping
const CARD_VALUES: Record<Value, number> = {
  'A': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
};

// Get numeric value for calculations (A=1, J/Q/K can't be used in sums, return 0)
export function getCardNumericValue(value: Value): number {
  if (value === 'A') return 1;
  if (['J', 'Q', 'K'].includes(value)) return 0; // Face cards can't be used in sums
  return parseInt(value);
}

// Create a standard 52-card deck
export function createDeck(): Card[] {
  const suits: Array<'♠' | '♥' | '♦' | '♣'> = ['♠', '♥', '♦', '♣'];
  const values: Value[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const value of values) {
      deck.push({
        suit,
        value,
        color: (suit === '♥' || suit === '♦') ? 'red' : 'black',
        numericValue: getCardNumericValue(value),
      });
    }
  }

  return shuffleDeck(deck);
}

// Shuffle deck using Fisher-Yates algorithm
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Find all possible capture combinations for a played card
export function getCapturableCombinations(playedCard: Card, tableCards: Card[]): Card[][] {
  const combinations: Card[][] = [];
  
  // Jack captures all cards
  if (playedCard.value === 'J') {
    return [tableCards];
  }

  // Single match: find ALL cards with matching value (one combination per match)
  // This works for ALL cards including face cards (K, Q, J, A) and number cards
  // Example: If table has K♠, K♥, K♦ and you play K♣, you can choose any ONE K
  // Example: If table has 5♠, 5♥, 5♦ and you play 5♣, you can choose any ONE 5
  const singleMatches = tableCards.filter(card => card.value === playedCard.value);
  for (const match of singleMatches) {
    combinations.push([match]);
  }

  // Summation capture: only works for number cards (A, 2-10)
  // Face cards (J, Q, K) can't be used in summations
  const targetValue = playedCard.numericValue;
  if (targetValue > 0) {
    // Only calculate summations for number cards
    const validTableCards = tableCards.filter(card => card.numericValue > 0); // Only number cards
    const sums = findAllSums(validTableCards, targetValue);
    combinations.push(...sums);
  }

  return combinations;
}

// Helper: Find all combinations of cards that sum to target
// NOTE: Multiple cards of the same value can be used (e.g., two 3s can sum to 6)
function findAllSums(cards: Card[], target: number): Card[][] {
  const results: Card[][] = [];
  
  // Filter to only numeric cards (no face cards)
  const numericCards = cards.filter(c => c.numericValue > 0);
  
  // Use backtracking to find all combinations
  function backtrack(cardIndex: number, currentSum: number, path: Card[]): void {
    if (currentSum === target && path.length > 0) {
      results.push([...path]);
      return;
    }
    
    if (currentSum > target) return;
    if (cardIndex >= numericCards.length) return;

    const card = numericCards[cardIndex];
    
    // Try not using this card
    backtrack(cardIndex + 1, currentSum, path);
    
    // Try using this card (can use multiple cards of same value)
    path.push(card);
    backtrack(cardIndex + 1, currentSum + card.numericValue, path);
    path.pop();
  }

  backtrack(0, 0, []);
  return results;
}

// Validate if a specific combination can be captured
export function canCapture(playedCard: Card, selectedCards: Card[], tableCards: Card[]): boolean {
  // Check if all selected cards are actually on the table
  if (selectedCards.length === 0) return false;
  if (!selectedCards.every(card => 
    tableCards.some(tc => tc.suit === card.suit && tc.value === card.value)
  )) {
    return false;
  }

  // Jack captures all
  if (playedCard.value === 'J') {
    return selectedCards.length === tableCards.length;
  }

  // Single match
  if (selectedCards.length === 1) {
    return selectedCards[0].value === playedCard.value;
  }

  // Summation capture
  const sum = selectedCards.reduce((acc, card) => acc + card.numericValue, 0);
  return sum === playedCard.numericValue;
}

// Deal 4 cards to table, ensuring no Jacks are included
// If a Jack is selected, replace it with a non-Jack card from the deck
export function dealTableCards(deck: Card[]): { tableCards: Card[]; remainingDeck: Card[] } {
  const deckCopy = [...deck];
  const tableCards: Card[] = [];
  let attempts = 0;
  const maxAttempts = 100; // Prevent infinite loop
  
  // Deal 4 cards, ensuring none are Jacks
  while (tableCards.length < 4 && deckCopy.length > 0 && attempts < maxAttempts) {
    attempts++;
    const card = deckCopy.shift();
    if (!card) break;
    
    if (card.value === 'J') {
      // Find a non-Jack card to replace it
      const nonJackIndex = deckCopy.findIndex(c => c.value !== 'J');
      if (nonJackIndex >= 0) {
        // Swap: put Jack back, take non-Jack
        const nonJackCard = deckCopy.splice(nonJackIndex, 1)[0];
        tableCards.push(nonJackCard);
        deckCopy.unshift(card); // Put Jack back in deck
      } else {
        // No more non-Jack cards available, just add the Jack (shouldn't happen with normal deck)
        tableCards.push(card);
      }
    } else {
      tableCards.push(card);
    }
  }
  
  return {
    tableCards: tableCards.slice(0, 4), // Ensure exactly 4 cards
    remainingDeck: deckCopy,
  };
}

// Get card image path
export function getCardImagePath(card: Card): string {
  const valueMap: Record<Value, string> = {
    'A': 'ace',
    '2': '2',
    '3': '3',
    '4': '4',
    '5': '5',
    '6': '6',
    '7': '7',
    '8': '8',
    '9': '9',
    '10': '10',
    'J': 'jack',
    'Q': 'queen',
    'K': 'king',
  };

  const suitMap: Record<string, string> = {
    '♠': 'spades',
    '♥': 'hearts',
    '♦': 'diamonds',
    '♣': 'clubs',
  };

  const valueName = valueMap[card.value];
  const suitName = suitMap[card.suit];
  return `/assets/cards/${valueName}_of_${suitName}.png`;
}

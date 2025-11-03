import { Card, Player, RoundScoreResult } from './types';

export function calculateRoundScores(
  player1: Player,
  player2: Player
): RoundScoreResult {
  const player1Captures = player1.captures || [];
  const player2Captures = player2.captures || [];

  // Count clubs for each player
  const player1Clubs = player1Captures.filter((c) => c.suit === '♣').length;
  const player2Clubs = player2Captures.filter((c) => c.suit === '♣').length;

  // Check who has more clubs
  const player1MostClubs = player1Clubs > player2Clubs;
  const player2MostClubs = player2Clubs > player1Clubs;

  // Check who has more cards total
  const player1MoreCards = player1Captures.length > player2Captures.length;
  const player2MoreCards = player2Captures.length > player1Captures.length;

  // Check for special cards
  const player1HasTenDiamonds = player1Captures.some(
    (c) => c.value === '10' && c.suit === '♦'
  );
  const player2HasTenDiamonds = player2Captures.some(
    (c) => c.value === '10' && c.suit === '♦'
  );

  const player1HasTwoClubs = player1Captures.some(
    (c) => c.value === '2' && c.suit === '♣'
  );
  const player2HasTwoClubs = player2Captures.some(
    (c) => c.value === '2' && c.suit === '♣'
  );

  // Calculate points
  let player1Points = 0;
  let player2Points = 0;

  if (player1MostClubs) player1Points += 1;
  if (player2MostClubs) player2Points += 1;

  if (player1MoreCards) player1Points += 2;
  if (player2MoreCards) player2Points += 2;

  if (player1HasTenDiamonds) player1Points += 1;
  if (player2HasTenDiamonds) player2Points += 1;

  if (player1HasTwoClubs) player1Points += 1;
  if (player2HasTwoClubs) player2Points += 1;

  return {
    player1Id: player1.id,
    player1Points,
    player1Details: {
      mostClubs: player1MostClubs,
      moreCards: player1MoreCards,
      hasTenDiamonds: player1HasTenDiamonds,
      hasTwoClubs: player1HasTwoClubs,
    },
    player2Id: player2.id,
    player2Points,
    player2Details: {
      mostClubs: player2MostClubs,
      moreCards: player2MoreCards,
      hasTenDiamonds: player2HasTenDiamonds,
      hasTwoClubs: player2HasTwoClubs,
    },
  };
}


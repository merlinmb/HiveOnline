export const START_RATING = 1200;
export const MIN_RATING = 100;

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export function kFactor(rankedGames: number): number {
  if (rankedGames < 10) return 40;
  if (rankedGames < 30) return 32;
  return 24;
}

export interface RatingResult {
  white: number;
  black: number;
  whiteDelta: number;
  blackDelta: number;
}

export function rateGame(
  white: { rating: number; games: number },
  black: { rating: number; games: number },
  result: 'white' | 'black' | 'draw',
): RatingResult {
  const whiteScore = result === 'white' ? 1 : result === 'draw' ? 0.5 : 0;
  const blackScore = 1 - whiteScore;
  const whiteExpected = expectedScore(white.rating, black.rating);
  const blackExpected = 1 - whiteExpected;

  const whiteDelta = Math.round(kFactor(white.games) * (whiteScore - whiteExpected));
  const blackDelta = Math.round(kFactor(black.games) * (blackScore - blackExpected));

  return {
    white: Math.max(MIN_RATING, white.rating + whiteDelta),
    black: Math.max(MIN_RATING, black.rating + blackDelta),
    whiteDelta,
    blackDelta,
  };
}

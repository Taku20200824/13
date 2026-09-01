// Онооны дүрэм — Монгол хувилбар
//
// Нэг тоглогч хөзрөө дуусгамагц үе дуусна.
// Үлдсэн тоглогчдын гарт байгаа хөзрийн тоог оноо болгон нэмнэ.
// 10-12 хөзөр үлдвэл оноо 2 дахин, 13 хөзөр (нэг ч хөзөр гаргаагүй) бол 3 дахин.
// Хуримтлагдсан оноо 30 хүрсэн тоглогч хасагдана. Сүүлд үлдсэн нь ялагч.

export const ELIMINATION_SCORE = 30;
export const DOUBLE_THRESHOLD = 10;
export const TRIPLE_THRESHOLD = 13;

/** Гарт үлдсэн хөзрийн тооноос үеийн оноог бодно. */
export function roundPoints(cardsLeft) {
  if (cardsLeft <= 0) return { points: 0, multiplier: 1, cardsLeft: 0 };
  const multiplier =
    cardsLeft >= TRIPLE_THRESHOLD ? 3 : cardsLeft >= DOUBLE_THRESHOLD ? 2 : 1;
  return { points: cardsLeft * multiplier, multiplier, cardsLeft };
}

/** Оноог тайлбарлах богино текст: "11 × 2 = 22" */
export function pointsLabel(cardsLeft) {
  const { points, multiplier } = roundPoints(cardsLeft);
  if (cardsLeft === 0) return "0 (яллаа)";
  return multiplier === 1 ? `${points}` : `${cardsLeft} × ${multiplier} = ${points}`;
}

/**
 * Үеийн төгсгөлийг бодно.
 * players: [{ id, name, score, eliminated, hand }]
 * Буцаах: { results, eliminated, gameWinner }
 */
export function settleRound(players, roundWinnerId) {
  const results = players
    .filter((p) => !p.eliminated)
    .map((p) => {
      const cardsLeft = p.id === roundWinnerId ? 0 : p.hand.length;
      const { points, multiplier } = roundPoints(cardsLeft);
      return {
        id: p.id,
        name: p.name,
        cardsLeft,
        multiplier,
        points,
        scoreBefore: p.score,
        scoreAfter: p.score + points,
        isRoundWinner: p.id === roundWinnerId,
      };
    });

  const newlyEliminated = results.filter((r) => r.scoreAfter >= ELIMINATION_SCORE);
  const survivors = results.filter((r) => r.scoreAfter < ELIMINATION_SCORE);

  // Хэрэв бүгд нэг дор 30 давбал хамгийн бага оноотой нь үлдэнэ
  let eliminated = newlyEliminated;
  let remaining = survivors;
  if (remaining.length === 0 && newlyEliminated.length > 0) {
    const best = Math.min(...newlyEliminated.map((r) => r.scoreAfter));
    remaining = newlyEliminated.filter((r) => r.scoreAfter === best);
    eliminated = newlyEliminated.filter((r) => r.scoreAfter !== best);
  }

  const gameWinner = remaining.length === 1 ? remaining[0] : null;

  return {
    results,
    eliminated: eliminated.map((r) => r.id),
    remaining: remaining.map((r) => r.id),
    gameWinner,
  };
}

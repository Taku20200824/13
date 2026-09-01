// Bot тоглогч — гараа задалж, хямд нүүдлээс эхэлж тоглоно.
import { enumeratePlays, CATEGORY } from "./rules.js";
import { cardValue, rankOrder } from "./cards.js";

const isBomb = (combo) => combo.category >= CATEGORY.POKER;
const topValue = (combo) => cardValue(combo.cards[combo.cards.length - 1]);
const hasTwo = (combo) => combo.cards.some((c) => c.rank === "2");

/**
 * Нүүдэл сонгоно. Тавих боломжгүй бол null (= пасс).
 * @param {object} game  тоглоомын төлөв
 * @param {number} index bot-ын index
 */
export function chooseMove(game, index) {
  const player = game.players[index];
  const required = game.mustPlayStartingCard ? game.startingCardId : null;
  const options = enumeratePlays(player.hand, game.table, required);
  if (options.length === 0) return null;

  const handSize = player.hand.length;
  const opponentMin = Math.min(
    ...game.players.filter((p, i) => i !== index && !p.eliminated).map((p) => p.hand.length),
  );
  // Өрсөлдөгч дуусах гэж байвал эрсдэл хүлээж болно
  const urgent = opponentMin <= 3;

  const scored = options.map((combo) => ({ combo, cost: cost(combo, handSize, urgent, game) }));
  scored.sort((a, b) => a.cost - b.cost);
  return scored[0].combo;
}

/** Бага байх тусам сонгогдох магадлал өндөр. */
function cost(combo, handSize, urgent, game) {
  let score = 0;

  // Гараа хурдан барагдуулах нь чухал — үеийн оноо нь үлдсэн хөзрийн тоо.
  score -= combo.size * 12;

  // Хөзрийн хүч: сул хөзрийг эхэлж гаргана.
  score += topValue(combo) * 0.6;

  // 2-ыг дэмий бүү үр. Яаралтай бол зөвшөөрнө.
  if (hasTwo(combo) && !urgent && handSize > 4) score += 45;

  // Покер / страйт флаш бол хүчтэй зэвсэг — шаардлагагүй үед хэрэглэхгүй.
  if (isBomb(combo) && !urgent && handSize > 6) score += 90;

  // Ширээ цэвэрхэн үед: олон хөзөртэй хослолыг илүү дэмжинэ.
  if (!game.table) {
    score -= combo.size * 8;
    // Гэхдээ хамгийн том нэг хөзрөөр эхлэхээс сэргийлнэ.
    if (combo.size === 1 && rankOrder(combo.cards[0].rank) >= rankOrder("K")) score += 30;
  }

  // Сүүлийн хэдэн хөзөр үлдсэн бол юу ч болов гаргана.
  if (handSize <= 5) score -= combo.size * 10;

  return score;
}

/** Хүний тоглогчид "энийг тавьж болно" гэж зөвлөх. */
export function suggestMove(game, index) {
  return chooseMove(game, index);
}

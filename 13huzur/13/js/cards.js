// Хөзрийн үндсэн тодорхойлолт — Монгол дүрэм
//
// Өнгөний эрэмбэ (доороос дээш): дөрвөлжин < цэцэг < бундан < гил
// Тооны эрэмбэ (доороос дээш):   3 4 5 6 7 8 9 10 J Q K A 2

export const SUITS = [
  { id: "D", symbol: "♦", name: "дөрвөлжин", color: "red", order: 0 },
  { id: "C", symbol: "♣", name: "цэцэг", color: "black", order: 1 },
  { id: "H", symbol: "♥", name: "бундан", color: "red", order: 2 },
  { id: "S", symbol: "♠", name: "гил", color: "black", order: 3 },
];

export const SUIT_BY_ID = Object.fromEntries(SUITS.map((s) => [s.id, s]));

/** Тоглоомын ерөнхий эрэмбэ — 2 хамгийн том. */
export const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];

/**
 * Straight-д хэрэглэгдэх тусдаа эрэмбэ.
 * Монгол дүрмээр 2,3,4,5,6 гэж болох тул straight дотор 2 нь ХАМГИЙН ДООД байна.
 * Тиймээс зөвшөөрөгдөх дараалал: 2-3-4-5-6 ... 10-J-Q-K-A
 */
export const STRAIGHT_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export const rankOrder = (rank) => RANKS.indexOf(rank);
export const suitOrder = (suitId) => SUIT_BY_ID[suitId].order;
export const straightOrder = (rank) => STRAIGHT_RANKS.indexOf(rank);

/** Нэг хөзрийн үнэмлэхүй хүч: эхлээд тоо, тэнцвэл өнгө. */
export const cardValue = (card) => rankOrder(card.rank) * 4 + suitOrder(card.suit);

export function makeCard(rank, suitId) {
  const suit = SUIT_BY_ID[suitId];
  return {
    id: `${rank}${suitId}`,
    rank,
    suit: suitId,
    symbol: suit.symbol,
    suitName: suit.name,
    color: suit.color,
  };
}

export function makeDeck() {
  const deck = [];
  for (const rank of RANKS) for (const suit of SUITS) deck.push(makeCard(rank, suit.id));
  return deck;
}

/** Fisher–Yates. seed өгвөл давтагдах дараалал үүснэ (тест болон host-ын хуваарилалтад). */
export function shuffle(cards, seed) {
  const deck = [...cards];
  const rand = seed === undefined ? Math.random : mulberry32(seed);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const sortByValue = (cards) => [...cards].sort((a, b) => cardValue(a) - cardValue(b));

/** Хамгийн доод хөзөр = 3♦ (дөрвөлжин хамгийн бага өнгө). Эхлэх эрхийг энэ тодорхойлно. */
export const STARTING_CARD_ID = "3D";

export const cardLabel = (card) => `${card.rank}${card.symbol}`;

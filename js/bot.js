// Bot тоглогч — хоёр түвшинтэй.
//
//   "normal" — энгийн ховсонгуй логик (хамгийн хямд нүүдэл).
//   "hard"   — гараа хамгийн цөөн нүүдэлд барагдуулах ТӨЛӨВЛӨГӨӨ гаргаж,
//              тоглогдсон хөзрийг тоолж, өрсөлдөгчийн байдлыг харгалзана.
//
// Хүчтэй түвшний гол санаа: энэ тоглоомд ялах гэдэг нь "гараа хамгийн
// цөөн нүүдлээр дуусгах" явдал. Тиймээс нүүдэл бүрийг "энэ нүүдэл миний
// төлөвлөгөөг хэр эвдэж байна вэ" гэж үнэлнэ.

import { enumeratePlays, detect, beats, CATEGORY } from "./rules.js";
import { cardValue, rankOrder, makeDeck, STRAIGHT_RANKS } from "./cards.js";

export const DIFFICULTY = { NORMAL: "normal", HARD: "hard" };

/**
 * Хүчтэй түвшний жингүүд. Утгуудыг эмпирик тэмцээгээр тохируулсан
 * (js/bot.js-ийн түүхийг үзнэ үү) — тааварлаж биш, хэмжиж сонгосон.
 */
export const WEIGHTS = {
  planBreak: 140, // төлөвлөгөө муудвал шийтгэл
  topWeight: 0.35, // ижил үр дүнтэй бол сул хөзрөө эхэлж гаргах
  strongHold: 90, // 2 болон бомбыг хадгалах
  leadSize: 6, // тэргүүлж байхад олон хөзөр гаргах урамшуулал
  followSize: 4, // дагаж байхад цөөн хөзрөөр дийлэх
  unbeatable: 45, // дийлэгдэхгүй хослолоор тэргүүлэх урамшуулал
  blockAt: 2, // өрсөлдөгч ийм цөөн хөзөртэй бол ямар ч үнээр хориглоно
  rushAt: 4, // өөрөө ийм цөөн хөзөртэй бол зогсолтгүй тоглоно

  // Үеийн оноо нь ҮЛДСЭН ХӨЗРИЙН тоогоор бодогддог тул хөзөр олноор
  // гаргах нь чухал. Тэмцээгээр 0 → 20 болгоход ялалт 63% → 77% болсон.
  cardWeight: 20,

  // Пасс хийх нь гарт хөзөр үлдээдэг тул энэ дүрмээр АЛДАГДАЛТАЙ.
  // Тэмцээгээр батлагдсан: пасс хийхгүй нь 63% → 70% болгосон.
  // (Хүчинтэй нүүдэл огт байхгүй үед мэдээж пасс хийнэ.)
  allowPass: 0,
};

const isBomb = (combo) => combo.category >= CATEGORY.POKER;
const topValue = (combo) => cardValue(combo.cards[combo.cards.length - 1]);
const hasTwo = (combo) => combo.cards.some((c) => c.rank === "2");

/* ══════════════════════════════════════════════════
   Гарын задаргаа — хамгийн цөөн нүүдлийн тоо
   ══════════════════════════════════════════════════ */

/**
 * Гарыг хүчинтэй хослолуудад хуваахад хамгийн цөөндөө хэдэн нүүдэл
 * шаардагдахыг ЯГ бодно (bitmask DP).
 *
 * Хурдны гол заль: төлөв бүрд зөвхөн ХАМГИЙН ДООД үлдсэн хөзрийг
 * агуулсан хослолуудыг үзнэ. Хуваалт хийж байгаа тул тэр хөзрийг
 * хэн нэг хослол заавал авах ёстой — үүнээс салаалалт огцом багасна.
 */
function createPlanner(hand) {
  const n = hand.length;
  const combos = allCombos(hand); // [{ mask, combo }]
  const byLowest = Array.from({ length: n }, () => []);
  for (const entry of combos) {
    byLowest[lowestBit(entry.mask)].push(entry);
  }

  const memo = new Map();

  function minPlays(mask) {
    if (mask === 0) return 0;
    const cached = memo.get(mask);
    if (cached !== undefined) return cached;

    const low = lowestBit(mask);
    let best = Infinity;
    for (const entry of byLowest[low]) {
      if ((entry.mask & mask) !== entry.mask) continue;
      const rest = minPlays(mask & ~entry.mask);
      if (rest + 1 < best) best = rest + 1;
      if (best === 1) break; // үүнээс сайн байх боломжгүй
    }
    memo.set(mask, best);
    return best;
  }

  const fullMask = (1 << n) - 1;

  return {
    hand,
    combos,
    fullMask,
    minPlays,
    /** Хослолын хөзрүүдээс bitmask гаргана. */
    maskOf(cards) {
      const index = new Map(hand.map((c, i) => [c.id, i]));
      let mask = 0;
      for (const card of cards) {
        const i = index.get(card.id);
        if (i === undefined) return -1;
        mask |= 1 << i;
      }
      return mask;
    },
  };
}

const lowestBit = (mask) => 31 - Math.clz32(mask & -mask);

/**
 * Гар доторх бүх хүчинтэй хослолыг bitmask-тай нь жагсаана.
 *
 * C(13,5)=1287 дэд олонлогийг бүгдийг шалгахын оронд төрөл тус бүрийг
 * ЗОРИУДААР үүсгэнэ (флаш зөвхөн ижил өнгөнөөс, фүл хаус зөвхөн
 * гурвалаас гэх мэт). Ингэснээр олон дахин хурдан болно.
 */
function allCombos(hand) {
  const out = [];
  const idx = new Map(hand.map((c, i) => [c.id, i]));
  const maskOf = (cards) => cards.reduce((m, c) => m | (1 << idx.get(c.id)), 0);
  const add = (cards) => {
    const combo = detect(cards);
    if (combo) out.push({ mask: maskOf(cards), combo });
  };

  // Ранкаар бүлэглэх
  const byRank = new Map();
  for (const card of hand) {
    if (!byRank.has(card.rank)) byRank.set(card.rank, []);
    byRank.get(card.rank).push(card);
  }
  // Өнгөөр бүлэглэх
  const bySuit = new Map();
  for (const card of hand) {
    if (!bySuit.has(card.suit)) bySuit.set(card.suit, []);
    bySuit.get(card.suit).push(card);
  }

  // 1-3 хөзрийн хослолууд
  for (const cards of byRank.values()) {
    for (const c of cards) add([c]);
    forEachSubset(cards, 2, add);
    forEachSubset(cards, 3, add);
  }

  // Страйт: дараалсан 5 ранкаас тус бүр нэг хөзөр
  for (let i = 0; i + 4 < STRAIGHT_RANKS.length; i += 1) {
    const groups = [];
    let ok = true;
    for (let k = 0; k < 5; k += 1) {
      const g = byRank.get(STRAIGHT_RANKS[i + k]);
      if (!g) {
        ok = false;
        break;
      }
      groups.push(g);
    }
    if (ok) cartesian(groups, add);
  }

  // Флаш ба страйт флаш: ижил өнгөний 5 хөзөр
  for (const cards of bySuit.values()) {
    if (cards.length >= 5) forEachSubset(cards, 5, add);
  }

  // Фүл хаус: гурвал + хос
  for (const [rank, three] of byRank) {
    if (three.length < 3) continue;
    for (const [rank2, two] of byRank) {
      if (rank2 === rank || two.length < 2) continue;
      forEachSubset(three, 3, (t) => forEachSubset(two, 2, (p) => add([...t, ...p])));
    }
  }

  // Покер: 4 ижил + дурын нэг
  for (const [rank, four] of byRank) {
    if (four.length < 4) continue;
    for (const card of hand) {
      if (card.rank === rank) continue;
      add([...four, card]);
    }
  }

  // Давхардлыг хасна (жишээ нь страйт флаш хоёр замаар үүсэж болно)
  const seen = new Set();
  return out.filter((entry) => {
    if (seen.has(entry.mask)) return false;
    seen.add(entry.mask);
    return true;
  });
}

function forEachSubset(items, size, visit) {
  const pick = [];
  const walk = (start) => {
    if (pick.length === size) return visit([...pick]);
    if (items.length - start < size - pick.length) return;
    for (let i = start; i < items.length; i += 1) {
      pick.push(items[i]);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
}

function cartesian(groups, visit) {
  const pick = [];
  const walk = (depth) => {
    if (depth === groups.length) return visit([...pick]);
    for (const item of groups[depth]) {
      pick.push(item);
      walk(depth + 1);
      pick.pop();
    }
  };
  walk(0);
}

/* ══════════════════════════════════════════════════
   Хөзөр тоолол
   ══════════════════════════════════════════════════ */

/** Миний гарт ч, ширээн дээр ч байхгүй — өрсөлдөгчдийн гарт байж болох хөзрүүд. */
function unseenCards(game, index) {
  const seen = new Set(game.played ?? []);
  for (const card of game.players[index].hand) seen.add(card.id);
  if (game.table) for (const card of game.table.cards) seen.add(card.id);
  return makeDeck().filter((card) => !seen.has(card.id));
}

/**
 * Энэ хослолыг өрсөлдөгч дийлж чадах уу — ХЯМД ойролцоолол.
 * Бүх хослолыг угсарч үзвэл C(30,5) = 142k хувилбар болох тул
 * зөвхөн шийдвэрлэх шинжийг шалгана.
 */
function beatable(combo, unseen) {
  const top = topValue(combo);

  if (combo.size === 1) {
    return unseen.some((card) => cardValue(card) > top);
  }

  if (combo.size === 2 || combo.size === 3) {
    // Илүү өндөр ранкаас хангалттай тооны хөзөр үлдсэн үү
    const counts = new Map();
    for (const card of unseen) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    const myRank = rankOrder(combo.cards[0].rank);
    for (const [rank, count] of counts) {
      if (count < combo.size) continue;
      if (rankOrder(rank) > myRank) return true;
      // Ижил ранк дээр өнгөөр дийлэх боломж (зөвхөн хосын хувьд)
      if (combo.size === 2 && rankOrder(rank) === myRank) {
        const higher = unseen.filter((c) => c.rank === rank && cardValue(c) > top);
        if (higher.length >= 1 && count >= 2) return true;
      }
    }
    return false;
  }

  // 5 хөзрийн хослол: рояал флашийг л дийлэх аргагүй гэж үзнэ.
  // Бусад тохиолдолд илүү өндөр ангилал үлдсэн эсэхийг ойролцоолно.
  if (combo.type === "royalFlush") return false;
  if (combo.category >= CATEGORY.STRAIGHT_FLUSH) {
    // Зөвхөн илүү өндөр страйт флаш дийлнэ — ховор тул үгүй гэж үзнэ
    return false;
  }
  if (combo.category === CATEGORY.POKER) {
    // Илүү өндөр 4 ижил, эсвэл страйт флаш үлдсэн үү
    const counts = new Map();
    for (const card of unseen) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    const myRank = rankOrder(combo.cards.find((c, _, arr) =>
      arr.filter((x) => x.rank === c.rank).length === 4)?.rank ?? combo.cards[0].rank);
    for (const [rank, count] of counts) {
      if (count === 4 && rankOrder(rank) > myRank) return true;
    }
    return hasStraightFlushPotential(unseen);
  }
  // Страйт / флаш / фүл хаус — ихэвчлэн дийлэгддэг
  return true;
}

/** Үлдсэн хөзрөөс страйт флаш угсарч болох уу (ойролцоо шалгалт). */
function hasStraightFlushPotential(unseen) {
  const bySuit = new Map();
  for (const card of unseen) {
    if (!bySuit.has(card.suit)) bySuit.set(card.suit, new Set());
    bySuit.get(card.suit).add(card.rank);
  }
  for (const ranks of bySuit.values()) {
    if (ranks.size < 5) continue;
    for (let i = 0; i + 4 < STRAIGHT_RANKS.length; i += 1) {
      let run = true;
      for (let k = 0; k < 5; k += 1) {
        if (!ranks.has(STRAIGHT_RANKS[i + k])) {
          run = false;
          break;
        }
      }
      if (run) return true;
    }
  }
  return false;
}

/* ══════════════════════════════════════════════════
   Нүүдэл сонгох
   ══════════════════════════════════════════════════ */

/**
 * @param {object} game
 * @param {number} index
 * @param {{difficulty?: string}} options
 * @returns {object|null} хослол, эсвэл null (= пасс)
 */
export function chooseMove(game, index, options = {}) {
  const difficulty = options.difficulty ?? game.difficulty ?? DIFFICULTY.HARD;
  const player = game.players[index];
  const required = game.mustPlayStartingCard ? game.startingCardId : null;
  const moves = enumeratePlays(player.hand, game.table, required);
  if (moves.length === 0) return null;

  if (difficulty === DIFFICULTY.NORMAL) return chooseNormal(game, index, moves);
  return chooseHard(game, index, moves, options.weights ?? WEIGHTS);
}

/* ── Энгийн түвшин (хуучин логик) ───────────────── */

function chooseNormal(game, index, moves) {
  const player = game.players[index];
  const handSize = player.hand.length;
  const opponentMin = Math.min(
    ...game.players.filter((p, i) => i !== index && !p.eliminated).map((p) => p.hand.length),
  );
  const urgent = opponentMin <= 3;

  return [...moves]
    .map((combo) => ({ combo, cost: normalCost(combo, handSize, urgent, game) }))
    .sort((a, b) => a.cost - b.cost)[0].combo;
}

function normalCost(combo, handSize, urgent, game) {
  let score = 0;
  score -= combo.size * 12;
  score += topValue(combo) * 0.6;
  if (hasTwo(combo) && !urgent && handSize > 4) score += 45;
  if (isBomb(combo) && !urgent && handSize > 6) score += 90;
  if (!game.table) {
    score -= combo.size * 8;
    if (combo.size === 1 && rankOrder(combo.cards[0].rank) >= rankOrder("K")) score += 30;
  }
  if (handSize <= 5) score -= combo.size * 10;
  return score;
}

/* ── Хүчтэй түвшин ──────────────────────────────── */

function chooseHard(game, index, moves, w = WEIGHTS) {
  const player = game.players[index];
  const hand = player.hand;
  const planner = createPlanner(hand);
  const basePlays = planner.minPlays(planner.fullMask);

  const opponents = game.players.filter((p, i) => i !== index && !p.eliminated);
  const opponentMin = Math.min(...opponents.map((p) => p.handCount ?? p.hand.length));
  const opponentCount = opponents.length;
  const unseen = unseenCards(game, index);

  // 1. Энэ нүүдлээр гараа дуусгаж чадах уу — эргэлзэхгүй
  const finisher = moves.find((m) => m.size === hand.length);
  if (finisher) return finisher;

  const leading = !game.table;

  const scored = moves.map((combo) => {
    const mask = planner.maskOf(combo.cards);
    const after = planner.minPlays(planner.fullMask & ~mask);
    // Хамгийн чухал хэмжүүр: энэ нүүдлийн дараа хэдэн нүүдэл үлдэх вэ.
    // Төлөвлөгөөнд багтсан нүүдэл бол (basePlays - 1) болно.
    let score = after * 100;

    // Үеийн оноо нь ҮЛДСЭН ХӨЗРИЙН тоо. Түрүүлж дуусч чадахгүй ч
    // олон хөзөр гаргасан бол оноо бага байна.
    score += (hand.length - combo.size) * w.cardWeight;

    // Төлөвлөгөөг эвдэж байвал (нүүдлийн тоо буурахгүй) хүнд шийтгэл
    if (after >= basePlays) score += w.planBreak;

    // Ижил үр дүнтэй бол сул хөзрөө эхэлж гаргана
    score += topValue(combo) * w.topWeight;

    // Хүчтэй хөзрийг хэрэггүй үед бүү үр
    const strong = hasTwo(combo) || isBomb(combo);
    if (strong && opponentMin > 4 && hand.length > 5) score += w.strongHold;

    if (leading) {
      // Тэргүүлж байгаа үед: дийлэгдэхгүй хослол бол маш үнэ цэнэтэй —
      // ширээг дахин авах баталгаа болно.
      if (!beatable(combo, unseen)) score -= w.unbeatable;
      // Олон хөзөр зэрэг гаргах нь ашигтай
      score -= combo.size * w.leadSize;
    } else {
      // Дагаж байгаа үед: хамгийн бага зардлаар дийлнэ
      score += combo.size * w.followSize;
    }

    return { combo, score, after };
  });

  scored.sort((a, b) => a.score - b.score);
  const best = scored[0];

  // 2. Дагаж байгаа үед заримдаа ПАСС хийх нь дээр
  if (!leading && w.allowPass && shouldPass(best, basePlays, opponentMin, hand.length, w)) return null;

  return best.combo;
}

/**
 * Дийлэх нь төлөвлөгөөг эвдэж байвал, бас өрсөлдөгч дуусах шахсан
 * биш бол пасс хийж хүчээ хадгална.
 */
function shouldPass(best, basePlays, opponentMin, handSize, w) {
  // Өрсөлдөгч дуусах гэж байвал ямар ч үнээр хориглоно
  if (opponentMin <= w.blockAt) return false;
  // Өөрөө дуусах шахсан бол зогсолтгүй тоглоно
  if (handSize <= w.rushAt) return false;
  // Төлөвлөгөө муудахгүй бол тавина
  if (best.after < basePlays) return false;
  // Төлөвлөгөө муудаж байна: хүчтэй хөзөр үрэх үү гэдгийг шийднэ
  if (hasTwo(best.combo) || isBomb(best.combo)) return true;
  // Нүүдлийн тоо ӨСӨХ бол утгагүй
  return best.after > basePlays;
}

/* ══════════════════════════════════════════════════
   Хүнд зориулсан зөвлөмж
   ══════════════════════════════════════════════════ */

/** "Энийг тавьж болно" гэж зөвлөх — үргэлж хүчтэй логикоор. */
export function suggestMove(game, index) {
  return chooseMove(game, index, { difficulty: DIFFICULTY.HARD });
}

/** Гараа хэдэн нүүдэлд барагдуулж чадах вэ (UI-д харуулж болно). */
export function planSize(hand) {
  if (!hand.length) return 0;
  const planner = createPlanner(hand);
  return planner.minPlays(planner.fullMask);
}

export { beats };

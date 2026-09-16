// Bot тоглогч — гурван түвшинтэй.
//
//   "normal" — энгийн ховсонгуй логик (хамгийн хямд нүүдэл).
//   "hard"   — ТӨЛӨВЛӨГӨӨТ тоглогч: гараа хамгийн цөөн нүүдэлд барагдуулах
//              задаргаа гаргаж, тоглогдсон хөзрийг тоолж, өрсөлдөгч юуг
//              дийлж ЧАДААГҮЙГ санаж, дуусах шахсан хүнийг хаана.
//   "expert" — hard-ын шигшсэн нүүдлүүдийг өрсөлдөгчийн боломжит гарууд
//              дээр үнэхээр ТОГЛУУЛЖ ҮЗЭЖ шалгана (js/search.js).
//
// Хүчтэй түвшин юу "ойлгодог" вэ:
//   • нүүдлийн тоо — гараа хэдэн удаа тавиад дуусгах вэ (bitmask DP)
//   • хяналт      — ширээг эргүүлж авах баталгаатай хөзөр хэд байна вэ
//   • хүч         — үлдсэн хөзрөөр энэ хослолыг дийлэх боломж байна уу
//   • хаалт       — 1-2 хөзөртэй үлдсэн хүнд ямар нүүдэл өгч БОЛОХГҮЙ вэ
//   • пасс        — хэзээ хүчээ хэмнэж, хэзээ ямар ч үнээр дийлэх вэ

import { enumeratePlays, detect, beats, compareSameShape, CATEGORY } from "./rules.js";
import { cardValue, rankOrder, makeDeck, STRAIGHT_RANKS } from "./cards.js";
import { searchMove, fastPolicy } from "./search.js";

export const DIFFICULTY = { NORMAL: "normal", HARD: "hard", EXPERT: "expert" };

/**
 * Хүчтэй түвшний жингүүд. Бүгд `tools/arena.mjs`-ээр хэмжиж сонгосон —
 * тааварласан утга энд байхгүй. Өөрчилсөн бол ЗААВАЛ дахин хэмжинэ:
 *
 *   node tools/arena.mjs --rounds 3000
 */
export const WEIGHTS = {
  // ── Гол хэмжүүрүүд (бага нь сайн — оноог хамгийн бага нүүдлийг сонгоно)
  plan: 100, // энэ нүүдлийн дараа үлдэх нүүдлийн тоо
  planBreak: 140, // нүүдлийн тоо огт буурахгүй бол нэмэлт шийтгэл
  cards: 22, // гарт үлдэх хөзөр бүрийн зардал (үеийн оноо = үлдсэн хөзөр)
  control: 60, // гарт үлдэх "баталгаатай ширээ авах" хөзрийн үнэ
  top: 0.35, // тэнцвэл сул хөзрөө эхэлж гаргах

  // ── Тэргүүлэх / дагах
  leadSize: 6, // тэргүүлж байхад олон хөзөр гаргах урамшуулал
  followSize: 4, // дагаж байхад цөөн хөзрөөр дийлэх
  unbeatable: 45, // дийлэгдэхгүй хослолоор тэргүүлэх урамшуулал
  safeAt: 0.08, // үүнээс бага эрсдэлтэй хослолыг "дийлэгдэхгүй" гэж үзнэ

  // ЧУХАЛ: эрсдэлийг ШУГАМАН шийтгэл болгож болохгүй. Тэгвэл bot ширээгээ
  // алдахаас айж хамгийн хүчтэй хөзрөө эхэлж гаргадаг болж, 90 тоглоомын
  // хэмжилтээр ялалт 43% болж УНАСАН. Зөвхөн үнэхээр дийлэгдэхгүй нүүдлийг
  // урамшуулж, бусдыг нь ялгаварлахгүй.
  leadRisk: 0,

  // ── Хүчээ дэмий үрэхгүй
  wasteTwo: 55, // яаралтай биш үед 2-оо гаргах
  wasteBomb: 120, // яаралтай биш үед бомбоо эвдэх
  holdAbove: 4, // өрсөлдөгчид ийм олон хөзөртэй байхад хүчээ хэмнэнэ

  // ── Дуусах шахсан өрсөлдөгчийг хаах
  blockAt: 2, // ийм цөөн хөзөртэй хүн = аюул
  rushAt: 4, // өөрөө ийм цөөн хөзөртэй бол зогсолтгүй тоглоно
  shutout: 150, // түүний хөзрөөс ОЛОН хөзрөөр тэргүүлэх (тоглож ч чадахгүй)
  dangerLead: 130, // түүний дийлж чадах юмаар тэргүүлэх = ширээ бэлэглэх
  dangerBeat: 40, // дагаж байхад түүнийг зогсоож чадахгүй нүүдэл

  allowPass: 1, // 0 бол хэзээ ч пасс хийхгүй (хуучин зан)
  passBelow: 9, // төлөвлөгөө хамгаалахаар пасс хийх дээд гарын хэмжээ
  // Өрсөлдөгч юуг дийлж чадаагүйг санах эсэх.
  //
  // ⚠ Дүгнэлт нь ЗӨВ (гар зөвхөн жижгэрдэг) ч энэ түвшинд ПРАКТИК ач
  // холбогдолгүй болох нь хэмжилтээр гарсан: 1866 нүүдлээс 1730-д нь
  // санамж байсан хэрнээ сонголт нэг ч удаа өөрчлөгдөөгүй. Учир нь
  // санамж зөвхөн "X ба түүнээс хүчтэй" тухай ярьдаг бол тэргүүлэхдээ
  // бид ихэвчлэн сул хөзөр гаргадаг.
  //
  // Бодит ашиг нь МАСТЕР түвшинд: search.js таамаглалаа шүүхэд хэрэглэнэ.
  useMemory: 1,

  // ── "expert" түвшний хайлт (js/search.js)
  searchWidth: 6, // эвристикээр шалгарсан хэдэн нүүдлийг тоглуулж үзэх вэ
  searchWorlds: 16, // өрсөлдөгчийн гарыг хэдэн янзаар таамаглах вэ
  searchMs: 400, // нэг нүүдэлд зарцуулах дээд хугацаа (0 = хязгааргүй)
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
   Хөзөр тоолол ба өрсөлдөгчийн загвар
   ══════════════════════════════════════════════════ */

/** Миний гарт ч, ширээн дээр ч байхгүй — өрсөлдөгчдийн гарт байж болох хөзрүүд. */
function unseenCards(game, index) {
  const seen = new Set(game.played ?? []);
  for (const card of game.players[index].hand) seen.add(card.id);
  if (game.table) for (const card of game.table.cards) seen.add(card.id);
  return makeDeck().filter((card) => !seen.has(card.id));
}

/**
 * Үлдсэн хөзрөөс ЮУ УГСАРЧ БОЛОХЫГ нэг удаа бодож тавина.
 * Нүүдэл бүрд дахин тоолохгүйн тулд — тэргүүлж байхад 200+ хувилбар үнэлэгддэг.
 */
function analyzeUnseen(unseen) {
  const byRank = new Map(); // ранк → тоо
  const bySuit = new Map(); // өнгө → хөзрүүд
  for (const card of unseen) {
    byRank.set(card.rank, (byRank.get(card.rank) ?? 0) + 1);
    if (!bySuit.has(card.suit)) bySuit.set(card.suit, []);
    bySuit.get(card.suit).push(card);
  }
  for (const cards of bySuit.values()) cards.sort((a, b) => cardValue(b) - cardValue(a));

  return {
    cards: unseen,
    total: unseen.length,
    byRank,
    bySuit,
    maxSingle: unseen.length ? Math.max(...unseen.map(cardValue)) : -1,
  };
}

/* ── Хэдэн ӨӨР хослолоор энийг дийлж болох вэ ───────
   Магадлал бодохын тулд "боломж байна уу" гэсэн тийм/үгүй хариу
   хангалтгүй. Хэдэн БОДИТ хослол угсарч болохыг тоолно: 1 боломжтой
   хос ба 12 боломжтой хос хоёр огт өөр эрсдэл. */

const choose = (n, k) => {
  if (k < 0 || n < k) return 0;
  let result = 1;
  for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
  return Math.round(result);
};

/** Гурвал + өөр ранкийн хос — фүл хаусын тоо (гурвалын ранк minRank-аас дээш). */
function fullHouseUnits(info, minRank) {
  let units = 0;
  for (const [rank, count] of info.byRank) {
    if (count < 3 || rankOrder(rank) <= minRank) continue;
    const triples = choose(count, 3);
    let pairs = 0;
    for (const [other, otherCount] of info.byRank) {
      if (other !== rank) pairs += choose(otherCount, 2);
    }
    units += triples * pairs;
  }
  return units;
}

/** 4 ижил + дурын нэг — покерын тоо. */
function pokerUnits(info, minRank) {
  let units = 0;
  for (const [rank, count] of info.byRank) {
    if (count < 4 || rankOrder(rank) <= minRank) continue;
    units += choose(count, 4) * (info.total - count);
  }
  return units;
}

/** Ижил өнгөний дараалсан 5 — страйт флашийн тоо (толгой minHead-ээс дээш). */
function straightFlushUnits(info, minHead) {
  let units = 0;
  for (const cards of info.bySuit.values()) {
    if (cards.length < 5) continue;
    const ranks = new Set(cards.map((c) => c.rank));
    for (let i = 0; i + 4 < STRAIGHT_RANKS.length; i += 1) {
      if (i + 4 <= minHead) continue;
      let ok = true;
      for (let k = 0; k < 5; k += 1) {
        if (!ranks.has(STRAIGHT_RANKS[i + k])) {
          ok = false;
          break;
        }
      }
      if (ok) units += 1; // нэг өнгөнд ранк тус бүр нэг л хөзөр
    }
  }
  return units;
}

/** Дараалсан 5 хөзрийн тоо. Толгой тэнцвэл толгойн ӨНГӨ шийддэгийг тооцно. */
function straightUnits(info, minHead, minHeadValue) {
  let units = 0;
  for (let i = 0; i + 4 < STRAIGHT_RANKS.length; i += 1) {
    const head = i + 4;
    if (head < minHead) continue;
    let product = 1;
    for (let k = 0; k < 4; k += 1) {
      product *= info.byRank.get(STRAIGHT_RANKS[i + k]) ?? 0;
      if (!product) break;
    }
    if (!product) continue;
    const headRank = STRAIGHT_RANKS[head];
    const headCards =
      head > minHead
        ? info.byRank.get(headRank) ?? 0
        : // ижил толгойтой бол зөвхөн илүү өндөр өнгөтэй толгой дийлнэ
          info.cards.filter((c) => c.rank === headRank && cardValue(c) > minHeadValue).length;
    units += product * headCards;
  }
  return units;
}

/** Ижил өнгөний 5 хөзөр — тухайн флашийг давах хувилбарын тоо. */
function flushUnits(info, combo) {
  let units = 0;
  for (const cards of info.bySuit.values()) {
    if (cards.length < 5) continue;
    if (!combo) {
      units += choose(cards.length, 5);
      continue;
    }
    // Хамгийн хүчтэй 5 нь ч дийлэхгүй бол энэ өнгөнөөс юу ч гарахгүй
    const best = cards.slice(0, 5).map((c) => rankOrder(c.rank));
    let better = false;
    for (let i = 0; i < 5; i += 1) {
      if (best[i] > combo.ranks[i]) {
        better = true;
        break;
      }
      if (best[i] < combo.ranks[i]) break;
    }
    if (better) units += choose(cards.length, 5);
  }
  return units;
}

/**
 * Энэ хослолыг дийлэх ХЭДЭН өөр хослол үлдсэн хөзрөөс угсарч болох вэ.
 * 0 гэдэг нь хэн ч хэзээ ч дийлэхгүй — үнэмлэхүй хяналт.
 */
function countBeatingUnits(combo, info) {
  const top = topValue(combo);

  if (combo.size === 1) return info.cards.filter((c) => cardValue(c) > top).length;

  if (combo.size === 2) {
    const myRank = rankOrder(combo.cards[0].rank);
    let units = 0;
    for (const [rank, count] of info.byRank) {
      const order = rankOrder(rank);
      if (order > myRank) units += choose(count, 2);
      else if (order === myRank) {
        // Ижил ранк дээр хосын ДЭЭД хөзөр минийхээс өндөр байх ёстой
        const higher = info.cards.filter((c) => c.rank === rank && cardValue(c) > top).length;
        units += choose(count, 2) - choose(count - higher, 2);
      }
    }
    return units;
  }

  if (combo.size === 3) {
    const myRank = rankOrder(combo.cards[0].rank);
    let units = 0;
    for (const [rank, count] of info.byRank) {
      if (rankOrder(rank) > myRank) units += choose(count, 3);
    }
    return units;
  }

  // 5 хөзөр: илүү ӨНДӨР АНГИЛАЛ бүр + ижил ангилал дотор илүү хүчтэй нь
  const sf = straightFlushUnits(info, -1);
  const poker = pokerUnits(info, -1);
  switch (combo.category) {
    case CATEGORY.STRAIGHT_FLUSH:
      return straightFlushUnits(info, combo.headOrder);
    case CATEGORY.POKER:
      return sf + pokerUnits(info, combo.keyRank);
    case CATEGORY.FULL_HOUSE:
      return sf + poker + fullHouseUnits(info, combo.keyRank);
    case CATEGORY.FLUSH:
      return sf + poker + fullHouseUnits(info, -1) + flushUnits(info, combo);
    case CATEGORY.STRAIGHT:
      return (
        sf +
        poker +
        fullHouseUnits(info, -1) +
        flushUnits(info, null) +
        straightUnits(info, combo.headOrder, cardValue(combo.head))
      );
    default:
      return 1;
  }
}

/** `need` ширхэг ТОДОРХОЙ хөзөр бүгд тухайн гарт байх магадлал. */
function holdProbability(total, count, need) {
  let p = 1;
  for (let i = 0; i < need; i += 1) {
    if (total - i <= 0) return 0;
    p *= (count - i) / (total - i);
    if (p <= 0) return 0;
  }
  return p;
}

/** Идэвхтэй өрсөлдөгч бүрийн НИЙТИЙН мэдээлэл — гарыг нь хэзээ ч хардаггүй. */
function buildOpponents(game, index) {
  const declined = game.declined ?? {};
  return game.players
    .filter((p) => p.index !== index && !p.eliminated)
    .map((p) => ({
      seat: p.index,
      count: p.handCount ?? p.hand.length,
      declined: declined[p.index] ?? {},
    }));
}

/**
 * Тухайн өрсөлдөгч энэ хослолыг дийлэх МАГАДЛАЛ (0..1).
 *
 * Гурван эх сурвалж:
 *   1. Хөзрийн тоо. Гурван хөзөртэй хүн 5 хөзрийн хослол тавьж ЧАДАХГҮЙ.
 *   2. Санамж. Өмнө нь үүнээс сул хослолыг дийлж чадаагүй бол үүнийг ч
 *      чадахгүй — гар зөвхөн жижгэрдэг тул энэ нь таамаг биш, ХАТУУ дүгнэлт.
 *   3. Тоолол. Үлдсэн хөзрөөс дийлэх хослол хэд угсарч болох, тэр нь яг
 *      ЭНЭ хүний гарт цугларсан байх магадлал хэд вэ.
 */
function opponentBeatChance(opponent, combo, info, w) {
  if (opponent.count < combo.size) return 0;
  const declined = opponent.declined?.[combo.size];
  // combo >= declined  ⇒  combo-г дийлэх нь declined-ыг дийлэхээс хэцүү
  if (w.useMemory && declined && compareSameShape(combo, declined) >= 0) return 0;

  const units = countBeatingUnits(combo, info);
  if (units <= 0) return 0;
  const p = holdProbability(info.total, opponent.count, combo.size);
  if (p <= 0) return 0;
  // Хослолуудыг бие даасан гэж үзсэн ойролцоолол — хэтрүүлэхгүйн тулд таслана
  return Math.min(1, 1 - Math.pow(1 - p, units));
}

/** Хэн нэг нь дийлэх магадлал. */
function beatChance(opponents, combo, info, w) {
  let survive = 1;
  for (const opponent of opponents) survive *= 1 - opponentBeatChance(opponent, combo, info, w);
  return 1 - survive;
}

/**
 * Гарт үлдэх "баталгаатай ширээ авах" ганц хөзрийн тоо.
 * Миний дээд хөзрүүдийг өрсөлдөгчийн боломжит дээд хөзрүүдтэй
 * зэрэгцүүлж тоолно — 13-ын тоглоомд энэ л ээлжийг эргүүлж авах нөөц.
 */
function controlCount(hand, info) {
  const mine = hand.map(cardValue).sort((a, b) => b - a);
  const theirs = info.cards.map(cardValue).sort((a, b) => b - a);
  let n = 0;
  while (n < mine.length && (n >= theirs.length || mine[n] > theirs[n])) n += 1;
  return n;
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

  const weights = options.weights ?? WEIGHTS;
  if (difficulty === DIFFICULTY.NORMAL) return chooseNormal(game, index, moves);
  if (difficulty === DIFFICULTY.EXPERT) return chooseExpert(game, index, moves, weights, options);
  return chooseHard(game, index, moves, weights);
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

/**
 * Гол санаа: ялах гэдэг нь "гараа хамгийн цөөн нүүдлээр дуусгах" БА
 * "тэр нүүдлүүдээ хийх ЭЭЛЖИЙГ олж авах" хоёр. Тиймээс нүүдэл бүрийг
 * дөрвөн талаас үнэлнэ:
 *
 *   1. Энэ нүүдлийн дараа хэдэн нүүдэл үлдэх вэ      (төлөвлөгөө)
 *   2. Гарт хэдэн хөзөр үлдэх вэ                      (үеийн оноо)
 *   3. Ширээ буцааж авах чадвараа хэр үрж байна вэ    (хяналт)
 *   4. Дуусах шахсан өрсөлдөгчид юу өгч байна вэ      (хаалт)
 */
function rankHard(game, index, moves, w = WEIGHTS) {
  const hand = game.players[index].hand;
  const leading = !game.table;

  // 1. Гараа энэ нүүдлээр дуусгаж чадвал эргэлзэхгүй
  const finisher = moves.find((m) => m.size === hand.length);
  if (finisher) return { forced: finisher };

  const planner = createPlanner(hand);
  const basePlays = planner.minPlays(planner.fullMask);
  const info = analyzeUnseen(unseenCards(game, index));
  const opponents = buildOpponents(game, index);

  // Нэг хослолын эрсдэлийг олон удаа асуудаг тул хадгална
  const riskCache = new Map();
  const comboKey = (combo) => combo.cards.map((c) => c.id).join();
  const riskFrom = (who, combo) => {
    const key = `${who.length}|${comboKey(combo)}`;
    let value = riskCache.get(key);
    if (value === undefined) {
      value = beatChance(who, combo, info, w);
      riskCache.set(key, value);
    }
    return value;
  };
  /** Хэн нэг нь үүнийг дийлэх магадлал. */
  const risk = (combo) => riskFrom(opponents, combo);
  const safe = (combo) => risk(combo) <= w.safeAt;

  const danger = opponents.filter((o) => o.count <= w.blockAt);
  const dangerMin = danger.length ? Math.min(...danger.map((o) => o.count)) : Infinity;
  const dangerRisk = (combo) => (danger.length ? riskFrom(danger, combo) : 0);

  // 2. Тэргүүлж байхад: энэ нүүдэл БА үлдсэн гар хоёулаа дийлэгдэхгүй бол
  //    хоёр нүүдлээр БАТАЛГААТАЙ дуусна — өөр юу ч бодох хэрэггүй.
  if (leading) {
    for (const combo of moves) {
      const ids = new Set(combo.cards.map((c) => c.id));
      const rest = detect(hand.filter((c) => !ids.has(c.id)));
      if (rest && safe(combo) && safe(rest)) return { forced: combo };
    }
  }

  const scored = moves.map((combo) => {
    const mask = planner.maskOf(combo.cards);
    const after = planner.minPlays(planner.fullMask & ~mask);
    const ids = new Set(combo.cards.map((c) => c.id));
    const rest = hand.filter((c) => !ids.has(c.id));

    // Гол хэмжүүр: энэ нүүдлийн дараа хэдэн нүүдэл үлдэх вэ
    let score = after * w.plan;
    // Үеийн оноо нь ҮЛДСЭН ХӨЗРИЙН тоо — олноор гаргах нь ашигтай
    score += rest.length * w.cards;
    // Төлөвлөгөө урагшлахгүй байвал нэмэлт шийтгэл
    if (after >= basePlays) score += w.planBreak;
    // Ширээ буцааж авах нөөцөө хадгал
    score -= controlCount(rest, info) * w.control;
    // Тэнцвэл сул хөзрөө эхэлж гарга
    score += topValue(combo) * w.top;

    const closest = opponents.length ? Math.min(...opponents.map((o) => o.count)) : Infinity;
    const noPressure = closest > w.holdAbove && hand.length > w.rushAt;
    if (isBomb(combo) && noPressure) score += w.wasteBomb;
    else if (hasTwo(combo) && combo.size <= 2 && noPressure) score += w.wasteTwo;

    if (leading) {
      score -= combo.size * w.leadSize;
      if (safe(combo)) score -= w.unbeatable;
      if (w.leadRisk) score += risk(combo) * w.leadRisk;

      if (dangerMin !== Infinity) {
        if (combo.size > dangerMin) {
          // Түүний гарын хөзрөөс ОЛОН хөзөр гаргавал тэр хариулж ч,
          // хөзрөө хаяж ч чадахгүй — хамгийн хямд, найдвартай хаалт.
          score -= w.shutout;
        } else {
          // Дийлж чадах юм өгөх нь түүнд ширээг бэлэглэсэнтэй адил
          score += dangerRisk(combo) * w.dangerLead;
        }
      }
    } else {
      score += combo.size * w.followSize;
      // Дагаж байхад: аюултай хүн үүнийг дийлж чадвал хаалт болохгүй
      if (dangerMin !== Infinity) score += dangerRisk(combo) * w.dangerBeat;
    }

    return { combo, after, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return { scored, leading, basePlays, info, opponents, dangerMin, handSize: hand.length };
}

/** Хүчтэй түвшин — эвристик үнэлгээний тэргүүнийг шууд сонгоно (хурдан). */
function chooseHard(game, index, moves, w = WEIGHTS) {
  const ranked = rankHard(game, index, moves, w);
  if (ranked.forced) return ranked.forced;

  const best = ranked.scored[0];
  if (!ranked.leading && w.allowPass && shouldPass(best, { ...ranked, w, game })) return null;
  return best.combo;
}

/* ── Мастер түвшин: эвристик + тоглуулж үзэх хайлт ── */

/**
 * Эвристик нь хэдэн арван нүүдлээс сайхныг нь ялгаж чадах ч, хоорондоо
 * ойролцоо хувилбаруудыг ЯЛГАЖ чаддаггүй. Тиймээс эвристикээр шигшсэн
 * цөөн нүүдлийг өрсөлдөгчийн боломжит гарууд дээр үнэхээр тоглуулж үзнэ.
 */
function chooseExpert(game, index, moves, w = WEIGHTS, options = {}) {
  const ranked = rankHard(game, index, moves, w);
  if (ranked.forced) return ranked.forced;

  const width = Math.max(2, options.width ?? w.searchWidth);
  const candidates = ranked.scored.slice(0, width).map((entry) => entry.combo);
  // Пасс нь бас бодит сонголт — хайлтад заавал оруулна
  if (!ranked.leading) candidates.push(null);
  if (candidates.length < 2) return candidates[0] ?? null;

  const { move } = searchMove(
    game,
    index,
    candidates,
    { unseen: ranked.info.cards, opponents: ranked.opponents, policy: fastPolicy },
    { worlds: options.worlds ?? w.searchWorlds, ms: options.ms ?? w.searchMs },
  );
  return move;
}

/**
 * ПАСС хийх нь гарт хөзөр үлдээдэг тул энэ дүрмээр ҮНДСЭНДЭЭ АЛДАГДАЛТАЙ.
 * Тиймээс зөвхөн хоёр шалтгаанаар пасс хийнэ:
 *   • дийлэхийн тулд 2 эсвэл бомбоо үрэх шаардлагатай, бас яаралтай биш
 *   • дийлэх нь төлөвлөгөөг муудуулж, нүүдлийн тоог нэмэгдүүлж байна
 */
function shouldPass(best, ctx) {
  const { w, basePlays, handSize, dangerMin } = ctx;

  if (handSize <= w.rushAt) return false; // өөрөө дуусах шахсан — зогсохгүй
  if (dangerMin <= w.blockAt && mustTakeLead(ctx)) return false; // заавал хаана
  if (best.after < basePlays) return false; // төлөвлөгөө сайжирч байна — үнэгүй ашиг

  // Бомб болон 2 бол цөөхөн бөгөөд орлуулшгүй — тэднийг үргэлж хамгаална
  if (isBomb(best.combo)) return true;
  if (hasTwo(best.combo) && best.combo.size <= 2 && dangerMin > w.blockAt) return true;

  // Харин "төлөвлөгөө муудлаа" гэсэн шалтгаанаар пасс хийх нь зөвхөн гар
  // ЖИЖИГ үед ашигтай. Олон хөзөртэй байхад хөзөр барих нь ×2 (10-12) ба
  // ×3 (13) үржүүлэгч рүү ойртуулдаг тул хаясан нь дээр.
  if (best.after > basePlays && handSize <= w.passBelow) return true;
  return false;
}

/**
 * Бүгд пасс хийвэл ширээг эзэмшигч нь ДАХИН тэргүүлнэ. Тэр нь дуусах
 * шахсан хүн бол ямар ч үнээр ширээг булаах ёстой.
 */
function mustTakeLead(ctx) {
  const owner = ctx.opponents.find((o) => o.seat === ctx.game.tableOwner);
  return Boolean(owner && owner.count <= ctx.w.blockAt);
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

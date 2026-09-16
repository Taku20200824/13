// Тодорхойгүй мэдээлэлтэй хайлт — "expert" түвшний тархи.
//
// Асуудал: 13-ын тоглоомд өрсөлдөгчийн гар ХАРАГДДАГГҮЙ. Тиймээс энгийн
// minimax хайлт хийх боломжгүй.
//
// Шийдэл (determinized Monte-Carlo): өрсөлдөгчийн гарыг мэдэгдэж буй
// бүх мэдээлэлд НИЙЦҮҮЛЭН олон янзаар ТААМАГЛАЖ тавиад, нүүдэл бүрийг
// тэр "ертөнц" бүрд үе дуустал нь тоглуулж үзнэ. Дунджаар хамгийн бага
// оноо авчрах нүүдлийг сонгоно.
//
// Гол хоёр нарийн ажиллагаа:
//   1. Таамаглал нь ЗӨВХӨН нийцтэй байх ёстой. Пасс хийсэн хүнд түүнийг
//      дийлэх хөзөр тараах нь утгагүй — тийм ертөнцийг голно.
//   2. Нүүдэл бүрийг ЯГ ижил ертөнцүүд дээр жишнэ (common random numbers).
//      Ингэснээр харьцуулалтын шуугиан огцом буурч, цөөн давталтаар
//      найдвартай дүгнэлт гарна.

import { play, pass, PHASE } from "./game.js";
import { roundPoints } from "./scoring.js";
import { cardValue, sortByValue, STRAIGHT_RANKS } from "./cards.js";
import { detect, beats, enumeratePlays } from "./rules.js";

/** Байрлалаас тогтмол үр гаргана — ижил байрлалд ижил шийдвэр гарна. */
function positionSeed(game, index) {
  let hash = 0x811c9dc5;
  const mix = (value) => {
    hash ^= value >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  mix(game.round ?? 0);
  mix(index);
  mix(game.turn ?? 0);
  mix((game.played ?? []).length);
  for (const card of game.players[index].hand) {
    for (let i = 0; i < card.id.length; i += 1) mix(card.id.charCodeAt(i));
  }
  return hash >>> 0;
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

function shuffled(cards, rand) {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Таамагласан гар нь тухайн хүний ӨМНӨХ ПАСС-тай зөрчилдөж байна уу?
 *
 * Хэрэв тэр X хослолыг дийлж чадаагүй бол гарт нь X-ийг дийлэх хослол
 * БАЙЖ БОЛОХГҮЙ. 5 хөзрийн шалгалт хэт үнэтэй тул алгасна — 1-3 хөзрийн
 * хослол нь нүүдлийн дийлэнхийг эзэлдэг тул үр нөлөө нь хангалттай.
 */
function contradicts(hand, declined) {
  if (!declined) return false;
  for (const size of [1, 2, 3]) {
    const combo = declined[size];
    if (!combo) continue;
    if (enumeratePlays(hand, combo, null).length > 0) return true;
  }
  return false;
}

/**
 * Нэг "ертөнц" үүсгэнэ: үзэгдээгүй хөзрүүдийг өрсөлдөгчдийн МЭДЭГДЭЖ БУЙ
 * тоогоор нь тарааж, нийцгүй хуваарилалтыг хэдэн удаа дахин оролдоно.
 */
function sampleWorld(game, unseen, opponents, rand, retries = 6) {
  let best = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const pool = shuffled(unseen, rand);
    const hands = [];
    let at = 0;
    let ok = true;
    for (const opponent of opponents) {
      const hand = pool.slice(at, at + opponent.count);
      at += opponent.count;
      hands.push(hand);
      if (contradicts(hand, opponent.declined)) ok = false;
    }
    best = hands;
    if (ok) break; // нийцтэй ертөнц олдлоо
  }
  return best;
}

/**
 * Тоглоомын төлөвийг хуулбарлана — rollout нь эхийг ХЭЗЭЭ Ч өөрчилж болохгүй.
 *
 * `declined`-ыг заавал СУУДАЛ ТУС БҮРЭЭР нь хуулна. Өмнө нь заагчийг нь
 * дамжуулаад байсан тул rollout доторх пасс бүр ЖИНХЭНЭ тоглоомын санамж
 * руу бичигдэж, online горимд Firestore-д эвдэрсэн төлөв очих байлаа.
 */
function cloneGame(game) {
  const declined = {};
  for (const [seat, bySize] of Object.entries(game.declined ?? {})) declined[seat] = { ...bySize };
  return {
    ...game,
    players: game.players.map((p) => ({ ...p, hand: [...p.hand] })),
    passed: new Set(game.passed),
    declined,
    played: [...(game.played ?? [])],
    log: [],
  };
}

/**
 * Үеийг дуустал нь тоглоно. Бүх тоглогч ижил бодлого ашиглана —
 * хурдан байх нь чухал тул энгийн түвшний логикийг хэрэглэнэ.
 */
function rollout(world, index, policy) {
  for (let guard = 0; guard < 300 && world.phase === PHASE.PLAYING; guard += 1) {
    const seat = world.turn;
    const move = policy(world, seat);
    const result = move ? play(world, seat, move.cards) : pass(world, seat);
    if (!result.ok) {
      // Бодлого буруу нүүдэл санал болговол пасс руу шилжинэ. Пасс ч
      // болохгүй бол (ширээ цэвэрхэн) хамгийн хямд нүүдлийг тавина.
      if (pass(world, seat).ok) continue;
      const fallback = enumeratePlays(world.players[seat].hand, world.table, null)[0];
      if (!fallback || !play(world, seat, fallback.cards).ok) break;
    }
  }
  return roundPoints(world.players[index].hand.length).points;
}

/**
 * Нэр дэвшсэн нүүдлүүдийг ертөнц бүр дээр тоглуулж жишнэ.
 *
 * @param {object} game     одоогийн байрлал (өрсөлдөгчийн гар нуугдмал)
 * @param {number} index    миний суудал
 * @param {Array}  candidates  шалгах нүүдлүүд; `null` = пасс
 * @param {object} deps     { unseen, opponents, policy }
 * @param {object} budget   { worlds }
 * @returns {{move: object|null, table: Array}}
 */
export function searchMove(game, index, candidates, deps, budget = {}) {
  const worlds = Math.max(1, budget.worlds ?? 16);
  const rand = mulberry32(positionSeed(game, index));
  const totals = candidates.map(() => 0);

  // Утсан дээр нэг нүүдэл хэдэн секунд бодох нь болохгүй. Хугацаа
  // дуусвал хэдэн ертөнц дуусгасан тэр хэмжээгээрээ шийдвэрээ гаргана
  // (дор хаяж 4 — эс бөгөөс харьцуулалт утгагүй болно).
  const stopAt = budget.ms ? Date.now() + budget.ms : null;
  let done = 0;

  for (let w = 0; w < worlds; w += 1) {
    if (stopAt && done >= 4 && Date.now() > stopAt) break;
    done += 1;
    const hands = sampleWorld(game, deps.unseen, deps.opponents, rand);

    // ЯГ ижил ертөнц дээр бүх нэр дэвшигчийг жишнэ
    for (let c = 0; c < candidates.length; c += 1) {
      const world = cloneGame(game);
      deps.opponents.forEach((opponent, i) => {
        world.players[opponent.seat].hand = sortByValue(hands[i]);
      });

      const candidate = candidates[c];
      const applied = candidate ? play(world, index, candidate.cards) : pass(world, index);
      if (!applied.ok) {
        totals[c] += 1e6; // хүчингүй нүүдэл — хэзээ ч сонгогдохгүй
        continue;
      }
      totals[c] += world.phase === PHASE.PLAYING ? rollout(world, index, deps.policy) : 0;
    }
  }

  let bestIndex = 0;
  for (let c = 1; c < candidates.length; c += 1) {
    if (totals[c] < totals[bestIndex]) bestIndex = c;
  }
  return {
    move: candidates[bestIndex],
    worlds: done,
    table: candidates.map((combo, c) => ({ combo, score: totals[c] / done })),
  };
}

/* ══════════════════════════════════════════════════
   Rollout-ын хурдан бодлого
   ══════════════════════════════════════════════════ */

// `enumeratePlays` нь БҮХ хувилбарыг гаргадаг тул 13 хөзөртэй гарт
// C(13,5)=1287 дэд олонлог шалгана — нэг rollout-д 50 удаа дуудахад
// хайлт хэдэн зуун мс идэж орхино. Rollout-д тийм нарийвчлал хэрэггүй:
// төрөл тус бүрээс ХАМГИЙН СУЛ төлөөлөгчийг л үзвэл хангалттай.

function cheapCandidates(hand, previous) {
  const sorted = sortByValue(hand);
  const byRank = new Map();
  const bySuit = new Map();
  for (const card of sorted) {
    if (!byRank.has(card.rank)) byRank.set(card.rank, []);
    byRank.get(card.rank).push(card);
    if (!bySuit.has(card.suit)) bySuit.set(card.suit, []);
    bySuit.get(card.suit).push(card);
  }

  const out = [];
  const size = previous ? previous.size : null;
  const add = (cards) => {
    const combo = detect(cards);
    if (combo && beats(combo, previous)) out.push(combo);
  };

  if (!size || size === 1) for (const card of sorted) add([card]);
  if (!size || size === 2) for (const g of byRank.values()) if (g.length >= 2) add(g.slice(0, 2));
  if (!size || size === 3) for (const g of byRank.values()) if (g.length >= 3) add(g.slice(0, 3));

  if (!size || size === 5) {
    // Страйт: цонх бүрээс ранк тус бүрийн ХАМГИЙН СУЛ хөзрийг авна
    for (let i = 0; i + 4 < STRAIGHT_RANKS.length; i += 1) {
      const pick = [];
      for (let k = 0; k < 5; k += 1) {
        const g = byRank.get(STRAIGHT_RANKS[i + k]);
        if (!g) break;
        pick.push(g[0]);
      }
      if (pick.length === 5) add(pick);
    }
    // Флаш: өнгө бүрийн хамгийн сул 5
    for (const g of bySuit.values()) if (g.length >= 5) add(g.slice(0, 5));
    // Фүл хаус ба покер
    for (const [rank, three] of byRank) {
      if (three.length >= 3) {
        for (const [other, two] of byRank) {
          if (other !== rank && two.length >= 2) {
            add([...three.slice(0, 3), ...two.slice(0, 2)]);
            break;
          }
        }
      }
      if (three.length >= 4) {
        const spare = sorted.find((c) => c.rank !== rank);
        if (spare) add([...three.slice(0, 4), spare]);
      }
    }
  }
  return out;
}

/**
 * Rollout-ын бодлого: хамгийн олон хөзөр гаргах, тэнцвэл хамгийн сул
 * хослолыг сонгоно. Хүчтэй хөзрөө гар том байхад хэмнэнэ.
 */
export function fastPolicy(game, index) {
  const hand = game.players[index].hand;
  const moves = cheapCandidates(hand, game.table);
  if (!moves.length) return null;

  const finisher = moves.find((m) => m.size === hand.length);
  if (finisher) return finisher;

  let best = null;
  let bestCost = Infinity;
  for (const combo of moves) {
    const top = cardValue(combo.cards[combo.cards.length - 1]);
    let cost = top - combo.size * 14;
    if (!game.table) cost -= combo.size * 8;
    if (hand.length > 5 && combo.cards.some((c) => c.rank === "2")) cost += 40;
    if (cost < bestCost) {
      bestCost = cost;
      best = combo;
    }
  }
  return best;
}

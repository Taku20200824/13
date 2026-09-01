// Хослол таних ба харьцуулах — Монгол дүрэм
import {
  RANKS,
  cardValue,
  rankOrder,
  straightOrder,
  suitOrder,
  sortByValue,
  cardLabel,
} from "./cards.js";

/** 5 хөзрийн хослолуудын хоорондын эрэмбэ. Тоо нь их байх тусам хүчтэй. */
export const CATEGORY = {
  STRAIGHT: 1,
  FLUSH: 2,
  FULL_HOUSE: 3,
  POKER: 4,
  STRAIGHT_FLUSH: 5,
};

export const COMBO_NAMES = {
  single: "нэг",
  pair: "хос",
  set: "сет",
  straight: "страйт",
  flush: "флаш",
  fullHouse: "фүл хаус",
  poker: "покер",
  straightFlush: "страйт флаш",
  royalFlush: "рояал флаш",
};

const groupByRank = (cards) => {
  const map = new Map();
  for (const card of cards) {
    if (!map.has(card.rank)) map.set(card.rank, []);
    map.get(card.rank).push(card);
  }
  return map;
};

/** Тоогоор нь буурахаар эрэмбэлсэн жагсаалт — флаш харьцуулахад хэрэглэнэ. */
const descendingRanks = (cards) => cards.map((c) => rankOrder(c.rank)).sort((a, b) => b - a);

function detectStraight(cards) {
  const orders = cards.map((c) => straightOrder(c.rank)).sort((a, b) => a - b);
  if (new Set(orders).size !== 5) return null;
  for (let i = 1; i < orders.length; i += 1) {
    if (orders[i] !== orders[i - 1] + 1) return null;
  }
  const headOrder = orders[orders.length - 1];
  const head = cards.find((c) => straightOrder(c.rank) === headOrder);
  return { headOrder, head };
}

/**
 * Хөзрийн массивыг хослол болгон танина. Танихгүй бол null.
 * Буцаах утга: { type, size, category, cards, label }
 */
export function detect(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  const sorted = sortByValue(cards);
  const base = (type, extra) => ({
    type,
    size: sorted.length,
    cards: sorted,
    label: `${COMBO_NAMES[type]} (${sorted.map(cardLabel).join(" ")})`,
    ...extra,
  });

  if (sorted.length === 1) return base("single");

  const groups = groupByRank(sorted);

  if (sorted.length === 2) {
    return groups.size === 1 ? base("pair") : null;
  }
  if (sorted.length === 3) {
    return groups.size === 1 ? base("set") : null;
  }
  if (sorted.length !== 5) return null;

  const sizes = [...groups.values()].map((g) => g.length).sort((a, b) => b - a);
  const isFlush = new Set(sorted.map((c) => c.suit)).size === 1;
  const straight = detectStraight(sorted);

  if (straight && isFlush) {
    const royal = straight.head.rank === "A";
    return base(royal ? "royalFlush" : "straightFlush", {
      category: CATEGORY.STRAIGHT_FLUSH,
      headOrder: straight.headOrder,
      head: straight.head,
    });
  }
  if (sizes[0] === 4) {
    const quadRank = [...groups.entries()].find(([, g]) => g.length === 4)[0];
    return base("poker", { category: CATEGORY.POKER, keyRank: rankOrder(quadRank) });
  }
  if (sizes[0] === 3 && sizes[1] === 2) {
    const tripleRank = [...groups.entries()].find(([, g]) => g.length === 3)[0];
    return base("fullHouse", { category: CATEGORY.FULL_HOUSE, keyRank: rankOrder(tripleRank) });
  }
  if (isFlush) {
    return base("flush", { category: CATEGORY.FLUSH, ranks: descendingRanks(sorted) });
  }
  if (straight) {
    return base("straight", {
      category: CATEGORY.STRAIGHT,
      headOrder: straight.headOrder,
      head: straight.head,
    });
  }
  return null;
}

/** Ижил төрлийн хоёр хослолыг харьцуулна: 1 = a том, -1 = b том, 0 = тэнцүү. */
function compareSameShape(a, b) {
  const cmp = (x, y) => (x > y ? 1 : x < y ? -1 : 0);

  if (a.size !== 5) {
    if (a.type === "set") return cmp(rankOrder(a.cards[0].rank), rankOrder(b.cards[0].rank));
    // нэг ба хос: хамгийн том хөзрөөр (тоо → өнгө)
    const top = (combo) => cardValue(combo.cards[combo.cards.length - 1]);
    return cmp(top(a), top(b));
  }

  if (a.category !== b.category) return cmp(a.category, b.category);

  switch (a.category) {
    case CATEGORY.STRAIGHT:
    case CATEGORY.STRAIGHT_FLUSH: {
      if (a.headOrder !== b.headOrder) return cmp(a.headOrder, b.headOrder);
      return cmp(suitOrder(a.head.suit), suitOrder(b.head.suit));
    }
    case CATEGORY.FLUSH: {
      // зөвхөн тоогоор — дээдээс нь доош
      for (let i = 0; i < 5; i += 1) {
        if (a.ranks[i] !== b.ranks[i]) return cmp(a.ranks[i], b.ranks[i]);
      }
      return 0; // ижил тоотой флаш — өнгө хамаагүй тул тэнцүү
    }
    case CATEGORY.FULL_HOUSE:
    case CATEGORY.POKER:
      return cmp(a.keyRank, b.keyRank);
    default:
      return 0;
  }
}

/**
 * candidate нь previous дээр тавигдаж болох уу?
 * previous === null бол ширээ цэвэрхэн — ямар ч хүчинтэй хослол болно.
 */
export function beats(candidate, previous) {
  if (!candidate) return false;
  if (!previous) return true;
  if (candidate.size !== previous.size) return false;
  return compareSameShape(candidate, previous) > 0;
}

/** Яагаад болохгүйг хэрэглэгчид ойлгуулах мессеж. */
export function rejectReason(cards, previous) {
  const combo = detect(cards);
  if (!combo) {
    if (cards.length === 4) return "4 хөзрийн хослол байхгүй. Покер бол 4 ижил + 1 = 5 хөзөр.";
    if (cards.length > 5) return "Хамгийн ихдээ 5 хөзөр тавина.";
    return "Энэ хослол дүрэмд нийцэхгүй байна.";
  }
  if (!previous) return null;
  if (combo.size !== previous.size) {
    return `Ширээн дээр ${previous.size} хөзөр байна — мөн ${previous.size} хөзөр тавина.`;
  }
  if (compareSameShape(combo, previous) <= 0) {
    return `${previous.label}-аас том байх ёстой.`;
  }
  return null;
}

export { compareSameShape };

/** Гараас тавьж болох бүх хүчинтэй хослолыг олно (bot болон зөвлөмжид). */
export function enumeratePlays(hand, previous, requiredCardId) {
  const results = [];
  const push = (cards) => {
    const combo = detect(cards);
    if (!combo) return;
    if (requiredCardId && !cards.some((c) => c.id === requiredCardId)) return;
    if (!beats(combo, previous)) return;
    results.push(combo);
  };
  const sizes = previous ? [previous.size] : [1, 2, 3, 5];
  const sorted = sortByValue(hand);

  for (const size of sizes) {
    combinations(sorted, size, push);
  }
  return results;
}

function combinations(items, size, visit) {
  if (size > items.length) return;
  const pick = [];
  const walk = (start) => {
    if (pick.length === size) return visit([...pick]);
    // үлдсэн хөзөр хүрэлцэхгүй бол таслах
    if (items.length - start < size - pick.length) return;
    for (let i = start; i < items.length; i += 1) {
      pick.push(items[i]);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
}

export { RANKS };

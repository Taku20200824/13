// Bot player logic.
//
// normal: cheap/simple move choice.
// hard: plans the hand with exact bitmask DP, counts unseen cards, protects made
// combos, reacts to low-card opponents, and uses power cards only when useful.

import { enumeratePlays, detect, beats, CATEGORY } from "./rules.js";
import { cardValue, rankOrder, makeDeck, STRAIGHT_RANKS } from "./cards.js";

export const DIFFICULTY = { NORMAL: "normal", HARD: "hard" };

export const WEIGHTS = {
  planBreak: 140,
  topWeight: 0.35,
  strongHold: 90,
  leadSize: 6,
  followSize: 4,
  unbeatable: 45,
  blockAt: 2,
  rushAt: 4,
  cardWeight: 20,
  pressure: 34,
  control: 58,
  breakPair: 44,
  breakSet: 68,
  breakFive: 36,
  fiveCardPlan: 24,
  highSingleLead: 42,
  cheapBeat: 26,
  passBadTrade: 1,
  allowPass: 1,
};

const isBomb = (combo) => combo.category >= CATEGORY.POKER;
const topValue = (combo) => cardValue(combo.cards[combo.cards.length - 1]);
const hasTwo = (combo) => combo.cards.some((c) => c.rank === "2");

function rankCounts(cards) {
  const counts = new Map();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  return counts;
}

function minOpponentCards(players) {
  const counts = players.map((p) => p.handCount ?? p.hand.length).filter((n) => Number.isFinite(n));
  return counts.length ? Math.min(...counts) : Infinity;
}

function nextOpponentCards(game, index) {
  for (let step = 1; step < game.players.length; step += 1) {
    const next = (index + step) % game.players.length;
    const player = game.players[next];
    if (!player.eliminated) return player.handCount ?? player.hand.length;
  }
  return Infinity;
}

function opponentPressure(game, index, opponents) {
  const minCards = minOpponentCards(opponents);
  const nextCards = nextOpponentCards(game, index);
  if (minCards <= 1) return 3;
  if (minCards <= 2 || nextCards <= 2) return 2;
  if (minCards <= 4) return 1;
  return 0;
}

function breaksMadeCombo(combo, hand, madeFiveCardIds) {
  const counts = rankCounts(hand);
  const usedCounts = rankCounts(combo.cards);
  let penalty = 0;

  for (const [rank, used] of usedCounts) {
    const count = counts.get(rank) ?? 0;
    if (combo.size === 1 && count >= 2) penalty += count >= 3 ? 2 : 1;
    if (combo.size === 2 && count >= 3 && used < count) penalty += 2;
  }

  if (combo.size < 5 && madeFiveCardIds?.size) {
    if (combo.cards.some((card) => madeFiveCardIds.has(card.id))) penalty += 1;
  }
  return penalty;
}

function beatRisk(combo, unseen) {
  const top = topValue(combo);
  if (combo.size === 1) return unseen.filter((card) => cardValue(card) > top).length;

  if (combo.size === 2 || combo.size === 3) {
    const counts = rankCounts(unseen);
    const myRank = rankOrder(combo.cards[0].rank);
    let risk = 0;
    for (const [rank, count] of counts) {
      if (count >= combo.size && rankOrder(rank) > myRank) risk += 1;
    }
    return risk;
  }

  return beatable(combo, unseen) ? 2 : 0;
}

function shouldSavePower(combo, handSize, pressure) {
  if (pressure >= 2 || handSize <= 5) return false;
  return hasTwo(combo) || isBomb(combo);
}

function createPlanner(hand) {
  const n = hand.length;
  const combos = allCombos(hand);
  const byLowest = Array.from({ length: n }, () => []);
  for (const entry of combos) byLowest[lowestBit(entry.mask)].push(entry);

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
      if (best === 1) break;
    }
    memo.set(mask, best);
    return best;
  }

  const fullMask = (1 << n) - 1;
  const index = new Map(hand.map((c, i) => [c.id, i]));

  return {
    hand,
    combos,
    fullMask,
    minPlays,
    maskOf(cards) {
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

function allCombos(hand) {
  const out = [];
  const idx = new Map(hand.map((c, i) => [c.id, i]));
  const maskOf = (cards) => cards.reduce((m, c) => m | (1 << idx.get(c.id)), 0);
  const add = (cards) => {
    const combo = detect(cards);
    if (combo) out.push({ mask: maskOf(cards), combo });
  };

  const byRank = new Map();
  for (const card of hand) {
    if (!byRank.has(card.rank)) byRank.set(card.rank, []);
    byRank.get(card.rank).push(card);
  }

  const bySuit = new Map();
  for (const card of hand) {
    if (!bySuit.has(card.suit)) bySuit.set(card.suit, []);
    bySuit.get(card.suit).push(card);
  }

  for (const cards of byRank.values()) {
    for (const card of cards) add([card]);
    forEachSubset(cards, 2, add);
    forEachSubset(cards, 3, add);
  }

  for (let i = 0; i + 4 < STRAIGHT_RANKS.length; i += 1) {
    const groups = [];
    let ok = true;
    for (let k = 0; k < 5; k += 1) {
      const group = byRank.get(STRAIGHT_RANKS[i + k]);
      if (!group) {
        ok = false;
        break;
      }
      groups.push(group);
    }
    if (ok) cartesian(groups, add);
  }

  for (const cards of bySuit.values()) {
    if (cards.length >= 5) forEachSubset(cards, 5, add);
  }

  for (const [rank, three] of byRank) {
    if (three.length < 3) continue;
    for (const [rank2, two] of byRank) {
      if (rank2 === rank || two.length < 2) continue;
      forEachSubset(three, 3, (t) => forEachSubset(two, 2, (p) => add([...t, ...p])));
    }
  }

  for (const [rank, four] of byRank) {
    if (four.length < 4) continue;
    for (const card of hand) {
      if (card.rank === rank) continue;
      add([...four, card]);
    }
  }

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

function unseenCards(game, index) {
  const seen = new Set(game.played ?? []);
  for (const card of game.players[index].hand) seen.add(card.id);
  if (game.table) for (const card of game.table.cards) seen.add(card.id);
  return makeDeck().filter((card) => !seen.has(card.id));
}

function beatable(combo, unseen) {
  const top = topValue(combo);

  if (combo.size === 1) return unseen.some((card) => cardValue(card) > top);

  if (combo.size === 2 || combo.size === 3) {
    const counts = rankCounts(unseen);
    const myRank = rankOrder(combo.cards[0].rank);
    for (const [rank, count] of counts) {
      if (count < combo.size) continue;
      if (rankOrder(rank) > myRank) return true;
      if (combo.size === 2 && rankOrder(rank) === myRank) {
        const higher = unseen.filter((c) => c.rank === rank && cardValue(c) > top);
        if (higher.length >= 1 && count >= 2) return true;
      }
    }
    return false;
  }

  if (combo.type === "royalFlush") return false;
  if (combo.category >= CATEGORY.STRAIGHT_FLUSH) return false;
  if (combo.category === CATEGORY.POKER) {
    const counts = rankCounts(unseen);
    const quad = combo.cards.find((card, _, arr) => arr.filter((x) => x.rank === card.rank).length === 4);
    const myRank = rankOrder(quad?.rank ?? combo.cards[0].rank);
    for (const [rank, count] of counts) {
      if (count === 4 && rankOrder(rank) > myRank) return true;
    }
    return hasStraightFlushPotential(unseen);
  }
  return true;
}

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

export function chooseMove(game, index, options = {}) {
  const difficulty = options.difficulty ?? game.difficulty ?? DIFFICULTY.HARD;
  const player = game.players[index];
  const required = game.mustPlayStartingCard ? game.startingCardId : null;
  const moves = enumeratePlays(player.hand, game.table, required);
  if (moves.length === 0) return null;

  if (difficulty === DIFFICULTY.NORMAL) return chooseNormal(game, index, moves);
  return chooseHard(game, index, moves, options.weights ?? WEIGHTS);
}

function chooseNormal(game, index, moves) {
  const player = game.players[index];
  const handSize = player.hand.length;
  const opponents = game.players.filter((p, i) => i !== index && !p.eliminated);
  const urgent = minOpponentCards(opponents) <= 3;

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

function chooseHard(game, index, moves, w = WEIGHTS) {
  const player = game.players[index];
  const hand = player.hand;
  const planner = createPlanner(hand);
  const basePlays = planner.minPlays(planner.fullMask);

  const opponents = game.players.filter((p, i) => i !== index && !p.eliminated);
  const opponentMin = minOpponentCards(opponents);
  const pressure = opponentPressure(game, index, opponents);
  const unseen = unseenCards(game, index);
  const madeFiveCardIds = new Set(
    planner.combos
      .filter((entry) => entry.combo.size === 5 && entry.combo.category >= CATEGORY.FLUSH)
      .flatMap((entry) => entry.combo.cards.map((card) => card.id)),
  );

  const finisher = moves.find((m) => m.size === hand.length);
  if (finisher) return finisher;

  const leading = !game.table;
  const emergency = opponentMin <= 1;
  if (emergency) {
    const block = chooseEmergencyBlock(moves, planner, unseen, leading);
    if (block) return block;
  }

  const scored = moves.map((combo) => {
    const mask = planner.maskOf(combo.cards);
    const after = planner.minPlays(planner.fullMask & ~mask);
    const risk = beatRisk(combo, unseen);
    const controlMove = risk === 0;
    let score = after * 100;

    score += (hand.length - combo.size) * w.cardWeight;
    if (after >= basePlays) score += w.planBreak;
    score += topValue(combo) * w.topWeight;

    const breakPenalty = breaksMadeCombo(combo, hand, madeFiveCardIds);
    score += breakPenalty * (combo.size === 1 ? w.breakPair : w.breakSet);
    if (combo.size < 5 && madeFiveCardIds.size) score += breakPenalty * w.breakFive;
    if (combo.size === 5 && after <= basePlays - 1) score -= (combo.category ?? 1) * w.fiveCardPlan;

    const strong = hasTwo(combo) || isBomb(combo);
    if (shouldSavePower(combo, hand.length, pressure)) score += w.strongHold;

    if (pressure > 0) {
      score -= combo.size * pressure * w.pressure;
      if (controlMove) score -= pressure * w.control;
      if (!leading && !strong) score -= w.cheapBeat * pressure;
    }

    if (leading) {
      if (controlMove) score -= w.unbeatable + w.control;
      score -= combo.size * w.leadSize;
      if (combo.size === 1 && rankOrder(combo.cards[0].rank) >= rankOrder("K") && hand.length > 5 && pressure === 0) {
        score += w.highSingleLead;
      }
    } else {
      score += combo.size * w.followSize;
      score += risk * 3;
    }

    return { combo, score, after };
  });

  scored.sort((a, b) => a.score - b.score || comboRank(a.combo) - comboRank(b.combo));
  const best = scored[0];

  if (!leading && w.allowPass && shouldPass(best, basePlays, opponentMin, hand.length, pressure, w)) return null;
  return best.combo;
}

function chooseEmergencyBlock(moves, planner, unseen, leading) {
  const scored = moves.map((combo) => {
    const mask = planner.maskOf(combo.cards);
    const after = planner.minPlays(planner.fullMask & ~mask);
    const risk = beatRisk(combo, unseen);
    const top = topValue(combo);
    let score = risk * 100 - top * 0.8 + after * 8;

    if (leading) {
      if (combo.size > 1) score -= 180 + combo.size * 18;
      if (combo.size === 1) score += 45;
      if (risk === 0) score -= 90;
    } else {
      if (risk === 0) score -= 120;
      if (combo.size === 1) score -= top * 0.5;
    }

    return { combo, score };
  });

  scored.sort((a, b) => a.score - b.score || topValue(b.combo) - topValue(a.combo));
  return scored[0]?.combo ?? null;
}

function shouldPass(best, basePlays, opponentMin, handSize, pressure, w) {
  if (opponentMin <= w.blockAt) return false;
  if (pressure > 0) return false;
  if (handSize <= w.rushAt) return false;
  if (best.after < basePlays) return false;
  if (hasTwo(best.combo) || isBomb(best.combo)) return true;
  return best.after > basePlays || (best.after === basePlays && best.score > basePlays * 100 + w.passBadTrade);
}

function comboRank(combo) {
  if (combo.size === 5) return combo.category ?? 0;
  return rankOrder(combo.cards[0].rank);
}

export function suggestMove(game, index) {
  return chooseMove(game, index, { difficulty: DIFFICULTY.HARD });
}

export function planSize(hand) {
  if (!hand.length) return 0;
  const planner = createPlanner(hand);
  return planner.minPlays(planner.fullMask);
}

export { beats };

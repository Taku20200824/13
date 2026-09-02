// Тоглоомын цөм — DOM-оос ангид, цэвэр төлөвийн машин.
// UI болон Firestore хоёулаа үүнийг ашиглана.
import { makeDeck, shuffle, sortByValue, cardValue } from "./cards.js";
import { detect, beats, rejectReason, COMBO_NAMES as COMBO_LABELS } from "./rules.js";
import { settleRound, ELIMINATION_SCORE } from "./scoring.js";

export const PHASE = {
  PLAYING: "playing",
  ROUND_END: "roundEnd",
  GAME_END: "gameEnd",
};

/**
 * @param {Array} playerDefs  суудал бүрийн тодорхойлолт (индекс = суудлын дугаар)
 * @param {{seed?:number, starterRule?:string, absent?:number[]}} options
 *        absent — хоосон суудлын дугаарууд. Тэдгээр нь хөзөр авахгүй,
 *        ээлж ч авахгүй. Индексийг гулсуулахгүйн тулд массиваас
 *        ХАСАХГҮЙ, зөвхөн идэвхгүй гэж тэмдэглэнэ.
 */
export function createGame(playerDefs, options = {}) {
  const absent = new Set(options.absent ?? []);
  const game = {
    players: playerDefs.map((p, index) => ({
      index,
      id: p.id ?? `p${index}`,
      name: p.name ?? `Тоглогч ${index + 1}`,
      isBot: Boolean(p.isBot),
      hand: [],
      score: 0,
      eliminated: absent.has(index),
      absent: absent.has(index),
      lastAction: null, // { kind: "play" | "pass", label }
    })),
    round: 0,
    phase: PHASE.PLAYING,
    turn: 0,
    table: null, // сүүлд тавигдсан хослол
    tableOwner: null, // түүнийг тавьсан тоглогчийн index
    passed: new Set(),
    startingCardId: null,
    mustPlayStartingCard: false,
    log: [],
    lastRound: null,
    gameWinner: null,
    starterRule: options.starterRule ?? "previousWinner", // "lowest" | "previousWinner"
    previousRoundWinner: null,
  };
  startRound(game, options.seed);
  return game;
}

const activePlayers = (game) => game.players.filter((p) => !p.eliminated);

export function startRound(game, seed) {
  game.round += 1;
  game.phase = PHASE.PLAYING;
  game.table = null;
  game.tableOwner = null;
  game.passed = new Set();
  game.lastRound = null;
  game.players.forEach((p) => (p.lastAction = null));

  // Хоосон суудал үе бүрт идэвхгүй хэвээр
  game.players.forEach((p) => {
    if (p.absent) p.eliminated = true;
  });

  const active = activePlayers(game);
  const deck = shuffle(makeDeck(), seed);
  active.forEach((player, i) => {
    player.hand = sortByValue(deck.slice(i * 13, i * 13 + 13));
  });
  game.players.filter((p) => p.eliminated).forEach((p) => (p.hand = []));

  if (game.starterRule === "previousWinner" && game.previousRoundWinner !== null) {
    const winner = game.players[game.previousRoundWinner];
    if (winner && !winner.eliminated) {
      game.turn = winner.index;
      game.startingCardId = null;
      game.mustPlayStartingCard = false;
      log(game, `${winner.name} өмнөх үеийг түрүүлж дуусгасан тул эхэлнэ.`);
      return game;
    }
  }

  // Эхний үед хамгийн доод хөзөртэй тоглогч эхэлнэ.
  // 4 хүнтэй үед энэ нь 3♦ бөгөөд тэр тоглогч хүссэн хүчинтэй хослолоороо гарна.
  let lowest = null;
  for (const player of active) {
    for (const card of player.hand) {
      if (!lowest || cardValue(card) < cardValue(lowest.card)) {
        lowest = { card, index: player.index };
      }
    }
  }
  game.turn = lowest.index;
  game.startingCardId = lowest.card.id;
  game.mustPlayStartingCard = false;
  log(game, `${game.players[lowest.index].name} ${lowest.card.rank}${lowest.card.symbol}-тай тул эхэлнэ.`);
  return game;
}

const log = (game, text) => {
  game.log.push({ round: game.round, text });
  if (game.log.length > 60) game.log.shift();
};

/** Тухайн тоглогч энэ хөзрүүдийг тавьж болох эсэх. Болохгүй бол шалтгааныг буцаана. */
export function validatePlay(game, playerIndex, cards) {
  if (game.phase !== PHASE.PLAYING) return "Үе дууссан байна.";
  if (game.turn !== playerIndex) return "Таны ээлж биш байна.";
  if (!cards.length) return "Хөзөр сонгоно уу.";

  const hand = game.players[playerIndex].hand;
  if (!cards.every((c) => hand.some((h) => h.id === c.id))) return "Гарт байхгүй хөзөр байна.";

  if (game.mustPlayStartingCard && !cards.some((c) => c.id === game.startingCardId)) {
    const card = hand.find((c) => c.id === game.startingCardId);
    return `Эхний нүүдэлд ${card.rank}${card.symbol} заавал орно.`;
  }
  return rejectReason(cards, game.table);
}

export function play(game, playerIndex, cards) {
  const error = validatePlay(game, playerIndex, cards);
  if (error) return { ok: false, error };

  const player = game.players[playerIndex];
  const combo = detect(cards);
  const ids = new Set(cards.map((c) => c.id));
  player.hand = player.hand.filter((c) => !ids.has(c.id));

  game.table = combo;
  game.tableOwner = playerIndex;
  game.passed = new Set();
  game.mustPlayStartingCard = false;
  game.players.forEach((p) => {
    if (p.index !== playerIndex) p.lastAction = p.lastAction?.kind === "pass" ? p.lastAction : null;
  });
  player.lastAction = { kind: "play", label: COMBO_LABELS[combo.type] ?? combo.type, size: combo.size };
  log(game, `${player.name}: ${combo.label}`);

  if (player.hand.length === 0) {
    endRound(game, playerIndex);
    return { ok: true, combo, roundEnded: true };
  }

  advance(game);
  return { ok: true, combo, roundEnded: false };
}

export function pass(game, playerIndex) {
  if (game.phase !== PHASE.PLAYING) return { ok: false, error: "Үе дууссан байна." };
  if (game.turn !== playerIndex) return { ok: false, error: "Таны ээлж биш байна." };
  if (!game.table) return { ok: false, error: "Ширээ цэвэрхэн үед пасс хийж болохгүй." };

  game.passed.add(playerIndex);
  game.players[playerIndex].lastAction = { kind: "pass" };
  log(game, `${game.players[playerIndex].name} пасс`);
  advance(game);
  return { ok: true };
}

/**
 * Ээлжийг дараагийн тоглогч руу шилжүүлнэ.
 * Ширээ цэвэрлэгдэх нөхцөл: ширээ эзэмшигчээс бусад бүх идэвхтэй тоглогч пасс хийсэн.
 * ЧУХАЛ: цэвэрлэгдсэн тохиолдолд ээлж ширээ эзэмшигчид ӨӨРТ нь үлдэнэ.
 */
function advance(game) {
  const active = activePlayers(game);

  if (game.table !== null) {
    const others = active.filter((p) => p.index !== game.tableOwner);
    const allPassed = others.every((p) => game.passed.has(p.index));
    if (allPassed) {
      game.turn = game.tableOwner;
      game.table = null;
      game.tableOwner = null;
      game.passed = new Set();
      game.players.forEach((p) => {
        if (p.lastAction?.kind === "pass") p.lastAction = null;
      });
      log(game, `${game.players[game.turn].name} ширээг авч, шинээр эхэлнэ.`);
      return;
    }
  }

  let next = game.turn;
  for (let step = 0; step < game.players.length; step += 1) {
    next = (next + 1) % game.players.length;
    const player = game.players[next];
    if (player.eliminated) continue;
    if (game.passed.has(next)) continue;
    game.turn = next;
    return;
  }
  game.turn = game.tableOwner ?? game.turn;
}

function endRound(game, winnerIndex) {
  const winner = game.players[winnerIndex];
  const outcome = settleRound(
    game.players.map((p) => ({ ...p, id: p.index })),
    winnerIndex,
  );

  outcome.results.forEach((r) => {
    game.players[r.id].score = r.scoreAfter;
  });
  outcome.eliminated.forEach((index) => {
    game.players[index].eliminated = true;
    log(game, `${game.players[index].name} ${game.players[index].score} оноотой болж хасагдлаа.`);
  });

  game.previousRoundWinner = winnerIndex;
  game.lastRound = outcome;
  game.phase = outcome.gameWinner ? PHASE.GAME_END : PHASE.ROUND_END;
  game.gameWinner = outcome.gameWinner ? game.players[outcome.gameWinner.id] : null;
  log(game, `${winner.name} үеийг түрүүлж дуусгалаа.`);
  if (game.gameWinner) log(game, `🏆 ${game.gameWinner.name} тоглоомын ялагч боллоо!`);
}

export function nextRound(game, seed) {
  if (game.phase !== PHASE.ROUND_END) return game;
  return startRound(game, seed);
}

/* ── Firestore-д хадгалах / буцааж унших ────────── */

export function serializeGame(game) {
  return {
    players: game.players.map((p) => ({
      index: p.index,
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      handCount: p.hand.length,
      score: p.score,
      eliminated: p.eliminated,
      absent: Boolean(p.absent),
      lastAction: p.lastAction ?? null,
    })),
    round: game.round,
    phase: game.phase,
    turn: game.turn,
    table: game.table,
    tableOwner: game.tableOwner,
    passed: [...game.passed],
    startingCardId: game.startingCardId,
    mustPlayStartingCard: game.mustPlayStartingCard,
    log: game.log.slice(-20),
    lastRound: game.lastRound,
    gameWinner: game.gameWinner ? { id: game.gameWinner.id, name: game.gameWinner.name } : null,
    starterRule: game.starterRule,
    previousRoundWinner: game.previousRoundWinner,
  };
}

/**
 * hands: { [playerIndex]: card[] } — зөвхөн өөрийн гар бодитой.
 * Бусдын гарыг тоо нь таарсан "нүүр буруу" орлуулагчаар дүүргэнэ:
 * ээлж тооцох, оноо бодоход зөвхөн тоо нь л хэрэгтэй.
 */
export function deserializeGame(data, hands = {}) {
  const hidden = (count, index) =>
    Array.from({ length: count }, (_, i) => ({ id: `hidden-${index}-${i}`, hidden: true }));
  return {
    players: data.players.map((p) => ({
      ...p,
      hand: hands[p.index] ?? hidden(p.handCount ?? 0, p.index),
    })),
    round: data.round,
    phase: data.phase,
    turn: data.turn,
    table: data.table ?? null,
    tableOwner: data.tableOwner ?? null,
    passed: new Set(data.passed ?? []),
    startingCardId: data.startingCardId ?? null,
    mustPlayStartingCard: Boolean(data.mustPlayStartingCard),
    log: data.log ?? [],
    lastRound: data.lastRound ?? null,
    gameWinner: data.gameWinner ?? null,
    starterRule: data.starterRule ?? "previousWinner",
    previousRoundWinner: data.previousRoundWinner ?? null,
  };
}

export { ELIMINATION_SCORE, beats, detect };

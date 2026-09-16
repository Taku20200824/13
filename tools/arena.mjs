// Bot-ын хүчийг ХЭМЖИХ талбар. Тааварлахын оронд тоглуулж үзнэ.
//
//   node tools/arena.mjs --rounds 2000            (шинэ vs хуучин)
//   node tools/arena.mjs --games 200              (бүтэн тоглоом)
//   node tools/arena.mjs --rounds 2000 --a hard --b normal
//
// ЧУХАЛ: агент бүр зөвхөн ӨӨРИЙН гараа хардаг. Өрсөлдөгчийн гарыг
// онлайн горимтой яг адилхан "нүүр буруу" орлуулагчаар халхална —
// эс бөгөөс bot хууран мэхэлж, хэмжилт утгагүй болно.
import { createGame, play, pass, nextRound, PHASE } from "../js/game.js";
import { chooseMove as chooseNew, DIFFICULTY, WEIGHTS } from "../js/bot.js";
import { chooseMove as chooseOld } from "./bot-legacy.mjs";

/** Жин сольсон хувилбар — нэг өөрчлөлтийн үр нөлөөг тусад нь хэмжинэ. */
const tweak = (patch) => (game, i) =>
  chooseNew(game, i, { difficulty: DIFFICULTY.HARD, weights: { ...WEIGHTS, ...patch } });

const AGENTS = {
  new: (game, i) => chooseNew(game, i, { difficulty: DIFFICULTY.HARD }),
  expert: (game, i) => chooseNew(game, i, { difficulty: DIFFICULTY.EXPERT, ms: 0 }),
  expert8: (game, i) => chooseNew(game, i, { difficulty: DIFFICULTY.EXPERT, worlds: 8, ms: 0 }),
  expert32: (game, i) => chooseNew(game, i, { difficulty: DIFFICULTY.EXPERT, worlds: 32, ms: 0 }),
  nopass: tweak({ allowPass: 0 }),
  noblock: tweak({ shutout: 0, dangerLead: 0, dangerBeat: 0 }),
  nocontrol: tweak({ control: 0 }),
  nomodel: tweak({ __ignoreDeclined: true }),
  hard: (game, i) => chooseNew(game, i, { difficulty: DIFFICULTY.HARD }),
  normal: (game, i) => chooseNew(game, i, { difficulty: DIFFICULTY.NORMAL }),
  old: (game, i) => chooseOld(game, i, { difficulty: "hard" }),
  oldnormal: (game, i) => chooseOld(game, i, { difficulty: "normal" }),
};

/** Өрсөлдөгчийн хөзрийг халхалсан хуулбар — bot зөвхөн тоог нь мэднэ. */
function maskFor(game, index) {
  return {
    ...game,
    players: game.players.map((p, i) =>
      i === index
        ? p
        : {
            ...p,
            hand: Array.from({ length: p.hand.length }, (_, k) => ({
              id: `hidden-${i}-${k}`,
              hidden: true,
            })),
            handCount: p.hand.length,
          },
    ),
  };
}

const defs = ["A", "B", "C", "D"].map((n) => ({ id: n, name: n, isBot: true }));

/** Нэг үе тоглуулаад суудал тус бүрийн оноог буцаана. */
function playRound(seed, agents) {
  const game = createGame(defs, { seed });
  let guard = 0;
  while (game.phase === PHASE.PLAYING && guard < 800) {
    guard += 1;
    const i = game.turn;
    const move = agents[i](maskFor(game, i), i);
    const result = move ? play(game, i, move.cards) : pass(game, i);
    if (!result.ok) throw new Error(`seat ${i}: ${result.error}`);
  }
  if (!game.lastRound) return null;
  return game.lastRound.results;
}

/** Бүтэн тоглоом (30 оноогоор хасагдана) — ялагчийн суудлыг буцаана. */
function playGame(seed, agents) {
  const game = createGame(defs, { seed });
  let guard = 0;
  while (game.phase !== PHASE.GAME_END && guard < 20000) {
    guard += 1;
    if (game.phase === PHASE.ROUND_END) {
      nextRound(game, seed * 7919 + guard);
      continue;
    }
    const i = game.turn;
    const move = agents[i](maskFor(game, i), i);
    const result = move ? play(game, i, move.cards) : pass(game, i);
    if (!result.ok) throw new Error(`seat ${i}: ${result.error}`);
  }
  return game.phase === PHASE.GAME_END ? game.gameWinner.index : null;
}

/* ── Гүйлгэх ── */

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const aName = arg("a", "new");
const bName = arg("b", "old");
const a = AGENTS[aName];
const b = AGENTS[bName];
if (!a || !b) throw new Error(`агент олдсонгүй. Боломжит: ${Object.keys(AGENTS).join(", ")}`);

// Суудлын хазайлтыг БҮРЭН арилгана: 4 суудлаас 2-ыг сонгох 6 хувилбар
// бүгдийг эргүүлнэ. Ингэснээр тал бүр суудал бүрд яг тэнцүү тоглоно.
//
// ⚠ Өмнө нь 3 байрлал ашигласан нь 0-р суудлыг ҮРГЭЛЖ А талд үлдээж,
// ижил хоёр bot-ыг тулгахад +0.086 оноогоор "ялдаг" хуурамч зөрүү өгч байв.
const LAYOUTS = [
  [0, 0, 1, 1],
  [0, 1, 0, 1],
  [0, 1, 1, 0],
  [1, 0, 0, 1],
  [1, 0, 1, 0],
  [1, 1, 0, 0],
];

const stat = () => ({ points: 0, rounds: 0, roundWins: 0, gameWins: 0, games: 0 });
const tally = { [aName]: stat(), [bName]: stat() };
const label = (layout, seat) => (layout[seat] === 0 ? aName : bName);

/* ── Жин шүүрдэх: нэг түлхүүрийн утга бүрийг суурьтай нь тулгана ──
   node tools/arena.mjs --sweep safeAt=0.02,0.08,0.2 --rounds 1200      */
const sweep = arg("sweep", null);
if (sweep) {
  const [key, list] = sweep.split("=");
  const base = AGENTS[arg("b", "new")];
  console.log(`
  ${key} шүүрдэлт  (суурь: ${arg("b", "new")})
`);
  for (const raw of list.split(",")) {
    const value = Number(raw);
    const variant = tweak({ [key]: value });
    let mine = 0;
    let theirs = 0;
    let wins = 0;
    let seats = 0;
    for (let g = 0; g < Number(arg("rounds", 600)); g += 1) {
      const layout = LAYOUTS[g % LAYOUTS.length];
      const results = playRound(
        1_000_000 + Math.floor(g / LAYOUTS.length),
        layout.map((side) => (side === 0 ? variant : base)),
      );
      if (!results) continue;
      for (const r of results) {
        if (layout[r.id] === 0) {
          mine += r.points;
          seats += 1;
          if (r.isRoundWinner) wins += 1;
        } else theirs += r.points;
      }
    }
    const delta = theirs / seats - mine / seats;
    console.log(
      `  ${key}=${String(raw).padEnd(8)} оноо ${(mine / seats).toFixed(3)}` +
        `  (суурь ${(theirs / seats).toFixed(3)})  зөрүү ${delta >= 0 ? "+" : ""}${delta.toFixed(3)}` +
        `  түрүүлэлт ${((wins / seats) * 100).toFixed(1)}%`,
    );
  }
  console.log("");
  process.exit(0);
}

const roundCount = Number(arg("rounds", 0));
const gameCount = Number(arg("games", 0));
const t0 = Date.now();

if (roundCount) {
  for (let g = 0; g < roundCount; g += 1) {
    const layout = LAYOUTS[g % LAYOUTS.length];
    const agents = layout.map((side) => (side === 0 ? a : b));
    const results = playRound(1_000_000 + Math.floor(g / LAYOUTS.length), agents);
    if (!results) continue;
    for (const r of results) {
      const side = tally[label(layout, r.id)];
      side.points += r.points;
      side.rounds += 1;
      if (r.isRoundWinner) side.roundWins += 1;
    }
  }
}

if (gameCount) {
  for (let g = 0; g < gameCount; g += 1) {
    const layout = LAYOUTS[g % LAYOUTS.length];
    const agents = layout.map((side) => (side === 0 ? a : b));
    const winner = playGame(2_000_000 + Math.floor(g / LAYOUTS.length), agents);
    if (winner === null) continue;
    for (let seat = 0; seat < 4; seat += 1) tally[label(layout, seat)].games += 1;
    tally[label(layout, winner)].gameWins += 1;
  }
}

const pct = (x, n) => (n ? ((x / n) * 100).toFixed(1) : "—");
console.log(`\n  ${aName}  vs  ${bName}      (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
for (const [name, s] of Object.entries(tally)) {
  const parts = [`  ${name.padEnd(10)}`];
  if (s.rounds) {
    parts.push(
      `үеийн оноо/үе ${(s.points / s.rounds).toFixed(2)}`,
      `үе түрүүлэлт ${pct(s.roundWins, s.rounds)}%  (${s.roundWins}/${s.rounds})`,
    );
  }
  if (s.games) parts.push(`тоглоом ялалт ${pct(s.gameWins, s.games / 2)}%  (${s.gameWins})`);
  console.log(parts.join("   "));
}
console.log("");

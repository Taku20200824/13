// Мастер түвшний AI — өрсөлдөгчийн санамж, хаалт, тоглуулж үзэх хайлт.
import assert from "node:assert/strict";
import test from "node:test";
import { makeCard } from "../js/cards.js";
import { chooseMove, DIFFICULTY } from "../js/bot.js";
import {
  createGame,
  play,
  pass,
  serializeGame,
  deserializeGame,
  PHASE,
} from "../js/game.js";

const h = (...ids) => ids.map((id) => makeCard(id.slice(0, -1), id.slice(-1)));
const defs = ["A", "B", "C", "D"].map((n) => ({ id: n, name: n, isBot: true }));
const single = (id) => {
  const cards = h(id);
  return { type: "single", size: 1, cards, label: id };
};

function rig(game, hands, turn, table = null, owner = null) {
  hands.forEach((hand, i) => (game.players[i].hand = hand));
  game.turn = turn;
  game.table = table;
  game.tableOwner = table ? (owner ?? (turn + 3) % 4) : null;
  game.passed = new Set();
  game.declined = {};
  game.mustPlayStartingCard = false;
  game.played = [];
  return game;
}

/** Өрсөлдөгч зөвхөн хөзрийнхөө ТООГ мэдүүлнэ — онлайн горимтой адил. */
const masked = (game, index) => ({
  ...game,
  players: game.players.map((p, i) =>
    i === index
      ? p
      : {
          ...p,
          handCount: p.hand.length,
          hand: Array.from({ length: p.hand.length }, (_, k) => ({
            id: `hidden-${i}-${k}`,
            hidden: true,
          })),
        },
  ),
});

/* ── Өрсөлдөгчийн санамж ── */

test("пасс хийсэн хослолыг санана", () => {
  const game = createGame(defs, { seed: 11 });
  rig(game, [h("3D"), h("4D"), h("5D"), h("6D")], 1, single("9H"), 0);
  pass(game, 1);
  assert.equal(game.declined[1][1].cards[0].id, "9H");
});

test("санамж нь ХАМГИЙН ХҮЧТЭЙ татгалзлыг хадгална", () => {
  const game = createGame(defs, { seed: 12 });
  rig(game, [h("3D", "4C"), h("4D", "5C"), h("5D", "6C"), h("6D", "7C")], 1, single("9H"), 0);
  pass(game, 1);
  game.table = single("KS");
  game.turn = 1;
  pass(game, 1);
  assert.equal(game.declined[1][1].cards[0].id, "KS", "K нь 9-өөс хүчтэй тул KS үлдэнэ");

  game.table = single("5H");
  game.turn = 1;
  pass(game, 1);
  assert.equal(game.declined[1][1].cards[0].id, "KS", "сул татгалзал дээдийг дарахгүй");
});

test("санамж Firestore-оор дамжихдаа алдагдахгүй", () => {
  const game = createGame(defs, { seed: 13 });
  rig(game, [h("3D"), h("4D"), h("5D"), h("6D")], 1, single("9H"), 0);
  pass(game, 1);
  const revived = deserializeGame(JSON.parse(JSON.stringify(serializeGame(game))));
  assert.equal(revived.declined[1][1].cards[0].id, "9H");
});

test("санамжаа ашиглаж, дийлэгдэхгүй болсон хөзрөөр тэргүүлнэ", () => {
  const game = createGame(defs, { seed: 14 });
  // Гарт: 4♦ ба Q♦. 2, A, K бүгд гарсан гэж үзэхийн оронд өрсөлдөгчид
  // J-ийн ганцыг дийлж чадаагүй гэдгийг ашиглана.
  rig(game, [h("4D", "QD"), h("7D", "8D"), h("9D", "10D"), h("JD", "KD")], 0, null);
  for (const seat of [1, 2, 3]) game.declined[seat] = { 1: single("QH") };
  const move = chooseMove(masked(game, 0), 0, { difficulty: DIFFICULTY.HARD });
  assert.equal(move.cards[0].id, "QD", "Q-г хэн ч дийлэхгүй нь батлагдсан — түүгээр тэргүүлнэ");
});

/* ── Хаалт ── */

test("1 хөзөртэй хүнийг ОЛОН хөзрөөр хаана", () => {
  const game = createGame(defs, { seed: 15 });
  // Гарт сет байна. Өрсөлдөгч 1 хөзөртэй — сет тавихад хариулж ч,
  // хөзрөө хаяж ч чадахгүй.
  rig(game, [h("6D", "6C", "6H", "9S"), h("KD"), h("3C", "4C", "5C"), h("3H", "4H", "5H")], 0, null);
  const move = chooseMove(masked(game, 0), 0, { difficulty: DIFFICULTY.HARD });
  assert.equal(move.size, 3, `1 хөзөртэй хүнд ганц хөзөр өгөхгүй: ${move.label}`);
});

test("ширээг эзэмшигч дуусах гэж байвал пасс хийхгүй", () => {
  const game = createGame(defs, { seed: 16 });
  // 3-р суудал ширээг эзэмшиж байна, гарт нь 1 хөзөр. Бид пасс хийвэл
  // тэр дахин тэргүүлж, шууд дуусна.
  rig(
    game,
    [h("3D", "4C", "7H", "8S", "9D", "10C", "JH"), h("5D", "5C"), h("6D", "6C"), h("2D")],
    0,
    single("4D"),
    3,
  );
  const move = chooseMove(masked(game, 0), 0, { difficulty: DIFFICULTY.HARD });
  assert.ok(move, "ширээг булаах ёстой — пасс хийвэл өрсөлдөгч дуусна");
});

/* ── Тоглуулж үзэх хайлт ── */

test("мастер түвшин зөвхөн хүчинтэй нүүдэл буцаана", () => {
  for (let seed = 0; seed < 5; seed += 1) {
    const game = createGame(defs, { seed });
    let guard = 0;
    while (game.phase === PHASE.PLAYING && guard < 400) {
      guard += 1;
      const i = game.turn;
      const move = chooseMove(masked(game, i), i, {
        difficulty: DIFFICULTY.EXPERT,
        worlds: 4,
        ms: 0,
      });
      const result = move ? play(game, i, move.cards) : pass(game, i);
      assert.ok(result.ok, `seed ${seed}: ${result.error}`);
    }
    assert.notEqual(game.phase, PHASE.PLAYING, `seed ${seed}: үе дуусаагүй`);
  }
});

test("хайлт эхийн төлөвийг ӨӨРЧИЛДӨГГҮЙ", () => {
  const game = createGame(defs, { seed: 21 });
  const before = JSON.stringify(serializeGame(game));
  chooseMove(masked(game, game.turn), game.turn, {
    difficulty: DIFFICULTY.EXPERT,
    worlds: 4,
    ms: 0,
  });
  assert.equal(JSON.stringify(serializeGame(game)), before);
});

/* ── Хүч чадлын баталгаа ────────────────────────────
   Үр нь тогтмол тул энэ хэмжилт ДАВТАГДАНА. Жин өөрчилсний
   дараа энэ тест унавал bot СУЛАРСАН гэсэн үг.

   ⚠ ӨӨР ТАРААЛТ олон байх нь чухал. Эхэндээ 6 тараалтыг 6 байрлалаар
   эргүүлж 36 үе тоглуулсан нь "36 хэмжилт" мэт харагдсан ч үнэндээ
   ЗӨВХӨН 6 бие даасан тараалт байсан тул санамсаргүй тааралдсан муу
   тараалт дүгнэлтийг эсрэгээр нь эргүүлж байлаа.

   Бодит тохируулгыг `node tools/arena.mjs --rounds 3000` хийнэ.        */

test("мастер түвшин хүчтэй түвшнээс дээгүүр", () => {
  // Суудлын хазайлтыг арилгахын тулд 4 суудлаас 2-ыг сонгох 6 хувилбарыг
  // бүгдийг эргүүлнэ — ингэснээр тал бүр суудал бүрд тэнцүү тоглоно.
  const layouts = [
    [0, 0, 1, 1],
    [0, 1, 0, 1],
    [0, 1, 1, 0],
    [1, 0, 0, 1],
    [1, 0, 1, 0],
    [1, 1, 0, 0],
  ];
  const points = [0, 0];
  const wins = [0, 0];
  let seats = 0;

  const DEALS = 20; // бие даасан тараалтын тоо — байрлал бүрээр эргүүлнэ
  for (let g = 0; g < DEALS * layouts.length; g += 1) {
    const layout = layouts[g % layouts.length];
    const game = createGame(defs, { seed: 900 + Math.floor(g / layouts.length) });
    let guard = 0;
    while (game.phase === PHASE.PLAYING && guard < 400) {
      guard += 1;
      const i = game.turn;
      const move = chooseMove(masked(game, i), i, {
        difficulty: layout[i] === 0 ? DIFFICULTY.EXPERT : DIFFICULTY.HARD,
        worlds: 4, // тестийн хурдны төлөө бага — arena дээр 16-аар хэмжинэ
        ms: 0,
      });
      const result = move ? play(game, i, move.cards) : pass(game, i);
      assert.ok(result.ok);
    }
    if (!game.lastRound) continue;
    for (const r of game.lastRound.results) {
      const side = layout[r.id];
      points[side] += r.points;
      if (r.isRoundWinner) wins[side] += 1;
    }
    seats += 2;
  }

  const expert = { points: points[0] / seats, wins: wins[0] / seats };
  const hard = { points: points[1] / seats, wins: wins[1] / seats };
  assert.ok(
    expert.wins > hard.wins,
    `мастер ${(expert.wins * 100).toFixed(1)}% vs хүчтэй ${(hard.wins * 100).toFixed(1)}%`,
  );
  assert.ok(
    expert.points < hard.points,
    `мастер ${expert.points.toFixed(2)} оноо vs хүчтэй ${hard.points.toFixed(2)}`,
  );
});

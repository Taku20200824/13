import assert from "node:assert/strict";
import test from "node:test";
import { makeCard, makeDeck, shuffle } from "../js/cards.js";
import { chooseMove, planSize, DIFFICULTY } from "../js/bot.js";
import { createGame, play, pass, nextRound, PHASE } from "../js/game.js";

const h = (...ids) => ids.map((id) => makeCard(id.slice(0, -1), id.slice(-1)));
const defs = ["A", "B", "C", "D"].map((n) => ({ id: n, name: n, isBot: true }));

function rig(game, hands, turn, table = null) {
  hands.forEach((hand, i) => (game.players[i].hand = hand));
  game.turn = turn;
  game.table = table;
  game.tableOwner = table ? (turn + 3) % 4 : null;
  game.passed = new Set();
  game.mustPlayStartingCard = false;
  game.played = [];
  return game;
}

/* ── Төлөвлөгөө бодогч ── */

test("хамгийн цөөн нүүдлийг ЯГ бодно", () => {
  // Гурван хос — 3 нүүдэл
  assert.equal(planSize(h("3D", "3C", "5D", "5C", "9H", "9S")), 3);
  // Флаш — нэг нүүдэл
  assert.equal(planSize(h("3S", "7S", "9S", "JS", "KS")), 1);
  // Фүл хаус — нэг нүүдэл
  assert.equal(planSize(h("6D", "6C", "6H", "KS", "KD")), 1);
  // Гурван салангид хөзөр — 3 нүүдэл
  assert.equal(planSize(h("3D", "7C", "KH")), 3);
});

test("төлөвлөгөө нь илүү том хослолыг олж чадна", () => {
  // 3♦4♦5♦6♦7♦ нь страйт флаш — 1 нүүдэл (5 нүүдэл биш)
  assert.equal(planSize(h("3D", "4D", "5D", "6D", "7D")), 1);
  // Нэмээд нэг хос — 2 нүүдэл
  assert.equal(planSize(h("3D", "4D", "5D", "6D", "7D", "9C", "9H")), 2);
});

test("13 хөзрийн гарыг хурдан бодно", () => {
  const t0 = Date.now();
  for (let s = 0; s < 50; s += 1) planSize(shuffle(makeDeck(), s).slice(0, 13));
  const perHand = (Date.now() - t0) / 50;
  assert.ok(perHand < 15, `${perHand.toFixed(1)}ms/гар — хэт удаан`);
});

/* ── Шийдвэр гаргалт ── */

test("гараа дуусгах боломжтой бол заавал дуусгана", () => {
  const game = createGame(defs, { seed: 1 });
  rig(game, [h("9D", "9C"), h("3D"), h("4D"), h("5D")], 0, null);
  const move = chooseMove(game, 0, { difficulty: DIFFICULTY.HARD });
  assert.equal(move.size, 2, "хоёр хөзрөө нэг дор гаргана");
});

test("хүчтэй AI хослолоо дэмий эвдэхгүй", () => {
  const game = createGame(defs, { seed: 2 });
  // Гарт: хос 9, хос K, ганц 4. Ширээ цэвэрхэн.
  rig(game, [h("4D", "9D", "9C", "KH", "KS"), h("3D"), h("5D"), h("6D")], 0, null);
  const move = chooseMove(game, 0, { difficulty: DIFFICULTY.HARD });
  const ids = move.cards.map((c) => c.id);
  const brokePair =
    (ids.includes("9D") && !ids.includes("9C")) || (ids.includes("KH") && !ids.includes("KS"));
  assert.ok(!brokePair, `хосыг эвдэв: ${ids.join(" ")}`);
});

test("өрсөлдөгч дуусах гэж байвал хориглоно", () => {
  const game = createGame(defs, { seed: 3 });
  const table = { type: "single", size: 1, cards: h("5H"), category: undefined };
  rig(game, [h("3D", "7C", "2S"), h("9D"), h("JD"), h("QD")], 0, table);
  game.players[1].hand = h("9D"); // 1 хөзөртэй — дуусах шахсан
  const move = chooseMove(game, 0, { difficulty: DIFFICULTY.HARD });
  assert.ok(move, "пасс хийхгүй, заавал дийлнэ");
  assert.ok(move.cards[0].rank === "7" || move.cards[0].rank === "2");
});

// ЗАСВАР: "нэг хөзөртэй өрсөлдөгчийг үргэлж хамгийн том нүүдлээр хаа" гэсэн
// дүрмийг 90 тоглоомоор хэмжихэд bot СУЛРУУЛСАН (42% ялалт). Тиймээс
// албадан хаалтыг хассан. Оронд нь шаардлагатай зүйл нь: тэргүүлж байхад
// хүчинтэй нүүдэл гаргаж л байх, дэмий гацахгүй байх.
test("critical үед ширээ цэвэр бол хүчинтэй нүүдэл гаргана", () => {
  const game = createGame(defs, { seed: 31 });
  rig(game, [h("7D", "7C", "2S"), h("9D"), h("JD"), h("4D", "4C", "QH")], 0, null);
  const move = chooseMove(game, 0, { difficulty: DIFFICULTY.HARD });
  assert.ok(move, "ширээ цэвэрхэн үед заавал нүүдэл гаргана");
  assert.ok(move.cards.every((c) => game.players[0].hand.some((x) => x.id === c.id)));
});

test("өрсөлдөгч 1 хөзөртэй бол дийлэгдэхгүй хөзрөөр тэргүүлж хаана", () => {
  const game = createGame(defs, { seed: 32 });
  rig(game, [h("7D", "KH", "2S"), h("9D"), h("JD"), h("4D", "4C", "QH")], 0, null);
  const move = chooseMove(game, 0, { difficulty: DIFFICULTY.HARD });
  assert.equal(move.cards[0].id, "2S", "сул хөзрөөр тэргүүлбэл өрсөлдөгч шууд дуусна");
});

test("харин өрсөлдөгчид хөзөр элбэг бол 2-оо хадгална", () => {
  const game = createGame(defs, { seed: 33 });
  rig(
    game,
    [
      h("3D", "4C", "5H", "6S", "8D", "9C", "KH", "2S"),
      h("9D", "9H", "10D", "10C", "JS", "AD"),
      h("JD", "JC", "JH", "QD", "QC", "AC"),
      h("4D", "4H", "QH", "3S", "3H", "AH"),
    ],
    0,
    null,
  );
  const move = chooseMove(game, 0, { difficulty: DIFFICULTY.HARD });
  assert.notEqual(move.cards[0].id, "2S", "яаралтай биш үед 2-оо үрэхгүй");
});

test("тавих боломжгүй бол пасс (null) буцаана", () => {
  const game = createGame(defs, { seed: 4 });
  const table = { type: "single", size: 1, cards: h("2S"), strength: 999 };
  rig(game, [h("3D", "4C"), h("9D"), h("JD"), h("QD")], 0, table);
  assert.equal(chooseMove(game, 0, { difficulty: DIFFICULTY.HARD }), null);
});

test("хоёр түвшин хоёулаа хүчинтэй нүүдэл л буцаана", () => {
  for (const difficulty of [DIFFICULTY.NORMAL, DIFFICULTY.HARD]) {
    for (let seed = 0; seed < 12; seed += 1) {
      const game = createGame(defs, { seed });
      let guard = 0;
      while (game.phase === PHASE.PLAYING && guard < 400) {
        guard += 1;
        const i = game.turn;
        const move = chooseMove(game, i, { difficulty });
        const result = move ? play(game, i, move.cards) : pass(game, i);
        assert.ok(result.ok, `${difficulty} seed ${seed}: ${result.error}`);
      }
      assert.notEqual(game.phase, PHASE.PLAYING, `${difficulty} seed ${seed}: үе дуусаагүй`);
    }
  }
});

/* ── Хүч чадлын баталгаа ── */

test("ХҮЧТЭЙ түвшин энгийнээсээ мэдэгдэхүйц илүү", () => {
  let hardWins = 0;
  let total = 0;

  // Суудлын хазайлтыг арилгахаар байрлалыг сольж тоглуулна
  for (const layout of [
    [1, 0, 1, 0],
    [0, 1, 0, 1],
  ]) {
    for (let g = 0; g < 20; g += 1) {
      const game = createGame(defs, { seed: 5000 + g });
      let guard = 0;
      while (game.phase !== PHASE.GAME_END && guard < 6000) {
        guard += 1;
        if (game.phase === PHASE.ROUND_END) {
          nextRound(game, (5000 + g) * 31 + guard);
          continue;
        }
        const i = game.turn;
        const difficulty = layout[i] ? DIFFICULTY.HARD : DIFFICULTY.NORMAL;
        const move = chooseMove(game, i, { difficulty });
        const result = move ? play(game, i, move.cards) : pass(game, i);
        assert.ok(result.ok);
      }
      if (game.phase !== PHASE.GAME_END) continue;
      total += 1;
      if (layout[game.gameWinner.index]) hardWins += 1;
    }
  }

  const rate = hardWins / total;
  assert.ok(total >= 35, `хангалттай тоглоом дуусаагүй (${total})`);
  assert.ok(rate > 0.6, `хүчтэй түвшин ${(rate * 100).toFixed(0)}% — 60%-иас дээш байх ёстой`);
});

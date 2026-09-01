import assert from "node:assert/strict";
import test from "node:test";
import { makeCard } from "../js/cards.js";
import { createGame, play, pass, nextRound, PHASE } from "../js/game.js";
import { detect } from "../js/rules.js";

const h = (...ids) => ids.map((id) => makeCard(id.slice(0, -1), id.slice(-1)));
const defs = ["A", "B", "C", "D"].map((name) => ({ name }));

/** Тестийн хэрэгцээнд гарыг гараар тавих. */
function rig(game, hands, turn, table) {
  hands.forEach((hand, i) => (game.players[i].hand = hand));
  game.turn = turn;
  game.mustPlayStartingCard = false;
  game.startingCardId = null;
  if (table) {
    game.table = detect(table.cards);
    game.tableOwner = table.owner;
  } else {
    game.table = null;
    game.tableOwner = null;
  }
  game.passed = new Set();
  return game;
}

test("шинэ тоглоом: 4 хүнд 13-аар тарааж, 3♦-тэй хүн эхэлнэ", () => {
  const game = createGame(defs, { seed: 7 });
  assert.equal(game.players.length, 4);
  game.players.forEach((p) => assert.equal(p.hand.length, 13));
  assert.equal(game.startingCardId, "3D");
  assert.ok(game.players[game.turn].hand.some((c) => c.id === "3D"));
  assert.equal(game.mustPlayStartingCard, true);
});

test("эхний нүүдэлд 3♦ заавал орно", () => {
  const game = createGame(defs, { seed: 7 });
  const starter = game.turn;
  const other = game.players[starter].hand.find((c) => c.id !== "3D");
  const bad = play(game, starter, [other]);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /3♦/);

  const good = play(game, starter, [game.players[starter].hand.find((c) => c.id === "3D")]);
  assert.equal(good.ok, true);
});

test("ЗАСВАР: ширээ цэвэрлэгдэхэд ээлж түүнийг тавьсан хүнд үлдэнэ", () => {
  const game = createGame(defs, { seed: 1 });
  rig(
    game,
    [h("5D", "9C"), h("6D", "9D"), h("7D", "9H"), h("8D", "9S")],
    1,
    { cards: h("2S"), owner: 0 },
  );
  pass(game, 1);
  pass(game, 2);
  pass(game, 3);
  assert.equal(game.table, null, "ширээ цэвэрлэгдсэн");
  assert.equal(game.turn, 0, "2♠ тавьсан P0 өөрөө эхэлнэ");
});

test("пасс хийсэн тоглогчоос дахин асуухгүй", () => {
  const game = createGame(defs, { seed: 2 });
  rig(
    game,
    [h("5D", "9C"), h("6D", "9D"), h("KD", "9H"), h("8D", "9S")],
    1,
    { cards: h("10C"), owner: 0 },
  );
  pass(game, 1);
  assert.equal(game.turn, 2);
  play(game, 2, h("KD"));
  assert.equal(game.turn, 3, "пасс хийсэн P1-ийг алгасаж P3 руу шилжинэ");
  pass(game, 3);
  assert.equal(game.turn, 0, "P1 пасслаа, P3 пасслаа → P0 руу");
});

test("ширээ цэвэрхэн үед пасс хийж болохгүй", () => {
  const game = createGame(defs, { seed: 3 });
  rig(game, [h("5D"), h("6D"), h("7D"), h("8D")], 0, null);
  const result = pass(game, 0);
  assert.equal(result.ok, false);
});

test("нэг хүн хөзрөө дуусгамагц үе дуусна", () => {
  const game = createGame(defs, { seed: 4 });
  rig(game, [h("5D"), h("6D", "7D"), h("8D", "9D", "10D"), h("JD")], 0, null);
  const result = play(game, 0, h("5D"));
  assert.equal(result.roundEnded, true);
  assert.equal(game.phase, PHASE.ROUND_END);
  assert.equal(game.players[0].score, 0);
  assert.equal(game.players[1].score, 2);
  assert.equal(game.players[2].score, 3);
  assert.equal(game.players[3].score, 1);
});

test("13 хөзөртэй үлдвэл 39 оноо аваад шууд хасагдана", () => {
  const game = createGame(defs, { seed: 5 });
  const full = h("3C", "4C", "5C", "6C", "7C", "8C", "9C", "10C", "JC", "QC", "KC", "AC", "2C");
  rig(game, [h("5D"), full, h("6D"), h("7D")], 0, null);
  play(game, 0, h("5D"));
  assert.equal(game.players[1].score, 39);
  assert.equal(game.players[1].eliminated, true);
});

test("хасагдсан тоглогч дараагийн үед оролцохгүй", () => {
  const game = createGame(defs, { seed: 6 });
  game.players[3].score = 39;
  game.players[3].eliminated = true;
  game.phase = PHASE.ROUND_END;
  nextRound(game, 11);
  assert.equal(game.players[3].hand.length, 0);
  assert.notEqual(game.turn, 3);
  const dealt = game.players.filter((p) => !p.eliminated);
  assert.equal(dealt.length, 3);
  dealt.forEach((p) => assert.equal(p.hand.length, 13));
});

test("сүүлд үлдсэн тоглогч тоглоомын ялагч", () => {
  const game = createGame(defs, { seed: 8 });
  game.players[1].eliminated = true;
  game.players[2].eliminated = true;
  game.players[3].score = 28;
  rig(game, [h("5D"), [], [], h("6D", "7D")], 0, null);
  play(game, 0, h("5D"));
  assert.equal(game.phase, PHASE.GAME_END);
  assert.equal(game.gameWinner.name, "A");
});

test("ижил хэмжээтэй, илүү том хослол л тавигдана", () => {
  const game = createGame(defs, { seed: 9 });
  rig(
    game,
    [h("5D", "5C"), h("9D", "9C"), h("3D", "3C"), h("KD", "KC")],
    1,
    { cards: h("7D", "7C"), owner: 0 },
  );
  assert.equal(play(game, 1, h("9D")).ok, false, "нэг хөзөр хос дээр тавигдахгүй");
  assert.equal(play(game, 1, h("9D", "9C")).ok, true);
  assert.equal(play(game, 2, h("3D", "3C")).ok, false, "жижиг хос болохгүй");
});

test("бүтэн үе — санамсаргүй тоглолт төгсгөл хүртэл гүйнэ", () => {
  for (let seed = 0; seed < 40; seed += 1) {
    const game = createGame(defs, { seed });
    let guard = 0;
    while (game.phase === PHASE.PLAYING && guard < 500) {
      guard += 1;
      const me = game.turn;
      const hand = game.players[me].hand;
      const required = game.mustPlayStartingCard ? game.startingCardId : null;
      const options = [];
      // энгийн тоглогч: боломжтой бол хамгийн бага нэг хөзөр, үгүй бол пасс
      for (const card of hand) options.push([card]);
      let played = false;
      for (const option of options) {
        if (play(game, me, option).ok) {
          played = true;
          break;
        }
      }
      if (!played && !pass(game, me).ok) {
        // ширээ цэвэрхэн атлаа юу ч тавьж чадахгүй байх ёсгүй
        assert.fail(`seed ${seed}: тоглогч гацлаа`);
      }
    }
    assert.ok(guard < 500, `seed ${seed}: хязгааргүй давталт`);
    assert.notEqual(game.phase, PHASE.PLAYING, `seed ${seed}: үе дуусаагүй`);
  }
});

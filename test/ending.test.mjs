// Тоглоом хэзээ дуусах, хэн ялахыг ХҮНЭЭР шийднэ — bot-оор биш.
//
// Bot-д ranking байхгүй, онооных нь ач холбогдолгүй. Тиймээс хүмүүс
// бүгд хасагдсаны дараа bot-ууд өөр хоорондоо тоглоод байх нь утгагүй.
import assert from "node:assert/strict";
import test from "node:test";
import { makeCard } from "../js/cards.js";
import { createGame, play, PHASE } from "../js/game.js";

const card = (id) => makeCard(id.slice(0, -1), id.slice(-1));
const human = (name) => ({ id: name, name, isBot: false });
const bot = (name) => ({ id: name, name, isBot: true });

/**
 * Үеийг ТӨГСГӨНӨ: 0-р суудал ганц хөзрөө тавьж дуусгана.
 * Бусад нь нэг хөзөртэй тул тус бүр 1 оноо авна.
 * `scores` дээр 29 өгвөл тухайн тоглогч 30 хүрч хасагдана.
 */
function finishRound(defs, scores) {
  const game = createGame(defs, { seed: 1 });
  const ids = ["3D", "4D", "5D", "6D"];
  game.players.forEach((player, i) => {
    player.hand = player.absent ? [] : [card(ids[i])];
    player.score = scores[i] ?? 0;
  });
  game.turn = 0;
  game.table = null;
  game.tableOwner = null;
  game.passed = new Set();
  game.mustPlayStartingCard = false;
  const result = play(game, 0, game.players[0].hand);
  assert.ok(result.ok, result.error);
  return game;
}

test("bot амьд байсан ч сүүлийн ХҮН ялна", () => {
  // A (хүн) үеийг дуусгаж, B (хүн) 30 оноо цуглуулж хасагдана.
  // C, D bot-ууд амьд хэвээр ч тоглоом ЭНДЭЭ дуусна.
  const game = finishRound([human("A"), human("B"), bot("C"), bot("D")], [0, 29, 0, 0]);

  assert.equal(game.phase, PHASE.GAME_END, "хүн ганцаараа үлдмэгц тоглоом дуусна");
  assert.equal(game.gameWinner?.name, "A");
  assert.equal(game.players[2].eliminated, false, "bot хасагдаагүй ч хамаагүй");
});

test("bot тоглоомын ялагч БОЛОХГҮЙ", () => {
  // Хоёр хүн хоёулаа нэг дор 30 давна. Bot-ууд амьд ч ялагч нь
  // хамгийн бага оноотой ХҮН байна.
  const game = finishRound([human("A"), human("B"), bot("C"), bot("D")], [29, 34, 0, 0]);

  assert.equal(game.phase, PHASE.GAME_END);
  assert.equal(game.gameWinner?.isBot ?? false, false, "ялагч bot байж болохгүй");
  assert.equal(game.gameWinner?.name, "A", "оноо багатай хүн ялна");
});

test("ганцаараа bot-той тоглоод хасагдвал ЯЛАГЧГҮЙ дуусна", () => {
  // B (bot) үеийг дуусгаж, A (цорын ганц хүн) 30 хүрнэ.
  const defs = [bot("B"), human("A"), bot("C"), bot("D")];
  const game = finishRound(defs, [0, 29, 0, 0]);

  assert.equal(game.phase, PHASE.GAME_END, "хүн хасагдмагц дуусна");
  assert.equal(game.gameWinner, null, "хожигдсон тул ялагч байхгүй");
});

test("ганц хүнтэй тоглоом эрт дуусахгүй", () => {
  // Хэн ч хасагдаагүй — ганц хүнтэй ч тоглоом үргэлжилнэ.
  const game = finishRound([human("A"), bot("B"), bot("C"), bot("D")], [0, 0, 0, 0]);
  assert.equal(game.phase, PHASE.ROUND_END, "үе дуусав, тоглоом биш");
  assert.equal(game.gameWinner, null);
});

test("хоёр хүн амьд байхад bot хасагдсан ч үргэлжилнэ", () => {
  const game = finishRound([human("A"), human("B"), bot("C"), bot("D")], [0, 0, 29, 29]);

  assert.equal(game.phase, PHASE.ROUND_END, "хүмүүс амьд тул үргэлжилнэ");
  assert.equal(game.players[2].eliminated, true, "bot хасагдсан");
  assert.equal(game.players[3].eliminated, true);
});

test("хоосон суудлыг хүн гэж тоолохгүй", () => {
  // 3-р суудал хоосон (absent). Хүн нь зөвхөн A — тэр хасагдвал дуусна.
  const defs = [bot("B"), human("A"), bot("C"), { id: "empty", name: "—", isBot: false }];
  const game = createGame(defs, { seed: 1, absent: [3] });
  const ids = ["3D", "4D", "5D", "6D"];
  game.players.forEach((player, i) => {
    player.hand = player.absent ? [] : [card(ids[i])];
    player.score = i === 1 ? 29 : 0;
  });
  game.turn = 0;
  game.table = null;
  game.tableOwner = null;
  game.passed = new Set();
  assert.ok(play(game, 0, game.players[0].hand).ok);

  assert.equal(game.phase, PHASE.GAME_END);
  assert.equal(game.gameWinner, null, "хоосон суудал ялагч болохгүй");
});

test("хүнгүй (зөвхөн bot) тоглоом хуучин дүрмээрээ", () => {
  // Тест болон arena-д ашиглагддаг. Сүүлд үлдсэн bot ялна.
  const game = finishRound([bot("A"), bot("B"), bot("C"), bot("D")], [0, 29, 29, 29]);

  assert.equal(game.phase, PHASE.GAME_END);
  assert.equal(game.gameWinner?.name, "A", "сүүлд үлдсэн bot ялна");
});

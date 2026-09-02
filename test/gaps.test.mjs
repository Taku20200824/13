// Аудитаар илэрсэн тестийн цоорхойнууд.
import assert from "node:assert/strict";
import test from "node:test";
import { makeCard } from "../js/cards.js";
import { detect, rejectReason, beats } from "../js/rules.js";
import { pointsLabel, roundPoints } from "../js/scoring.js";
import { createGame, play, pass, validatePlay, PHASE } from "../js/game.js";
import { emptySeats, makeSeat, seatsMatchState } from "../js/seats.js";
import { ratingScore } from "../js/firebase.js";

const h = (...ids) => ids.map((id) => makeCard(id.slice(0, -1), id.slice(-1)));
const defs = ["A", "B", "C", "D"].map((n) => ({ id: n, name: n }));

/* ── detect: давхардсан хөзөр ── */

test("нэг хөзрийг хоёр удаа тоолж хослол үүсгэж болохгүй", () => {
  assert.equal(detect(h("3D", "3D")), null, "давхардсан хос");
  assert.equal(detect(h("3D", "3D", "3D")), null, "давхардсан сет");
  assert.equal(detect(h("3D", "3D", "3D", "3D", "5C")), null, "хуурамч покер");
  assert.equal(detect(h("3D", "4D", "5D", "5D", "6D")), null, "давхардсан флаш");
  // Жинхэнэ хослолууд хэвээр ажиллана
  assert.equal(detect(h("3D", "3C")).type, "pair");
  assert.equal(detect(h("3D", "3C", "3H", "3S", "5C")).type, "poker");
});

test("хуурамч покер жинхэнэ фүл хаусыг дийлэхгүй", () => {
  const fake = detect(h("3D", "3D", "3D", "3D", "5C"));
  const real = detect(h("6D", "6C", "6H", "KS", "KD"));
  assert.equal(fake, null);
  assert.equal(beats(fake, real), false);
});

/* ── rejectReason: хэрэглэгчид харагдах бүх мессеж ── */

test("rejectReason: 4 хөзрийн хослол байхгүйг тайлбарлана", () => {
  const reason = rejectReason(h("3D", "3C", "3H", "3S"), null);
  assert.match(reason, /Покер/, reason);
});

test("rejectReason: 5-аас олон хөзрийг хаана", () => {
  const reason = rejectReason(h("3D", "4C", "5H", "6S", "7D", "8C"), null);
  assert.match(reason, /5 хөзөр/, reason);
});

test("rejectReason: ширээн дээрхтэй хэмжээ таарахгүйг хэлнэ", () => {
  const table = detect(h("9D", "9C"));
  const reason = rejectReason(h("KD"), table);
  assert.match(reason, /2 хөзөр/, reason);
});

test("rejectReason: жижиг хослолыг хаана", () => {
  const table = detect(h("9D", "9C"));
  const reason = rejectReason(h("3D", "3C"), table);
  assert.match(reason, /том байх ёстой/, reason);
});

test("rejectReason: зөв нүүдэлд null буцаана", () => {
  const table = detect(h("9D", "9C"));
  assert.equal(rejectReason(h("KD", "KC"), table), null);
});

/* ── pointsLabel ── */

test("pointsLabel: ялсан хүн, үржүүлэггүй, үржүүлэгтэй", () => {
  assert.equal(pointsLabel(0), "0 (яллаа)");
  assert.equal(pointsLabel(5), "5");
  assert.equal(pointsLabel(11), "11 × 2 = 22");
  assert.equal(pointsLabel(13), "13 × 3 = 39");
});

test("pointsLabel нь roundPoints-той таарна", () => {
  for (let n = 0; n <= 13; n += 1) {
    const { points } = roundPoints(n);
    const label = pointsLabel(n);
    if (n === 0) assert.match(label, /яллаа/);
    else assert.ok(label.includes(String(points)), `${n}: ${label} дотор ${points} байх ёстой`);
  }
});

test("үржүүлэгч яг 10 дээр эхэлнэ (текст ба код зөрөхгүй)", () => {
  assert.equal(roundPoints(9).multiplier, 1);
  assert.equal(roundPoints(10).multiplier, 2, "10 хөзөр ч гэсэн ×2");
  assert.equal(roundPoints(12).multiplier, 2);
  assert.equal(roundPoints(13).multiplier, 3);
});

/* ── seatsMatchState: хоосон суудалтай тоглоом ── */

test("хоосон суудалтай тоглоомд суудал ба төлөв таарна", () => {
  const seats = emptySeats();
  seats[0] = makeSeat({ uid: "a", displayName: "A" }, 0);
  seats[2] = makeSeat({ uid: "c", displayName: "C" }, 2);
  // main.js хоосон суудлыг `empty-N` id-гаар дүүргэдэг
  const state = {
    players: [
      { index: 0, id: "a" },
      { index: 1, id: "empty-1" },
      { index: 2, id: "c" },
      { index: 3, id: "empty-3" },
    ],
  };
  assert.equal(
    seatsMatchState(seats, state),
    true,
    "хоосон суудал зөрчил биш — эзэлсэн суудлууд таарч байвал болно",
  );

  const wrong = { players: [{ index: 0, id: "a" }, { index: 2, id: "someone-else" }] };
  assert.equal(seatsMatchState(seats, wrong), false, "жинхэнэ зөрчлийг барина");
});

/* ── advance: ганцаараа үлдсэн тохиолдол ── */

test("ширээ эзэмшигч ганцаараа үлдвэл шууд өөрөө үргэлжлүүлнэ", () => {
  const game = createGame(defs, { seed: 12 });
  game.players[1].eliminated = true;
  game.players[2].eliminated = true;
  game.players[3].eliminated = true;
  game.players[0].hand = h("5D", "9C");
  game.turn = 0;
  game.table = detect(h("3C"));
  game.tableOwner = 0;
  game.passed = new Set();

  pass(game, 0); // ганцаараа тул пасс хийж болохгүй ч гацахгүй байх ёстой
  assert.equal(game.turn, 0, "ээлж өөрт нь үлдэнэ");
  assert.equal(game.phase, PHASE.PLAYING);
});

/* ── validatePlay нь rejectReason-той нийцэж байна ── */

test("validatePlay нь дүрмийн шалтгааныг дамжуулна", () => {
  const game = createGame(defs, { seed: 13 });
  game.players[0].hand = h("3D", "3C", "3H", "3S", "5C", "9D");
  game.turn = 0;
  game.table = null;
  game.mustPlayStartingCard = false;

  assert.equal(validatePlay(game, 0, h("3D", "3C", "3H", "3S")).includes("Покер"), true);
  assert.equal(validatePlay(game, 0, h("3D", "3C")), null, "зөв хос");
  assert.equal(validatePlay(game, 1, h("3D")), "Таны ээлж биш байна.");
  assert.equal(validatePlay(game, 0, []), "Хөзөр сонгоно уу.");
  assert.match(validatePlay(game, 0, h("KH")), /Гарт байхгүй/);
});

/* ── ratingScore ── */

test("rating: ялалт нэмнэ, оноо ба ялагдал хасна", () => {
  const base = { wins: 0, losses: 0, roundWins: 0, points: 0 };
  assert.equal(ratingScore(base), 0);
  assert.ok(ratingScore({ ...base, wins: 1 }) > ratingScore(base), "ялалт нэмэгдүүлнэ");
  assert.ok(ratingScore({ ...base, losses: 1 }) < ratingScore(base), "ялагдал бууруулна");
  assert.ok(ratingScore({ ...base, points: 30 }) < ratingScore(base), "оноо их бол доор");
  assert.ok(ratingScore({ ...base, roundWins: 3 }) > ratingScore(base), "үеийн ялалт нэмнэ");
});

test("rating: илүү сайн тоглогч дээгүүр эрэмбэлэгдэнэ", () => {
  const strong = { wins: 8, losses: 2, roundWins: 40, points: 150 };
  const weak = { wins: 2, losses: 8, roundWins: 12, points: 260 };
  assert.ok(ratingScore(strong) > ratingScore(weak));
});

test("rating: хоосон объектод унахгүй", () => {
  assert.equal(Number.isFinite(ratingScore()), true);
  assert.equal(Number.isFinite(ratingScore({})), true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { roundPoints, settleRound, ELIMINATION_SCORE } from "../js/scoring.js";

const hand = (n) => Array.from({ length: n }, (_, i) => ({ id: "c" + i }));

test("9 хүртэл хөзөр — үржүүлэхгүй", () => {
  assert.deepEqual(roundPoints(1), { points: 1, multiplier: 1, cardsLeft: 1 });
  assert.deepEqual(roundPoints(9), { points: 9, multiplier: 1, cardsLeft: 9 });
});

test("10-12 хөзөр — 2 дахин", () => {
  assert.equal(roundPoints(10).points, 20);
  assert.equal(roundPoints(11).points, 22);
  assert.equal(roundPoints(12).points, 24);
});

test("13 хөзөр (нэг ч гаргаагүй) — 3 дахин = 39", () => {
  const r = roundPoints(13);
  assert.equal(r.multiplier, 3);
  assert.equal(r.points, 39);
  assert.ok(r.points >= ELIMINATION_SCORE, "шууд хасагдана");
});

test("үе дуусахад ялсан хүн 0 оноо авна", () => {
  const players = [
    { id: "a", name: "A", score: 0, eliminated: false, hand: [] },
    { id: "b", name: "B", score: 0, eliminated: false, hand: hand(5) },
    { id: "c", name: "C", score: 0, eliminated: false, hand: hand(11) },
    { id: "d", name: "D", score: 0, eliminated: false, hand: hand(13) },
  ];
  const { results, eliminated } = settleRound(players, "a");
  assert.equal(results.find((r) => r.id === "a").points, 0);
  assert.equal(results.find((r) => r.id === "b").points, 5);
  assert.equal(results.find((r) => r.id === "c").points, 22, "11 × 2");
  assert.equal(results.find((r) => r.id === "d").points, 39, "13 × 3");
  assert.deepEqual(eliminated, ["d"], "39 оноо шууд хасагдана");
});

test("30 оноо хүрсэн тоглогч хасагдана", () => {
  const players = [
    { id: "a", name: "A", score: 0, eliminated: false, hand: [] },
    { id: "b", name: "B", score: 27, eliminated: false, hand: hand(3) },
    { id: "c", name: "C", score: 10, eliminated: false, hand: hand(4) },
    { id: "d", name: "D", score: 5, eliminated: false, hand: hand(2) },
  ];
  const { eliminated, remaining } = settleRound(players, "a");
  assert.deepEqual(eliminated, ["b"], "27 + 3 = 30");
  assert.deepEqual(remaining.sort(), ["a", "c", "d"]);
});

test("29 оноо бол үлдэнэ (30 хүрээгүй)", () => {
  const players = [
    { id: "a", name: "A", score: 0, eliminated: false, hand: [] },
    { id: "b", name: "B", score: 27, eliminated: false, hand: hand(2) },
  ];
  const { eliminated } = settleRound(players, "a");
  assert.deepEqual(eliminated, [], "27 + 2 = 29");
});

test("сүүлд үлдсэн нэг хүн тоглоомын ялагч", () => {
  const players = [
    { id: "a", name: "A", score: 0, eliminated: false, hand: [] },
    { id: "b", name: "B", score: 28, eliminated: false, hand: hand(5) },
    { id: "c", name: "C", score: 25, eliminated: false, hand: hand(11) },
  ];
  const { gameWinner, eliminated } = settleRound(players, "a");
  assert.deepEqual(eliminated.sort(), ["b", "c"]);
  assert.equal(gameWinner.id, "a");
});

test("хасагдсан тоглогч дараагийн үед тоологдохгүй", () => {
  const players = [
    { id: "a", name: "A", score: 0, eliminated: false, hand: [] },
    { id: "b", name: "B", score: 35, eliminated: true, hand: hand(9) },
    { id: "c", name: "C", score: 4, eliminated: false, hand: hand(6) },
  ];
  const { results } = settleRound(players, "a");
  assert.equal(results.length, 2);
  assert.ok(!results.some((r) => r.id === "b"));
});

test("бүгд нэг дор 30 давбал хамгийн бага оноотой нь ялна", () => {
  const players = [
    { id: "b", name: "B", score: 29, eliminated: false, hand: hand(2) },
    { id: "c", name: "C", score: 29, eliminated: false, hand: hand(11) },
  ];
  const { gameWinner } = settleRound(players, null);
  assert.equal(gameWinner.id, "b", "31 < 51");
});

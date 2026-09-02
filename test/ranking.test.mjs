// Ranking-ийн бүртгэлийг Firestore-гүйгээр симуляцаар шалгана.
import assert from "node:assert/strict";
import test from "node:test";

/** firebase.js доторх recordResult-ийн гүйлгээний логикийг давтана. */
function makeStore() {
  const users = new Map();
  return {
    users,
    get(uid) {
      return users.get(uid) ?? null;
    },
    record(uid, stats) {
      if (!stats?.gameId) return false;
      const data = users.get(uid) ?? null;
      if (data?.recordedGames?.includes(stats.gameId)) return false;

      const base = data ?? { games: 0, wins: 0, losses: 0, rounds: 0, roundWins: 0, points: 0 };
      const history = [...(data?.recordedGames ?? []), stats.gameId].slice(-50);
      users.set(uid, {
        displayName: stats.name ?? data?.displayName ?? "Зочин",
        games: (base.games ?? 0) + 1,
        wins: (base.wins ?? 0) + (stats.won ? 1 : 0),
        losses: (base.losses ?? 0) + (stats.won ? 0 : 1),
        rounds: (base.rounds ?? 0) + (stats.rounds ?? 0),
        roundWins: (base.roundWins ?? 0) + (stats.roundWins ?? 0),
        points: (base.points ?? 0) + (stats.points ?? 0),
        recordedGames: history,
      });
      return true;
    },
  };
}

/** fetchLeaderboard-ийн эрэмбийг давтана. */
const rank = (rows) =>
  rows
    .filter((r) => (r.games ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.wins ?? 0) - (a.wins ?? 0) ||
        (b.games ?? 0) - (a.games ?? 0) ||
        (a.points ?? 0) - (b.points ?? 0),
    );

test("ялалт, ялагдал, тоглолт зөв нэмэгдэнэ", () => {
  const db = makeStore();
  db.record("a", { gameId: "g1", won: true, rounds: 4, roundWins: 3, points: 12 });
  db.record("a", { gameId: "g2", won: false, rounds: 5, roundWins: 1, points: 31 });

  const a = db.get("a");
  assert.equal(a.games, 2);
  assert.equal(a.wins, 1);
  assert.equal(a.losses, 1, "ялагдал тусад нь тоологдоно");
  assert.equal(a.rounds, 9);
  assert.equal(a.roundWins, 4);
  assert.equal(a.points, 43);
  assert.equal(a.games, a.wins + a.losses, "тоглолт = ялалт + ялагдал");
});

test("нэг тоглоомыг ХОЁР УДАА бүртгэхгүй", () => {
  const db = makeStore();
  assert.equal(db.record("a", { gameId: "g1", won: true, points: 5 }), true);
  assert.equal(db.record("a", { gameId: "g1", won: true, points: 5 }), false, "давхардлыг таслана");
  assert.equal(db.record("a", { gameId: "g1", won: false, points: 9 }), false);

  const a = db.get("a");
  assert.equal(a.games, 1);
  assert.equal(a.wins, 1);
  assert.equal(a.points, 5);
});

test("өрөөнд дахин орж гарахад оноо давхарлахгүй", () => {
  const db = makeStore();
  const stats = { gameId: "ROOM1-1700", won: false, rounds: 3, points: 20 };
  db.record("a", stats); // тоглоом дуусав
  db.record("a", stats); // lobby руу гараад буцаж орлоо
  db.record("a", stats); // дахин snapshot ирлээ
  assert.equal(db.get("a").games, 1);
  assert.equal(db.get("a").points, 20);
});

test("өөр тоглоом бол тусад нь бүртгэнэ", () => {
  const db = makeStore();
  db.record("a", { gameId: "ROOM1-1700", won: true, points: 0 });
  db.record("a", { gameId: "ROOM1-1900", won: false, points: 14 });
  assert.equal(db.get("a").games, 2);
});

test("түүх 50-аар хязгаарлагдана — баримт хэт томрохгүй", () => {
  const db = makeStore();
  for (let i = 0; i < 60; i += 1) db.record("a", { gameId: `g${i}`, won: i % 2 === 0 });
  const a = db.get("a");
  assert.equal(a.games, 60);
  assert.equal(a.recordedGames.length, 50);
  assert.equal(a.recordedGames.at(-1), "g59");
});

test("эрэмбэ: ялалт → тоглолт → бага оноо", () => {
  const rows = [
    { uid: "a", wins: 3, games: 10, points: 200 },
    { uid: "b", wins: 5, games: 8, points: 150 },
    { uid: "c", wins: 5, games: 12, points: 300 },
    { uid: "d", wins: 5, games: 12, points: 120 },
    { uid: "e", wins: 0, games: 0, points: 0 },
  ];
  const order = rank(rows).map((r) => r.uid);
  assert.deepEqual(order, ["d", "c", "b", "a"]);
  assert.ok(!order.includes("e"), "нэг ч тоглоогүй хүн жагсаалтад орохгүй");
});

test("тоглоогүй хэрэглэгч ranking-д харагдахгүй", () => {
  const rows = [{ uid: "new", wins: 0, games: 0 }];
  assert.equal(rank(rows).length, 0);
});

/* ── Аль тоглолт ranking-д тоологдох вэ ── */

function shouldRecord({ mode, humans, online = true, user = true }) {
  if (!online || !user) return false;
  if (mode !== "online") return false;
  return humans >= 2;
}

test("bot-той дасгал тоглолт ranking-д тоологдохгүй", () => {
  assert.equal(shouldRecord({ mode: "local", humans: 1 }), false);
});

test("өрөөнд ганцаараа bot-той тоглосон ч тоологдохгүй", () => {
  assert.equal(shouldRecord({ mode: "online", humans: 1 }), false, "оноо тарихаас сэргийлнэ");
});

test("2 ба түүнээс дээш хүнтэй онлайн тоглолт тоологдоно", () => {
  assert.equal(shouldRecord({ mode: "online", humans: 2 }), true);
  assert.equal(shouldRecord({ mode: "online", humans: 4 }), true);
});

test("нэвтрээгүй эсвэл офлайн үед бүртгэхгүй", () => {
  assert.equal(shouldRecord({ mode: "online", humans: 4, online: false }), false);
  assert.equal(shouldRecord({ mode: "online", humans: 4, user: false }), false);
});

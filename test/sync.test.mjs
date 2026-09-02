// Онлайн синхрончлолын хамгаалалтууд.
// Firestore-гүйгээр гүйлгээний нөхцөлүүдийг симуляцаар шалгана.
import assert from "node:assert/strict";
import test from "node:test";

/**
 * js/firebase.js доторх commitMove-ийн гүйлгээний логикийг давтана.
 * Гол зорилго: хоёр бичигч зэрэг ажиллахад нэг нь нөгөөгөө дарж
 * бичихээс сэргийлэх.
 */
function makeRoom() {
  return {
    status: "playing",
    state: { turn: 0, phase: "playing" },
    stateVersion: 1,
    hands: {},
  };
}

function commitMove(room, { seatIndex, expectedVersion, state, hand, uid }) {
  if (!room) return { ok: false, reason: "room-gone" };
  if (room.status !== "playing") return { ok: false, reason: "not-playing" };
  if (!room.state || room.state.turn !== seatIndex) return { ok: false, reason: "not-your-turn" };
  const version = room.stateVersion ?? 0;
  if (expectedVersion !== undefined && expectedVersion !== null && version !== expectedVersion) {
    return { ok: false, reason: "stale" };
  }
  if (hand) room.hands[seatIndex] = { uid, cards: hand };
  room.state = state;
  room.stateVersion = version + 1;
  return { ok: true, version: room.stateVersion };
}

test("ээлжтэй тоглогчийн нүүдэл бичигдэнэ", () => {
  const room = makeRoom();
  const r = commitMove(room, {
    seatIndex: 0,
    expectedVersion: 1,
    state: { turn: 1, phase: "playing" },
    hand: [{ id: "3D" }],
    uid: "a",
  });
  assert.equal(r.ok, true);
  assert.equal(room.stateVersion, 2);
  assert.equal(room.state.turn, 1);
});

test("ээлж биш тоглогч бичиж чадахгүй", () => {
  const room = makeRoom();
  const r = commitMove(room, { seatIndex: 2, expectedVersion: 1, state: { turn: 3 } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not-your-turn");
  assert.equal(room.stateVersion, 1, "төлөв хөндөгдөөгүй");
});

test("ГОЛ ЗАСВАР: хоцорсон бичилт өмнөхийг дарж бичихгүй", () => {
  const room = makeRoom();
  // Хүн нүүлээ
  const first = commitMove(room, {
    seatIndex: 0,
    expectedVersion: 1,
    state: { turn: 1, phase: "playing" },
    uid: "a",
  });
  assert.equal(first.ok, true);

  // Host-ын bot гинж хуучин хувилбар дээр тулгуурлаж бичих гэв
  const stale = commitMove(room, {
    seatIndex: 0,
    expectedVersion: 1, // хуучин
    state: { turn: 3, phase: "playing" },
    uid: "bot-0",
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "not-your-turn", "ээлж аль хэдийн шилжсэн");
  assert.equal(room.state.turn, 1, "хүний нүүдэл хэвээр");
});

test("хувилбар зөрвөл (ижил ээлж ч гэсэн) бичихгүй", () => {
  const room = makeRoom();
  room.stateVersion = 7;
  const r = commitMove(room, { seatIndex: 0, expectedVersion: 3, state: { turn: 1 } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "stale");
});

test("хувилбар үргэлж урагш явна", () => {
  const room = makeRoom();
  const versions = [];
  for (let i = 0; i < 4; i += 1) {
    const r = commitMove(room, {
      seatIndex: 0,
      expectedVersion: room.stateVersion,
      state: { turn: 0, phase: "playing" },
    });
    versions.push(r.version);
  }
  assert.deepEqual(versions, [2, 3, 4, 5]);
});

test("тоглоом дуусаад бичилт хүлээж авахгүй", () => {
  const room = makeRoom();
  room.status = "finished";
  const r = commitMove(room, { seatIndex: 0, expectedVersion: 1, state: { turn: 1 } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not-playing");
});

test("гар нь өөрийн суудлын дугаараар л бичигдэнэ", () => {
  const room = makeRoom();
  commitMove(room, {
    seatIndex: 0,
    expectedVersion: 1,
    state: { turn: 1 },
    hand: [{ id: "3D" }],
    uid: "a",
  });
  assert.deepEqual(Object.keys(room.hands), ["0"]);
  assert.equal(room.hands[0].uid, "a");
});

/* ── Chat throttle ── */

const CHAT_COOLDOWN_MS = 1500;
const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 15_000;

function makeThrottle() {
  const history = [];
  return function check(now) {
    while (history.length && now - history[0] > CHAT_WINDOW_MS) history.shift();
    const last = history.at(-1);
    if (last !== undefined && now - last < CHAT_COOLDOWN_MS) return { ok: false, reason: "cooldown" };
    if (history.length >= CHAT_BURST) return { ok: false, reason: "burst" };
    history.push(now);
    return { ok: true };
  };
}

test("chat: дараалсан хоёр мессежийн хооронд хүлээнэ", () => {
  const check = makeThrottle();
  assert.equal(check(0).ok, true);
  assert.equal(check(500).ok, false, "0.5с дараа болохгүй");
  assert.equal(check(1600).ok, true, "1.5с дараа болно");
});

test("chat: 15 секундэд 5-аас олон мессеж илгээхгүй", () => {
  const check = makeThrottle();
  let sent = 0;
  for (let t = 0; t < 15_000; t += 1600) if (check(t).ok) sent += 1;
  assert.equal(sent, CHAT_BURST, `${sent} мессеж — дээд хязгаар ${CHAT_BURST}`);
});

test("chat: цонх өнгөрөхөд дахин илгээх боломжтой", () => {
  const check = makeThrottle();
  for (let t = 0; t < 15_000; t += 1600) check(t);
  assert.equal(check(40_000).ok, true, "удаан хүлээсэн бол дахин илгээнэ");
});

/* ── Дүрмийн шалгуурууд (логикийг давтав) ── */

const now = 1_700_000_000_000;
const validMessage = (data, at = now) =>
  data.uid === "me" &&
  typeof data.text === "string" &&
  data.text.length > 0 &&
  data.text.length <= 180 &&
  typeof data.createdMs === "number" &&
  data.createdMs <= at + 5000 &&
  data.createdMs >= at - 60_000;

test("дүрэм: хоосон болон хэт урт мессежийг хаана", () => {
  assert.equal(validMessage({ uid: "me", text: "", createdMs: now }), false);
  assert.equal(validMessage({ uid: "me", text: "x".repeat(181), createdMs: now }), false);
  assert.equal(validMessage({ uid: "me", text: "сайн уу", createdMs: now }), true);
});

test("дүрэм: өөр хүний нэрээр бичихийг хаана", () => {
  assert.equal(validMessage({ uid: "someone-else", text: "hi", createdMs: now }), false);
});

test("дүрэм: хуурамч цагтай мессежийг хаана", () => {
  assert.equal(validMessage({ uid: "me", text: "hi", createdMs: now + 600_000 }), false, "ирээдүй");
  assert.equal(validMessage({ uid: "me", text: "hi", createdMs: now - 600_000 }), false, "хэт хуучин");
});

/* ── Host-only талбарууд ── */

const HOST_ONLY = ["status", "allowBots", "botLevel", "visibility", "gameId", "startedAt"];

const memberUpdateAllowed = (changedKeys, isHost) =>
  isHost || !changedKeys.some((k) => HOST_ONLY.includes(k));

test("дүрэм: гишүүн тоглоомыг өөрөө эхлүүлж чадахгүй", () => {
  assert.equal(memberUpdateAllowed(["status", "state"], false), false);
  assert.equal(memberUpdateAllowed(["status", "state"], true), true, "host бол болно");
});

test("дүрэм: гишүүн bot тохиргоог өөрчилж чадахгүй", () => {
  assert.equal(memberUpdateAllowed(["allowBots"], false), false);
  assert.equal(memberUpdateAllowed(["botLevel"], false), false);
});

test("дүрэм: гишүүн нүүдлээ бичиж чадна", () => {
  assert.equal(memberUpdateAllowed(["state", "stateVersion", "updatedAt"], false), true);
  assert.equal(memberUpdateAllowed(["seats", "members"], false), true, "орох/гарах");
});

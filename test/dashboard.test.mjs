import assert from "node:assert/strict";
import test from "node:test";
import { computeStats } from "../js/dashboard.js";
import { emptySeats, makeSeat, makeBotSeat, serializeSeats } from "../js/seats.js";

const NOW = 1_700_000_000_000;
const user = (uid) => ({ uid, displayName: uid, photoURL: null });

function room({ status = "waiting", visibility = "public", humans = 1, bots = 0, ageMs = 0 }) {
  const seats = emptySeats();
  let i = 0;
  for (let h = 0; h < humans; h += 1, i += 1) seats[i] = makeSeat(user(`u${status}${visibility}${h}`), i);
  for (let b = 0; b < bots; b += 1, i += 1) seats[i] = makeBotSeat(i, `Bot${b}`);
  return { status, visibility, seats: serializeSeats(seats), updatedAt: NOW - ageMs };
}

const presence = (n) => Array.from({ length: n }, (_, i) => ({ uid: `p${i}`, lastSeen: NOW }));

test("онлайн тоглогчийн тоо presence-ээс гарна", () => {
  const s = computeStats(presence(7), [], NOW);
  assert.equal(s.online, 7);
});

test("public ба private өрөөг тусад нь тоолно", () => {
  const rooms = [
    room({ visibility: "public" }),
    room({ visibility: "public", status: "playing" }),
    room({ visibility: "private" }),
  ];
  const s = computeStats(presence(3), rooms, NOW);
  assert.equal(s.publicRooms, 2);
  assert.equal(s.privateRooms, 1);
});

test("явагдаж буй тоглоом = status 'playing'", () => {
  const rooms = [
    room({ status: "playing" }),
    room({ status: "playing", visibility: "private" }),
    room({ status: "waiting" }),
  ];
  const s = computeStats([], rooms, NOW);
  assert.equal(s.running, 2);
  assert.equal(s.waiting, 1);
});

test("дууссан өрөө тоологдохгүй", () => {
  const s = computeStats([], [room({ status: "finished" })], NOW);
  assert.equal(s.publicRooms, 0);
  assert.equal(s.running, 0);
});

test("хүнгүй (зөвхөн bot) өрөө тоологдохгүй", () => {
  const orphan = room({ humans: 0, bots: 3 });
  const s = computeStats([], [orphan], NOW);
  assert.equal(s.publicRooms, 0, "хаягдсан өрөө статистикийг гажуудуулахгүй");
});

test("5 минутаас удаан хөдөлгөөнгүй өрөө тоологдохгүй", () => {
  const stale = room({ ageMs: 6 * 60_000 });
  const fresh = room({ ageMs: 30_000 });
  const s = computeStats([], [stale, fresh], NOW);
  assert.equal(s.publicRooms, 1);
});

test("тоглож буй хүний тоо ба сул суудал", () => {
  const rooms = [
    room({ status: "playing", humans: 3, bots: 1 }),
    room({ status: "waiting", humans: 2 }),
  ];
  const s = computeStats([], rooms, NOW);
  assert.equal(s.seated, 3, "тоглож буй хүн (bot тоологдохгүй)");
  assert.equal(s.openSeats, 2, "хүлээж буй өрөөнд 2 суудал сул");
});

test("хүн орох/гарахад тоо шууд өөрчлөгдөнө", () => {
  const before = computeStats(presence(2), [room({ humans: 2 })], NOW);
  assert.equal(before.online, 2);
  assert.equal(before.openSeats, 2);

  const after = computeStats(presence(3), [room({ humans: 3 })], NOW);
  assert.equal(after.online, 3);
  assert.equal(after.openSeats, 1);
});

test("тоглоом эхлэхэд waiting → running руу шилжинэ", () => {
  const waiting = computeStats([], [room({ status: "waiting", humans: 2 })], NOW);
  assert.equal(waiting.running, 0);
  assert.equal(waiting.waiting, 1);

  const playing = computeStats([], [room({ status: "playing", humans: 2 })], NOW);
  assert.equal(playing.running, 1);
  assert.equal(playing.waiting, 0);
});

test("хоосон өгөгдөл дээр унахгүй", () => {
  const s = computeStats(null, null, NOW);
  assert.deepEqual(
    { online: s.online, publicRooms: s.publicRooms, running: s.running },
    { online: 0, publicRooms: 0, running: 0 },
  );
});

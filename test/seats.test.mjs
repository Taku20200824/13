import assert from "node:assert/strict";
import test from "node:test";
import {
  SEAT_COUNT,
  emptySeats,
  normalizeSeats,
  makeSeat,
  makeBotSeat,
  seatIndexOf,
  firstFreeSeat,
  seatCount,
  humanSeats,
  electHost,
  hostIsStale,
  seatsMatchState,
  serializeSeats,
  deserializeSeats,
} from "../js/seats.js";

const user = (uid, name = uid) => ({ uid, displayName: name, photoURL: null });

test("суудал үргэлж 4 урттай", () => {
  assert.equal(emptySeats().length, SEAT_COUNT);
  assert.equal(normalizeSeats(null).length, SEAT_COUNT);
  assert.equal(normalizeSeats([]).length, SEAT_COUNT);
});

test("суудал эзлэх ба чөлөөлөх", () => {
  const seats = emptySeats();
  seats[0] = makeSeat(user("a"), 0);
  assert.equal(firstFreeSeat(seats), 1);
  seats[1] = makeSeat(user("b"), 1);
  seats[2] = makeSeat(user("c"), 2);
  assert.equal(seatCount(seats), 3);
  assert.equal(seatIndexOf(seats, "c"), 2);
});

test("ГОЛ ЗАСВАР: дундаас хүн гарахад бусдын индекс гулсахгүй", () => {
  const seats = emptySeats();
  seats[0] = makeSeat(user("a"), 0);
  seats[1] = makeSeat(user("b"), 1);
  seats[2] = makeSeat(user("c"), 2);
  seats[3] = makeSeat(user("d"), 3);

  seats[1] = null; // B гарлаа

  assert.equal(seatIndexOf(seats, "a"), 0);
  assert.equal(seatIndexOf(seats, "b"), -1);
  assert.equal(seatIndexOf(seats, "c"), 2, "C хэвээрээ 2-т");
  assert.equal(seatIndexOf(seats, "d"), 3, "D хэвээрээ 3-т");
  assert.equal(firstFreeSeat(seats), 1, "чөлөөтэй суудал дахин ашиглагдана");
});

test("host: bot хэзээ ч host болохгүй", () => {
  const seats = emptySeats();
  seats[0] = makeSeat(user("a"), 0);
  seats[1] = makeBotSeat(1, "Болд");
  seats[2] = makeBotSeat(2, "Саруул");

  assert.equal(electHost(seats, "a"), "a");
  seats[0] = null; // цорын ганц хүн гарлаа
  assert.equal(electHost(seats, "a"), null, "хүн үлдээгүй бол host алга");
});

test("host: хүн гарвал дараагийн хүнд шилжинэ", () => {
  const seats = emptySeats();
  seats[0] = makeSeat(user("a"), 0);
  seats[1] = makeBotSeat(1, "Болд");
  seats[2] = makeSeat(user("c"), 2);
  seats[3] = makeSeat(user("d"), 3);

  assert.equal(electHost(seats, "a"), "a", "одоогийн host хэвээр");
  seats[0] = null;
  assert.equal(electHost(seats, "a"), "c", "хамгийн бага дугаартай хүн");
});

test("host: одоогийн host суудалтай хэвээр бол солигдохгүй", () => {
  const seats = emptySeats();
  seats[0] = makeSeat(user("a"), 0);
  seats[2] = makeSeat(user("c"), 2);
  assert.equal(electHost(seats, "c"), "c", "0-р суудалтай хүн байсан ч host солигдохгүй");
});

test("host-ын дохио тасарсныг таних", () => {
  const now = 1_000_000;
  assert.equal(hostIsStale(now - 5_000, now), false);
  assert.equal(hostIsStale(now - 45_000, now), true);
  assert.equal(hostIsStale(null, now), false, "хэзээ ч бичигдээгүй бол хүлээнэ");
  assert.equal(hostIsStale({ toMillis: () => now - 60_000 }, now), true, "Firestore Timestamp");
});

test("суудал ба тоглоомын төлөв зөрсөнийг барина", () => {
  const seats = emptySeats();
  seats[0] = makeSeat(user("a"), 0);
  seats[1] = makeSeat(user("b"), 1);
  const state = { players: [{ index: 0, id: "a" }, { index: 1, id: "b" }] };
  assert.equal(seatsMatchState(seats, state), true);

  seats[1] = null;
  assert.equal(seatsMatchState(seats, state), false, "B гарсныг илрүүлнэ");
});

test("Firestore-д бичих/уншихад индекс хадгалагдана", () => {
  const seats = emptySeats();
  seats[2] = makeSeat(user("c"), 2);
  const wire = serializeSeats(seats);
  assert.equal(wire.length, 4);
  assert.equal(wire[0].uid, null);
  assert.equal(wire[2].uid, "c");

  const back = deserializeSeats(wire);
  assert.equal(back[0], null);
  assert.equal(back[2].uid, "c");
  assert.equal(seatIndexOf(back, "c"), 2);
});

test("хуучин форматтай (seatIndex-гүй) өгөгдлийг байрлалаар нь уншина", () => {
  const legacy = [
    { uid: "a", name: "A", isBot: false },
    { uid: "b", name: "B", isBot: false },
  ];
  const seats = normalizeSeats(legacy);
  assert.equal(seats[0].uid, "a");
  assert.equal(seats[1].uid, "b");
  assert.equal(seats[2], null);
});

test("humanSeats нь bot-ыг тооцохгүй", () => {
  const seats = emptySeats();
  seats[0] = makeSeat(user("a"), 0);
  seats[1] = makeBotSeat(1, "Болд");
  assert.deepEqual(humanSeats(seats).map((s) => s.uid), ["a"]);
});

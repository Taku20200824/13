// Өрөөний төлөвийн симуляц — Firestore-гүйгээр гүйлгээний логикийг шалгана.
import assert from "node:assert/strict";
import test from "node:test";
import {
  SEAT_COUNT,
  emptySeats,
  makeSeat,
  makeBotSeat,
  seatIndexOf,
  firstFreeSeat,
  humanSeats,
  occupiedSeats,
  electHost,
  serializeSeats,
  deserializeSeats,
  seatsMatchState,
} from "../js/seats.js";
import { createGame, serializeGame, deserializeGame, play, pass, PHASE } from "../js/game.js";

const user = (uid, name = uid) => ({ uid, displayName: name, photoURL: null });

/** Firestore-ийн rooms/{code} баримтыг санах ойд дуурайна. */
function makeRoom(host) {
  const seats = emptySeats();
  seats[0] = makeSeat(host, 0);
  return {
    host: host.uid,
    hostSeenAt: Date.now(),
    status: "waiting",
    visibility: "public",
    allowBots: true,
    seats: serializeSeats(seats),
    members: [host.uid],
    state: null,
  };
}

function join(room, u) {
  const seats = deserializeSeats(room.seats);
  if (seatIndexOf(seats, u.uid) !== -1) return room;
  const free = firstFreeSeat(seats);
  if (free === -1) throw new Error("дүүрэн");
  seats[free] = makeSeat(u, free);
  room.seats = serializeSeats(seats);
  room.members = [...room.members, u.uid];
  room.host = electHost(seats, room.host) ?? room.host;
  return room;
}

function leave(room, uid) {
  const seats = deserializeSeats(room.seats);
  const index = seatIndexOf(seats, uid);
  if (index !== -1) seats[index] = null;
  if (humanSeats(seats).length === 0) return null; // өрөө хаагдана
  room.seats = serializeSeats(seats);
  room.members = room.members.filter((m) => m !== uid);
  room.host = electHost(seats, room.host === uid ? null : room.host);
  return room;
}

function startGame(room) {
  const seats = deserializeSeats(room.seats);
  if (room.allowBots) {
    for (let i = 0; i < SEAT_COUNT; i += 1) {
      if (!seats[i]) seats[i] = makeBotSeat(i, `Bot${i}`);
    }
  }
  const defs = seats.map((seat, index) =>
    seat ? { id: seat.uid, name: seat.name, isBot: seat.isBot } : { id: `empty-${index}`, name: "—" },
  );
  const absent = seats.map((seat, i) => (seat ? -1 : i)).filter((i) => i >= 0);
  const game = createGame(defs, { absent });
  room.seats = serializeSeats(seats);
  room.state = serializeGame(game);
  room.status = "playing";
  room.gameId = `TEST-${Date.now()}`;
  return { room, game };
}

/* ─────────────────────────────────────────────── */

test("өрөө үүсгэгч host болно", () => {
  const room = makeRoom(user("a"));
  assert.equal(room.host, "a");
  assert.equal(seatIndexOf(room.seats, "a"), 0);
});

test("нэгдсэн хүн host-ыг булаахгүй", () => {
  let room = makeRoom(user("a"));
  room = join(room, user("b"));
  room = join(room, user("c"));
  assert.equal(room.host, "a", "host хэвээр");
  assert.equal(seatIndexOf(room.seats, "b"), 1);
  assert.equal(seatIndexOf(room.seats, "c"), 2);
});

test("өрөө дүүрсэн бол 5 дахь хүн орохгүй", () => {
  let room = makeRoom(user("a"));
  ["b", "c", "d"].forEach((u) => (room = join(room, user(u))));
  assert.throws(() => join(room, user("e")), /дүүрэн/);
});

test("ГОЛ ЗАСВАР: дундаас хүн гарахад үлдсэн хүмүүсийн суудал хэвээр", () => {
  let room = makeRoom(user("a"));
  ["b", "c", "d"].forEach((u) => (room = join(room, user(u))));
  room = leave(room, "b");

  assert.equal(seatIndexOf(room.seats, "a"), 0);
  assert.equal(seatIndexOf(room.seats, "c"), 2, "C гулсаагүй");
  assert.equal(seatIndexOf(room.seats, "d"), 3, "D гулсаагүй");
  assert.equal(firstFreeSeat(room.seats), 1, "чөлөөтэй суудал дахин ашиглагдана");
});

test("host гарвал дараагийн ХҮНД шилжинэ (bot-д биш)", () => {
  let room = makeRoom(user("a"));
  room = join(room, user("c"));
  const { room: started } = startGame(room);
  // A=0, C=1 сууж, 2 ба 3-р суудлыг bot эзэлнэ
  const seats = deserializeSeats(started.seats);
  assert.equal(seats[2].isBot, true);
  assert.equal(seats[3].isBot, true);

  const after = leave(started, "a");
  assert.equal(after.host, "c", "bot биш, хүн host болно");
});

test("сүүлчийн хүн гарахад өрөө хаагдана (bot дангаараа үлдэхгүй)", () => {
  let room = makeRoom(user("a"));
  const { room: started } = startGame(room);
  assert.equal(leave(started, "a"), null, "өрөө устна");
});

test("тоглоом эхлэхэд суудал ба тоглогчийн index яг таарна", () => {
  let room = makeRoom(user("a"));
  room = join(room, user("b"));
  const { room: started, game } = startGame(room);
  assert.equal(seatsMatchState(started.seats, started.state), true);
  game.players.forEach((p, i) => {
    const seat = deserializeSeats(started.seats)[i];
    assert.equal(seat.uid, p.id, `${i}-р суудал`);
  });
});

test("тоглоом эхлэхэд гар нь өөрийн суудлын дугаараар хадгалагдана", () => {
  let room = makeRoom(user("a"));
  room = join(room, user("b"));
  const { room: started, game } = startGame(room);
  const seats = deserializeSeats(started.seats);

  const hands = {};
  game.players.forEach((p) => {
    if (seats[p.index]) hands[p.index] = { uid: seats[p.index].uid, cards: p.hand };
  });

  assert.equal(hands[0].uid, "a");
  assert.equal(hands[1].uid, "b");
  assert.equal(hands[0].cards.length, 13);
  // A-гийн гар B-д харагдахгүй
  assert.notDeepEqual(hands[0].cards.map((c) => c.id), hands[1].cards.map((c) => c.id));
});

test("хүн гарсны дараа ч бусад тоглогч ЗӨВ гараа уншина", () => {
  let room = makeRoom(user("a"));
  ["b", "c", "d"].forEach((u) => (room = join(room, user(u))));
  const { room: started, game } = startGame(room);

  const cHandBefore = game.players[2].hand.map((x) => x.id);
  const after = leave(started, "b");

  // C-гийн суудал 2 хэвээр тул түүний гарын баримт мөн 2 хэвээр
  assert.equal(seatIndexOf(after.seats, "c"), 2);
  const view = deserializeGame(after.state, { 2: game.players[2].hand });
  assert.deepEqual(view.players[2].hand.map((x) => x.id), cHandBefore);
  assert.equal(view.players[2].id, "c", "2-р тоглогч мөн C хэвээр");
});

test("хоосон суудалтай эхэлсэн тоглоом гацахгүй", () => {
  let room = makeRoom(user("a"));
  room = join(room, user("b"));
  room.allowBots = false; // bot-оор нөхөхгүй → 2, 3-р суудал хоосон
  const { game } = startGame(room);

  assert.equal(game.players[2].eliminated, true);
  assert.equal(game.players[3].eliminated, true);
  assert.ok(!game.players[game.turn].eliminated, "ээлж хоосон суудалд очихгүй");

  // Хоёр хүн ээлжлэн тоглоод үе дуусна
  let guard = 0;
  while (game.phase === PHASE.PLAYING && guard < 200) {
    guard += 1;
    const me = game.turn;
    assert.ok(!game.players[me].eliminated, "хоосон суудал ээлж авахгүй");
    const hand = game.players[me].hand;
    let moved = false;
    for (const card of hand) {
      if (play(game, me, [card]).ok) {
        moved = true;
        break;
      }
    }
    if (!moved && !pass(game, me).ok) break;
  }
  assert.notEqual(game.phase, PHASE.PLAYING, "үе дуусав");
});

test("зэрэг нэгдэх ба эхлүүлэх — гүйлгээгүй бол тоглогч алдагдана", () => {
  // Хуучин алдааг баримтжуулсан тест: seats-ийг хуулж аваад дарж бичих
  let room = makeRoom(user("a"));
  const stale = deserializeSeats(room.seats); // host эхлүүлэхээр хуулж авав
  room = join(room, user("b")); // яг тэр агшинд B нэгдэв

  // Хуучин арга: хуулсан seats-ээ дарж бичнэ → B алга болно
  const overwritten = serializeSeats(stale);
  assert.equal(seatIndexOf(overwritten, "b"), -1, "хуучин аргаар B алдагдана");

  // Шинэ арга: гүйлгээ дотор ШИНЭ утгыг уншина → B үлдэнэ
  const fresh = deserializeSeats(room.seats);
  assert.equal(seatIndexOf(fresh, "b"), 1, "гүйлгээгээр B хадгалагдана");
});

test("bot дүүргэлт зөвхөн хоосон суудлыг эзэлнэ", () => {
  let room = makeRoom(user("a"));
  room = join(room, user("b"));
  room = join(room, user("c"));
  room = leave(room, "b"); // 1-р суудал чөлөөтэй боллоо
  const { room: started } = startGame(room);
  const seats = deserializeSeats(started.seats);

  assert.equal(seats[0].uid, "a");
  assert.equal(seats[1].isBot, true, "чөлөөтэй 1-р суудлыг bot эзэлнэ");
  assert.equal(seats[2].uid, "c", "C хэвээрээ 2-т");
  assert.equal(seats[3].isBot, true);
  assert.equal(occupiedSeats(seats).length, 4);
});

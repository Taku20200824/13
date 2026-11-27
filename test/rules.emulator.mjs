// Firestore дүрмийг ЖИНХЭНЭ emulator дээр шалгана — халдлага бүрийг
// бодитоор оролдож, хориглогдож байгааг, мөн апп-ын хэвийн бичилтүүд
// (js/firebase.js-тэй ижил хэлбэрээр) зөвшөөрөгдөж байгааг батална.
//
// Ажиллуулах:  npm run test:rules   (Java 11+ шаардлагатай)
import test, { before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { emptySeats, makeSeat, makeBotSeat, serializeSeats } from "../js/seats.js";
import { createGame, serializeGame } from "../js/game.js";

let env;

const google = (uid) =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: "google.com" } }).firestore();
const anon = (uid) =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();

const human = (uid, i) => makeSeat({ uid, displayName: uid, photoURL: null }, i);

/** Өрөөний баримтыг дүрэм идэвхгүйгээр бэлдэнэ. */
async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

function seatsOf(list) {
  const seats = emptySeats();
  list.forEach((s, i) => {
    if (!s) return;
    seats[i] = s === "bot" ? makeBotSeat(i, `Bot${i}`) : human(s, i);
  });
  return serializeSeats(seats);
}

function waitingRoom(overrides = {}) {
  return {
    code: "ROOM01",
    host: "alice",
    hostSeenAt: Timestamp.now(),
    status: "waiting",
    visibility: "public",
    allowBots: true,
    botLevel: "hard",
    seats: seatsOf(["alice", "bob"]),
    members: ["alice", "bob"],
    state: null,
    stateVersion: 0,
    ...overrides,
  };
}

function playingState(ids, turn = 0) {
  const game = createGame(ids.map((id) => ({ id, name: id, isBot: id.startsWith("bot-") })));
  game.turn = turn;
  return serializeGame(game);
}

function endedState(ids, { winner, scores }) {
  const state = playingState(ids);
  state.phase = "gameEnd";
  state.round = 4;
  state.players = state.players.map((p, i) => ({ ...p, score: scores[i] }));
  state.gameWinner = winner ? { id: winner, name: winner } : null;
  return state;
}

const freshProfile = (anonymous = false) => ({
  displayName: "Alice",
  photoURL: null,
  anonymous,
  games: 0,
  wins: 0,
  losses: 0,
  rounds: 0,
  roundWins: 0,
  points: 0,
  rating: 0,
  recordedGames: [],
  updatedAt: serverTimestamp(),
});

const rating = (s) => s.wins * 100 + s.roundWins * 20 - s.points * 3 - s.losses * 25;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-huzur",
    firestore: {
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 8085,
    },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

/* ══════════ users: ranking-ийг хуурах ══════════ */

test("users: шинэ профайл үүсгэж болно", async () => {
  await assertSucceeds(setDoc(doc(google("alice"), "users/alice"), freshProfile()));
});

test("users: оноотой профайл үүсгэж ranking хуурах — ХОРИГ", async () => {
  await assertFails(
    setDoc(doc(google("alice"), "users/alice"), { ...freshProfile(), wins: 50, rating: 5000 }),
  );
});

test("users: зочин өөрийгөө Google гэж зарлах — ХОРИГ", async () => {
  await assertFails(setDoc(doc(anon("guest"), "users/guest"), freshProfile(false)));
  await assertSucceeds(setDoc(doc(anon("guest"), "users/guest"), freshProfile(true)));
});

test("users: бусдын профайлыг бичих — ХОРИГ", async () => {
  await seed("users/bob", { ...freshProfile(), displayName: "Bob" });
  await assertFails(updateDoc(doc(google("alice"), "users/bob"), { displayName: "lol" }));
});

test("users: wins/rating-ийг шууд өөрчлөх — ХОРИГ", async () => {
  await seed("users/alice", freshProfile());
  const db = google("alice");
  await assertFails(updateDoc(doc(db, "users/alice"), { wins: 9999 }));
  await assertFails(updateDoc(doc(db, "users/alice"), { rating: 9999 }));
  await assertFails(updateDoc(doc(db, "users/alice"), { anonymous: true, rating: 0 }));
});

test("users: нэрээ солих (ensureProfile) — зөвшөөрнө", async () => {
  await seed("users/alice", freshProfile());
  await assertSucceeds(
    updateDoc(doc(google("alice"), "users/alice"), {
      displayName: "Alice 2",
      photoURL: "https://example.com/a.png",
      anonymous: false,
      updatedAt: serverTimestamp(),
    }),
  );
});

test("users: хуучин профайлын дутуу талбарыг нөхөх — зөвшөөрнө", async () => {
  const legacy = { displayName: "Old", anonymous: false, games: 5, wins: 2, rounds: 9, roundWins: 3, points: 40 };
  await seed("users/alice", legacy);
  const losses = 3;
  await assertSucceeds(
    updateDoc(doc(google("alice"), "users/alice"), {
      displayName: "Old",
      anonymous: false,
      losses,
      recordedGames: [],
      rating: rating({ ...legacy, losses }),
      updatedAt: serverTimestamp(),
    }),
  );
});

/* ══════════ users: тоглоомын үр дүн ══════════ */

const GID = "ROOM01-1700000000000";

async function seedEndedGame({ winner = "alice", scores = [0, 18, 0, 0], seats = ["alice", "bob", "bot", "bot"] } = {}) {
  const ids = seats.map((s, i) => (s === "bot" ? `bot-${i}` : s));
  await seed("rooms/ROOM01", waitingRoom({
    status: "playing",
    seats: seatsOf(seats),
    members: seats.filter((s) => s !== "bot"),
    gameId: GID,
    stateVersion: 30,
    state: endedState(ids, { winner, scores }),
  }));
}

/** js/firebase.js recordResult-тэй ижил бичилт */
function recordBatch(db, uid, { won, points, rounds = 4, roundWins = 2, seat = 0, gid = GID, base = freshProfile() }) {
  const next = {
    games: base.games + 1,
    wins: base.wins + (won ? 1 : 0),
    losses: base.losses + (won ? 0 : 1),
    rounds: base.rounds + rounds,
    roundWins: base.roundWins + roundWins,
    points: base.points + points,
  };
  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid), {
    ...next,
    rating: rating(next),
    recordedGames: [gid],
    lastGameId: gid,
    lastGameRoom: "ROOM01",
    lastGameSeat: seat,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "users", uid, "games", gid), { won, at: serverTimestamp() });
  return batch.commit();
}

test("үр дүн: үнэн ялалтыг бүртгэнэ", async () => {
  await seed("users/alice", freshProfile());
  await seedEndedGame();
  await assertSucceeds(recordBatch(google("alice"), "alice", { won: true, points: 0 }));
});

test("үр дүн: ялагдагч нь оноогоо бүртгэнэ", async () => {
  await seed("users/bob", { ...freshProfile(), displayName: "Bob" });
  await seedEndedGame();
  await assertSucceeds(recordBatch(google("bob"), "bob", { won: false, points: 18, seat: 1, roundWins: 0 }));
});

test("үр дүн: нэг тоглоомыг ХОЁР удаа бүртгэх — ХОРИГ", async () => {
  await seed("users/alice", freshProfile());
  await seedEndedGame();
  const db = google("alice");
  await assertSucceeds(recordBatch(db, "alice", { won: true, points: 0 }));
  const after = (await env.withSecurityRulesDisabled(async (ctx) =>
    (await getDoc(doc(ctx.firestore(), "users/alice"))).data()));
  await assertFails(recordBatch(db, "alice", { won: true, points: 0, base: after }));
});

test("үр дүн: ялаагүй байж ялсан гэж бүртгэх — ХОРИГ", async () => {
  await seed("users/bob", { ...freshProfile(), displayName: "Bob" });
  await seedEndedGame({ winner: "alice" });
  await assertFails(recordBatch(google("bob"), "bob", { won: true, points: 18, seat: 1, roundWins: 0 }));
});

test("үр дүн: торгуулийн оноогоо багасгах — ХОРИГ", async () => {
  await seed("users/bob", { ...freshProfile(), displayName: "Bob" });
  await seedEndedGame();
  await assertFails(recordBatch(google("bob"), "bob", { won: false, points: 0, seat: 1, roundWins: 0 }));
});

test("үр дүн: бусдын суудлыг өөрийнх гэж заах — ХОРИГ", async () => {
  await seed("users/bob", { ...freshProfile(), displayName: "Bob" });
  await seedEndedGame();
  await assertFails(recordBatch(google("bob"), "bob", { won: true, points: 0, seat: 0 }));
});

test("үр дүн: дуусаагүй тоглоомыг бүртгэх — ХОРИГ", async () => {
  await seed("users/alice", freshProfile());
  await seed("rooms/ROOM01", waitingRoom({
    status: "playing", gameId: GID, stateVersion: 3,
    seats: seatsOf(["alice", "bob"]), state: playingState(["alice", "bob"]),
  }));
  await assertFails(recordBatch(google("alice"), "alice", { won: true, points: 0 }));
});

test("үр дүн: ганц хүн bot-той тоглоод ranking цуглуулах — ХОРИГ", async () => {
  await seed("users/alice", freshProfile());
  await seedEndedGame({ seats: ["alice", "bot", "bot", "bot"] });
  await assertFails(recordBatch(google("alice"), "alice", { won: true, points: 0 }));
});

test("үр дүн: зочин ranking-д бүртгэх — ХОРИГ", async () => {
  await seed("users/alice", freshProfile(true));
  await seedEndedGame();
  await assertFails(recordBatch(anon("alice"), "alice", { won: true, points: 0 }));
});

test("үр дүн: games баримтыг тусад нь урьдчилан үүсгэх — ХОРИГ", async () => {
  await seed("users/alice", freshProfile());
  await assertFails(setDoc(doc(google("alice"), "users/alice/games/ANY"), { won: true }));
});

/* ══════════ rooms: хувийн өрөө ══════════ */

test("rooms: хувийн өрөөг жагсаалтаар олох — ХОРИГ", async () => {
  await seed("rooms/SECRET", waitingRoom({ code: "SECRET", visibility: "private" }));
  const db = google("mallory");
  await assertFails(getDocs(collection(db, "rooms")));
  await assertFails(getDocs(query(collection(db, "rooms"), where("visibility", "==", "private"))));
});

test("rooms: public жагсаалт ба өөрийн өрөөг хайх — зөвшөөрнө", async () => {
  await seed("rooms/SECRET", waitingRoom({ code: "SECRET", visibility: "private" }));
  await seed("rooms/OPEN01", waitingRoom({ code: "OPEN01" }));
  const pub = await assertSucceeds(
    getDocs(query(collection(google("mallory"), "rooms"), where("visibility", "==", "public"))),
  );
  if (pub.docs.some((d) => d.id === "SECRET")) throw new Error("хувийн өрөө задарсан");
  const mine = await assertSucceeds(
    getDocs(query(collection(google("bob"), "rooms"), where("members", "array-contains", "bob"))),
  );
  if (mine.size !== 2) throw new Error(`bob 2 өрөөтэй байх ёстой, ${mine.size}`);
});

test("rooms: кодыг мэдэж байвал орж болно (get)", async () => {
  await seed("rooms/SECRET", waitingRoom({ code: "SECRET", visibility: "private" }));
  await assertSucceeds(getDoc(doc(google("carol"), "rooms/SECRET")));
});

test("rooms: өрөө үүсгэх (createRoom) — зөвшөөрнө", async () => {
  await assertSucceeds(setDoc(doc(google("alice"), "rooms/NEW001"), {
    code: "NEW001", host: "alice", hostSeenAt: serverTimestamp(), status: "waiting",
    visibility: "private", allowBots: true, botLevel: "hard",
    seats: seatsOf(["alice"]), members: ["alice"], state: null, stateVersion: 0,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
});

test("rooms: бусдыг гишүүнээр оруулж өрөө үүсгэх — ХОРИГ", async () => {
  await assertFails(setDoc(doc(google("alice"), "rooms/NEW001"), {
    code: "NEW001", host: "alice", status: "waiting", visibility: "public",
    seats: seatsOf(["alice", "bob"]), members: ["alice", "bob"], state: null, stateVersion: 0,
  }));
});

/* ══════════ rooms: нэгдэх ══════════ */

test("rooms: хоосон суудалд нэгдэх (joinRoom) — зөвшөөрнө", async () => {
  await seed("rooms/ROOM01", waitingRoom());
  await assertSucceeds(updateDoc(doc(google("carol"), "rooms/ROOM01"), {
    seats: seatsOf(["alice", "bob", "carol"]),
    members: ["alice", "bob", "carol"],
    updatedAt: serverTimestamp(),
  }));
});

test("rooms: нэгдэхдээ бусдын суудлыг булаах — ХОРИГ", async () => {
  await seed("rooms/ROOM01", waitingRoom());
  await assertFails(updateDoc(doc(google("carol"), "rooms/ROOM01"), {
    seats: seatsOf(["alice", "carol"]),
    members: ["alice", "bob", "carol"],
  }));
});

test("rooms: нэгдэхдээ бусдыг хөөх — ХОРИГ", async () => {
  await seed("rooms/ROOM01", waitingRoom());
  await assertFails(updateDoc(doc(google("carol"), "rooms/ROOM01"), {
    seats: seatsOf(["alice", null, "carol"]),
    members: ["alice", "carol"],
  }));
});

test("rooms: нэгдэхдээ host/status/state хөндөх — ХОРИГ", async () => {
  await seed("rooms/ROOM01", waitingRoom());
  const base = { seats: seatsOf(["alice", "bob", "carol"]), members: ["alice", "bob", "carol"] };
  const db = google("carol");
  await assertFails(updateDoc(doc(db, "rooms/ROOM01"), { ...base, host: "carol" }));
  await assertFails(updateDoc(doc(db, "rooms/ROOM01"), { ...base, status: "playing" }));
  await assertFails(updateDoc(doc(db, "rooms/ROOM01"), { ...base, state: { x: 1 }, stateVersion: 1 }));
});

test("rooms: эхэлсэн тоглоомд нэгдэх — ХОРИГ", async () => {
  await seed("rooms/ROOM01", waitingRoom({ status: "playing", state: playingState(["alice", "bob"]), stateVersion: 1 }));
  await assertFails(updateDoc(doc(google("carol"), "rooms/ROOM01"), {
    seats: seatsOf(["alice", "bob", "carol"]),
    members: ["alice", "bob", "carol"],
  }));
});

/* ══════════ rooms: гишүүн ══════════ */

test("rooms: гишүүн тохиргоо/статус өөрчлөх — ХОРИГ", async () => {
  await seed("rooms/ROOM01", waitingRoom());
  const db = google("bob");
  await assertFails(updateDoc(doc(db, "rooms/ROOM01"), { status: "playing" }));
  await assertFails(updateDoc(doc(db, "rooms/ROOM01"), { visibility: "private" }));
  await assertFails(updateDoc(doc(db, "rooms/ROOM01"), { allowBots: false }));
});

test("rooms: гишүүн бусдын суудлыг өөрчлөх — ХОРИГ", async () => {
  await seed("rooms/ROOM01", waitingRoom({ seats: seatsOf(["alice", "bob", "carol"]), members: ["alice", "bob", "carol"] }));
  await assertFails(updateDoc(doc(google("bob"), "rooms/ROOM01"), {
    seats: seatsOf(["alice", "bob", null]),
    members: ["alice", "bob"],
  }));
});

test("rooms: гишүүн гарах (leaveRoom) — зөвшөөрнө", async () => {
  await seed("rooms/ROOM01", waitingRoom());
  await assertSucceeds(updateDoc(doc(google("bob"), "rooms/ROOM01"), {
    seats: seatsOf(["alice", null]),
    members: ["alice"],
    updatedAt: serverTimestamp(),
  }));
});

test("rooms: тоглоом дундаас гарвал суудал bot болно — зөвшөөрнө", async () => {
  await seed("rooms/ROOM01", waitingRoom({ status: "playing", state: playingState(["alice", "bob"]), stateVersion: 2 }));
  const seats = seatsOf(["alice", "bob"]);
  seats[1] = { ...seats[1], isBot: true };
  await assertSucceeds(updateDoc(doc(google("bob"), "rooms/ROOM01"), {
    seats, members: ["alice"], updatedAt: serverTimestamp(),
  }));
});

test("rooms: сүүлчийн хүн гарахад өрөөг устгана — зөвшөөрнө", async () => {
  // host суудалгүй (аль хэдийн гарсан), bob ганцаараа үлдсэн
  await seed("rooms/ROOM01", waitingRoom({ seats: seatsOf([null, "bob"]), members: ["bob"] }));
  await assertSucceeds(deleteDoc(doc(google("bob"), "rooms/ROOM01")));
});

test("rooms: бусад хүн байхад гишүүн өрөөг устгах — ХОРИГ", async () => {
  await seed("rooms/ROOM01", waitingRoom());
  await assertFails(deleteDoc(doc(google("bob"), "rooms/ROOM01")));
});

/* ══════════ rooms: host булаах ══════════ */

test("rooms: host-ыг null болгох — ХОРИГ", async () => {
  await seed("rooms/ROOM01", waitingRoom());
  await assertFails(updateDoc(doc(google("bob"), "rooms/ROOM01"), { host: null }));
});

test("rooms: идэвхтэй host-ыг булаах — ХОРИГ", async () => {
  await seed("rooms/ROOM01", waitingRoom());
  await assertFails(updateDoc(doc(google("bob"), "rooms/ROOM01"), {
    host: "bob", hostSeenAt: serverTimestamp(),
  }));
});

test("rooms: host 30 сек дохиогүй бол дараагийн хүн авна (claimHostIfStale)", async () => {
  await seed("rooms/ROOM01", waitingRoom({
    seats: seatsOf(["alice", "bob", "carol"]),
    members: ["alice", "bob", "carol"],
    hostSeenAt: Timestamp.fromMillis(Date.now() - 60_000),
  }));
  // carol бол дараагийнх биш — bob (1-р суудал) л авна
  await assertFails(updateDoc(doc(google("carol"), "rooms/ROOM01"), {
    host: "carol", hostSeenAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(google("bob"), "rooms/ROOM01"), {
    host: "bob", hostSeenAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
});

test("rooms: host суудалгүй болсон бол дараагийн хүн авна", async () => {
  await seed("rooms/ROOM01", waitingRoom({ seats: seatsOf([null, "bob", "carol"]), members: ["bob", "carol"] }));
  await assertSucceeds(updateDoc(doc(google("bob"), "rooms/ROOM01"), {
    host: "bob", hostSeenAt: serverTimestamp(),
  }));
});

test("rooms: host өөр хүнд эсвэл bot-д шилжүүлэх — зөвхөн суудалтай хүнд", async () => {
  await seed("rooms/ROOM01", waitingRoom());
  const db = google("alice");
  await assertFails(updateDoc(doc(db, "rooms/ROOM01"), { host: "mallory" }));
  await assertSucceeds(updateDoc(doc(db, "rooms/ROOM01"), { host: "bob" }));
});

/* ══════════ rooms: нүүдэл ══════════ */

test("rooms: өөрийн ээлжээр нүүх (commitMove) — зөвшөөрнө", async () => {
  await seed("rooms/ROOM01", waitingRoom({ status: "playing", state: playingState(["alice", "bob"], 1), stateVersion: 5 }));
  await assertSucceeds(updateDoc(doc(google("bob"), "rooms/ROOM01"), {
    state: playingState(["alice", "bob"], 0), stateVersion: 6, updatedAt: serverTimestamp(),
  }));
});

test("rooms: бусдын ээлжээр нүүх — ХОРИГ", async () => {
  await seed("rooms/ROOM01", waitingRoom({ status: "playing", state: playingState(["alice", "bob"], 0), stateVersion: 5 }));
  await assertFails(updateDoc(doc(google("bob"), "rooms/ROOM01"), {
    state: playingState(["alice", "bob"], 1), stateVersion: 6,
  }));
});

test("rooms: хувилбарыг ухраах/алгасах — ХОРИГ", async () => {
  await seed("rooms/ROOM01", waitingRoom({ status: "playing", state: playingState(["alice", "bob"], 1), stateVersion: 5 }));
  const db = google("bob");
  await assertFails(updateDoc(doc(db, "rooms/ROOM01"), { state: playingState(["alice", "bob"], 0), stateVersion: 5 }));
  await assertFails(updateDoc(doc(db, "rooms/ROOM01"), { state: playingState(["alice", "bob"], 0), stateVersion: 99 }));
});

test("rooms: host тоглоом эхлүүлэх (startGameTransaction) — зөвшөөрнө", async () => {
  await seed("rooms/ROOM01", waitingRoom());
  await assertSucceeds(updateDoc(doc(google("alice"), "rooms/ROOM01"), {
    status: "playing",
    seats: seatsOf(["alice", "bob", "bot", "bot"]),
    state: playingState(["alice", "bob", "bot-2", "bot-3"]),
    stateVersion: 1,
    startedAt: Date.now(),
    gameId: `ROOM01-${Date.now()}`,
    hostSeenAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
});

/* ══════════ hands: хөзөр ══════════ */

const card = (rank, suit) => ({ id: `${rank}${suit}`, rank, suit });
const HAND = [card("3", "S"), card("7", "H"), card("2", "S")];

async function seedHands() {
  await seed("rooms/ROOM01", waitingRoom({
    status: "playing",
    seats: seatsOf(["alice", "bob", "bot", null]),
    state: playingState(["alice", "bob", "bot-2", "empty-3"], 1),
    stateVersion: 3,
  }));
  await seed("rooms/ROOM01/hands/0", { uid: "alice", cards: HAND });
  await seed("rooms/ROOM01/hands/1", { uid: "bob", cards: HAND });
  await seed("rooms/ROOM01/hands/2", { uid: "bot-2", cards: HAND });
}

test("hands: өөрийн гарыг уншина", async () => {
  await seedHands();
  await assertSucceeds(getDoc(doc(google("bob"), "rooms/ROOM01/hands/1")));
});

test("hands: host хүний гарыг харах — ХОРИГ", async () => {
  await seedHands();
  await assertFails(getDoc(doc(google("alice"), "rooms/ROOM01/hands/1")));
});

test("hands: гишүүн бусдын гарыг харах — ХОРИГ", async () => {
  await seedHands();
  await assertFails(getDoc(doc(google("bob"), "rooms/ROOM01/hands/0")));
  await assertFails(getDoc(doc(google("bob"), "rooms/ROOM01/hands/2")));
});

test("hands: host bot-ын гарыг уншиж, нүүдлийг нь бичнэ", async () => {
  await seedHands();
  const db = google("alice");
  await assertSucceeds(getDoc(doc(db, "rooms/ROOM01/hands/2")));
  await assertSucceeds(setDoc(doc(db, "rooms/ROOM01/hands/2"), { uid: "bot-2", cards: HAND.slice(1) }));
});

test("hands: гартаа хөзөр НЭМЭХ — ХОРИГ", async () => {
  await seedHands();
  await assertFails(setDoc(doc(google("bob"), "rooms/ROOM01/hands/1"), {
    uid: "bob", cards: [...HAND, card("2", "H")],
  }));
  await assertFails(setDoc(doc(google("bob"), "rooms/ROOM01/hands/1"), {
    uid: "bob", cards: [card("2", "H"), card("2", "D")],
  }));
});

test("hands: хөзөр тавихад гараас хасна (commitMove) — зөвшөөрнө", async () => {
  await seedHands();
  await assertSucceeds(setDoc(doc(google("bob"), "rooms/ROOM01/hands/1"), { uid: "bob", cards: HAND.slice(0, 2) }));
  await assertSucceeds(setDoc(doc(google("bob"), "rooms/ROOM01/hands/1"), { uid: "bob", cards: HAND.slice(0, 2) }));
});

test("hands: бусдын гарыг дарж бичих — ХОРИГ", async () => {
  await seedHands();
  await assertFails(setDoc(doc(google("bob"), "rooms/ROOM01/hands/0"), { uid: "alice", cards: [] }));
  await assertFails(setDoc(doc(google("bob"), "rooms/ROOM01/hands/0"), { uid: "bob", cards: [] }));
});

test("hands: host тараах (writeHands) — зөвшөөрнө", async () => {
  await seed("rooms/ROOM01", waitingRoom({
    status: "playing", seats: seatsOf(["alice", "bob", "bot", "bot"]),
    state: playingState(["alice", "bob", "bot-2", "bot-3"]), stateVersion: 1,
  }));
  const db = google("alice");
  const batch = writeBatch(db);
  ["alice", "bob", "bot-2", "bot-3"].forEach((uid, i) =>
    batch.set(doc(db, "rooms/ROOM01/hands", String(i)), { uid, cards: HAND }));
  await assertSucceeds(batch.commit());
});

/* ══════════ presence ══════════ */

test("presence: хувийн өрөөний кодыг нийтлэх — ХОРИГ", async () => {
  await seed("rooms/SECRET", waitingRoom({ code: "SECRET", visibility: "private" }));
  await assertFails(setDoc(doc(google("alice"), "presence/alice"), {
    uid: "alice", lastSeen: Date.now(), roomCode: "SECRET", inRoom: true, roomPublic: false, inGame: false, name: "A",
  }));
});

test("presence: public өрөө эсвэл кодгүй — зөвшөөрнө", async () => {
  await seed("rooms/OPEN01", waitingRoom({ code: "OPEN01" }));
  const db = google("alice");
  await assertSucceeds(setDoc(doc(db, "presence/alice"), {
    uid: "alice", lastSeen: Date.now(), roomCode: "OPEN01", inRoom: true, roomPublic: true, inGame: false, name: "A",
  }));
  await assertSucceeds(setDoc(doc(db, "presence/alice"), {
    uid: "alice", lastSeen: Date.now(), roomCode: null, inRoom: true, roomPublic: false, inGame: true, name: "A",
  }));
});

/* ══════════ chat ══════════ */

test("chat: хувийн өрөөний chat-ийг гадны хүн унших — ХОРИГ", async () => {
  await seed("rooms/SECRET", waitingRoom({ code: "SECRET", visibility: "private" }));
  await seed("rooms/SECRET/messages/m1", { uid: "alice", text: "hi", createdMs: Date.now() });
  await assertFails(getDoc(doc(google("mallory"), "rooms/SECRET/messages/m1")));
  await assertSucceeds(getDoc(doc(google("bob"), "rooms/SECRET/messages/m1")));
});

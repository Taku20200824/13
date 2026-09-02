// Firebase давхарга — нэвтрэлт, өрөө, ranking.
// Тохиргоо байхгүй бол бүх функц "офлайн" горимд эелдэгээр унтарна.
import { firebaseConfig, isConfigured } from "./firebase-config.js";
import {
  SEAT_COUNT,
  emptySeats,
  normalizeSeats,
  deserializeSeats,
  serializeSeats,
  makeSeat,
  seatIndexOf,
  firstFreeSeat,
  seatCount,
  humanSeats,
  electHost,
  hostIsStale,
} from "./seats.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

let app = null;
let auth = null;
let db = null;
let mod = null; // ачаалсан SDK функцууд

export const online = isConfigured;

export async function initFirebase() {
  if (!isConfigured) return null;
  if (app) return { app, auth, db };

  const [core, authMod, storeMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);

  app = core.initializeApp(firebaseConfig);
  auth = authMod.getAuth(app);
  db = storeMod.getFirestore(app);
  mod = { ...authMod, ...storeMod };
  return { app, auth, db };
}

/* ── Нэвтрэлт ────────────────────────────────────── */

export function onAuth(callback) {
  if (!auth) return () => {};
  return mod.onAuthStateChanged(auth, callback);
}

export async function signInGoogle() {
  await initFirebase();
  const provider = new mod.GoogleAuthProvider();
  const { user } = await mod.signInWithPopup(auth, provider);
  await ensureProfile(user, user.displayName);
  return user;
}

export async function signInGuest(name) {
  await initFirebase();
  const { user } = await mod.signInAnonymously(auth);
  await mod.updateProfile(user, { displayName: name });
  await ensureProfile(user, name);
  return user;
}

export async function signOutUser() {
  if (auth) await mod.signOut(auth);
}

/* ── Профайл ба ranking ──────────────────────────── */

const userRef = (uid) => mod.doc(db, "users", uid);

export async function ensureProfile(user, name) {
  const ref = userRef(user.uid);
  const snap = await mod.getDoc(ref);
  const displayName = name || user.displayName || "Зочин";
  if (!snap.exists()) {
    await mod.setDoc(ref, {
      displayName,
      photoURL: user.photoURL ?? null,
      anonymous: user.isAnonymous,
      games: 0,
      wins: 0,
      losses: 0,
      rounds: 0,
      roundWins: 0,
      points: 0,
      recordedGames: [],
      updatedAt: mod.serverTimestamp(),
    });
  } else {
    const patch = { displayName, updatedAt: mod.serverTimestamp() };
    // Хуучин профайлд дутуу талбаруудыг нөхнө
    const data = snap.data();
    if (typeof data.losses !== "number") patch.losses = Math.max(0, (data.games ?? 0) - (data.wins ?? 0));
    if (!Array.isArray(data.recordedGames)) patch.recordedGames = [];
    await mod.updateDoc(ref, patch);
  }
}

export async function getProfile(uid) {
  const snap = await mod.getDoc(userRef(uid));
  return snap.exists() ? snap.data() : null;
}

/**
 * Тоглоомын үр дүнг ranking-д НЭГ УДАА бүртгэнэ.
 *
 * `gameId` нь тоглоом бүрийн давтагдашгүй түлхүүр. Хэрэв тухайн түлхүүр
 * аль хэдийн бүртгэгдсэн бол дахин нэмэхгүй — өмнө нь өрөөнд дахин
 * ороход оноо давхар нэмэгддэг байсан.
 *
 * @param {string} uid
 * @param {{gameId:string, won:boolean, roundWins:number, rounds:number, points:number}} stats
 * @returns {Promise<boolean>} шинээр бүртгэсэн эсэх
 */
export async function recordResult(uid, stats) {
  if (!db || !stats?.gameId) return false;
  let recorded = false;

  await mod.runTransaction(db, async (tx) => {
    const ref = userRef(uid);
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : null;

    if (data?.recordedGames?.includes(stats.gameId)) return; // давхардлаас хамгаална

    const base = data ?? { games: 0, wins: 0, losses: 0, rounds: 0, roundWins: 0, points: 0 };
    // Сүүлийн 50 тоглоомын түлхүүр л хангалттай — баримт хэт томроохгүй
    const history = [...(data?.recordedGames ?? []), stats.gameId].slice(-50);

    const patch = {
      games: (base.games ?? 0) + 1,
      wins: (base.wins ?? 0) + (stats.won ? 1 : 0),
      losses: (base.losses ?? 0) + (stats.won ? 0 : 1),
      rounds: (base.rounds ?? 0) + (stats.rounds ?? 0),
      roundWins: (base.roundWins ?? 0) + (stats.roundWins ?? 0),
      points: (base.points ?? 0) + (stats.points ?? 0),
      recordedGames: history,
      updatedAt: mod.serverTimestamp(),
    };

    if (snap.exists()) tx.update(ref, patch);
    else tx.set(ref, { displayName: stats.name ?? "Зочин", photoURL: null, anonymous: true, ...patch });
    recorded = true;
  });

  return recorded;
}

/**
 * Ranking. Ганц талбараар эрэмбэлж байгаа тул composite index шаардахгүй —
 * өмнө нь `wins desc, games desc` гэсэн хос эрэмбэ индекс шаардаж,
 * индекс байхгүй үед бүхэл жагсаалт унадаг байсан.
 */
export async function fetchLeaderboard(max = 20) {
  if (!db) return [];
  const q = mod.query(mod.collection(db, "users"), mod.orderBy("wins", "desc"), mod.limit(max));
  const snap = await mod.getDocs(q);
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((row) => (row.games ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.wins ?? 0) - (a.wins ?? 0) ||
        (b.games ?? 0) - (a.games ?? 0) ||
        (a.points ?? 0) - (b.points ?? 0), // оноо бага нь дээр
    );
}

/* ── Өрөө ────────────────────────────────────────── */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // I, O, 0, 1 хассан
const makeCode = () =>
  Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

const roomRef = (code) => mod.doc(db, "rooms", code);
const handRef = (code, index) => mod.doc(db, "rooms", code, "hands", String(index));
const roomMessagesRef = (code) => mod.collection(db, "rooms", code, "messages");
const publicChatRef = () => mod.collection(db, "publicChat");

export async function createRoom(user, options = {}) {
  const seats = emptySeats();
  seats[0] = makeSeat(user, 0);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = makeCode();
    const ref = roomRef(code);
    const existing = await mod.getDoc(ref);
    if (existing.exists()) continue;
    await mod.setDoc(ref, {
      code,
      host: user.uid,
      hostSeenAt: Date.now(),
      status: "waiting",
      visibility: options.visibility === "public" ? "public" : "private",
      allowBots: options.allowBots ?? true,
      seats: serializeSeats(seats),
      members: [user.uid],
      state: null,
      createdAt: mod.serverTimestamp(),
      updatedAt: mod.serverTimestamp(),
    });
    return code;
  }
  throw new Error("Өрөөний код үүсгэж чадсангүй. Дахин оролдоно уу.");
}

export async function joinRoom(code, user) {
  const ref = roomRef(code);
  await mod.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Ийм кодтой өрөө олдсонгүй.");
    const data = snap.data();
    const seats = deserializeSeats(data.seats);

    // Аль хэдийн суудалтай бол дахин элсүүлэхгүй (дахин холбогдсон тохиолдол)
    if (seatIndexOf(seats, user.uid) !== -1) return;
    if (data.status !== "waiting") throw new Error("Энэ өрөөнд тоглоом аль хэдийн эхэлсэн байна.");

    const free = firstFreeSeat(seats);
    if (free === -1) throw new Error("Өрөө дүүрсэн байна.");

    seats[free] = makeSeat(user, free);
    const members = data.members?.includes(user.uid)
      ? data.members
      : [...(data.members ?? []), user.uid];

    tx.update(ref, {
      seats: serializeSeats(seats),
      members,
      host: electHost(seats, data.host) ?? data.host,
      updatedAt: mod.serverTimestamp(),
    });
  });
  return code;
}

/**
 * Суудлыг чөлөөлнө. Массивыг ХЭЗЭЭ Ч шахахгүй — зөвхөн тухайн нүдийг null болгоно.
 * Ингэснээр үлдсэн тоглогчдын индекс хэвээрээ үлдэнэ.
 */
export async function leaveRoom(code, uid) {
  const ref = roomRef(code);
  try {
    await mod.runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const seats = deserializeSeats(data.seats);
      const index = seatIndexOf(seats, uid);
      if (index !== -1) seats[index] = null;

      // Хүн үлдээгүй бол өрөөг хаана (bot дангаараа өрөө эзэлж үлдэхгүй)
      if (humanSeats(seats).length === 0) {
        tx.delete(ref);
        return;
      }

      const nextHost = electHost(seats, data.host === uid ? null : data.host);
      tx.update(ref, {
        seats: serializeSeats(seats),
        members: (data.members ?? []).filter((m) => m !== uid),
        host: nextHost,
        hostSeenAt: nextHost === data.host ? (data.hostSeenAt ?? Date.now()) : Date.now(),
        updatedAt: mod.serverTimestamp(),
      });
    });
  } catch {
    /* өрөө аль хэдийн устсан бол алгасна */
  }
}

/**
 * Host амьд байгаагаа мэдэгдэнэ. Дохио тасарсан үед хамгийн бага
 * дугаартай хүн өөрөө host-ыг авна — өрөө мөнхөд царцахаас сэргийлнэ.
 */
export async function claimHostIfStale(code, uid) {
  let claimed = false;
  try {
    await mod.runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef(code));
      if (!snap.exists()) return;
      const data = snap.data();
      const seats = deserializeSeats(data.seats);
      if (seatIndexOf(seats, uid) === -1) return;

      const hostSeatMissing = seatIndexOf(seats, data.host) === -1;
      if (!hostSeatMissing && !hostIsStale(data.hostSeenAt)) return;

      // Хамгийн бага дугаартай хүн л эзэмших эрхтэй — хоёр хүн зэрэг авахаас сэргийлнэ
      const next = electHost(seats, hostSeatMissing ? null : data.host);
      if (next !== uid) return;

      tx.update(roomRef(code), { host: uid, hostSeenAt: Date.now(), updatedAt: mod.serverTimestamp() });
      claimed = true;
    });
  } catch {
    /* өрсөлдөөн — дараагийн цохилтод дахин оролдоно */
  }
  return claimed;
}


export async function touchHost(code) {
  try {
    await mod.updateDoc(roomRef(code), { hostSeenAt: Date.now() });
  } catch {
    /* эрхгүй эсвэл өрөө устсан */
  }
}

/** Тоглоом эхлүүлэхийг ГҮЙЛГЭЭГЭЭР хийнэ — зэрэг нэгдсэн хүн алдагдахгүй. */
export async function startGameTransaction(code, uid, buildGame) {
  let result = null;
  await mod.runTransaction(db, async (tx) => {
    const snap = await tx.get(roomRef(code));
    if (!snap.exists()) throw new Error("Өрөө олдсонгүй.");
    const data = snap.data();
    if (data.host !== uid) throw new Error("Зөвхөн host тоглоом эхлүүлнэ.");
    if (data.status === "playing") throw new Error("Тоглоом аль хэдийн эхэлсэн байна.");

    const seats = deserializeSeats(data.seats);
    const built = buildGame(seats, data);
    if (!built) throw new Error("Тоглогч хүрэлцэхгүй байна.");

    tx.update(roomRef(code), {
      status: "playing",
      seats: serializeSeats(built.seats),
      state: built.state,
      startedAt: Date.now(),
      gameId: `${code}-${Date.now()}`,
      hostSeenAt: Date.now(),
      updatedAt: mod.serverTimestamp(),
    });
    result = built;
  });
  return result;
}

export function watchRoom(code, callback) {
  return mod.onSnapshot(roomRef(code), (snap) => {
    if (!snap.exists()) return callback(null);
    const data = snap.data();
    callback({ id: snap.id, ...data, seats: deserializeSeats(data.seats) });
  });
}

export function watchPublicRooms(callback) {
  const q = mod.query(mod.collection(db, "rooms"), mod.limit(60));
  return mod.onSnapshot(q, (snap) => {
    const all = snap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, ...data, seats: deserializeSeats(data.seats) };
    });
    const open = all
      .filter(
        (room) =>
          room.visibility === "public" &&
          room.status === "waiting" &&
          seatCount(room.seats) < SEAT_COUNT,
      )
      .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
      .slice(0, 12);
    callback(open, all);
  });
}

/* ── Presence: хэн онлайн байгаа ───────────────────
   Тоглогч бүр 20 секунд тутам өөрийн баримтаа шинэчилнэ.
   Dashboard эндээс "онлайн" тоог гаргана. */

const PRESENCE_TTL_MS = 70_000;
const presenceRef = (uid) => mod.doc(db, "presence", uid);

export async function heartbeat(uid, info = {}) {
  if (!db || !uid) return;
  try {
    await mod.setDoc(presenceRef(uid), {
      uid,
      lastSeen: Date.now(),
      roomCode: info.roomCode ?? null,
      inGame: Boolean(info.inGame),
      name: info.name ?? null,
    });
  } catch {
    /* сүлжээ тасарсан — дараагийн цохилтод дахин оролдоно */
  }
}

export async function clearPresence(uid) {
  if (!db || !uid) return;
  try {
    await mod.deleteDoc(presenceRef(uid));
  } catch {
    /* алгасна */
  }
}

export function watchPresence(callback) {
  const q = mod.query(mod.collection(db, "presence"), mod.limit(300));
  return mod.onSnapshot(q, (snap) => {
    const now = Date.now();
    const live = snap.docs
      .map((d) => d.data())
      .filter((row) => row.lastSeen && now - row.lastSeen < PRESENCE_TTL_MS);
    callback(live);
  });
}

export async function updateRoom(code, patch) {
  await mod.updateDoc(roomRef(code), { ...patch, updatedAt: mod.serverTimestamp() });
}

/** Гарыг тус тусын баримтад хадгална — зөвхөн эзэн нь уншиж чадна. */
export async function writeHands(code, handsByIndex) {
  const batch = mod.writeBatch(db);
  for (const [index, entry] of Object.entries(handsByIndex)) {
    batch.set(handRef(code, index), { uid: entry.uid ?? null, cards: entry.cards });
  }
  await batch.commit();
}

export async function writeHand(code, index, entry) {
  await mod.setDoc(handRef(code, index), { uid: entry.uid ?? null, cards: entry.cards });
}

export function watchHand(code, index, callback) {
  return mod.onSnapshot(handRef(code, index), (snap) => {
    callback(snap.exists() ? snap.data().cards : []);
  });
}

export async function readHand(code, index) {
  const snap = await mod.getDoc(handRef(code, index));
  return snap.exists() ? snap.data().cards : [];
}

/* ── Chat ───────────────────────────────────────── */

const cleanMessage = (text) => String(text ?? "").trim().slice(0, 180);
const sender = (user) => ({
  uid: user.uid,
  name: user.displayName ?? "Зочин",
  photo: user.photoURL ?? null,
});

export async function sendPublicChat(user, text) {
  const message = cleanMessage(text);
  if (!message) return;
  await mod.addDoc(publicChatRef(), {
    ...sender(user),
    text: message,
    createdAt: mod.serverTimestamp(),
  });
}

export function watchPublicChat(callback) {
  const q = mod.query(publicChatRef(), mod.orderBy("createdAt", "desc"), mod.limit(40));
  return mod.onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse());
  });
}

export async function sendRoomChat(code, user, text) {
  const message = cleanMessage(text);
  if (!message) return;
  await mod.addDoc(roomMessagesRef(code), {
    ...sender(user),
    text: message,
    createdAt: mod.serverTimestamp(),
  });
}

export function watchRoomChat(code, callback) {
  const q = mod.query(roomMessagesRef(code), mod.orderBy("createdAt", "desc"), mod.limit(40));
  return mod.onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse());
  });
}

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

export function ratingScore(stats = {}) {
  return (
    (stats.wins ?? 0) * 100 +
    (stats.roundWins ?? 0) * 20 -
    (stats.points ?? 0) * 3 -
    (stats.losses ?? 0) * 25
  );
}

export async function ensureProfile(user, name) {
  const ref = userRef(user.uid);
  const snap = await mod.getDoc(ref);
  const displayName = name || user.displayName || "Зочин";
  if (!snap.exists()) {
    await mod.setDoc(ref, {
      displayName,
      photoURL: user.photoURL ?? null,
      anonymous: Boolean(user.isAnonymous),
      games: 0,
      wins: 0,
      losses: 0,
      rounds: 0,
      roundWins: 0,
      points: 0,
      rating: 0,
      recordedGames: [],
      updatedAt: mod.serverTimestamp(),
    });
  } else {
    const data = snap.data();
    const patch = {
      displayName,
      photoURL: user.photoURL ?? data.photoURL ?? null,
      anonymous: Boolean(user.isAnonymous),
      updatedAt: mod.serverTimestamp(),
    };
    // Хуучин профайлд дутуу талбаруудыг нөхнө
    if (typeof data.losses !== "number") patch.losses = Math.max(0, (data.games ?? 0) - (data.wins ?? 0));
    if (!Array.isArray(data.recordedGames)) patch.recordedGames = [];
    const nextStats = { ...data, ...patch };
    const rating = ratingScore(nextStats);
    if (typeof data.rating !== "number" || data.rating !== rating) patch.rating = rating;
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

    // Ranking зөвхөн Google account-аар орсон хэрэглэгчдэд тооцогдоно.
    if (!snap.exists() || data?.anonymous === true) return;
    if (data?.recordedGames?.includes(stats.gameId)) return; // давхардлаас хамгаална

    const base = data ?? { games: 0, wins: 0, losses: 0, rounds: 0, roundWins: 0, points: 0 };
    const nextStats = {
      games: (base.games ?? 0) + 1,
      wins: (base.wins ?? 0) + (stats.won ? 1 : 0),
      losses: (base.losses ?? 0) + (stats.won ? 0 : 1),
      rounds: (base.rounds ?? 0) + (stats.rounds ?? 0),
      roundWins: (base.roundWins ?? 0) + (stats.roundWins ?? 0),
      points: (base.points ?? 0) + (stats.points ?? 0),
    };
    // Сүүлийн 50 тоглоомын түлхүүр л хангалттай — баримт хэт томроохгүй
    const history = [...(data?.recordedGames ?? []), stats.gameId].slice(-50);

    const patch = {
      ...nextStats,
      rating: ratingScore(nextStats),
      recordedGames: history,
      updatedAt: mod.serverTimestamp(),
    };
    // rating-ыг баримтад хадгална — эрэмбэлэлт серверт хийгдэнэ
    patch.rating = ratingScore(patch);

    tx.update(ref, patch);
    recorded = true;
  });

  return recorded;
}

/**
 * Ranking нь rating оноогоор явна:
 * wins * 100 + roundWins * 20 - points * 3 - losses * 25.
 * Хуучин баримтад rating байхгүй бол унших үед түр бодож эрэмбэлнэ.
 */
export async function fetchLeaderboard(max = 20) {
  if (!db) return [];
  // Сервер талд rating-аар эрэмбэлнэ. Өмнө нь эрэмбэлэлгүйгээр эхний
  // 50 баримтыг (баримтын нэрийн дарааллаар) авдаг байсан тул 200
  // хэрэглэгчтэй үед 1-р байрынх нь жагсаалтад огт орохгүй байв.
  // Ганц талбарын эрэмбэ тул composite index шаардахгүй.
  let docs;
  try {
    const q = mod.query(
      mod.collection(db, "users"),
      mod.orderBy("rating", "desc"),
      mod.limit(Math.max(max * 3, 40)),
    );
    docs = (await mod.getDocs(q)).docs;
  } catch {
    // rating талбаргүй хуучин профайлууд байвал буцаж бүхэлд нь уншина
    const q = mod.query(mod.collection(db, "users"), mod.limit(Math.max(max * 5, 60)));
    docs = (await mod.getDocs(q)).docs;
  }
  return docs
    .map((d) => {
      const row = { uid: d.id, ...d.data() };
      return { ...row, rating: typeof row.rating === "number" ? row.rating : ratingScore(row) };
    })
    .filter((row) => row.anonymous !== true && (row.games ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.rating ?? 0) - (a.rating ?? 0) ||
        (b.wins ?? 0) - (a.wins ?? 0) ||
        (a.points ?? 0) - (b.points ?? 0) ||
        (b.games ?? 0) - (a.games ?? 0),
    )
    .slice(0, max);
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
      botLevel: options.botLevel === "normal" ? "normal" : "hard",
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

export async function findActiveRoomForUser(uid) {
  if (!db || !uid) return null;
  const q = mod.query(mod.collection(db, "rooms"), mod.limit(80));
  const snap = await mod.getDocs(q);
  const rooms = snap.docs
    .map((d) => {
      const data = d.data();
      return { id: d.id, ...data, seats: deserializeSeats(data.seats) };
    })
    .filter((room) =>
      (room.status === "waiting" || room.status === "playing") &&
      (room.members ?? []).includes(uid) &&
      seatIndexOf(room.seats, uid) !== -1,
    )
    .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
  return rooms[0] ?? null;
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
      // Дууссан өрөөг дахин эхлүүлэхэд хувилбар БУЦАЖ УНАХГҮЙ байх ёстой
      stateVersion: (data.stateVersion ?? 0) + 1,
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

/**
 * Нүүдлийг ГҮЙЛГЭЭГЭЭР бичнэ.
 *
 * Өмнө нь гар болон төлөвийг хамгаалалтгүй дарж бичдэг байсан тул
 * host-ын bot гинж ба хүний нүүдэл давхцахад нэг нь нөгөөгөө дарж,
 * хөзөр "буцаж ирдэг" алдаа гарах боломжтой байв.
 *
 * Хамгаалалт:
 *   • ээлж яг тухайн суудалд байгаа эсэх
 *   • stateVersion өөрчлөгдөөгүй эсэх (өөр хүн бичээгүй)
 * Аль нэг нь зөрвөл бичихгүй — client шинэ snapshot дээрээс дахин боднo.
 *
 * @returns {Promise<{ok:boolean, reason?:string, version?:number}>}
 */
export async function commitMove(code, { seatIndex, expectedVersion, state, hand, uid }) {
  let outcome = { ok: false, reason: "unknown" };
  try {
    await mod.runTransaction(db, async (tx) => {
      const ref = roomRef(code);
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        outcome = { ok: false, reason: "room-gone" };
        return;
      }
      const data = snap.data();
      if (data.status !== "playing") {
        outcome = { ok: false, reason: "not-playing" };
        return;
      }
      const current = data.state;
      if (!current || current.turn !== seatIndex) {
        outcome = { ok: false, reason: "not-your-turn" };
        return;
      }
      const version = data.stateVersion ?? 0;
      if (expectedVersion !== undefined && expectedVersion !== null && version !== expectedVersion) {
        outcome = { ok: false, reason: "stale" };
        return;
      }

      if (hand) tx.set(handRef(code, seatIndex), { uid: uid ?? null, cards: hand });
      tx.update(ref, {
        state,
        stateVersion: version + 1,
        updatedAt: mod.serverTimestamp(),
      });
      outcome = { ok: true, version: version + 1 };
    });
  } catch (error) {
    outcome = { ok: false, reason: error?.message ?? "error" };
  }
  return outcome;
}

/**
 * Үеийн шинэ төлвийг нийтэлнэ (шинэ тараалт, дараагийн үе, дуусгах).
 *
 * `state`-ийг бичихдээ `stateVersion`-ыг ЗААВАЛ өсгөх ёстой — дүрэм
 * үүнийг шаарддаг. Өмнө нь энэ функц хувилбарыг өсгөдөггүй байсан тул
 * 1-р үеийн дараах бүх шилжилт permission-denied болж, тоглоом царцдаг байв.
 */
export async function publishState(code, { state, status, seats }) {
  let version = null;
  await mod.runTransaction(db, async (tx) => {
    const ref = roomRef(code);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Өрөө олдсонгүй.");
    const current = snap.data().stateVersion ?? 0;
    const patch = { state, stateVersion: current + 1, hostSeenAt: Date.now(), updatedAt: mod.serverTimestamp() };
    if (status) patch.status = status;
    if (seats) patch.seats = serializeSeats(seats);
    tx.update(ref, patch);
    version = current + 1;
  });
  return version;
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

export function watchHand(code, index, callback, onError) {
  return mod.onSnapshot(
    handRef(code, index),
    (snap) => callback(snap.exists() ? snap.data().cards : []),
    // Алдааг чимээгүй залгивал сонсогч үхээд тоглогч мөнхөд хүлээнэ
    (error) => {
      console.error("watchHand", code, index, error);
      onError?.(error);
    },
  );
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

/* ── Chat: хэт олон мессеж илгээхээс хамгаална ──────
   Клиент талын хязгаар + баримт дээрх `createdMs` нь дүрэмтэй
   хамт ажиллаж, спам болон хуурамч цагийг барина. */

const CHAT_COOLDOWN_MS = 1500;
const CHAT_BURST = 5; // 15 секундэд дээд тал нь
const CHAT_WINDOW_MS = 15_000;
const chatHistory = [];

export class ChatThrottleError extends Error {
  constructor(waitMs) {
    super(`Түр хүлээнэ үү (${Math.ceil(waitMs / 100) / 10}с)`);
    this.name = "ChatThrottleError";
    this.waitMs = waitMs;
  }
}

function checkChatRate() {
  const now = Date.now();
  while (chatHistory.length && now - chatHistory[0] > CHAT_WINDOW_MS) chatHistory.shift();

  // `last &&` гэвэл timestamp 0 үед шалгалт алгасагдана — undefined-ээр шалгана
  const last = chatHistory.at(-1);
  if (last !== undefined && now - last < CHAT_COOLDOWN_MS) {
    throw new ChatThrottleError(CHAT_COOLDOWN_MS - (now - last));
  }
  if (chatHistory.length >= CHAT_BURST) {
    throw new ChatThrottleError(CHAT_WINDOW_MS - (now - chatHistory[0]));
  }
  chatHistory.push(now);
  return now;
}

export async function sendPublicChat(user, text) {
  const message = cleanMessage(text);
  if (!message) return;
  const now = checkChatRate();
  await mod.addDoc(publicChatRef(), {
    ...sender(user),
    text: message,
    createdMs: now,
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
  const now = checkChatRate();
  await mod.addDoc(roomMessagesRef(code), {
    ...sender(user),
    text: message,
    createdMs: now,
    createdAt: mod.serverTimestamp(),
  });
}

export function watchRoomChat(code, callback) {
  const q = mod.query(roomMessagesRef(code), mod.orderBy("createdAt", "desc"), mod.limit(40));
  return mod.onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse());
  });
}

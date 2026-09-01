// Firebase давхарга — нэвтрэлт, өрөө, ranking.
// Тохиргоо байхгүй бол бүх функц "офлайн" горимд эелдэгээр унтарна.
import { firebaseConfig, isConfigured } from "./firebase-config.js";

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
      rounds: 0,
      roundWins: 0,
      points: 0,
      updatedAt: mod.serverTimestamp(),
    });
  } else {
    await mod.updateDoc(ref, { displayName, updatedAt: mod.serverTimestamp() });
  }
}

export async function getProfile(uid) {
  const snap = await mod.getDoc(userRef(uid));
  return snap.exists() ? snap.data() : null;
}

/**
 * Тоглоомын үр дүнг ranking-д бүртгэнэ.
 * @param {string} uid
 * @param {{won:boolean, roundWins:number, rounds:number, points:number}} stats
 */
export async function recordResult(uid, stats) {
  if (!db) return;
  await mod.updateDoc(userRef(uid), {
    games: mod.increment(1),
    wins: mod.increment(stats.won ? 1 : 0),
    rounds: mod.increment(stats.rounds ?? 0),
    roundWins: mod.increment(stats.roundWins ?? 0),
    points: mod.increment(stats.points ?? 0),
    updatedAt: mod.serverTimestamp(),
  });
}

export async function fetchLeaderboard(max = 20) {
  if (!db) return [];
  const q = mod.query(
    mod.collection(db, "users"),
    mod.orderBy("wins", "desc"),
    mod.orderBy("games", "desc"),
    mod.limit(max),
  );
  const snap = await mod.getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
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
  const seat = {
    uid: user.uid,
    name: user.displayName ?? "Зочин",
    photo: user.photoURL ?? null,
    isBot: false,
  };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = makeCode();
    const ref = roomRef(code);
    const existing = await mod.getDoc(ref);
    if (existing.exists()) continue;
    await mod.setDoc(ref, {
      code,
      host: user.uid,
      status: "waiting",
      visibility: options.visibility === "public" ? "public" : "private",
      allowBots: options.allowBots ?? true,
      seats: [seat],
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
    if (data.status !== "waiting") throw new Error("Энэ өрөөнд тоглоом аль хэдийн эхэлсэн байна.");
    if (data.seats.some((s) => s.uid === user.uid)) return;
    if (data.seats.length >= 4) throw new Error("Өрөө дүүрсэн байна.");
    tx.update(ref, {
      seats: [
        ...data.seats,
        { uid: user.uid, name: user.displayName ?? "Зочин", photo: user.photoURL ?? null, isBot: false },
      ],
      members: [...data.members, user.uid],
      updatedAt: mod.serverTimestamp(),
    });
  });
  return code;
}

export async function leaveRoom(code, uid) {
  const ref = roomRef(code);
  try {
    await mod.runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      const seats = data.seats.filter((s) => s.uid !== uid);
      if (seats.length === 0) {
        tx.delete(ref);
        return;
      }
      tx.update(ref, {
        seats,
        members: data.members.filter((m) => m !== uid),
        host: data.host === uid ? seats[0].uid : data.host,
        updatedAt: mod.serverTimestamp(),
      });
    });
  } catch {
    /* өрөө аль хэдийн устсан бол алгасна */
  }
}

export function watchRoom(code, callback) {
  return mod.onSnapshot(roomRef(code), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function watchPublicRooms(callback) {
  const q = mod.query(mod.collection(db, "rooms"), mod.limit(40));
  return mod.onSnapshot(q, (snap) => {
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((room) => room.visibility === "public" && room.status === "waiting" && (room.seats?.length ?? 0) < 4)
      .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
      .slice(0, 12);
    callback(rows);
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

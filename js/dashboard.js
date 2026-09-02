// Шууд статистик — онлайн тоглогч, өрөө, явагдаж буй тоглоом.
//
// Хоёр эх сурвалж:
//   presence/{uid} — тоглогч бүр 20 сек тутам дохио өгнө
//   rooms/*        — өрөөний status, visibility
// Хоёулаа onSnapshot тул хүн орох/гарах, тоглоом эхлэх/дуусахад
// шууд шинэчлэгдэнэ.

import * as fb from "./firebase.js";
import { humanSeats, seatCount, SEAT_COUNT, toMillis } from "./seats.js";

const HEARTBEAT_MS = 20_000;
const ROOM_STALE_MS = 5 * 60_000; // 5 минут хөдөлгөөнгүй өрөөг амьд гэж тооцохгүй

const $ = (id) => document.getElementById(id);

let unsubs = [];
let beat = null;
let presenceRows = [];
let roomRows = [];
let context = { uid: null, name: null, roomCode: null, inGame: false };

export function startDashboard(user) {
  stopDashboard();
  if (!fb.online || !user) {
    renderOffline();
    return;
  }
  context = { uid: user.uid, name: user.displayName ?? null, roomCode: null, inGame: false };

  fb.heartbeat(context.uid, context);
  beat = setInterval(() => fb.heartbeat(context.uid, context), HEARTBEAT_MS);

  unsubs.push(
    fb.watchPresence((rows) => {
      presenceRows = rows;
      render();
    }),
  );
  unsubs.push(
    fb.watchPublicRooms((_open, all) => {
      roomRows = all ?? [];
      render();
    }),
  );

  // Tab хаагдахад дохиогоо цэвэрлэнэ — "онлайн" тоо хиймлээр өсөхгүй
  window.addEventListener("beforeunload", handleUnload);
  document.addEventListener("visibilitychange", handleVisibility);
  render();
}

export function stopDashboard() {
  unsubs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* алгасна */
    }
  });
  unsubs = [];
  if (beat) clearInterval(beat);
  beat = null;
  window.removeEventListener("beforeunload", handleUnload);
  document.removeEventListener("visibilitychange", handleVisibility);
  if (context.uid) fb.clearPresence(context.uid);
  context = { uid: null, name: null, roomCode: null, inGame: false };
}

/** main.js өрөө/тоглоомын байдал өөрчлөгдөхөд дуудна. */
export function setDashboardContext(patch) {
  context = { ...context, ...patch };
  if (context.uid) fb.heartbeat(context.uid, context);
}

const handleUnload = () => {
  if (context.uid) fb.clearPresence(context.uid);
};

const handleVisibility = () => {
  if (document.visibilityState === "visible" && context.uid) fb.heartbeat(context.uid, context);
};

/**
 * Тоологчийн ЦЭВЭР функц — browser-гүйгээр тестлэх боломжтой.
 * @param {Array} presence  амьд presence бичлэгүүд
 * @param {Array} rooms     бүх өрөө
 */
export function computeStats(presence, rooms, now = Date.now()) {
  const live = (rooms ?? []).filter((room) => {
    if (!room.status || room.status === "finished") return false;
    const seen = toMillis(room.updatedAt) || toMillis(room.createdAt);
    if (seen && now - seen > ROOM_STALE_MS) return false;
    return humanSeats(room.seats ?? []).length > 0;
  });

  const publicRooms = live.filter((r) => r.visibility === "public");
  const privateRooms = live.filter((r) => r.visibility !== "public");
  const running = live.filter((r) => r.status === "playing");
  const waiting = live.filter((r) => r.status === "waiting");

  return {
    online: (presence ?? []).length,
    publicRooms: publicRooms.length,
    privateRooms: privateRooms.length,
    running: running.length,
    waiting: waiting.length,
    seated: running.reduce((sum, r) => sum + humanSeats(r.seats ?? []).length, 0),
    openSeats: waiting.reduce((sum, r) => sum + (SEAT_COUNT - seatCount(r.seats ?? [])), 0),
  };
}

function render() {
  const s = computeStats(presenceRows, roomRows);

  set("statOnline", s.online);
  set("statPublicRooms", s.publicRooms);
  set("statPrivateRooms", s.privateRooms);
  set("statRunning", s.running);
  setText("statOnlineSub", `${s.seated} тоглож байна`);
  setText("statPublicSub", s.waiting ? `${s.openSeats} суудал сул` : "сул суудал алга");
  setText("statPrivateSub", s.privateRooms ? "кодоор орно" : "—");
  setText("statRunningSub", s.running ? `${s.waiting} өрөө хүлээж байна` : "—");
}

function renderOffline() {
  ["statOnline", "statPublicRooms", "statPrivateRooms", "statRunning"].forEach((id) => setText(id, "—"));
  ["statOnlineSub", "statPublicSub", "statPrivateSub", "statRunningSub"].forEach((id) => setText(id, ""));
}

function set(id, value) {
  const node = $(id);
  if (!node) return;
  const next = String(value);
  if (node.textContent === next) return;
  node.textContent = next;
  node.classList.remove("stat-bump");
  void node.offsetWidth; // анимацийг дахин эхлүүлнэ
  node.classList.add("stat-bump");
}

function setText(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

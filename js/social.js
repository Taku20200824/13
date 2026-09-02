import * as fb from "./firebase.js";
import { seatCount } from "./seats.js";
import { escapeHtml } from "./text.js";

const $ = (id) => document.getElementById(id);

let user = null;
let publicRoomsUnsub = null;
let publicChatUnsub = null;
let roomChatUnsub = null;
let activeRoomChatCode = null;
let roomChatSeen = 0; // тоглоомын чат хаалттай үед уншаагүй мессежийг тоолно

function joinByCode(code) {
  const input = $("joinCode");
  const form = $("joinForm");
  if (!input || !form) return;
  input.value = code;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function renderPublicRooms(rooms) {
  const list = $("publicRooms");
  if (!list) return;
  if (!rooms.length) {
    list.innerHTML = '<li class="social-empty">Одоогоор public өрөө алга.</li>';
    return;
  }
  list.innerHTML = "";
  rooms.forEach((room) => {
    const filled = seatCount(room.seats ?? []);
    const host = room.seats?.find((seat) => seat?.uid === room.host) ?? room.seats?.find(Boolean);
    const li = document.createElement("li");
    li.className = "public-room";
    li.innerHTML = `
      <div>
        <strong>${escapeHtml(host?.name ?? "Хост")}</strong>
        <small>${filled}/4 хүн · ${room.allowBots ? "bot зөвшөөрнө" : "зөвхөн хүн"}</small>
      </div>
      <button class="btn btn--small" type="button" data-code="${escapeHtml(room.code)}">Орох</button>`;
    li.querySelector("button")?.addEventListener("click", () => joinByCode(room.code));
    list.appendChild(li);
  });
}

function renderChat(listId, messages) {
  const list = $(listId);
  if (!list) return;
  if (!messages.length) {
    list.innerHTML = '<li class="social-empty">Chat хоосон байна.</li>';
    return;
  }
  list.innerHTML = "";
  messages.forEach((message) => {
    const li = document.createElement("li");
    li.className = "chat-message";
    li.innerHTML = `
      <strong>${escapeHtml(message.name ?? "Зочин")}</strong>
      <span>${escapeHtml(message.text ?? "")}</span>`;
    list.appendChild(li);
  });
  list.scrollTop = list.scrollHeight;
}

function startLobbySocial() {
  stopLobbySocial();
  if (!fb.online || !user) return;

  publicRoomsUnsub = fb.watchPublicRooms(renderPublicRooms);
  publicChatUnsub = fb.watchPublicChat((messages) => renderChat("publicChatList", messages));
}

function stopLobbySocial() {
  publicRoomsUnsub?.();
  publicChatUnsub?.();
  publicRoomsUnsub = null;
  publicChatUnsub = null;
}

/** Хэт хурдан бичихэд ойлгомжтой мэдэгдэл өгнө. */
function showChatError(error, listId) {
  if (error?.name === "ChatThrottleError") {
    const list = $(listId);
    if (!list) return;
    const li = document.createElement("li");
    li.className = "social-empty";
    li.textContent = error.message;
    list.appendChild(li);
    setTimeout(() => li.remove(), 2000);
    return;
  }
  console.error(error);
}

function wireSocialEvents() {
  $("btnRefreshPublicRooms")?.addEventListener("click", () => {
    stopLobbySocial();
    startLobbySocial();
  });

  $("publicChatForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("publicChatInput");
    const text = input?.value ?? "";
    if (!text.trim() || !user) return;
    input.value = "";
    await fb.sendPublicChat(user, text).catch((error) => showChatError(error, "publicChatList"));
  });

  $("roomChatForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("roomChatInput");
    const text = input?.value ?? "";
    if (!text.trim() || !user || !activeRoomChatCode) return;
    input.value = "";
    await fb.sendRoomChat(activeRoomChatCode, user, text).catch((error) =>
      showChatError(error, "roomChatList"),
    );
  });

  // Тоглоом дундах чат — өрөөний чаттай ижил мессеж рүү бичнэ.
  $("gameChatForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("gameChatInput");
    const text = input?.value ?? "";
    if (!text.trim() || !user || !activeRoomChatCode) return;
    input.value = "";
    await fb.sendRoomChat(activeRoomChatCode, user, text).catch((error) =>
      showChatError(error, "gameChatList"),
    );
  });

  $("btnGameChat")?.addEventListener("click", () => {
    const drawer = $("gameChat");
    if (drawer?.hidden) openGameChat();
    else closeGameChat();
  });
  $("btnGameChatClose")?.addEventListener("click", closeGameChat);
}

/**
 * Идэвхтэй өрөөг main.js илэрхий хэлж өгнө.
 * Өмнө нь `#roomCode` элементийн текстийг MutationObserver болон
 * 1.2 секунд тутмын setInterval-аар тагнадаг байсан — найдваргүй, үрэлгэн.
 */
export function setActiveRoom(code) {
  if (activeRoomChatCode === code) return;
  roomChatUnsub?.();
  roomChatUnsub = null;
  activeRoomChatCode = code ?? null;
  roomChatSeen = 0;
  ["roomChatList", "gameChatList"].forEach((id) => {
    const list = $(id);
    if (list) list.innerHTML = '<li class="social-empty">Мессеж алга.</li>';
  });
  updateGameChatBadge(0);
  // Чат товч зөвхөн онлайн өрөөнд харагдана (bot-той офлайн тоглолтод хэрэггүй).
  const fab = $("btnGameChat");
  if (fab) fab.hidden = !code;
  if (!code) closeGameChat();
  if (!code || !fb.online || !user) return;
  // Нэг л subscription — өрөөний болон тоглоомын чат хоёуланд нь зурна.
  roomChatUnsub = fb.watchRoomChat(code, (messages) => {
    renderChat("roomChatList", messages);
    renderChat("gameChatList", messages);
    const drawer = $("gameChat");
    if (drawer && !drawer.hidden) roomChatSeen = messages.length;
    updateGameChatBadge(Math.max(0, messages.length - roomChatSeen));
  });
}

/** Тоглоомын чат товчин дээрх уншаагүй мессежийн тоо. */
function updateGameChatBadge(count) {
  const badge = $("gameChatBadge");
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? "9+" : String(count);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

function openGameChat() {
  const drawer = $("gameChat");
  const btn = $("btnGameChat");
  if (!drawer) return;
  drawer.hidden = false;
  btn?.setAttribute("aria-expanded", "true");
  const list = $("gameChatList");
  if (list) list.scrollTop = list.scrollHeight;
  // Нээмэгц бүгдийг уншсан гэж үзнэ
  roomChatSeen = list ? list.querySelectorAll(".chat-message").length : 0;
  updateGameChatBadge(0);
  $("gameChatInput")?.focus();
}

function closeGameChat() {
  const drawer = $("gameChat");
  if (!drawer) return;
  drawer.hidden = true;
  $("btnGameChat")?.setAttribute("aria-expanded", "false");
}

async function bootSocial() {
  wireSocialEvents();
  if (!fb.online) return;
  await fb.initFirebase();
  fb.onAuth((nextUser) => {
    user = nextUser;
    roomChatUnsub?.();
    roomChatUnsub = null;
    activeRoomChatCode = null;
    if (user) startLobbySocial();
    else stopLobbySocial();
  });
}

bootSocial().catch(console.error);

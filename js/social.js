import * as fb from "./firebase.js";
import { seatCount } from "./seats.js";
import { escapeHtml } from "./text.js";

const $ = (id) => document.getElementById(id);

let user = null;
let publicRoomsUnsub = null;
let publicChatUnsub = null;
let roomChatUnsub = null;
let activeRoomChatCode = null;

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
    await fb.sendPublicChat(user, text).catch(console.error);
  });

  $("roomChatForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("roomChatInput");
    const text = input?.value ?? "";
    if (!text.trim() || !user || !activeRoomChatCode) return;
    input.value = "";
    await fb.sendRoomChat(activeRoomChatCode, user, text).catch(console.error);
  });
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
  const list = $("roomChatList");
  if (list) list.innerHTML = '<li class="social-empty">Мессеж алга.</li>';
  if (!code || !fb.online || !user) return;
  roomChatUnsub = fb.watchRoomChat(code, (messages) => renderChat("roomChatList", messages));
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

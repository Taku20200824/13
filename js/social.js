import * as fb from "./firebase.js";

const $ = (id) => document.getElementById(id);

let user = null;
let publicRoomsUnsub = null;
let publicChatUnsub = null;
let roomChatUnsub = null;
let activeRoomChatCode = null;

const escapeHtml = (text) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );

const roomVisibility = () =>
  document.querySelector('input[name="roomVisibility"]:checked')?.value === "public" ? "public" : "private";

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
    const li = document.createElement("li");
    li.className = "public-room";
    li.innerHTML = `
      <div>
        <strong>${escapeHtml(room.seats?.[0]?.name ?? "Хост")}</strong>
        <small>${room.seats?.length ?? 0}/4 хүн · ${room.allowBots ? "bot зөвшөөрнө" : "зөвхөн хүн"}</small>
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

function watchActiveRoomChat() {
  if (!user) return;
  const roomScreen = $("screenRoom")?.hasAttribute("data-active");
  const gameScreen = $("screenGame")?.hasAttribute("data-active");
  const code = $("roomCode")?.textContent?.trim();
  const shouldWatch = (roomScreen || gameScreen) && code && code !== "------";

  if (!shouldWatch) {
    roomChatUnsub?.();
    roomChatUnsub = null;
    activeRoomChatCode = null;
    return;
  }
  if (activeRoomChatCode === code) return;

  roomChatUnsub?.();
  activeRoomChatCode = code;
  roomChatUnsub = fb.watchRoomChat(code, (messages) => renderChat("roomChatList", messages));
}

function wireSocialEvents() {
  $("btnCreateRoom")?.addEventListener(
    "click",
    async (event) => {
      if (!fb.online || !user) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const code = await fb.createRoom(user, { allowBots: true, visibility: roomVisibility() });
        joinByCode(code);
      } catch (error) {
        const hint = $("lobbyHint");
        if (hint) {
          hint.textContent = error?.message ?? "Өрөө үүсгэж чадсангүй.";
          hint.setAttribute("data-error", "");
        }
      }
    },
    true,
  );

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

  const observer = new MutationObserver(watchActiveRoomChat);
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-active"] });
  setInterval(watchActiveRoomChat, 1200);
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

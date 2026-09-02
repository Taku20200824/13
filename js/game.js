import * as fb from "./firebase.js";
import { seatCount } from "./seats.js";
import { escapeHtml } from "./text.js";

const $ = (id) => document.getElementById(id);

let user = null;
let publicRoomsUnsub = null;
let publicChatUnsub = null;
let roomChatUnsub = null;
let activeRoomChatCode = null;

/**
 * Өрөөний кодоор шууд нэвтрэх.
 */
function joinByCode(code) {
  const input = $("joinCode");
  const form = $("joinForm");

  if (!input || !form) return;

  input.value = code;

  form.dispatchEvent(
    new Event("submit", {
      bubbles: true,
      cancelable: true,
    }),
  );
}

/**
 * Public өрөөнүүдийг харуулна.
 */
function renderPublicRooms(rooms) {
  const list = $("publicRooms");

  if (!list) return;

  if (!rooms.length) {
    list.innerHTML =
      '<li class="social-empty">Одоогоор public өрөө алга.</li>';
    return;
  }

  list.innerHTML = "";

  rooms.forEach((room) => {
    const filled = seatCount(room.seats ?? []);

    const host =
      room.seats?.find((seat) => seat?.uid === room.host) ??
      room.seats?.find(Boolean);

    const li = document.createElement("li");

    li.className = "public-room";

    li.innerHTML = `
      <div>
        <strong>${escapeHtml(host?.name ?? "Хост")}</strong>
        <small>
          ${filled}/4 хүн ·
          ${room.allowBots ? "bot зөвшөөрнө" : "зөвхөн хүн"}
        </small>
      </div>

      <button
        class="btn btn--small"
        type="button"
        data-code="${escapeHtml(room.code)}"
      >
        Орох
      </button>
    `;

    li.querySelector("button")?.addEventListener("click", () => {
      joinByCode(room.code);
    });

    list.appendChild(li);
  });
}

/**
 * Chat мессежүүдийг зурна.
 */
function renderChat(listId, messages) {
  const list = $(listId);

  if (!list) return;

  if (!messages.length) {
    list.innerHTML =
      '<li class="social-empty">Chat хоосон байна.</li>';
    return;
  }

  list.innerHTML = "";

  messages.forEach((message) => {
    const li = document.createElement("li");

    li.className = "chat-message";

    li.innerHTML = `
      <strong>${escapeHtml(message.name ?? "Зочин")}</strong>
      <span>${escapeHtml(message.text ?? "")}</span>
    `;

    list.appendChild(li);
  });

  list.scrollTop = list.scrollHeight;
}

/**
 * Chat дээр алдааны мессеж түр харуулна.
 */
function appendChatNotice(listId, message, timeout = 3000) {
  const list = $(listId);

  if (!list) return;

  const li = document.createElement("li");

  li.className = "social-empty chat-error";
  li.textContent = message;

  list.appendChild(li);

  list.scrollTop = list.scrollHeight;

  if (timeout > 0) {
    setTimeout(() => {
      li.remove();
    }, timeout);
  }
}

/**
 * Firebase / Firestore chat алдааг ойлгомжтой харуулна.
 */
function showChatError(error, listId) {
  console.error("Chat error:", error);

  // Манай өөрийн rate-limit error
  if (error?.name === "ChatThrottleError") {
    appendChatNotice(
      listId,
      error.message || "Хэт хурдан мессеж илгээж байна.",
      2500,
    );
    return;
  }

  const code = error?.code ?? "";

  // Firestore Security Rules permission denied
  if (
    code === "permission-denied" ||
    code === "firestore/permission-denied"
  ) {
    appendChatNotice(
      listId,
      "Firestore дүрэм зөвшөөрөхгүй байна.",
      4000,
    );
    return;
  }

  // Login байхгүй
  if (
    code === "unauthenticated" ||
    code === "auth/user-token-expired"
  ) {
    appendChatNotice(
      listId,
      "Нэвтрэх эрх дууссан байна. Дахин нэвтэрнэ үү.",
      4000,
    );
    return;
  }

  // Интернет тасарсан
  if (
    code === "unavailable" ||
    code === "firestore/unavailable"
  ) {
    appendChatNotice(
      listId,
      "Firebase сервертэй холбогдож чадсангүй.",
      4000,
    );
    return;
  }

  appendChatNotice(
    listId,
    error?.message || "Мессеж илгээх үед алдаа гарлаа.",
    4000,
  );
}

/**
 * Lobby social listener-үүдийг эхлүүлнэ.
 */
function startLobbySocial() {
  stopLobbySocial();

  if (!fb.online || !user) return;

  publicRoomsUnsub = fb.watchPublicRooms((rooms) => {
    renderPublicRooms(rooms);
  });

  publicChatUnsub = fb.watchPublicChat((messages) => {
    renderChat("publicChatList", messages);
  });
}

/**
 * Lobby listener-үүдийг зогсооно.
 */
function stopLobbySocial() {
  publicRoomsUnsub?.();
  publicChatUnsub?.();

  publicRoomsUnsub = null;
  publicChatUnsub = null;
}

/**
 * Social UI event-үүд.
 */
function wireSocialEvents() {
  /**
   * Public room refresh
   */
  $("btnRefreshPublicRooms")?.addEventListener("click", () => {
    stopLobbySocial();
    startLobbySocial();
  });

  /**
   * Public chat
   */
  $("publicChatForm")?.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const input = $("publicChatInput");
      const text = input?.value?.trim() ?? "";

      if (!text || !user) return;

      // 180 тэмдэгтээс урт бол Firestore rule reject хийнэ.
      if (text.length > 180) {
        appendChatNotice(
          "publicChatList",
          "Мессеж хамгийн ихдээ 180 тэмдэгт байна.",
          3000,
        );
        return;
      }

      if (input) {
        input.value = "";
      }

      try {
        await fb.sendPublicChat(user, text);
      } catch (error) {
        // Амжилтгүй бол бичсэн мессежийг буцаана.
        if (input && !input.value) {
          input.value = text;
        }

        showChatError(error, "publicChatList");
      }
    },
  );

  /**
   * Room chat
   */
  $("roomChatForm")?.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const input = $("roomChatInput");
      const text = input?.value?.trim() ?? "";

      if (!text) return;

      if (!user) {
        appendChatNotice(
          "roomChatList",
          "Эхлээд нэвтэрнэ үү.",
          3000,
        );
        return;
      }

      if (!activeRoomChatCode) {
        appendChatNotice(
          "roomChatList",
          "Идэвхтэй өрөө олдсонгүй.",
          3000,
        );
        return;
      }

      if (text.length > 180) {
        appendChatNotice(
          "roomChatList",
          "Мессеж хамгийн ихдээ 180 тэмдэгт байна.",
          3000,
        );
        return;
      }

      if (input) {
        input.value = "";
      }

      try {
        await fb.sendRoomChat(
          activeRoomChatCode,
          user,
          text,
        );
      } catch (error) {
        // Амжилтгүй бол мессежийг input руу буцаана.
        if (input && !input.value) {
          input.value = text;
        }

        showChatError(error, "roomChatList");
      }
    },
  );
}

/**
 * Идэвхтэй өрөөг main.js шууд хэлж өгнө.
 *
 * Өмнө нь #roomCode DOM элементийг MutationObserver болон
 * setInterval ашиглан шалгадаг байсан.
 */
export function setActiveRoom(code) {
  if (activeRoomChatCode === code) return;

  // Өмнөх room chat listener-ийг хаана.
  roomChatUnsub?.();
  roomChatUnsub = null;

  activeRoomChatCode = code ?? null;

  const list = $("roomChatList");

  if (list) {
    list.innerHTML =
      '<li class="social-empty">Мессеж алга.</li>';
  }

  if (!code || !fb.online || !user) return;

  roomChatUnsub = fb.watchRoomChat(
    code,
    (messages) => {
      renderChat("roomChatList", messages);
    },
  );
}

/**
 * Social системийг асаана.
 */
async function bootSocial() {
  wireSocialEvents();

  if (!fb.online) {
    console.warn("Firebase offline байна.");
    return;
  }

  await fb.initFirebase();

  fb.onAuth((nextUser) => {
    user = nextUser;

    // Auth солигдвол хуучин room listener-ийг хаана.
    roomChatUnsub?.();
    roomChatUnsub = null;

    activeRoomChatCode = null;

    if (user) {
      startLobbySocial();
    } else {
      stopLobbySocial();
    }
  });
}

bootSocial().catch((error) => {
  console.error("Social boot error:", error);
});

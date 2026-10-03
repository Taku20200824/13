// Апп удирдлага — нэвтрэлт, lobby, өрөө, тоглоом.
import { cardValue, suitOrder, rankOrder } from "./cards.js";
import {
  createGame,
  play,
  pass,
  nextRound,
  serializeGame,
  deserializeGame,
  PHASE,
} from "./game.js";
import { chooseMove, DIFFICULTY } from "./bot.js";
import { initHandOrder, isDragging } from "./hand-order.js";
import { escapeHtml } from "./text.js";
import { startDashboard, stopDashboard, setDashboardContext } from "./dashboard.js";
import { setActiveRoom } from "./social.js";
import { enumeratePlays } from "./rules.js";
import * as fb from "./firebase.js";
import { initAnalytics } from "./analytics.js";
import { mountThemePickers } from "./theme.js";
import {
  seatsMatchState,
  SEAT_COUNT,
  emptySeats,
  makeBotSeat,
  seatIndexOf,
  seatCount,
  humanSeats,
  occupiedSeats,
} from "./seats.js";
import {
  $,
  showScreen,
  toast,
  openModal,
  closeModal,
  renderOpponents,
  renderPile,
  renderHand,
  renderSelection,
  renderPlayPreview,
  renderStatus,
  renderLog,
  setBanner,
  roundResultTable,
} from "./ui.js";
import { t, translateEngineError, translateComboLabel, onLangChange } from "./i18n.js";

const BOT_NAMES = ["Болд", "Саруул", "Номин", "Дорж", "Оюун", "Тэмүүлэн"];
const HOST_WARN_MS = 22_000;

const app = {
  user: null,
  mode: null, // "local" | "online"
  game: null,
  myIndex: 0,
  selected: new Set(),
  hintIds: new Set(),
  sortMode: "rank", // "rank" | "suit"
  room: null,
  roomCode: null,
  unsub: [],
  botTimer: null,
  hostTimer: null,
  recordedGameId: null,
  handOrder: [], // хэрэглэгчийн гараар өөрчилсөн дараалал (хөзрийн id)
  difficulty: DIFFICULTY.EXPERT,
  stats: { rounds: 0, roundWins: 0, points: 0 },
};

/* ══════════ Boot ══════════ */

// Firebase-ээс ӨМНӨ дуудна: тохиргоо дутуу байж boot эрт зогссон ч
// хуудас нээгдсэн нь хэмжигдэх ёстой.
initAnalytics();
boot();

// Хэл сольсон үед харагдаж байгаа дэлгэцийн динамик текстийг дахин зурна.
// Статик HTML текстийг i18n.js өөрөө шинэчилдэг тул энд зөвхөн JS-ээр
// бүтээгдсэн хэсгүүдийг л дахин render хийх шаардлагатай.
onLangChange(() => {
  mountThemePickers();
  if (app.user) renderAccount();
  if (app.room) renderRoom(app.room);
  if (app.game) draw();
  loadLeaderboard();
});

async function boot() {
  wireEvents();

  if (!fb.online) {
    $("btnGoogle").disabled = true;
    $("authNote").textContent = t("auth.noFirebase");
    showScreen("auth");
    return;
  }

  try {
    await fb.initFirebase();
  } catch (error) {
    console.error(error);
    $("authNote").textContent = t("auth.connectFailed");
    showScreen("auth");
    return;
  }

  fb.onAuth(async (user) => {
    if (!user) {
      // Сонсогчид амьд үлдвэл snapshot дотор app.user.uid унших үед
      // TypeError өгнө — тиймээс бүгдийг цэвэрлэнэ.
      clearSubscriptions();
      stopHostWatchdog();
      app.user = null;
      app.room = null;
      app.roomCode = null;
      app.game = null;
      stopDashboard();
      showScreen("auth");
      return;
    }
    app.user = user;
    // Сессийг сэргээж орсон тохиолдолд профайл байхгүй байж болзошгүй
    await fb.ensureProfile(user, user.displayName).catch(console.error);
    renderAccount();
    startDashboard(user);
    loadLeaderboard();

    const activeRoom = await fb.findActiveRoomForUser(user.uid).catch((error) => {
      console.error(error);
      return null;
    });
    if (activeRoom && !app.roomCode) {
      toast(t("room.reconnected", { code: activeRoom.code ?? activeRoom.id }));
      enterRoom(activeRoom.code ?? activeRoom.id);
      return;
    }
    showScreen("lobby");
  });
}

/* ══════════ Нэвтрэлт ══════════ */

function wireEvents() {
  mountThemePickers();

  $("btnGoogle").addEventListener("click", async () => {
    try {
      await fb.signInGoogle();
    } catch (error) {
      $("authNote").textContent = friendlyError(error);
    }
  });

  $("guestForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("guestName").value.trim();
    if (!name) return;
    if (!fb.online) {
      app.user = { uid: "local", displayName: name, photoURL: null, isAnonymous: true };
      renderAccount();
      showScreen("lobby");
      $("leaderboard").innerHTML = `<li class="lb-empty">${t("rank.needsFirebase")}</li>`;
      return;
    }
    try {
      await fb.signInGuest(name);
    } catch (error) {
      $("authNote").textContent = friendlyError(error);
    }
  });

  $("btnPlayBots").addEventListener("click", startLocalGame);
  $("btnCreateRoom").addEventListener("click", handleCreateRoom);
  $("joinForm").addEventListener("submit", handleJoinRoom);
  $("btnRefreshRank").addEventListener("click", loadLeaderboard);

  $("btnLeaveRoom").addEventListener("click", handleLeaveRoom);
  $("btnCopyCode").addEventListener("click", copyCode);
  $("btnStartRoom").addEventListener("click", handleStartRoom);
  $("allowBots").addEventListener("change", (event) => {
    if (app.roomCode && isHost()) fb.updateRoom(app.roomCode, { allowBots: event.target.checked });
  });

  $("btnExitGame").addEventListener("click", exitGame);
  $("btnPlay").addEventListener("click", handlePlay);
  $("btnPass").addEventListener("click", handlePass);
  $("btnClear").addEventListener("click", () => {
    app.selected.clear();
    app.hintIds.clear();
    draw();
  });
  $("btnHint").addEventListener("click", handleHint);
  $("btnSort").addEventListener("click", toggleSort);
  $("btnRulesToggle").addEventListener("click", showRules);

  $("hand").addEventListener("click", (event) => {
    const node = event.target.closest(".card");
    // Зөөх боломж нээлттэй ч сонголт зөвхөн өөрийн ээлжид
    if (!node || node.hasAttribute("data-locked")) return;
    const id = node.dataset.id;
    app.selected.has(id) ? app.selected.delete(id) : app.selected.add(id);
    app.hintIds.clear();
    draw();
  });

  $("modal").addEventListener("click", (event) => {
    if (event.target === $("modal")) closeModal();
  });

  // Хөзрөө ямар ч үед чирж эрэмбэлнэ — ээлж авахгүй, нүүдэл тооцогдохгүй
  initHandOrder($("hand"), (ids) => {
    app.handOrder = ids;
    draw();
  });
}

function renderAccount() {
  const node = $("account");
  node.innerHTML = "";
  if (!app.user) return;
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  if (app.user.photoURL) {
    // Хаягийг markup руу оруулахгүй — DOM-оор тавина
    const img = document.createElement("img");
    img.src = app.user.photoURL;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    avatar.appendChild(img);
  } else {
    avatar.textContent = (app.user.displayName ?? "?").slice(0, 1).toUpperCase();
  }
  const meta = document.createElement("div");
  meta.className = "account-meta";
  meta.innerHTML = `<strong>${escapeHtml(app.user.displayName ?? t("common.guestName"))}</strong><small>${
    app.user.isAnonymous ? t("account.guest") : "Google"
  }</small>`;
  const out = document.createElement("button");
  out.className = "link";
  out.textContent = t("common.signOut");
  out.addEventListener("click", async () => {
    if (fb.online) await fb.signOutUser();
    app.user = null;
    showScreen("auth");
  });
  node.append(avatar, meta, out);
}

/* ══════════ Ranking ══════════ */

async function loadLeaderboard() {
  if (!fb.online) return;
  const list = $("leaderboard");
  list.innerHTML = `<li class="lb-empty">${t("rank.loading")}</li>`;
  try {
    const rows = await fb.fetchLeaderboard(20);
    if (rows.length === 0) {
      list.innerHTML = `<li class="lb-empty">${t("rank.empty")}</li>`;
      return;
    }
    list.innerHTML = "";
    rows.forEach((row, i) => {
      const winRate = row.games ? Math.round(((row.wins ?? 0) / row.games) * 100) : 0;
      const avgPenalty = row.games ? ((row.points ?? 0) / row.games).toFixed(1) : "0.0";
      const li = document.createElement("li");
      li.className = "lb-row";
      if (i < 3) li.dataset.rank = String(i + 1);
      if (app.user && row.uid === app.user.uid) li.setAttribute("data-me", "");
      li.innerHTML = `
        <span class="lb-pos">${i < 3 ? ["1", "2", "3"][i] : i + 1}</span>
        <span class="lb-name">${escapeHtml(row.displayName ?? t("common.guestName"))}</span>
        <span class="lb-score">${row.rating ?? 0}<small> ${t("rank.points")} · ${row.wins ?? 0}/${row.games ?? 0}</small></span>
        <span class="lb-detail">win ${winRate}% · avg ${avgPenalty}</span>`;
      list.appendChild(li);
    });
  } catch (error) {
    console.error(error);
    list.innerHTML = `<li class="lb-empty">${t("rank.error")}</li>`;
  }
}

/* ══════════ Офлайн тоглоом ══════════ */

function startLocalGame() {
  clearSubscriptions();
  app.mode = "local";
  app.myIndex = 0;
  app.stats = { rounds: 0, roundWins: 0, points: 0 };
  app.handOrder = [];
  app.recordedGameId = null;
  app.room = null;
  const bots = BOT_NAMES.slice(0, 3).map((name) => ({ name, isBot: true }));
  app.difficulty = botLevel();
  app.game = createGame([{ name: app.user?.displayName ?? t("common.youName"), isBot: false }, ...bots]);
  app.selected.clear();
  showScreen("game");
  draw();
  scheduleBot();
}

function scheduleBot() {
  clearTimeout(app.botTimer);
  if (app.mode !== "local") return;
  const game = app.game;
  if (!game || game.phase !== PHASE.PLAYING) return;
  if (game.turn === app.myIndex) return;

  app.botTimer = setTimeout(() => {
    const index = game.turn;
    const move = chooseMove(game, index, { difficulty: app.difficulty });
    const result = move ? play(game, index, move.cards) : pass(game, index);
    if (!result.ok) {
      // хамгаалалт: гацахаас сэргийлж пасс хийнэ
      pass(game, index);
    }
    draw();
    if (game.phase === PHASE.PLAYING) scheduleBot();
    else handleRoundEnd();
  }, 700);
}

/* ══════════ Өрөө ══════════ */

const isHost = () => app.room && app.user && app.room.host === app.user.uid;
const hostLooksStale = () =>
  app.room?.hostSeenAt && Date.now() - app.room.hostSeenAt > HOST_WARN_MS;

const BOT_LEVELS = {
  normal: DIFFICULTY.NORMAL,
  hard: DIFFICULTY.HARD,
  expert: DIFFICULTY.EXPERT,
};

const botLevel = () =>
  BOT_LEVELS[document.querySelector('input[name="botLevel"]:checked')?.value] ?? DIFFICULTY.EXPERT;

const roomVisibility = () =>
  document.querySelector('input[name="roomVisibility"]:checked')?.value === "private"
    ? "private"
    : "public";

async function handleCreateRoom() {
  if (!requireOnline()) return;
  try {
    const code = await fb.createRoom(app.user, {
      allowBots: true,
      visibility: roomVisibility(),
      botLevel: botLevel(),
    });
    enterRoom(code);
  } catch (error) {
    setHint("lobbyHint", friendlyError(error), true);
  }
}

async function handleJoinRoom(event) {
  event.preventDefault();
  if (!requireOnline()) return;
  const code = $("joinCode").value.trim().toUpperCase();
  if (code.length !== 6) {
    setHint("lobbyHint", t("room.codeLength"), true);
    return;
  }
  try {
    await fb.joinRoom(code, app.user);
    enterRoom(code);
  } catch (error) {
    setHint("lobbyHint", friendlyError(error), true);
  }
}

function enterRoom(code) {
  clearSubscriptions();
  app.roomCode = code;
  app.mode = "online";
  app.myHand = null;
  app.myIndex = -1;
  app.recordedGameId = null;
  app.stats = { rounds: 0, roundWins: 0, points: 0 };
  $("roomCode").textContent = code;
  setHint("roomHint", "");
  showScreen("room");
  startHostWatchdog();
  setActiveRoom(code);
  setDashboardContext({ roomCode: code, inGame: false });

  app.unsub.push(
    fb.watchRoom(code, (room) => {
      if (!room) {
        toast(t("room.closed"));
        exitToLobby();
        return;
      }
      if (!app.user) return; // нэвтрэлт тасарсан — snapshot-ыг үл тоомсорлоно
      app.room = room;

      // Суудлын дугаар нь тогтвортой — массивын байрлал биш, seatIndex
      const seat = seatIndexOf(room.seats, app.user.uid);
      if (seat === -1) {
        toast(t("room.youLeft"));
        exitToLobby();
        return;
      }

      // Суудал өөрчлөгдвөл гарын захиалгыг ЗААВАЛ дахин холбоно.
      // Өмнө нь нэг л удаа холбогддог тул хүн гарахад өөр хүний
      // гарыг харуулж, өөр хүний баримт руу бичдэг байсан.
      if (seat !== app.myIndex) {
        app.myIndex = seat;
        resubscribeHand();
      }

      if (room.status === "waiting") {
        renderRoom(room);
        showScreen("room");
      } else if (room.status === "playing" || room.status === "finished") {
        setDashboardContext({ roomCode: code, inGame: true });
        onRoomState(room);
      }
    }),
  );
}

/* ── Host-ын амин дохио ба шилжүүлэг ───────────────
   Host tab-аа хаавал өрөө мөнхөд царцдаг байсан.
   Одоо host 12 секунд тутам дохио өгч, дохио тасарвал
   хамгийн бага дугаартай хүн host-ыг өөртөө авна. */

function startHostWatchdog() {
  stopHostWatchdog();
  app.hostTimer = setInterval(async () => {
    if (!app.roomCode || !app.user) return;
    if (isHost()) {
      fb.touchHost(app.roomCode);
    } else {
      if (hostLooksStale()) setBanner(t("host.checking"), "error");
      const claimed = await fb.claimHostIfStale(app.roomCode, app.user.uid);
      if (claimed) {
        toast(t("host.switched"));
        setBanner(t("host.revived"), "good");
      }
    }
  }, 12_000);
  app.unsub.push(stopHostWatchdog);
}

function stopHostWatchdog() {
  if (app.hostTimer) clearInterval(app.hostTimer);
  app.hostTimer = null;
}

function resubscribeHand() {
  stopHandWatch();
  app.myHand = null;
  if (!app.roomCode || app.myIndex < 0) return;
  const index = app.myIndex;
  handUnsub = fb.watchHand(
    app.roomCode,
    index,
    (cards) => {
      if (app.myIndex !== index) return; // хоцорсон дуудлагыг үл тоомсорлоно
      app.myHand = cards;
      if (app.room) rebuild(app.room);
    },
    () => {
      // Тоглоом эхлээгүй байхад баримт үүсээгүй тул эрх татгалзаж болно.
      // Сонсогчийг цэвэрлээд дараагийн snapshot дээр дахин холбогдоно.
      handUnsub = null;
      if (app.roomCode && app.myIndex === index) {
        setTimeout(() => {
          if (!handUnsub && app.roomCode && app.myIndex === index) resubscribeHand();
        }, 1500);
      }
    },
  );
}

function renderRoom(room) {
  const list = $("seatList");
  list.innerHTML = "";

  for (let i = 0; i < SEAT_COUNT; i += 1) {
    const seat = room.seats[i];
    const li = document.createElement("li");
    li.className = `seat${seat ? "" : " seat--empty"}`;
    li.dataset.seat = String(i);
    if (seat?.uid === app.user?.uid) li.setAttribute("data-me", "");
    if (seat && room.host === seat.uid) li.setAttribute("data-host", "");

    const num = document.createElement("span");
    num.className = "seat-num";
    num.textContent = String(i + 1);
    li.appendChild(num);

    li.appendChild(seatAvatar(seat));

    const who = document.createElement("div");
    who.className = "seat-name";
    if (seat) {
      who.innerHTML = `<strong>${escapeHtml(seat.name)}</strong><small>${
        seat.isBot ? t("seat.bot") : seat.uid === app.user?.uid ? t("seat.you") : t("seat.player")
      }</small>`;
    } else {
      who.innerHTML = `<strong>${t("seat.empty")}</strong><small>${t("seat.waiting")}</small>`;
    }
    li.appendChild(who);

    const tag = document.createElement("span");
    tag.className = "tag";
    if (seat && room.host === seat.uid) {
      tag.classList.add("tag--host");
      tag.textContent = t("seat.hostTag");
    } else if (seat) {
      tag.textContent = t("seat.readyTag");
    } else {
      tag.textContent = t("common.dash");
    }
    li.appendChild(tag);

    list.appendChild(li);
  }

  const humans = humanSeats(room.seats).length;
  const filled = seatCount(room.seats);
  const host = isHost();
  const stale = hostLooksStale();

  $("allowBots").checked = Boolean(room.allowBots);
  $("allowBots").disabled = !host;

  const ready = room.allowBots ? humans >= 1 : filled === SEAT_COUNT;
  $("btnStartRoom").disabled = !host || !ready;
  $("btnStartRoom").textContent = host ? t("room.start") : stale ? t("host.switching") : t("host.waiting");
  setHint(
    "roomHint",
    stale && !host
      ? t("host.staleHint")
      : ready
        ? host
          ? ""
          : t("room.waitHost")
        : room.allowBots
          ? t("room.canStartWithBots")
          : t("room.waitingForPlayers", { count: SEAT_COUNT, filled }),
    stale && !host,
  );
}

/** Аватарыг DOM-оор үүсгэнэ — зурагны хаягийг markup руу оруулахгүй. */
function seatAvatar(seat) {
  const node = document.createElement("span");
  node.className = "avatar";
  if (!seat) {
    node.textContent = "·";
    return node;
  }
  if (seat.photo) {
    const img = document.createElement("img");
    img.src = seat.photo;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    node.appendChild(img);
  } else {
    node.textContent = seat.isBot ? "🤖" : (seat.name ?? "?").slice(0, 1).toUpperCase();
  }
  return node;
}

/**
 * Тоглоом эхлүүлэх. ГҮЙЛГЭЭГЭЭР хийж байгаа тул яг тэр агшинд
 * нэгдэж буй тоглогч алдагдахгүй (өмнө нь seats-ийг дарж бичдэг байсан).
 */
async function handleStartRoom() {
  if (!isHost()) return;

  try {
    const built = await fb.startGameTransaction(app.roomCode, app.user.uid, (seats, data) => {
      const filled = [...seats];
      if (data.allowBots) {
        for (let i = 0; i < SEAT_COUNT; i += 1) {
          if (!filled[i]) filled[i] = makeBotSeat(i, BOT_NAMES[i % BOT_NAMES.length]);
        }
      }
      if (humanSeats(filled).length === 0) return null;
      if (occupiedSeats(filled).length < 2) return null;

      // Суудлын дугаар = тоглогчийн index. Хоосон нүд үлдвэл тэр
      // суудлыг хасагдсан гэж эхлүүлнэ — индекс гулсуулахгүй.
      const defs = filled.map((seat, index) =>
        seat
          ? { id: seat.uid, name: seat.name, isBot: seat.isBot }
          : { id: `empty-${index}`, name: "—", isBot: false },
      );
      const absent = filled.map((seat, index) => (seat ? -1 : index)).filter((i) => i >= 0);
      const game = createGame(defs, { absent });
      return { seats: filled, state: serializeGame(game), game };
    });

    if (built) await writeHandsFor(built.game, built.seats);
  } catch (error) {
    console.error(error);
    setHint("roomHint", friendlyError(error), true);
  }
}

/** Гар бүрийг эзний нь баримтад бичнэ. */
async function writeHandsFor(game, seats) {
  const hands = {};
  game.players.forEach((p) => {
    if (!seats[p.index]) return;
    hands[p.index] = { uid: seats[p.index].uid, cards: p.hand };
  });
  await fb.writeHands(app.roomCode, hands);
}

/** Хост: гарыг тус тусад нь бичээд, нийтийн төлөвийг шинэчилнэ. */
async function publishGame(game, seats, status) {
  await writeHandsFor(game, seats);
  const version = await fb.publishState(app.roomCode, { state: serializeGame(game), status });
  if (app.room) app.room = { ...app.room, stateVersion: version };
}

async function handleLeaveRoom() {
  if (app.roomCode && app.user) await fb.leaveRoom(app.roomCode, app.user.uid);
  exitToLobby();
}

function copyCode() {
  navigator.clipboard
    ?.writeText(app.roomCode ?? "")
    .then(() => toast(t("room.codeCopied")))
    .catch(() => toast(t("room.codeCopyFailed")));
}

/* ══════════ Онлайн тоглоомын төлөв ══════════ */

let handUnsub = null;

function onRoomState(room) {
  if (!room.state) return;
  if (!handUnsub) resubscribeHand();
  if (Array.isArray(app.myHand)) rebuild(room);
}

function rebuild(room) {
  if (!room?.state || !Array.isArray(app.myHand)) return;


  app.game = deserializeGame(room.state, { [app.myIndex]: app.myHand });

  // Шинэ үе эхэлсэн бол өмнөх үеийн дүнгийн цонхыг хаана — өмнө нь
  // host дараагийн үеийг эхлүүлсэн ч бусдын дэлгэц дээр хуучин цонх
  // хэвээр үлдэж, ард нь тоглоом явдаг байсан.
  if (app.game.phase === PHASE.PLAYING && lastShownRound !== app.game.round) closeModal();

  showScreen("game");
  draw();

  // Суудал ба төлөв зөрсөн бол хэн нэг нь тоглоом дундаас гарсан гэсэн үг.
  // Зурахыг зогсоовол бүгд гацна — тиймээс зөвхөн мэдэгдэнэ (draw-ийн ДАРАА,
  // үгүй бол banner тэр даруй дарагдана).
  if (!seatsMatchState(room.seats, room.state)) {
    setBanner(t("room.playerLeft"), "error");
  }

  if (app.game.phase === PHASE.PLAYING && isHost()) scheduleBotChain();
  if (app.game.phase !== PHASE.PLAYING) handleRoundEnd();
}

/* ── Bot-ын гүйлт ─────────────────────────────────
   Өмнө нь нэг bot нүүсний дараа шинэ snapshot ирэхгүй тул
   дараалсан bot-ын ээлж зогсдог байсан. Одоо host нэг удаа
   гинжийг эхлүүлээд, bot-ын ээлж дуустал өөрөө үргэлжлүүлнэ. */

let botRunning = false;

function scheduleBotChain() {
  if (botRunning) return;
  botRunning = true;
  runBotChain().finally(() => {
    botRunning = false;
  });
}

async function runBotChain() {
  // Хязгаарт хүрвэл snapshot хүлээхгүй — өөрөө дахин эхэлнэ.
  // Өмнө нь зөвхөн bot-той үлдсэн тоглоом 40 нүүдлийн дараа царцдаг байв.
  for (let guard = 0; guard < 40; guard += 1) {
    if (!app.roomCode || !app.room || !isHost()) return;
    const state = app.room.state;
    if (!state || state.phase !== PHASE.PLAYING) return;

    const seat = app.room.seats?.[state.turn];
    // Bot эсвэл гарсан (хоосон) суудлыг host гүйцээж тоглоно — эс бөгөөс
    // гарсан хүний ээлж дээр тоглоом царцна. Идэвхтэй хүн байвал хүлээнэ.
    if (seat && !seat.isBot) return;

    await new Promise((r) => setTimeout(r, 650));
    if (!app.roomCode || !app.room || !isHost()) return;

    const code = app.roomCode;
    const turn = state.turn;
    let next;
    try {
      const cards = await fb.readHand(code, turn);
      const full = deserializeGame(app.room.state, {
        [app.myIndex]: app.myHand ?? [],
        [turn]: cards,
      });
      if (full.phase !== PHASE.PLAYING || full.turn !== turn) return;

      const move = chooseMove(full, turn, { difficulty: app.room?.botLevel ?? DIFFICULTY.EXPERT });
      const result = move ? play(full, turn, move.cards) : pass(full, turn);
      if (!result.ok && !pass(full, turn).ok) return; // гацахаас сэргийлнэ

      next = serializeGame(full);
      // Bot-ын нүүдэл ч ГҮЙЛГЭЭГЭЭР бичигдэнэ — хүний нүүдлийг дарж бичихгүй
      const committed = await fb.commitMove(code, {
        seatIndex: turn,
        expectedVersion: app.room?.stateVersion,
        state: next,
        hand: full.players[turn].hand,
        uid: seat?.uid ?? full.players[turn]?.id,
      });
      if (!committed.ok) {
        // Хүн бидний өмнө нүүсэн байна — snapshot-оо хүлээгээд зогсоно
        return;
      }
      fb.touchHost(code);
      app.room = { ...app.room, state: next, stateVersion: committed.version };
    } catch (error) {
      console.error(error);
      return;
    }

    if (next.phase !== PHASE.PLAYING) return;
  }

  // Хязгаарт хүрсэн ч тоглоом үргэлжилж байвал гинжийг сэргээнэ
  setTimeout(() => {
    botRunning = false;
    if (app.room?.state?.phase === PHASE.PLAYING && isHost()) scheduleBotChain();
  }, 200);
}

/* ══════════ Нүүдэл ══════════ */

async function handlePlay() {
  const game = app.game;
  const me = game.players[app.myIndex];
  const cards = me.hand.filter((c) => app.selected.has(c.id));
  if (cards.length === 0) {
    setBanner(t("play.selectCards"), "error");
    return;
  }
  const result = play(game, app.myIndex, cards);
  if (!result.ok) {
    setBanner(translateEngineError(result.error), "error");
    return;
  }
  app.selected.clear();
  app.hintIds.clear();
  setBanner("");
  await commitMove();
}

async function handlePass() {
  const result = pass(app.game, app.myIndex);
  if (!result.ok) {
    setBanner(translateEngineError(result.error), "error");
    return;
  }
  app.selected.clear();
  setBanner("");
  await commitMove();
}

async function commitMove() {
  draw();
  if (app.mode === "local") {
    if (app.game.phase === PHASE.PLAYING) scheduleBot();
    else handleRoundEnd();
    return;
  }
  try {
    const result = await fb.commitMove(app.roomCode, {
      seatIndex: app.myIndex,
      expectedVersion: app.room?.stateVersion,
      state: serializeGame(app.game),
      hand: app.game.players[app.myIndex].hand,
      uid: app.user.uid,
    });
    if (result.ok) {
      // Хувилбараа шинэчилнэ — snapshot ирэхээс өмнө дахин нүүвэл "stale" болохгүй
      if (app.room) app.room = { ...app.room, stateVersion: result.version };
    } else {
      // Өөр хэн нэг нь бидний өмнө бичсэн — сүүлийн байдал руу буцаана
      if (result.reason === "stale" || result.reason === "not-your-turn") {
        toast(t("move.staleRefreshed"));
        if (app.room) rebuild(app.room);
      } else {
        toast(t("move.saveFailed"));
      }
    }
  } catch (error) {
    toast(t("move.saveFailed"));
    console.error(error);
  }
}

function handleHint() {
  const game = app.game;
  const me = game.players[app.myIndex];
  const required = game.mustPlayStartingCard ? game.startingCardId : null;
  const options = enumeratePlays(me.hand, game.table, required);
  if (options.length === 0) {
    setBanner(t("hint.none"), "error");
    return;
  }
  const move = chooseMove(game, app.myIndex) ?? options[0];
  app.selected = new Set(move.cards.map((c) => c.id));
  app.hintIds = new Set(move.cards.map((c) => c.id));
  setBanner(t("hint.suggestion", { label: translateComboLabel(move.label) }), "good");
  draw();
}

function toggleSort() {
  app.sortMode = app.sortMode === "rank" ? "suit" : "rank";
  app.handOrder = []; // автомат эрэмбэ рүү буцахад гараар зөөсөн дараалал цуцлагдана
  $("btnSort").textContent = app.sortMode === "rank" ? t("sort.byRank") : t("sort.bySuit");
  draw();
}

/**
 * Хэрэглэгчийн гараар зөөсөн дараалал байвал ТҮҮНИЙГ баримтална.
 * Дараалал нь зөвхөн одоогийн гарт байгаа хөзрүүдээр хязгаарлагдана —
 * өмнөх үеийн хуучин id үлдэж, шинэ тараалтыг эвдэхээс сэргийлнэ.
 */
function sortedHand(hand) {
  const copy = [...hand];
  const order = app.handOrder;

  if (order.length) {
    const pos = new Map(order.map((id, i) => [id, i]));
    const known = copy.filter((c) => pos.has(c.id)).sort((a, b) => pos.get(a.id) - pos.get(b.id));
    const fresh = autoSort(copy.filter((c) => !pos.has(c.id)));
    return [...known, ...fresh];
  }
  return autoSort(copy);
}

function autoSort(cards) {
  const copy = [...cards];
  if (app.sortMode === "suit") {
    copy.sort(
      (a, b) => suitOrder(b.suit) - suitOrder(a.suit) || rankOrder(a.rank) - rankOrder(b.rank),
    );
  } else {
    copy.sort((a, b) => cardValue(a) - cardValue(b));
  }
  return copy;
}

/* ══════════ Дүрслэх ══════════ */

function draw() {
  const game = app.game;
  if (!game) return;
  // Хөзөр чирэгдэж байх үед гарыг дахин барихгүй — чирэлт тасрахаас сэргийлнэ
  if (isDragging()) return;
  const me = game.players[app.myIndex];
  const view = {
    ...game,
    players: game.players.map((p) =>
      p.index === app.myIndex ? { ...p, hand: sortedHand(p.hand) } : p,
    ),
  };
  renderOpponents(view, app.myIndex);
  renderPile(view);
  renderHand(view, app.myIndex, app.selected, app.hintIds);
  renderSelection(view, app.myIndex, app.selected);
  renderPlayPreview(view, app.myIndex, app.selected);
  renderStatus(view, app.myIndex);
  renderLog(view);

  if (game.phase === PHASE.PLAYING) {
    const turnName = game.players[game.turn].name;
    if (hostLooksStale() && !isHost()) {
      setBanner(t("host.recovering"), "error");
    } else if (game.turn === app.myIndex) {
      setBanner(game.table ? t("turn.yourTurnBeat") : t("turn.yourTurnLead"));
    } else {
      setBanner(t("turn.someone", { name: turnName }));
    }
  }
  void me;
}

/* ══════════ Үе / тоглоомын төгсгөл ══════════ */

/**
 * Ranking-д бүртгэх. Гурван хамгаалалт:
 *   1. Зөвхөн ОНЛАЙН тоглоом — bot-той дасгал ranking-д тоологдохгүй.
 *   2. Дор хаяж 2 хүн байсан байх — ганцаараа bot дарж оноо цуглуулахгүй.
 *   3. gameId-гаар давхардлыг таслана — өрөөнд дахин ороход дахин нэмэгдэхгүй.
 */
function recordGameResult(game, won) {
  if (!fb.online || !app.user) return;
  if (app.mode !== "online" || !app.room) return;

  const humans = humanSeats(app.room.seats ?? []).length;
  if (humans < 2) {
    setBanner(t("rank.practiceNotCounted"));
    return;
  }

  const gameId = app.room.gameId ?? `${app.roomCode}-${app.room.startedAt ?? 0}`;
  if (app.recordedGameId === gameId) return;
  app.recordedGameId = gameId;

  fb.recordResult(app.user.uid, {
    gameId,
    won,
    name: app.user.displayName,
    rounds: app.stats.rounds,
    roundWins: app.stats.roundWins,
    points: app.stats.points,
  })
    .then((saved) => {
      if (saved) loadLeaderboard();
    })
    .catch(console.error);
}

let lastShownRound = -1;

function ratingDeltaForMatch(won) {
  return (won ? 100 : -25) + app.stats.roundWins * 20 - app.stats.points * 3;
}

function matchSummaryNode(won) {
  const node = document.createElement("div");
  node.className = "match-summary";
  const delta = app.mode === "online" && !app.user?.isAnonymous ? ratingDeltaForMatch(won) : null;
  node.innerHTML = `
    <div class="summary-stat" data-main="true"><b>${won ? "WIN" : "LOSE"}</b><span>${t("summary.result")}</span></div>
    <div class="summary-stat"><b>${app.stats.roundWins}</b><span>${t("summary.roundsWon")}</span></div>
    <div class="summary-stat"><b>${app.stats.points}</b><span>${t("summary.penalty")}</span></div>
    <div class="summary-stat"><b>${delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta}`}</b><span>${t("summary.rankChange")}</span></div>`;
  return node;
}

function handleRoundEnd() {
  const game = app.game;
  if (!game.lastRound || lastShownRound === game.round) return;
  lastShownRound = game.round;
  // Шинэ тараалт — хуучин дараалал ба СОНГОЛТ хоёулаа хамаарахгүй.
  // Өмнө нь сонголт үлдэж, шинэ гарт ижил id-тай хөзөр сонгоотой
  // харагдаж, санамсаргүй тавигдах эрсдэлтэй байсан.
  app.handOrder = [];
  app.selected.clear();
  app.hintIds.clear();

  const outcome = game.lastRound;
  const mine = outcome.results.find((r) => r.id === app.myIndex);
  app.stats.rounds += 1;
  if (mine?.isRoundWinner) app.stats.roundWins += 1;
  app.stats.points += mine?.points ?? 0;

  const body = document.createElement("div");

  if (game.phase === PHASE.GAME_END) {
    const won = Boolean(game.gameWinner) && game.gameWinner.id === game.players[app.myIndex].id;
    body.appendChild(matchSummaryNode(won));
    body.appendChild(roundResultTable(outcome, game.players));
    recordGameResult(game, won);
    if (app.mode === "online" && isHost() && app.roomCode) {
      fb.updateRoom(app.roomCode, { status: "finished" }).catch(console.error);
      setDashboardContext({ inGame: false });
    }
    openModal({
      // Ялагчгүй дуусах нь бий: ганцаараа bot-той тоглоод 30 оноо цуглуулах
      title: won
        ? t("end.youWon")
        : game.gameWinner
          ? t("end.someoneWon", { name: game.gameWinner.name })
          : t("end.lost"),
      body,
      actions: [
        { label: t("end.toLobby"), onClick: exitGame },
        { label: t("end.replay"), primary: true, onClick: replay },
      ],
    });
    return;
  }

  body.appendChild(roundResultTable(outcome, game.players));
  openModal({
    title: t("round.ended", { round: game.round }),
    body,
    actions: [
      {
        label: t("round.next"),
        primary: true,
        onClick: async () => {
          if (app.mode === "local") {
            nextRound(game);
            draw();
            scheduleBot();
          } else if (isHost()) {
            const fresh = deserializeGame(app.room.state);
            nextRound(fresh);
            await publishGame(fresh, app.room.seats, "playing");
          } else {
            toast(t("round.hostWillStart"));
          }
        },
      },
    ],
  });
}

function replay() {
  lastShownRound = -1;
  if (app.mode === "local") startLocalGame();
  else exitGame();
}

function exitGame() {
  clearTimeout(app.botTimer);
  if (app.mode === "online") handleLeaveRoom();
  else exitToLobby();
}

function exitToLobby() {
  clearSubscriptions();
  stopHostWatchdog();
  setActiveRoom(null);
  setDashboardContext({ roomCode: null, inGame: false });
  clearTimeout(app.botTimer);
  app.game = null;
  app.room = null;
  app.roomCode = null;
  app.myHand = null;
  app.myIndex = 0;
  app.handOrder = [];
  app.recordedGameId = null;
  lastShownRound = -1;
  closeModal();
  showScreen("lobby");
  loadLeaderboard();
}

/** Гарын сонсогчийг ҮНЭХЭЭР салгана. Өмнө нь зөвхөн лавлагааг null
 *  болгодог тул сонсогч амьд үлдэж, өөр өрөөнд ижил суудалд суухад
 *  ХУУЧИН өрөөний гарыг харуулж, тэрийгээ тавьж болох эрсдэлтэй байв. */
function stopHandWatch() {
  if (handUnsub) {
    try {
      handUnsub();
    } catch {
      /* аль хэдийн салсан */
    }
  }
  handUnsub = null;
}

function clearSubscriptions() {
  app.unsub.forEach((fn) => {
    try {
      fn();
    } catch {
      /* алгасна */
    }
  });
  app.unsub = [];
  stopHandWatch();
  app.myHand = null;
}

/* ══════════ Туслах ══════════ */

function showRules() {
  openModal({
    title: t("rules.heading"),
    body: `
      <p>${t("modal.rules.line1")}</p>
      <p>${t("modal.rules.line2")}</p>
      <p>${t("modal.rules.line3")}</p>
      <p>${t("modal.rules.line4")}</p>
      <p>${t("modal.rules.line5")}</p>
      <p>${t("modal.rules.line6")}</p>`,
    actions: [{ label: t("common.gotIt"), primary: true }],
  });
}

function requireOnline() {
  if (!fb.online) {
    setHint("lobbyHint", t("online.required"), true);
    return false;
  }
  return true;
}

function setHint(id, text, isError = false) {
  const node = $(id);
  node.textContent = text;
  if (isError) node.setAttribute("data-error", "");
  else node.removeAttribute("data-error");
}

function friendlyError(error) {
  const code = error?.code ?? "";
  if (code.includes("popup-closed")) return t("err.popupClosed");
  if (code.includes("popup-blocked")) return t("err.popupBlocked");
  if (code.includes("operation-not-allowed")) return t("err.authMethodDisabled");
  if (code.includes("permission-denied")) return t("err.permissionDenied");
  return error?.message ?? t("err.generic");
}

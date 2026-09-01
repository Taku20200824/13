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
import { chooseMove } from "./bot.js";
import { enumeratePlays } from "./rules.js";
import * as fb from "./firebase.js";
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
  renderStatus,
  renderLog,
  setBanner,
  roundResultTable,
} from "./ui.js";

const BOT_NAMES = ["Болд", "Саруул", "Номин", "Дорж", "Оюун", "Тэмүүлэн"];

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
  stats: { rounds: 0, roundWins: 0, points: 0 },
};

/* ══════════ Boot ══════════ */

boot();

async function boot() {
  wireEvents();

  if (!fb.online) {
    $("btnGoogle").disabled = true;
    $("authNote").textContent =
      "Firebase тохиргоо ороогүй байна — одоогоор bot-той офлайн тоглоно.";
    showScreen("auth");
    return;
  }

  try {
    await fb.initFirebase();
  } catch (error) {
    console.error(error);
    $("authNote").textContent = "Firebase-д холбогдож чадсангүй.";
    showScreen("auth");
    return;
  }

  fb.onAuth(async (user) => {
    if (!user) {
      app.user = null;
      showScreen("auth");
      return;
    }
    app.user = user;
    renderAccount();
    showScreen("lobby");
    loadLeaderboard();
  });
}

/* ══════════ Нэвтрэлт ══════════ */

function wireEvents() {
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
      $("leaderboard").innerHTML =
        '<li class="lb-empty">Ranking-д Firebase тохиргоо шаардлагатай.</li>';
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
    if (!node || node.disabled) return;
    const id = node.dataset.id;
    app.selected.has(id) ? app.selected.delete(id) : app.selected.add(id);
    app.hintIds.clear();
    draw();
  });

  $("modal").addEventListener("click", (event) => {
    if (event.target === $("modal")) closeModal();
  });
}

function renderAccount() {
  const node = $("account");
  node.innerHTML = "";
  if (!app.user) return;
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  if (app.user.photoURL) {
    avatar.innerHTML = `<img src="${app.user.photoURL}" alt="" referrerpolicy="no-referrer" />`;
  } else {
    avatar.textContent = (app.user.displayName ?? "?").slice(0, 1).toUpperCase();
  }
  const meta = document.createElement("div");
  meta.className = "account-meta";
  meta.innerHTML = `<strong>${escapeHtml(app.user.displayName ?? "Зочин")}</strong><small>${
    app.user.isAnonymous ? "зочин" : "Google"
  }</small>`;
  const out = document.createElement("button");
  out.className = "link";
  out.textContent = "Гарах";
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
  list.innerHTML = '<li class="lb-empty">Ачаалж байна…</li>';
  try {
    const rows = await fb.fetchLeaderboard(20);
    if (rows.length === 0) {
      list.innerHTML = '<li class="lb-empty">Одоогоор бүртгэл алга.</li>';
      return;
    }
    list.innerHTML = "";
    rows.forEach((row, i) => {
      const li = document.createElement("li");
      li.className = "lb-row";
      if (app.user && row.uid === app.user.uid) li.setAttribute("data-me", "");
      li.innerHTML = `
        <span class="lb-pos">${i + 1}</span>
        <span class="lb-name">${escapeHtml(row.displayName ?? "Зочин")}</span>
        <span class="lb-score">${row.wins ?? 0}<small> / ${row.games ?? 0}</small></span>`;
      list.appendChild(li);
    });
  } catch (error) {
    console.error(error);
    list.innerHTML = '<li class="lb-empty">Ranking-г уншиж чадсангүй.</li>';
  }
}

/* ══════════ Офлайн тоглоом ══════════ */

function startLocalGame() {
  clearSubscriptions();
  app.mode = "local";
  app.myIndex = 0;
  app.stats = { rounds: 0, roundWins: 0, points: 0 };
  const bots = BOT_NAMES.slice(0, 3).map((name) => ({ name, isBot: true }));
  app.game = createGame([{ name: app.user?.displayName ?? "Та", isBot: false }, ...bots]);
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
    const move = chooseMove(game, index);
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

async function handleCreateRoom() {
  if (!requireOnline()) return;
  try {
    const code = await fb.createRoom(app.user, { allowBots: true });
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
    setHint("lobbyHint", "Код 6 тэмдэгттэй байна.", true);
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
  $("roomCode").textContent = code;
  setHint("roomHint", "");
  showScreen("room");

  app.unsub.push(
    fb.watchRoom(code, (room) => {
      if (!room) {
        toast("Өрөө хаагдлаа.");
        exitToLobby();
        return;
      }
      app.room = room;
      const seat = room.seats.findIndex((s) => s.uid === app.user.uid);
      if (seat === -1) {
        toast("Та өрөөнөөс гарсан байна.");
        exitToLobby();
        return;
      }
      app.myIndex = seat;

      if (room.status === "waiting") {
        renderRoom(room);
        showScreen("room");
      } else if (room.status === "playing" || room.status === "finished") {
        onRoomState(room);
      }
    }),
  );
}

function renderRoom(room) {
  const list = $("seatList");
  list.innerHTML = "";
  for (let i = 0; i < 4; i += 1) {
    const seat = room.seats[i];
    const li = document.createElement("li");
    li.className = `seat${seat ? "" : " seat--empty"}`;
    if (seat) {
      li.innerHTML = `
        <span class="avatar">${
          seat.photo
            ? `<img src="${seat.photo}" alt="" referrerpolicy="no-referrer" />`
            : escapeHtml((seat.name ?? "?").slice(0, 1).toUpperCase())
        }</span>
        <strong>${escapeHtml(seat.name)}</strong>
        <span class="tag${room.host === seat.uid ? " tag--host" : ""}">${
          room.host === seat.uid ? "хост" : "бэлэн"
        }</span>`;
    } else {
      li.innerHTML = `<span class="avatar">·</span><strong>Хоосон суудал</strong>`;
    }
    list.appendChild(li);
  }

  $("allowBots").checked = Boolean(room.allowBots);
  $("allowBots").disabled = !isHost();
  const ready = room.allowBots ? room.seats.length >= 2 : room.seats.length === 4;
  $("btnStartRoom").disabled = !isHost() || !ready;
  $("btnStartRoom").textContent = isHost() ? "Тоглоом эхлүүлэх" : "Хостыг хүлээж байна…";
  setHint(
    "roomHint",
    ready ? "" : room.allowBots ? "Дор хаяж 2 хүн хэрэгтэй." : "4 хүн бүрдэх хүртэл хүлээнэ.",
  );
}

async function handleStartRoom() {
  if (!isHost()) return;
  const room = app.room;
  const seats = [...room.seats];
  if (room.allowBots) {
    let b = 0;
    while (seats.length < 4) {
      seats.push({ uid: `bot-${b}`, name: BOT_NAMES[b], photo: null, isBot: true });
      b += 1;
    }
  }
  const game = createGame(seats.map((s) => ({ id: s.uid, name: s.name, isBot: s.isBot })));
  await publishGame(game, seats, "playing");
}

/** Хост: гарыг тус тусад нь бичээд, нийтийн төлөвийг шинэчилнэ. */
async function publishGame(game, seats, status) {
  const hands = {};
  game.players.forEach((p) => {
    hands[p.index] = { uid: seats[p.index]?.uid ?? null, cards: p.hand };
  });
  await fb.writeHands(app.roomCode, hands);
  await fb.updateRoom(app.roomCode, {
    status,
    seats,
    state: serializeGame(game),
  });
}

async function handleLeaveRoom() {
  if (app.roomCode && app.user) await fb.leaveRoom(app.roomCode, app.user.uid);
  exitToLobby();
}

function copyCode() {
  navigator.clipboard
    ?.writeText(app.roomCode ?? "")
    .then(() => toast("Код хуулагдлаа."))
    .catch(() => toast("Хуулж чадсангүй — гараар хуулна уу."));
}

/* ══════════ Онлайн тоглоомын төлөв ══════════ */

let handUnsub = null;

function onRoomState(room) {
  if (!room.state) return;

  if (!handUnsub) {
    handUnsub = fb.watchHand(app.roomCode, app.myIndex, (cards) => {
      app.myHand = cards;
      rebuild(room);
    });
    app.unsub.push(() => {
      handUnsub?.();
      handUnsub = null;
    });
  }
  rebuild(room);
}

function rebuild(room) {
  if (!room.state) return;
  app.game = deserializeGame(room.state, { [app.myIndex]: app.myHand ?? [] });
  showScreen("game");
  draw();

  if (app.game.phase === PHASE.PLAYING && isHost()) driveBots();
  if (app.game.phase !== PHASE.PLAYING) handleRoundEnd();
}

/** Хост bot-уудын нүүдлийг гүйцэтгэнэ. */
let botBusy = false;
async function driveBots() {
  const game = app.game;
  const seat = app.room.seats[game.turn];
  if (!seat?.isBot || botBusy) return;
  botBusy = true;
  try {
    await new Promise((r) => setTimeout(r, 700));
    const cards = await fb.readHand(app.roomCode, game.turn);
    const full = deserializeGame(app.room.state, {
      [app.myIndex]: app.myHand ?? [],
      [game.turn]: cards,
    });
    const move = chooseMove(full, game.turn);
    const result = move ? play(full, game.turn, move.cards) : pass(full, game.turn);
    if (!result.ok) pass(full, game.turn);
    await fb.writeHand(app.roomCode, game.turn, {
      uid: seat.uid,
      cards: full.players[game.turn].hand,
    });
    await fb.updateRoom(app.roomCode, { state: serializeGame(full) });
  } catch (error) {
    console.error(error);
  } finally {
    botBusy = false;
  }
}

/* ══════════ Нүүдэл ══════════ */

async function handlePlay() {
  const game = app.game;
  const me = game.players[app.myIndex];
  const cards = me.hand.filter((c) => app.selected.has(c.id));
  if (cards.length === 0) {
    setBanner("Хөзөр сонгоно уу.", "error");
    return;
  }
  const result = play(game, app.myIndex, cards);
  if (!result.ok) {
    setBanner(result.error, "error");
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
    setBanner(result.error, "error");
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
    await fb.writeHand(app.roomCode, app.myIndex, {
      uid: app.user.uid,
      cards: app.game.players[app.myIndex].hand,
    });
    await fb.updateRoom(app.roomCode, { state: serializeGame(app.game) });
  } catch (error) {
    toast("Нүүдлийг хадгалж чадсангүй.");
    console.error(error);
  }
}

function handleHint() {
  const game = app.game;
  const me = game.players[app.myIndex];
  const required = game.mustPlayStartingCard ? game.startingCardId : null;
  const options = enumeratePlays(me.hand, game.table, required);
  if (options.length === 0) {
    setBanner("Тавих боломж алга — пасс хийнэ үү.", "error");
    return;
  }
  const move = chooseMove(game, app.myIndex) ?? options[0];
  app.selected = new Set(move.cards.map((c) => c.id));
  app.hintIds = new Set(move.cards.map((c) => c.id));
  setBanner(`Зөвлөмж: ${move.label}`, "good");
  draw();
}

function toggleSort() {
  app.sortMode = app.sortMode === "rank" ? "suit" : "rank";
  $("btnSort").textContent = app.sortMode === "rank" ? "Эрэмбэ: тоо" : "Эрэмбэ: өнгө";
  draw();
}

function sortedHand(hand) {
  const copy = [...hand];
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
  renderStatus(view, app.myIndex);
  renderLog(view);

  if (game.phase === PHASE.PLAYING) {
    const turnName = game.players[game.turn].name;
    if (game.turn === app.myIndex) {
      setBanner(game.table ? "Таны ээлж — дийлэх хослол тавина." : "Таны ээлж — шинээр эхэлнэ.");
    } else {
      setBanner(`${turnName}-ийн ээлж…`);
    }
  }
  void me;
}

/* ══════════ Үе / тоглоомын төгсгөл ══════════ */

let lastShownRound = -1;

function handleRoundEnd() {
  const game = app.game;
  if (!game.lastRound || lastShownRound === game.round) return;
  lastShownRound = game.round;

  const outcome = game.lastRound;
  const mine = outcome.results.find((r) => r.id === app.myIndex);
  app.stats.rounds += 1;
  if (mine?.isRoundWinner) app.stats.roundWins += 1;
  app.stats.points += mine?.points ?? 0;

  const body = document.createElement("div");
  body.appendChild(roundResultTable(outcome, game.players));

  if (game.phase === PHASE.GAME_END) {
    const won = game.gameWinner?.id === game.players[app.myIndex].id;
    if (fb.online && app.user && app.mode) {
      fb.recordResult(app.user.uid, {
        won,
        rounds: app.stats.rounds,
        roundWins: app.stats.roundWins,
        points: app.stats.points,
      }).catch(console.error);
    }
    openModal({
      title: won ? "🏆 Та тоглоомыг яллаа!" : `${game.gameWinner?.name} яллаа`,
      body,
      actions: [
        { label: "Lobby руу", onClick: exitGame },
        { label: "Дахин тоглох", primary: true, onClick: replay },
      ],
    });
    return;
  }

  openModal({
    title: `${game.round}-р үе дууслаа`,
    body,
    actions: [
      {
        label: "Дараагийн үе",
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
            toast("Хост дараагийн үеийг эхлүүлнэ.");
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
  clearTimeout(app.botTimer);
  app.game = null;
  app.room = null;
  app.roomCode = null;
  app.myHand = null;
  lastShownRound = -1;
  closeModal();
  showScreen("lobby");
  loadLeaderboard();
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
  handUnsub = null;
}

/* ══════════ Туслах ══════════ */

function showRules() {
  openModal({
    title: "Дүрэм",
    body: `
      <p><strong>Өнгө:</strong> гил ♠ &gt; бундан ♥ &gt; цэцэг ♣ &gt; дөрвөлжин ♦</p>
      <p><strong>Тоо:</strong> 3 4 5 6 7 8 9 10 J Q K A 2</p>
      <p><strong>Хослолууд:</strong> нэг · хос · сет · страйт (5) · флаш (5 ижил өнгө) ·
      фүл хаус · покер (4+1) · страйт флаш · рояал флаш</p>
      <p><strong>5 хөзрийн эрэмбэ:</strong> страйт &lt; флаш &lt; фүл хаус &lt; покер &lt; страйт флаш</p>
      <p><strong>Оноо:</strong> нэг хүн хөзрөө дуусгамагц үе дуусна. Үлдсэн хөзрийн тоо
      оноо болно. 10-аас дээш хөзөр үлдвэл ×2, нэг ч хөзөр гаргаагүй (13) бол ×3.</p>
      <p><strong>Хасалт:</strong> 30 оноо цуглуулсан тоглогч хасагдана. Сүүлд үлдсэн нь ялагч.</p>`,
    actions: [{ label: "Ойлголоо", primary: true }],
  });
}

function requireOnline() {
  if (!fb.online) {
    setHint("lobbyHint", "Онлайн тоглохын тулд Firebase тохиргоо шаардлагатай.", true);
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
  if (code.includes("popup-closed")) return "Нэвтрэх цонх хаагдлаа.";
  if (code.includes("popup-blocked")) return "Browser popup-г хаасан байна.";
  if (code.includes("operation-not-allowed"))
    return "Firebase Console дээр энэ нэвтрэх аргыг идэвхжүүлээгүй байна.";
  if (code.includes("permission-denied")) return "Firestore дүрэм зөвшөөрөхгүй байна.";
  return error?.message ?? "Алдаа гарлаа.";
}

const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );

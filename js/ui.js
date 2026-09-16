// DOM зураглал — тоглоомын логикоос ангид.
import { detect } from "./rules.js";
import { escapeHtml as escapeText } from "./text.js";
import { pointsLabel, ELIMINATION_SCORE } from "./scoring.js";

export const $ = (id) => document.getElementById(id);

export function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.removeAttribute("data-active"));
  const target = $(`screen${name[0].toUpperCase()}${name.slice(1)}`);
  if (target) target.setAttribute("data-active", "");
}

/* ── Toast ба Modal ─────────────────────────────── */

let toastTimer = null;

export function toast(text, ms = 2400) {
  const node = $("toast");
  node.textContent = text;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.hidden = true), ms);
}

export function openModal({ title, body, actions = [] }) {
  $("modalTitle").textContent = title;
  const bodyNode = $("modalBody");
  bodyNode.innerHTML = "";
  if (typeof body === "string") bodyNode.innerHTML = body;
  else if (body) bodyNode.appendChild(body);

  const actionsNode = $("modalActions");
  actionsNode.innerHTML = "";
  actions.forEach((action) => {
    const btn = document.createElement("button");
    btn.className = `btn ${action.primary ? "btn--primary" : "btn--ghost"}`;
    btn.type = "button";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      closeModal();
      action.onClick?.();
    });
    actionsNode.appendChild(btn);
  });
  $("modal").hidden = false;
}

export const closeModal = () => ($("modal").hidden = true);

/* ── Хөзөр ──────────────────────────────────────── */

export function cardNode(card, { interactive = false } = {}) {
  const node = document.createElement(interactive ? "button" : "div");
  node.className = `card ${card.color}`;
  node.dataset.id = card.id;
  if (interactive) node.type = "button";
  node.setAttribute(
    "aria-label",
    `${card.rank} ${card.suitName}`,
  );
  // Булангийн тэмдэглэгээ жинхэнэ хөзөр шиг босоо: тоо дээр нь, өнгө доор нь.
  // Гар давхарлагдсан үед энэ л хэсэг харагдана.
  node.innerHTML = `
    <span class="index"><b>${card.rank}</b><i>${card.symbol}</i></span>
    <span class="big">${card.symbol}</span>
    <span class="index index--foot"><b>${card.rank}</b><i>${card.symbol}</i></span>`;
  return node;
}

const initials = (name) => (name || "?").trim().slice(0, 1).toUpperCase();

/**
 * Тараалтын анимацийг ЗӨВХӨН шинэ зангилаанд өгнө.
 *
 * Урьд нь "энэ үед аль хэдийн тараасан уу" гэдгийг Map-д тэмдэглэж,
 * `data-dealing` гэсэн тугаар удирддаг байв. Бүх зангилаа дүрслэл бүрд
 * дахин үүсдэг байсан тул өөр аргагүй байсан юм. Одоо зангилаанууд
 * байрандаа үлддэг болсон тул "шинэ эсэх" нь өөрөө хариулт болно.
 */
function markFresh(node) {
  node.dataset.fresh = "";
  node.addEventListener(
    "animationend",
    () => node.removeAttribute("data-fresh"),
    { once: true },
  );
}

/* ── DOM-ыг ДАХИН БАРИХГҮЙ шинэчлэх ─────────────────
   `innerHTML = ""` нь бичихэд хялбар ч үнэтэй: CSS анимац дахин эхэлж,
   зураг дахин ачаалагдаж, hover/focus алдагдана. draw() нь нүүдэл бүрд
   дуудагддаг тул хэрэглэгчийн нүдэнд "хөзөр байнга дахин ачаалагдаж
   байна" гэж харагддаг гол шалтгаан нь ЯГ энэ байсан.

   Оронд нь түлхүүрээр тааруулж, ЗӨВХӨН өөрчлөгдсөнийг нь хөдөлгөнө:
   хуучин зангилаа байрандаа үлдэж, шинэ нь л анимацтай орж ирнэ. */

function reconcile(parent, keys, create, update) {
  const wanted = new Set(keys);
  const existing = new Map();
  for (const child of [...parent.children]) {
    const key = child.dataset.key;
    if (key !== undefined && wanted.has(key) && !existing.has(key)) existing.set(key, child);
    else child.remove();
  }

  keys.forEach((key, index) => {
    let node = existing.get(key);
    if (!node) {
      node = create(key, index);
      node.dataset.key = key;
    }
    update(node, key, index);
    // Дарааллыг нь засах — аль хэдийн байрандаа байвал хөндөхгүй
    if (parent.children[index] !== node) parent.insertBefore(node, parent.children[index] ?? null);
  });
}

/** Утга үнэхээр өөрчлөгдсөн үед л бичнэ — дэмий reflow үүсгэхгүй. */
const setText = (node, text) => {
  if (node.textContent !== text) node.textContent = text;
};

const setFlag = (node, name, on) => {
  if (on === node.hasAttribute(name)) return;
  if (on) node.setAttribute(name, "");
  else node.removeAttribute(name);
};

const setData = (node, name, value) => {
  if (node.dataset[name] !== value) node.dataset[name] = value;
};

/**
 * Нум хэлбэрээр байрлуулах хоёр утга: эргэлт ба доош бууралт.
 *
 * CSS дотор `calc(var(--off) * var(--off))` гэж бичиж болохгүй — хоёр
 * хувьсагчийг үржүүлэхийг browser голж, бүх дүрэм хүчингүй болдог.
 * Тиймээс индекс ба нийт тоог мэддэг энд бодож өгнө.
 */
const FAN_TILT = 2.4; // хөзөр тус бүрийн налуугийн өсөлт (градус)
const FAN_LIFT = 0.8; // захын хөзөр доошоо бууж, нум үүсгэнэ

function setArc(node, index, total, tilt, lift) {
  const off = index - (total - 1) / 2;
  const deg = `${(off * tilt).toFixed(2)}deg`;
  const down = `${(off * off * lift).toFixed(2)}px`;
  if (node.style.getPropertyValue("--tilt") !== deg) node.style.setProperty("--tilt", deg);
  if (node.style.getPropertyValue("--lift") !== down) node.style.setProperty("--lift", down);
}

/* ── Тоглоомын дэлгэц ───────────────────────────── */

function seatSkeleton() {
  const node = document.createElement("article");
  node.className = "seat-card";
  node.innerHTML = `
    <div class="action-bubble"></div>
    <div class="seat-head">
      <span class="avatar"></span>
      <div class="seat-who"><strong></strong><small></small></div>
      <span class="seat-badge"></span>
    </div>
    <div class="mini-hand"></div>
    <div class="score-bar"><i></i></div>`;
  return node;
}

/** Аватар — зургийн `src`-ыг ӨӨРЧЛӨГДВӨЛ Л бичнэ, эс бөгөөс дахин татагдана. */
function updateAvatar(node, player) {
  if (player.photo) {
    let img = node.querySelector("img");
    if (!img) {
      node.textContent = "";
      img = document.createElement("img");
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      node.appendChild(img);
    }
    if (img.getAttribute("src") !== player.photo) img.setAttribute("src", player.photo);
    return;
  }
  const img = node.querySelector("img");
  if (img) img.remove();
  setText(node, player.isBot ? "🤖" : initials(player.name));
}

export function renderOpponents(game, myIndex) {
  const wrap = $("opponents");
  const passedSet = game.passed?.has ? game.passed : new Set(game.passed ?? []);
  const seats = game.players.filter((p) => p.index !== myIndex && !p.absent);
  const bySeat = new Map(seats.map((p) => [String(p.index), p]));

  reconcile(
    wrap,
    seats.map((p) => String(p.index)),
    seatSkeleton,
    (node, key) => {
      const player = bySeat.get(key);
      const count = player.handCount ?? player.hand.length;
      const passLabel = `пасс · ${count}`;
      const isTurn = player.index === game.turn && game.phase === "playing";
      const hasPassed = passedSet.has(player.index);

      setFlag(node, "data-turn", isTurn);
      setFlag(node, "data-passed", hasPassed);
      setFlag(node, "data-out", Boolean(player.eliminated));
      setFlag(node, "data-owner", player.index === game.tableOwner);

      // Сүүлийн үйлдлийн бөмбөлөг — хэн юу хийснийг шууд харуулна
      const bubble = node.querySelector(".action-bubble");
      if (player.eliminated) {
        setData(bubble, "kind", "out");
        setText(bubble, "хасагдлаа");
      } else if (hasPassed) {
        setData(bubble, "kind", "pass");
        setText(bubble, passLabel);
      } else if (player.lastAction?.kind === "play") {
        setData(bubble, "kind", "play");
        setText(bubble, player.lastAction.label);
      } else {
        setData(bubble, "kind", "idle");
        setText(bubble, "");
      }

      updateAvatar(node.querySelector(".avatar"), player);
      setText(node.querySelector(".seat-who strong"), player.name);
      setText(node.querySelector(".seat-who small"), `${player.score} оноо`);

      const badge = node.querySelector(".seat-badge");
      if (player.eliminated) {
        setData(badge, "kind", "out");
        setText(badge, "хасагдсан");
      } else if (isTurn) {
        setData(badge, "kind", "turn");
        setText(badge, "ээлж");
      } else if (hasPassed) {
        setData(badge, "kind", "pass");
        setText(badge, passLabel);
      } else {
        setData(badge, "kind", "cards");
        setText(badge, `${count}`);
      }

      const mini = node.querySelector(".mini-hand");
      const shown = Math.min(count, 13);
      // Түлхүүрт ҮЕИЙН дугаарыг оруулна: шинэ үе эхлэхэд бүх ар тал
      // дахин үүсэж, тараалтын анимац цэвэр ажиллана.
      reconcile(
        mini,
        Array.from({ length: shown }, (_, i) => `${game.round}:${i}`),
        () => {
          const back = document.createElement("span");
          back.className = "card-back";
          markFresh(back);
          return back;
        },
        (back, _key, i) => back.style.setProperty("--deal-index", String(player.index * 13 + i)),
      );

      const bar = node.querySelector(".score-bar");
      const pct = Math.min(100, (player.score / ELIMINATION_SCORE) * 100);
      setFlag(bar, "data-danger", pct >= 70);
      const fill = bar.querySelector("i");
      const width = `${pct}%`;
      if (fill.style.width !== width) fill.style.width = width;
    },
  );
}

export function renderPile(game) {
  const pile = $("pile");
  const owner = $("pileOwner");

  if (!game.table) {
    if (pile.childElementCount) pile.replaceChildren();
    if (owner.childElementCount) owner.replaceChildren();
    return;
  }

  const player = game.players[game.tableOwner];
  const comboName = game.table.label.split(" (")[0];
  // Бүтэц нь бүрэн эсэхийг шалгана — дутуу бол дахин барина
  let chip = owner.querySelector(".pile-chip");
  if (!chip || !chip.querySelector("b") || !chip.querySelector("span")) {
    owner.replaceChildren();
    chip = document.createElement("span");
    chip.className = "pile-chip";
    chip.innerHTML = "<b></b><span></span>";
    owner.appendChild(chip);
  }
  setText(chip.querySelector("b"), player?.name ?? "");
  setText(chip.querySelector("span"), ` тавив · ${comboName}`);

  const cards = new Map(game.table.cards.map((c) => [c.id, c]));
  reconcile(
    pile,
    game.table.cards.map((c) => c.id),
    (id) => cardNode(cards.get(id)),
    (node, _id, index) => {
      node.style.setProperty("--deal-index", String(index));
      setArc(node, index, game.table.cards.length, 1.7, 0.35);
    },
  );
}

export function renderHand(game, myIndex, selected, hintIds = new Set()) {
  const wrap = $("hand");
  const me = game.players[myIndex];
  const myTurn = game.turn === myIndex && game.phase === "playing";

  // Нум нь захын хөзрийг ДООШ буулгадаг ч урсгалын өндрийг өөрчилдөггүй.
  // Тиймээс тэр гүнийг хэмжиж, доор нь зай үлдээхийг CSS-д хэлнэ —
  // эс бөгөөс хөзөр доорх товчнууд дээр давхарлана.
  const depth = `${(FAN_LIFT * ((me.hand.length - 1) / 2) ** 2).toFixed(1)}px`;
  if (wrap.style.getPropertyValue("--fan-depth") !== depth) {
    wrap.style.setProperty("--fan-depth", depth);
  }

  const cards = new Map(me.hand.map((c) => [c.id, c]));
  reconcile(
    wrap,
    me.hand.map((c) => c.id),
    (id) => {
      const node = cardNode(cards.get(id), { interactive: true });
      markFresh(node);
      // draggable-ыг ЗААВАЛ унтраана: үгүй бол Chrome өөрийн native drag
      // эхлүүлж, pointer урсгалыг тасалдаг (хулганаар зөөх ажиллахгүй болно)
      node.draggable = false;
      return node;
    },
    (node, id, index) => {
      node.style.setProperty("--deal-index", String(index));
      // Нумын хазайлт: төвөөс хол хөзөр илүү налж, доошоо бууна.
      // CSS calc нь хоёр хувьсагчийг үржүүлж чаддаггүй тул энд боддог.
      setArc(node, index, me.hand.length, FAN_TILT, FAN_LIFT);
      setFlag(node, "data-selected", selected.has(id));
      setFlag(node, "data-hint", hintIds.has(id));
      // ЧУХАЛ: хөзрийг disabled болгохгүй. Disabled товч drag эхлүүлж
      // чаддаггүй тул ээлж биш үед гараа эрэмбэлэх боломжгүй болно.
      setFlag(node, "data-locked", !myTurn);
      const disabled = String(!myTurn);
      if (node.getAttribute("aria-disabled") !== disabled) {
        node.setAttribute("aria-disabled", disabled);
      }
    },
  );
}

/** Сонгосон хөзрүүдийг жижигрүүлж харуулна. Сонголтгүй бол огт харагдахгүй. */
export function renderPlayPreview(game, myIndex, selected) {
  const wrap = $("playPreview");
  const cards = $("playPreviewCards");
  const combo = $("playPreviewCombo");
  const me = game.players[myIndex];
  const chosen = me.hand.filter((c) => selected.has(c.id));

  if (chosen.length === 0) {
    wrap.hidden = true;
    if (cards.childElementCount) cards.replaceChildren();
    setText(combo, "");
    return;
  }

  wrap.hidden = false;
  const byId = new Map(chosen.map((c) => [c.id, c]));
  reconcile(
    cards,
    chosen.map((c) => c.id),
    (id) => {
      const node = cardNode(byId.get(id));
      node.classList.add("card--mini");
      return node;
    },
    () => {},
  );

  const found = detect(chosen);
  setText(combo, found ? found.label.split(" (")[0] : "хослол биш");
  setData(combo, "state", found ? "ok" : "bad");
}

export function renderSelection(game, myIndex, selected) {
  const node = $("selection");
  const me = game.players[myIndex];
  const cards = me.hand.filter((c) => selected.has(c.id));
  node.removeAttribute("data-valid");
  node.removeAttribute("data-invalid");

  if (cards.length === 0) {
    node.hidden = false;
    node.textContent = "Хөзөр сонгоно уу";
    return;
  }
  // Сонголт байгаа үед preview самбар мэдээллийг харуулна — давхардуулахгүй
  node.hidden = true;
  return;
}

export function renderStatus(game, myIndex) {
  const me = game.players[myIndex];
  $("roundChip").textContent = `${game.round}-р үе`;
  $("youName").textContent = me.name;
  $("youScore").textContent = `${me.score} оноо · ${me.hand.length} хөзөр`;
  const avatar = $("youAvatar");
  avatar.textContent = initials(me.name);

  const myTurn = game.turn === myIndex && game.phase === "playing";
  const passedSet = game.passed?.has ? game.passed : new Set(game.passed ?? []);
  const you = $("you");
  you.toggleAttribute("data-turn", myTurn);
  you.toggleAttribute("data-passed", passedSet.has(myIndex));

  const status = $("youStatus");
  if (me.eliminated) {
    status.dataset.kind = "out";
    status.textContent = "хасагдсан";
  } else if (myTurn) {
    status.dataset.kind = "turn";
    status.textContent = "таны ээлж";
  } else if (passedSet.has(myIndex)) {
    status.dataset.kind = "pass";
    status.textContent = `пасс · ${me.hand.length}`;
  } else {
    status.dataset.kind = "wait";
    status.textContent = "хүлээж байна";
  }

  $("btnPlay").disabled = !myTurn;
  $("btnPass").disabled = !myTurn || !game.table;
  $("btnHint").disabled = !myTurn;
}

let lastLog = [];

export function renderLog(game) {
  const list = $("log");
  const lines = (game.log ?? []).slice(-5).map((entry) => entry.text);
  // Өөрчлөгдөөгүй бол огт хөндөхгүй — дэмий reflow үүсгэхгүй
  if (lines.length === lastLog.length && lines.every((t, i) => t === lastLog[i])) return;
  lastLog = lines;

  list.replaceChildren();
  for (const text of lines) {
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
  }
}

export function setBanner(text, tone) {
  const node = $("banner");
  node.textContent = text;
  if (tone) node.setAttribute("data-tone", tone);
  else node.removeAttribute("data-tone");
}

/* ── Үеийн дүнгийн хүснэгт ──────────────────────── */

export function roundResultTable(outcome, players) {
  const table = document.createElement("table");
  table.className = "result-table";
  table.innerHTML = `
    <thead>
      <tr><th>Тоглогч</th><th>Үлдсэн</th><th>Оноо</th><th>Нийт</th></tr>
    </thead>`;
  const body = document.createElement("tbody");

  [...outcome.results]
    .sort((a, b) => a.scoreAfter - b.scoreAfter)
    .forEach((r) => {
      const row = document.createElement("tr");
      if (r.isRoundWinner) row.setAttribute("data-winner", "");
      if (outcome.eliminated.includes(r.id)) row.setAttribute("data-out", "");
      const eliminated = outcome.eliminated.includes(r.id);
      row.innerHTML = `
        <td>${escapeText(players[r.id]?.name ?? r.name)}${eliminated ? " · хасагдлаа" : ""}</td>
        <td>${r.cardsLeft}</td>
        <td class="result-calc">${pointsLabel(r.cardsLeft)}</td>
        <td>${r.scoreAfter}</td>`;
      body.appendChild(row);
    });

  table.appendChild(body);
  return table;
}

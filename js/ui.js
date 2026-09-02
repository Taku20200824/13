// DOM зураглал — тоглоомын логикоос ангид.
import { detect } from "./rules.js";
import { escapeHtml as escapeText } from "./text.js";
import { pointsLabel } from "./scoring.js";
import { ELIMINATION_SCORE } from "./scoring.js";

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

function avatarNode(player) {
  const node = document.createElement("span");
  node.className = "avatar";
  if (player.photo) {
    const img = document.createElement("img");
    img.src = player.photo;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    node.appendChild(img);
  } else {
    node.textContent = player.isBot ? "🤖" : initials(player.name);
  }
  return node;
}

/* ── Тоглоомын дэлгэц ───────────────────────────── */

export function renderOpponents(game, myIndex) {
  const wrap = $("opponents");
  wrap.innerHTML = "";
  const passedSet = game.passed?.has ? game.passed : new Set(game.passed ?? []);

  game.players
    .filter((p) => p.index !== myIndex && !p.absent)
    .forEach((player) => {
      const count = player.handCount ?? player.hand.length;
      const isTurn = player.index === game.turn && game.phase === "playing";
      const hasPassed = passedSet.has(player.index);

      const node = document.createElement("article");
      node.className = "seat-card";
      if (isTurn) node.setAttribute("data-turn", "");
      if (hasPassed) node.setAttribute("data-passed", "");
      if (player.eliminated) node.setAttribute("data-out", "");
      if (player.index === game.tableOwner) node.setAttribute("data-owner", "");

      // Сүүлийн үйлдлийн бөмбөлөг — хэн юу хийснийг шууд харуулна
      const bubble = document.createElement("div");
      bubble.className = "action-bubble";
      if (player.eliminated) {
        bubble.dataset.kind = "out";
        bubble.textContent = "хасагдлаа";
      } else if (hasPassed) {
        bubble.dataset.kind = "pass";
        bubble.textContent = "пасс";
      } else if (player.lastAction?.kind === "play") {
        bubble.dataset.kind = "play";
        bubble.textContent = player.lastAction.label;
      } else {
        bubble.dataset.kind = "idle";
        bubble.textContent = "";
      }
      node.appendChild(bubble);

      const head = document.createElement("div");
      head.className = "seat-head";
      head.appendChild(avatarNode(player));

      const who = document.createElement("div");
      who.className = "seat-who";
      who.innerHTML = `<strong>${escapeText(player.name)}</strong><small>${player.score} оноо</small>`;
      head.appendChild(who);

      const badge = document.createElement("span");
      badge.className = "seat-badge";
      if (player.eliminated) {
        badge.dataset.kind = "out";
        badge.textContent = "хасагдсан";
      } else if (isTurn) {
        badge.dataset.kind = "turn";
        badge.textContent = "ээлж";
      } else if (hasPassed) {
        badge.dataset.kind = "pass";
        badge.textContent = "пасс";
      } else {
        badge.dataset.kind = "cards";
        badge.textContent = `${count}`;
      }
      head.appendChild(badge);
      node.appendChild(head);

      const mini = document.createElement("div");
      mini.className = "mini-hand";
      for (let i = 0; i < Math.min(count, 13); i += 1) {
        const back = document.createElement("span");
        back.className = "card-back";
        mini.appendChild(back);
      }
      node.appendChild(mini);

      const bar = document.createElement("div");
      bar.className = "score-bar";
      const pct = Math.min(100, (player.score / ELIMINATION_SCORE) * 100);
      if (pct >= 70) bar.setAttribute("data-danger", "");
      bar.innerHTML = `<i style="width:${pct}%"></i>`;
      node.appendChild(bar);

      wrap.appendChild(node);
    });
}


export function renderPile(game) {
  const pile = $("pile");
  pile.innerHTML = "";
  const owner = $("pileOwner");
  if (!game.table) {
    owner.innerHTML = "";
    return;
  }
  const player = game.players[game.tableOwner];
  const comboName = game.table.label.split(" (")[0];
  owner.innerHTML = `<span class="pile-chip"><b>${escapeText(player?.name ?? "")}</b> тавив · ${escapeText(comboName)}</span>`;
  game.table.cards.forEach((card) => pile.appendChild(cardNode(card)));
}

export function renderHand(game, myIndex, selected, hintIds = new Set()) {
  const wrap = $("hand");
  wrap.innerHTML = "";
  const me = game.players[myIndex];
  const myTurn = game.turn === myIndex && game.phase === "playing";

  // ЧУХАЛ: хөзрийг disabled болгохгүй. Disabled товч drag эхлүүлж чаддаггүй
  // тул өмнө нь ээлж биш үед гараа эрэмбэлэх боломжгүй байсан.
  // Оронд нь `data-locked` тэмдэглэгээ өгч, сонголтыг л хаана.
  me.hand.forEach((card) => {
    const node = cardNode(card, { interactive: true });
    if (selected.has(card.id)) node.setAttribute("data-selected", "");
    if (hintIds.has(card.id)) node.setAttribute("data-hint", "");
    if (!myTurn) node.setAttribute("data-locked", "");
    // draggable-ыг ЗААВАЛ унтраана: үгүй бол Chrome өөрийн native drag
    // эхлүүлж, pointer урсгалыг тасалдаг (хулганаар зөөх ажиллахгүй болно)
    node.draggable = false;
    node.setAttribute("aria-disabled", String(!myTurn));
    wrap.appendChild(node);
  });
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
    cards.innerHTML = "";
    combo.textContent = "";
    return;
  }

  wrap.hidden = false;
  cards.innerHTML = "";
  chosen.forEach((card) => {
    const node = cardNode(card);
    node.classList.add("card--mini");
    cards.appendChild(node);
  });

  const found = detect(chosen);
  if (found) {
    combo.textContent = found.label.split(" (")[0];
    combo.dataset.state = "ok";
  } else {
    combo.textContent = "хослол биш";
    combo.dataset.state = "bad";
  }
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
  const combo = detect(cards);
  if (!combo) {
    node.textContent = `${cards.length} хөзөр · хослол биш`;
    node.setAttribute("data-invalid", "");
    return;
  }
  node.textContent = combo.label;
  node.setAttribute("data-valid", "");
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
    status.textContent = "пасс хийсэн";
  } else {
    status.dataset.kind = "wait";
    status.textContent = "хүлээж байна";
  }

  $("btnPlay").disabled = !myTurn;
  $("btnPass").disabled = !myTurn || !game.table;
  $("btnHint").disabled = !myTurn;
}

export function renderLog(game) {
  const list = $("log");
  list.innerHTML = "";
  (game.log ?? []).slice(-5).forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = entry.text;
    list.appendChild(li);
  });
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
        <td>${players[r.id]?.name ?? r.name}${eliminated ? " · хасагдлаа" : ""}</td>
        <td>${r.cardsLeft}</td>
        <td class="result-calc">${pointsLabel(r.cardsLeft)}</td>
        <td>${r.scoreAfter}</td>`;
      body.appendChild(row);
    });

  table.appendChild(body);
  return table;
}

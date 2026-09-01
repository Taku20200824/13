// DOM зураглал — тоглоомын логикоос ангид.
import { detect } from "./rules.js";
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
  game.players
    .filter((p) => p.index !== myIndex)
    .forEach((player) => {
      const count = player.handCount ?? player.hand.length;
      const node = document.createElement("article");
      node.className = "opponent";
      if (player.index === game.turn && game.phase === "playing") node.setAttribute("data-turn", "");
      if (player.eliminated) node.setAttribute("data-out", "");

      const head = document.createElement("div");
      head.className = "opp-head";
      head.appendChild(avatarNode(player));
      const name = document.createElement("strong");
      name.textContent = player.name;
      head.appendChild(name);

      const state = document.createElement("span");
      state.className = "opp-state";
      if (player.eliminated) {
        state.dataset.kind = "out";
        state.textContent = "хасагдсан";
      } else if (game.passed.has?.(player.index) ?? game.passed?.includes?.(player.index)) {
        state.dataset.kind = "pass";
        state.textContent = "пасс";
      } else if (player.index === game.turn) {
        state.textContent = "ээлж";
      } else {
        state.textContent = `${count}`;
      }
      head.appendChild(state);
      node.appendChild(head);

      const meta = document.createElement("div");
      meta.className = "opp-meta";
      meta.innerHTML = `<span>${count} хөзөр</span><span>${player.score} оноо</span>`;
      node.appendChild(meta);

      const bar = document.createElement("div");
      bar.className = "score-bar";
      const pct = Math.min(100, (player.score / ELIMINATION_SCORE) * 100);
      if (pct >= 70) bar.setAttribute("data-danger", "");
      bar.innerHTML = `<i style="width:${pct}%"></i>`;
      node.appendChild(bar);

      const mini = document.createElement("div");
      mini.className = "mini-hand";
      for (let i = 0; i < Math.min(count, 13); i += 1) {
        const back = document.createElement("span");
        back.className = "card-back";
        mini.appendChild(back);
      }
      node.appendChild(mini);

      wrap.appendChild(node);
    });
}

export function renderPile(game) {
  const pile = $("pile");
  pile.innerHTML = "";
  const owner = $("pileOwner");
  if (!game.table) {
    owner.textContent = "";
    return;
  }
  owner.textContent = `${game.players[game.tableOwner]?.name ?? ""} · ${game.table.label.split(" (")[0]}`;
  game.table.cards.forEach((card) => pile.appendChild(cardNode(card)));
}

export function renderHand(game, myIndex, selected, hintIds = new Set()) {
  const wrap = $("hand");
  wrap.innerHTML = "";
  const me = game.players[myIndex];
  const myTurn = game.turn === myIndex && game.phase === "playing";

  me.hand.forEach((card) => {
    const node = cardNode(card, { interactive: true });
    if (selected.has(card.id)) node.setAttribute("data-selected", "");
    if (hintIds.has(card.id)) node.setAttribute("data-hint", "");
    node.disabled = !myTurn;
    wrap.appendChild(node);
  });
}

export function renderSelection(game, myIndex, selected) {
  const node = $("selection");
  const me = game.players[myIndex];
  const cards = me.hand.filter((c) => selected.has(c.id));
  node.removeAttribute("data-valid");
  node.removeAttribute("data-invalid");

  if (cards.length === 0) {
    node.textContent = "Хөзөр сонгоно уу";
    return;
  }
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

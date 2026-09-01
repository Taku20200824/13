const ORDER_KEY = "huzur13.customHandOrder.v1";

const hand = document.getElementById("hand");
const preview = document.getElementById("selectedPreviewCards");
const sortButton = document.getElementById("btnSort");
const leaderboard = document.getElementById("leaderboard");

let draggedId = null;
let syncing = false;

const readOrder = () => {
  try {
    return JSON.parse(localStorage.getItem(ORDER_KEY) || "[]");
  } catch {
    return [];
  }
};

const saveOrder = (ids) => {
  localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
};

const clearDropMarks = () => {
  hand?.querySelectorAll(".card").forEach((card) => {
    card.removeAttribute("data-drop-left");
    card.removeAttribute("data-drop-right");
  });
};

function applySavedOrder() {
  if (!hand || syncing) return;
  const cards = [...hand.querySelectorAll(".card")];
  if (cards.length < 2) return;

  const order = readOrder();
  if (!order.length) return;

  const index = new Map(order.map((id, pos) => [id, pos]));
  const sorted = [...cards].sort((a, b) => {
    const ai = index.has(a.dataset.id) ? index.get(a.dataset.id) : Number.MAX_SAFE_INTEGER;
    const bi = index.has(b.dataset.id) ? index.get(b.dataset.id) : Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  const currentIds = cards.map((card) => card.dataset.id).join("|");
  const sortedIds = sorted.map((card) => card.dataset.id).join("|");
  if (currentIds === sortedIds) return;

  syncing = true;
  sorted.forEach((card) => hand.appendChild(card));
  syncing = false;
}

function enhanceCards() {
  if (!hand) return;
  [...hand.querySelectorAll(".card")].forEach((card) => {
    card.draggable = !card.disabled;
    card.title = "Чирээд хөзрөө өөрийнхөөрөө эрэмбэлнэ";
  });
}

function renderSelectedPreview() {
  if (!hand || !preview) return;
  const selected = [...hand.querySelectorAll(".card[data-selected]")];
  preview.innerHTML = "";

  if (!selected.length) {
    preview.textContent = "Хөзөр сонгоно уу";
    return;
  }

  selected.forEach((card) => {
    const clone = card.cloneNode(true);
    clone.removeAttribute("id");
    clone.removeAttribute("draggable");
    clone.removeAttribute("data-dragging");
    clone.removeAttribute("data-drop-left");
    clone.removeAttribute("data-drop-right");
    clone.disabled = true;
    preview.appendChild(clone);
  });
}

function syncEnhancements() {
  applySavedOrder();
  enhanceCards();
  renderSelectedPreview();
}

function moveDraggedCard(target, event) {
  if (!hand || !draggedId || !target || target.dataset.id === draggedId) return;

  const dragged = hand.querySelector(`.card[data-id="${CSS.escape(draggedId)}"]`);
  if (!dragged) return;

  const rect = target.getBoundingClientRect();
  const placeAfter = event.clientX > rect.left + rect.width / 2;
  hand.insertBefore(dragged, placeAfter ? target.nextSibling : target);
  saveOrder([...hand.querySelectorAll(".card")].map((card) => card.dataset.id));
  renderSelectedPreview();
}

function ensureRankingFallback() {
  if (!leaderboard) return;
  const text = leaderboard.textContent.trim();
  const hasRows = leaderboard.querySelector(".lb-row");
  const needsFallback =
    !hasRows &&
    (text === "" ||
      text.includes("Ranking-г уншиж чадсангүй") ||
      text.includes("Firebase тохиргоо") ||
      text.includes("Одоогоор бүртгэл алга"));

  if (!needsFallback) return;

  leaderboard.innerHTML = `
    <li class="lb-row" data-local-rank>
      <span class="lb-pos">1</span>
      <span class="lb-name">Local тоглогч</span>
      <span class="lb-score">0<small> / 0</small></span>
    </li>
    <li class="lb-empty">Ranking Firebase дээр хараахан бэлэн биш байна. Bot-той тоглоход local rank харагдана.</li>`;
}

hand?.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".card");
  if (!card || card.disabled) return;
  draggedId = card.dataset.id;
  card.setAttribute("data-dragging", "");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedId);
});

hand?.addEventListener("dragover", (event) => {
  const target = event.target.closest(".card");
  if (!target || !draggedId) return;
  event.preventDefault();
  clearDropMarks();
  const rect = target.getBoundingClientRect();
  target.setAttribute(event.clientX > rect.left + rect.width / 2 ? "data-drop-right" : "data-drop-left", "");
});

hand?.addEventListener("drop", (event) => {
  const target = event.target.closest(".card");
  event.preventDefault();
  moveDraggedCard(target, event);
  clearDropMarks();
});

hand?.addEventListener("dragend", () => {
  hand.querySelectorAll(".card").forEach((card) => card.removeAttribute("data-dragging"));
  clearDropMarks();
  draggedId = null;
});

hand?.addEventListener("click", () => {
  queueMicrotask(renderSelectedPreview);
});

sortButton?.addEventListener("click", () => {
  localStorage.removeItem(ORDER_KEY);
  queueMicrotask(syncEnhancements);
});

if (hand) {
  new MutationObserver(syncEnhancements).observe(hand, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-selected", "disabled", "data-hint"],
  });
}

if (leaderboard) {
  new MutationObserver(ensureRankingFallback).observe(leaderboard, {
    childList: true,
    subtree: true,
  });
  setTimeout(ensureRankingFallback, 900);
  document.getElementById("btnRefreshRank")?.addEventListener("click", () => {
    setTimeout(ensureRankingFallback, 900);
  });
}

syncEnhancements();
ensureRankingFallback();

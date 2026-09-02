// Гараа чирж эрэмбэлэх — хулгана, хуруу, цайвар үзэг бүгдэд.
//
// HTML5 drag-and-drop (dragstart/drop) нь ХҮРЭЛТЭЭР АЖИЛЛАДАГГҮЙ тул
// утсан дээр хөзрөө зөөх боломжгүй байсан. Одоо Pointer Events
// ашиглаж байгаа — нэг код бүх төхөөрөмжид ажиллана.
//
// Товшилт ба чирэлтийг зайгаар нь ялгана: DRAG_THRESHOLD-оос бага
// хөдөлбөл товшилт (хөзөр сонгох), их бол чирэлт.

const DRAG_THRESHOLD = 8; // px

let handEl = null;
let onReorder = null;

let pointerId = null;
let startX = 0;
let startY = 0;
let dragging = false;
let node = null;
let justDragged = false;

const cardsInDom = () => [...handEl.querySelectorAll(".card")];
const idsInDom = () => cardsInDom().map((c) => c.dataset.id);

function clearMarks() {
  if (!handEl) return;
  handEl.removeAttribute("data-reordering");
  handEl.querySelectorAll(".card").forEach((card) => card.removeAttribute("data-dragging"));
}

/** Заасан цэгийн доорх хөзрийг олно (хуруу хөзрийн гадуур гарсан ч ойрыг нь сонгоно). */
function cardAt(x) {
  const cards = cardsInDom();
  let best = null;
  let bestDist = Infinity;
  for (const card of cards) {
    if (card === node) continue;
    const rect = card.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const dist = Math.abs(x - center);
    if (dist < bestDist) {
      bestDist = dist;
      best = { card, after: x > center };
    }
  }
  return best;
}

function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return; // зөвхөн зүүн товч
  const card = event.target.closest(".card");
  if (!card || !handEl.contains(card)) return;

  pointerId = event.pointerId;
  node = card;
  startX = event.clientX;
  startY = event.clientY;
  dragging = false;
  justDragged = false;
}

function onPointerMove(event) {
  if (pointerId === null || event.pointerId !== pointerId || !node) return;

  const dx = event.clientX - startX;
  const dy = event.clientY - startY;

  if (!dragging) {
    // Босго давахаас өмнө юу ч хийхгүй — товшилт хэвээр үлдэнэ.
    // Босоо чиглэлд илүү хөдөлсөн бол хуудсаа гүйлгэж байна гэж үзнэ.
    if (Math.abs(dx) < DRAG_THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
    dragging = true;
    handEl.setAttribute("data-reordering", "");
    node.setAttribute("data-dragging", "");
    try {
      handEl.setPointerCapture(pointerId);
    } catch {
      /* зарим browser дэмжихгүй — хамаагүй */
    }
  }

  event.preventDefault();

  // Дахин зураглал болж зангилаа салсан бол чирэлтийг зогсооно
  if (!node.isConnected) return finish(false);

  const target = cardAt(event.clientX);
  if (!target) return;
  const ref = target.after ? target.card.nextSibling : target.card;
  if (ref !== node) handEl.insertBefore(node, ref);
}

function onPointerUp(event) {
  if (pointerId === null || event.pointerId !== pointerId) return;
  finish(dragging);
}

function finish(commit) {
  if (commit && handEl) {
    justDragged = true;
    const ids = idsInDom();
    clearMarks();
    onReorder?.(ids);
  } else {
    clearMarks();
  }
  try {
    if (pointerId !== null) handEl?.releasePointerCapture(pointerId);
  } catch {
    /* алгасна */
  }
  pointerId = null;
  node = null;
  dragging = false;
}

/**
 * @param {HTMLElement} hand  #hand элемент
 * @param {(ids: string[]) => void} write  шинэ дарааллыг хүлээн авах
 */
export function initHandOrder(hand, write) {
  handEl = hand;
  onReorder = write;
  if (!handEl) return;

  handEl.addEventListener("pointerdown", onPointerDown);
  handEl.addEventListener("pointermove", onPointerMove, { passive: false });
  handEl.addEventListener("pointerup", onPointerUp);
  handEl.addEventListener("pointercancel", () => finish(false));

  // Чирсний дараах товшилтыг залгина — хөзөр санамсаргүй сонгогдохгүй
  handEl.addEventListener(
    "click",
    (event) => {
      if (!justDragged) return;
      justDragged = false;
      event.stopImmediatePropagation();
      event.preventDefault();
    },
    true,
  );
}

/** Чирэлт яг одоо явагдаж байна уу (зураглалыг түр хойшлуулахад хэрэгтэй). */
export const isDragging = () => dragging;

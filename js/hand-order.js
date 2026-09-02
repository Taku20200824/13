// Гараа чирж эрэмбэлэх.
//
// Хуучин хувилбар (hand-enhancements.js) нь DOM-ын зангилаануудыг шууд
// зөөж, MutationObserver-оор дахин тулгадаг байсан. Улмаас:
//   • тоглоомын төлөв ба дэлгэц дээрх дараалал хоёр салж,
//   • хадгалсан дараалал дараагийн үе рүү шилжиж,
//   • ээлж биш үед хөзөр `disabled` болдог тул зөөж чаддаггүй байв.
//
// Одоо дараалал нь програмын төлөвд (app.handOrder) байрлана —
// цорын ганц эх сурвалж. Энэ модуль зөвхөн чирэх үйлдлийг барьж
// авч, шинэ дарааллыг буцаана.

let handEl = null;
let onReorder = null;
let getOrder = null;
let draggedId = null;

const cardsInDom = () => [...handEl.querySelectorAll(".card")].map((c) => c.dataset.id);

const clearMarks = () => {
  handEl?.querySelectorAll(".card").forEach((card) => {
    card.removeAttribute("data-drop-left");
    card.removeAttribute("data-drop-right");
    card.removeAttribute("data-dragging");
  });
};

/**
 * @param {HTMLElement} hand   #hand элемент
 * @param {() => string[]} readOrder  одоогийн дэлгэц дээрх дараалал
 * @param {(ids: string[]) => void} write  шинэ дарааллыг хүлээн авах
 */
export function initHandOrder(hand, readOrder, write) {
  handEl = hand;
  getOrder = readOrder;
  onReorder = write;
  if (!handEl) return;

  handEl.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".card");
    if (!card) return;
    draggedId = card.dataset.id;
    card.setAttribute("data-dragging", "");
    event.dataTransfer.effectAllowed = "move";
    // Firefox drag эхлэхийн тулд ямар нэг өгөгдөл шаардана
    try {
      event.dataTransfer.setData("text/plain", draggedId);
    } catch {
      /* алгасна */
    }
  });

  handEl.addEventListener("dragover", (event) => {
    if (!draggedId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const target = event.target.closest(".card");
    if (!target || target.dataset.id === draggedId) return;
    const rect = target.getBoundingClientRect();
    const right = event.clientX > rect.left + rect.width / 2;
    handEl.querySelectorAll(".card").forEach((c) => {
      c.removeAttribute("data-drop-left");
      c.removeAttribute("data-drop-right");
    });
    target.setAttribute(right ? "data-drop-right" : "data-drop-left", "");
  });

  handEl.addEventListener("drop", (event) => {
    event.preventDefault();
    const target = event.target.closest(".card");
    if (draggedId && target && target.dataset.id !== draggedId) {
      const rect = target.getBoundingClientRect();
      const after = event.clientX > rect.left + rect.width / 2;
      applyMove(draggedId, target.dataset.id, after);
    }
    draggedId = null;
    clearMarks();
  });

  handEl.addEventListener("dragend", () => {
    draggedId = null;
    clearMarks();
  });

  handEl.addEventListener("dragleave", (event) => {
    if (event.target === handEl) clearMarks();
  });
}

function applyMove(movedId, targetId, after) {
  const ids = getOrder?.() ?? cardsInDom();
  const without = ids.filter((id) => id !== movedId);
  const at = without.indexOf(targetId);
  if (at === -1) return;
  without.splice(after ? at + 1 : at, 0, movedId);
  onReorder?.(without);
}

/** Гар нь ямар ч үед — өрсөлдөгчийн ээлжид ч — зөөгдөх боломжтой эсэх. */
export const isReorderable = () => Boolean(handEl);

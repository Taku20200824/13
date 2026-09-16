// Горим сонгох — dark/light mode шиг сонгодог хоёр байдал.
//
//   felt — жинхэнэ байдал: ногоон фетр ширээ
//   code — ажлын дэлгэц: код бичиж байгаа мэт харагдана
//
// Тоглоом нь хоёуланд нь ЯГ ижил ажиллана — зөвхөн харагдах байдал
// өөрчлөгдөнө. Сонголтыг `<html data-theme="...">` дээр тавьдаг бөгөөд
// өнгө бүр CSS хувьсагчаар тодорхойлогддог тул энэ файл зөвхөн тэр нэг
// шинжийг л мэднэ.

const STORAGE_KEY = "huzur.theme";

export const THEMES = [
  { id: "felt", label: "Ширээ", hint: "Жинхэнэ хөзрийн ширээ" },
  { id: "code", label: "Код", hint: "Ажлын дэлгэц шиг харагдана" },
];

const IDS = new Set(THEMES.map((t) => t.id));
const DEFAULT = "felt";

/** Хадгалсан сонголт. Байхгүй эсвэл танигдахгүй бол жинхэнэ ширээ. */
export function storedTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private горимд localStorage хаалттай байж болно — асуудалгүй
  }
  return saved && IDS.has(saved) ? saved : DEFAULT;
}

export function applyTheme(id) {
  const theme = IDS.has(id) ? id : DEFAULT;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Хадгалж чадсангүй ч идэвхтэй сесс дээр ажиллана
  }
  return theme;
}

/**
 * Сонгогчийг байгаа контейнер бүрд барина.
 *
 * Хэд хэдэн дэлгэц дээр тус тусдаа байрлана — аль нэгэнд нь дарсан ч
 * бусад нь тэмдэглэгээгээ шууд шинэчилнэ.
 */
export function mountThemePickers(selector = "[data-theme-picker]") {
  const groups = [...document.querySelectorAll(selector)];
  if (!groups.length) return;

  const sync = (active) => {
    for (const group of groups) {
      for (const button of group.querySelectorAll("button[data-theme-id]")) {
        const on = button.dataset.themeId === active;
        button.toggleAttribute("data-on", on);
        button.setAttribute("aria-pressed", String(on));
      }
    }
  };

  for (const group of groups) {
    group.replaceChildren();
    for (const theme of THEMES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "theme-option";
      button.dataset.themeId = theme.id;
      button.textContent = theme.label;
      button.title = theme.hint;
      button.addEventListener("click", () => sync(applyTheme(theme.id)));
      group.appendChild(button);
    }
  }

  sync(document.documentElement.dataset.theme || storedTheme());
}

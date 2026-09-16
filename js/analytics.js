// Vercel Web Analytics — build ХИЙДЭГГҮЙ төсөлд зориулсан хувилбар.
//
// Албан ёсны заавар `npm i @vercel/analytics` хийгээд
// `import { inject } from "@vercel/analytics"` гэж бичихийг санал болгодог.
// Энэ төсөлд ТЭР АЖИЛЛАХГҮЙ, хоёр шалтгаанаар:
//
//   1. Browser-ийн ES module нь "@vercel/analytics" гэсэн нүцгэн нэрийг
//      задалж чаддаггүй — bundler эсвэл import map хэрэгтэй. Энэ төсөл
//      build алхамгүй, цэвэр module ачаалдаг.
//   2. `node_modules/` нь .gitignore-д байгаа бөгөөд статик deploy-д
//      хамт явдаггүй. Тиймээс тэр багц production дээр байхгүй.
//
// Харин `@vercel/analytics` өөрөө эцсийн дүндээ ЯГ ЭНЭ script-ийг л
// хуудсанд нэмдэг. Тиймээс шууд нэмнэ — үр дүн нь ижил, хамаарал багатай.
//
// `/_vercel/insights/script.js` нь repo дотор БАЙХГҮЙ: түүнийг Vercel
// өөрөө deploy дээрээ үйлчилдэг. Тиймээс локал сервер дээр 404 өгнө —
// console-ыг дэмий улаан болгохгүйн тулд локал дээр огт нэмэхгүй.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

const SCRIPT_SRC = "/_vercel/insights/script.js";

/**
 * Хуудас ачаалагдмагц нэг удаа дуудна.
 *
 * Analytics нь Vercel дээрх тохиргоог мөн шаарддаг:
 *   • Project Settings → Framework Preset = Other  (Next.js БИШ)
 *   • Analytics таб дээр Web Analytics-ыг асаасан байх
 */
export function initAnalytics() {
  if (typeof document === "undefined") return false;
  if (LOCAL_HOSTS.has(location.hostname)) return false;
  if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return false;

  const script = document.createElement("script");
  script.src = SCRIPT_SRC;
  script.defer = true;
  // Хэмжилт бүтэлгүйтвэл тоглоом үргэлжлэх ёстой — чимээгүй өнгөрнө
  script.addEventListener("error", () => {
    console.warn("Vercel Analytics ачаалагдсангүй (deploy дээр идэвхжсэн эсэхийг шалгана уу).");
  });
  document.head.appendChild(script);
  return true;
}

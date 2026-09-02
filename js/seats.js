// Суудлын систем — өрөө болон тоглоомын төлөвийн ЦОРЫН ГАНЦ эх сурвалж.
//
// Гол зарчим: суудлын массив ҮРГЭЛЖ 4 урттай, индекс нь хэзээ ч гулсдаггүй.
// Хүн гарахад массивыг шахахгүй, зөвхөн тухайн нүдийг чөлөөлнө.
// Ингэснээр `seats[i]` ба `game.players[i]` хоёр мөнхөд нэг зүйлийг заана.
//
// Өмнө нь `seats.filter(...)` хийж массивыг богиносгодог байсан тул
// 1-р суудлын хүн гармагц 2, 3-р суудлынхан 1, 2 болж гулсаж,
// тоглогчид бусдын гарын баримт руу бичдэг байлаа.

export const SEAT_COUNT = 4;
export const HOST_TIMEOUT_MS = 30_000; // host-ын дохио тасарвал энэ хугацааны дараа шилжинэ

/** Хоосон 4 суудал. */
export const emptySeats = () => Array.from({ length: SEAT_COUNT }, () => null);

/** Firestore-оос ирсэн массивыг үргэлж 4 урттай болгож жигдрүүлнэ. */
export function normalizeSeats(seats) {
  const out = emptySeats();
  if (!Array.isArray(seats)) return out;

  seats.forEach((seat, arrayIndex) => {
    if (!seat || !seat.uid) return;
    // Хуучин форматтай (seatIndex талбаргүй) өгөгдлийг байрлалаар нь буулгана
    const index = Number.isInteger(seat.seatIndex) ? seat.seatIndex : arrayIndex;
    if (index < 0 || index >= SEAT_COUNT) return;
    if (out[index]) return; // давхардсан бол эхнийхийг үлдээнэ
    out[index] = { ...seat, seatIndex: index };
  });
  return out;
}

export const makeSeat = (user, seatIndex, extra = {}) => ({
  seatIndex,
  uid: user.uid,
  name: user.displayName ?? "Зочин",
  photo: user.photoURL ?? null,
  isBot: false,
  ...extra,
});

export const makeBotSeat = (seatIndex, name) => ({
  seatIndex,
  uid: `bot-${seatIndex}`,
  name,
  photo: null,
  isBot: true,
});

/** Хүний тоглогчийн суудлын дугаар. Олдохгүй бол -1. */
export const seatIndexOf = (seats, uid) =>
  normalizeSeats(seats).findIndex((seat) => seat && seat.uid === uid);

/** Хамгийн эхний чөлөөтэй суудлын дугаар. Дүүрсэн бол -1. */
export const firstFreeSeat = (seats) => normalizeSeats(seats).findIndex((seat) => !seat);

export const occupiedSeats = (seats) => normalizeSeats(seats).filter(Boolean);

export const humanSeats = (seats) => occupiedSeats(seats).filter((seat) => !seat.isBot);

export const seatCount = (seats) => occupiedSeats(seats).length;

/** Firestore-д хадгалахад бэлэн хэлбэр — null-г объект болгож хувиргана. */
export const serializeSeats = (seats) =>
  normalizeSeats(seats).map((seat, index) => seat ?? { seatIndex: index, uid: null, empty: true });

/** Уншихад буцаана — `uid: null` бүхий нүдийг хоосон гэж үзнэ. */
export const deserializeSeats = (seats) =>
  normalizeSeats(Array.isArray(seats) ? seats.filter((s) => s && s.uid) : seats);

/**
 * Host-ыг сонгоно. Дүрэм:
 *   1. Одоогийн host суудалтай, bot биш хэвээр бол хэвээр үлдэнэ.
 *   2. Үгүй бол хамгийн бага дугаартай ХҮН суудал host болно.
 *   3. Хүн үлдээгүй бол null (өрөө хаагдана).
 * Bot хэзээ ч host болохгүй — өмнө нь bot host болчихоод тоглоом
 * бүрмөсөн зогсдог алдаа гарч байсан.
 */
export function electHost(seats, currentHost) {
  const humans = humanSeats(seats);
  if (!humans.length) return null;
  if (currentHost && humans.some((seat) => seat.uid === currentHost)) return currentHost;
  return humans.sort((a, b) => a.seatIndex - b.seatIndex)[0].uid;
}

/** Host-ын дохио хэт удаан ирээгүй эсэх. */
export function hostIsStale(hostSeenAt, now = Date.now()) {
  const seen = toMillis(hostSeenAt);
  if (!seen) return false; // хэзээ ч бичигдээгүй бол сүүлийн арга хэмжээ авахгүй
  return now - seen > HOST_TIMEOUT_MS;
}

export function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return 0;
}

/**
 * Тоглоомын төлөв ба суудал зөрсөн эсэхийг шалгана.
 * Зөрвөл ямар нэг индекс буруу заасан гэсэн үг — алдааг эрт барина.
 */
export function seatsMatchState(seats, state) {
  if (!state?.players) return true;
  const normalized = normalizeSeats(seats);
  return state.players.every((player) => {
    const seat = normalized[player.index];
    return seat ? seat.uid === player.id : false;
  });
}

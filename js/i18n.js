// Хэл сольж харуулах систем — Монгол (анхдагч) / Англи.
// Статик HTML текстийг data-i18n* attribute-аар, динамик текстийг t() функцээр
// орчуулна. Тоглоомын цөм (game.js/rules.js) болон түүний тестүүдийг
// өөрчлөхгүйн тулд combo нэр ба engine-ийн алдаа мессежийг энд дүрмээр таньж
// орчуулна (COMBO_NAMES-ийн монгол утгаар урвуу хайна).
import { COMBO_NAMES } from "./rules.js";

const STORAGE_KEY = "lang";
const SUPPORTED = ["mn", "en"];

const dict = {
  mn: {
    "app.title": "13 Хөзөр",
    "app.brandWord": "Хөзөр",
    "lang.toggleTitle": "Хэл сольж үзэх",

    "auth.tagline": "Монгол дүрмээр 4 хүнтэй тоглоно",
    "auth.google": "Google-ээр нэвтрэх",
    "auth.or": "эсвэл",
    "auth.guestNameLabel": "Зочин нэр",
    "auth.guestNamePlaceholder": "Жишээ: Болд",
    "auth.guestSubmit": "Зочноор орох",
    "auth.noFirebase": "Firebase тохиргоо ороогүй байна — одоогоор bot-той офлайн тоглоно.",
    "auth.connectFailed": "Firebase-д холбогдож чадсангүй.",

    "aria.liveStats": "Шууд үзүүлэлт",
    "stats.online": "Онлайн тоглогч",
    "stats.publicRooms": "Public өрөө",
    "stats.privateRooms": "Private өрөө",
    "stats.running": "Явагдаж буй тоглоом",

    "play.heading": "Тоглох",
    "play.vsBots": "Bot-той тоглох",
    "play.vsBotsSub": "Шууд эхэлнэ · 3 bot",
    "play.createRoom": "Өрөө үүсгэх",
    "play.createRoomSub": "Public эсвэл private host",

    "aria.botStrength": "Bot-ын хүч",
    "bot.hard": "Хүчтэй AI",
    "bot.expert": "Мастер AI",
    "bot.expertDesc": "Нүүдлээ тоглуулж үзэж шалгана",
    "bot.hardDesc": "Төлөвлөгөө гаргаж, хөзөр тоолно",
    "bot.normal": "Энгийн AI",
    "bot.normalDesc": "Сурч байгаа хүнд тохиромжтой",

    "aria.roomType": "Өрөөний төрөл",
    "room.publicLabel": "Public",
    "room.publicDesc": "Lobby дээр харагдана",
    "room.privateLabel": "Private",
    "room.privateDesc": "Зөвхөн кодоор орно",

    "room.publicRoomsHeading": "Public өрөө",
    "common.refresh": "Шинэчлэх",
    "common.loading": "Ачаалж байна...",
    "common.loadingEllipsis": "Ачаалж байна…",
    "room.codeLabel": "Өрөөний код",
    "room.join": "Нэгдэх",

    "chat.publicHeading": "Нийтийн chat",
    "common.send": "Илгээх",

    "rules.heading": "Дүрэм",
    "rules.suitLabel": "Өнгө",
    "rules.suitOrder": "гил ♠ > бундан ♥ > цэцэг ♣ > дөрвөлжин ♦",
    "rules.rankLabel": "Тоо",
    "rules.comboLabel": "Хослол",
    "rules.comboList": "нэг · хос · сет · страйт · флаш · фүл хаус · покер · страйт флаш",
    "rules.scoreLabel": "Оноо",
    "rules.scoreDesc":
      'Үлдсэн хөзөр = оноо. 10+ бол ×2, 13 бол ×3. <strong>30 оноо → хасагдана.</strong>',

    "room.codeHint": "Public өрөө lobby дээр харагдана. Private бол зөвхөн кодоор орно.",
    "room.back": "← Буцах",
    "room.heading": "Өрөө",
    "common.copy": "Хуулах",
    "room.allowBotsLabel": "Дутуу суудлыг bot-оор нөхөх",
    "room.start": "Тоглоом эхлүүлэх",
    "chat.roomHeading": "Өрөөний chat",
    "chat.empty": "Chat хоосон байна.",

    "game.exit": "← Гарах",
    "game.eliminationScoreChip": "Хасагдах оноо: 30",
    "chat.title": "Чат",
    "rules.toggle": "Дүрэм",
    "aria.gameLog": "Тоглолтын явц",
    "aria.yourHand": "Таны хөзрүүд",
    "theme.group": "Горим",
    "theme.felt": "Ширээ",
    "theme.feltHint": "Жинхэнэ хөзрийн ширээ",
    "theme.code": "Код",
    "theme.codeHint": "Ажлын дэлгэц шиг харагдана",
    "preview.label": "Гаргах",
    "sort.byRank": "Эрэмбэ: тоо",
    "sort.bySuit": "Эрэмбэ: өнгө",
    "common.clear": "Цуцлах",
    "game.pass": "Пасс",
    "game.play": "Тавих",
    "aria.gameChat": "Тоглоомын чат",
    "common.close": "Хаах",
    "chat.none": "Мессеж алга.",

    "common.guestName": "Зочин",
    "common.youName": "Та",
    "common.signOut": "Гарах",
    "account.guest": "зочин",

    "rank.needsFirebase": "Ranking-д Firebase тохиргоо шаардлагатай.",
    "rank.loading": "Ачаалж байна…",
    "rank.empty": "Одоогоор бүртгэл алга.",
    "rank.error": "Ranking-г уншиж чадсангүй.",
    "rank.points": "оноо",
    "rank.practiceNotCounted": "Дасгал тоглолт — ranking-д тоологдохгүй.",

    "room.reconnected": "Өрөө {{code}} рүү буцааж холболоо.",
    "room.codeLength": "Код 6 тэмдэгттэй байна.",
    "room.closed": "Өрөө хаагдлаа.",
    "room.youLeft": "Та өрөөнөөс гарсан байна.",
    "room.codeCopied": "Код хуулагдлаа.",
    "room.codeCopyFailed": "Хуулж чадсангүй — гараар хуулна уу.",
    "room.playerLeft": "Тоглогч өрөөнөөс гарсан байна.",
    "room.waitHost": "Host эхлүүлэхийг хүлээж байна.",
    "room.canStartWithBots": "Bot-оор нөхөөд ганцаараа эхэлж болно.",
    "room.waitingForPlayers": "{{count}} хүн бүрдэх хүртэл хүлээнэ (одоо {{filled}}).",
    "room.noPublicRooms": "Одоогоор public өрөө алга.",
    "room.filledSlash": "{{filled}}/4 хүн",
    "room.botsAllowed": "bot зөвшөөрнө",
    "room.humansOnly": "зөвхөн хүн",
    "common.host": "Хост",
    "room.enter": "Орох",

    "host.checking": "Host холболт шалгаж байна… шилжихэд бэлэн.",
    "host.switched": "Host шилжлээ — та одоо өрөөг удирдана.",
    "host.revived": "Host таны төхөөрөмж дээр сэргэлээ.",
    "host.switching": "Host шилжиж байна…",
    "host.waiting": "Хостыг хүлээж байна…",
    "host.staleHint": "Host удаан хариулахгүй байна. Систем автоматаар өөр тоглогч руу шилжүүлнэ.",
    "host.recovering": "Host холболт удааширлаа — автоматаар сэргээж байна…",

    "seat.bot": "bot",
    "seat.you": "та",
    "seat.player": "тоглогч",
    "seat.empty": "Хоосон суудал",
    "seat.waiting": "хүлээж байна",
    "seat.hostTag": "хост",
    "seat.readyTag": "бэлэн",
    "common.dash": "—",

    "turn.yourTurnBeat": "Таны ээлж — дийлэх хослол тавина.",
    "turn.yourTurnLead": "Таны ээлж — шинээр эхэлнэ.",
    "turn.someone": "{{name}}-ийн ээлж…",

    "summary.result": "Үр дүн",
    "summary.roundsWon": "Үе хожсон",
    "summary.penalty": "Торгууль",
    "summary.rankChange": "Rank өөрчлөлт",

    "end.youWon": "🏆 Та тоглоомыг яллаа!",
    "end.someoneWon": "{{name}} яллаа",
    "end.toLobby": "Lobby руу",
    "end.replay": "Дахин тоглох",
    "end.lost": "Та хожигдлоо",

    "round.ended": "{{round}}-р үе дууслаа",
    "round.next": "Дараагийн үе",
    "round.hostWillStart": "Хост дараагийн үеийг эхлүүлнэ.",

    "common.gotIt": "Ойлголоо",
    "online.required": "Онлайн тоглохын тулд Firebase тохиргоо шаардлагатай.",

    "err.popupClosed": "Нэвтрэх цонх хаагдлаа.",
    "err.popupBlocked": "Browser popup-г хаасан байна.",
    "err.authMethodDisabled": "Firebase Console дээр энэ нэвтрэх аргыг идэвхжүүлээгүй байна.",
    "err.permissionDenied": "Firestore дүрэм зөвшөөрөхгүй байна.",
    "err.generic": "Алдаа гарлаа.",

    "move.staleRefreshed": "Ээлж өөрчлөгдсөн байна — шинэчиллээ.",
    "move.saveFailed": "Нүүдлийг хадгалж чадсангүй.",
    "play.selectCards": "Хөзөр сонгоно уу.",
    "hint.none": "Тавих боломж алга — пасс хийнэ үү.",
    "hint.suggestion": "Зөвлөмж: {{label}}",

    "status.passCount": "пасс · {{count}}",
    "status.eliminated": "хасагдлаа",
    "status.eliminatedBadge": "хасагдсан",
    "status.turnBadge": "ээлж",
    "common.pointsValue": "{{score}} оноо",

    "pile.playedBy": "{{name}} тавив · {{combo}}",
    "pile.playedVerb": " тавив · {{combo}}",
    "combo.invalid": "хослол биш",
    "selection.prompt": "Хөзөр сонгоно уу",

    "status.round": "{{round}}-р үе",
    "status.scoreCards": "{{score}} оноо · {{cards}} хөзөр",
    "status.yourTurn": "таны ээлж",
    "status.waiting": "хүлээж байна",

    "table.player": "Тоглогч",
    "table.left": "Үлдсэн",
    "table.points": "Оноо",
    "table.total": "Нийт",

    "dash.playingCount": "{{count}} тоглож байна",
    "dash.seatsOpen": "{{count}} суудал сул",
    "dash.noOpenSeats": "сул суудал алга",
    "dash.byCode": "кодоор орно",
    "dash.roomsWaiting": "{{count}} өрөө хүлээж байна",
    "dash.viewOnlineTitle": "Онлайн тоглогчдыг харах",
    "status.playing": "тоглож байна",
    "status.inRoom": "өрөөнд",
    "status.inLobby": "лобби",
    "dash.noOnePlaying": "Одоогоор онлайн хүн алга.",
    "common.you": "та",
    "dash.onlineTitle": "Онлайн тоглогч · {{count}}",

    "chat.throttle": "Түр хүлээнэ үү ({{sec}}с)",

    "combo.single": "нэг",
    "combo.pair": "хос",
    "combo.set": "сет",
    "combo.straight": "страйт",
    "combo.flush": "флаш",
    "combo.fullHouse": "фүл хаус",
    "combo.poker": "покер",
    "combo.straightFlush": "страйт флаш",
    "combo.royalFlush": "рояал флаш",

    "suit.D": "дөрвөлжин",
    "suit.C": "цэцэг",
    "suit.H": "бундан",
    "suit.S": "гил",

    "modal.rules.line1": "<strong>Өнгө:</strong> гил ♠ &gt; бундан ♥ &gt; цэцэг ♣ &gt; дөрвөлжин ♦",
    "modal.rules.line2": "<strong>Тоо:</strong> 3 4 5 6 7 8 9 10 J Q K A 2",
    "modal.rules.line3":
      "<strong>Хослолууд:</strong> нэг · хос · сет · страйт (5) · флаш (5 ижил өнгө) · фүл хаус · покер (4+1) · страйт флаш · рояал флаш",
    "modal.rules.line4": "<strong>5 хөзрийн эрэмбэ:</strong> страйт &lt; флаш &lt; фүл хаус &lt; покер &lt; страйт флаш",
    "modal.rules.line5":
      "<strong>Оноо:</strong> нэг хүн хөзрөө дуусгамагц үе дуусна. Үлдсэн хөзрийн тоо оноо болно. 10 ба түүнээс дээш хөзөр үлдвэл ×2, нэг ч хөзөр гаргаагүй (13) бол ×3.",
    "modal.rules.line6": "<strong>Хасалт:</strong> 30 оноо цуглуулсан тоглогч хасагдана. Сүүлд үлдсэн нь ялагч.",
  },
  en: {
    "app.title": "13 Card Game",
    "app.brandWord": "Cards",
    "lang.toggleTitle": "Switch language",

    "auth.tagline": "4-player, Mongolian rules",
    "auth.google": "Sign in with Google",
    "auth.or": "or",
    "auth.guestNameLabel": "Guest name",
    "auth.guestNamePlaceholder": "e.g. Alex",
    "auth.guestSubmit": "Continue as guest",
    "auth.noFirebase": "Firebase isn't configured — you'll play offline against bots for now.",
    "auth.connectFailed": "Couldn't connect to Firebase.",

    "aria.liveStats": "Live stats",
    "stats.online": "Players online",
    "stats.publicRooms": "Public rooms",
    "stats.privateRooms": "Private rooms",
    "stats.running": "Games in progress",

    "play.heading": "Play",
    "play.vsBots": "Play vs Bots",
    "play.vsBotsSub": "Starts instantly · 3 bots",
    "play.createRoom": "Create a Room",
    "play.createRoomSub": "Host public or private",

    "aria.botStrength": "Bot strength",
    "bot.hard": "Strong AI",
    "bot.expert": "Expert AI",
    "bot.expertDesc": "Plays out each move to check it",
    "bot.hardDesc": "Plans ahead and counts cards",
    "bot.normal": "Easy AI",
    "bot.normalDesc": "Good for players still learning",

    "aria.roomType": "Room type",
    "room.publicLabel": "Public",
    "room.publicDesc": "Shown in the lobby",
    "room.privateLabel": "Private",
    "room.privateDesc": "Join by code only",

    "room.publicRoomsHeading": "Public Rooms",
    "common.refresh": "Refresh",
    "common.loading": "Loading...",
    "common.loadingEllipsis": "Loading…",
    "room.codeLabel": "Room code",
    "room.join": "Join",

    "chat.publicHeading": "Public Chat",
    "common.send": "Send",

    "rules.heading": "Rules",
    "rules.suitLabel": "Suits",
    "rules.suitOrder": "Spade ♠ > Heart ♥ > Club ♣ > Diamond ♦",
    "rules.rankLabel": "Ranks",
    "rules.comboLabel": "Combos",
    "rules.comboList":
      "High Card · Pair · Three of a Kind · Straight · Flush · Full House · Four of a Kind · Straight Flush",
    "rules.scoreLabel": "Score",
    "rules.scoreDesc":
      'Cards left = points. ×2 at 10+ cards, ×3 at 13. <strong>30 points → eliminated.</strong>',

    "room.codeHint": "Public rooms show up in the lobby. Private rooms are joined by code only.",
    "room.back": "← Back",
    "room.heading": "Room",
    "common.copy": "Copy",
    "room.allowBotsLabel": "Fill empty seats with bots",
    "room.start": "Start Game",
    "chat.roomHeading": "Room Chat",
    "chat.empty": "No messages yet.",

    "game.exit": "← Exit",
    "game.eliminationScoreChip": "Elimination score: 30",
    "chat.title": "Chat",
    "rules.toggle": "Rules",
    "aria.gameLog": "Game log",
    "aria.yourHand": "Your cards",
    "theme.group": "Theme",
    "theme.felt": "Table",
    "theme.feltHint": "The real card table",
    "theme.code": "Code",
    "theme.codeHint": "Looks like a work screen",
    "preview.label": "Play",
    "sort.byRank": "Sort: rank",
    "sort.bySuit": "Sort: suit",
    "common.clear": "Clear",
    "game.pass": "Pass",
    "game.play": "Play",
    "aria.gameChat": "Game chat",
    "common.close": "Close",
    "chat.none": "No messages.",

    "common.guestName": "Guest",
    "common.youName": "You",
    "common.signOut": "Sign out",
    "account.guest": "guest",

    "rank.needsFirebase": "Ranking requires Firebase configuration.",
    "rank.loading": "Loading…",
    "rank.empty": "No entries yet.",
    "rank.error": "Couldn't load the ranking.",
    "rank.points": "pts",
    "rank.practiceNotCounted": "Practice match — won't count toward ranking.",

    "room.reconnected": "Reconnected to room {{code}}.",
    "room.codeLength": "The code must be 6 characters.",
    "room.closed": "The room was closed.",
    "room.youLeft": "You've left the room.",
    "room.codeCopied": "Code copied.",
    "room.codeCopyFailed": "Couldn't copy — please copy it manually.",
    "room.playerLeft": "A player has left the room.",
    "room.waitHost": "Waiting for the host to start.",
    "room.canStartWithBots": "Fill with bots and start on your own.",
    "room.waitingForPlayers": "Waiting for {{count}} players (currently {{filled}}).",
    "room.noPublicRooms": "No public rooms right now.",
    "room.filledSlash": "{{filled}}/4 players",
    "room.botsAllowed": "bots allowed",
    "room.humansOnly": "humans only",
    "common.host": "Host",
    "room.enter": "Join",

    "host.checking": "Checking host connection… ready to switch.",
    "host.switched": "Host switched — you're now running the room.",
    "host.revived": "Host revived on your device.",
    "host.switching": "Host switching…",
    "host.waiting": "Waiting for host…",
    "host.staleHint": "Host hasn't responded in a while. It will switch to another player automatically.",
    "host.recovering": "Host connection is slow — recovering automatically…",

    "seat.bot": "bot",
    "seat.you": "you",
    "seat.player": "player",
    "seat.empty": "Empty seat",
    "seat.waiting": "waiting",
    "seat.hostTag": "host",
    "seat.readyTag": "ready",
    "common.dash": "—",

    "turn.yourTurnBeat": "Your turn — play a combo that beats the table.",
    "turn.yourTurnLead": "Your turn — lead with a new combo.",
    "turn.someone": "{{name}}'s turn…",

    "summary.result": "Result",
    "summary.roundsWon": "Rounds won",
    "summary.penalty": "Penalty",
    "summary.rankChange": "Rank change",

    "end.youWon": "🏆 You won the game!",
    "end.someoneWon": "{{name}} won",
    "end.toLobby": "To Lobby",
    "end.replay": "Play Again",
    "end.lost": "You lost",

    "round.ended": "Round {{round}} ended",
    "round.next": "Next Round",
    "round.hostWillStart": "The host will start the next round.",

    "common.gotIt": "Got it",
    "online.required": "Online play requires Firebase configuration.",

    "err.popupClosed": "The sign-in window was closed.",
    "err.popupBlocked": "Your browser blocked the popup.",
    "err.authMethodDisabled": "This sign-in method isn't enabled in the Firebase Console.",
    "err.permissionDenied": "Firestore rules denied this action.",
    "err.generic": "Something went wrong.",

    "move.staleRefreshed": "The turn changed — refreshed.",
    "move.saveFailed": "Couldn't save the move.",
    "play.selectCards": "Select some cards.",
    "hint.none": "No valid play — pass.",
    "hint.suggestion": "Suggestion: {{label}}",

    "status.passCount": "pass · {{count}}",
    "status.eliminated": "eliminated",
    "status.eliminatedBadge": "Eliminated",
    "status.turnBadge": "Turn",
    "common.pointsValue": "{{score}} pts",

    "pile.playedBy": "{{name}} played · {{combo}}",
    "pile.playedVerb": " played · {{combo}}",
    "combo.invalid": "not a combo",
    "selection.prompt": "Select some cards",

    "status.round": "Round {{round}}",
    "status.scoreCards": "{{score}} pts · {{cards}} cards",
    "status.yourTurn": "your turn",
    "status.waiting": "waiting",

    "table.player": "Player",
    "table.left": "Left",
    "table.points": "Points",
    "table.total": "Total",

    "dash.playingCount": "{{count}} playing",
    "dash.seatsOpen": "{{count}} seats open",
    "dash.noOpenSeats": "no open seats",
    "dash.byCode": "join by code",
    "dash.roomsWaiting": "{{count}} rooms waiting",
    "dash.viewOnlineTitle": "View online players",
    "status.playing": "playing",
    "status.inRoom": "in room",
    "status.inLobby": "lobby",
    "dash.noOnePlaying": "No one online right now.",
    "common.you": "you",
    "dash.onlineTitle": "Players Online · {{count}}",

    "chat.throttle": "Please wait ({{sec}}s)",

    "combo.single": "High Card",
    "combo.pair": "Pair",
    "combo.set": "Three of a Kind",
    "combo.straight": "Straight",
    "combo.flush": "Flush",
    "combo.fullHouse": "Full House",
    "combo.poker": "Four of a Kind",
    "combo.straightFlush": "Straight Flush",
    "combo.royalFlush": "Royal Flush",

    "suit.D": "Diamond",
    "suit.C": "Club",
    "suit.H": "Heart",
    "suit.S": "Spade",

    "modal.rules.line1": "<strong>Suits:</strong> Spade ♠ &gt; Heart ♥ &gt; Club ♣ &gt; Diamond ♦",
    "modal.rules.line2": "<strong>Ranks:</strong> 3 4 5 6 7 8 9 10 J Q K A 2",
    "modal.rules.line3":
      "<strong>Combos:</strong> High Card · Pair · Three of a Kind · Straight (5) · Flush (5 same suit) · Full House · Four of a Kind (4+1) · Straight Flush · Royal Flush",
    "modal.rules.line4":
      "<strong>5-card ranking:</strong> Straight &lt; Flush &lt; Full House &lt; Four of a Kind &lt; Straight Flush",
    "modal.rules.line5":
      "<strong>Scoring:</strong> the round ends the moment someone empties their hand. Cards left in other hands become points: ×2 at 10+ cards, ×3 if none were played (13 cards).",
    "modal.rules.line6": "<strong>Elimination:</strong> a player eliminated at 30 points. The last one standing wins.",
  },
};

let current = SUPPORTED.includes(safeGet(STORAGE_KEY)) ? safeGet(STORAGE_KEY) : "mn";
const listeners = new Set();

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* privat горим гэх мэт — алгасна */
  }
}

export function getLang() {
  return current;
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] ?? ""));
}

export function t(key, vars) {
  const value = dict[current]?.[key] ?? dict.mn[key] ?? key;
  return interpolate(value, vars);
}

export function applyStaticTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.getAttribute("data-i18n-html"));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });
  document.title = t("app.title");
  document.documentElement.lang = current;
}

export function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === current) return;
  current = lang;
  safeSet(STORAGE_KEY, lang);
  applyStaticTranslations();
  listeners.forEach((fn) => fn(current));
}

/** Лангуажийг солиход дуудагдах callback бүртгэнэ. Unsubscribe функц буцаана. */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initLangToggle(buttonId = "langToggle") {
  applyStaticTranslations();
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  const render = () => {
    btn.textContent = current === "mn" ? "EN" : "MN";
    btn.title = t("lang.toggleTitle");
  };
  render();
  btn.addEventListener("click", () => setLang(current === "mn" ? "en" : "mn"));
  onLangChange(render);
}

/* ── Тоглоомын цөмөөс гарч ирэх Монгол текстийг (combo нэр, алдаа мессеж)
   динамикаар орчуулах ─────────────────────────────────────────────── */

const COMBO_KEY_BY_MN = Object.fromEntries(Object.entries(COMBO_NAMES).map(([key, mn]) => [mn, key]));

/** "хос (3♦ 4♣)" → "Pair (3♦ 4♣)" — зөвхөн combo-ийн нэрийг орчуулна, хөзрийн жагсаалтыг хэвээр үлдээнэ. */
export function translateComboLabel(label) {
  if (!label || typeof label !== "string") return label;
  const idx = label.indexOf(" (");
  const namePart = idx === -1 ? label : label.slice(0, idx);
  const rest = idx === -1 ? "" : label.slice(idx);
  const key = COMBO_KEY_BY_MN[namePart];
  if (!key) return label;
  return `${t(`combo.${key}`)}${rest}`;
}

const EXACT_ENGINE_MESSAGES = {
  "Үе дууссан байна.": "This round has ended.",
  "Таны ээлж биш байна.": "It's not your turn.",
  "Хөзөр сонгоно уу.": "Select some cards.",
  "Гарт байхгүй хөзөр байна.": "Those cards aren't in your hand.",
  "Ширээ цэвэрхэн үед пасс хийж болохгүй.": "You can't pass when the table is empty.",
  "4 хөзрийн хослол байхгүй. Покер бол 4 ижил + 1 = 5 хөзөр.":
    "There's no valid 4-card combo. A Four of a Kind needs 4-of-a-kind + 1 card = 5 cards.",
  "Хамгийн ихдээ 5 хөзөр тавина.": "You can play at most 5 cards.",
  "Энэ хослол дүрэмд нийцэхгүй байна.": "That's not a valid combination.",
};

const PATTERN_ENGINE_MESSAGES = [
  [/^Эхний нүүдэлд (.+) заавал орно\.$/, (m) => `The opening card ${m[1]} must be included.`],
  [
    /^Ширээн дээр (\d+) хөзөр байна — мөн \d+ хөзөр тавина\.$/,
    (m) => `There are ${m[1]} cards on the table — you must also play ${m[1]} cards.`,
  ],
  [/^(.+)-аас том байх ёстой\.$/, (m) => `Must beat ${translateComboLabel(m[1])}.`],
];

/** game.js/rules.js-ээс ирсэн (Монгол эх сурвалжтай) мессежийг EN горимд орчуулна. */
export function translateEngineError(message) {
  if (!message || current !== "en") return message;
  if (EXACT_ENGINE_MESSAGES[message]) return EXACT_ENGINE_MESSAGES[message];
  for (const [re, build] of PATTERN_ENGINE_MESSAGES) {
    const match = message.match(re);
    if (match) return build(match);
  }
  return message;
}

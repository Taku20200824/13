import assert from "node:assert/strict";
import test from "node:test";
import { makeCard, makeDeck, cardValue } from "../js/cards.js";
import { detect, beats, enumeratePlays } from "../js/rules.js";

const h = (...ids) => ids.map((id) => makeCard(id.slice(0, -1), id.slice(-1)));

test("өнгөний эрэмбэ: гил > бундан > цэцэг > дөрвөлжин", () => {
  const [d, c, hh, s] = h("7D", "7C", "7H", "7S");
  assert.ok(cardValue(s) > cardValue(hh));
  assert.ok(cardValue(hh) > cardValue(c));
  assert.ok(cardValue(c) > cardValue(d));
});

test("тооны эрэмбэ: 2 хамгийн том, 3 хамгийн бага", () => {
  assert.ok(cardValue(h("2D")[0]) > cardValue(h("AS")[0]));
  assert.ok(cardValue(h("3S")[0]) < cardValue(h("4D")[0]));
});

test("үндсэн хослолуудыг таних", () => {
  assert.equal(detect(h("9H")).type, "single");
  assert.equal(detect(h("9H", "9S")).type, "pair");
  assert.equal(detect(h("9H", "9S", "9C")).type, "set");
  assert.equal(detect(h("3D", "4C", "5H", "6S", "7D")).type, "straight");
  assert.equal(detect(h("3S", "7S", "9S", "JS", "KS")).type, "flush");
  assert.equal(detect(h("6D", "6C", "6H", "KS", "KD")).type, "fullHouse");
  assert.equal(detect(h("3D", "3C", "3H", "3S", "AD")).type, "poker");
  assert.equal(detect(h("4S", "5S", "6S", "7S", "8S")).type, "straightFlush");
  assert.equal(detect(h("10H", "JH", "QH", "KH", "AH")).type, "royalFlush");
});

test("буруу хослолуудыг татгалзах", () => {
  assert.equal(detect(h("9H", "8S")), null, "өөр тоотой 2 хөзөр");
  assert.equal(detect(h("3D", "3C", "3H", "3S")), null, "4 хөзөр дангаар болохгүй");
  assert.equal(detect(h("3D", "4C", "5H", "6S")), null, "4 хөзрийн страйт байхгүй");
  assert.equal(detect(h("3D", "4C", "5H", "6S", "8D")), null, "тасархай дараалал");
  assert.equal(detect(h("3D", "4C", "5H", "6S", "7D", "8C")), null, "6 хөзөр");
});

test("2,3,4,5,6 нь хүчинтэй страйт бөгөөд толгой нь 6", () => {
  const combo = detect(h("2D", "3C", "4H", "5S", "6D"));
  assert.equal(combo.type, "straight");
  assert.equal(combo.head.rank, "6");
});

test("J,Q,K,A,2 нь страйт БИШ (2 нь зөвхөн доод талд)", () => {
  assert.equal(detect(h("JD", "QC", "KH", "AS", "2D")), null);
});

test("страйт: толгой томоор дийлнэ", () => {
  const low = detect(h("3D", "4C", "5H", "6S", "7D"));
  const high = detect(h("4D", "5C", "6H", "7S", "8D"));
  assert.ok(beats(high, low));
  assert.ok(!beats(low, high));
});

test("страйт: адил толгой бол өнгөөр шийднэ", () => {
  const withSpade = detect(h("3D", "4C", "5H", "6S", "7S"));
  const withDiamond = detect(h("3C", "4D", "5S", "6H", "7D"));
  assert.ok(beats(withSpade, withDiamond), "толгой 7♠ нь 7♦-г дийлнэ");
  assert.ok(!beats(withDiamond, withSpade));
});

test("флаш: зөвхөн тоогоор, дээдээс доош харьцуулна", () => {
  const kingHigh = detect(h("3S", "7S", "9S", "JS", "KS"));
  const aceHigh = detect(h("3D", "4D", "5D", "6D", "AD"));
  assert.ok(beats(aceHigh, kingHigh), "A өндөр флаш дийлнэ (өнгө хамаагүй)");

  const a = detect(h("3S", "7S", "9S", "JS", "AS"));
  const b = detect(h("3D", "7D", "9D", "QD", "AD"));
  assert.ok(beats(b, a), "A тэнцүү → дараагийн хөзөр Q > J");
});

test("флаш: тоо нь бүрэн адил бол хэн ч дийлэхгүй", () => {
  const a = detect(h("3S", "7S", "9S", "JS", "KS"));
  const b = detect(h("3D", "7D", "9D", "JD", "KD"));
  assert.ok(!beats(a, b));
  assert.ok(!beats(b, a));
});

test("фүл хаус: доторх сетээр хэмжигдэнэ", () => {
  const sixes = detect(h("6D", "6C", "6H", "KS", "KD"));
  const jacks = detect(h("JD", "JC", "JH", "3S", "3D"));
  assert.ok(beats(jacks, sixes), "JJJ33 нь 666KK-г дийлнэ");
  assert.ok(!beats(sixes, jacks));
});

test("покер: доторх 4 ижилээр хэмжигдэнэ", () => {
  const threes = detect(h("3D", "3C", "3H", "3S", "AD"));
  const queens = detect(h("QD", "QC", "QH", "QS", "4D"));
  assert.ok(beats(queens, threes), "QQQQ4 нь 3333A-г дийлнэ");
});

test("5 хөзрийн хослолуудын хоорондын эрэмбэ", () => {
  const straight = detect(h("3D", "4C", "5H", "6S", "7D"));
  const flush = detect(h("3S", "5S", "7S", "9S", "JS"));
  const full = detect(h("4D", "4C", "4H", "5S", "5D"));
  const poker = detect(h("4D", "4C", "4H", "4S", "5D"));
  const sf = detect(h("4S", "5S", "6S", "7S", "8S"));
  const royal = detect(h("10H", "JH", "QH", "KH", "AH"));

  assert.ok(beats(flush, straight), "флаш > страйт");
  assert.ok(beats(full, flush), "фүл хаус > флаш");
  assert.ok(beats(poker, full), "покер > фүл хаус");
  assert.ok(beats(sf, poker), "страйт флаш > покер");
  assert.ok(beats(royal, sf), "рояал флаш > страйт флаш");
  assert.ok(!beats(straight, flush), "эсрэгээрээ болохгүй");
});

test("хөзрийн тоо таарахгүй бол тавьж болохгүй", () => {
  const pair = detect(h("9H", "9S"));
  const single = detect(h("2S"));
  assert.ok(!beats(pair, single), "хос нь нэг дээр тавигдахгүй");
  assert.ok(!beats(single, pair));
  const poker = detect(h("2D", "2C", "2H", "2S", "3D"));
  assert.ok(!beats(poker, single), "покер ч гэсэн нэг хөзрийг дийлэхгүй");
});

test("ширээ цэвэрхэн бол ямар ч хүчинтэй хослол болно", () => {
  assert.ok(beats(detect(h("3D")), null));
  assert.ok(beats(detect(h("3D", "4C", "5H", "6S", "7D")), null));
  assert.ok(!beats(null, null));
});

test("52 хөзөр давхардалгүй үүснэ", () => {
  const deck = makeDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((c) => c.id)).size, 52);
});

test("enumeratePlays нь эхний нүүдэлд 3♦-г шаардана", () => {
  const hand = h("3D", "3C", "5H", "9S", "KD");
  const plays = enumeratePlays(hand, null, "3D");
  assert.ok(plays.length > 0);
  assert.ok(plays.every((p) => p.cards.some((c) => c.id === "3D")));
});

test("enumeratePlays нь ширээн дээрхтэй ижил хэмжээтэй хослол л буцаана", () => {
  const hand = h("9D", "9C", "KH", "KS", "2D", "2S");
  const previous = detect(h("JD", "JC"));
  const plays = enumeratePlays(hand, previous, null);
  assert.ok(plays.length > 0);
  assert.ok(plays.every((p) => p.size === 2));
  assert.ok(plays.every((p) => beats(p, previous)));
});

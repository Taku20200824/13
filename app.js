const ranks = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const suits = [
  { id: "C", label: "♣", color: "black" },
  { id: "D", label: "♦", color: "red" },
  { id: "H", label: "♥", color: "red" },
  { id: "S", label: "♠", color: "black" },
];

const playerNames = ["Та", "Болд", "Саруул", "Номин"];
let players = [];
let currentPlayer = 0;
let selectedIds = new Set();
let lastPlay = null;
let passCount = 0;
let winners = [];
let gameOver = false;
let firstMove = true;

const el = {
  scoreboard: document.querySelector("#scoreboard"),
  opponents: document.querySelector("#opponents"),
  hand: document.querySelector("#hand"),
  handTitle: document.querySelector("#handTitle"),
  pile: document.querySelector("#pile"),
  message: document.querySelector("#message"),
  turnLabel: document.querySelector("#turnLabel"),
  passLabel: document.querySelector("#passLabel"),
  playButton: document.querySelector("#playButton"),
  passButton: document.querySelector("#passButton"),
  sortButton: document.querySelector("#sortButton"),
  newGameButton: document.querySelector("#newGameButton"),
};

function cardPower(card) {
  return ranks.indexOf(card.rank) * 4 + suits.findIndex((suit) => suit.id === card.suit);
}

function rankPower(rank) {
  return ranks.indexOf(rank);
}

function makeDeck() {
  return ranks.flatMap((rank) =>
    suits.map((suit) => ({
      id: `${rank}-${suit.id}`,
      rank,
      suit: suit.id,
      suitLabel: suit.label,
      color: suit.color,
    })),
  );
}

function shuffle(cards) {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function sortHand(hand) {
  hand.sort((a, b) => cardPower(a) - cardPower(b));
}

function startGame() {
  const deck = shuffle(makeDeck());
  players = playerNames.map((name, index) => ({
    name,
    isHuman: index === 0,
    hand: deck.slice(index * 13, index * 13 + 13),
    passed: false,
  }));
  players.forEach((player) => sortHand(player.hand));
  currentPlayer = players.findIndex((player) => player.hand.some((card) => card.id === "3-C"));
  selectedIds = new Set();
  lastPlay = null;
  passCount = 0;
  winners = [];
  gameOver = false;
  firstMove = true;
  setMessage(`${players[currentPlayer].name} 3♣-аар эхэлнэ.`);
  render();
  queueBot();
}

function describeCombo(combo) {
  if (!combo) return "хоосон";
  const names = {
    single: "single",
    pair: "pair",
    triple: "triple",
    four: "4-kind",
    straight: "straight",
    doubleRun: "дараалсан хос",
  };
  return `${names[combo.type]} (${combo.cards.map((card) => card.rank + card.suitLabel).join(" ")})`;
}

function analyze(cards) {
  const sorted = [...cards].sort((a, b) => cardPower(a) - cardPower(b));
  const rankGroups = groupByRank(sorted);
  const uniqueRanks = Object.keys(rankGroups).sort((a, b) => rankPower(a) - rankPower(b));
  const highest = sorted[sorted.length - 1];

  if (sorted.length === 1) {
    return { type: "single", length: 1, strength: cardPower(highest), cards: sorted };
  }
  if (sorted.length === 2 && uniqueRanks.length === 1) {
    return { type: "pair", length: 2, strength: cardPower(highest), cards: sorted };
  }
  if (sorted.length === 3 && uniqueRanks.length === 1) {
    return { type: "triple", length: 3, strength: cardPower(highest), cards: sorted };
  }
  if (sorted.length === 4 && uniqueRanks.length === 1) {
    return { type: "four", length: 4, strength: cardPower(highest), cards: sorted };
  }
  if (sorted.length >= 3 && isConsecutive(uniqueRanks) && uniqueRanks.length === sorted.length && !uniqueRanks.includes("2")) {
    return {
      type: "straight",
      length: sorted.length,
      strength: rankPower(uniqueRanks[uniqueRanks.length - 1]),
      cards: sorted,
    };
  }
  if (
    sorted.length >= 6 &&
    sorted.length % 2 === 0 &&
    uniqueRanks.length === sorted.length / 2 &&
    uniqueRanks.every((rank) => rankGroups[rank].length === 2) &&
    isConsecutive(uniqueRanks) &&
    !uniqueRanks.includes("2")
  ) {
    return {
      type: "doubleRun",
      length: sorted.length,
      strength: rankPower(uniqueRanks[uniqueRanks.length - 1]),
      cards: sorted,
    };
  }
  return null;
}

function groupByRank(cards) {
  return cards.reduce((groups, card) => {
    groups[card.rank] = groups[card.rank] || [];
    groups[card.rank].push(card);
    return groups;
  }, {});
}

function isConsecutive(rankList) {
  if (rankList.length < 2) return false;
  return rankList.every((rank, index) => index === 0 || rankPower(rank) === rankPower(rankList[index - 1]) + 1);
}

function canBeat(candidate, previous) {
  if (!candidate) return false;
  if (!previous) return true;
  if (candidate.type === "four" && previous.type === "single" && previous.cards[0].rank === "2") return true;
  return (
    candidate.type === previous.type &&
    candidate.length === previous.length &&
    candidate.strength > previous.strength
  );
}

function mustIncludeStarter(cards) {
  return !firstMove || cards.some((card) => card.id === "3-C");
}

function playSelected() {
  if (gameOver || !players[currentPlayer].isHuman) return;
  const cards = players[0].hand.filter((card) => selectedIds.has(card.id));
  const combo = analyze(cards);
  if (!combo) {
    setMessage("Энэ хослол болохгүй байна.");
    return;
  }
  if (!mustIncludeStarter(cards)) {
    setMessage("Эхний нүүдэл 3♣ агуулсан байх ёстой.");
    return;
  }
  if (!canBeat(combo, lastPlay)) {
    setMessage(`Өмнөх ${describeCombo(lastPlay)}-оос өндөр ижил хослол тавина.`);
    return;
  }
  commitPlay(0, combo);
}

function passTurn() {
  if (gameOver || !players[currentPlayer].isHuman || !lastPlay) return;
  players[currentPlayer].passed = true;
  passCount += 1;
  setMessage("Та пасс хийлээ.");
  advanceTurn();
}

function commitPlay(playerIndex, combo) {
  const player = players[playerIndex];
  const playedIds = new Set(combo.cards.map((card) => card.id));
  player.hand = player.hand.filter((card) => !playedIds.has(card.id));
  player.passed = false;
  selectedIds = new Set();
  lastPlay = { ...combo, playerIndex };
  firstMove = false;
  passCount = 0;
  setMessage(`${player.name}: ${describeCombo(combo)}.`);
  if (player.hand.length === 0 && !winners.includes(playerIndex)) {
    winners.push(playerIndex);
    setMessage(`${player.name} яллаа!`);
    if (winners.length === 3 || playerIndex === 0) {
      gameOver = true;
    }
  }
  advanceTurn();
}

function advanceTurn() {
  if (gameOver) {
    render();
    return;
  }
  if (lastPlay && passCount >= activePlayers().length - 1) {
    currentPlayer = lastPlay.playerIndex;
    players.forEach((player) => {
      player.passed = false;
    });
    lastPlay = null;
    passCount = 0;
    setMessage(`${players[currentPlayer].name} ширээг цэвэрлээд шинэ хослол эхлүүлнэ.`);
  }

  do {
    currentPlayer = (currentPlayer + 1) % players.length;
  } while (players[currentPlayer].hand.length === 0);

  render();
  queueBot();
}

function activePlayers() {
  return players.filter((player) => player.hand.length > 0);
}

function queueBot() {
  if (gameOver || players[currentPlayer].isHuman) return;
  window.setTimeout(botMove, 650);
}

function botMove() {
  const player = players[currentPlayer];
  const combo = findBotPlay(player.hand);
  if (combo) {
    commitPlay(currentPlayer, combo);
    return;
  }
  player.passed = true;
  passCount += 1;
  setMessage(`${player.name} пасс хийлээ.`);
  advanceTurn();
}

function findBotPlay(hand) {
  const candidates = [];
  for (let mask = 1; mask < 1 << hand.length; mask += 1) {
    const cards = hand.filter((_, index) => mask & (1 << index));
    if (cards.length > 8) continue;
    if (!mustIncludeStarter(cards)) continue;
    const combo = analyze(cards);
    if (canBeat(combo, lastPlay)) candidates.push(combo);
  }
  candidates.sort((a, b) => a.length - b.length || a.strength - b.strength);
  return candidates[0] || null;
}

function render() {
  renderScoreboard();
  renderOpponents();
  renderPile();
  renderHand();
  el.turnLabel.textContent = gameOver
    ? "Тоглоом дууслаа"
    : players[currentPlayer].isHuman
      ? "Таны ээлж"
      : `${players[currentPlayer].name}-ийн ээлж`;
  el.passLabel.textContent = `Пасс: ${passCount}`;
  el.playButton.disabled = gameOver || !players[currentPlayer].isHuman;
  el.passButton.disabled = gameOver || !players[currentPlayer].isHuman || !lastPlay;
}

function renderScoreboard() {
  el.scoreboard.innerHTML = "";
  players.forEach((player, index) => {
    const item = document.createElement("div");
    item.className = `score ${index === currentPlayer && !gameOver ? "active" : ""}`;
    item.innerHTML = `${player.name}<small>${player.hand.length} хөзөр${player.passed ? " · пасс" : ""}</small>`;
    el.scoreboard.appendChild(item);
  });
}

function renderOpponents() {
  el.opponents.innerHTML = "";
  players.slice(1).forEach((player, offset) => {
    const index = offset + 1;
    const panel = document.createElement("article");
    panel.className = `player ${index === currentPlayer && !gameOver ? "active" : ""} ${player.hand.length === 0 ? "winner" : ""}`;
    panel.innerHTML = `<h2>${player.name}</h2><p class="eyebrow">${player.hand.length === 0 ? "Дууссан" : `${player.hand.length} хөзөр`}</p>`;
    const miniHand = document.createElement("div");
    miniHand.className = "mini-hand";
    player.hand.forEach(() => {
      const back = document.createElement("span");
      back.className = "card-back";
      miniHand.appendChild(back);
    });
    panel.appendChild(miniHand);
    el.opponents.appendChild(panel);
  });
}

function renderPile() {
  el.pile.innerHTML = "";
  if (!lastPlay) {
    el.pile.textContent = "Ширээ цэвэрхэн байна";
    return;
  }
  lastPlay.cards.forEach((card, index) => el.pile.appendChild(cardNode(card, false, index)));
}

function renderHand() {
  el.hand.innerHTML = "";
  const hand = players[0].hand;
  el.handTitle.textContent = `${hand.length} хөзөр`;
  hand.forEach((card) => {
    const node = cardNode(card, true);
    node.classList.toggle("selected", selectedIds.has(card.id));
    node.addEventListener("click", () => {
      if (gameOver || !players[currentPlayer].isHuman) return;
      selectedIds.has(card.id) ? selectedIds.delete(card.id) : selectedIds.add(card.id);
      renderHand();
    });
    el.hand.appendChild(node);
  });
}

function cardNode(card, interactive, index = 0) {
  const node = document.createElement(interactive ? "button" : "div");
  node.className = `card ${card.color}`;
  node.style.setProperty("--tilt", `${(index - 1) * 4}deg`);
  node.setAttribute("aria-label", `${card.rank} ${card.suitLabel}`);
  node.innerHTML = `<span class="rank">${card.rank}</span><span class="center-suit">${card.suitLabel}</span><span class="suit">${card.suitLabel}</span>`;
  if (!interactive) node.classList.add("played");
  return node;
}

function setMessage(text) {
  el.message.textContent = text;
}

el.playButton.addEventListener("click", playSelected);
el.passButton.addEventListener("click", passTurn);
el.sortButton.addEventListener("click", () => {
  sortHand(players[0].hand);
  renderHand();
});
el.newGameButton.addEventListener("click", startGame);

startGame();

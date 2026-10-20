const socket = io();
const $ = id => document.getElementById(id);
const themeToggle = $("themeToggle");

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;

  themeToggle.textContent =
    theme === "dark" ? "☀️ Lightmode" : "🌙 Darkmode";
}

const savedTheme = localStorage.getItem("knueffel-theme") || "light";
applyTheme(savedTheme);

themeToggle.addEventListener("click", () => {
  const newTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";

  localStorage.setItem("knueffel-theme", newTheme);
  applyTheme(newTheme);
});
let state = null;
let myId = null;
let myName = "";
const playerColors = [
  { bg: "#dceafe", text: "#244b85", darkBg: "#263d5c", darkText: "#e0edff" },
  { bg: "#d9f2df", text: "#24653a", darkBg: "#254a32", darkText: "#dcfce5" },
  { bg: "#fbe4c7", text: "#8a4b12", darkBg: "#5b3b20", darkText: "#ffebd1" },
  { bg: "#eedfff", text: "#663d91", darkBg: "#48305f", darkText: "#f0e2ff" }
];

function getPlayerColor(playerId) {
  const index = state.players.findIndex(p => p.id === playerId);
  return playerColors[Math.max(0, index) % playerColors.length];
}
const pipPositions = {
  1:[[22,22]], 2:[[12,12],[32,32]], 3:[[12,12],[22,22],[32,32]],
  4:[[12,12],[32,12],[12,32],[32,32]],
  5:[[12,12],[32,12],[22,22],[12,32],[32,32]],
  6:[[12,12],[32,12],[12,22],[32,22],[12,32],[32,32]]
};
function dieSvg(value) {
  const pips = (pipPositions[value]||[]).map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3.3" fill="#26352d"/>`).join("");
  return `<svg viewBox="0 0 44 44" aria-hidden="true"><rect x="2" y="2" width="40" height="40" rx="8" fill="none"/>${pips}</svg>`;
}
function showNotice(message) {
  $("notice").textContent = message;
  $("notice").classList.remove("hidden");
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(()=>$("notice").classList.add("hidden"),3500);
}
socket.on("connect",()=>{myId=socket.id;});
socket.on("notice", showNotice);

$("joinForm").addEventListener("submit", e => {
  e.preventDefault();

  myName = $("nameInput").value.trim();
  if (!myName) return;

  let playerKey = localStorage.getItem("knueffelPlayerKey");

  if (!playerKey) {
    playerKey = crypto.randomUUID();
    localStorage.setItem("knueffelPlayerKey", playerKey);
  }

  socket.emit("join", {
    name: myName,
    playerKey: playerKey
  });
});
socket.on("state",s=>{
  state=s;
  if(s.players.some(p=>p.id===myId)) {
    $("joinPanel").classList.add("hidden");
    $("game").classList.remove("hidden");
  }
  render();
});
$("startBtn").addEventListener("click",()=>socket.emit("startGame"));
$("rollBtn").addEventListener("click",()=>socket.emit("roll"));
$("resetBtn").addEventListener("click", () => {
  const confirmed = confirm(
    "Möchtest du die Runde wirklich zurücksetzen? Alle Punkte gehen verloren."
  );

  if (confirmed) {
    socket.emit("resetRound");
  }
});

function render() {
  if(!state) return;
  const me=state.players.find(p=>p.id===myId);
  const isMyTurn=state.gameStarted && state.currentPlayerId===myId;
  $("playerCount").textContent=state.players.length;
  $("playersList").innerHTML=state.players.map((p,i)=>{
    const color = getPlayerColor(p.id);
    return `
    <div
      class="player ${p.id===state.currentPlayerId&&state.gameStarted?'active':''}"
      style="--player-bg:${color.bg};--player-text:${color.text};--player-dark-bg:${color.darkBg};--player-dark-text:${color.darkText}"
    >
      <div class="avatar">${escapeHtml(p.name.slice(0,1).toUpperCase())}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(p.name)}${p.id===myId?' (Du)':''}</div>
      <div class="player-sub">${!p.connected?'Verbindung verloren':p.id===state.currentPlayerId&&state.gameStarted?'Ist am Zug':state.gameStarted?'Spielt mit':'Bereit'}</div></div>
      <div class="player-points">${p.total}</div>
        </div>`;
  }).join("");
  $("turnTitle").textContent=state.gameStarted?`${state.currentPlayerName} würfelt`:"Bereit für eine Runde?";
  $("rollsLeft").textContent=state.turn?.rollsLeft ?? 3;
  $("turnMessage").textContent=state.lastMessage||"";
  $("startBtn").classList.toggle("hidden",state.gameStarted || state.players.length===0);
  $("startBtn").disabled=state.players.length===0;
  $("rollBtn").disabled=!isMyTurn || !state.turn || state.turn.rollsLeft<=0;
  $("rollBtn").textContent=state.turn && state.turn.rollsLeft<3 ? `⚄ Noch ${state.turn.rollsLeft}× würfeln` : "⚄ Würfeln";
  $("diceHint").textContent=!state.gameStarted?"Tritt bei und starte das Spiel.":!isMyTurn?`Warte, bis ${state.currentPlayerName} fertig ist.`:state.turn.rollsLeft===3?"Du hast bis zu drei Würfe.": "Klicke Würfel an, um sie für den nächsten Wurf zu behalten.";
  $("diceTray").innerHTML=(state.turn?.dice||[1,2,3,4,5]).map((v,i)=>{
    const held=state.turn?.held?.[i];
    return `<button class="die ${held?'held':''}" data-die="${i}" ${!isMyTurn||state.turn.rollsLeft===3||state.turn.rollsLeft===0?'disabled':''} aria-label="Würfel ${i+1}: ${v}${held?', behalten':''}">${dieSvg(v)}${held?'<span class="held-tag">BEHALTEN</span>':''}</button>`;
  }).join("");
  document.querySelectorAll("[data-die]").forEach(btn=>btn.addEventListener("click",()=>socket.emit("toggleDie",Number(btn.dataset.die))));
  renderScoreTable(me);
}
const upper=["ones","twos","threes","fours","fives","sixes"];
const lower=["threeKind","fourKind","fullHouse","smallStraight","largeStraight","knueffel","chance"];
function calculateScore(category, dice) {
  const counts = Array(7).fill(0);
  dice.forEach(d => counts[d]++);
  const sum = dice.reduce((a, b) => a + b, 0);

  const upperMap = {
    ones: 1, twos: 2, threes: 3,
    fours: 4, fives: 5, sixes: 6
  };

  if (upperMap[category]) {
    return counts[upperMap[category]] * upperMap[category];
  }

  switch (category) {
    case "threeKind":
      return counts.some(n => n >= 3) ? sum : 0;

    case "fourKind":
      return counts.some(n => n >= 4) ? sum : 0;

    case "fullHouse":
      return counts.includes(3) && counts.includes(2) ? 25 : 0;

    case "smallStraight": {
      const set = new Set(dice);
      return [[1,2,3,4], [2,3,4,5], [3,4,5,6]]
        .some(s => s.every(n => set.has(n))) ? 30 : 0;
    }

    case "largeStraight": {
      const s = [...new Set(dice)].sort().join("");
      return s === "12345" || s === "23456" ? 40 : 0;
    }

    case "knueffel":
      return counts.includes(5) ? 50 : 0;

    case "chance":
      return sum;

    default:
      return 0;
  }
}
function renderScoreTable(me) {
  const players = state.players;
  const currentPlayerId = state.currentPlayerId;
  const isGameStarted = state.gameStarted;

  const upperSum = p => upper.reduce(
    (sum, key) =>
      sum + (Number.isFinite(p.scores[key]) ? p.scores[key] : 0),
    0
  );

  const lowerSum = p => lower.reduce(
    (sum, key) =>
      sum + (Number.isFinite(p.scores[key]) ? p.scores[key] : 0),
    0
  );

  function renderHeader() {
    return `<thead><tr>
      <th class="category-header">Kat</th>
      ${players.map(p => {
        const color = getPlayerColor(p.id);
        return `
          <th
            class="player-color-header ${isGameStarted && p.id === currentPlayerId ? "active-player-column" : ""}"
            style="--player-bg:${color.bg};--player-text:${color.text};--player-dark-bg:${color.darkBg};--player-dark-text:${color.darkText}"
            title="${escapeHtml(p.name)}${p.id === myId ? " (Du)" : ""}"
            aria-label="${escapeHtml(p.name)}"
          >
            <span class="player-color-dot"></span>
          </th>
        `;
      }).join("")}
    </tr></thead>`;
  }

  function renderCategory(cat) {
    let html = `<tr class="category-row ${cat === "sixes" ? "upper-end" : ""}">
      <td>${escapeHtml(state.labels[cat])}</td>`;

    for (const p of players) {
      const value = p.scores[cat];
      const isMine = p.id === myId;
      const isCurrentPlayer =
        isGameStarted && p.id === currentPlayerId;

      const canPreview =
        isCurrentPlayer &&
        state.turn &&
        state.turn.rollsLeft < 3 &&
        !Number.isFinite(value);

      let content;
      let cellClass = "";

      if (Number.isFinite(value)) {
        content = `<span class="filled ${value === 0 ? "zero" : ""}">${value}</span>`;
        cellClass = "score-filled";
      } else if (canPreview) {
        const preview = calculateScore(cat, state.turn.dice);

        if (isMine) {
          content = `<button class="score-preview" data-score="${cat}" title="${escapeHtml(state.labels[cat])} eintragen">${preview}</button>`;
          cellClass = "score-available";
        } else {
          content = `<span class="score-ghost">${preview}</span>`;
        }
      } else {
        content = "—";
      }

      const color = getPlayerColor(p.id);

      html += `<td
        class="score-cell player-score-column ${isMine ? "mine" : ""} ${cellClass} ${isCurrentPlayer ? "active-player-column" : ""}"
        style="--player-bg:${color.bg};--player-text:${color.text};--player-dark-bg:${color.darkBg};--player-dark-text:${color.darkText}"
      >${content}</td>`;
    }

    return html + "</tr>";
  }

  // LINKE TABELLE: oberer Block
  let upperHtml = renderHeader() + "<tbody>";

  for (const cat of upper) {
  upperHtml += renderCategory(cat);

  if (cat === "sixes") {
    upperHtml += `<tr class="category-row bonus-row">
      <td>Boni</td>
      ${players.map(p => {
        const sum = upperSum(p);
        const color = getPlayerColor(p.id);
        const isCurrentPlayer = isGameStarted && p.id === currentPlayerId;

        return `<td class="score-cell player-score-column ${isCurrentPlayer ? "active-player-column" : ""}"
          style="--player-bg:${color.bg};--player-text:${color.text};--player-dark-bg:${color.darkBg};--player-dark-text:${color.darkText}">
          ${sum >= 63
            ? '<strong class="bonus-achieved">+35 ✓</strong>'
            : `-${63 - sum}`}
        </td>`;
      }).join("")}
    </tr>`;

    upperHtml += `<tr class="category-row upper-end">
      <td><strong>Ges</strong></td>
      ${players.map(p => {
        const sum = upperSum(p);
        const color = getPlayerColor(p.id);
        const isCurrentPlayer = isGameStarted && p.id === currentPlayerId;

        return `<td class="score-cell player-score-column ${isCurrentPlayer ? "active-player-column" : ""}"
          style="--player-bg:${color.bg};--player-text:${color.text};--player-dark-bg:${color.darkBg};--player-dark-text:${color.darkText}">
          <strong>${sum + (sum >= 63 ? 35 : 0)}</strong>
        </td>`;
      }).join("")}
    </tr>`;
  }
}

  upperHtml += "</tbody>";

  // RECHTE TABELLE: unterer Block
  let lowerHtml = renderHeader() + "<tbody>";

  for (const cat of lower) {
    lowerHtml += renderCategory(cat);
  }

  lowerHtml += `<tr class="category-row">
    <td><strong>Ges</strong></td>
      ${players.map(p => {
        const color = getPlayerColor(p.id);
        const isCurrentPlayer = isGameStarted && p.id === currentPlayerId;

        return `<td
          class="score-cell player-score-column ${isCurrentPlayer ? "active-player-column" : ""}"
          style="--player-bg:${color.bg};--player-text:${color.text};--player-dark-bg:${color.darkBg};--player-dark-text:${color.darkText}"
        >
          <strong>${lowerSum(p)}</strong>
        </td>`;
      }).join("")}
      </tr>`;

  lowerHtml += "</tbody>";

  $("upperScoreTable").innerHTML = upperHtml;
  $("lowerScoreTable").innerHTML = lowerHtml;

  document.querySelectorAll("[data-score]").forEach(btn => {
    btn.addEventListener("click", () => {
      socket.emit("score", btn.dataset.score);
    });
  });
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

const socket = io();
const $ = id => document.getElementById(id);
let state = null;
let myId = null;
let myName = "";
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
socket.on("notice",showNotice);
$("joinForm").addEventListener("submit",e=>{
  e.preventDefault();
  myName=$("nameInput").value.trim();
  if(myName) socket.emit("join",myName);
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
  $("playersList").innerHTML=state.players.map((p,i)=>`
    <div class="player ${p.id===state.currentPlayerId&&state.gameStarted?'active':''}">
      <div class="avatar">${escapeHtml(p.name.slice(0,1).toUpperCase())}</div>
      <div class="player-info"><div class="player-name">${escapeHtml(p.name)}${p.id===myId?' (Du)':''}</div>
      <div class="player-sub">${!p.connected?'Verbindung verloren':p.id===state.currentPlayerId&&state.gameStarted?'Ist am Zug':state.gameStarted?'Spielt mit':'Bereit'}</div></div>
      <div class="player-points">${p.total}</div>
    </div>`).join("");
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
  const cats=[...upper,...lower];
  const players=state.players;
  let html = `<thead><tr>
    <th>Kategorie</th>
    ${players.map(p => `
      <th class="${state.gameStarted && p.id === state.currentPlayerId ? "active-player-column" : ""}">
        ${escapeHtml(p.name)}${p.id === myId ? " · DU" : ""}
      </th>
    `).join("")}
  </tr></thead><tbody>`;
  for(const cat of cats) {
    const isUpper=upper.includes(cat);
    if(cat==="threeKind") html+=`<tr><td colspan="${players.length+1}" style="text-align:left;background:#f7f8f5;font-size:10px;letter-spacing:1px;font-weight:850;color:#718078">UNTERER BLOCK</td></tr>`;
    html+=`<tr class="category-row ${cat==='sixes'?'upper-end':''}"><td>${state.labels[cat]}</td>`;
    for(const p of players) {
      const value=p.scores[cat];
      const isMine=p.id===myId;
      const isCurrentPlayer = state.gameStarted && state.currentPlayerId === myId;
      const canPreview =
        p.id === state.currentPlayerId &&
        state.gameStarted &&
        state.turn &&
        state.turn.rollsLeft < 3 &&
        !Number.isFinite(value);
      const available = isMine && isCurrentPlayer && canPreview;
      let content;
      let cellClass = "";

      if (Number.isFinite(value)) {
        // Bereits eingetragene Punkte
        content = `<span class="filled ${value === 0 ? "zero" : ""}">${value}</span>`;
        cellClass = "score-filled";
      } else if (canPreview) {
        // Vorschau für alle Spieler
        const preview = calculateScore(cat, state.turn.dice);

        if (available) {
          // Eigener Zug: farbig und anklickbar
          content = `<button class="score-preview" data-score="${cat}" title="${state.labels[cat]} eintragen">${preview}</button>`;
          cellClass = "score-available";
        } else {
          // Andere Spieler: dezente graue Vorschau
          content = `<span class="score-ghost" title="Mögliche Punkte im aktuellen Zug">${preview}</span>`;
          cellClass = "";
        }
      } else {
        content = "—";
      }
      html += `<td class="score-cell ${isMine ? "mine" : ""} ${cellClass} ${state.gameStarted && p.id === state.currentPlayerId ? "active-player-column" : ""}">${content}</td>`;
    }
    html+="</tr>";
    // Nach den Sechsern: fehlende Punkte und obere Summe inklusive Bonus
    if (cat === "sixes") {
      html += `<tr class="category-row">
        <td>Fehlende Punkte bis Bonus (63)</td>
        ${players.map(p => {
          const upperSum = upper.reduce(
            (sum, key) => sum + (Number.isFinite(p.scores[key]) ? p.scores[key] : 0),
            0
          );
          const missing = Math.max(0, 63 - upperSum);
          return `<td>${missing === 0 ? "Bonus erreicht!" : missing}</td>`;
        }).join("")}
      </tr>`;

      html += `<tr class="category-row upper-end">
        <td><strong>Gesamt oben inkl. Bonus</strong></td>
        ${players.map(p => {
          const upperSum = upper.reduce(
            (sum, key) => sum + (Number.isFinite(p.scores[key]) ? p.scores[key] : 0),
            0
          );
          return `<td><strong>${upperSum + (upperSum >= 63 ? 35 : 0)}</strong></td>`;
        }).join("")}
      </tr>`;
    }

    // Nach Chance: Gesamt unten, Gesamt oben und Gesamtsumme
    if (cat === "chance") {
      const lowerSum = p => lower.reduce(
        (sum, key) => sum + (Number.isFinite(p.scores[key]) ? p.scores[key] : 0),
        0
      );

      const upperSum = p => upper.reduce(
        (sum, key) => sum + (Number.isFinite(p.scores[key]) ? p.scores[key] : 0),
        0
      );

      html += `<tr class="category-row">
        <td><strong>Gesamt unten</strong></td>
        ${players.map(p => `<td><strong>${lowerSum(p)}</strong></td>`).join("")}
      </tr>`;

      html += `<tr class="category-row">
        <td><strong>Gesamt oben</strong></td>
        ${players.map(p => {
          const sum = upperSum(p);
          return `<td><strong>${sum + (sum >= 63 ? 35 : 0)}</strong></td>`;
        }).join("")}
      </tr>`;

      html += `<tr class="category-row upper-end">
        <td><strong>GESAMTSUMME</strong></td>
        ${players.map(p => {
          const sum = upperSum(p);
          const upperTotal = sum + (sum >= 63 ? 35 : 0);
          return `<td><strong>${upperTotal + lowerSum(p)}</strong></td>`;
        }).join("")}
      </tr>`;
    }
    // Nach dem oberen Block Zwischensumme und Bonus anzeigen
    if (cat === "sixes") {
      html += `<tr class="category-row">
        <td><strong>Zwischensumme oben</strong></td>
        ${players.map(p => {
          const upperSum = upper.reduce(
            (sum, key) => sum + (Number.isFinite(p.scores[key]) ? p.scores[key] : 0),
            0
          );
          return `<td><strong>${upperSum}</strong></td>`;
        }).join("")}
      </tr>`;

      html += `<tr class="category-row upper-end">
        <td>Bonus (ab 63)</td>
        ${players.map(p => {
          const upperSum = upper.reduce(
            (sum, key) => sum + (Number.isFinite(p.scores[key]) ? p.scores[key] : 0),
            0
          );
          const bonus = upperSum >= 63 ? 35 : 0;
          return `<td><strong>${bonus ? "+" + bonus : "—"}</strong></td>`;
        }).join("")}
      </tr>`;
    }
  }

  html += "</tbody>";
  $("scoreTable").innerHTML=html;
  document.querySelectorAll("[data-score]").forEach(btn=>btn.addEventListener("click",()=>socket.emit("score",btn.dataset.score)));
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

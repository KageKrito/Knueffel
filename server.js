const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const CATEGORIES = [
  "ones", "twos", "threes", "fours", "fives", "sixes",
  "threeKind", "fourKind", "fullHouse", "smallStraight",
  "largeStraight", "knueffel", "chance"
];
const LABELS = {
  ones:"1", twos:"2", threes:"3", fours:"4",
  fives:"5", sixes:"6", threeKind:"3P",
  fourKind:"4P", fullHouse:"FH", smallStraight:"KS",
  largeStraight:"GS", knueffel:"Sui", chance:"Ch"
};
let players = [];
let currentPlayerId = null;
let turn = null; // { dice: [], rollsLeft: 3 }
let gameStarted = false;
let lastMessage = "Warte auf Mitspieler.";
const scores = new Map();

function publicState() {
  return {
    players: players.map(p => ({
      id: p.id, name: p.name, connected: p.connected,
      scores: scores.get(p.id) || {},
      total: totalScore(scores.get(p.id) || {})
    })),
    currentPlayerId, turn, gameStarted, lastMessage,
    labels: LABELS,
    categories: CATEGORIES,
    currentPlayerName: players.find(p => p.id === currentPlayerId)?.name || null
  };
}
function broadcast() { io.emit("state", publicState()); }
function totalScore(score) {
  let total = 0;
  for (const c of CATEGORIES) if (Number.isFinite(score[c])) total += score[c];
  const upper = ["ones","twos","threes","fours","fives","sixes"].reduce((s,c)=>s+(score[c] ?? 0),0);
  return total + (upper >= 63 ? 35 : 0);
}
function newTurn() { turn = { dice: [1,2,3,4,5], held: [false,false,false,false,false], rollsLeft: 3 }; }
function activePlayer(socket) { return gameStarted && socket.id === currentPlayerId; }
function scoreRoll(dice, category) {
  const counts = Array(7).fill(0);
  dice.forEach(d => counts[d]++);
  const sum = dice.reduce((a,b)=>a+b,0);
  const upperMap = {ones:1,twos:2,threes:3,fours:4,fives:5,sixes:6};
  if (upperMap[category]) return counts[upperMap[category]] * upperMap[category];
  switch(category) {
    case "threeKind": return counts.some(n=>n>=3) ? sum : 0;
    case "fourKind": return counts.some(n=>n>=4) ? sum : 0;
    case "fullHouse": return counts.includes(3) && counts.includes(2) ? 25 : 0;
    case "smallStraight": {
      const set = new Set(dice);
      return [[1,2,3,4],[2,3,4,5],[3,4,5,6]].some(s=>s.every(n=>set.has(n))) ? 30 : 0;
    }
    case "largeStraight": {
      const s = [...new Set(dice)].sort().join("");
      return s === "12345" || s === "23456" ? 40 : 0;
    }
    case "knueffel": return counts.includes(5) ? 50 : 0;
    case "chance": return sum;
    default: return 0;
  }
}
function startGame() {
  if (players.length < 1) return;
  gameStarted = true;
  currentPlayerId = players[0].id;
  newTurn();
  lastMessage = `${players[0].name} beginnt.`;
}
function nextPlayer() {
  const index = players.findIndex(p=>p.id===currentPlayerId);
  const next = players[(index+1) % players.length];
  currentPlayerId = next?.id || null;
  if (currentPlayerId) {
    newTurn();
    lastMessage = `${next.name} ist am Zug.`;
  } else {
    gameStarted = false;
    turn = null;
  }
  if (players.every(p=>CATEGORIES.every(c=>Number.isFinite((scores.get(p.id)||{})[c])))) {
    gameStarted = false;
    turn = null;
    const winner = [...players].sort((a,b)=>totalScore(scores.get(b.id)||{})-totalScore(scores.get(a.id)||{}))[0];
    lastMessage = `Spiel beendet! ${winner?.name || ""} gewinnt.`;
  }
}
io.on("connection", socket => {
  socket.emit("state", publicState());
  socket.on("resetRound", () => {
    // Nur Spieler im Raum dürfen die Runde zurücksetzen.
    if (!players.some(p => p.id === socket.id && p.connected)) return;

    // Spieler entfernen, die die Verbindung verloren haben.
    players = players.filter(p => p.connected);

    // Punkte aller verbliebenen Spieler zurücksetzen.
    for (const player of players) {
      scores.set(player.id, {});
    }

    // Aktuelle Runde beenden.
    gameStarted = false;
    currentPlayerId = null;
    turn = null;

    lastMessage = "Runde zurückgesetzt. Ihr könnt neu starten.";

    broadcast();
  });
  socket.on("join", rawName => {
    if (players.some(p=>p.id===socket.id)) return;
    if (gameStarted) { socket.emit("notice","Das Spiel läuft bereits. Neue Mitspieler können erst in einer neuen Runde beitreten."); return; }
    const name = String(rawName || "").trim().slice(0,20);
    if (!name) { socket.emit("notice","Bitte gib einen Namen ein."); return; }
    if (players.length >= 8) { socket.emit("notice","Der Raum ist voll (maximal 8 Spieler)."); return; }
    players.push({id:socket.id,name,connected:true});
    scores.set(socket.id,{});
    lastMessage = `${name} ist beigetreten.`;
    broadcast();
  });
  socket.on("startGame", () => {
    if (players.length < 1 || gameStarted) return;
    startGame(); broadcast();
  });
  socket.on("roll", () => {
    if (!activePlayer(socket) || !turn || turn.rollsLeft <= 0) return;
    for (let i=0;i<5;i++) if (!turn.held[i]) turn.dice[i] = 1 + Math.floor(Math.random()*6);
    turn.rollsLeft--;
    lastMessage = `${players.find(p=>p.id===socket.id)?.name} hat gewürfelt.`;
    broadcast();
  });
  socket.on("toggleDie", index => {
    if (!activePlayer(socket) || !turn || turn.rollsLeft === 3 || !Number.isInteger(index) || index<0 || index>4) return;
    turn.held[index] = !turn.held[index];
    broadcast();
  });
  socket.on("score", category => {
    if (!activePlayer(socket) || !turn || !CATEGORIES.includes(category)) return;
    const score = scores.get(socket.id) || {};
    if (Number.isFinite(score[category])) return;
    // A player must roll at least once before recording a score.
    if (turn.rollsLeft === 3) return;
    score[category] = scoreRoll(turn.dice,category);
    scores.set(socket.id,score);
    lastMessage = `${players.find(p=>p.id===socket.id)?.name} trägt ${LABELS[category]} mit ${score[category]} Punkten ein.`;
    nextPlayer();
    broadcast();
  });
  socket.on("disconnect", () => {
    const p = players.find(p=>p.id===socket.id);
    if (!p) return;
    if (gameStarted && currentPlayerId === socket.id) {
      // Keep the player and their score in the room; they can reconnect only by refreshing isn't supported in this starter.
      p.connected = false;
      lastMessage = `${p.name} hat die Verbindung verloren. Der Zug bleibt bestehen.`;
    } else {
      players = players.filter(x=>x.id!==socket.id);
      scores.delete(socket.id);
      if (!players.length) { gameStarted=false; turn=null; currentPlayerId=null; }
    }
    broadcast();
  });
});

server.listen(PORT, () => console.log(`Knueffel läuft auf http://localhost:${PORT}`));

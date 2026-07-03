import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getDatabase, ref, set, update, get } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";
import { onValue } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { QUESTIONS } from "./questions.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const SESSION_KEY = "camuflaje_session";
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para evitar confusiones

let currentRoomCode = null;
let currentPlayerId = null;
let currentRoom = null; // última foto de la sala recibida de Firebase

/* ===================== Helpers generales ===================== */

function el(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  el(id).classList.add("active");
  el("btn-exit").classList.toggle("hidden", id === "screen-join");
}

function showToast(msg) {
  const toast = el("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add("hidden"), 3200);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateRoomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function pickQuestion(usedIds) {
  const used = usedIds || [];
  let pool = QUESTIONS.filter((q) => !used.includes(q.id));
  if (pool.length === 0) pool = QUESTIONS; // si se agotan, se reciclan
  return pool[Math.floor(Math.random() * pool.length)];
}

function saveSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ code: currentRoomCode, playerId: currentPlayerId }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function roomRef(code) { return ref(db, `rooms/${code}`); }

/* ===================== Pantalla: Unirse / Crear ===================== */

el("btn-exit").addEventListener("click", () => {
  if (!confirm("¿Salir de la partida actual?")) return;
  clearSession();
  currentRoomCode = null;
  currentPlayerId = null;
  currentRoom = null;
  showScreen("screen-join");
});

el("tab-create").addEventListener("click", () => {
  el("tab-create").classList.add("active");
  el("tab-join").classList.remove("active");
  el("panel-create").classList.remove("hidden");
  el("panel-join").classList.add("hidden");
});

el("tab-join").addEventListener("click", () => {
  el("tab-join").classList.add("active");
  el("tab-create").classList.remove("active");
  el("panel-join").classList.remove("hidden");
  el("panel-create").classList.add("hidden");
});

el("btn-create-room").addEventListener("click", async () => {
  const name = el("input-name").value.trim();
  if (!name) return showToast("Escribe tu nombre primero");

  let code = generateRoomCode();
  let attempts = 0;
  while ((await get(roomRef(code))).exists() && attempts < 8) {
    code = generateRoomCode();
    attempts++;
  }

  const playerId = crypto.randomUUID();
  await set(roomRef(code), {
    hostId: playerId,
    state: "lobby",
    round: 0,
    maxRounds: 5,
    players: { [playerId]: { name, score: 0 } },
    usedQuestionIds: [],
    createdAt: Date.now(),
  });

  currentRoomCode = code;
  currentPlayerId = playerId;
  saveSession();
  attachRoomListener(code);
});

el("btn-join-room").addEventListener("click", async () => {
  const name = el("input-name").value.trim();
  const code = el("input-code").value.trim().toUpperCase();
  if (!name) return showToast("Escribe tu nombre primero");
  if (code.length !== 4) return showToast("El código tiene 4 caracteres");

  const snap = await get(roomRef(code));
  if (!snap.exists()) return showToast("No existe ninguna sala con ese código");
  const room = snap.val();
  if (room.state !== "lobby") return showToast("Esa partida ya ha empezado");
  if (Object.keys(room.players || {}).length >= 8) return showToast("La sala ya está llena (máx. 8)");

  const playerId = crypto.randomUUID();
  await update(ref(db, `rooms/${code}/players/${playerId}`), { name, score: 0 });

  currentRoomCode = code;
  currentPlayerId = playerId;
  saveSession();
  attachRoomListener(code);
});

/* ===================== Listener principal de sala ===================== */

function attachRoomListener(code) {
  onValue(roomRef(code), (snap) => {
    if (!snap.exists()) {
      showToast("La sala se ha cerrado");
      clearSession();
      showScreen("screen-join");
      return;
    }
    currentRoom = snap.val();
    renderRoom();
  });
}

function renderRoom() {
  const room = currentRoom;
  const isHost = room.hostId === currentPlayerId;
  document.querySelectorAll(".host-only").forEach((e) => e.classList.toggle("hidden", !isHost));
  document.querySelectorAll(".guest-only").forEach((e) => e.classList.toggle("hidden", isHost));

  switch (room.state) {
    case "lobby": showScreen("screen-lobby"); renderLobby(room); break;
    case "writing": showScreen("screen-writing"); renderWriting(room); break;
    case "voting": showScreen("screen-voting"); renderVoting(room); break;
    case "reveal": showScreen("screen-reveal"); renderReveal(room); break;
    case "final": showScreen("screen-final"); renderFinal(room); break;
  }
}

/* ===================== Lobby ===================== */

function renderLobby(room) {
  el("lobby-room-code").textContent = currentRoomCode;
  const players = room.players || {};
  const list = el("lobby-player-list");
  list.innerHTML = "";
  Object.entries(players).forEach(([id, p]) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${p.name}${id === room.hostId ? " 👑" : ""}${id === currentPlayerId ? '<span class="you-tag">TÚ</span>' : ""}</span>`;
    list.appendChild(li);
  });
  const enoughPlayers = Object.keys(players).length >= 2;
  el("btn-start-game").disabled = !enoughPlayers;
  el("lobby-hint").textContent = enoughPlayers
    ? "Listos para empezar cuando quieras."
    : "Compárteles el código para que se unan. Mínimo 2 jugadores.";
}

el("btn-start-game").addEventListener("click", async () => {
  const q = pickQuestion([]);
  await update(roomRef(currentRoomCode), {
    state: "writing",
    round: 1,
    currentQuestion: { id: q.id },
    usedQuestionIds: [q.id],
    answers: {},
    votes: {},
    votingOptions: null,
  });
});

/* ===================== Escribiendo respuesta ===================== */

function getCurrentQuestionObj(room) {
  return QUESTIONS.find((q) => q.id === room.currentQuestion.id);
}

function renderWriting(room) {
  const q = getCurrentQuestionObj(room);
  el("writing-round-label").textContent = `Ronda ${room.round} / ${room.maxRounds}`;
  el("writing-prompt").textContent = q.prompt;

  const answers = room.answers || {};
  const totalPlayers = Object.keys(room.players || {}).length;
  const answeredCount = Object.keys(answers).length;
  el("writing-progress").textContent = `${answeredCount} / ${totalPlayers} han respondido`;

  const alreadySubmitted = Object.prototype.hasOwnProperty.call(answers, currentPlayerId);
  el("writing-form-wrap").classList.toggle("hidden", alreadySubmitted);
  el("writing-submitted-wrap").classList.toggle("hidden", !alreadySubmitted);
  if (!alreadySubmitted) el("input-answer").value = "";
}

el("btn-submit-answer").addEventListener("click", async () => {
  const text = el("input-answer").value.trim();
  if (!text) return showToast("Escribe una respuesta antes de enviar");
  await update(ref(db, `rooms/${currentRoomCode}/answers`), { [currentPlayerId]: text });
});

el("btn-go-voting").addEventListener("click", async () => {
  const room = currentRoom;
  const q = getCurrentQuestionObj(room);
  const answers = room.answers || {};
  const options = [{ id: "correct", text: q.answer }];
  Object.entries(answers).forEach(([pid, text]) => options.push({ id: pid, text }));
  await update(roomRef(currentRoomCode), {
    state: "voting",
    votingOptions: shuffle(options),
    votes: {},
  });
});

/* ===================== Votación ===================== */

function renderVoting(room) {
  const q = getCurrentQuestionObj(room);
  el("voting-round-label").textContent = `Ronda ${room.round} / ${room.maxRounds}`;
  el("voting-prompt").textContent = q.prompt;

  const votes = room.votes || {};
  const myVote = votes[currentPlayerId];
  const list = el("voting-options");
  list.innerHTML = "";

  (room.votingOptions || []).forEach((opt) => {
    const btn = document.createElement("button");
    const isOwn = opt.id === currentPlayerId;
    btn.className = "option-btn" + (isOwn ? " own-answer" : "") + (myVote === opt.id ? " selected" : "");
    btn.textContent = opt.text;
    btn.disabled = isOwn || Boolean(myVote);
    btn.addEventListener("click", () => castVote(opt.id));
    list.appendChild(btn);
  });

  const totalPlayers = Object.keys(room.players || {}).length;
  el("voting-progress").textContent = `${Object.keys(votes).length} / ${totalPlayers} han votado`;
}

async function castVote(optionId) {
  await update(ref(db, `rooms/${currentRoomCode}/votes`), { [currentPlayerId]: optionId });
}

el("btn-go-reveal").addEventListener("click", async () => {
  const room = currentRoom;
  const q = getCurrentQuestionObj(room);
  const votes = room.votes || {};
  const options = room.votingOptions || [];
  const players = room.players || {};

  const scoreDelta = {};
  const fooledNamesByAuthor = {};
  const correctGuessers = [];

  Object.entries(votes).forEach(([voterId, votedOptionId]) => {
    if (votedOptionId === "correct") {
      scoreDelta[voterId] = (scoreDelta[voterId] || 0) + 1000;
      correctGuessers.push(players[voterId]?.name || "?");
    } else {
      scoreDelta[votedOptionId] = (scoreDelta[votedOptionId] || 0) + 500;
      if (!fooledNamesByAuthor[votedOptionId]) fooledNamesByAuthor[votedOptionId] = [];
      fooledNamesByAuthor[votedOptionId].push(players[voterId]?.name || "?");
    }
  });

  const updatedPlayers = {};
  Object.entries(players).forEach(([id, p]) => {
    updatedPlayers[id] = { name: p.name, score: (p.score || 0) + (scoreDelta[id] || 0) };
  });

  const breakdown = options
    .filter((o) => o.id !== "correct")
    .map((o) => ({
      authorName: players[o.id]?.name || "?",
      text: o.text,
      fooledNames: fooledNamesByAuthor[o.id] || [],
    }));

  await update(roomRef(currentRoomCode), {
    state: "reveal",
    players: updatedPlayers,
    lastRoundResults: { correctAnswer: q.answer, breakdown, correctGuessers },
  });
});

/* ===================== Revelación ===================== */

function renderReveal(room) {
  const q = getCurrentQuestionObj(room);
  el("reveal-round-label").textContent = `Ronda ${room.round} / ${room.maxRounds}`;
  el("reveal-prompt").textContent = q.prompt;
  el("reveal-correct-answer").textContent = room.lastRoundResults.correctAnswer;

  const list = el("reveal-breakdown");
  list.innerHTML = "";

  const { correctGuessers, breakdown } = room.lastRoundResults;
  if (correctGuessers.length > 0) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="breakdown-fact">🎯 Acertaron: ${correctGuessers.join(", ")}</span><span class="breakdown-fooled">+1000 puntos cada uno</span>`;
    list.appendChild(li);
  }
  breakdown.forEach((b) => {
    const li = document.createElement("li");
    const fooledText = b.fooledNames.length > 0
      ? `Engañó a: ${b.fooledNames.join(", ")} (+${b.fooledNames.length * 500} pts)`
      : "Nadie cayó en esta mentira";
    li.innerHTML = `<span class="breakdown-author">${b.authorName}</span><span class="breakdown-fact">"${b.text}"</span><span class="breakdown-fooled">${fooledText}</span>`;
    list.appendChild(li);
  });

  const isLastRound = room.round >= room.maxRounds;
  el("btn-next-round").classList.toggle("hidden", isLastRound || room.hostId !== currentPlayerId);
  el("btn-go-final").classList.toggle("hidden", !isLastRound || room.hostId !== currentPlayerId);
}

el("btn-next-round").addEventListener("click", async () => {
  const room = currentRoom;
  const q = pickQuestion(room.usedQuestionIds || []);
  await update(roomRef(currentRoomCode), {
    state: "writing",
    round: room.round + 1,
    currentQuestion: { id: q.id },
    usedQuestionIds: [...(room.usedQuestionIds || []), q.id],
    answers: {},
    votes: {},
    votingOptions: null,
    lastRoundResults: null,
  });
});

el("btn-go-final").addEventListener("click", async () => {
  await update(roomRef(currentRoomCode), { state: "final" });
});

/* ===================== Marcador final ===================== */

function renderFinal(room) {
  const players = Object.values(room.players || {}).sort((a, b) => b.score - a.score);
  const list = el("final-scoreboard");
  list.innerHTML = "";
  players.forEach((p, i) => {
    const li = document.createElement("li");
    if (i === 0) li.classList.add("rank-1");
    li.innerHTML = `<span><span class="rank-num">${i + 1}.</span>${p.name}</span><span>${p.score} pts</span>`;
    list.appendChild(li);
  });
}

el("btn-play-again").addEventListener("click", async () => {
  const room = currentRoom;
  const resetPlayers = {};
  Object.entries(room.players || {}).forEach(([id, p]) => {
    resetPlayers[id] = { name: p.name, score: 0 };
  });
  await update(roomRef(currentRoomCode), {
    state: "lobby",
    round: 0,
    usedQuestionIds: [],
    answers: null,
    votes: null,
    votingOptions: null,
    currentQuestion: null,
    lastRoundResults: null,
    players: resetPlayers,
  });
});

/* ===================== Arranque: recuperar sesión o leer ?room= ===================== */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get("room");

  const savedRaw = localStorage.getItem(SESSION_KEY);
  if (savedRaw) {
    try {
      const saved = JSON.parse(savedRaw);
      const snap = await get(roomRef(saved.code));
      if (snap.exists() && snap.val().players && snap.val().players[saved.playerId]) {
        currentRoomCode = saved.code;
        currentPlayerId = saved.playerId;
        attachRoomListener(saved.code);
        return;
      }
    } catch (e) { /* sesión corrupta, se ignora */ }
    clearSession();
  }

  if (roomFromUrl && roomFromUrl.length === 4) {
    el("input-code").value = roomFromUrl.toUpperCase();
    el("tab-join").click();
  }
})();

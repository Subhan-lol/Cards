const joinScreen = document.querySelector("#joinScreen");
const joinForm = document.querySelector("#joinForm");
const nameInput = document.querySelector("#nameInput");
const roomInput = document.querySelector("#roomInput");
const seatInput = document.querySelector("#seatInput");
const joinStatus = document.querySelector("#joinStatus");
const roomCode = document.querySelector("#roomCode");
const seatName = document.querySelector("#seatName");
const table = document.querySelector("#table");
const cardsLayer = document.querySelector("#cardsLayer");
const resetButton = document.querySelector("#resetButton");
const distributeButton = document.querySelector("#distributeButton");
const copyLinkButton = document.querySelector("#copyLinkButton");

const suitSymbols = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

const seatLabels = ["Bottom", "Right", "Top", "Left"];
const visualSeatClasses = ["seat-bottom", "seat-right", "seat-top", "seat-left"];
let socket = null;
let state = null;
let viewerSeat = null;
let dragging = null;
let localMoveRaf = 0;

const params = new URLSearchParams(window.location.search);
roomInput.value = params.get("room") || randomRoom();
nameInput.value = localStorage.getItem("cardTableName") || "";

function randomRoom() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function setJoinStatus(message, type = "") {
  joinStatus.textContent = message;
  joinStatus.className = ["join-status", type].filter(Boolean).join(" ");
}

function getTablePoint(clientX, clientY) {
  const rect = table.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  };
}

function rotatePoint(point, turns, direction = "ccw") {
  let rotated = { ...point };
  const count = ((turns % 4) + 4) % 4;

  for (let index = 0; index < count; index += 1) {
    rotated =
      direction === "ccw"
        ? { x: 100 - rotated.y, y: rotated.x }
        : { x: rotated.y, y: 100 - rotated.x };
  }

  return rotated;
}

function toViewPoint(point) {
  return rotatePoint(point, viewerSeat ?? 0, "ccw");
}

function toTablePoint(point) {
  return rotatePoint(point, viewerSeat ?? 0, "cw");
}

function relativeSeat(seat) {
  if (viewerSeat === null) return seat;
  return (seat - viewerSeat + 4) % 4;
}

function getDropZone(clientX, clientY) {
  const previousPointerEvents = dragging?.element.style.pointerEvents;
  if (dragging?.element) dragging.element.style.pointerEvents = "none";
  const element = document.elementFromPoint(clientX, clientY);
  if (dragging?.element) dragging.element.style.pointerEvents = previousPointerEvents;
  const zone = element?.closest?.(".hand-zone");

  if (zone) {
    return {
      zone: "hand",
      owner: Number(zone.dataset.seat),
    };
  }

  return {
    zone: "table",
    owner: null,
  };
}

function cardFace(card) {
  if (!card.rank || !card.suit) {
    return `<div class="card-value-hidden">Private card</div>`;
  }

  const symbol = suitSymbols[card.suit];
  return `
    <div class="corner"><span>${card.rank}</span><span>${symbol}</span></div>
    <div class="center">${symbol}</div>
    <div class="corner bottom"><span>${card.rank}</span><span>${symbol}</span></div>
  `;
}

function renderCard(card) {
  const element = document.createElement("button");
  const hiddenPrivate = card.zone === "hand" && card.faceUp && card.owner !== viewerSeat;
  const faceDown = !card.faceUp;
  const red = card.suit === "H" || card.suit === "D";
  const viewPoint = toViewPoint({ x: card.x, y: card.y });

  element.type = "button";
  element.className = [
    "card",
    faceDown ? "back" : "",
    hiddenPrivate ? "private-hidden" : "",
    red && !faceDown ? "red-card" : "",
  ]
    .filter(Boolean)
    .join(" ");
  element.dataset.id = card.id;
  element.style.left = `${viewPoint.x}%`;
  element.style.top = `${viewPoint.y}%`;
  element.style.zIndex = card.z;
  element.innerHTML = faceDown ? "" : cardFace(card);

  element.addEventListener("click", (event) => {
    if (event.button !== 0 || dragging) return;
    socket.emit("flip-card", { id: card.id });
  });

  element.addEventListener("contextmenu", (event) => event.preventDefault());
  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 2) return;

    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    const point = getTablePoint(event.clientX, event.clientY);
    dragging = {
      id: card.id,
      element,
      pointerId: event.pointerId,
      offsetX: point.x - viewPoint.x,
      offsetY: point.y - viewPoint.y,
    };
    element.classList.add("dragging");
  });

  return element;
}

function render() {
  if (!state) return;

  roomCode.textContent = state.code;
  viewerSeat = state.viewerSeat;
  seatName.textContent = viewerSeat === null ? "Spectator" : seatLabels[viewerSeat];

  for (const seat of document.querySelectorAll(".seat")) {
    const index = Number(seat.dataset.seat);
    const player = state.players[index];
    const relative = relativeSeat(index);

    seat.classList.remove(...visualSeatClasses);
    seat.classList.add(visualSeatClasses[relative]);
    seat.classList.toggle("mine", index === viewerSeat);
    seat.querySelector(".seat-name").textContent = player?.name
      ? `${seatLabels[relative]}: ${player.name}`
      : seatLabels[relative];
  }

  cardsLayer.replaceChildren(...state.cards.map(renderCard));
}

function joinTable(event) {
  event.preventDefault();
  event.stopPropagation();

  if (!socket) {
    setJoinStatus("Multiplayer connection is not ready. Refresh once, then try again.", "error");
    return false;
  }

  const name = nameInput.value.trim() || "Player";
  const room = roomInput.value.trim().toUpperCase() || randomRoom();

  localStorage.setItem("cardTableName", name);
  setJoinStatus("Joining room...", "");
  socket.emit("join", {
    name,
    roomCode: room,
    seat: seatInput.value,
  });

  return false;
}

function scheduleLocalMove(event) {
  if (!dragging) return;

  cancelAnimationFrame(localMoveRaf);
  localMoveRaf = requestAnimationFrame(() => {
    const point = getTablePoint(event.clientX, event.clientY);
    const x = Math.max(0, Math.min(100, point.x - dragging.offsetX));
    const y = Math.max(0, Math.min(100, point.y - dragging.offsetY));

    dragging.element.style.left = `${x}%`;
    dragging.element.style.top = `${y}%`;
    dragging.lastX = x;
    dragging.lastY = y;
  });
}

window.addEventListener("pointermove", scheduleLocalMove);
window.addEventListener("pointerup", (event) => {
  if (!dragging || event.pointerId !== dragging.pointerId) return;

  const point = getTablePoint(event.clientX, event.clientY);
  const drop = getDropZone(event.clientX, event.clientY);
  const viewPoint = {
    x: Math.max(0, Math.min(100, point.x - dragging.offsetX)),
    y: Math.max(0, Math.min(100, point.y - dragging.offsetY)),
  };
  const tablePoint = toTablePoint(viewPoint);

  socket.emit("move-card", {
    id: dragging.id,
    x: tablePoint.x,
    y: tablePoint.y,
    zone: drop.zone,
    owner: drop.owner,
  });

  dragging.element.classList.remove("dragging");
  dragging = null;
});

joinForm.addEventListener("submit", joinTable);
resetButton.addEventListener("click", () => socket?.emit("reset-game"));
distributeButton.addEventListener("click", () => socket?.emit("distribute"));
copyLinkButton.addEventListener("click", async () => {
  const link = `${window.location.origin}/?room=${encodeURIComponent(roomCode.textContent)}`;
  await navigator.clipboard.writeText(link);
  copyLinkButton.textContent = "Copied";
  setTimeout(() => {
    copyLinkButton.textContent = "Copy link";
  }, 1200);
});

function startSocket() {
  if (typeof window.io !== "function") {
    setJoinStatus("Could not load multiplayer. Make sure this is the Render Web Service link, not GitHub Pages.", "error");
    return;
  }

  socket = window.io();

  socket.on("connect", () => {
    setJoinStatus("Connected. Enter the room code and join.", "good");
  });

  socket.on("connect_error", () => {
    setJoinStatus("Could not connect to the game server. Try refreshing after the Render app wakes up.", "error");
  });

  socket.on("disconnect", () => {
    setJoinStatus("Disconnected. Refresh if it does not reconnect automatically.", "error");
  });

  socket.on("joined", ({ roomCode: joinedRoom }) => {
    const url = new URL(window.location.href);
    url.searchParams.set("room", joinedRoom);
    window.history.replaceState({}, "", url);
    joinScreen.classList.add("hidden");
  });

  socket.on("full", () => {
    setJoinStatus("This room already has 4 seated players.", "error");
  });

  socket.on("state", (nextState) => {
    state = nextState;
    if (!dragging) render();
  });
}

startSocket();

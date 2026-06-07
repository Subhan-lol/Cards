import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server);

const rooms = new Map();
const suits = ["S", "H", "D", "C"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

app.use(express.static(path.join(__dirname, "public")));

function buildDeck() {
  const deck = [];
  let index = 0;

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({
        id: `${rank}${suit}`,
        rank,
        suit,
        faceUp: false,
        zone: "deck",
        owner: null,
        x: 86 + Math.random() * 1.4,
        y: 45 + Math.random() * 1.4,
        z: index,
      });
      index += 1;
    }
  }

  return shuffle(deck);
}

function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.map((card, index) => ({ ...card, z: index }));
}

function createRoom(roomCode) {
  return {
    code: roomCode,
    cards: buildDeck(),
    players: Array.from({ length: 4 }, (_, seat) => ({
      seat,
      name: "",
      socketId: null,
      connected: false,
    })),
    nextZ: 100,
  };
}

function getPublicState(room, viewerSeat = null) {
  return {
    code: room.code,
    players: room.players,
    viewerSeat,
    cards: room.cards.map((card) => {
      const isPrivate = card.zone === "hand";
      const canSee = !isPrivate || card.owner === viewerSeat || !card.faceUp;

      return {
        ...card,
        rank: canSee ? card.rank : "",
        suit: canSee ? card.suit : "",
      };
    }),
  };
}

function broadcastRoom(room) {
  for (const player of room.players) {
    if (player.socketId) {
      io.to(player.socketId).emit("state", getPublicState(room, player.seat));
    }
  }
}

function assignSeat(room, socketId, requestedSeat, name) {
  const reusableSeat = room.players.find((player) => player.socketId === socketId);
  if (reusableSeat) return reusableSeat.seat;

  const requested = Number(requestedSeat);
  if (Number.isInteger(requested) && requested >= 0 && requested < 4) {
    const seat = room.players[requested];
    if (!seat.connected) {
      seat.socketId = socketId;
      seat.connected = true;
      seat.name = name || `Player ${requested + 1}`;
      return requested;
    }
  }

  const openSeat = room.players.find((player) => !player.connected);
  if (!openSeat) return null;

  openSeat.socketId = socketId;
  openSeat.connected = true;
  openSeat.name = name || `Player ${openSeat.seat + 1}`;
  return openSeat.seat;
}

function resetRoom(room) {
  room.cards = buildDeck();
  room.nextZ = 100;
}

function distribute(room) {
  const deck = shuffle(room.cards);
  const handCounts = [0, 0, 0, 0];

  room.cards = deck.map((card, index) => {
    const owner = index % 4;
    const handIndex = handCounts[owner];
    const row = Math.floor(handIndex / 7);
    const col = handIndex % 7;
    handCounts[owner] += 1;
    const handPositions = [
      { x: 27 + col * 7.8, y: 82 + row * 5.3 },
      { x: 88 - row * 4.4, y: 25 + col * 7.6 },
      { x: 27 + col * 7.8, y: 18 - row * 5.3 },
      { x: 12 + row * 4.4, y: 25 + col * 7.6 },
    ];

    return {
      ...card,
      faceUp: false,
      zone: "hand",
      owner,
      x: handPositions[owner].x,
      y: handPositions[owner].y,
      z: index,
    };
  });

  room.nextZ = room.cards.length + 100;
}

io.on("connection", (socket) => {
  let joinedRoomCode = null;
  let joinedSeat = null;

  socket.on("join", ({ roomCode, name, seat }) => {
    const cleanRoomCode = String(roomCode || "TABLE").trim().toUpperCase().slice(0, 16) || "TABLE";
    if (!rooms.has(cleanRoomCode)) rooms.set(cleanRoomCode, createRoom(cleanRoomCode));

    const room = rooms.get(cleanRoomCode);
    const assignedSeat = assignSeat(room, socket.id, seat, String(name || "").trim().slice(0, 18));

    if (assignedSeat === null) {
      socket.emit("full", { roomCode: cleanRoomCode });
      return;
    }

    joinedRoomCode = cleanRoomCode;
    joinedSeat = assignedSeat;
    socket.join(cleanRoomCode);
    socket.emit("joined", { roomCode: cleanRoomCode, seat: joinedSeat });
    broadcastRoom(room);
  });

  socket.on("move-card", ({ id, x, y, zone, owner }) => {
    const room = rooms.get(joinedRoomCode);
    if (!room) return;

    const card = room.cards.find((item) => item.id === id);
    if (!card) return;

    card.x = Math.max(0, Math.min(100, Number(x)));
    card.y = Math.max(0, Math.min(100, Number(y)));
    card.zone = zone === "hand" ? "hand" : "table";
    card.owner = card.zone === "hand" ? Math.max(0, Math.min(3, Number(owner))) : null;
    card.z = room.nextZ;
    room.nextZ += 1;
    broadcastRoom(room);
  });

  socket.on("flip-card", ({ id }) => {
    const room = rooms.get(joinedRoomCode);
    if (!room) return;

    const card = room.cards.find((item) => item.id === id);
    if (!card) return;

    card.faceUp = !card.faceUp;
    card.z = room.nextZ;
    room.nextZ += 1;
    broadcastRoom(room);
  });

  socket.on("reset-game", () => {
    const room = rooms.get(joinedRoomCode);
    if (!room) return;

    resetRoom(room);
    broadcastRoom(room);
  });

  socket.on("distribute", () => {
    const room = rooms.get(joinedRoomCode);
    if (!room) return;

    distribute(room);
    broadcastRoom(room);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(joinedRoomCode);
    if (!room || joinedSeat === null) return;

    const player = room.players[joinedSeat];
    player.socketId = null;
    player.connected = false;
    broadcastRoom(room);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Card table running on http://localhost:${port}`);
});

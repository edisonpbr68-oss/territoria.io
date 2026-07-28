const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const { GameRoom } = require("./game");
const { FACTIONS } = require("./factions");
const { UNITS } = require("./units");
const { BUILDINGS, FACTION_UNIQUE_TRAIN } = require("./buildings");

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, "..", "client");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

// Petit serveur de fichiers statiques fait main : on évite volontairement
// tout framework HTTP tiers ici pour ne dépendre que du module natif "http".
function serveStatic(req, res) {
  let reqPath = decodeURIComponent(req.url.split("?")[0]);
  if (reqPath === "/") reqPath = "/index.html";
  const filePath = path.join(CLIENT_DIR, reqPath);
  if (!filePath.startsWith(CLIENT_DIR)) { res.writeHead(403); res.end("Interdit"); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Introuvable"); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: "/ws" });

const rooms = new Map(); // roomId -> GameRoom

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    const room = new GameRoom(roomId, (message) => broadcastToRoom(roomId, message));
    rooms.set(roomId, room);
  }
  return rooms.get(roomId);
}

function broadcastToRoom(roomId, message) {
  const room = rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.ws && player.ws.readyState === 1) player.ws.send(data);
  }
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const roomId = url.searchParams.get("room") || "main";
  const playerId = crypto.randomUUID();
  ws.playerId = playerId;
  ws.roomId = roomId;

  // Envoyé immédiatement à la connexion (avant tout "join") pour que le
  // client puisse afficher les cartes de faction dans le lobby sans avoir
  // besoin d'avoir déjà rejoint une partie.
  ws.send(JSON.stringify({
    type: "gameData",
    factions: FACTIONS, units: UNITS, buildings: BUILDINGS, factionUniqueTrain: FACTION_UNIQUE_TRAIN,
  }));

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    const room = getOrCreateRoom(roomId);

    if (msg.type === "join") {
      const result = room.addPlayer(playerId, ws, msg.name);
      if (result.error) { ws.send(JSON.stringify({ type: "error", message: result.error })); return; }
      if (msg.factionId) room.setFaction(playerId, msg.factionId);
      ws.send(JSON.stringify({
        type: "welcome", playerId, roomId,
        factions: FACTIONS, units: UNITS, buildings: BUILDINGS, factionUniqueTrain: FACTION_UNIQUE_TRAIN,
      }));
      broadcastToRoom(roomId, room.lobbyState());
      return;
    }

    if (!room.players.has(playerId)) return; // pas encore rejoint

    if (msg.type === "setFaction") { room.setFaction(playerId, msg.factionId); broadcastToRoom(roomId, room.lobbyState()); return; }
    if (msg.type === "ready") { room.setReady(playerId, msg.ready); broadcastToRoom(roomId, room.lobbyState()); return; }

    room.handleCommand(playerId, msg);
  });

  ws.on("close", () => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.removePlayer(playerId);
    if (room.status === "lobby") broadcastToRoom(roomId, room.lobbyState());
    if (room.players.size === 0) rooms.delete(roomId);
  });
});

server.listen(PORT, () => {
  console.log(`Territoria MVP en écoute sur http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws?room=main`);
});

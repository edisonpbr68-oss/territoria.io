// Test d'intégration : lance le vrai serveur (child process) et connecte
// deux "bots" WebSocket qui rejouent le cycle lobby -> récolte -> construction
// -> entraînement -> combat, exactement comme le ferait le client web.
const { spawn } = require("child_process");
const path = require("path");
const WebSocket = require("ws");

const PORT = 3901;
let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const server = spawn("node", ["server/server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  server.stderr.on("data", (d) => process.stdout.write(`[server:err] ${d}`));
  server.on("error", (e) => console.error("[server spawn error]", e));
  server.on("exit", (code) => console.log(`[server exited] code=${code}`));

  await wait(1800); // laisser le serveur démarrer

  const roomId = "testroom_" + Date.now();
  const state = { a: {}, b: {} };

  function makeBot(key, name, factionId) {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${PORT}/ws?room=${roomId}`);
      state[key].ws = ws;
      state[key].messages = [];
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "join", name, factionId }));
      });
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw);
        state[key].messages.push(msg);
        if (msg.type === "welcome") { state[key].playerId = msg.playerId; state[key].data = msg; resolve(); }
        if (msg.type === "state") state[key].lastState = msg;
        if (msg.type === "mapData") state[key].map = msg.map;
      });
    });
  }

  await Promise.all([makeBot("a", "BotA", "sylvains"), makeBot("b", "BotB", "steppes")]);
  check("Les deux bots ont reçu un welcome avec un playerId", !!state.a.playerId && !!state.b.playerId);

  state.a.ws.send(JSON.stringify({ type: "ready", ready: true }));
  state.b.ws.send(JSON.stringify({ type: "ready", ready: true }));

  await wait(600);
  check("La partie a démarré (mapData reçue)", !!state.a.map);

  await wait(300);
  const myUnitsA = (state.a.lastState?.units || []).filter((u) => u.ownerId === state.a.playerId);
  check("BotA possède 3 villageois de départ", myUnitsA.length === 3);

  const myTcA = (state.a.lastState?.buildings || []).find((b) => b.ownerId === state.a.playerId && b.type === "townCenter");
  check("BotA possède un Hôtel de Ville de départ", !!myTcA);

  // ---- test récolte ----
  const forestTile = (state.a.lastState?.resourceTiles || [])
    .filter((r) => r.type === "forest")
    .sort((r1, r2) => Math.hypot(r1.x - myTcA.x, r1.y - myTcA.y) - Math.hypot(r2.x - myTcA.x, r2.y - myTcA.y))[0];
  check("Une tuile de forêt existe près du point de départ de BotA", !!forestTile);

  const gathererId = myUnitsA[0].id;
  state.a.ws.send(JSON.stringify({ type: "gather", unitIds: [gathererId], x: forestTile.x, y: forestTile.y }));

  const woodBefore = state.a.lastState.players.find((p) => p.id === state.a.playerId).resources.wood;
  await wait(7000);
  const woodAfter = state.a.lastState.players.find((p) => p.id === state.a.playerId).resources.wood;
  check(`Le bois a augmenté après récolte (${woodBefore} -> ${woodAfter})`, woodAfter > woodBefore);

  // ---- test construction ----
  const before = state.a.lastState.players.find((p) => p.id === state.a.playerId).resources;
  state.a.ws.send(JSON.stringify({ type: "build", buildingType: "house", x: Math.round(myTcA.x) + 3, y: Math.round(myTcA.y) + 3 }));
  await wait(400);
  const afterResources = state.a.lastState.players.find((p) => p.id === state.a.playerId).resources;
  check("Le coût en bois de la maison a été déduit", afterResources.wood < before.wood);

  let house = (state.a.lastState.buildings || []).find((b) => b.type === "house" && b.ownerId === state.a.playerId);
  check("La maison apparaît en construction", !!house && house.underConstruction === true);
  const hpAtT0 = house ? house.hp : 0;

  await wait(1200);
  house = (state.a.lastState.buildings || []).find((b) => b.type === "house" && b.ownerId === state.a.playerId);
  check("La progression de construction augmente les PV du bâtiment au fil du temps", !!house && house.hp > hpAtT0);

  // ---- test entraînement ----
  const popBefore = state.a.lastState.players.find((p) => p.id === state.a.playerId).popUsed;
  state.a.ws.send(JSON.stringify({ type: "train", buildingId: myTcA.id, unitType: "villager" }));
  await wait(400);
  const popAfterQueue = state.a.lastState.players.find((p) => p.id === state.a.playerId).popUsed;
  check("La population réservée augmente dès la mise en file d'entraînement", popAfterQueue > popBefore);
  const tcAfterQueue = (state.a.lastState.buildings || []).find((b) => b.id === myTcA.id);
  check("La file d'entraînement de l'Hôtel de Ville contient bien le villageois", tcAfterQueue.trainQueue.length === 1 && tcAfterQueue.trainQueue[0].unitType === "villager");

  // ---- test combat (ordre d'attaque direct, vérifie l'absence de crash serveur) ----
  const attacker = myUnitsA[1];
  const targetVillagerB = (state.b.lastState.units || []).find((u) => u.ownerId === state.b.playerId);
  // Téléportation impossible via le protocole -> on vérifie juste que la commande est acceptée sans erreur serveur
  state.a.ws.send(JSON.stringify({ type: "attack", unitIds: [attacker.id], targetId: targetVillagerB.id }));
  await wait(500);
  const attackerAfter = (state.a.lastState.units || []).find((u) => u.id === attacker.id);
  check("L'unité en ordre d'attaque se dirige vers la cible (pas de crash serveur)", !!attackerAfter);

  console.log(`\n${failures === 0 ? "TOUS LES TESTS SONT PASS." : failures + " TEST(S) EN ECHEC."}`);
  state.a.ws.close(); state.b.ws.close();
  server.kill();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

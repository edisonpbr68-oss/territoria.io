// ============================================================
// Territoria — client MVP (canvas, sans framework)
// ============================================================
const TILE_PX = 16;

const TERRAIN_COLORS = {
  grass: "#4a7a4f",
  forest: "#1f4a2a",
  berry: "#5a6a2f",
  goldDeposit: "#6a5a2f",
  stoneDeposit: "#55584f",
  mountain: "#3a3a38",
};
const RESOURCE_DOT_COLORS = { forest: "#2f6b3a", berry: "#c65b6b", goldDeposit: "#d9b13a", stoneDeposit: "#9098a0" };
const RES_KEY_FOR_TILE = { forest: "wood", berry: "food", goldDeposit: "gold", stoneDeposit: "stone" };

const G = {
  ws: null, myId: null, roomId: "main",
  data: { factions: {}, units: {}, buildings: {}, factionUniqueTrain: {} },
  map: null,
  players: [], units: [], buildings: [], resourceTiles: [],
  selectedFactionId: null,
  selectedIds: new Set(), selectedBuildingId: null,
  placingBuildingType: null,
  joined: false,
  mouse: { x: 0, y: 0, downPixel: null },
};

const el = (id) => document.getElementById(id);

// ---------------- connexion ----------------
function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  G.ws = new WebSocket(`${proto}//${location.host}/ws?room=${G.roomId}`);
  G.ws.onmessage = (evt) => handleMessage(JSON.parse(evt.data));
  G.ws.onclose = () => console.log("Connexion fermée.");
}

function send(msg) {
  if (G.ws && G.ws.readyState === 1) G.ws.send(JSON.stringify(msg));
}

function handleMessage(msg) {
  switch (msg.type) {
    case "welcome":
      G.myId = msg.playerId;
      G.data = { factions: msg.factions, units: msg.units, buildings: msg.buildings, factionUniqueTrain: msg.factionUniqueTrain };
      renderFactionCards();
      renderBuildMenu();
      break;
    case "lobby":
      renderLobbyPlayers(msg.players);
      break;
    case "mapData":
      G.map = msg.map;
      break;
    case "gameStarted":
      el("lobbyOverlay").classList.add("hidden");
      el("gameUI").classList.remove("hidden");
      requestAnimationFrame(render);
      break;
    case "state":
      G.players = msg.players; G.units = msg.units; G.buildings = msg.buildings; G.resourceTiles = msg.resourceTiles;
      updateHud();
      updateSidePanel();
      renderBuildMenu();
      break;
    case "gameOver":
      showGameOver(msg);
      break;
    case "error":
      el("lobbyError").textContent = msg.message;
      break;
  }
}

// ---------------- lobby UI ----------------
function renderFactionCards() {
  const wrap = el("factionCards");
  wrap.innerHTML = "";
  Object.values(G.data.factions).forEach((f) => {
    const card = document.createElement("div");
    card.className = "factionCard";
    card.innerHTML = `<div class="fName" style="color:${f.color}">${f.name}</div><div class="fDesc">${f.description}</div>`;
    card.onclick = () => {
      G.selectedFactionId = f.id;
      [...wrap.children].forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      el("readyBtn").disabled = false;
    };
    wrap.appendChild(card);
  });
}

function renderLobbyPlayers(players) {
  const wrap = el("lobbyPlayers");
  wrap.innerHTML = players.map((p) => {
    const faction = p.factionId ? G.data.factions[p.factionId]?.name : "(faction non choisie)";
    return `<div>${p.ready ? "✅" : "⏳"} ${p.name} — ${faction}</div>`;
  }).join("");
}

el("readyBtn").addEventListener("click", () => {
  const name = el("nameInput").value.trim() || "Joueur";
  if (!G.joined) {
    send({ type: "join", name, factionId: G.selectedFactionId });
    G.joined = true;
  }
  send({ type: "ready", ready: true });
  el("readyBtn").disabled = true;
  el("readyBtn").textContent = "En attente des autres joueurs…";
});

function showGameOver(msg) {
  el("gameOverOverlay").classList.remove("hidden");
  if (msg.winnerId === G.myId) {
    el("gameOverTitle").textContent = "Victoire !";
    el("gameOverText").textContent = "Vous avez éliminé tous vos adversaires.";
  } else if (msg.winnerId) {
    el("gameOverTitle").textContent = "Défaite";
    el("gameOverText").textContent = `${msg.winnerName} remporte la partie.`;
  } else {
    el("gameOverTitle").textContent = "Match nul";
    el("gameOverText").textContent = "Plus aucun joueur en lice.";
  }
}

// ---------------- HUD ----------------
function myPlayer() { return G.players.find((p) => p.id === G.myId); }

function updateHud() {
  const me = myPlayer();
  if (me) {
    el("resWood").textContent = Math.floor(me.resources.wood);
    el("resFood").textContent = Math.floor(me.resources.food);
    el("resGold").textContent = Math.floor(me.resources.gold);
    el("resStone").textContent = Math.floor(me.resources.stone);
    el("resPop").textContent = `${me.popUsed}/${me.popCap}`;
  }
  el("playersBar").innerHTML = G.players.map((p) => {
    const f = p.factionId ? G.data.factions[p.factionId] : null;
    return `<div class="pchip ${p.eliminated ? "eliminated" : ""}"><span class="pdot" style="background:${p.color}"></span>${p.name}${f ? " · " + f.name : ""}</div>`;
  }).join("");
}

// ---------------- side panel : sélection / construction / entraînement ----------------
function updateSidePanel() {
  const info = el("selectionInfo");
  const me = myPlayer();

  if (G.selectedBuildingId) {
    const b = G.buildings.find((x) => x.id === G.selectedBuildingId);
    if (b) {
      const def = G.data.buildings[b.type];
      let html = `<strong>${def.name}</strong><br/>PV : ${b.hp}/${b.maxHp}`;
      if (b.underConstruction) html += `<br/>Construction en cours…`;
      if (b.trainQueue && b.trainQueue.length) {
        html += `<br/>File : ${b.trainQueue.map((j) => `${G.data.units[j.unitType].name} (${j.timeRemaining}s)`).join(", ")}`;
      }
      if (b.foodStock !== undefined) html += `<br/>Réserve de nourriture : ${Math.floor(b.foodStock)}`;
      info.innerHTML = html;
    } else { info.innerHTML = `<p class="hint">Bâtiment détruit.</p>`; G.selectedBuildingId = null; }
  } else if (G.selectedIds.size > 0) {
    const chips = [...G.selectedIds].map((id) => G.units.find((u) => u.id === id)).filter(Boolean).map((u) => {
      const def = G.data.units[u.type];
      const pct = Math.round((u.hp / u.maxHp) * 100);
      return `<span class="unitChip">${def.name} <span class="hpBarMini"><div style="width:${pct}%"></div></span></span>`;
    }).join("");
    info.innerHTML = chips || `<p class="hint">Sélection perdue.</p>`;
  } else {
    info.innerHTML = `<p class="hint">Cliquez sur une unité ou un bâtiment. Clic-droit pour agir (déplacer / récolter / attaquer).</p>`;
  }

  // menu d'entraînement
  const trainWrap = el("trainMenu");
  trainWrap.innerHTML = "";
  if (G.selectedBuildingId && me) {
    const b = G.buildings.find((x) => x.id === G.selectedBuildingId);
    if (b && b.ownerId === G.myId && !b.underConstruction) {
      const def = G.data.buildings[b.type];
      const trainable = [...(def.trains || [])];
      const unique = G.data.factionUniqueTrain[me.factionId];
      if (unique && unique.building === b.type) trainable.push(unique.unit);
      if (trainable.length) {
        const title = document.createElement("div");
        title.className = "menuSectionTitle";
        title.textContent = "Entraîner";
        trainWrap.appendChild(title);
        trainable.forEach((unitType) => {
          const udef = G.data.units[unitType];
          const btn = document.createElement("button");
          btn.className = "menuBtn";
          const costStr = Object.entries(udef.cost).map(([k, v]) => `${v} ${k}`).join(", ");
          btn.innerHTML = `<span class="mbName">${udef.name}</span><span class="mbCost">${costStr} · ${udef.trainTime}s</span>`;
          btn.onclick = () => send({ type: "train", buildingId: b.id, unitType });
          trainWrap.appendChild(btn);
        });
      }
    }
  }
}

// ---------------- menu de construction ----------------
function renderBuildMenu() {
  const wrap = el("buildMenu");
  const me = myPlayer();
  wrap.innerHTML = "";
  const title = document.createElement("div");
  title.className = "menuSectionTitle";
  title.textContent = "Construire";
  wrap.appendChild(title);
  Object.values(G.data.buildings || {}).forEach((def) => {
    if (def.startingBuilding) return;
    const btn = document.createElement("button");
    btn.className = "menuBtn" + (G.placingBuildingType === def.id ? " active" : "");
    const costStr = Object.entries(def.cost).map(([k, v]) => `${v} ${k}`).join(", ");
    btn.innerHTML = `<span class="mbName">${def.name}</span><span class="mbCost">${costStr}</span>`;
    if (me) {
      const afford = Object.entries(def.cost).every(([k, v]) => (me.resources[k] || 0) >= v);
      btn.disabled = !afford;
    }
    btn.onclick = () => { G.placingBuildingType = G.placingBuildingType === def.id ? null : def.id; renderBuildMenu(); };
    wrap.appendChild(btn);
  });
}

// ---------------- rendu ----------------
const canvas = el("gameCanvas");
const ctx = canvas.getContext("2d");

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (G.map) {
    for (let y = 0; y < G.map.height; y++) {
      for (let x = 0; x < G.map.width; x++) {
        const t = G.map.terrain[y][x];
        ctx.fillStyle = TERRAIN_COLORS[t] || TERRAIN_COLORS.grass;
        ctx.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
      }
    }
  }

  // ressources
  for (const r of G.resourceTiles) {
    ctx.fillStyle = RESOURCE_DOT_COLORS[r.type] || "#fff";
    ctx.beginPath();
    ctx.arc(r.x * TILE_PX + TILE_PX / 2, r.y * TILE_PX + TILE_PX / 2, TILE_PX * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }

  // bâtiments
  for (const b of G.buildings) {
    const player = G.players.find((p) => p.id === b.ownerId);
    const color = player ? player.color : "#999";
    const size = (b.footprint || 1) * TILE_PX + 6;
    const px = b.x * TILE_PX - size / 2 + TILE_PX / 2, py = b.y * TILE_PX - size / 2 + TILE_PX / 2;
    ctx.fillStyle = color;
    ctx.globalAlpha = b.underConstruction ? 0.5 : 1.0;
    ctx.fillRect(px, py, size, size);
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = G.selectedBuildingId === b.id ? "#fff34d" : "#111";
    ctx.lineWidth = G.selectedBuildingId === b.id ? 2.5 : 1;
    ctx.strokeRect(px, py, size, size);
    drawBar(px, py - 6, size, 4, b.hp / b.maxHp);
    if (b.trainQueue && b.trainQueue.length) {
      const prog = 1 - b.trainQueue[0].timeRemaining / b.trainQueue[0].totalTime;
      drawBar(px, py + size + 2, size, 3, prog, "#6ea8d9");
    }
  }

  // unités
  for (const u of G.units) {
    const player = G.players.find((p) => p.id === u.ownerId);
    const color = player ? player.color : "#999";
    const cx = u.x * TILE_PX + TILE_PX / 2, cy = u.y * TILE_PX + TILE_PX / 2;
    const r = u.category === "worker" ? 4.5 : 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = G.selectedIds.has(u.id) ? 2.5 : 1;
    ctx.strokeStyle = G.selectedIds.has(u.id) ? "#fff34d" : "#111";
    ctx.stroke();
    if (u.hp < u.maxHp) drawBar(cx - 8, cy - r - 7, 16, 3, u.hp / u.maxHp);
  }

  // rectangle de sélection
  if (G.mouse.downPixel && G.mouse.dragging) {
    const { x: x0, y: y0 } = G.mouse.downPixel;
    const x1 = G.mouse.x, y1 = G.mouse.y;
    ctx.strokeStyle = "rgba(255,243,77,0.9)";
    ctx.fillStyle = "rgba(255,243,77,0.15)";
    const rx = Math.min(x0, x1), ry = Math.min(y0, y1), rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
  }

  // fantôme de placement
  if (G.placingBuildingType) {
    const def = G.data.buildings[G.placingBuildingType];
    const tx = Math.round(G.mouse.x / TILE_PX), ty = Math.round(G.mouse.y / TILE_PX);
    const size = (def.footprint || 1) * TILE_PX + 6;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#fff34d";
    ctx.fillRect(tx * TILE_PX - size / 2 + TILE_PX / 2, ty * TILE_PX - size / 2 + TILE_PX / 2, size, size);
    ctx.globalAlpha = 1.0;
  }

  requestAnimationFrame(render);
}

function drawBar(x, y, w, h, pct, color) {
  pct = Math.max(0, Math.min(1, pct));
  ctx.fillStyle = "#222";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color || (pct > 0.5 ? "#6bbf59" : pct > 0.25 ? "#d9b13a" : "#c65b3a");
  ctx.fillRect(x, y, w * pct, h);
}

// ---------------- entrées souris/clavier ----------------
function getMouseTile(e) {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  return { x: px / TILE_PX, y: py / TILE_PX, px, py };
}

canvas.addEventListener("mousemove", (e) => {
  const { px, py } = getMouseTile(e);
  G.mouse.x = px; G.mouse.y = py;
  if (G.mouse.downPixel) {
    const d = Math.hypot(px - G.mouse.downPixel.x, py - G.mouse.downPixel.y);
    if (d > 4) G.mouse.dragging = true;
  }
});

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const { px, py } = getMouseTile(e);
  G.mouse.downPixel = { x: px, y: py };
  G.mouse.dragging = false;
});

canvas.addEventListener("mouseup", (e) => {
  if (e.button !== 0) return;
  const { x, y } = getMouseTile(e);

  if (G.placingBuildingType) {
    send({ type: "build", buildingType: G.placingBuildingType, x: Math.round(x), y: Math.round(y) });
    G.placingBuildingType = null;
    renderBuildMenu();
    G.mouse.downPixel = null; G.mouse.dragging = false;
    return;
  }

  if (G.mouse.dragging) {
    const x0 = G.mouse.downPixel.x / TILE_PX, y0 = G.mouse.downPixel.y / TILE_PX;
    const x1 = x, y1 = y;
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const matches = G.units.filter((u) => u.ownerId === G.myId && u.x >= minX && u.x <= maxX && u.y >= minY && u.y <= maxY);
    if (!e.shiftKey) G.selectedIds.clear();
    matches.forEach((u) => G.selectedIds.add(u.id));
    G.selectedBuildingId = null;
    updateSidePanel();
  } else {
    selectAtPoint(x, y, e.shiftKey);
  }
  G.mouse.downPixel = null; G.mouse.dragging = false;
});

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (G.placingBuildingType) { G.placingBuildingType = null; renderBuildMenu(); return; }
  const { x, y } = getMouseTile(e);
  handleRightClick(x, y);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && G.placingBuildingType) { G.placingBuildingType = null; renderBuildMenu(); }
});

function selectAtPoint(tileX, tileY, additive) {
  let best = null, bestD = 0.75;
  for (const u of G.units) {
    if (u.ownerId !== G.myId) continue;
    const d = Math.hypot(u.x - tileX, u.y - tileY);
    if (d < bestD) { bestD = d; best = u; }
  }
  if (best) {
    if (!additive) G.selectedIds.clear();
    G.selectedIds.add(best.id);
    G.selectedBuildingId = null;
    updateSidePanel();
    return;
  }
  let bestB = null, bestDB = 1.3;
  for (const b of G.buildings) {
    const d = Math.hypot(b.x - tileX, b.y - tileY);
    if (d < bestDB) { bestDB = d; bestB = b; }
  }
  if (bestB) {
    G.selectedIds.clear();
    G.selectedBuildingId = bestB.id;
    updateSidePanel();
    return;
  }
  if (!additive) { G.selectedIds.clear(); G.selectedBuildingId = null; updateSidePanel(); }
}

function handleRightClick(x, y) {
  const selUnits = [...G.selectedIds];
  if (selUnits.length === 0) return;

  let target = null, bestD = 0.9;
  for (const u of G.units) {
    if (u.ownerId === G.myId) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bestD) { bestD = d; target = u; }
  }
  if (!target) {
    let bestDB = 1.3;
    for (const b of G.buildings) {
      if (b.ownerId === G.myId) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bestDB) { bestDB = d; target = b; }
    }
  }
  if (target) { send({ type: "attack", unitIds: selUnits, targetId: target.id }); return; }

  let farm = null, bestDF = 1.3;
  for (const b of G.buildings) {
    if (b.ownerId === G.myId && b.type === "farm") {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bestDF) { bestDF = d; farm = b; }
    }
  }
  if (farm) { send({ type: "gatherFarm", unitIds: selUnits, buildingId: farm.id }); return; }

  const key = `${Math.round(x)},${Math.round(y)}`;
  const tile = G.resourceTiles.find((r) => `${r.x},${r.y}` === key);
  if (tile) { send({ type: "gather", unitIds: selUnits, x: tile.x, y: tile.y }); return; }

  send({ type: "move", unitIds: selUnits, x, y });
}

connect();

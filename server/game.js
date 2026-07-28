const { FACTIONS } = require("./factions");
const { UNITS, getDamageMultiplier } = require("./units");
const { BUILDINGS, FACTION_UNIQUE_TRAIN } = require("./buildings");
const { generateMap, isPassable, RESOURCE_DEFAULTS } = require("./mapGen");
const {
  TICK_MS, MAX_PLAYERS, STARTING_RESOURCES, CARRY_CAP, AGGRO_RADIUS, BUILD_RANGE,
} = require("./constants");

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

class GameRoom {
  constructor(roomId, broadcastFn) {
    this.roomId = roomId;
    this.broadcast = broadcastFn; // (message) => void, sent to all connected sockets in room
    this.players = new Map();     // playerId -> player object
    this.units = new Map();       // unitId -> unit object
    this.buildings = new Map();   // buildingId -> building object
    this.map = null;
    this.status = "lobby";        // 'lobby' | 'playing' | 'ended'
    this.tick = 0;
    this._nextId = 1;
    this._interval = null;
    this.winnerId = null;
  }

  genId(prefix) { return `${prefix}_${this._nextId++}`; }

  // ---------- lobby ----------
  addPlayer(playerId, ws, name) {
    if (this.players.size >= MAX_PLAYERS) return { error: "Salon complet (4 joueurs max)." };
    if (this.status !== "lobby") return { error: "La partie a déjà commencé." };
    this.players.set(playerId, {
      id: playerId, ws, name: name || `Joueur${this.players.size + 1}`,
      factionId: null, ready: false, color: "#999999",
      resources: { ...STARTING_RESOURCES }, popCap: 0, popUsed: 0, eliminated: false,
    });
    return { ok: true };
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    for (const [id, u] of this.units) if (u.ownerId === playerId) this.units.delete(id);
    for (const [id, b] of this.buildings) if (b.ownerId === playerId) this.buildings.delete(id);
    if (this.status === "playing") this._checkWinCondition();
  }

  setFaction(playerId, factionId) {
    const player = this.players.get(playerId);
    if (!player || !FACTIONS[factionId]) return;
    player.factionId = factionId;
    player.color = FACTIONS[factionId].color;
  }

  setReady(playerId, ready) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.ready = !!ready;
    this._maybeStart();
  }

  _maybeStart() {
    if (this.status !== "lobby") return;
    const players = [...this.players.values()];
    if (players.length < 1) return;
    const allReady = players.every((p) => p.ready && p.factionId);
    if (allReady) this.start();
  }

  // ---------- game start ----------
  start() {
    this.map = generateMap();
    const players = [...this.players.values()];
    players.forEach((player, idx) => {
      const start = this.map.startPositions[idx % this.map.startPositions.length];
      const faction = FACTIONS[player.factionId];
      const tcMax = Math.round(BUILDINGS.townCenter.hp * faction.modifiers.buildingHpMult);
      const tc = {
        id: this.genId("b"), ownerId: player.id, type: "townCenter",
        x: start.x, y: start.y, hp: tcMax, maxHp: tcMax,
        underConstruction: false, constructionRemaining: 0,
        trainQueue: [], footprint: BUILDINGS.townCenter.footprint,
      };
      this.buildings.set(tc.id, tc);
      player.popCap = BUILDINGS.townCenter.providesPop;
      for (let i = 0; i < 3; i++) {
        const u = this._spawnUnit(player, "villager", start.x + 1 + i * 0.6, start.y + 1.5);
      }
    });
    this.status = "playing";
    this._interval = setInterval(() => this._stepTick(), TICK_MS);
    this.broadcast({ type: "mapData", map: { width: this.map.width, height: this.map.height, terrain: this.map.terrain } });
    this.broadcast({ type: "gameStarted" });
  }

  _spawnUnit(player, unitType, x, y) {
    const def = UNITS[unitType];
    const faction = FACTIONS[player.factionId];
    let speedMult = faction.modifiers.unitSpeedMult || 1.0;
    if (def.category === "cavalry" && faction.modifiers.cavalrySpeedMult) speedMult *= faction.modifiers.cavalrySpeedMult;
    const hpMax = def.hp;
    const unit = {
      id: this.genId("u"), ownerId: player.id, type: unitType, category: def.category,
      x, y, hp: hpMax, maxHp: hpMax,
      attack: def.attack, range: def.range, speed: def.speed * speedMult,
      attackCooldownBase: def.attackCooldown, attackCooldown: 0,
      destination: null, job: null,
      carrying: { type: null, amount: 0 },
      gatherRate: def.gatherRate || 0,
      pop: def.pop,
    };
    this.units.set(unit.id, unit);
    player.popUsed += def.pop;
    return unit;
  }

  // ---------- commands (called from server.js on message receipt) ----------
  handleCommand(playerId, msg) {
    const player = this.players.get(playerId);
    if (!player || this.status !== "playing") return;
    switch (msg.type) {
      case "move": return this._cmdMove(player, msg);
      case "gather": return this._cmdGather(player, msg);
      case "gatherFarm": return this._cmdGatherFarm(player, msg);
      case "attack": return this._cmdAttack(player, msg);
      case "build": return this._cmdBuild(player, msg);
      case "train": return this._cmdTrain(player, msg);
      default: return;
    }
  }

  _ownedUnits(player, unitIds) {
    return (unitIds || []).map((id) => this.units.get(id)).filter((u) => u && u.ownerId === player.id);
  }

  _cmdMove(player, { unitIds, x, y }) {
    for (const u of this._ownedUnits(player, unitIds)) {
      u.job = null;
      u.destination = { x, y };
    }
  }

  _cmdGather(player, { unitIds, x, y }) {
    const key = `${Math.round(x)},${Math.round(y)}`;
    if (!this.map.resources.has(key)) return;
    for (const u of this._ownedUnits(player, unitIds)) {
      if (u.category !== "worker") continue;
      u.job = { type: "gatherTile", tileKey: key };
      const tile = this.map.resources.get(key);
      u.destination = { x: tile.x, y: tile.y };
    }
  }

  _cmdGatherFarm(player, { unitIds, buildingId }) {
    const farm = this.buildings.get(buildingId);
    if (!farm || farm.type !== "farm" || farm.ownerId !== player.id) return;
    for (const u of this._ownedUnits(player, unitIds)) {
      if (u.category !== "worker") continue;
      u.job = { type: "gatherFarm", buildingId };
      u.destination = { x: farm.x, y: farm.y };
    }
  }

  _cmdAttack(player, { unitIds, targetId }) {
    for (const u of this._ownedUnits(player, unitIds)) {
      if (u.category === "worker") continue;
      u.job = { type: "attack", targetId };
    }
  }

  _findDropoff(player, resourceType, from) {
    let best = null, bestDist = Infinity;
    for (const b of this.buildings.values()) {
      if (b.ownerId !== player.id || b.underConstruction) continue;
      const def = BUILDINGS[b.type];
      if (!def.dropOff || !def.dropOff.includes(resourceType)) continue;
      const d = dist(from, b);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  _cmdBuild(player, { buildingType, x, y }) {
    const def = BUILDINGS[buildingType];
    if (!def || def.startingBuilding) return;
    const faction = FACTIONS[player.factionId];
    const tx = Math.round(x), ty = Math.round(y);
    if (!isPassable(this.map.terrain, tx, ty)) return;
    if (this.map.resources.has(`${tx},${ty}`)) return;
    for (const b of this.buildings.values()) {
      if (Math.round(b.x) === tx && Math.round(b.y) === ty) return; // tuile occupée
    }
    // doit être dans le rayon de construction d'un bâtiment/unité possédé
    const near = [...this.buildings.values(), ...this.units.values()]
      .some((e) => e.ownerId === player.id && dist(e, { x: tx, y: ty }) <= BUILD_RANGE);
    if (!near) return;
    for (const res in def.cost || {}) {
      if ((player.resources[res] || 0) < def.cost[res]) return;
    }
    for (const res in def.cost || {}) player.resources[res] -= def.cost[res];
    const maxHp = Math.round(def.hp * faction.modifiers.buildingHpMult);
    const building = {
      id: this.genId("b"), ownerId: player.id, type: buildingType,
      x: tx, y: ty, hp: Math.round(maxHp * 0.1), maxHp,
      underConstruction: true, constructionRemaining: def.buildTime,
      totalBuildTime: def.buildTime, trainQueue: [], footprint: def.footprint,
      foodStock: def.producesFood ? def.foodCap : undefined,
    };
    this.buildings.set(building.id, building);
    if (def.providesPop) player.popCap += def.providesPop;
  }

  _trainableAt(buildingType, factionId) {
    const list = [...(BUILDINGS[buildingType].trains || [])];
    const unique = FACTION_UNIQUE_TRAIN[factionId];
    if (unique && unique.building === buildingType) list.push(unique.unit);
    return list;
  }

  _cmdTrain(player, { buildingId, unitType }) {
    const building = this.buildings.get(buildingId);
    if (!building || building.ownerId !== player.id || building.underConstruction) return;
    const allowed = this._trainableAt(building.type, player.factionId);
    if (!allowed.includes(unitType)) return;
    const def = UNITS[unitType];
    const faction = FACTIONS[player.factionId];
    let cost = { ...def.cost };
    if (def.category === "cavalry" && faction.modifiers.cavalryCostMult) {
      for (const k in cost) cost[k] = Math.round(cost[k] * faction.modifiers.cavalryCostMult);
    }
    if (player.popUsed + def.pop > player.popCap) return;
    for (const res in cost) if ((player.resources[res] || 0) < cost[res]) return;
    for (const res in cost) player.resources[res] -= cost[res];
    player.popUsed += def.pop;
    building.trainQueue.push({ unitType, timeRemaining: def.trainTime, totalTime: def.trainTime });
  }

  // ---------- simulation ----------
  _stepTick() {
    const dt = TICK_MS / 1000;
    this.tick++;

    for (const unit of this.units.values()) this._tickUnit(unit, dt);
    for (const building of this.buildings.values()) this._tickBuilding(building, dt);

    // purge des morts
    for (const [id, u] of this.units) {
      if (u.hp <= 0) {
        const p = this.players.get(u.ownerId);
        if (p) p.popUsed = Math.max(0, p.popUsed - u.pop);
        this.units.delete(id);
      }
    }
    for (const [id, b] of this.buildings) {
      if (b.hp <= 0) {
        this.buildings.delete(id);
      }
    }

    this._checkWinCondition();
    this._broadcastState();
  }

  _tickUnit(unit, dt) {
    if (unit.attackCooldown > 0) unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);

    // régénération Golem-Treant proche d'une forêt
    if (unit.type === "treant") {
      const nearForest = this._nearestResourceOfType(unit, "forest", 2.5);
      if (nearForest && unit.hp < unit.maxHp) unit.hp = Math.min(unit.maxHp, unit.hp + 2 * dt);
    }

    // auto-aggro pour les unités de combat sans ordre
    if (!unit.job && unit.category !== "worker") {
      const target = this._nearestEnemy(unit, AGGRO_RADIUS);
      if (target) unit.job = { type: "attack", targetId: target.id };
    }

    if (unit.job) this._processJob(unit, dt);
    else if (unit.destination) this._moveTowards(unit, dt);
  }

  _nearestResourceOfType(unit, type, radius) {
    for (const tile of this.map.resources.values()) {
      if (tile.type === type && dist(unit, tile) <= radius) return tile;
    }
    return null;
  }

  _nearestEnemy(unit, radius) {
    let best = null, bestDist = radius;
    for (const u of this.units.values()) {
      if (u.ownerId === unit.ownerId || u.category === "worker") continue;
      const d = dist(unit, u);
      if (d < bestDist) { bestDist = d; best = u; }
    }
    for (const b of this.buildings.values()) {
      if (b.ownerId === unit.ownerId) continue;
      const d = dist(unit, b);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  _moveTowards(unit, dt) {
    const target = unit.destination;
    const dx = target.x - unit.x, dy = target.y - unit.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.08) { unit.x = target.x; unit.y = target.y; unit.destination = null; return true; }
    const step = unit.speed * dt;
    let nx, ny;
    if (step >= d) { nx = target.x; ny = target.y; } else { nx = unit.x + (dx / d) * step; ny = unit.y + (dy / d) * step; }
    if (isPassable(this.map.terrain, nx, ny)) { unit.x = nx; unit.y = ny; }
    else { unit.destination = null; } // pas de contournement d'obstacle en MVP (limitation connue)
    return false;
  }

  _processJob(unit, dt) {
    const job = unit.job;
    const player = this.players.get(unit.ownerId);
    if (!player) return;

    if (job.type === "gatherTile") {
      const tile = this.map.resources.get(job.tileKey);
      if (!tile) { unit.job = null; return; }
      if (dist(unit, tile) > 0.9) { unit.destination = { x: tile.x, y: tile.y }; this._moveTowards(unit, dt); return; }
      unit.destination = null;
      const faction = FACTIONS[player.factionId];
      const mult = (faction.modifiers.gatherMult && faction.modifiers.gatherMult[tile.type === "goldDeposit" ? "gold" : tile.type === "stoneDeposit" ? "stone" : tile.type === "berry" ? "food" : "wood"]) || 1.0;
      const amount = Math.min(dt * UNITS.villager.gatherRate * mult, tile.amount, CARRY_CAP - unit.carrying.amount);
      tile.amount -= amount;
      unit.carrying.amount += amount;
      unit.carrying.type = tile.type === "goldDeposit" ? "gold" : tile.type === "stoneDeposit" ? "stone" : tile.type === "berry" ? "food" : "wood";
      if (tile.amount <= 0.01) {
        this.map.resources.delete(job.tileKey);
        const [tx, ty] = job.tileKey.split(",").map(Number);
        this.map.terrain[ty][tx] = "grass";
      }
      if (unit.carrying.amount >= CARRY_CAP || tile.amount <= 0.01) {
        const dropoff = this._findDropoff(player, unit.carrying.type, unit);
        if (dropoff) {
          unit.job = { type: "deposit", buildingId: dropoff.id, resumeTileKey: this.map.resources.has(job.tileKey) ? job.tileKey : null };
          unit.destination = { x: dropoff.x, y: dropoff.y };
        }
      }
      return;
    }

    if (job.type === "deposit") {
      const building = this.buildings.get(job.buildingId);
      if (!building) { unit.job = null; return; }
      if (dist(unit, building) > 1.3) { unit.destination = { x: building.x, y: building.y }; this._moveTowards(unit, dt); return; }
      unit.destination = null;
      player.resources[unit.carrying.type] = (player.resources[unit.carrying.type] || 0) + unit.carrying.amount;
      unit.carrying.amount = 0; unit.carrying.type = null;
      if (job.resumeTileKey && this.map.resources.has(job.resumeTileKey)) {
        const tile = this.map.resources.get(job.resumeTileKey);
        unit.job = { type: "gatherTile", tileKey: job.resumeTileKey };
        unit.destination = { x: tile.x, y: tile.y };
      } else {
        unit.job = null;
      }
      return;
    }

    if (job.type === "gatherFarm") {
      const farm = this.buildings.get(job.buildingId);
      if (!farm || farm.hp <= 0) { unit.job = null; return; }
      if (dist(unit, farm) > 1.3) { unit.destination = { x: farm.x, y: farm.y }; this._moveTowards(unit, dt); return; }
      unit.destination = null;
      if (farm.foodStock > 0) {
        const amount = Math.min(dt * UNITS.villager.gatherRate, farm.foodStock);
        farm.foodStock -= amount;
        player.resources.food += amount;
      }
      return;
    }

    if (job.type === "attack") {
      const target = this.units.get(job.targetId) || this.buildings.get(job.targetId);
      if (!target || target.hp <= 0) { unit.job = null; return; }
      const d = dist(unit, target);
      if (d > unit.range + 0.25) {
        unit.destination = { x: target.x, y: target.y };
        this._moveTowards(unit, dt);
        return;
      }
      unit.destination = null;
      if (unit.attackCooldown <= 0) {
        const defCategory = target.category || "building";
        let mult = target.category ? getDamageMultiplier(unit.category, target.category) : 1.0;
        let dmg = unit.attack * mult;
        if (target.armorBonus) dmg *= (1 - target.armorBonus);
        // le bonus d'armure de Garde de Fer est une propriété d'unité, pas de définition -> lu depuis UNITS
        const targetDef = UNITS[target.type];
        if (targetDef && targetDef.armorBonus) dmg *= (1 - targetDef.armorBonus);
        target.hp -= Math.max(1, dmg);
        unit.attackCooldown = unit.attackCooldownBase;
      }
      return;
    }
  }

  _tickBuilding(building, dt) {
    if (building.underConstruction) {
      building.constructionRemaining -= dt;
      const progress = 1 - Math.max(0, building.constructionRemaining) / building.totalBuildTime;
      building.hp = Math.max(1, Math.round(building.maxHp * Math.max(0.1, progress)));
      if (building.constructionRemaining <= 0) {
        building.underConstruction = false;
        building.hp = building.maxHp;
      }
      return;
    }
    if (building.trainQueue && building.trainQueue.length > 0) {
      const job = building.trainQueue[0];
      job.timeRemaining -= dt;
      if (job.timeRemaining <= 0) {
        const player = this.players.get(building.ownerId);
        if (player) {
          const angle = Math.random() * Math.PI * 2;
          this._spawnUnit(player, job.unitType, building.x + Math.cos(angle) * 1.4, building.y + Math.sin(angle) * 1.4);
        }
        building.trainQueue.shift();
      }
    }
  }

  _checkWinCondition() {
    if (this.status !== "playing") return;
    const alive = [];
    for (const player of this.players.values()) {
      const hasTownCenter = [...this.buildings.values()].some((b) => b.ownerId === player.id && b.type === "townCenter");
      player.eliminated = !hasTownCenter;
      if (!player.eliminated) alive.push(player);
    }
    if (this.players.size > 1 && alive.length === 1) {
      this.status = "ended";
      this.winnerId = alive[0].id;
      clearInterval(this._interval);
      this.broadcast({ type: "gameOver", winnerId: alive[0].id, winnerName: alive[0].name });
    } else if (this.players.size > 1 && alive.length === 0) {
      this.status = "ended";
      clearInterval(this._interval);
      this.broadcast({ type: "gameOver", winnerId: null, winnerName: null });
    }
  }

  // ---------- state broadcast ----------
  _broadcastState() {
    const players = [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, factionId: p.factionId, color: p.color,
      resources: p.resources, popCap: p.popCap, popUsed: p.popUsed, eliminated: p.eliminated,
    }));
    const units = [...this.units.values()].map((u) => ({
      id: u.id, ownerId: u.ownerId, type: u.type, category: u.category,
      x: Math.round(u.x * 100) / 100, y: Math.round(u.y * 100) / 100,
      hp: Math.round(u.hp), maxHp: u.maxHp, carrying: u.carrying,
    }));
    const buildings = [...this.buildings.values()].map((b) => ({
      id: b.id, ownerId: b.ownerId, type: b.type, x: b.x, y: b.y,
      hp: b.hp, maxHp: b.maxHp, underConstruction: b.underConstruction,
      trainQueue: b.trainQueue.map((j) => ({ unitType: j.unitType, timeRemaining: Math.round(j.timeRemaining * 10) / 10, totalTime: j.totalTime })),
      foodStock: b.foodStock,
    }));
    const resourceTiles = [...this.map.resources.values()].map((r) => ({ x: r.x, y: r.y, type: r.type, amount: Math.round(r.amount) }));
    this.broadcast({ type: "state", tick: this.tick, players, units, buildings, resourceTiles });
  }

  lobbyState() {
    return {
      type: "lobby",
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, factionId: p.factionId, ready: p.ready })),
      factions: Object.values(FACTIONS).map((f) => ({ id: f.id, name: f.name, color: f.color, description: f.description })),
    };
  }
}

module.exports = { GameRoom };

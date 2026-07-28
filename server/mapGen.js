// Génération de la carte "Plaines Verdoyantes" (carte n°1 du GDD) :
// terrain majoritairement plat, peu de goulots d'étranglement, ressources
// réparties équitablement autour de chaque point de départ + zones neutres.
const { MAP_WIDTH, MAP_HEIGHT } = require("./constants");

const RESOURCE_DEFAULTS = {
  forest: 300,      // bois par tuile
  berry: 250,       // nourriture par tuile
  goldDeposit: 400, // or par tuile
  stoneDeposit: 400,// pierre par tuile
};

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
}

function stampBlob(terrain, resources, cx, cy, radius, count, type) {
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 20) {
    attempts++;
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    const x = Math.round(cx + Math.cos(ang) * dist);
    const y = Math.round(cy + Math.sin(ang) * dist);
    if (!inBounds(x, y)) continue;
    if (terrain[y][x] !== "grass") continue;
    terrain[y][x] = type;
    if (RESOURCE_DEFAULTS[type] != null) {
      resources.set(`${x},${y}`, { type, x, y, amount: RESOURCE_DEFAULTS[type], max: RESOURCE_DEFAULTS[type] });
    }
    placed++;
  }
}

function generateMap() {
  const terrain = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    terrain.push(new Array(MAP_WIDTH).fill("grass"));
  }
  const resources = new Map();

  // 4 emplacements de départ symétriques (utilisés selon le nombre de joueurs)
  const startPositions = [
    { x: 8, y: 7 },
    { x: MAP_WIDTH - 9, y: MAP_HEIGHT - 8 },
    { x: MAP_WIDTH - 9, y: 7 },
    { x: 8, y: MAP_HEIGHT - 8 },
  ];

  // Ressources garanties près de chaque point de départ (équité entre joueurs)
  for (const pos of startPositions) {
    stampBlob(terrain, resources, pos.x + 3, pos.y - 2, 3, 7, "forest");
    stampBlob(terrain, resources, pos.x - 3, pos.y + 3, 2.5, 4, "berry");
    stampBlob(terrain, resources, pos.x + 5, pos.y + 4, 2, 3, "goldDeposit");
    stampBlob(terrain, resources, pos.x - 4, pos.y - 3, 2, 3, "stoneDeposit");
  }

  // Quelques massifs montagneux décoratifs / obstacles au centre de la carte
  const mountainClusters = [
    { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
    { x: MAP_WIDTH / 2 - 10, y: MAP_HEIGHT / 2 + 6 },
    { x: MAP_WIDTH / 2 + 10, y: MAP_HEIGHT / 2 - 6 },
  ];
  for (const c of mountainClusters) {
    let placed = 0, attempts = 0;
    while (placed < 10 && attempts < 200) {
      attempts++;
      const x = Math.round(c.x + (Math.random() - 0.5) * 6);
      const y = Math.round(c.y + (Math.random() - 0.5) * 6);
      if (!inBounds(x, y) || terrain[y][x] !== "grass") continue;
      terrain[y][x] = "mountain";
      placed++;
    }
  }

  // Forêts et bosquets neutres dispersés sur le reste de la carte (contestables)
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * MAP_WIDTH;
    const y = Math.random() * MAP_HEIGHT;
    stampBlob(terrain, resources, x, y, 3, 5, "forest");
  }
  for (let i = 0; i < 4; i++) {
    const x = Math.random() * MAP_WIDTH;
    const y = Math.random() * MAP_HEIGHT;
    stampBlob(terrain, resources, x, y, 2, 3, "goldDeposit");
  }

  return { width: MAP_WIDTH, height: MAP_HEIGHT, terrain, resources, startPositions };
}

function isPassable(terrain, x, y) {
  if (!inBounds(Math.round(x), Math.round(y))) return false;
  const t = terrain[Math.round(y)][Math.round(x)];
  return t !== "mountain" && t !== "water";
}

module.exports = { generateMap, isPassable, inBounds, RESOURCE_DEFAULTS };

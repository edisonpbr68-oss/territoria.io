// Roster d'unités du MVP : le socle commun (section 5.1 du GDD) + les 3
// unités uniques des factions du MVP. Système de contres simplifié
// (section 5.2 du GDD) : infanterie > cavalerie > archer > infanterie.

const UNITS = {
  villager: {
    id: "villager", name: "Villageois", category: "worker",
    hp: 40, attack: 2, range: 0.6, speed: 1.1, attackCooldown: 1.2,
    cost: { food: 50 }, trainTime: 18, trainedAt: "townCenter", pop: 1,
    gatherRate: 6, // ressource / seconde
  },
  spearman: {
    id: "spearman", name: "Lancier", category: "infantry",
    hp: 60, attack: 7, range: 0.6, speed: 0.95, attackCooldown: 1.0,
    cost: { food: 40, wood: 20 }, trainTime: 14, trainedAt: "barracks", pop: 1,
  },
  archer: {
    id: "archer", name: "Archer", category: "archer",
    hp: 32, attack: 6, range: 4, speed: 1.0, attackCooldown: 1.3,
    cost: { wood: 30, gold: 20 }, trainTime: 16, trainedAt: "archeryRange", pop: 1,
  },
  scout: {
    id: "scout", name: "Éclaireur", category: "cavalry",
    hp: 50, attack: 5, range: 0.6, speed: 1.6, attackCooldown: 1.0,
    cost: { food: 60, gold: 20 }, trainTime: 16, trainedAt: "stable", pop: 1,
  },
  // --- unités uniques de faction ---
  treant: {
    id: "treant", name: "Golem-Treant", category: "infantry",
    hp: 150, attack: 10, range: 0.7, speed: 0.6, attackCooldown: 1.4,
    cost: { wood: 100, food: 60 }, trainTime: 28, trainedAt: "barracks", pop: 2,
    faction: "sylvains", regenNearForest: 2, // PV/s régénérés si proche d'une forêt
  },
  horseArcher: {
    id: "horseArcher", name: "Archer à Cheval", category: "cavalry",
    hp: 45, attack: 6, range: 3, speed: 1.5, attackCooldown: 1.2,
    cost: { food: 70, gold: 40 }, trainTime: 22, trainedAt: "stable", pop: 1,
    faction: "steppes", rangedCavalry: true,
  },
  ironGuard: {
    id: "ironGuard", name: "Garde de Fer", category: "infantry",
    hp: 110, attack: 8, range: 0.6, speed: 0.75, attackCooldown: 1.1,
    cost: { food: 60, stone: 40 }, trainTime: 24, trainedAt: "barracks", pop: 2,
    faction: "montagnes", armorBonus: 0.15, // réduction de dégâts subis
  },
};

// Cycle de contres : la clé bat les valeurs de son tableau (x1.5 dégâts).
// Le porteur subit x0.75 en retour (contre-attaqué).
const COUNTERS = {
  infantry: ["cavalry"],
  cavalry: ["archer"],
  archer: ["infantry"],
};

function getDamageMultiplier(attackerCategory, defenderCategory) {
  if (attackerCategory === "worker" || defenderCategory === "worker") return 1.0;
  const beats = COUNTERS[attackerCategory];
  if (beats && beats.includes(defenderCategory)) return 1.5;
  const beatenBy = COUNTERS[defenderCategory];
  if (beatenBy && beatenBy.includes(attackerCategory)) return 0.75;
  return 1.0;
}

module.exports = { UNITS, getDamageMultiplier };

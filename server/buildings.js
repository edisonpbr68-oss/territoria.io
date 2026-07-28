// Bâtiments du MVP (sous-ensemble de la section 4 du GDD, suffisant pour
// une économie + une armée complètes).
const BUILDINGS = {
  townCenter: {
    id: "townCenter", name: "Hôtel de Ville", hp: 600, footprint: 2,
    providesPop: 5, dropOff: ["wood", "food", "gold", "stone"],
    trains: ["villager"], buildTime: 0, startingBuilding: true,
  },
  house: {
    id: "house", name: "Maison", hp: 150, footprint: 1,
    providesPop: 5, cost: { wood: 30 }, buildTime: 15,
  },
  lumberCamp: {
    id: "lumberCamp", name: "Camp de Bûcherons", hp: 120, footprint: 1,
    dropOff: ["wood"], cost: { wood: 50 }, buildTime: 20,
  },
  miningCamp: {
    id: "miningCamp", name: "Camp Minier", hp: 120, footprint: 1,
    dropOff: ["gold", "stone"], cost: { wood: 50 }, buildTime: 20,
  },
  farm: {
    id: "farm", name: "Ferme", hp: 120, footprint: 1,
    dropOff: ["food"], producesFood: true, foodCap: 300, foodRegenRate: 2.5,
    cost: { wood: 60 }, buildTime: 20,
  },
  barracks: {
    id: "barracks", name: "Caserne", hp: 200, footprint: 2,
    trains: ["spearman"], cost: { wood: 120 }, buildTime: 35,
  },
  archeryRange: {
    id: "archeryRange", name: "Champ de Tir", hp: 180, footprint: 2,
    trains: ["archer"], cost: { wood: 120, gold: 30 }, buildTime: 35,
  },
  stable: {
    id: "stable", name: "Écurie", hp: 180, footprint: 2,
    trains: ["scout"], cost: { wood: 140, gold: 30 }, buildTime: 35,
  },
};

// Bâtiment unique ajouté au roster "trains" selon la faction du joueur.
const FACTION_UNIQUE_TRAIN = {
  sylvains: { building: "barracks", unit: "treant" },
  steppes: { building: "stable", unit: "horseArcher" },
  montagnes: { building: "barracks", unit: "ironGuard" },
};

module.exports = { BUILDINGS, FACTION_UNIQUE_TRAIN };

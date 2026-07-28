// Les 3 factions du MVP (Phase 1 de la roadmap). Les 7 autres factions
// suivront en Phase 2/3 en réutilisant exactement cette même structure.
const FACTIONS = {
  sylvains: {
    id: "sylvains",
    name: "Les Sylvains",
    color: "#2f7d4f",
    description: "Économie & guérilla — bonus de bois, unité Golem-Treant.",
    modifiers: {
      gatherMult: { wood: 1.3 },
      buildingHpMult: 1.0,
      unitSpeedMult: 1.0,
    },
    uniqueUnit: "treant",
  },
  steppes: {
    id: "steppes",
    name: "Les Cavaliers des Steppes",
    color: "#c47f2c",
    description: "Raid & harcèlement — cavalerie rapide, bâtiments fragiles.",
    modifiers: {
      gatherMult: {},
      buildingHpMult: 0.75,
      unitSpeedMult: 1.0,
      cavalrySpeedMult: 1.2,
      cavalryCostMult: 0.85,
    },
    uniqueUnit: "horseArcher",
  },
  montagnes: {
    id: "montagnes",
    name: "Les Clans des Montagnes",
    color: "#6b6f76",
    description: "Défense & attrition — bâtiments renforcés, unités lentes.",
    modifiers: {
      gatherMult: { stone: 1.2 },
      buildingHpMult: 1.5,
      unitSpeedMult: 0.85,
    },
    uniqueUnit: "ironGuard",
  },
};

module.exports = { FACTIONS };

// Constantes globales de la simulation
module.exports = {
  MAP_WIDTH: 60,       // en tuiles
  MAP_HEIGHT: 40,      // en tuiles
  TILE_SIZE: 20,        // pixels par tuile côté client (référence)
  TICK_RATE: 10,         // ticks par seconde
  TICK_MS: 100,
  MAX_PLAYERS: 4,
  STARTING_RESOURCES: { wood: 200, food: 200, gold: 100, stone: 100 },
  STARTING_POP_CAP: 10,
  CARRY_CAP: 10,          // ressource max transportée par un villageois
  AGGRO_RADIUS: 3.5,      // tuiles : rayon d'auto-engagement des unités inactives
  BUILD_RANGE: 14,        // distance max de construction depuis un bâtiment possédé
};

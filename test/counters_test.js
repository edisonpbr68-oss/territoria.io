// Vérifie la matrice de contres (section 5.2 du GDD) directement sur la
// fonction utilisée par le serveur en combat.
const { getDamageMultiplier } = require("../server/units");

const cases = [
  ["infantry", "cavalry", 1.5],
  ["cavalry", "archer", 1.5],
  ["archer", "infantry", 1.5],
  ["cavalry", "infantry", 0.75],
  ["archer", "cavalry", 0.75],
  ["infantry", "archer", 0.75],
  ["infantry", "infantry", 1.0],
  ["worker", "infantry", 1.0],
  ["infantry", "worker", 1.0],
];

let failures = 0;
for (const [atk, def, expected] of cases) {
  const result = getDamageMultiplier(atk, def);
  const ok = Math.abs(result - expected) < 1e-9;
  console.log(`${ok ? "PASS" : "FAIL"}  ${atk} vs ${def} => ${result} (attendu ${expected})`);
  if (!ok) failures++;
}

if (failures > 0) {
  console.error(`\n${failures} test(s) de contres ECHOUE(S).`);
  process.exit(1);
} else {
  console.log("\nTous les tests de contres sont PASS.");
}

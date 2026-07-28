# Territoria — Prototype MVP (Phase 1)

Premier prototype jouable du jeu décrit dans le document de conception
(`Territoria_GDD.docx`). Ce prototype couvre la **Phase 1** de la feuille de
route : 1 carte (Plaines Verdoyantes), 3 factions, économie + bâtiments +
unités de base, combat en temps réel, multijoueur via WebSockets, condition
de victoire Domination.

Stack : Node.js (serveur autoritaire, aucune dépendance hors `ws`) + HTML5
Canvas côté client (aucun framework, JS vanilla).

## Installation

Prérequis : [Node.js](https://nodejs.org/) 18 ou plus récent.

```bash
cd territoria-mvp
npm install
npm start
```

Le serveur démarre sur `http://localhost:3000`. Ouvrez cette adresse dans
plusieurs onglets/navigateurs/ordinateurs du même réseau pour tester le
multijoueur (2 à 4 joueurs).

Pour changer de port : `PORT=8080 npm start`.

## Jouer

1. Entrez un nom, choisissez une des 3 factions, cliquez sur **Rejoindre &
   se déclarer prêt**.
2. La partie démarre automatiquement dès que tous les joueurs connectés ont
   choisi une faction et sont prêts.
3. Contrôles :
   - **Clic gauche** : sélectionner une unité/un bâtiment (clic-glissé pour
     une sélection multiple).
   - **Clic droit** sur le sol : déplacer les unités sélectionnées.
   - **Clic droit** sur une ressource (forêt/baies/or/pierre) : envoyer les
     villageois sélectionnés la récolter.
   - **Clic droit** sur une unité/bâtiment ennemi : attaquer.
   - Panneau de droite : boutons **Construire** (cliquez, puis cliquez sur
     la carte pour poser le bâtiment) et **Entraîner** (apparaît quand un
     bâtiment de production est sélectionné).
4. Victoire par Domination : le dernier joueur avec un Hôtel de Ville debout
   gagne.

## Tests automatisés

```bash
node test/counters_test.js   # vérifie la matrice de contres d'unités
node test/bot_test.js        # lance le serveur + 2 bots WebSocket, rejoue
                              # tout le cycle lobby / récolte / construction
                              # / entraînement / combat
```

## Contenu du prototype vs. document de conception complet

Cette première version simplifie volontairement certains points pour aller
vite ; ils sont prévus dans les phases 2-4 de la feuille de route :

- **3 factions sur 10** : Sylvains, Cavaliers des Steppes, Clans des
  Montagnes (une de chaque style : économie, agressif, défensif — les 7
  autres suivent le même modèle de données dans `server/factions.js`).
- **1 carte sur 15** : Plaines Verdoyantes (`server/mapGen.js`).
- **Pas de pouvoirs spéciaux de faction actifs** (les modificateurs passifs
  — bonus de récolte, PV de bâtiments, vitesse — sont eux bien implémentés).
- **Pas de mécanique navale** (docks/navires) — réservée aux cartes
  côtières des phases suivantes.
- **Une seule condition de victoire** (Domination) ; Merveille et Contrôle
  du territoire viendront en phase 2/3.
- **Déplacement en ligne droite, sans contournement d'obstacles** : une
  unité qui rencontre un obstacle (montagne) s'arrête au lieu de le
  contourner. Un vrai pathfinding (A*) est la prochaine amélioration
  technique naturelle.
- **Pas de caméra/zoom** : la carte entière (60×40 tuiles) est visible d'un
  coup pour simplifier le rendu ; un système de caméra viendra si les
  cartes suivantes sont plus grandes.
- **Art minimal** : formes géométriques colorées par faction, conforme à
  l'esprit "graphismes simples mais efficaces" du document de conception —
  une vraie passe d'art est prévue en phase 4.

## Structure du code

```
territoria-mvp/
  server/
    constants.js   valeurs globales (taille de carte, tick rate, etc.)
    factions.js     les 3 factions du MVP + leurs modificateurs
    units.js        roster d'unités + système de contres
    buildings.js     bâtiments + table d'entraînement par faction
    mapGen.js       génération de la carte Plaines Verdoyantes
    game.js         GameRoom : simulation (mouvement, récolte, combat,
                    construction, production), logique de victoire
    server.js       serveur HTTP (statique, fait main) + WebSocket + salons
  client/
    index.html, style.css, client.js   rendu canvas + UI + entrées, sans
                                        framework
  test/
    counters_test.js   vérifie la matrice de contres
    bot_test.js         test d'intégration avec 2 bots WebSocket
```

Toutes les données de jeu (factions, unités, bâtiments) vivent **uniquement
côté serveur** et sont envoyées au client au moment de la connexion
(message `welcome`) : c'est la source de vérité unique, cohérente avec la
section 8 du GDD ("les valeurs numériques devront être affinées via des
playtests" — il suffit d'éditer ces 3 fichiers, aucune duplication côté
client à maintenir).

## Prochaines étapes suggérées

1. Jouer quelques parties à 2-4 pour sentir l'équilibrage réel (les
   chiffres du GDD sont un point de départ, pas une vérité gravée).
2. Ajouter les pouvoirs spéciaux de faction (ils sont déjà décrits dans le
   GDD section 9, il ne reste qu'à les câbler dans `game.js`).
3. Ajouter un pathfinding simple (grille + A*) pour un contournement
   correct des montagnes.
4. Étendre à 7 puis 10 factions et aux 15 cartes en suivant exactement les
   mêmes patterns (`factions.js`, `mapGen.js`).
5. Héberger le serveur (Render, Railway, Fly.io ou un VPS) pour y jouer en
   ligne avec votre frère sans être sur le même réseau — je peux vous guider
   pas à pas le moment venu.

## Note technique (pour information)

Le prototype n'utilise pas `express` : un souci de compatibilité a été
identifié avec ce paquet dans l'environnement de build utilisé pour créer
ce prototype (le serveur HTTP restait silencieusement bloqué). Le serveur
statique a donc été réécrit avec le seul module natif `http`, ce qui
fonctionne parfaitement et réduit même les dépendances du projet à une
seule (`ws`). Si ce souci ne se reproduit pas sur votre machine, libre à
vous de réintroduire express plus tard sans risque.

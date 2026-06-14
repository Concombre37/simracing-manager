# Agent local SimCenter

Cet agent s'installe sur chaque PC de simulation. Il communique avec le serveur central via WebSocket et pilote Content Manager / Assetto Corsa.

## Installation

1. Installer Node.js 20+ sur le PC de simulation
2. Copier le dossier `agent/` sur le PC
3. Créer le fichier `.env` à partir de `.env.example`
4. Adapter les chemins AC et CM
5. Lancer : `npm install` puis `npm start`

## Fonctionnalités

- Reçoit les commandes `session:launch` et `session:stop` du serveur
- Génère un preset Content Manager
- Lance CM / Assetto Corsa avec la bonne voiture, circuit et météo
- Surveille l'état du jeu
- Récupère les résultats (temps au tour) depuis `Documents\Assetto Corsa\out`
- Écrit l'état de session pour l'overlay CSP Lua

## Overlay CSP

Copier le dossier `csp-app/SimCenter/apps/lua/simcenter_overlay` dans :
`Documents\Assetto Corsa\apps\lua\`

L'overlay affichera le nom du pilote et le temps restant en jeu.

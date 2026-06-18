# Changelog

## v2.2.3 — Wake-on-LAN et arrêt distant des PODs

### Ajouté

- **Page Paramètres** (`/settings`) affichant pour chaque POD :
  - IP locale ;
  - adresse MAC ;
  - statut de connexion ;
  - boutons **Allumer** et **Éteindre**.
- **Wake-on-LAN** via relais POD : un POD déjà allumé sur le même sous-réseau envoie le magic packet vers la MAC cible.
- **Arrêt distant** : commande `system:shutdown` envoyée à l’agent, qui exécute `shutdown /s /t 0` sur Windows.
- Collecte automatique de l’adresse MAC par l’agent et envoi dans chaque heartbeat.
- Endpoints REST protégés : `POST /api/stations/:id/wake` et `POST /api/stations/:id/shutdown`.

### Technique

- Nouveau champ `mac_address` sur le modèle Prisma `Station` + migration.
- Extension des contrats `@simracing/shared` : `HeartbeatPayload.macAddress`, `ServerToAgentEvents` (`system:shutdown`, `wol:send`).
- Nouveau module backend `power-management` (service + controller).
- Nouveau module agent `wol.ts` utilisant `wake_on_lan` pour envoyer les magic packets.
- Dépendance agent ajoutée : `wake_on_lan`.

## v2.2.2 — Fix affichage images/vidéos sur l’écran d’attente

### Corrigé

- La playlist d’images/vidéos est maintenant écrite dans un fichier JSON temporaire et passée au script PowerShell par chemin, évitant les problèmes d’échappement des arguments CLI.
- L’écran d’attente affiche correctement les images/vidéos uploadées depuis le site.

## v2.2.1 — Hotfix backend Docker

### Corrigé

- Import `path` corrigé dans `blanking-media.service.ts` (`import * as path`) pour éviter l’erreur `Cannot read properties of undefined (reading 'join')` au démarrage du conteneur.

## v2.2.0 — Blanking screen personnalisable (images & vidéos)

### Ajouté

- **Playlist image/vidéo** pour l'écran d'attente, configurable par station depuis le site.
- Upload via le bouton **Écran d'attente** sur la page Postes : drag & drop, réorganisation, suppression, preview.
- Formats supportés : PNG, JPG, WEBP, MP4, WEBM (max 100 Mo).
- Lecture des vidéos **sans son**, en boucle, avec cross-fade entre les slides.
- Désactivation du blanking dès qu'Assetto Corsa a fini de charger (détection par mémoire partagée `Local\acpmf_*`).
- Synchronisation automatique POD ↔ serveur via l'événement `blanking:mediaUpdated`.

### Technique

- Nouveau modèle Prisma `BlankingMedia` + migration.
- Nouveau module backend `blanking-media` avec endpoints CRUD et téléchargement public.
- Nouveaux contrats Socket.IO : `blanking:mediaUpdated`.
- Nouveaux modules agent : `AcSharedMemoryChecker`, `BlankingMediaSync`.
- Script PowerShell `blanking.ps1` enrichi pour le diaporama.

## v2.1.0 — Mode kiosque / Blanking screen automatisé

### Ajouté

- **Blanking screen** affiché par défaut au démarrage de l'agent, dans les menus et pendant les chargements.
- Retrait automatique du blanking uniquement quand toutes les conditions sont réunies :
  - `acs.exe` est détecté en cours d'exécution ;
  - une session est active (`isSessionStarted`, pas dans le menu principal) ;
  - la télémétrie indique une conduite réelle (vitesse, RPM, rapport, gaz ou frein).
- Fallback conservateur : en cas de doute, le blanking est affiché.
- Commandes manuelles depuis l'interface web :
  - `Masquer écran` (`blanking:hide`) ;
  - `Afficher écran` (`blanking:show`).
- Télémétrie POD temps réel avec fallback fichier `telemetry.json`.
- Fichiers de diagnostic Lua (`lua_loaded.txt`, `lua_update.txt`, `lua_error.txt`).

### Technique

- Nouveaux contrats Socket.IO : `blanking:hide`, `blanking:show`.
- Nouveau `BlankingManager` côté agent utilisant un script PowerShell/WPF pour afficher la fenêtre noire.
- `TelemetrySnapshot` enrichi de `isInMainMenu`, `isSessionStarted`, `isOnlineRace`.
- Tests unitaires `blankingManager.spec.ts` couvrant les scénarios principaux.

## v2.0.26 — Correction écriture telemetry.json

### Corrigé

- L'écriture atomique du fichier `telemetry.json` pouvait échouer sur Windows ; ajout d'un fallback d'écriture directe.

## v2.0.25 — Diagnostics télémétrie

### Ajouté

- Fichiers de diagnostic Lua pour tracer le chargement de l'app et l'état du stream.

## v2.0.24 — Dashboard POD temps réel

### Ajouté

- Page `/telemetry` affichant vitesse, RPM, meilleur tour, position, progression piste.
- Stream UDP local depuis l'app CSP Lua vers l'agent.
- Fallback HTTP et fichier pour la télémétrie.
